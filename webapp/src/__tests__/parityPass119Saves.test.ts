/**
 * Parity pass 119 — four save-affecting root causes found by reconciling
 * V2's per-effect AllActiveEffects() dump against V3's resolve('save.*')
 * bonus lists on Maetrim (−7 uniform), Bardbox (+3 uniform) and
 * "15 second burn" (Reflex −1):
 *
 * A. Feat-sourced AType=TotalLevel effects indexed by heroic-only
 *    build.totalLevel (≤20) instead of the full character level —
 *    V2 Effect.cpp Amount_TotalLevel uses m_pBuild->Level() (heroic+epic+
 *    legendary). Same bug class as the #159 guild-buff fix.
 * B. The AType=Stacks stack-merge collapsed SINGLE-source ranked effects to
 *    Amount[0], discarding the rank-correct getAmountAtRank value (V2
 *    reaches Amount[rank-1] by replaying one AddEffect per trained rank —
 *    BreakdownItem.cpp:818-836). Only cross-source duplicates merge.
 * C. Two-Item Enhancement requirements (tree item + required selector
 *    option) evaluated as OR-membership; V2 Requirement.cpp:839-855 is
 *    IsTrained(Item[0], Item[1]) — an AND on the chosen option.
 * D. AType=SliderValue read the slider name from Item (the effect TARGET,
 *    e.g. "Reflex") instead of StackSource (the slider name) — Arcane
 *    Trickster "Slippery Magic" resolved 0.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import { meetsSingleRequirement, type RequirementContext } from '../lib/requirements'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment, Effect, Requirement,
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

function baseCtx(): EffectContext {
  return {
    race: 'Human',
    alignment: 'True Neutral',
    classLevels: {},
    baseClassLevels: {},
    totalLevel: 20,
    feats: new Set(),
    enhancements: new Set(),
    abilityTotals: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    stances: new Set(),
    bab: 0,
    weaponTypes: new Set(),
  }
}

// ---------------------------------------------------------------------------
// A — feat AType=TotalLevel uses the FULL character level
// ---------------------------------------------------------------------------

// Amount[i] = i+1, so the resolved value directly names the row that was read.
const LEVEL_TABLE = Array.from({ length: 40 }, (_, i) => i + 1).join(' ')

const tlFeat: Feat = {
  Name: 'TL Save Feat',
  Effect: {
    Type: 'SaveBonus', Bonus: 'Insightful', AType: 'TotalLevel',
    Amount: LEVEL_TABLE, Item: 'Fortitude',
  },
} as unknown as Feat

describe('A — feat AType=TotalLevel indexes by heroic+epic+legendary level (V2 Effect.cpp Amount_TotalLevel)', () => {
  it('a level-34 character (20+10+4) reads Amount[33], not Amount[19]', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20, epicLevels: 10, legendaryLevels: 4,
      featChoices: { 'Standard-1': 'TL Save Feat' },
    }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: [tlFeat] } as BuildStatsInput, build)
    const bonus = stats.resolve('save.Fort').bonuses.find(b => b.source.includes('TL Save Feat'))
    expect(bonus?.value).toBe(34)
  })

  it('a heroic level-20 character still reads Amount[19]', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20, epicLevels: 0, legendaryLevels: 0,
      featChoices: { 'Standard-1': 'TL Save Feat' },
    }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: [tlFeat] } as BuildStatsInput, build)
    const bonus = stats.resolve('save.Fort').bonuses.find(b => b.source.includes('TL Save Feat'))
    expect(bonus?.value).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// B — singleton ranked AType=Stacks effects keep their rank-resolved value
// ---------------------------------------------------------------------------

function tieredEffect(): Effect {
  return {
    Type: 'SaveBonus', Bonus: 'Enhancement', AType: 'Stacks',
    Amount: '1 2 3', Item: 'Will', DisplayName: 'Tiered Test Bonus',
  } as unknown as Effect
}

const tieredTree: EnhancementTree = {
  Name: 'Test Tree',
  EnhancementTreeItem: [
    { Name: 'Tiered Item', InternalName: 'TieredItem', Ranks: 3, Effect: tieredEffect() },
    { Name: 'Stance A', InternalName: 'StanceA', Ranks: 1, Effect: tieredEffect() },
    { Name: 'Stance B', InternalName: 'StanceB', Ranks: 1, Effect: tieredEffect() },
  ],
} as unknown as EnhancementTree

describe('B — AType=Stacks merge only collapses genuine multi-source groups (V2 BreakdownItem::AddEffect)', () => {
  it('a single item trained to rank 3 resolves Amount[2] (=3), not Amount[0]', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      enhancementChoices: { 'Test Tree': { 'Tiered Item': 3 } },
    }
    const stats = computeBuildStats({ ...emptyInput(), allTrees: [tieredTree] } as BuildStatsInput, build)
    const bonuses = stats.resolve('save.Will').bonuses.filter(b => b.source.includes('Tiered Item'))
    expect(bonuses).toHaveLength(1)
    expect(bonuses[0].value).toBe(3)
  })

  it('two rank-1 sources sharing a DisplayName still merge to Amount[1] (=2)', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      enhancementChoices: { 'Test Tree': { 'Stance A': 1, 'Stance B': 1 } },
    }
    const stats = computeBuildStats({ ...emptyInput(), allTrees: [tieredTree] } as BuildStatsInput, build)
    const merged = stats.resolve('save.Will').bonuses.filter(b => b.source.includes('Stance'))
    expect(merged).toHaveLength(1)
    expect(merged[0].value).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// C — two-Item Enhancement requirements demand the specific selector option
// ---------------------------------------------------------------------------

describe('C — two-Item Enhancement requirement = trained AND selected (V2 Requirement.cpp:839-855)', () => {
  const gated: Effect = {
    Type: 'SaveBonus', Bonus: 'Legendary', AType: 'Simple', Amount: 3, Item: 'All',
    Requirements: {
      Requirement: { Type: 'Enhancement', Item: ['MachroStrikeDrive', 'Blast Drive'] },
    },
  } as unknown as Effect

  it('fires when the required option is the one selected', () => {
    const ctx = baseCtx()
    ctx.enhancements = new Set(['MachroStrikeDrive'])
    ctx.enhancementSelections = { MachroStrikeDrive: 'Blast Drive' }
    expect(parseEffect(gated, 1, 'Test', 0, 0, ctx).length).toBeGreaterThan(0)
  })

  it('does NOT fire when a different option is selected', () => {
    const ctx = baseCtx()
    ctx.enhancements = new Set(['MachroStrikeDrive'])
    ctx.enhancementSelections = { MachroStrikeDrive: 'Dissonance Drive' }
    expect(parseEffect(gated, 1, 'Test', 0, 0, ctx)).toHaveLength(0)
  })

  it('meetsSingleRequirement honors the selector option too', () => {
    const req = { Type: 'Enhancement', Item: ['MachroStrikeDrive', 'Blast Drive'] } as unknown as Requirement
    const mk = (selection: string) => ({
      build: {
        ...makeEmptyBuild(),
        enhancementChoices: { 'Machrotechnic': { MachroStrikeDrive: 1 } },
        enhancementSelections: { 'Machrotechnic': { MachroStrikeDrive: selection } },
      },
      allClasses: [],
    }) as unknown as RequirementContext
    expect(meetsSingleRequirement(req, mk('Blast Drive'))).toBe(true)
    expect(meetsSingleRequirement(req, mk('Ruin Drive'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// D — SliderValue reads the slider name from StackSource
// ---------------------------------------------------------------------------

describe('D — AType=SliderValue keys the slider by StackSource, not Item', () => {
  it('Slippery Magic-style effect (StackSource=slider, Item=save target) resolves base × slider value', () => {
    const eff: Effect = {
      Type: 'SaveBonus', Bonus: 'Enhancement', AType: 'SliderValue',
      Amount: 1, Item: 'Reflex', StackSource: 'Slippery Magic',
    } as unknown as Effect
    const ctx = baseCtx()
    ctx.sliderValues = { 'Slippery Magic': 3 }
    const parsed = parseEffect(eff, 1, 'Test', 0, 0, ctx)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].statKey).toBe('save.Reflex')
    expect(parsed[0].value).toBe(3)
  })

  it('falls back to Item when no StackSource is present', () => {
    const eff: Effect = {
      Type: 'DodgeBonus', Bonus: 'Enhancement', AType: 'SliderValue',
      Amount: 2, Item: 'My Slider',
    } as unknown as Effect
    const ctx = baseCtx()
    ctx.sliderValues = { 'My Slider': 2 }
    const parsed = parseEffect(eff, 1, 'Test', 0, 0, ctx)
    expect(parsed[0]?.value).toBe(4)
  })
})
