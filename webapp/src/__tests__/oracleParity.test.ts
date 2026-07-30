// Upload-time V2 parity check (POST /api/parity-check plumbing).
//
// Unit-tests the shared oracle↔V3 row mapping (lib/oracleParityRows) with a
// stubbed stats object, then — when the v2calc oracle binary and the real
// data catalogues are present — runs the full runParityCheck() path on the
// YingsMonk fixture exactly as the server endpoint does for an upload.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  buildParityRows, diffParityRows, type OracleJson,
} from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

function makeStats(map: Record<string, number>): BuildStats {
  return {
    resolve: (k: string) => ({ total: map[k] ?? 0, bonuses: [] }),
    total: (k: string) => map[k] ?? 0,
    keys: () => Object.keys(map),
    weapon: null,
    armorMaxDex: null,
  } as unknown as BuildStats
}

function makeBuild(overrides: Partial<CharacterBuild> = {}): CharacterBuild {
  return {
    totalLevel: 20, epicLevels: 10, legendaryLevels: 6,
    classes: [
      { name: 'Wizard', levels: 20 },
      { name: '', levels: 0 },
      { name: '', levels: 0 },
    ],
    featChoices: {},
    enhancementChoices: {}, enhancementSelections: {},
    gear: {},
    ...overrides,
  } as unknown as CharacterBuild
}

describe('buildParityRows — oracle↔V3 composition', () => {
  it('maps scalar breakdowns and abilities directly', () => {
    const oracle: OracleJson = {
      abilityTotal: { STR: 20 },
      breakdowns: { hitpoints: 1000, prr: 50 },
    }
    const rows = buildParityRows(
      oracle, makeStats({ 'ability.Strength': 20, hp: 1000, prr: 50 }),
      makeBuild(), {},
    )
    const byStat = Object.fromEntries(rows.map(r => [r.stat, r]))
    expect(byStat['ability.STR']).toMatchObject({ v2: 20, v3: 20 })
    expect(byStat['hitpoints']).toMatchObject({ v2: 1000, v3: 1000 })
    expect(byStat['prr']).toMatchObject({ v2: 50, v3: 50 })
  })

  it('composes sub-saves as base save + sub bonus', () => {
    const oracle: OracleJson = { breakdowns: { savePoison: 70 } }
    const rows = buildParityRows(
      oracle, makeStats({ 'save.Fort': 57, 'save.sub.Poison': 13 }),
      makeBuild(), {},
    )
    expect(rows.find(r => r.stat === 'savePoison')).toMatchObject({ v2: 70, v3: 70 })
  })

  it('per-type spell power includes the universal feed', () => {
    const oracle: OracleJson = { spellPower: { Fire: 189 } }
    const rows = buildParityRows(
      oracle, makeStats({ 'sp.Universal': 143, 'sp.Fire': 46 }),
      makeBuild(), {},
    )
    expect(rows.find(r => r.stat === 'sp.Fire')).toMatchObject({ v2: 189, v3: 189 })
  })

  it('derives destiny APs from character level with the L36 cap pin', () => {
    // Level 36: 40 epic + 24 legendary (BUILD_START_LEVEL pin) + fate/3 + bonus.
    const oracle: OracleJson = { breakdowns: { destinyAPs: 91 } }
    const rows = buildParityRows(
      oracle, makeStats({ fatePoint: 60, destinyAP: 7 }),
      makeBuild({ totalLevel: 20, epicLevels: 10, legendaryLevels: 6 }), {},
    )
    expect(rows.find(r => r.stat === 'destinyAPs')).toMatchObject({ v2: 91, v3: 91 })
  })

  it('compares immunities as name sets', () => {
    const oracle: OracleJson = { immunities: 'Fear, Fear, Silence' }
    const stats = makeStats({ 'immunity.Fear': 1, 'immunity.Silence': 1 })
    const rows = buildParityRows(oracle, stats, makeBuild(), {})
    const row = rows.find(r => r.stat === 'immunities')!
    expect(row.v2).toBe(row.v3) // same set → no diff
  })
})

describe('diffParityRows', () => {
  it('truncates V3 doubles before comparing (V2 casts to int)', () => {
    const rows = [
      { stat: 'a', v2: 66, v3: 66.3 },   // V2 shows 66; V3's 66.3 truncates → match
      { stat: 'b', v2: 10, v3: 11.9 },   // truncates to 11 → mismatch
    ]
    const bad = diffParityRows(rows)
    expect(bad.map(r => r.stat)).toEqual(['b'])
  })

  it('honours the tolerance', () => {
    const rows = [{ stat: 'a', v2: 10, v3: 11 }]
    expect(diffParityRows(rows, 0)).toHaveLength(1)
    expect(diffParityRows(rows, 1)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Full endpoint-path integration — needs the oracle binary + real catalogues.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const ORACLE = join(ROOT, 'v2calc', 'build', 'v2calc')
const FIXTURE = join(ROOT, 'Output', 'Example Builds', 'YingsMonk.DDOBuild')
const haveAll = existsSync(DATA) && existsSync(ORACLE) && existsSync(FIXTURE)

describe.skipIf(!haveAll)('runParityCheck — full upload path', () => {
  it('runs the oracle on an uploaded XML and diffs against V3', { timeout: 120_000 }, async () => {
    const { runParityCheck } = await import('../server/oracleParity')
    const { loadAllCatalogues } = await import('../server/dataLoaders')
    const cat = loadAllCatalogues(DATA)
    const xml = readFileSync(FIXTURE, 'utf-8')
    const report = await runParityCheck(xml, cat, DATA, ORACLE)
    expect(report.available).toBe(true)
    expect(report.reason).toBeUndefined()
    // The oracle emits 200+ stats for a real build; all of them get compared.
    expect(report.compared).toBeGreaterThan(150)
    // YingsMonk is part of the oracle-exact corpus — it must stay exact.
    expect(report.mismatches).toEqual([])
    expect(report.pass).toBe(true)
  })

  it('degrades gracefully when the oracle binary is missing', async () => {
    const { runParityCheck } = await import('../server/oracleParity')
    const { loadAllCatalogues } = await import('../server/dataLoaders')
    const cat = loadAllCatalogues(DATA)
    const report = await runParityCheck('<x/>', cat, DATA, '/nonexistent/v2calc')
    expect(report.available).toBe(false)
    expect(report.pass).toBe(false)
    expect(report.reason).toContain('not found')
  })
})
