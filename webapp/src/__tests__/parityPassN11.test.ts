/**
 * Parity pass N11 — `Bonus="Temporary"` effects must not be scaled by
 * percentage bonuses on the same stat (V2 BreakdownItem.cpp:793-812
 * RemoveTemporary + :236-238).
 *
 * V2 pulls any effect whose bonus type is "Temporary" out of the bonus list
 * *before* `baseTotal` is computed for percentage purposes, then adds it back
 * flatly after all percentage effects have applied. So a Temporary bonus
 * (e.g. Bard "Inspire Greatness" +20 Temporary HP) contributes to the raw
 * total but is never itself part of the base that a stat's own %-bonuses
 * (e.g. Frenzied Berserker +25% HP) scale against, and the temporary amount
 * itself is never multiplied by that percentage either.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
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

// HitPoints 10/level → 100 base HP at level 10 (CON 10 → +0).
const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1',
} as unknown as DDOClass

function l10(featNames: string[]) {
  const choices: Record<string, string> = {}
  featNames.forEach((f, i) => { choices[String(i + 1)] = f })
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 10 }],
    levelClasses: Array.from({ length: 10 }, () => 'Fighter'),
    totalLevel: 10,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    featChoices: choices,
  }
}

// Bard "Inspire Greatness"-style +20 Temporary HP (flat, non-percent).
const temporaryHpFeat = {
  Name: 'Inspire Greatness', Acquire: 'Train',
  Effect: { Type: 'Hitpoints', Bonus: 'Temporary', AType: 'Simple', Amount: '20' },
} as unknown as Feat

// Frenzied-Berserker-style +25% HP.
const hpPercentFeat = {
  Name: 'Frenzy HP', Acquire: 'Train',
  Effect: { Type: 'Hitpoints', Bonus: 'Competence', AType: 'Simple', Amount: '25', Percent: true },
} as unknown as Feat

describe('Temporary-type bonuses are excluded from percentage-effect base', () => {
  it('a lone Temporary HP bonus is still a flat +20 (regression guard)', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [temporaryHpFeat] },
      l10(['Inspire Greatness']),
    )
    expect(stats.total('hp')).toBe(120)
  })

  it('Temporary HP is not itself scaled and does not inflate the % base', () => {
    const stats = computeBuildStats(
      {
        ...emptyInput(),
        allClasses: [fighterClass],
        allFeats: [temporaryHpFeat, hpPercentFeat],
      },
      l10(['Inspire Greatness', 'Frenzy HP']),
    )
    // V2: base for % purposes excludes the +20 Temporary → base = 100.
    // +25% of 100 = 25 (percentage-scaled). Temporary +20 added back flatly.
    // Total = 100 + 25 + 20 = 145.
    // Bug (V3 before fix): base = 100 + 20 = 120; +25% of 120 = 30 (trunc);
    // total = 100 + 20 + 30 = 150.
    expect(stats.total('hp')).toBe(145)
  })
})
