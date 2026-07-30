/**
 * Parity pass — D4: Artifact Filigree slots must gate on an equipped Minor
 * Artifact item (PARITY_TODO "Medium-priority remaining › Data-file edge
 * cases").
 *
 * V2 `Build::ApplyGearEffects`/`RevokeGearEffects` (Build.cpp:4776-4783,
 * 4852-4859) only apply/revoke the 10 "Artifact Filigree" slot effects when
 * `gear.HasMinorArtifact()` is true — i.e. some equipped item carries the
 * presence-only `<MinorArtifact/>` flag (`EquippedGear::HasMinorArtifact`,
 * EquippedGear.cpp:424-435). Without a Minor Artifact equipped, a build's
 * Artifact Filigree slots contribute nothing in V2, even if populated.
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

const artifactFiligree: Filigree = {
  Name: 'Test Artifact Filigree: +5 PRR',
  Effect: { Type: 'PRR', Bonus: 'Insightful', AType: 'Simple', Amount: 5 },
} as unknown as Filigree

const minorArtifactItem: Item = {
  Name: 'Test Minor Artifact',
  MinorArtifact: '',
} as unknown as Item

describe('D4 — Artifact Filigree slots gate on an equipped Minor Artifact', () => {
  const artifactFiligreeSlots = [{ name: artifactFiligree.Name, rare: false }]

  it('Artifact Filigree slots contribute NOTHING with no Minor Artifact equipped', () => {
    const build = { ...makeEmptyBuild(), artifactFiligreeSlots }
    const stats = computeBuildStats(
      emptyInput({ allFiligrees: [artifactFiligree], gearItems: {} }),
      build,
    )
    expect(stats.total('prr')).toBe(0)
  })

  it('Artifact Filigree slots DO contribute once a Minor Artifact is equipped', () => {
    const build = { ...makeEmptyBuild(), artifactFiligreeSlots }
    const stats = computeBuildStats(
      emptyInput({
        allFiligrees: [artifactFiligree],
        gearItems: { Trinket: minorArtifactItem },
      }),
      build,
    )
    expect(stats.total('prr')).toBe(5)
  })

  it('regular Filigree slots are unaffected by the Minor Artifact gate', () => {
    const regularFiligree: Filigree = {
      Name: 'Test Regular Filigree: +3 PRR',
      Effect: { Type: 'PRR', Bonus: 'Enhancement', AType: 'Simple', Amount: 3 },
    } as unknown as Filigree
    const build = {
      ...makeEmptyBuild(),
      filigreeSlots: [{ name: regularFiligree.Name, rare: false }],
    }
    const stats = computeBuildStats(
      emptyInput({ allFiligrees: [regularFiligree], gearItems: {} }),
      build,
    )
    expect(stats.total('prr')).toBe(3)
  })
})
