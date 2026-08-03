/**
 * Parity pass — D7: item-level `RestrictedSlots` slot exclusion (PARITY_TODO
 * "Medium-priority remaining › Data-file edge cases").
 *
 * V2 `Item.h:73` + `Build::SetGear` (Build.cpp:4674-4692) + `EquippedGear::
 * IsSlotRestricted` (EquippedGear.cpp:308-309): an item can declare arbitrary
 * OTHER inventory slots that must be cleared while it is equipped, distinct
 * from the already-ported two-handed/off-hand check. E.g. "Shining
 * Crescents" (a Weapon1 item) restricts Weapon2 (the off hand); "Platinum
 * Knuckles" (also Weapon1) restricts Gloves. V3 had no such enforcement — a
 * build could equip both the restricting item and something in the
 * restricted slot, and the restricted slot's item would still contribute.
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

// Shining Crescents: a main-hand weapon restricting the off hand.
const shiningCrescents: Item = {
  Name: 'Test Shining Crescents',
  RestrictedSlots: { Weapon2: true },
  Buff: { Type: 'PRR', Value1: 9 },
} as unknown as Item

// Platinum Knuckles: a main-hand weapon restricting Gloves.
const platinumKnuckles: Item = {
  Name: 'Test Platinum Knuckles',
  RestrictedSlots: { Gloves: true },
  Buff: { Type: 'PRR', Value1: 7 },
} as unknown as Item

const offHandItem: Item = {
  Name: 'Test Off Hand Item',
  Buff: { Type: 'MRR', Value1: 5 },
} as unknown as Item

const glovesItem: Item = {
  Name: 'Test Gloves',
  Buff: { Type: 'MRR', Value1: 4 },
} as unknown as Item

describe('D7 — item-level RestrictedSlots exclusion', () => {
  it('a RestrictedSlots weapon clears the off hand it restricts', () => {
    const stats = computeBuildStats(
      emptyInput({
        gearItems: { 'Main Hand': shiningCrescents, 'Off Hand': offHandItem },
      }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('prr')).toBe(9)
    expect(stats.total('mrr')).toBe(0)
  })

  it('a RestrictedSlots weapon clears a non-weapon slot it restricts (Gloves)', () => {
    const stats = computeBuildStats(
      emptyInput({
        gearItems: { 'Main Hand': platinumKnuckles, Gloves: glovesItem },
      }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('prr')).toBe(7)
    expect(stats.total('mrr')).toBe(0)
  })

  it('no restricted slot equipped: the restricting item contributes alone, nothing to clear', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { 'Main Hand': shiningCrescents } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('prr')).toBe(9)
  })

  it('an unrestricted slot is unaffected', () => {
    const stats = computeBuildStats(
      emptyInput({
        gearItems: { 'Main Hand': platinumKnuckles, 'Off Hand': offHandItem },
      }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('prr')).toBe(7)
    expect(stats.total('mrr')).toBe(5)
  })
})
