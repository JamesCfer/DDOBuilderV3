/**
 * Parity pass 130 — `EnterValue` augments (e.g. "Mythic Power Boost", the
 * Mythic-slot augment granting Melee/Ranged/Universal Spell Power) store the
 * player-entered Mythic Bonus rank in the saved build's `ItemAugment::Value`
 * field, NOT in the augment's own catalogue `Amount` (which is always the
 * placeholder `1`). V2 `Build::ApplyAugment` (`Build.cpp:4948-4966`) replaces
 * EVERY effect's Amount with `itemAugment.Value()` whenever the augment has
 * `EnterValue` set — completely separate from the `ChooseLevel`/`LevelValue`
 * mechanic (which V3 already implemented).
 *
 * `webapp/src/lib/buildStats.ts`'s `accumulateAugments` had no handling for
 * `EnterValue` at all, so every EnterValue augment always contributed its
 * catalogue default (1) regardless of the player's actual entered value.
 *
 * Real-corpus symptom (oracleDiff.ts vs the compiled v2calc oracle):
 * "Maetrim_EndGameHandwrapsMonk.DDOBuild" equips three "Mythic Power Boost"
 * augments (Waistwrap Value=1, Dinosaur Bone Cloak Value=3, Karissa's
 * Goggles Value=1). V2's real Melee/Ranged Power include all three
 * (1+3+1=5); V3 summed 1+1+1=3, undercounting meleePower/rangedPower by
 * exactly 2 each (324->322, 200->198) — the corpus's last remaining
 * mismatch.
 *
 * Fix: `accumulateAugments` now accepts `augmentValueChoices` (populated by
 * `v2Import.ts` from the saved `<Value>` field) and, when the resolved
 * augment has `EnterValue`, replaces every effect's Amount with the stored
 * value before parsing — mirroring the existing ChooseLevel override path.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../lib/buildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, Feat, Race, Item, OptionalBuff, SetBonus, Augment, FiligreeSetBonus, Filigree } from '../types/ddo'

// Mirrors Mythic.Augments.xml "Mythic Power Boost": EnterValue, no
// ChooseLevel/DualValues, three simultaneous effects all sharing one Amount.
const mythicPowerBoost: Augment = {
  Name: 'Mythic Power Boost',
  Type: 'Mythic',
  EnterValue: '',
  Effect: [
    { Type: 'MeleePower', Bonus: 'Mythic', AType: 'Simple', Amount: 1 },
    { Type: 'RangedPower', Bonus: 'Mythic', AType: 'Simple', Amount: 1 },
  ],
} as unknown as Augment

function baseInput(): BuildStatsInput {
  return {
    allRaces: [] as Race[],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [mythicPowerBoost],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

describe('EnterValue augment override (pass 130)', () => {
  it('replaces every effect Amount with the stored player-entered Value', () => {
    const build = {
      ...makeEmptyBuild(),
      augmentChoices: { 'Cloak:Mythic:0': 'Mythic Power Boost' },
      augmentValueChoices: { 'Cloak:Mythic:0': 3 },
    }
    const stats = computeBuildStats(baseInput(), build)
    expect(stats.total('melee.power')).toBe(3)
    expect(stats.total('ranged.power')).toBe(3)
  })

  it('falls back to the catalogue Amount when no Value was recorded', () => {
    const build = {
      ...makeEmptyBuild(),
      augmentChoices: { 'Cloak:Mythic:0': 'Mythic Power Boost' },
      augmentValueChoices: {},
    }
    const stats = computeBuildStats(baseInput(), build)
    expect(stats.total('melee.power')).toBe(1)
    expect(stats.total('ranged.power')).toBe(1)
  })

  it('sums independently-entered values across multiple EnterValue augments (Mythic stacks Always)', () => {
    const build = {
      ...makeEmptyBuild(),
      augmentChoices: {
        'Cloak:Mythic:0': 'Mythic Power Boost',
        'Belt:Mythic:0': 'Mythic Power Boost',
        'Goggles:Mythic:0': 'Mythic Power Boost',
      },
      augmentValueChoices: {
        'Cloak:Mythic:0': 3,
        'Belt:Mythic:0': 1,
        'Goggles:Mythic:0': 1,
      },
    }
    const stats = computeBuildStats(baseInput(), build)
    // V2-exact Maetrim residue: 3 + 1 + 1 = 5, not 1 + 1 + 1 = 3.
    expect(stats.total('melee.power')).toBe(5)
    expect(stats.total('ranged.power')).toBe(5)
  })
})
