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
// hp left this set in pass 120 (favor feats + TotalLevel×rank + Reaper stance
// gate closed the whole gap); ac/mrr/prr left in pass 133 (the pass 121-132
// oracle work — tracked armor stances, shield/weapon naming, PRR/MRR selector
// own-effects — closed them as a side effect, re-verified exact against this
// real V2 export) — every tracked stat is now exact-checked.
const KNOWN_OPEN = new Set<string>([])

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

  it('ac/mrr/prr are exact against the real V2 export (closed in pass 133; KNOWN_OPEN is empty)', () => {
    // These three were the last "documented open residue" (bounded at
    // -4/-8/-4). The pass 121-132 oracle work closed them as a side effect;
    // this pins them down directly so a future regression fails loudly
    // instead of silently reopening up to the old bound.
    for (const key of ['ac', 'mrr', 'prr']) {
      const v2 = parsed.stats[key]
      expect(v2, `expected '${key}' in the parsed export`).toBeDefined()
      expect(composed(key), key).toBe(v2)
    }
  })

  it('all 10 weapon filigrees import (NumFiligrees honored)', () => {
    expect(build.filigreeSlots.filter(f => f.name).length).toBe(10)
  })

  it('saves are exact against the real V2 export (Oracle-derived bug list "saves" bucket, stale since #165)', () => {
    // PARITY_TODO.md's "Oracle-derived mechanical bug list" still carried a
    // 🟡 "saves: Reflex 37→18 / Fort 30→8 / Will 6 (#159)" entry claiming a
    // residual of Reflex 0 / Fort 1 / Will 1 "as of #165" — but passes
    // 119-133 (guild-buff TotalLevel fix, feat TotalLevel + selector
    // requirements + SliderValue, oracle slider default, stale trained
    // spells) closed the rest without the bullet ever being marked ✅. This
    // pins all three base saves down directly against the real export.
    for (const key of ['save.Fort', 'save.Reflex', 'save.Will']) {
      const v2 = parsed.stats[key]
      expect(v2, `expected '${key}' in the parsed export`).toBeDefined()
      expect(composed(key), key).toBe(v2)
    }
  })

  it('Weapon Damage section (melee/ranged power, doublestrike/doubleshot, ' +
     'strikethrough, off-hand attack, fortification bypass, helpless damage) ' +
     'is exact against the real V2 export (PARITY_TODO.md "2026-07-19 user ' +
     'cc1-gearset export diff" — closed)', () => {
    // The todo's "cc1-gearset export diff" flagged Fortification Bypass 84
    // vs V2's 71 (+13 OVER) and unexplained MP/PRR/MRR delta on this exact
    // save. parseV2Export never parsed the "Weapon Damage" block
    // (ForumExportDlg.cpp::AddWeaponDamage), so none of these eight values
    // were ever regression-checked. #117 (fortBypass Highest-Only fix) and
    // the pass 121-133 stance/PRR/MRR work already closed the underlying
    // bugs; this pins the full section down directly.
    for (const key of [
      'melee.power', 'ranged.power', 'melee.doublestrike', 'ranged.doubleshot',
      'melee.strikethrough', 'offhand.attack', 'fortBypass', 'helpless',
    ]) {
      const v2 = parsed.stats[key]
      expect(v2, `expected '${key}' in the parsed export`).toBeDefined()
      expect(composed(key), key).toBe(v2)
    }
  })
})
