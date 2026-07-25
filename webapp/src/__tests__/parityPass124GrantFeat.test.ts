/**
 * Parity pass 124 — GrantFeat no longer re-applies the granted feat's own
 * stat effects.
 *
 * V2 source: Build::ApplyEnhancementEffects / ApplyItemEffects notify a
 * GrantFeat effect only to the breakdowns registered for Effect_GrantFeat
 * (verified directly in the compiled source) — that is CGrantedFeatsPane
 * (OnInitialUpdate: `RegisterBuildCallbackEffect(Effect_GrantFeat, this)`,
 * used only to track names for the Granted Feats panel / feat-prerequisite
 * checks) and a narrow BreakdownItemPRR re-derive trigger
 * (EnhancementEffectApplied/Revoked: `if (effect.IsType(Effect_GrantFeat))
 * CreateOtherEffects()`). No breakdown calls Build::ApplyFeatEffects for a
 * GrantFeat-sourced feat — that path is reached only via
 * TrainFeat/AutomaticFeats/TrainSpecialFeat (Build.cpp:2683 ApplyFeatEffects
 * callers).
 *
 * V3 gap (before this fix): a post-pass in buildStatMap (added by #59)
 * looked up every `grantedFeat.<Name>` marker and called `accumulateFeat`,
 * re-applying the granted feat's *own* Effect list. This over-applies any
 * granted feat whose effects are gated on a Stance requirement the build
 * happens to satisfy — e.g. Fury of the Wild's "I'm Always Angry" grants
 * the Barbarian "Rage" feat outright (GrantFeat, no stance check on the
 * grant itself), but Rage's AbilityBonus/SaveBonus/ACBonus effects are each
 * gated on `Requirement Stance=Rage`. A real user build (oracle corpus)
 * with a non-Barbarian archetype that trained "I'm Always Angry" and
 * toggled the Rage stance got a phantom +4 STR / +4 CON from this path
 * that V2 (verified against the compiled oracle, v2calc) never applies —
 * closing ability.CON / saveFortitude / saveWill oracle mismatches
 * entirely and reducing ability.STR / prr / mrr / rangedPower mismatches
 * across the corpus.
 *
 * Fix: buildStatMap no longer feeds `grantedFeat.*` markers back through
 * accumulateFeat. `grantedFeatsList` (BuildStats, since #60) still reports
 * the granted feat's name for display/prerequisite parity — only the
 * stat-effect re-application is removed.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree, Race,
} from '../types/ddo'

const barbarianClass: DDOClass = {
  Name: 'Barbarian', HitPoints: 12, Fortitude: 'Type1', Reflex: 'Type2',
  Will: 'Type2', BAB: '1 2 3 4 5',
} as unknown as DDOClass

// Mirrors the real Barbarian.class.xml "Rage" feat: a Stance-gated
// AbilityBonus effect, granted automatically to Barbarians but also
// reachable via GrantFeat from other trees (e.g. Fury of the Wild).
const rageFeat: Feat = {
  Name: 'Rage',
  Effect: {
    Type: 'AbilityBonus',
    Bonus: 'Rage',
    Item: ['Strength', 'Constitution'],
    AType: 'Stacks',
    Amount: 4,
    Requirements: {
      Requirement: { Type: 'Stance', Item: 'Rage' },
    },
  },
} as unknown as Feat

// A non-Barbarian destiny tree item that grants the Rage feat outright
// (mirrors Fury of the Wild: "I'm Always Angry").
const furyTree: EnhancementTree = {
  Name: 'Fury of the Wild',
  EnhancementTreeItem: [
    {
      Name: "I'm Always Angry",
      Ranks: 1,
      CostPerRank: '1',
      Effect: {
        Type: 'GrantFeat',
        Bonus: 'Destiny',
        AType: 'NotNeeded',
        Item: 'Rage',
      },
    },
  ],
} as unknown as EnhancementTree

function baseInput(): BuildStatsInput {
  return {
    allRaces: [] as Race[],
    allClasses: [barbarianClass],
    allFeats: [rageFeat],
    allTrees: [furyTree],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

function nonBarbarianBuild(rageActive: boolean, grantRage: boolean) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Sacred Fist', levels: 5 }],
    levelClasses: ['Sacred Fist', 'Sacred Fist', 'Sacred Fist', 'Sacred Fist', 'Sacred Fist'],
    totalLevel: 5,
    baseAbilities: { Strength: 16, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 10 },
    featChoices: {},
    enhancementChoices: grantRage ? { 'Fury of the Wild': { "I'm Always Angry": 1 } } : {},
    activeBuffs: rageActive ? ['Rage'] : [],
  }
}

describe('GrantFeat no longer applies the granted feat\'s stat effects (pass 124)', () => {
  it('grants the feat name (grantedFeatsList) even though its effects are stance-gated', () => {
    const stats = computeBuildStats(baseInput(), nonBarbarianBuild(true, true))
    expect(stats.grantedFeatsList).toContain('Rage')
  })

  it('does NOT add the granted Rage feat\'s +4 STR/+4 CON when the Rage stance is active', () => {
    const withRage = computeBuildStats(baseInput(), nonBarbarianBuild(true, true))
    const withoutFury = computeBuildStats(baseInput(), nonBarbarianBuild(true, false))
    expect(withRage.total('ability.Strength')).toBe(withoutFury.total('ability.Strength'))
    expect(withRage.total('ability.Constitution')).toBe(withoutFury.total('ability.Constitution'))
  })

  it('does NOT add the granted Rage feat\'s effects when the Rage stance is inactive either', () => {
    const stats = computeBuildStats(baseInput(), nonBarbarianBuild(false, true))
    const baseline = computeBuildStats(baseInput(), nonBarbarianBuild(false, false))
    expect(stats.total('ability.Strength')).toBe(baseline.total('ability.Strength'))
    expect(stats.total('ability.Constitution')).toBe(baseline.total('ability.Constitution'))
  })
})
