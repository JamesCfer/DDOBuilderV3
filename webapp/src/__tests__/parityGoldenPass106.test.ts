// Golden-build regression (passes 106-108) — data-driven against the REAL V2
// forum export committed at Output/UserBuilds/exampledps.cc1.v2export.txt,
// which was captured from the same save as Output/UserBuilds/exampledps.DDOBuild.
//
// Every stat V2 printed must match V3 exactly, except the documented
// KNOWN_OPEN set (tracked in PARITY_TODO.md). When either file is refreshed
// from V2, this test follows automatically — no hand-copied numbers.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import { findActiveLife } from '../lib/multiLife'
import { parseV2Export } from '../lib/export/parseV2Export'
import type { Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'exampledps.DDOBuild')
const EXPORT = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'exampledps.cc1.v2export.txt')
const have = existsSync(DATA) && existsSync(FIXTURE) && existsSync(EXPORT)

// Residues still under investigation — see PARITY_TODO.md "Golden-build residue".
const KNOWN_OPEN = new Set(['ac', 'hp', 'mrr', 'prr'])

describe.skipIf(!have)('golden build vs real V2 forum export', () => {
  const cat = loadAllCatalogues(DATA)
  initBonusTypes(cat.allBonusTypes)
  const { build, document } = importV2Build(readFileSync(FIXTURE, 'utf-8')) as ReturnType<typeof importV2Build> & { document?: unknown }
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }
  const specialFeats = document ? findActiveLife(document as never)?.specialFeats : undefined
  const stats = computeBuildStats({
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs, specialFeats, gearItems,
  }, build)
  const parsed = parseV2Export(readFileSync(EXPORT, 'utf-8'))

  const composed = (key: string): number => {
    if (key.startsWith('sp.') && key !== 'sp.Universal') {
      return stats.total(key) + stats.total('sp.Universal')
    }
    if (key === 'speed') return stats.total('speed') - 100
    return stats.total(key)
  }

  it('parses a meaningful number of stats from the export', () => {
    expect(Object.keys(parsed.stats).length).toBeGreaterThan(40)
  })

  it('every V2-printed stat matches V3 (excluding documented open residues)', () => {
    const failures: string[] = []
    for (const [key, v2] of Object.entries(parsed.stats)) {
      if (KNOWN_OPEN.has(key)) continue
      const v3 = composed(key)
      if (Math.abs(v3 - v2) > 0.5) failures.push(`${key}: V2=${v2} V3=${v3}`)
    }
    expect(failures).toEqual([])
  })

  it('documented open residues stay within their known bounds (catch regressions)', () => {
    // If any of these drift FURTHER from V2 than the recorded gap, a
    // regression slipped in; if they close, move them out of KNOWN_OPEN.
    // `hp`'s sign flipped from -78 to +195 after fixing the epic/legendary
    // HP-halving, CON-delta-scope, Combat-Style double-count, and
    // Reaper-AP-cap bugs (see parityPassEpicLegendaryHP.test.ts) — those
    // fixes closed most of the old gap but surfaced a separate, still-open
    // percent-HP / missing-effect residue (PARITY_TODO.md "Golden-build
    // residue").
    const gaps: Record<string, number> = { ac: -4, hp: 195, mrr: -8, prr: -4 }
    for (const [key, gap] of Object.entries(gaps)) {
      const v2 = parsed.stats[key]
      if (v2 === undefined) continue
      const diff = composed(key) - v2
      expect(Math.abs(diff), `${key} drifted: diff=${diff}, recorded=${gap}`).toBeLessThanOrEqual(Math.abs(gap))
    }
  })

  it('all 10 weapon filigrees import (NumFiligrees honored)', () => {
    expect(build.filigreeSlots.filter(f => f.name).length).toBe(10)
  })
})
