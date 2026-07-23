/**
 * Section E parity — augment-granted set bonuses + SuppressSetBonus.
 *
 * V2 source:
 *   DDOBuilder/Item.cpp:508-548     Item::HasSetBonus — counts augment set
 *                                   bonuses AND the item's native set bonuses,
 *                                   the latter suppressed if any augment on the
 *                                   item has SuppressSetBonus.
 *   DDOBuilder/Build.cpp:4905-4922  ApplyItem applies augment set bonuses, then
 *                                   item set bonuses only when not suppressed.
 *   DDOBuilder/SetBonus.cpp:88-109  ActiveEffects — tiers activate cumulatively
 *                                   (incremental AddSetBonusStack per item).
 *
 * V3 previously counted only item.SetBonus and ignored augments entirely, so
 * set-bonus-granting augments (e.g. "Echoes of the Walking Ancestors" via an
 * IoD set-bonus slot) contributed nothing.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
} from '../types/ddo'

function emptyInput(): BuildStatsInput {
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
  }
}

// A 2-piece set granting +10 PRR at EquippedCount 2.
const prrSet: SetBonus = {
  Type: 'Test Sheltering Set',
  Buff: [
    { EquippedCount: 2, Effect: { Type: 'PRR', Bonus: 'Artifact', AType: 'Simple', Amount: 10 } },
  ],
} as unknown as SetBonus

const setAugment: Augment = {
  Name: 'Grants Test Set',
  Type: 'Set Bonus Slot',
  SetBonus: 'Test Sheltering Set',
}

const suppressAugment: Augment = {
  Name: 'Silencer',
  Type: 'Colorless',
  SetBonus: 'Test Sheltering Set',
  SuppressSetBonus: '', // V2 DL_FLAG parses to ""
}

describe('augment-granted set bonuses (V2 Item::HasSetBonus parity)', () => {
  it('two augments granting the same set reach the 2pc tier', () => {
    const ring1: Item = { Name: 'Ring A' } as Item
    const ring2: Item = { Name: 'Ring B' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: {
        'Ring1:Set Bonus Slot:0': 'Grants Test Set',
        'Ring2:Set Bonus Slot:0': 'Grants Test Set',
      },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ring1, Ring2: ring2 },
      allAugments: [setAugment],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(10)
  })

  it('item native set + one augment set combine to reach the tier', () => {
    // Ring A carries the set natively; Ring B grants it via augment → count 2.
    const ringNative: Item = { Name: 'Ring A', SetBonus: 'Test Sheltering Set' } as Item
    const ringAug: Item = { Name: 'Ring B' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: { 'Ring2:Set Bonus Slot:0': 'Grants Test Set' },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ringNative, Ring2: ringAug },
      allAugments: [setAugment],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(10)
  })

  it('SuppressSetBonus on an augment suppresses the host item native set', () => {
    // Both rings carry the set natively (would be count 2), but Ring2 has a
    // SuppressSetBonus augment that does NOT itself grant the set → its native
    // set is suppressed, so only Ring1 counts → count 1 → no tier reached.
    const ringNativeSuppressed: Augment = {
      Name: 'Pure Silencer', Type: 'Colorless', SuppressSetBonus: '',
    }
    const ring1: Item = { Name: 'Ring A', SetBonus: 'Test Sheltering Set' } as Item
    const ring2: Item = { Name: 'Ring B', SetBonus: 'Test Sheltering Set' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: { 'Ring2:Colorless:0': 'Pure Silencer' },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ring1, Ring2: ring2 },
      allAugments: [ringNativeSuppressed],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(0)
  })

  it('SuppressSetBonus augment that also grants the set: its own grant still counts', () => {
    // Ring2: native set suppressed, but the suppressing augment also grants the
    // set, so Ring1 native (1) + Ring2 augment grant (1) = 2 → tier reached.
    const ring1: Item = { Name: 'Ring A', SetBonus: 'Test Sheltering Set' } as Item
    const ring2: Item = { Name: 'Ring B', SetBonus: 'Test Sheltering Set' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: { 'Ring2:Colorless:0': 'Silencer' },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ring1, Ring2: ring2 },
      allAugments: [suppressAugment],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(10)
  })
})

describe('item-specific augment options (V2 ItemAugment::GetSelectedAugment parity)', () => {
  // V2 ItemAugment.cpp:66-79 GetSelectedAugment(): items like "Gem of Many
  // Facets" define their own per-slot augment choices inline
  // (ItemSpecificAugments) that never appear in the global Augments
  // catalogue. V2 checks the item's own list FIRST, falling back to
  // FindAugmentByName only when not found there.
  const facetItem: Item = {
    Name: 'Gem of Many Facets',
    ItemAugment: [
      {
        Type: 'Set Bonus 2',
        Augment: [
          {
            Name: "Elder's Knowledge", Type: 'Facets Set Bonus 2',
            SetBonus: "Elder's Knowledge",
          },
          { Name: "Vulkoor's Might", Type: 'Facets Set Bonus 2', SetBonus: "Vulkoor's Might" },
        ],
      },
    ],
  } as unknown as Item

  const knowledgeSet: SetBonus = {
    Type: "Elder's Knowledge",
    Buff: [
      { EquippedCount: 2, Effect: { Type: 'PRR', Bonus: 'Artifact', AType: 'Simple', Amount: 10 } },
    ],
  } as unknown as SetBonus

  it('an item-specific augment choice is not silently dropped', () => {
    // Native SetBonus on Helmet (1) + the Gem's item-specific augment choice
    // (1) = count 2 → tier reached. Before the fix, the Gem's augment name
    // wasn't found in the (empty) global catalogue and was skipped entirely.
    const helmet: Item = { Name: 'Elder Helmet', SetBonus: "Elder's Knowledge" } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Helmet: 'Elder Helmet', Trinket: 'Gem of Many Facets' } as Record<string, string>,
      augmentChoices: { 'Trinket:Set Bonus 2:1': "Elder's Knowledge" },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Helmet: helmet, Trinket: facetItem },
      allAugments: [], // deliberately empty — the augment is NOT in the global catalogue
      allSetBonuses: [knowledgeSet],
    }, build)
    expect(stats.total('prr')).toBe(10)
  })

  it('falls back to the global catalogue when no item-specific match exists', () => {
    const globalAugment: Augment = {
      Name: 'Globally Catalogued Augment', Type: 'Colorless',
      Effect: { Type: 'PRR', Bonus: 'Artifact', AType: 'Simple', Amount: 5 },
    }
    const build = {
      ...makeEmptyBuild(),
      gear: { Trinket: 'Gem of Many Facets' } as Record<string, string>,
      augmentChoices: { 'Trinket:Colorless:0': 'Globally Catalogued Augment' },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Trinket: facetItem },
      allAugments: [globalAugment],
      allSetBonuses: [],
    }, build)
    expect(stats.total('prr')).toBe(5)
  })
})

describe('filigree rare-effect gating (V2 Filigree::RareEffects parity)', () => {
  // A filigree whose normal effect is +2 Fire spell power and whose RARE effect
  // adds a further +3. V2 Filigree.cpp:56-80 + Effect_Rare DL_FLAG: the rare
  // effect applies only when the slot is marked rare. Real filigree data pairs
  // a rare bonus targeting the SAME stat as its normal effect with bonus type
  // "Stacking" (e.g. Celerity.Filigree.xml) precisely because filigree effects
  // now join the gear "Highest Only" pool (V2 NotifyItemEffect parity) — a
  // Highest-Only-typed pair on the same stat would collide and only the
  // larger would count, which is not what these paired filigrees intend.
  const filigree: Filigree = {
    Name: 'Test Filigree',
    Effect: [
      { Type: 'SpellPower', Bonus: 'Stacking', AType: 'Simple', Amount: 2, Item: 'Fire' },
      { Type: 'SpellPower', Bonus: 'Stacking', AType: 'Simple', Amount: 3, Item: 'Fire', Rare: true },
    ],
  } as unknown as Filigree

  function statsFor(rare: boolean) {
    const build = {
      ...makeEmptyBuild(),
      filigreeSlots: [{ name: 'Test Filigree', rare }],
    }
    return computeBuildStats({ ...emptyInput(), allFiligrees: [filigree] }, build)
  }

  // Note: a small Spellcraft governing-skill bonus is auto-applied to spell
  // power (section A), so we assert via the active-bonus list from the
  // filigree source rather than the raw total.
  function filigreeSpBonuses(rare: boolean): number[] {
    return statsFor(rare).resolve('sp.Fire').bonuses
      .filter(b => b.active && b.source.startsWith('Filigree:'))
      .map(b => b.value)
  }

  it('non-rare slot applies ONLY the normal effect', () => {
    expect(filigreeSpBonuses(false)).toEqual([2])
  })

  it('rare slot applies normal + rare effects', () => {
    expect(filigreeSpBonuses(true).sort((a, b) => a - b)).toEqual([2, 3])
  })
})
