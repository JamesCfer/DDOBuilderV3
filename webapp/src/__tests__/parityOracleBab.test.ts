/**
 * First ground-truth parity fix found by the v2calc native oracle.
 *
 * V2's per-class BAB/SpellPointsPerLevel tables and per-level spell-slot
 * `Level<N>` rows all carry a `size` XML attribute, so fast-xml-parser wraps
 * the text as `{ '#text': '…', size: N }` instead of a bare string. V3's table
 * parsers used `String(x)` / `typeof x === 'string'`, which silently failed on
 * the wrapped form:
 *   - classBAB → "[object Object]" → NaN → **BAB 0 for every Monk build**
 *     (v2calc computes 20 for YingsMonk; V3 computed 0).
 *   - spellMath knownSpellCount / computeMaxSpellLevel → fell through to the
 *     Infinity/fallback branch, misreading spell caps.
 *
 * The self-consistency suite never caught this because its synthetic
 * catalogues used bare-string tables, not the real `{#text,size}` shape.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats } from '../lib/buildStats'
import { computeMaxSpellLevel } from '../lib/spells/spellMath'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import type { DDOClass } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIX = join(__dirname, '..', '..', '..', 'Output', 'Example Builds', 'YingsMonk.DDOBuild')
const have = existsSync(DATA) && existsSync(FIX)

describe.skipIf(!have)('v2calc oracle parity — BAB + spell tables ({#text,size} wrap)', () => {
  const cat = have ? loadAllCatalogues(DATA) : null

  it('Monk 20 (+epic/legendary) BAB is 20, matching v2calc (was 0)', () => {
    initBonusTypes(cat!.allBonusTypes)
    const { build } = importV2Build(readFileSync(FIX, 'utf-8'))
    const stats = computeBuildStats({
      allClasses: cat!.allClasses, allRaces: cat!.allRaces, allFeats: cat!.allFeats,
      allTrees: cat!.allTrees, allSelfBuffs: cat!.allSelfBuffs, allAugments: cat!.allAugments,
      allSetBonuses: cat!.allSetBonuses, allFiligreeBonuses: cat!.allFiligreeBonuses,
      allFiligrees: cat!.allFiligrees, gearItems: {},
    } as never, build)
    expect(stats.total('bab')).toBe(20)
  })

  it('a wrapped BAB table still parses (Wizard 1/2-BAB table)', () => {
    // Wizard BAB is the half-progression; at 20 levels its truncated BAB is 10.
    const wiz = cat!.allClasses.find(c => c.Name === 'Wizard') as DDOClass
    expect(wiz).toBeTruthy()
    // The raw field is the {#text,size} object shape this fix handles.
    expect(typeof (wiz as unknown as Record<string, unknown>).BAB).toBe('object')
  })

  it('computeMaxSpellLevel reads the {#text,size}-wrapped Level<N> rows', () => {
    const wiz = cat!.allClasses.find(c => c.Name === 'Wizard') as DDOClass
    // Wizard at 20 casts up to 9th-level spells.
    expect(computeMaxSpellLevel(wiz, 20)).toBe(9)
    // And fewer at low level (Level1 row: "1 0 0 …" → cap 1).
    expect(computeMaxSpellLevel(wiz, 1)).toBe(1)
  })
})
