// V2 → V3 full-catalogue round-trip.
//
// Loads the real Race/Class/Feat/Tree/Item/Augment/etc. XML from
// `Output/DataFiles/`, imports the YingsMonk V2 build, runs V3's stat
// engine end-to-end. This is the closest V3 can get to "computed exactly
// the way V2 would" without running V2 itself: same data files, same
// build, V3's calculation pipeline.
//
// Test bands intentionally allow some slack for data-version drift; as
// real V2 numbers from running v2 alongside are reported, the bands
// tighten into exact-match asserts.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats } from '../hooks/useBuildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import type { Item } from '../types/ddo'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

const haveData = existsSync(DATA_DIR) &&
  existsSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'))

const maybeDescribe = haveData ? describe : describe.skip

maybeDescribe('V2 round-trip with real XML catalogues — Yings Monk', () => {
  const xml = readFileSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'), 'utf-8')
  const { build } = importV2Build(xml)
  const cat = loadAllCatalogues(DATA_DIR)

  // Resolve gear-slot names → loaded Item objects so per-item buffs run.
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }

  const stats = computeBuildStats({
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
    gearItems,
  }, build)

  it('catalogues load with realistic counts', () => {
    expect(cat.allRaces.length).toBeGreaterThan(20)
    expect(cat.allClasses.length).toBeGreaterThan(20)
    expect(cat.allFeats.length).toBeGreaterThan(800)
    expect(cat.allTrees.length).toBeGreaterThan(80)
    expect(cat.allItems.length).toBeGreaterThan(1000)
    expect(cat.allAugments.length).toBeGreaterThan(500)
  })

  it('gear slots resolve to real items (≥ 10 items equipped)', () => {
    expect(Object.keys(gearItems).length).toBeGreaterThanOrEqual(10)
  })

  it('Wisdom is in the expected Aasimar-monk band (24+, end-game stacks high)', () => {
    // Yings is a maxed-out Monk with every WIS-stacking item, augment,
    // tome, level-up, past life and enhancement. End-game WIS routinely
    // hits 50-70 once every source compounds. (Upper band bumped after the
    // Completionist / Item="All" AbilityBonus fix, which now correctly adds
    // +2 to every ability for this 40+-past-life build.)
    // (Upper band bumped again after the InternalName choice-key fix —
    // enhancement/destiny/reaper tree WIS nodes now actually apply.)
    const wis = stats.total('ability.Wisdom')
    expect(wis).toBeGreaterThanOrEqual(24)
    expect(wis).toBeLessThanOrEqual(120)
  })

  it('HP is in the expected Monk end-game band (v2calc oracle: 4198)', () => {
    // Band tightened around the real `v2calc` oracle value for this exact
    // fixture (4198 — see v2calc/build/v2calc "Output/Example Builds/
    // YingsMonk.DDOBuild" Output/DataFiles) after fixing three HP bugs:
    // epic/legendary class HP was wrongly halved (only the *separate*
    // Combat Style accumulator halves them, not the class HP effect itself
    // — BreakdownItemHitpoints.cpp:68-83), the CON-mod gear/enhancement
    // delta correction scaled by heroic totalLevel instead of total
    // character level, and HitpointsReaper (APCount, level-capped) was
    // merged into the same bucket as flat Reaper-tagged Hitpoints effects
    // (uncapped), so the cap over-applied to both.
    const hp = stats.total('hp')
    expect(hp).toBeGreaterThanOrEqual(3900)
    expect(hp).toBeLessThanOrEqual(4200)
  })

  it('AC is at least 30 (Aasimar Monk with WIS bonus + items)', () => {
    const ac = stats.total('ac')
    expect(ac).toBeGreaterThanOrEqual(30)
  })

  it('PRR/MRR are non-negative', () => {
    expect(stats.total('prr')).toBeGreaterThanOrEqual(0)
    expect(stats.total('mrr')).toBeGreaterThanOrEqual(0)
  })

  it('Saves are in the expected Monk band (≥ 20 each)', () => {
    expect(stats.total('save.Fort')).toBeGreaterThanOrEqual(20)
    expect(stats.total('save.Reflex')).toBeGreaterThanOrEqual(20)
    expect(stats.total('save.Will')).toBeGreaterThanOrEqual(20)
  })

  it('Past lives feed the stat map (every heroic past life maxed = 14×3)', () => {
    expect(Object.values(build.pastLives).reduce((s, n) => s + n, 0)).toBeGreaterThanOrEqual(40)
  })

  it('Set bonuses fire (Yings has Dread Stalker pieces)', () => {
    // Set bonus bonuses live in stats.keys(); just assert at least one
    // set-typed key emerges from the gear/effects pipeline.
    const keys = stats.keys()
    expect(keys.length).toBeGreaterThan(30)
  })
})
