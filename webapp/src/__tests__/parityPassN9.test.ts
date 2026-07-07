/**
 * Parity pass N9 — Life.specialFeats (V2 Type="Special" acquired feats, e.g.
 * Chrism reincarnation-cache redemptions: Inherent Melee/Ranged Power,
 * Inherent MRR/PRR, Inherent Universal Spell Power, Inherent Fate Point,
 * Inherent RAP/UAP Bonus) were imported into `Life.specialFeats` but never
 * fed into either the stat engine (`useBuildStats`/`computeBuildStats`) or
 * the enhancement AP budget (`computeBonusActionPoints`/`enhancementAPBudget`)
 * — both previously took only `CharacterBuild`, never the owning `Life`.
 *
 * V2 source: Life::AllSpecialFeats (Life.cpp:694-698) feeds these feats
 * through the normal per-feat effect-application path plus the AP-bonus scan
 * (CountBonusRacialAP/CountBonusUniversalAP, Life.cpp:720-820).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'
import { computeBonusActionPoints, enhancementAPBudget } from '../lib/actionPoints'

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1 1',
} as unknown as DDOClass

// Real Feats.xml shape (Feats.xml:10176-10188 / :10295-10307): Chrism
// reincarnation-cache feats — flat AType=Simple bonus, trainable multiple
// times (MaxTimesAcquire), and an AP-bonus feat gated by Rank.
const inherentMeleePower: Feat = {
  Name: 'Inherent Melee Power', Acquire: 'Special',
  Effect: { Type: 'MeleePower', Bonus: 'Inherent', AType: 'Simple', Amount: '1' },
} as unknown as Feat

const inherentUniversalActionPoint: Feat = {
  Name: 'Inherent Universal Action Point', Acquire: 'Special',
  Effect: { Type: 'UAPBonus', Bonus: 'Feat', AType: 'Stacks', Amount: '1 2 3 4 5 6 7 8 9 10' },
} as unknown as Feat

const allFeats = [inherentMeleePower, inherentUniversalActionPoint]

function input(specialFeats?: string[]): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [fighterClass],
    allFeats,
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
    specialFeats,
  }
}

function build() {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 2 }],
    levelClasses: ['Fighter', 'Fighter'],
    totalLevel: 2,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
  }
}

describe('N9 — Life.specialFeats applied to stats + AP budget', () => {
  it('with no specialFeats, nothing changes (pre-fix behaviour preserved)', () => {
    const stats = computeBuildStats(input(), build())
    expect(stats.total('melee.power')).toBe(0)
  })

  it('applies a Life-level Special feat\'s stat effect', () => {
    const stats = computeBuildStats(input(['Inherent Melee Power']), build())
    expect(stats.total('melee.power')).toBe(1)
  })

  it('counts repeated redemptions of the same Special feat (up to +4 Chrisms)', () => {
    const stats = computeBuildStats(
      input(['Inherent Melee Power', 'Inherent Melee Power', 'Inherent Melee Power']),
      build(),
    )
    expect(stats.total('melee.power')).toBe(3)
  })

  it('computeBonusActionPoints folds Life.specialFeats into the UAP bonus (count-indexed amounts)', () => {
    const b = build()
    const bonus = computeBonusActionPoints(b, allFeats, [
      'Inherent Universal Action Point', 'Inherent Universal Action Point',
    ])
    expect(bonus.universal).toBe(2) // Amount[count-1] = Amount[1] = 2 (trained twice)
    expect(enhancementAPBudget(b, allFeats, [
      'Inherent Universal Action Point', 'Inherent Universal Action Point',
    ])).toBe(Math.min(20, b.totalLevel) * 4 + 2)
  })

  it('computeBonusActionPoints defaults specialFeats to empty (back-compat call signature)', () => {
    const b = build()
    expect(computeBonusActionPoints(b, allFeats)).toEqual({ racial: 0, universal: 0 })
  })
})
