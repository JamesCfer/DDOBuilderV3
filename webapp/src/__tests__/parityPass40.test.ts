/**
 * Parity pass 40 — two breakdown gaps found in the BreakdownItem* sweep.
 *
 *  BAB override (BreakdownItemBAB.cpp:43-55) — an `OverrideBAB` effect boosts
 *  BAB up to the character level (capped at MAX_BAB = 25). V3 parsed the effect
 *  into `babOverride` but never applied it, so the boost was silently lost.
 *
 *  Maximum Ki (BreakdownItemMaximumKi.cpp:31-58) — Max Ki = base 40 + WIS mod
 *  × 5 (plus KiMaximum effects). V3 surfaced only the effect-sourced ki.max and
 *  omitted the base + WIS contribution entirely.
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

// Poor-BAB class: BAB[level] table = 0 0 1 1 2 2 (index 0..5).
const poorBabClass = {
  Name: 'Wizard', HitPoints: 6, Fortitude: 'Type1', Reflex: 'Type1',
  Will: 'Type2', BAB: '0 0 1 1 2 2',
} as unknown as DDOClass

function build(overrides: Partial<ReturnType<typeof makeEmptyBuild>> = {}) {
  return {
    ...makeEmptyBuild(),
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    ...overrides,
  }
}

describe('BAB override boosts BAB to character level (max 25)', () => {
  const overrideFeat = {
    Name: 'Tenser-like', Acquire: 'Train',
    Effect: { Type: 'OverrideBAB', Bonus: 'Stacking', Amount: '1', AType: 'Stacks' },
  } as unknown as Feat

  const fiveWizard = ['Wizard', 'Wizard', 'Wizard', 'Wizard', 'Wizard']

  it('without the override, BAB is the (poor) class BAB', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [poorBabClass] },
      build({ classes: [{ name: 'Wizard', levels: 5 }], levelClasses: fiveWizard, totalLevel: 5 }),
    )
    // BAB table[5] = 2
    expect(stats.total('bab')).toBe(2)
  })

  it('with the override, BAB is boosted to the character level', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [poorBabClass], allFeats: [overrideFeat] },
      build({
        classes: [{ name: 'Wizard', levels: 5 }],
        levelClasses: fiveWizard,
        totalLevel: 5,
        // The boost target is the FULL character level (V2 Build::Level());
        // emptyBuild() defaults epic 10 / legendary 4, so zero them for a
        // genuine level-5 scenario.
        epicLevels: 0,
        legendaryLevels: 0,
        featChoices: { '1': 'Tenser-like' },
      }),
    )
    // boosted from 2 → min(25, 5) = 5
    expect(stats.total('bab')).toBe(5)
  })
})

describe('Maximum Ki = base 40 + WIS mod × 5', () => {
  it('base 40 with no WIS bonus', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [poorBabClass] },
      build({ classes: [{ name: 'Wizard', levels: 1 }], levelClasses: ['Wizard'], totalLevel: 1 }),
    )
    expect(stats.total('ki.max')).toBe(40)
  })

  it('adds WIS mod × 5', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [poorBabClass] },
      build({
        classes: [{ name: 'Wizard', levels: 1 }],
        levelClasses: ['Wizard'],
        totalLevel: 1,
        baseAbilities: {
          Strength: 10, Dexterity: 10, Constitution: 10,
          Intelligence: 10, Wisdom: 16, Charisma: 10,
        },
      }),
    )
    // 40 + (mod +3) × 5 = 55
    expect(stats.total('ki.max')).toBe(55)
  })
})
