/**
 * Parity pass 32 — Eldritch blast dice scaling (repeated auto-feat stacking)
 *
 * V2 parity source: DDOBuilder/BreakdownItemPactDice.cpp + BreakdownItem.cpp
 *   V2 stores feat effects in m_effects which is summed without bonus-type
 *   stacking rules (RemoveNonStacking is only called on m_itemEffects).
 *   The result: every EldritchBlastD8/D6 grant from repeated AutomaticFeats
 *   (e.g. "Warlock: Eldritch Blast Damage" ×5 at L4/8/12/16/20) all count.
 *
 * V3 bug: accumulateFeat is called once per AutomaticFeats entry, each
 * contributing {value:1, bonusType:'Feat'} to eldritchBlast.d8. Because 'Feat'
 * is "Highest Only" in BonusTypes.xml, all 5 copies collapse to 1d8 instead
 * of stacking to 5d8. Same issue for "Pact Damage" (×10, eldritchBlast.d6).
 *
 * Expected V2-parity values for a L20 pure Warlock:
 *   eldritchBlast.d8 = 6  (1 from Focused at L1 + 5 from Damage at L4/8/12/16/20)
 *   eldritchBlast.d6 = 10 (Pact Damage at L2/4/6/8/10/12/14/16/18/20)
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree, Item, OptionalBuff, SetBonus, Augment } from '../types/ddo'

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

// ---------------------------------------------------------------------------
// Minimal Warlock class fixture
// ---------------------------------------------------------------------------

const warlockClass: DDOClass = {
  Name: 'Warlock',
  HitPoints: 6,
  AutomaticFeats: [
    // Level 1: 1d8 base
    { Level: 1,  Feats: ['Warlock: Eldritch Blast Focused'] },
    // Level 2, 4, 6, 8, 10, 12, 14, 16, 18, 20: each +1d6 pact damage
    { Level: 2,  Feats: 'Pact Damage' },
    { Level: 4,  Feats: ['Pact Damage', 'Warlock: Eldritch Blast Damage'] },
    { Level: 6,  Feats: 'Pact Damage' },
    { Level: 8,  Feats: ['Pact Damage', 'Warlock: Eldritch Blast Damage'] },
    { Level: 10, Feats: 'Pact Damage' },
    { Level: 12, Feats: ['Pact Damage', 'Warlock: Eldritch Blast Damage'] },
    { Level: 14, Feats: 'Pact Damage' },
    { Level: 16, Feats: ['Pact Damage', 'Warlock: Eldritch Blast Damage'] },
    { Level: 18, Feats: 'Pact Damage' },
    { Level: 20, Feats: ['Pact Damage', 'Warlock: Eldritch Blast Damage'] },
  ],
}

const eldritchBlastFocusedFeat: Feat = {
  Name: 'Warlock: Eldritch Blast Focused',
  Effect: {
    Type: 'EldritchBlastD8',
    Bonus: 'Feat',
    AType: 'Simple',
    Amount: '1',
  },
} as unknown as Feat

const eldritchBlastDamageFeat: Feat = {
  Name: 'Warlock: Eldritch Blast Damage',
  MaxTimesAcquire: 5,  // real Warlock.class.xml value; V2 default is 1
  Effect: {
    Type: 'EldritchBlastD8',
    Bonus: 'Feat',
    AType: 'Simple',
    Amount: '1',
  },
} as unknown as Feat

const pactDamageFeat: Feat = {
  Name: 'Pact Damage',
  MaxTimesAcquire: 10,  // real Warlock.class.xml value; V2 default is 1
  Effect: {
    Type: 'EldritchBlastD6',
    Bonus: 'Feat',
    AType: 'Simple',
    Amount: '1',
  },
} as unknown as Feat

const allFeats = [eldritchBlastFocusedFeat, eldritchBlastDamageFeat, pactDamageFeat]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Eldritch blast dice scaling — repeated auto-feat stacking (V2 parity)', () => {
  it('L20 Warlock: eldritchBlast.d8 = 6 (1 Focused + 5 Damage grants)', () => {
    const build = {
      ...makeEmptyBuild(),
      classes: [
        { name: 'Warlock', levels: 20 },
        { name: '', levels: 0 },
        { name: '', levels: 0 },
      ],
      totalLevel: 20,
    }

    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [warlockClass], allFeats },
      build,
    )

    // V2: m_effects are summed without stacking rules → 1 + 5 = 6d8
    expect(stats.total('eldritchBlast.d8')).toBe(6)
  })

  it('L20 Warlock: eldritchBlast.d6 = 10 (Pact Damage granted every even level)', () => {
    const build = {
      ...makeEmptyBuild(),
      classes: [
        { name: 'Warlock', levels: 20 },
        { name: '', levels: 0 },
        { name: '', levels: 0 },
      ],
      totalLevel: 20,
    }

    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [warlockClass], allFeats },
      build,
    )

    // V2: Pact Damage fires 10 times → 10d6
    expect(stats.total('eldritchBlast.d6')).toBe(10)
  })

  it('L8 Warlock: eldritchBlast.d8 = 3 (1 Focused + 2 Damage grants at L4 and L8)', () => {
    const build = {
      ...makeEmptyBuild(),
      classes: [
        { name: 'Warlock', levels: 8 },
        { name: '', levels: 0 },
        { name: '', levels: 0 },
      ],
      totalLevel: 8,
    }

    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [warlockClass], allFeats },
      build,
    )

    // Level 1: Focused (+1d8), Level 4: Damage (+1d8), Level 8: Damage (+1d8) → 3d8 total
    expect(stats.total('eldritchBlast.d8')).toBe(3)
  })

  it('L8 Warlock: eldritchBlast.d6 = 4 (Pact Damage at L2, L4, L6, L8)', () => {
    const build = {
      ...makeEmptyBuild(),
      classes: [
        { name: 'Warlock', levels: 8 },
        { name: '', levels: 0 },
        { name: '', levels: 0 },
      ],
      totalLevel: 8,
    }

    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [warlockClass], allFeats },
      build,
    )

    expect(stats.total('eldritchBlast.d6')).toBe(4)
  })
})
