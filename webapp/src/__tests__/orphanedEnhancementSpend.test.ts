/**
 * AP left behind in a tree the build can no longer reach.
 *
 * Swap a class out — rebuild a Rogue/Alchemist into a Monk / Sacred Fist —
 * and the points spent in Assassin and Vile Chemist have nowhere to live. V2
 * refunds them the moment its enhancements pane re-determines the tree list:
 * `CEnhancementsPane::DetermineTrees` (EnhancementsPane.cpp:340-374) calls
 * `Build::Enhancement_ResetEnhancementTree` on any selected tree that no
 * longer meets its requirements — "no user confirmation for this as they have
 * already changed the base requirement that included the tree. All APs spent
 * in this tree have to be returned to the pool of those available."
 *
 * V3 pruned only the PINNED list, so the spend stayed in the document:
 * invisible (no tree on screen owned it), still counted in the panel's
 * "N / 80 AP" header — the reported symptom, a build reading 16 AP spent with
 * nothing to show for it — and still feeding its effects into the engine.
 */

import { describe, it, expect } from 'vitest'
import { orphanedEnhancementTrees } from '../lib/treeAvailability'
import { computeTreeSpent, costUpToRank } from '../lib/enhancementSpend'
import { computeBuildStats, type BuildStatsInput } from '../lib/buildStats'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass, EnhancementTree, Race } from '../types/ddo'

const ROGUE = { Name: 'Rogue' } as unknown as DDOClass
const MONK = { Name: 'Monk' } as unknown as DDOClass

const ASSASSIN = {
  Name: 'Assassin',
  Requirements: { Requirement: [{ Type: 'Class', Item: ['Rogue'] }] },
  EnhancementTreeItem: [
    { Name: 'Assassin Core', InternalName: 'AssCore1', Ranks: 1, CostPerRank: '2' },
    {
      Name: 'Sneak Attack Training', InternalName: 'AssSneakAttackTrainingI', Ranks: 1,
      Effect: [{ Type: 'SneakAttackDice', Bonus: 'Enhancement', AType: 'Simple', Amount: 1 }],
    },
    { Name: 'Venomed Blades', InternalName: 'AssVenomedBlades', Ranks: 3 },
  ],
} as unknown as EnhancementTree

const NINJA = {
  Name: 'Ninja Spy',
  Requirements: { Requirement: [{ Type: 'Class', Item: ['Monk'] }] },
  EnhancementTreeItem: [
    {
      Name: 'Ninja Core', InternalName: 'NinCore1', Ranks: 1,
      Effect: [{ Type: 'Doublestrike', Bonus: 'Enhancement', AType: 'Simple', Amount: 3 }],
    },
  ],
} as unknown as EnhancementTree

const SPENT_IN_ASSASSIN = { AssCore1: 1, AssSneakAttackTrainingI: 1, AssVenomedBlades: 3 }

function input(patch: Partial<BuildStatsInput> = {}): BuildStatsInput {
  return {
    allClasses: [ROGUE, MONK], allRaces: [], allFeats: [],
    allTrees: [ASSASSIN, NINJA],
    allSelfBuffs: [], allAugments: [], allSetBonuses: [],
    allFiligreeBonuses: [], allFiligrees: [], gearItems: {},
    ...patch,
  }
}

function buildWith(patch: Partial<CharacterBuild> = {}): CharacterBuild {
  return { ...emptyBuild(), race: '', alignment: '', ...patch }
}

const asRogue = (patch: Partial<CharacterBuild> = {}) => buildWith({
  classes: [{ name: 'Rogue', levels: 20 }], totalLevel: 20,
  enhancementChoices: { Assassin: SPENT_IN_ASSASSIN }, ...patch,
})
const asMonk = (patch: Partial<CharacterBuild> = {}) => buildWith({
  classes: [{ name: 'Monk', levels: 20 }], totalLevel: 20,
  enhancementChoices: { Assassin: SPENT_IN_ASSASSIN }, ...patch,
})

// ---------------------------------------------------------------------------
// Spend arithmetic
// ---------------------------------------------------------------------------

describe('computeTreeSpent', () => {
  it('reads CostPerRank per rank, defaulting to 1 AP', () => {
    // Core costs 2, the other two 1 each per rank: 2 + 1 + 3 = 6.
    expect(computeTreeSpent(ASSASSIN, SPENT_IN_ASSASSIN)).toBe(6)
  })

  it('a rank of 0 or less costs nothing', () => {
    const item = { Name: 'x', Ranks: 3, CostPerRank: '2 1 1' } as never
    expect(costUpToRank(item, 0)).toBe(0)
    expect(costUpToRank(item, -1)).toBe(0)
    expect(costUpToRank(item, 2)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

describe('orphanedEnhancementTrees', () => {
  const find = (build: CharacterBuild, trees = [ASSASSIN, NINJA], classes = [ROGUE, MONK]) =>
    orphanedEnhancementTrees(trees, build, classes, undefined, [])

  it('reports a tree with spend the build no longer qualifies for, and its AP', () => {
    expect(find(asMonk())).toEqual([{ name: 'Assassin', spent: 6 }])
  })

  it('leaves spend in a tree the build still qualifies for alone', () => {
    expect(find(asRogue())).toEqual([])
  })

  it('ignores a tree with no points in it', () => {
    expect(find(asMonk({ enhancementChoices: { Assassin: {} } }))).toEqual([])
    expect(find(asMonk({ enhancementChoices: { Assassin: { AssCore1: 0 } } }))).toEqual([])
  })

  it('judges nothing while a catalogue is missing', () => {
    // Both are the PARITY_TODO #142 failure mode: with no trees, or no class
    // list to evaluate class requirements against, EVERY tree looks
    // unavailable and a whole build's spend would be thrown away.
    expect(find(asMonk(), [])).toEqual([])
    expect(find(asMonk(), [ASSASSIN, NINJA], [])).toEqual([])
  })

  it('leaves a tree that is not in the catalogue alone (data-version mismatch)', () => {
    const build = asMonk({ enhancementChoices: { 'Some Removed Tree': { X: 3 } } })
    expect(find(build)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The engine stops paying out
// ---------------------------------------------------------------------------

describe('effects from an unreachable tree', () => {
  it('do not apply once the build cannot reach the tree', () => {
    expect(computeBuildStats(input(), asRogue()).total('melee.sneakDice')).toBe(1)
    expect(computeBuildStats(input(), asMonk()).total('melee.sneakDice')).toBe(0)
  })

  it('still apply for trees the build does reach', () => {
    const build = asMonk({
      enhancementChoices: { Assassin: SPENT_IN_ASSASSIN, 'Ninja Spy': { NinCore1: 1 } },
    })
    const stats = computeBuildStats(input(), build)
    expect(stats.total('melee.doublestrike')).toBe(3)
    expect(stats.total('melee.sneakDice')).toBe(0)
  })

  it('are left alone when there is no catalogue to judge against', () => {
    // Same conservative guard as the detector: an engine call made before the
    // catalogues load must not quietly drop the build's bonuses.
    const stats = computeBuildStats(input({ allClasses: [] }), asMonk())
    expect(stats.total('melee.sneakDice')).toBe(1)
  })
})
