// Build optimizer (Custom › Optimizer) — core engine tests.
//
// Data-driven tests run against the real catalogues in Output/DataFiles and
// use the fuzz generator for a legal starting build, then strip parts of it
// to give the optimizer headroom. Every result must still pass the fuzzer's
// independent legality replay (validateBuild) and must never touch choices
// the "user" had already made.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import {
  generateRandomBuild, validateBuild, type FuzzCatalogues,
} from '../lib/fuzz/randomBuild'
import { optimizeBuild } from '../lib/optimizer/optimizer'
import {
  compareScores, scalarGain, statForFavoriteKey, type ObjectiveSpec,
} from '../lib/optimizer/objective'
import { applyMove, type Move } from '../lib/optimizer/moves'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

// ---------------------------------------------------------------------------
// Pure unit tests (no catalogue data)
// ---------------------------------------------------------------------------

describe('objective scoring', () => {
  const prio: ObjectiveSpec = {
    mode: 'priority',
    stats: [
      { key: 'melee.power', label: 'Melee Power', weight: 1 },
      { key: 'melee.damage', label: 'Melee Damage Bonus', weight: 1 },
      { key: 'hp', label: 'Hit Points', weight: 1 },
    ],
  }

  it('priority mode is strictly lexicographic', () => {
    expect(compareScores(prio, [10, 0, 0], [9, 50, 999])).toBeGreaterThan(0)
    expect(compareScores(prio, [10, 1, 0], [10, 0, 999])).toBeGreaterThan(0)
    expect(compareScores(prio, [10, 1, 5], [10, 1, 6])).toBeLessThan(0)
    expect(compareScores(prio, [10, 1, 5], [10, 1, 5])).toBe(0)
  })

  it('weighted mode sums weight × value', () => {
    const spec: ObjectiveSpec = {
      mode: 'weighted',
      stats: [
        { key: 'melee.power', label: 'Melee Power', weight: 2 },
        { key: 'hp', label: 'Hit Points', weight: 1 },
      ],
    }
    // 2×5 + 1×0 = 10 vs 2×0 + 1×9 = 9
    expect(compareScores(spec, [5, 0], [0, 9])).toBeGreaterThan(0)
    expect(compareScores(spec, [5, 0], [0, 10])).toBe(0)
  })

  it('scalarGain orders priority gains above lower-priority gains', () => {
    const gTop = scalarGain(prio, [0, 0, 0], [1, 0, 0])
    const gMid = scalarGain(prio, [0, 0, 0], [0, 30, 0])
    const gLow = scalarGain(prio, [0, 0, 0], [0, 0, 500])
    expect(gTop).toBeGreaterThan(gMid)
    expect(gMid).toBeGreaterThan(gLow)
  })

  it('maps favorites keys to optimizer stats', () => {
    expect(statForFavoriteKey('Melee/Melee Power')?.key).toBe('melee.power')
    expect(statForFavoriteKey('Melee/Damage Bonus')?.key).toBe('melee.damage')
    expect(statForFavoriteKey('Defense/Hit Points')?.key).toBe('hp')
    expect(statForFavoriteKey('Defense/PRR')?.key).toBe('prr')
    expect(statForFavoriteKey('Weapon Effects/Crit Multiplier')).toBeNull()
  })
})

describe('applyMove purity', () => {
  it('does not mutate the input build', () => {
    const build = {
      enhancementChoices: { T: { A: 1 } },
      enhancementSelections: {},
      enhancementPinned: [],
      featChoices: { s1: 'Toughness' },
      levelClasses: ['Fighter', ''],
    } as unknown as CharacterBuild
    const snapshot = JSON.stringify(build)
    const moves: Move[] = [
      { kind: 'enhancement', tree: 'T', itemName: 'B', key: 'B', toRank: 1, cost: 1 },
      { kind: 'feat', slotKey: 's2', featName: 'Dodge', level: 3, featType: 'Standard' },
      { kind: 'classLevel', level: 2, className: 'Fighter' },
    ]
    for (const m of moves) applyMove(build, m)
    expect(JSON.stringify(build)).toBe(snapshot)
  })
})

// ---------------------------------------------------------------------------
// Data-driven tests
// ---------------------------------------------------------------------------

function fuzzCat(cat: ReturnType<typeof loadAllCatalogues>): FuzzCatalogues {
  return {
    allRaces: cat.allRaces, allClasses: cat.allClasses, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allItems: cat.allItems,
  }
}

function gearItemsFor(cat: ReturnType<typeof loadAllCatalogues>, build: CharacterBuild): Record<string, Item> {
  const out: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    const item = cat.allItems.find(i => i.Name === name)
    if (item) out[slot] = item
  }
  return out
}

const MELEE_OBJECTIVE: ObjectiveSpec = {
  mode: 'priority',
  stats: [
    { key: 'melee.power', label: 'Melee Power', weight: 1 },
    { key: 'melee.damage', label: 'Melee Damage Bonus', weight: 1 },
    { key: 'hp', label: 'Hit Points', weight: 1 },
  ],
}

describe.skipIf(!have)('optimizeBuild on real data', () => {
  const cat = loadAllCatalogues(DATA)

  it('improves the objective, stays legal, and preserves set choices', async () => {
    const { build } = generateRandomBuild(fuzzCat(cat), { seed: 7, level: 12 })
    // Give the optimizer headroom: wipe all enhancements, empty half the feat
    // slots. What remains counts as "already set" and must survive untouched.
    build.enhancementChoices = {}
    build.enhancementSelections = {}
    const featKeys = Object.keys(build.featChoices)
    const kept: Record<string, string> = {}
    featKeys.forEach((k, i) => { if (i % 2 === 0) kept[k] = build.featChoices[k] })
    build.featChoices = { ...kept }

    const input = { ...cat, gearItems: gearItemsFor(cat, build) }
    const result = await optimizeBuild({
      input, build,
      objective: MELEE_OBJECTIVE,
      domains: { enhancements: true, destinies: true, feats: true, classLevels: true },
      maxEvals: 900,
    })

    expect(result.applied.length).toBeGreaterThan(0)
    const before = result.before.map(s => s.before)
    const after = result.before.map(s => s.after)
    expect(compareScores(MELEE_OBJECTIVE, after, before)).toBeGreaterThan(0)

    // Legality: the fuzzer's independent rule replay accepts the result.
    expect(validateBuild(fuzzCat(cat), result.build)).toEqual([])

    // "Already set" choices are untouched.
    for (const [k, v] of Object.entries(kept)) {
      expect(result.build.featChoices[k]).toBe(v)
    }
    expect(result.build.gear).toEqual(build.gear)
  }, 120000)

  it('fills empty destiny slots and spends destiny points at epic levels', async () => {
    const { build } = generateRandomBuild(fuzzCat(cat), { seed: 11, level: 20 })
    build.epicLevels = 5
    const input = { ...cat, gearItems: gearItemsFor(cat, build) }
    const result = await optimizeBuild({
      input, build,
      objective: MELEE_OBJECTIVE,
      domains: { enhancements: false, destinies: true, feats: false, classLevels: false },
      maxEvals: 700,
    })

    expect(result.applied.length).toBeGreaterThan(0)
    // Only destiny state may differ from the input build.
    expect(result.build.enhancementChoices).toEqual(build.enhancementChoices)
    expect(result.build.featChoices).toEqual(build.featChoices)
    const spentTrees = Object.entries(result.build.destinyChoices)
      .filter(([, c]) => Object.values(c).some(r => r > 0))
      .map(([name]) => name)
    expect(spentTrees.length).toBeGreaterThan(0)
    // Every tree with spend must occupy a selected destiny slot.
    for (const name of spentTrees) {
      expect(result.build.selectedDestinyTrees).toContain(name)
    }
  }, 120000)

  it('levels a class-less character to the target, picking classes as it goes', async () => {
    const build = emptyBuild()
    build.classes = [{ name: '', levels: 0 }, { name: '', levels: 0 }, { name: '', levels: 0 }]
    build.levelClasses = []
    build.totalLevel = 0
    build.epicLevels = 0
    build.legendaryLevels = 0

    const input = { ...cat, gearItems: {} }
    const result = await optimizeBuild({
      input, build,
      objective: MELEE_OBJECTIVE,
      // Feats/enhancements off to keep the eval count small — this test is
      // about leveling; the combined-domain path is covered above.
      domains: { enhancements: false, destinies: false, feats: false, classLevels: true, abilityLevelUps: true },
      targetLevel: 6,
      maxEvals: 500,
    })

    // The optimizer must have taken class levels and reached the target.
    expect(result.build.totalLevel).toBe(6)
    expect(result.build.levelClasses?.slice(0, 6).every(Boolean)).toBe(true)
    // classes aggregate must match the per-level plan (reducer invariant).
    const counted: Record<string, number> = {}
    for (const c of result.build.levelClasses ?? []) {
      if (c) counted[c] = (counted[c] ?? 0) + 1
    }
    for (const bc of result.build.classes) {
      if (bc.name) expect(bc.levels).toBe(counted[bc.name])
    }
    expect(validateBuild(fuzzCat(cat), result.build)).toEqual([])
    // The level-4 ability point should have been assigned too.
    expect(result.build.abilityLevelUps[4]).toBeTruthy()
  }, 120000)

  it('takes epic levels toward the target level', async () => {
    const build = emptyBuild()          // Fighter 20 by default
    build.epicLevels = 0
    build.legendaryLevels = 0
    const input = { ...cat, gearItems: {} }
    const result = await optimizeBuild({
      input, build,
      objective: MELEE_OBJECTIVE,
      domains: { enhancements: false, destinies: false, feats: false, classLevels: true, abilityLevelUps: false },
      targetLevel: 24,
      maxEvals: 200,
    })
    expect(result.build.epicLevels).toBe(4)
    expect(result.build.totalLevel).toBe(20)
  }, 60000)

  it('levels a partially-leveled build back to the target without breaking it', async () => {
    const { build } = generateRandomBuild(fuzzCat(cat), { seed: 3, level: 10 })
    // Un-level the last two assignments the way the reducer would (blank the
    // entries and re-aggregate classes/totalLevel), then ask the optimizer to
    // level back up to 10. Feats are cleared so un-leveling can't strand an
    // already-chosen feat.
    build.featChoices = {}
    const lc = [...(build.levelClasses ?? [])]
    lc[lc.length - 1] = ''
    lc[lc.length - 2] = ''
    build.levelClasses = lc
    build.totalLevel = lc.filter(Boolean).length
    const counts: Record<string, number> = {}
    for (const c of lc) if (c) counts[c] = (counts[c] ?? 0) + 1
    build.classes = build.classes.map(bc => ({
      ...bc, levels: bc.name ? (counts[bc.name] ?? 0) : 0,
    })) as CharacterBuild['classes']

    const input = { ...cat, gearItems: gearItemsFor(cat, build) }
    const result = await optimizeBuild({
      input, build,
      objective: { mode: 'priority', stats: [{ key: 'hp', label: 'Hit Points', weight: 1 }] },
      domains: { enhancements: false, destinies: false, feats: false, classLevels: true },
      targetLevel: 10,
      maxEvals: 300,
    })

    expect(result.build.totalLevel).toBe(10)
    expect(validateBuild(fuzzCat(cat), result.build)).toEqual([])
    expect(compareScores(
      { mode: 'priority', stats: [{ key: 'hp', label: 'Hit Points', weight: 1 }] },
      result.before.map(s => s.after),
      result.before.map(s => s.before),
    )).toBeGreaterThanOrEqual(0)
  }, 60000)
})
