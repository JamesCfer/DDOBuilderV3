/**
 * Parity pass — D3: Minor Artifact single-equip restriction (PARITY_TODO
 * "Medium-priority remaining › Data-file edge cases").
 *
 * V2 `EquippedGear::SetItem` (EquippedGear.cpp:352-372) auto-revokes any
 * OTHER item flagged `<MinorArtifact/>` the instant a new Minor Artifact is
 * equipped (`EquippedGear::HasMinorArtifact`) — a build can have at most one
 * Minor Artifact equipped at a time. V3 had no such enforcement: a build
 * with two Minor Artifacts equipped simultaneously counted both items'
 * effects, which V2 never allows.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
} from '../types/ddo'

function emptyInput(overrides: Partial<BuildStatsInput> = {}): BuildStatsInput {
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
    ...overrides,
  }
}

// Distinct BonusType so, absent the D3 fix, both would STACK (different
// bonus types don't compete Highest-Only) — isolating the single-equip
// restriction from unrelated same-type stacking rules.
const necklaceArtifact: Item = {
  Name: 'Test Minor Artifact Necklace',
  MinorArtifact: '',
  Buff: { Type: 'PRR', Value1: 9, BonusType: 'Insightful' },
} as unknown as Item

const trinketArtifact: Item = {
  Name: 'Test Minor Artifact Trinket',
  MinorArtifact: '',
  Buff: { Type: 'PRR', Value1: 5, BonusType: 'Quality' },
} as unknown as Item

const regularTrinket: Item = {
  Name: 'Test Regular Trinket',
  Buff: { Type: 'MRR', Value1: 5 },
} as unknown as Item

describe('D3 — Minor Artifact single-equip restriction', () => {
  it('two Minor Artifacts equipped: only one contributes (V2 revokes the other)', () => {
    const build = { ...makeEmptyBuild() }
    const stats = computeBuildStats(
      emptyInput({
        gearItems: { Necklace: necklaceArtifact, Trinket: trinketArtifact },
      }),
      build,
    )
    // V2 canonical slot order ranks Necklace before Trinket — the earlier
    // slot's item is the deterministic winner; the Trinket one is revoked.
    expect(stats.total('prr')).toBe(9)
  })

  it('a single Minor Artifact equipped contributes normally', () => {
    const build = { ...makeEmptyBuild() }
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Trinket: trinketArtifact } }),
      build,
    )
    expect(stats.total('prr')).toBe(5)
  })

  it('a Minor Artifact alongside a non-artifact item: both contribute', () => {
    const build = { ...makeEmptyBuild() }
    const stats = computeBuildStats(
      emptyInput({
        gearItems: { Necklace: necklaceArtifact, Trinket: regularTrinket },
      }),
      build,
    )
    expect(stats.total('prr')).toBe(9)
    expect(stats.total('mrr')).toBe(5)
  })
})
