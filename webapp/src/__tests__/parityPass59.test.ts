/**
 * Parity pass 59 — GrantFeat effects, rank gating.
 *
 * REVISED by pass 124: pass 59 assumed V2's Build::ApplyFeatEffects fires for
 * every GrantFeat effect and fed the granted feat's own Effect list through
 * accumulateFeat. Verified directly against the compiled V2 source (and the
 * v2calc oracle), that assumption was wrong — GrantFeat notifies only the
 * breakdowns registered for Effect_GrantFeat (CGrantedFeatsPane, tracking the
 * name for the Granted Feats panel / feat-prerequisite checks, and a narrow
 * BreakdownItemPRR re-derive trigger). ApplyFeatEffects is reached only via
 * TrainFeat / AutomaticFeats / TrainSpecialFeat — never from a GrantFeat
 * notification. See parityPass124GrantFeat.test.ts for the real-build
 * regression this reversal fixes (a phantom +4 STR/+4 CON from a
 * stance-gated granted feat). The rank-gating behavior below (whether
 * `grantedFeat.<Name>` fires at all) is still real and still tested; only
 * the "and therefore its stat effects apply" assertions are corrected.
 *
 * Concrete example: Bard Spellsinger tree — "Magical Studies" (selector option)
 *   rank 3 grants "Magical Training" via GrantFeat (<Rank>3</Rank>).
 *   "Magical Training" has two effects:
 *     • SpellPoints +80 (Feat bonus)
 *     • SpellLore (5% spell crit — SpellCritChance)
 *   At rank 1 or 2 the GrantFeat does NOT fire (rank < 3); at rank 3 it does
 *   fire (i.e. grantedFeatsList contains it) but its own stat effects never
 *   apply, matching V2.
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
  it('rank 3: spellPoints does NOT include Magical Training\'s own +80 (V2: GrantFeat never applies the granted feat\'s effects)', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat], [spellsingerTree]),
      bardBuild(3),
    )
    // Enhancement SpellPoints at rank 3 = 100. Magical Training's own +80
    // Feat bonus never applies — only the enhancement's own effect counts.
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

  it('rank 3: spell crit does NOT gain 5% from Magical Training either', () => {
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
    // Trained feat gives 80 SP.
    // GrantFeat should be skipped (feat already in ctxFeats).
    // Enhancement SpellPoints at rank 3 = 100.
    // Total = 100 + 80 (trained) = 180, same as grant-only case, but NOT 260.
    expect(stats.total('spellPoints')).toBe(180)
  })
})

describe('GrantFeat from item buff (ItemBuff.Type = "GrantFeat")', () => {
  it('item that grants a feat does NOT apply the feat\'s stat effects (V2 parity)', () => {
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
