/**
 * Parity pass — D8: `Build::VerifyGear` item-revocation pass (PARITY_TODO
 * "Medium-priority remaining › Data-file edge cases").
 *
 * V2 `Build.cpp:2623-2665 VerifyGear` re-checks every equipped item on every
 * level-up, race/class change, or feat-training event, and force-unequips
 * (with a log entry) any item whose `MinLevel()` exceeds the character's
 * level OR whose `<Requirements>` block (race/class/feat/alignment gates) is
 * no longer met. V3 had no equivalent — an item that a build can no longer
 * legally wear (imported from a V2 save, or reachable via a race/level
 * change) kept contributing its effects, augments and set bonuses forever.
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

// "Knight's Gauntlets" — MinLevel 15, Requirements: Race=Purple Dragon Knight.
const raceGatedGloves: Item = {
  Name: "Test Knight's Gauntlets",
  MinLevel: 15,
  Requirements: { Requirement: { Type: 'Race', Item: 'Purple Dragon Knight', Value: 1 } },
  Buff: { Type: 'PRR', Value1: 9 },
} as unknown as Item

const tooHighLevelItem: Item = {
  Name: 'Test Overlevel Trinket',
  MinLevel: 40,
  Buff: { Type: 'MRR', Value1: 5 },
} as unknown as Item

const plainItem: Item = {
  Name: 'Test Plain Boots',
  MinLevel: 10,
  Buff: { Type: 'PRR', Value1: 4 },
} as unknown as Item

describe('D8 — Build::VerifyGear item revocation', () => {
  it('an item whose Race requirement the build does not meet contributes nothing', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Gloves: raceGatedGloves } }),
      { ...makeEmptyBuild(), race: 'Human' },
    )
    expect(stats.total('prr')).toBe(0)
  })

  it('the same item DOES contribute once the build race matches', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Gloves: raceGatedGloves } }),
      { ...makeEmptyBuild(), race: 'Purple Dragon Knight' },
    )
    expect(stats.total('prr')).toBe(9)
  })

  it('an item above the character level (heroic+epic+legendary) contributes nothing', () => {
    // emptyBuild(): totalLevel 20 + epicLevels 10 + legendaryLevels 6 = 36
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Trinket: tooHighLevelItem } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('mrr')).toBe(0)
  })

  it('an item at or below the character level still contributes', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Trinket: { ...tooHighLevelItem, MinLevel: 36 } } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('mrr')).toBe(5)
  })

  it('an item with no MinLevel/Requirements is unaffected', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Boots: plainItem } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('prr')).toBe(4)
  })
})
