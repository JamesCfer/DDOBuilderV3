/**
 * Parity pass 120 — three hitpoints root causes from the V2↔V3 per-effect
 * reconciliation (YingsMonk −195 base / YingsMonkU73 +636 / Maetrim +505 /
 * Bardbox +422 all reconciled to 0 residual; the percent engine itself
 * proved exact — every diff was in the flat base the percents amplify):
 *
 * A. Favor Reward feats (build.favorFeats) were parsed for eligibility/AP
 *    but their EFFECTS were never applied — V2 Build::SpecialFeats()
 *    (Build.cpp:1603-1609) merges FavorFeats into the applied-feat list
 *    ("House Deneith Favor Rewards" +5 HP at favor rank 2, etc.).
 * B. AType=TotalLevel never multiplied by rank — V2 Amount_TotalLevel is
 *    m_Amount[level-1] * m_stacks (Past Life ×3, Toughness retrains).
 * C. The Reaper HP bonus (hpReaperAP) applied unconditionally — V2
 *    BreakdownItemHitpoints.cpp:168-194 gates it on the "Reaper" stance
 *    being active (Requirement_Stance "Reaper").
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

// ---------------------------------------------------------------------------
// A — favor feats apply their effects
// ---------------------------------------------------------------------------

const favorFeat: Feat = {
  Name: 'Test Favor Rewards',
  Acquire: 'Favor',
  Effect: {
    Type: 'Hitpoints', Bonus: 'Feat', AType: 'Stacks', Amount: '0 5 10',
  },
} as unknown as Feat

describe('A — Favor Reward feat effects apply (V2 Build::SpecialFeats merges FavorFeats)', () => {
  it('two acquisitions resolve the rank-2 amount (+5 HP)', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      favorFeats: ['Test Favor Rewards', 'Test Favor Rewards'],
    }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: [favorFeat] } as BuildStatsInput, build)
    const bonus = stats.resolve('hp').bonuses.find(b => b.source.includes('Test Favor Rewards'))
    expect(bonus?.value).toBe(5)
  })

  it('no favor feats → no favor bonus rows', () => {
    const build = { ...makeEmptyBuild(), totalLevel: 20 }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: [favorFeat] } as BuildStatsInput, build)
    expect(stats.resolve('hp').bonuses.some(b => b.source.startsWith('Favor:'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// B — TotalLevel multiplies by rank
// ---------------------------------------------------------------------------

// Amount[i] = i+1, so the row that was read is directly visible in the value.
const LEVEL_TABLE = Array.from({ length: 40 }, (_, i) => i + 1).join(' ')

const primalStyleFeat: Feat = {
  Name: 'Past Life: Test Sphere',
  Effect: {
    Type: 'Hitpoints', Bonus: 'Unique', AType: 'TotalLevel', Amount: LEVEL_TABLE,
  },
} as unknown as Feat

describe('B — AType=TotalLevel scales by acquisition count (V2 Amount[level-1] × m_stacks)', () => {
  it('a ×3 past life at level 34 resolves Amount[33] × 3 = 102', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20, epicLevels: 10, legendaryLevels: 4,
      pastLives: { 'Test Sphere': 3 },
    }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: [primalStyleFeat] } as BuildStatsInput, build)
    const bonus = stats.resolve('hp').bonuses.find(b => b.source.includes('Test Sphere'))
    expect(bonus?.value).toBe(34 * 3)
  })

  it('a single acquisition stays at Amount[33] × 1', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20, epicLevels: 10, legendaryLevels: 4,
      pastLives: { 'Test Sphere': 1 },
    }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: [primalStyleFeat] } as BuildStatsInput, build)
    const bonus = stats.resolve('hp').bonuses.find(b => b.source.includes('Test Sphere'))
    expect(bonus?.value).toBe(34)
  })
})

// ---------------------------------------------------------------------------
// C — Reaper HP bonus gated on the Reaper stance
// ---------------------------------------------------------------------------

const reaperTree: EnhancementTree = {
  Name: 'Test Reaper Tree',
  IsReaperTree: true,
  EnhancementTreeItem: [{
    Name: 'Reaper Vitality', InternalName: 'ReaperVitality', Ranks: 1,
    Effect: { Type: 'HitpointsReaper', Bonus: 'Reaper', AType: 'APCount', Amount: '5' },
  }],
} as unknown as EnhancementTree

function reaperBuild(activeBuffs: string[]) {
  return {
    ...makeEmptyBuild(),
    totalLevel: 20, epicLevels: 10, legendaryLevels: 4,
    reaperChoices: { 'Test Reaper Tree': { ReaperVitality: 1 } },
    activeBuffs,
  }
}

describe('C — Reaper HP applies only in Reaper mode (V2 BreakdownItemHitpoints.cpp:168-194)', () => {
  it('no Reaper stance → no Reaper Bonus HP row', () => {
    const stats = computeBuildStats({ ...emptyInput(), allTrees: [reaperTree] } as BuildStatsInput, reaperBuild([]))
    expect(stats.resolve('hp').bonuses.some(b => b.source.startsWith('Reaper Bonus'))).toBe(false)
  })

  it('Reaper stance active → Reaper Bonus HP row present', () => {
    const stats = computeBuildStats({ ...emptyInput(), allTrees: [reaperTree] } as BuildStatsInput, reaperBuild(['Reaper']))
    const bonus = stats.resolve('hp').bonuses.find(b => b.source.startsWith('Reaper Bonus'))
    expect(bonus).toBeTruthy()
    expect(bonus!.value).toBeGreaterThan(0)
  })
})
