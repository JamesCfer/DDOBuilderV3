/**
 * Parity pass — D13: an item's own inherent `<ArcaneSpellFailure>` now
 * synthesizes a stat (PARITY_TODO "Medium-priority remaining › Data-file
 * edge cases").
 *
 * V2 `Build::ApplyArmorEffects` (Build.cpp:5861-5869) and
 * `Build::ApplyWeaponEffects` (Build.cpp:5663-5670, called for BOTH
 * Weapon1/main-hand and Weapon2/off-hand slots) synthesize
 * `Effect_ArcaneSpellFailure` (Armor slot) / `Effect_ArcaneSpellFailureShields`
 * (Weapon1/Weapon2 slots) from `item.ArcaneSpellFailure()` whenever
 * `item.HasArcaneSpellFailure()` is true — no feat/requirement gate, unlike
 * the Docent MithralBody/AdamantineBody rules. `effectParser.ts` already maps
 * those two effect types to stat keys `arcaneSpellFailure`/
 * `arcaneSpellFailureShield` for feat/enhancement-granted effects, but
 * `buildStats.ts`'s `accumulateGear` never read `item.ArcaneSpellFailure` at
 * all, so an item's own inherent ASF% (present on 990 shipped `.item` files —
 * armor, shields, and off-hand-equippable weapons) never reached either key.
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

// Heavy Armor of the Warblade's Reflection: real shipped item, Armor slot.
const armorItem: Item = {
  Name: 'Test Warblade Armor',
  ArcaneSpellFailure: 35,
} as unknown as Item

// Artemist's Aegis: real shipped item, Weapon2 (off-hand) shield.
const shieldItem: Item = {
  Name: 'Test Aegis Shield',
  Weapon: 'Large Shield',
  ArcaneSpellFailure: 15,
} as unknown as Item

const mainHandWeapon: Item = {
  Name: 'Test Main Hand Weapon',
  ArcaneSpellFailure: 10,
} as unknown as Item

describe('D13 — item inherent ArcaneSpellFailure synthesizes a stat', () => {
  it('an Armor-slot item\'s ArcaneSpellFailure reaches the arcaneSpellFailure stat', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Armor: armorItem } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('arcaneSpellFailure')).toBe(35)
    expect(stats.total('arcaneSpellFailureShield')).toBe(0)
  })

  it('an Off-Hand shield\'s ArcaneSpellFailure reaches the arcaneSpellFailureShield stat', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { 'Off Hand': shieldItem } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('arcaneSpellFailureShield')).toBe(15)
    expect(stats.total('arcaneSpellFailure')).toBe(0)
  })

  it('a Main-Hand weapon\'s ArcaneSpellFailure also routes to arcaneSpellFailureShield (V2 ApplyWeaponEffects covers both weapon slots)', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { 'Main Hand': mainHandWeapon } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('arcaneSpellFailureShield')).toBe(10)
  })

  it('armor + shield both equipped: the two stats accumulate independently', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Armor: armorItem, 'Off Hand': shieldItem } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('arcaneSpellFailure')).toBe(35)
    expect(stats.total('arcaneSpellFailureShield')).toBe(15)
  })

  it('an item with no ArcaneSpellFailure field contributes nothing', () => {
    const plainArmor: Item = { Name: 'Test Plain Armor' } as unknown as Item
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Armor: plainArmor } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('arcaneSpellFailure')).toBe(0)
  })
})
