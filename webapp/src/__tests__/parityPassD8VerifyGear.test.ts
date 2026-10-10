/**
 * Parity — D8 revisited: V2 `Build::VerifyGear` does NOT run at load.
 *
 * V2 `Build.cpp:2648-2690 VerifyGear` force-unequips items whose `MinLevel()`
 * exceeds the character level or whose `<Requirements>` fail, but it is only
 * called from edit events (SetLevel, SetRace, SetClass*, RevokeClass,
 * SwapClasses, Life::SetRace). Loading a save never calls it, so the v2calc
 * oracle (V2's own load path) keeps such items and their effects. Pass 160
 * revoked them at stat time, which dropped real gear on 60+ oracle builds.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
} from '../types/ddo'

const ROOT = join(__dirname, '..', '..', '..')

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

// "Knight's Gauntlets" — MinLevel 15, Requirements: Race=Purple Dragon Knight.
const raceGatedGloves: Item = {
  Name: "Test Knight's Gauntlets",
  MinLevel: 15,
  Requirements: { Requirement: { Type: 'Race', Item: 'Purple Dragon Knight', Value: 1 } },
  Buff: { Type: 'PRR', Value1: 9 },
} as unknown as Item

const tooHighLevelItem: Item = {
  Name: 'Test Overlevel Trinket',
  MinLevel: 40,
  Buff: { Type: 'MRR', Value1: 5 },
} as unknown as Item

const plainItem: Item = {
  Name: 'Test Plain Boots',
  MinLevel: 10,
  Buff: { Type: 'PRR', Value1: 4 },
} as unknown as Item

describe('D8 revisited - saved gear is not revoked at load (V2 parity)', () => {
  it('an item whose Race requirement the build does not meet still contributes', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Gloves: raceGatedGloves } }),
      { ...makeEmptyBuild(), race: 'Human' },
    )
    expect(stats.total('prr')).toBe(9)
  })

  it('an item above the character level still contributes', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Trinket: tooHighLevelItem } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('mrr')).toBe(5)
  })

  it('an item with no MinLevel/Requirements is unaffected', () => {
    const stats = computeBuildStats(
      emptyInput({ gearItems: { Boots: plainItem } }),
      { ...makeEmptyBuild() },
    )
    expect(stats.total('prr')).toBe(4)
  })

  // Oracle-pinned: v2calc reports fortification 40 for this save (Dhampir
  // wearing the Dhampir Dark Bargainer-only Decorated Bracers).
  const FUZZ = join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-5006.DDOBuild')
  const DATA = join(ROOT, 'Output', 'DataFiles')
  it.skipIf(!existsSync(FUZZ) || !existsSync(DATA))('fuzz-5006 keeps Decorated Bracers (V2 oracle: fortification 40)', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(readFileSync(FUZZ, 'utf8'), cat)
    expect(stats.total('fortification')).toBe(40)
  }, 120_000)
})
