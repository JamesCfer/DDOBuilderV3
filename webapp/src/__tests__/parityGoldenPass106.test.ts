// Golden-build regression for parity pass 106 (V2 breakdown export values,
// exampledps.DDOBuild — Bard 18/Barb 1/Ftr 1, L34).
//
// Locks in the stat-engine fixes:
//  - Epic/Legendary pseudo-class AutomaticFeats applied (Epic/Legendary Power
//    ×14 → +84 melee/ranged/universal-spell power; Epic Skills ×10 → +10 all
//    skills; Epic/Legendary Knowledge → +7 caster levels)
//  - per-level cross-class skill half-ranks (V2 Build::SkillAtLevel)
//  - trained-spell StackSource stamped unconditionally + ClassCasterLevel
//    resolved against the caster-level breakdown (Merfolk's Blessing → Swim)
//  - <NumFiligrees> honored on import (was hardcoded 6, dropping 4 filigrees
//    incl. the Nystul 5pc +40 MRR Cap)
//  - spell-power governing-skill fold runs after the skill.All fan-out

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import { findActiveLife } from '../lib/multiLife'
import type { Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'exampledps.DDOBuild')
const have = existsSync(DATA) && existsSync(FIXTURE)

describe.skipIf(!have)('golden build V2-exact stats (pass 106)', () => {
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

  it('all 10 weapon filigrees import (NumFiligrees honored)', () => {
    expect(build.filigreeSlots.filter(f => f.name).length).toBe(10)
  })
  it('Melee Power 266 (V2 exact)', () => {
    expect(stats.total('melee.power')).toBe(266)
  })
  it('Ranged Power 176 (V2 exact)', () => {
    expect(stats.total('ranged.power')).toBe(176)
  })
  it('Universal Spell Power 128 (V2 exact)', () => {
    expect(stats.total('sp.Universal')).toBe(128)
  })
  it('MRR Cap 170 (V2 exact — Nystul 5pc from filigrees 7-10)', () => {
    expect(stats.total('mrrCap')).toBe(170)
  })
  it('Swim 73 (V2 exact — Merfolk\'s Blessing at caster level 25)', () => {
    expect(stats.total('skill.Swim')).toBe(73)
  })
  it('Perform 54 (V2 exact — cross-class half-ranks per level)', () => {
    expect(stats.total('skill.Perform')).toBe(54)
  })
  it('Sonic Spell Power 182 (V2 exact — skill fold after skill.All fan-out)', () => {
    expect(stats.total('sp.Sonic') + stats.total('sp.Universal')).toBe(182)
  })
})
