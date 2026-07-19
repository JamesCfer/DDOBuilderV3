// Parity pass 107 — golden-build regression (V2 breakdown values,
// exampledps.DDOBuild). Locks in:
//  - ChooseLevel augments read LevelValue[SelectedLevelIndex] (V2
//    Build.cpp:4975-5012) — Sapphire of Dodge idx 8 → +14, not the printed
//    Amount 17; closes Dodge/PRR/MRR augment overcounts+undercounts.
//  - Augment effects join the item pool (Highest-Only vs other gear bonuses).
//  - Tome cap uses the character level (a +8 tome fully applies at L34).
//  - Duplicate <Type> entries in one effect stack (V2 m_stacks): Fury of the
//    Wild "Primal Scream" (<Type>AbilityBonus</Type> ×2, Stacks "0 2 4") →
//    +2, not 0.
//  - Self/party buffs apply from the dedicated selfBuffs list, not from
//    active stances sharing a catalogue buff's name.

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

describe.skipIf(!have)('golden build V2-exact stats (pass 107)', () => {
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

  it('SelectedLevelIndex imports for ChooseLevel augments', () => {
    expect(build.augmentLevelChoices?.['Necklace:Green:2']).toBe(8)
  })
  it('Dodge 18 (V2 exact — Sapphire of Dodge LevelValue[8] = 14)', () => {
    expect(stats.total('dodge')).toBe(18)
  })
  it('Sapphire of Resistance resolves +11 via LevelValue and sits in the gear pool', () => {
    const r = stats.resolve('save.Will').bonuses.find(b => b.source.includes('Sapphire of Resistance'))
    expect(r?.value).toBe(11)
    expect(r?.fromGear).toBe(true)
  })
  it('WIS 20 / INT 18 / CHA 25 (V2 exact — +8 tome fully applies at character level 34)', () => {
    expect(stats.total('ability.Wisdom')).toBe(20)
    expect(stats.total('ability.Intelligence')).toBe(18)
    expect(stats.total('ability.Charisma')).toBe(25)
  })
  it('Maximum Ki 65 (V2 exact — WIS-mod knock-on resolved)', () => {
    expect(stats.total('ki.max')).toBe(65)
  })
  it('DEX 25 (V2 exact — Primal Scream duplicate-Type stacks give +2, self-buff double removed)', () => {
    expect(stats.total('ability.Dexterity')).toBe(25)
  })
  it('elemental spell powers match the committed V2 export (see parityGoldenPass106 for the full sweep)', () => {
    const u = stats.total('sp.Universal')
    expect(stats.total('sp.Positive') + u).toBe(183)
    expect(stats.total('sp.Sonic') + u).toBe(161)
  })
  it('self buffs list is separate from active stances', () => {
    // The fixture's ActiveStances include "Primal Scream"; the Life node has
    // no SelfAndPartyBuffs — so selfBuffs must be empty and the catalogue
    // party-buff entry must NOT have applied (+4) on top of the stance (+2).
    expect(build.selfBuffs ?? []).toEqual([])
    expect(build.activeBuffs).toContain('Primal Scream')
  })
})
