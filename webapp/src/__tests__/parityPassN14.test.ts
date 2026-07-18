/**
 * Parity pass N14 — the universal "Attack" feat's base off-hand attack
 * chance was never applied (Feats.xml: the "Attack" feat, which every
 * character receives automatically at level 1, carries an unconditional
 * `<Effect><Type>OffHandAttackBonus</Type><Bonus>Feat</Bonus><Amount>20</Amount>`
 * — "Standard off hand attack chance").
 *
 * `useBuildStats`/`buildStats.ts` already models two of this same feat's
 * other unconditional base effects (+50% helpless damage, +20%
 * strikethrough — see Done item #52) but never added this third one, so
 * `offhand.attack` was always 0 unless some other effect (TWF-style feats,
 * dual-wield enhancements) happened to add to it. V2's golden-build export
 * for `exampledps.DDOBuild` shows Off Hand Attack Chance = 20 even though
 * none of that build's trained feats/enhancements grant `OffHandAttackBonus`
 * — it is purely this base value.
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

describe('Attack feat base off-hand attack chance (V2 Feats.xml "Standard off hand attack chance")', () => {
  it('applies unconditionally, even with no trained feats/enhancements', () => {
    const stats = computeBuildStats(emptyInput(), makeEmptyBuild())
    expect(stats.total('offhand.attack')).toBe(20)
  })

  it('stacks with feat-granted off-hand attack bonuses (e.g. Two Weapon Fighting)', () => {
    const fighterClass = {
      Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
      Will: 'Type1', BAB: '1',
    } as unknown as DDOClass
    const twfFeat = {
      Name: 'Two Weapon Fighting', Acquire: 'Train',
      Effect: { Type: 'OffHandAttackBonus', Bonus: 'Feat', AType: 'Simple', Amount: '20' },
    } as unknown as Feat
    const build = {
      ...makeEmptyBuild(),
      classes: [{ name: 'Fighter', levels: 10 }],
      levelClasses: Array.from({ length: 10 }, () => 'Fighter'),
      totalLevel: 10,
      baseAbilities: {
        Strength: 10, Dexterity: 10, Constitution: 10,
        Intelligence: 10, Wisdom: 10, Charisma: 10,
      },
      featChoices: { '1': 'Two Weapon Fighting' },
    }
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [twfFeat] },
      build,
    )
    // Base 20 (Attack feat) + 20 (Two Weapon Fighting) = 40.
    expect(stats.total('offhand.attack')).toBe(40)
  })
})
