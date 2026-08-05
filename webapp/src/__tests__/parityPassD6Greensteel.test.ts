/**
 * Parity pass — D6: Legendary Green Steel "Dominant" stances never
 * auto-activate (PARITY_TODO "Medium-priority remaining › Data-file edge
 * cases").
 *
 * V2 `StancesPane.cpp:1053-1160 UpdateGreensteelStances`: with 2+ equipped
 * Green Steel items (`Item.h IsGreensteel`, any slot but the two weapon
 * hands), V2 compares each of the Dominion/Escalation/Opposition Set Bonus
 * stack counts (`Build::SetBonusCount`) and auto-activates the strict
 * highest as a mutually-exclusive stance, gating further Set Bonus effects
 * whose `<Requirements><Requirement Type="Stance">` names it (see
 * `SetBonuses.xml`'s Dominion/Escalation/Opposition/Ethereal/Material
 * blocks). Ethereal/Material need 4+ items. Opposition only wins when
 * Dominion and Escalation are tied (V2's own comment: "only occurs when ALL
 * augments are Opposition type"). V3 never derived these stances — a build
 * with 2+ Green Steel items got none of this family's effects, no matter
 * how many matching augments were slotted.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
} from '../types/ddo'

function emptyInput(overrides: Partial<BuildStatsInput> = {}): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
    ...overrides,
  }
}

function gsItem(name: string): Item {
  return { Name: name, IsGreensteel: '' } as unknown as Item
}

const dominionAugment: Augment = { Name: 'GS Dominion', Type: 'Greensteel', SetBonus: 'Dominion' }
const escalationAugment: Augment = { Name: 'GS Escalation', Type: 'Greensteel', SetBonus: 'Escalation' }
const oppositionAugment: Augment = { Name: 'GS Opposition', Type: 'Greensteel', SetBonus: 'Opposition' }
const etherealAugment: Augment = { Name: 'GS Ethereal', Type: 'Greensteel', SetBonus: 'Ethereal' }
const materialAugment: Augment = { Name: 'GS Material', Type: 'Greensteel', SetBonus: 'Material' }
const allTestAugments = [dominionAugment, escalationAugment, oppositionAugment, etherealAugment, materialAugment]

// Mirrors SetBonuses.xml's real Dominion/Escalation/Opposition/Ethereal/
// Material blocks: EquippedCount 2, effect gated on the matching Stance.
const dominionSetBonus: SetBonus = {
  Type: 'Dominion',
  Buff: [{
    EquippedCount: 2,
    Effect: {
      Type: 'SpellPoints', AType: 'Simple', Amount: 100,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Dominion' } },
    },
  }],
} as unknown as SetBonus

const escalationSetBonus: SetBonus = {
  Type: 'Escalation',
  Buff: [{
    EquippedCount: 2,
    Effect: {
      Type: 'DodgeCapBonus', AType: 'Simple', Amount: 5,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Escalation' } },
    },
  }],
} as unknown as SetBonus

const oppositionSetBonus: SetBonus = {
  Type: 'Opposition',
  Buff: [{
    EquippedCount: 2,
    Effect: {
      Type: 'Hitpoints', AType: 'Simple', Amount: 50,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Opposition' } },
    },
  }],
} as unknown as SetBonus

const etherealSetBonus: SetBonus = {
  Type: 'Ethereal',
  Buff: [{
    EquippedCount: 2,
    Effect: {
      Type: 'PRR', AType: 'Simple', Amount: 10,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Ethereal' } },
    },
  }],
} as unknown as SetBonus

const materialSetBonus: SetBonus = {
  Type: 'Material',
  Buff: [{
    EquippedCount: 2,
    Effect: {
      Type: 'MRR', AType: 'Simple', Amount: 8,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Material' } },
    },
  }],
} as unknown as SetBonus

const allTestSetBonuses = [
  dominionSetBonus, escalationSetBonus, oppositionSetBonus, etherealSetBonus, materialSetBonus,
]

function statsFor(gearItems: Record<string, Item>, augmentChoices: Record<string, string>) {
  return computeBuildStats(
    emptyInput({ gearItems, allAugments: allTestAugments, allSetBonuses: allTestSetBonuses }),
    { ...makeEmptyBuild(), augmentChoices },
  )
}

// hp/dodgeCap carry a non-zero baseline even on an empty build (base dodge
// cap, negative-level-free HP floor) unrelated to this fix — compare against
// the SAME gear with no augments slotted so only the dominance stance's own
// contribution shows up.
function deltasFor(
  gearItems: Record<string, Item>, augmentChoices: Record<string, string>, keys: string[],
): Record<string, number> {
  const withAugments = statsFor(gearItems, augmentChoices)
  const baseline = statsFor(gearItems, {})
  const out: Record<string, number> = {}
  for (const k of keys) out[k] = withAugments.total(k) - baseline.total(k)
  return out
}

describe('D6 — Greensteel dominance stances (StancesPane::UpdateGreensteelStances)', () => {
  it('fewer than 2 Greensteel items blocks the stance even if the set-bonus count is met', () => {
    // One Greensteel item, two augment slots both granting Dominion: the
    // stack count reaches the 2pc tier, but only 1 Greensteel ITEM is
    // equipped, so V2 never activates the Dominion stance at all.
    const stats = statsFor(
      { Bracers: gsItem('Test GS Bracers') },
      { 'Bracers:Greensteel:0': 'GS Dominion', 'Bracers:Greensteel:1': 'GS Dominion' },
    )
    expect(stats.total('spellPoints')).toBe(0)
  })

  it('2 Greensteel items with Dominion the sole stack activates Dominion', () => {
    const gearItems = { Bracers: gsItem('Test GS Bracers'), Boots: gsItem('Test GS Boots') }
    const augmentChoices = { 'Bracers:Greensteel:0': 'GS Dominion', 'Boots:Greensteel:0': 'GS Dominion' }
    expect(statsFor(gearItems, augmentChoices).total('spellPoints')).toBe(100)
    expect(deltasFor(gearItems, augmentChoices, ['dodgeCap', 'hp'])).toEqual({ dodgeCap: 0, hp: 0 })
  })

  it('Escalation activates instead when it out-stacks Dominion/Opposition', () => {
    const gearItems = { Bracers: gsItem('Test GS Bracers'), Boots: gsItem('Test GS Boots') }
    const augmentChoices = { 'Bracers:Greensteel:0': 'GS Escalation', 'Boots:Greensteel:0': 'GS Escalation' }
    expect(deltasFor(gearItems, augmentChoices, ['dodgeCap'])).toEqual({ dodgeCap: 5 })
    expect(statsFor(gearItems, augmentChoices).total('spellPoints')).toBe(0)
  })

  it('Opposition activates when it is highest AND Dominion/Escalation are tied', () => {
    const gearItems = { A: gsItem('GS A'), B: gsItem('GS B'), C: gsItem('GS C'), D: gsItem('GS D') }
    const augmentChoices = {
      'A:Greensteel:0': 'GS Dominion',    // dominionCount 1
      'B:Greensteel:0': 'GS Escalation',  // escalationCount 1
      'C:Greensteel:0': 'GS Opposition',
      'D:Greensteel:0': 'GS Opposition',  // oppositionCount 2
    }
    expect(deltasFor(gearItems, augmentChoices, ['hp', 'dodgeCap'])).toEqual({ hp: 50, dodgeCap: 0 })
    expect(statsFor(gearItems, augmentChoices).total('spellPoints')).toBe(0)
  })

  it('Opposition stays inactive when highest but Dominion/Escalation are NOT tied (V2 quirk)', () => {
    // dominionCount 0, escalationCount 1, oppositionCount 2 — Opposition is
    // numerically highest but V2's own dominion==escalation guard blocks it,
    // and neither Dominion nor Escalation individually beats Opposition.
    // Net result: nobody wins.
    const gearItems = { A: gsItem('GS A'), B: gsItem('GS B'), C: gsItem('GS C') }
    const augmentChoices = {
      'A:Greensteel:0': 'GS Escalation',
      'B:Greensteel:0': 'GS Opposition',
      'C:Greensteel:0': 'GS Opposition',
    }
    expect(deltasFor(gearItems, augmentChoices, ['hp', 'dodgeCap'])).toEqual({ hp: 0, dodgeCap: 0 })
    expect(statsFor(gearItems, augmentChoices).total('spellPoints')).toBe(0)
  })

  it('Ethereal/Material need 4+ Greensteel items even when they are the sole stack', () => {
    const stats = statsFor(
      { Bracers: gsItem('Test GS Bracers'), Boots: gsItem('Test GS Boots') },
      { 'Bracers:Greensteel:0': 'GS Ethereal', 'Boots:Greensteel:0': 'GS Ethereal' },
    )
    expect(stats.total('prr')).toBe(0)
  })

  it('Ethereal activates with 4+ Greensteel items when it out-stacks Material', () => {
    const stats = statsFor(
      {
        A: gsItem('GS A'), B: gsItem('GS B'), C: gsItem('GS C'), D: gsItem('GS D'),
      },
      { 'A:Greensteel:0': 'GS Ethereal', 'B:Greensteel:0': 'GS Ethereal' },
    )
    expect(stats.total('prr')).toBe(10)
    expect(stats.total('mrr')).toBe(0)
  })

  it('Material activates with 4+ Greensteel items when it out-stacks Ethereal', () => {
    const stats = statsFor(
      {
        A: gsItem('GS A'), B: gsItem('GS B'), C: gsItem('GS C'), D: gsItem('GS D'),
      },
      { 'A:Greensteel:0': 'GS Material', 'B:Greensteel:0': 'GS Material' },
    )
    expect(stats.total('mrr')).toBe(8)
    expect(stats.total('prr')).toBe(0)
  })

  it('a Greensteel weapon contributes to the set-bonus stack count but not the item-count gate', () => {
    // The Main Hand weapon carries a Dominion augment (bringing the stack
    // count to 2, meeting Escalation's EquippedCount), but V2 excludes
    // Weapon1/Weapon2 from the "2+ Greensteel items" gate, so with only one
    // qualifying non-weapon item the stance never activates.
    const stats = statsFor(
      { 'Main Hand': gsItem('Test GS Weapon'), Boots: gsItem('Test GS Boots') },
      { 'Main Hand:Greensteel:0': 'GS Dominion', 'Boots:Greensteel:0': 'GS Dominion' },
    )
    expect(stats.total('spellPoints')).toBe(0)
  })
})
