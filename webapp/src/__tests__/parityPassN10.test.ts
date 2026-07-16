/**
 * Parity pass N10 — percent-effect rounding truncates per effect, not once
 * globally (V2 BreakdownItem.cpp:474-503 DoPercentageEffects).
 *
 * V2 truncates EACH <Percent/>-tagged effect's contribution individually and
 * sums the already-truncated amounts. Only BreakdownItemHitpoints opts into
 * the alternate "combine all percents first, truncate once" path
 * (DoAllPercentsAtOnce(), BreakdownItem.cpp:498-501) — every other
 * percent-tagged stat (ACBonus, Weapon_Attack, SpellPoints, ...) truncates
 * per-effect in V2. V3 previously combined every stat's percent bonuses into
 * one sum before truncating, which over- or under-counts whenever 2+ percent
 * effects stack on the same non-HP stat.
 *
 * Example from the TODO: base 33 with two independent +12% effects.
 *   V2: trunc(33*12/100) + trunc(33*12/100) = 3 + 3 = 6
 *   V3 (bug): trunc(33*24/100) = trunc(7.92) = 7
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

describe('non-Hitpoints percent effects truncate per-effect, not combined', () => {
  it('base AC with the flat feat only is 33 (10 innate + 23 flat)', () => {
    const stats = computeBuildStats(
      { ...emptyInput([flatAcFeat]), allClasses: [fighterClass] },
      l1(['Flat AC']),
    )
    expect(stats.total('ac')).toBe(33)
  })

  it('two independent +12% AC effects each truncate individually and sum (33 + 3 + 3 = 39)', () => {
    const stats = computeBuildStats(
      {
        ...emptyInput([flatAcFeat, acPercentFeatA, acPercentFeatB]),
        allClasses: [fighterClass],
      },
      l1(['Flat AC', 'AC Percent A', 'AC Percent B']),
    )
    // V2: trunc(33*12/100)=3 twice => +6 => 39. NOT trunc(33*24/100)=7 => 40.
    expect(stats.total('ac')).toBe(39)
  })
})
