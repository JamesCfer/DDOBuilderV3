/**
 * Parity pass 59 — GrantFeat effects: apply the granted feat's stat effects.
 *
 * V2 source: Build::ApplyFeatEffects / RevokeFeatEffects (Build.cpp)
 *   When any source (enhancement, item, augment) grants a feat via
 *   Effect_GrantFeat, V2 looks up the feat and applies all of its effects to
 *   the build. V3 previously returned [] for every GrantFeat effect, so the
 *   granted feat's stat contributions were silently dropped.
 *
 * Concrete example: Bard Spellsinger tree — "Magical Studies" (selector option)
 *   rank 3 grants "Magical Training" via GrantFeat (<Rank>3</Rank>).
 *   "Magical Training" has two effects:
 *     • SpellPoints +80 (Feat bonus)
 *     • SpellLore (5% spell crit — SpellCritChance)
 *   At rank 1 or 2 the GrantFeat does NOT fire (rank < 3); at rank 3 it does.
 *
 * Without the fix: spellPoints total from "Magical Studies" rank 3 = 100
 *   (just the SpellPoints Enhancement effect at rank 3) — missing the +80 Feat.
 * With the fix: spellPoints total = 180 (100 Enhancement + 80 Feat).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const bardClass: DDOClass = {
  Name: 'Bard', HitPoints: 6, Fortitude: 'Type1', Reflex: 'Type2',
  Will: 'Type2', BAB: '0 1 1 2 2 3',
} as unknown as DDOClass

/** Magical Training feat: +80 SP (Feat bonus) + 5% Universal spell crit */
const magicalTrainingFeat: Feat = {
  Name: 'Magical Training',
  Effect: [
    { Type: 'SpellPoints', Bonus: 'Feat', AType: 'Stacks', Amount: 80 },
    { Type: 'SpellLore', Bonus: 'Feat', AType: 'Stacks', Amount: 5, Item: 'Universal' },
  ],
} as unknown as Feat

/**
 * Bard Spellsinger "Spellsinger: Studies" item with a "Magical Studies"
 * selector option.  The option has:
 *   - SpellPoints Enhancement [30/60/100] at ranks 1/2/3
 *   - GrantFeat "Magical Training" gated by Rank=3
 */
const spellsingerTree: EnhancementTree = {
  Name: 'Bard_Spellsinger',
  EnhancementTreeItem: [
    {
      Name: 'Spellsinger: Studies',
      Ranks: 3,
      CostPerRank: '1',
      Selector: [
        {
          EnhancementSelection: [
            {
              Name: 'Magical Studies',
              Effect: [
                {
                  Type: 'SpellPoints',
                  Bonus: 'Enhancement',
                  AType: 'Stacks',
                  Amount: '30 60 100',
                },
                {
                  Type: 'GrantFeat',
                  Bonus: 'Enhancement',
                  AType: 'NotNeeded',
                  Item: 'Magical Training',
                  Rank: 3,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
} as unknown as EnhancementTree

function emptyInput(feats: Feat[] = [], trees: EnhancementTree[] = []): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [bardClass],
    allFeats: feats,
    allTrees: trees,
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

function bardBuild(rank: number) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Bard', levels: 5 }],
    levelClasses: ['Bard', 'Bard', 'Bard', 'Bard', 'Bard'],
    totalLevel: 5,
    featChoices: {},
    enhancementChoices: {
      Bard_Spellsinger: { 'Spellsinger: Studies': rank },
    },
    enhancementSelections: {
      Bard_Spellsinger: { 'Spellsinger: Studies': 'Magical Studies' },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GrantFeat rank gating — Magical Studies / Magical Training', () => {
  it('rank 3: Magical Training is LISTED as granted but its effects do NOT apply (V2 display-only)', () => {
    // Pass 122+ correction: V2's runtime never applies a granted feat's own
    // effects (Build.cpp:2448 `//KeepGrantedFeatsUpToDate();` — the
    // GrantedFeatsPane is display-only). Enhancement SpellPoints at rank 3
    // = 100 stands alone; the +80 Feat SP must NOT be added.
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat], [spellsingerTree]),
      bardBuild(3),
    )
    expect(stats.total('spellPoints')).toBe(100)
    expect(stats.grantedFeatsList).toContain('Magical Training')
  })

  it('rank 2: spellPoints does NOT include Magical Training (rank < 3)', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat], [spellsingerTree]),
      bardBuild(2),
    )
    // Enhancement SpellPoints at rank 2 = 60.
    // GrantFeat does NOT fire at rank 2.
    expect(stats.total('spellPoints')).toBe(60)
  })

  it('rank 1: spellPoints does NOT include Magical Training', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat], [spellsingerTree]),
      bardBuild(1),
    )
    // Enhancement SpellPoints at rank 1 = 30.
    expect(stats.total('spellPoints')).toBe(30)
  })

  it('rank 3: no spell crit from Magical Training either (effects not applied)', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat], [spellsingerTree]),
      bardBuild(3),
    )
    expect(stats.total('spCrit.Universal')).toBe(0)
  })

  it('rank 2: no spell crit from Magical Training', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat], [spellsingerTree]),
      bardBuild(2),
    )
    expect(stats.total('spCrit.Universal')).toBe(0)
  })
})

describe('GrantFeat deduplication — trained feat not double-counted', () => {
  it('if Magical Training is already trained, GrantFeat does not add another 80 SP', () => {
    const build = {
      ...bardBuild(3),
      featChoices: { 'Hero 1': 'Magical Training' },
    }
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat], [spellsingerTree]),
      build,
    )
    // Trained feat gives 80 SP (that's a real trained feat, always applies).
    // The GrantFeat marker must not add another 80.
    // Enhancement SpellPoints at rank 3 = 100. Total = 180, NOT 260.
    expect(stats.total('spellPoints')).toBe(180)
  })
})

describe('GrantFeat from item buff (ItemBuff.Type = "GrantFeat")', () => {
  it('item-granted feat is listed but its stat effects do NOT apply (V2 display-only)', () => {
    const augmentSummoningFeat: Feat = {
      Name: 'Augment Summoning',
      Effect: [
        // +4 to all abilities for summoned creatures — modeled as a simple SP proxy for test
        // In reality Augment Summoning has no player stat effects; use a mock effect.
        { Type: 'SpellPoints', Bonus: 'Feat', AType: 'Stacks', Amount: 10 },
      ],
    } as unknown as Feat

    // Simulate an item that has a GrantFeat ItemBuff
    const ringWithGrant: Item = {
      Name: 'Ring of Grants',
      Slot: 'Ring1',
      Buff: [
        {
          Type: 'GrantFeat',
          BonusType: 'Enhancement',
          Item: 'Augment Summoning',
          Value1: 1,
        },
      ],
    } as unknown as Item

    const build = {
      ...makeEmptyBuild(),
      classes: [{ name: 'Bard', levels: 1 }],
      levelClasses: ['Bard'],
      totalLevel: 1,
    }

    const stats = computeBuildStats(
      {
        ...emptyInput([augmentSummoningFeat], []),
        gearItems: { Ring1: ringWithGrant },
      },
      build,
    )

    expect(stats.total('spellPoints')).toBe(0)
    expect(stats.grantedFeatsList).toContain('Augment Summoning')
  })
})
