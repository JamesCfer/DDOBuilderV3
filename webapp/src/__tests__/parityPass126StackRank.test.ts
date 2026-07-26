/**
 * Parity pass 126 — cross-feat AType=Stacks merge sums RANKS, not sources.
 *
 * V2 Effect.cpp: Effect::operator== ignores Rank, and BreakdownItem::
 * AddEffect bumps m_stacks once per training APPLICATION — so m_stacks is
 * the running SUM of every sharing source's trained rank. Amount_Stacks
 * then indexes Amount[m_stacks-1]. V3's merge used the count of
 * contributing sources: 18 "Epic Past Life" FatePoint feats × rank 3
 * indexed Amount[17] (=6 fate points) instead of Amount[53] (=18) —
 * −24 HP direct (2 HP/fate point) plus percent-HP compounding on 16 of
 * 18 remaining HP-mismatch builds (Maetrim −35 reconciled to 0 exactly).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
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

// Two DIFFERENT past-life feats sharing an identical stacking FatePoint
// effect (the "Epic Past Life" pattern). Amount[i] = i+1 so the resolved
// value names the row that was read.
const TABLE = Array.from({ length: 54 }, (_, i) => i + 1).join(' ')

function epicPastLife(name: string): Feat {
  return {
    Name: `Past Life: ${name}`,
    Effect: {
      Type: 'FatePoint', Bonus: 'Unique', AType: 'Stacks',
      Amount: TABLE, DisplayName: 'Epic Past Life',
    },
  } as unknown as Feat
}

describe('cross-feat Stacks merge sums ranks (V2 m_stacks running total)', () => {
  it('two feats at rank 3 each → Amount[5] (=6), not Amount[1] (=2)', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      pastLives: { 'Sphere A': 3, 'Sphere B': 3 },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      allFeats: [epicPastLife('Sphere A'), epicPastLife('Sphere B')],
    } as BuildStatsInput, build)
    expect(stats.total('fatePoint')).toBe(6)
  })

  it('a single feat at rank 3 still resolves Amount[2] (=3) — pass-119 behavior preserved', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      pastLives: { 'Sphere A': 3 },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      allFeats: [epicPastLife('Sphere A')],
    } as BuildStatsInput, build)
    expect(stats.total('fatePoint')).toBe(3)
  })

  it('rank sums clamp at the table end', () => {
    const feats = Array.from({ length: 20 }, (_, i) => epicPastLife(`Sphere ${i}`))
    const pastLives = Object.fromEntries(feats.map((f, i) => [`Sphere ${i}`, 3]))
    const build = { ...makeEmptyBuild(), totalLevel: 20, pastLives }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: feats } as BuildStatsInput, build)
    // 20 × 3 = 60 applications, table has 54 rows → Amount[53] = 54.
    expect(stats.total('fatePoint')).toBe(54)
  })
})
