// Random-build parity fuzzer — self-checks that don't need V2.
//
// For a set of fixed seeds, the generator must produce builds that are
// (a) LEGAL — every feat is an offered, prereq-met option for its slot;
//     every enhancement respects tier MinSpent gates, rank caps, per-item
//     Requirements, the AP budget, selector selections, and the single
//     Tier-5-tree rule; gear is level-legal (validateBuild replays all of
//     this independently of the generator's own gating);
// (b) DETERMINISTIC — same seed, same build;
// (c) ROUND-TRIPPABLE — exportV2Build → importV2Build preserves the fields
//     V2 would read (so the .DDOBuild V2 opens IS the build V3 measured);
// (d) COMPUTABLE — computeBuildStats produces sane numbers (hp > 0).

import { describe, expect, it, beforeAll } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import type { LoadedCatalogues } from '../server/dataLoaders'
import { generateRandomBuild, validateBuild } from '../lib/fuzz/randomBuild'
import { computeBuildStats } from '../lib/buildStats'
import { initBonusTypes } from '../lib/bonus'
import { exportV2Build } from '../lib/v2Export'
import { importV2Build } from '../lib/v2Import'
import type { CharacterBuild, Item } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

const SEEDS = [101, 202, 303, 404, 505]

let cat: LoadedCatalogues

function statsFor(build: CharacterBuild) {
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }
  return computeBuildStats({
    allClasses: cat.allClasses,
    allRaces: cat.allRaces,
    allFeats: cat.allFeats,
    allTrees: cat.allTrees,
    allSelfBuffs: cat.allSelfBuffs,
    allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses,
    allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees,
    allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells,
    allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs,
    gearItems,
  }, build)
}

describe.skipIf(!haveData)('random-build parity fuzzer (real catalogues)', () => {
  beforeAll(() => {
    cat = loadAllCatalogues(DATA_DIR)
    if (cat.allBonusTypes.length > 0) initBonusTypes(cat.allBonusTypes)
  }, 120_000)

  it.each(SEEDS)('seed %i generates a LEGAL build (validator finds no violations)', seed => {
    const { build } = generateRandomBuild(cat, { seed })
    const problems = validateBuild(cat, build)
    expect(problems, problems.join('\n')).toEqual([])
  }, 60_000)

  it('is deterministic — same seed, identical build', () => {
    const a = generateRandomBuild(cat, { seed: 777 }).build
    const b = generateRandomBuild(cat, { seed: 777 }).build
    expect(a).toEqual(b)
  }, 60_000)

  it('different seeds explore different builds', () => {
    const a = generateRandomBuild(cat, { seed: 101 }).build
    const b = generateRandomBuild(cat, { seed: 202 }).build
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b))
  }, 60_000)

  it.each(SEEDS)('seed %i round-trips through .DDOBuild export/import', seed => {
    const { build } = generateRandomBuild(cat, { seed })
    const xml = exportV2Build(build)
    const imported = importV2Build(xml).build

    expect(imported.race).toEqual(build.race)
    expect(imported.totalLevel).toEqual(build.totalLevel)
    expect(imported.levelClasses).toEqual(build.levelClasses)
    // Class rows may re-order on import; compare as name→levels map.
    const classMap = (b: CharacterBuild) =>
      Object.fromEntries(b.classes.filter(c => c.name && c.levels > 0).map(c => [c.name, c.levels]))
    expect(classMap(imported)).toEqual(classMap(build))
    expect(imported.baseAbilities).toEqual(build.baseAbilities)
    expect(imported.abilityLevelUps).toEqual(build.abilityLevelUps)
    // Every trained feat survives (slot keys are canonical in both directions).
    expect(imported.featChoices).toEqual(build.featChoices)
    expect(imported.enhancementChoices).toEqual(build.enhancementChoices)
    expect(imported.enhancementSelections).toEqual(build.enhancementSelections)
    expect(imported.gear).toEqual(build.gear)
  }, 60_000)

  it.each(SEEDS)('seed %i computes sane stats (hp > 0, keys present)', seed => {
    const { build } = generateRandomBuild(cat, { seed })
    const stats = statsFor(build)
    expect(stats.total('hp')).toBeGreaterThan(0)
    expect(stats.keys().length).toBeGreaterThan(20)
  }, 60_000)
})
