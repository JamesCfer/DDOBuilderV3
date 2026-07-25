/**
 * Parity pass 123 — stale trained-spell carry-over:
 *
 * V2 Build::ApplySpellEffects (Build.cpp:2373-2385) — "we need to ignore
 * this spell if it is a carry over from a class change" — only applies a
 * trained spell's effects if its class still has the levels/slots for it.
 * V3 applied every build.trainedSpells entry unconditionally, so a stale
 * Wizard-life "Tenser's Transformation" (+4 Alchemical STR/DEX/CON) kept
 * buffing a 0-Wizard build (real corpus: Warlocks.DDOBuild −4/−4/−4,
 * highest Number possible.DDOBuild via Druid "Animal Growth").
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment, Spell,
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

const wizard: DDOClass = { Name: 'Wizard', HitPoints: 4 } as unknown as DDOClass

const tensers: Spell = {
  Name: "Tenser's Transformation",
  Effect: [
    { Type: 'AbilityBonus', Bonus: 'Alchemical', AType: 'Simple', Amount: 4, Item: 'Strength' },
  ],
} as unknown as Spell

describe('stale trained spells from a 0-level class do not apply (V2 Build::ApplySpellEffects carry-over guard)', () => {
  it('0 Wizard levels → no Tenser contribution', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      classes: [{ name: 'Fighter', levels: 20 }],
      trainedSpells: { Wizard: { 6: ["Tenser's Transformation"] } },
    }
    const stats = computeBuildStats({
      ...emptyInput(), allClasses: [wizard], allSpells: [tensers],
    } as BuildStatsInput, build)
    expect(stats.resolve('ability.Strength').bonuses.some(b => b.source.includes('Tenser'))).toBe(false)
  })

  it('with Wizard levels the spell still applies', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      classes: [{ name: 'Wizard', levels: 20 }],
      levelClasses: Array.from({ length: 20 }, () => 'Wizard'),
      trainedSpells: { Wizard: { 6: ["Tenser's Transformation"] } },
    }
    const stats = computeBuildStats({
      ...emptyInput(), allClasses: [wizard], allSpells: [tensers],
    } as BuildStatsInput, build)
    expect(stats.resolve('ability.Strength').bonuses.some(b => b.source.includes('Tenser'))).toBe(true)
  })
})
