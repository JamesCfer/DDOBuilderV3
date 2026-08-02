/**
 * Parity pass N10 — percent-effect rounding happens per effect, not once
 * globally (V2 BreakdownItem.cpp DoPercentageEffects).
 *
 * V2 rounds EACH <Percent/>-tagged effect's contribution individually and
 * sums the already-rounded amounts, so V3 must not combine a stat's percent
 * bonuses into one sum before rounding — that over- or under-counts whenever
 * 2+ percent effects stack on the same stat. (V2 2.0.0.83 removed the old
 * hitpoints-only "combine all percents first, truncate once" path,
 * DoAllPercentsAtOnce, and made the per-effect rounding half-up — `+ 0.5`
 * before the int cast. Percent HP now arrives pre-combined instead, via
 * Effect_HitpointsPercent / Breakdown_HitpointsPercent.)
 *
 * Two cases pin the two halves of the rule against base AC 33:
 *   +12% twice — V2: trunc(33*12/100 + 0.5) x2 = 4 + 4 = 8  (pins half-up
 *                rounding; the pre-2.0.0.83 truncation gave 3 + 3 = 6)
 *   +10% twice — V2: trunc(33*10/100 + 0.5) x2 = 3 + 3 = 6  (pins per-effect
 *                rounding; combining first gives trunc(33*20/100 + 0.5) = 7)
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

function emptyInput(feats: Feat[]): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: feats,
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

const fighterClass = {
  Name: 'Fighter', HitPoints: 0, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1',
} as unknown as DDOClass

// +23 flat AC (non-exclusive bonus type) so base AC = 10 (innate) + 23 = 33.
const flatAcFeat = {
  Name: 'Flat AC', Acquire: 'Train',
  Effect: { Type: 'ACBonus', Bonus: 'QuestFlat', AType: 'Simple', Amount: '23' },
} as unknown as Feat

// Two independent +12% AC effects, distinct (non-exclusive) bonus types so
// both remain active under the stacking engine.
const acPercentFeatA = {
  Name: 'AC Percent A', Acquire: 'Train',
  Effect: { Type: 'ACBonus', Bonus: 'QuestPercentA', AType: 'Simple', Amount: '12', Percent: true },
} as unknown as Feat

const acPercentFeatB = {
  Name: 'AC Percent B', Acquire: 'Train',
  Effect: { Type: 'ACBonus', Bonus: 'QuestPercentB', AType: 'Simple', Amount: '12', Percent: true },
} as unknown as Feat

// The same pair at +10%, where combining before rounding would differ.
const acPercent10FeatA = {
  Name: 'AC Percent 10 A', Acquire: 'Train',
  Effect: { Type: 'ACBonus', Bonus: 'QuestPercentA', AType: 'Simple', Amount: '10', Percent: true },
} as unknown as Feat

const acPercent10FeatB = {
  Name: 'AC Percent 10 B', Acquire: 'Train',
  Effect: { Type: 'ACBonus', Bonus: 'QuestPercentB', AType: 'Simple', Amount: '10', Percent: true },
} as unknown as Feat

function l1(featNames: string[]) {
  const choices: Record<string, string> = {}
  featNames.forEach((f, i) => { choices[String(i + 1)] = f })
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 1 }],
    levelClasses: ['Fighter'],
    totalLevel: 1,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    featChoices: choices,
  }
}

describe('percent effects round per-effect, not combined', () => {
  it('base AC with the flat feat only is 33 (10 innate + 23 flat)', () => {
    const stats = computeBuildStats(
      { ...emptyInput([flatAcFeat]), allClasses: [fighterClass] },
      l1(['Flat AC']),
    )
    expect(stats.total('ac')).toBe(33)
  })

  it('two independent +12% AC effects each round individually and sum (33 + 4 + 4 = 41)', () => {
    const stats = computeBuildStats(
      {
        ...emptyInput([flatAcFeat, acPercentFeatA, acPercentFeatB]),
        allClasses: [fighterClass],
      },
      l1(['Flat AC', 'AC Percent A', 'AC Percent B']),
    )
    // V2 2.0.0.83: trunc(33*12/100 + 0.5) = 4, twice => +8 => 41.
    // Pre-2.0.0.83 truncation would have given 3 + 3 => 39.
    expect(stats.total('ac')).toBe(41)
  })

  it('two independent +10% AC effects round separately (33 + 3 + 3 = 39), not combined (40)', () => {
    const stats = computeBuildStats(
      {
        ...emptyInput([flatAcFeat, acPercent10FeatA, acPercent10FeatB]),
        allClasses: [fighterClass],
      },
      l1(['Flat AC', 'AC Percent 10 A', 'AC Percent 10 B']),
    )
    // Per-effect: trunc(3.3 + 0.5) = 3 twice => 39.
    // Combined-first (wrong): trunc(6.6 + 0.5) = 7 => 40.
    expect(stats.total('ac')).toBe(39)
  })
})
