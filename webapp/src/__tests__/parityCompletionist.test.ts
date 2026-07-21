// V2 → V3 parity: Completionist / Racial Completionist eligibility.
//
// Two independent bugs, both found via `v2calc` oracle diffing against the
// real `Maetrim_EndGameHandwrapsMonk.DDOBuild` fixture (35-build multi-life
// document, fully past-lifed):
//
// 1. `v2Import.ts` only read past lives from `<Character><SpecialFeats>`, but
//    V2's `Life::AllSpecialFeats()` (Life.cpp:709-713) sums the Life's own
//    `<SpecialFeats>` with the Character-level ones — `Build::SpecialFeats()`
//    reads that combined list. Some past lives (e.g. "Past Life: Duergar",
//    "Past Life: Rogue - Arcane Trickster") are recorded at Life scope in real
//    V2 saves and were silently dropped.
//
// 2. `buildAutomaticFeatGroups`'s Completionist/Racial Completionist
//    eligibility check (DDOBuilder.cpp:494-577, the *dynamic* per-feat
//    Requirements V2 builds at data-load time) had two mismatches with the
//    real algorithm:
//      - Class Completionist groups archetypes under their base class
//        (`BaseClass` field) via a RequiresOneOf — the base class's own past
//        life OR any archetype's — needing only >=1 (not >=3, and not each
//        archetype counted as its own independent "class"). The placeholder
//        "Unknown" class must also be excluded (`GetBaseClass() !=
//        Class_Unknown`).
//      - Racial Completionist must skip races with `NoPastLife` set (e.g.
//        Wood Elf) — V2: `!rit.IsIconic() && !rit.HasNoPastLife()`.
//
// Together these made Completionist/Racial Completionist's +2 AbilityBonus/
// +2 SkillBonus silently never apply for real fully-past-lifed builds.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { buildAutomaticFeatGroups } from '../lib/automaticFeats'
import { computeBuildStats } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import type { DDOClass, Race, Item } from '../types/ddo'
import { emptyBuild } from '../types/ddo'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR) && existsSync(FIXTURE_DIR)
const maybeDescribe = haveData ? describe : describe.skip

describe('buildAutomaticFeatGroups — Completionist grouping (synthetic catalogue)', () => {
  const allClasses: DDOClass[] = [
    { Name: 'Bard' } as unknown as DDOClass,
    { Name: 'Stormsinger', BaseClass: 'Bard' } as unknown as DDOClass,
    { Name: 'Rogue' } as unknown as DDOClass,
    { Name: 'Epic', NotHeroic: true } as unknown as DDOClass,
    { Name: 'Unknown' } as unknown as DDOClass,
  ]
  const allRaces: Race[] = [
    { Name: 'Human' } as unknown as Race,
    { Name: 'Wood Elf', NoPastLife: true } as unknown as Race,
  ]

  it('grants class Completionist when only the ARCHETYPE past life is trained (RequiresOneOf), needing >=1 not >=3', () => {
    const build = {
      ...emptyBuild(),
      pastLives: { 'Bard - Stormsinger': 1, Rogue: 1 },
    }
    const groups = buildAutomaticFeatGroups(build, allClasses, [])
    expect(groups.some(g => g.source === 'Completionist')).toBe(true)
  })

  it('does not grant class Completionist when a base-class group has no member trained', () => {
    const build = { ...emptyBuild(), pastLives: { Bard: 1 } } // Rogue group untrained
    const groups = buildAutomaticFeatGroups(build, allClasses, [])
    expect(groups.some(g => g.source === 'Completionist')).toBe(false)
  })

  it('ignores the "Unknown" placeholder class and NotHeroic classes', () => {
    // Only real heroic base classes (Bard, Rogue) need past lives — Epic and
    // Unknown must not be required.
    const build = { ...emptyBuild(), pastLives: { Bard: 1, Rogue: 1 } }
    const groups = buildAutomaticFeatGroups(build, allClasses, [])
    expect(groups.some(g => g.source === 'Completionist')).toBe(true)
  })

  it('skips NoPastLife races (e.g. Wood Elf) for Racial Completionist', () => {
    const build = { ...emptyBuild(), pastLives: { Human: 3 } } // Wood Elf never trained
    const groups = buildAutomaticFeatGroups(build, [], allRaces)
    expect(groups.some(g => g.source === 'Racial Completionist')).toBe(true)
  })

  it('requires racial past lives at >=3 (not >=1)', () => {
    const build = { ...emptyBuild(), pastLives: { Human: 2 } }
    const groups = buildAutomaticFeatGroups(build, [], allRaces)
    expect(groups.some(g => g.source === 'Racial Completionist')).toBe(false)
  })
})

maybeDescribe('v2Import — Life-level SpecialFeats past lives (Maetrim fixture)', () => {
  const xml = readFileSync(join(FIXTURE_DIR, 'Maetrim_EndGameHandwrapsMonk.DDOBuild'), 'utf-8')
  const { build } = importV2Build(xml)

  it('folds a Life-scoped past life ("Past Life: Duergar") into build.pastLives', () => {
    // Recorded only inside <Life><SpecialFeats>, not <Character><SpecialFeats>
    // — confirmed absent from the Character-level block for this fixture.
    expect(build.pastLives['Duergar']).toBe(3)
  })

  it('is eligible for both Completionist and Racial Completionist', () => {
    const cat = loadAllCatalogues(DATA_DIR)
    const groups = buildAutomaticFeatGroups(build, cat.allClasses, cat.allRaces)
    expect(groups.some(g => g.source === 'Completionist')).toBe(true)
    expect(groups.some(g => g.source === 'Racial Completionist')).toBe(true)
  })

  it('computeBuildStats folds both +2 Completionist/Racial Completionist ability bonuses into every ability (V2 BreakdownItemAbility parity)', () => {
    const cat = loadAllCatalogues(DATA_DIR)
    initBonusTypes(cat.allBonusTypes)
    const gearItems: Record<string, Item> = {}
    for (const [slot, name] of Object.entries(build.gear ?? {})) {
      if (!name) continue
      const item = cat.allItems.find(i => i.Name === name)
      if (item) gearItems[slot] = item
    }
    const stats = computeBuildStats({
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs, gearItems,
    }, build)
    // Each ability's resolved bonus list must carry both +2 sources (V2
    // BreakdownItemAbility.cpp real breakdown: both are trained + active for
    // this fully-past-lifed build). Checked as line items rather than the
    // total, since the total also carries the fixture's Guild Buff bonuses
    // (see the dedicated test below).
    for (const ab of ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']) {
      const bonuses = stats.resolve(`ability.${ab}`).bonuses
      expect(bonuses.some(b => b.source === 'Automatic: Completionist' && b.value === 2)).toBe(true)
      expect(bonuses.some(b => b.source === 'Automatic: Racial Completionist' && b.value === 2)).toBe(true)
    }
  })

  it('applies all three level-gated Guild Buff AbilityBonus effects (GuildLevel=200 unlocks all of them) — V2-exact, not an overshoot', () => {
    // PARITY_TODO.md previously logged this as a suspected V3 bug ("Guild Buff
    // effects wrongly apply an AbilityBonus") based on the v2calc oracle
    // showing zero guild-buff entries for Maetrim/YingsMonk. That was a false
    // lead: the oracle's data loader (v2calc/shim/GlobalDataLinux.cpp) never
    // called GuildBuffsFile to populate g_guildBuffs, so Build::ApplyGuildBuffs
    // iterated an empty list and every guild buff effect was silently absent
    // from the oracle's output — not because real V2 skips them. Once the
    // oracle's loader was fixed to match CDDOBuilderApp::LoadGuildBuffs
    // (DDOBuilder.cpp:1229-1238), it reports the same +2-per-ability total V3
    // already computed (confirmed via `oracleDiff.ts`: ability.* mismatches on
    // this fixture dropped from -2 on every ability to exact matches). Guild
    // Level 200 clears the Level 15/16/17 gates on all three ability-granting
    // guild buffs at once, so every ability gets one +2 "Guild Buff: ..." line
    // (GuildBuffs.xml has no mechanism to model "only one building built").
    const cat = loadAllCatalogues(DATA_DIR)
    initBonusTypes(cat.allBonusTypes)
    const gearItems: Record<string, Item> = {}
    for (const [slot, name] of Object.entries(build.gear ?? {})) {
      if (!name) continue
      const item = cat.allItems.find(i => i.Name === name)
      if (item) gearItems[slot] = item
    }
    const stats = computeBuildStats({
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs, gearItems,
    }, build)
    expect(build.guildLevel).toBe(200)
    expect(build.applyGuildBuffs).toBe(true)
    const expectedSource: Record<string, string> = {
      Strength: 'Guild Buff: Floating Rock Garden',
      Wisdom: 'Guild Buff: Floating Rock Garden',
      Dexterity: 'Guild Buff: Paradoxical Puzzle Box',
      Intelligence: 'Guild Buff: Paradoxical Puzzle Box',
      Constitution: "Guild Buff: Old Sully's Grog Cellar",
      Charisma: "Guild Buff: Old Sully's Grog Cellar",
    }
    for (const [ab, source] of Object.entries(expectedSource)) {
      const bonuses = stats.resolve(`ability.${ab}`).bonuses
      expect(bonuses.some(b => b.source === source && b.value === 2)).toBe(true)
    }
  })
})
