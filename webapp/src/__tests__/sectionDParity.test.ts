/**
 * Section D parity — data objects for character content.
 *
 * Covers three V2-parity fixes in the catalogue loaders + auto-feat pass:
 *
 *  1. Race-inline <Feat> folding into loadFeats. V2 parses inline <Feat>
 *     children of a <Race> into Race::RacialFeats and resolves race-granted
 *     feats against the global catalogue. V3 previously folded only class-inline
 *     feats, so the *effects* of race-granted inline feats (e.g. Drow
 *     "Drow Spell Resistance", Drow.race.xml:15-36) silently went missing.
 *
 *  2. Improved Heroic Durability synthesis (Class.cpp:375-399): every heroic
 *     (non-NotHeroic) class dynamically creates "Improved Heroic Durability
 *     (<Class> 5/10/15)" feats, auto-acquired at class level 5/10/15, each
 *     granting the base "Improved Heroic Durability" effect (+5 max HP,
 *     Feats.xml:3791).
 *
 *  3. Loader flag normalisation: <NotHeroic/> (Class) is a presence-only flag
 *     that the XML parser delivers as "" (falsy); IsIconic is derived from
 *     IconicClass presence (Race::IsIconic() == HasIconicClass(),
 *     Race.cpp:84-87) since there is no <IsIconic> XML tag.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import { loadFeats, loadClasses, loadRaces } from '../server/dataLoaders'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree, Item,
  OptionalBuff, SetBonus, Augment, Race,
} from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)
const maybeDescribe = haveData ? describe : describe.skip

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [] as Race[],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

// ---------------------------------------------------------------------------
// Synthetic fixtures for IHD HP math (exact numbers, no real-data dependency)
// ---------------------------------------------------------------------------

// Base "Improved Heroic Durability" feat — +5 max HP, exactly as Feats.xml:3791.
const ihdBaseFeat: Feat = {
  Name: 'Improved Heroic Durability',
  Acquire: 'Automatic',
  Effect: { Type: 'Hitpoints', Bonus: 'Feat', AType: 'Simple', Amount: '5' },
} as unknown as Feat

const heroicClass = (name: string): DDOClass =>
  ({ Name: name, HitPoints: 6 } as DDOClass)

const epicClass = (name: string): DDOClass =>
  ({ Name: name, HitPoints: 0, NotHeroic: true } as DDOClass)

function hp(build: Parameters<typeof computeBuildStats>[1], classes: DDOClass[], feats: Feat[]): number {
  const stats = computeBuildStats(
    { ...emptyInput(), allClasses: classes, allFeats: feats },
    build,
  )
  // Sum only the IHD contribution so the test is independent of class-HP /
  // CON-mod / Heroic-Durability math.
  return stats.resolve('hp').bonuses
    .filter(b => /Improved Heroic Durability/.test(b.source))
    .reduce((s, b) => s + b.value, 0)
}

// ---------------------------------------------------------------------------
// 2. Improved Heroic Durability synthesis (HP from class-level milestones)
// ---------------------------------------------------------------------------

describe('Improved Heroic Durability synthesis (Class.cpp:375-399)', () => {
  it('grants +5 HP per class-level milestone reached (5/10/15)', () => {
    const fighter = heroicClass('Fighter')
    const mk = (lvl: number) => ({
      ...makeEmptyBuild(),
      classes: [{ name: 'Fighter', levels: lvl }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      totalLevel: lvl,
    })
    // Below first milestone: no IHD.
    expect(hp(mk(4), [fighter], [ihdBaseFeat])).toBe(0)
    // Exactly level 5: one milestone → +5.
    expect(hp(mk(5), [fighter], [ihdBaseFeat])).toBe(5)
    // Level 9: still one milestone (5) → +5.
    expect(hp(mk(9), [fighter], [ihdBaseFeat])).toBe(5)
    // Level 10: two milestones (5,10) → +10.
    expect(hp(mk(10), [fighter], [ihdBaseFeat])).toBe(10)
    // Level 14: two milestones → +10.
    expect(hp(mk(14), [fighter], [ihdBaseFeat])).toBe(10)
    // Level 15+: three milestones (5,10,15) → +15 (caps; no level-20 milestone).
    expect(hp(mk(15), [fighter], [ihdBaseFeat])).toBe(15)
    expect(hp(mk(20), [fighter], [ihdBaseFeat])).toBe(15)
  })

  it('sums independently per heroic class in a multiclass build', () => {
    const fighter = heroicClass('Fighter')
    const monk = heroicClass('Monk')
    const build = {
      ...makeEmptyBuild(),
      classes: [{ name: 'Fighter', levels: 10 }, { name: 'Monk', levels: 5 }, { name: '', levels: 0 }],
      totalLevel: 15,
    }
    // Fighter 10 → +10, Monk 5 → +5, total +15.
    expect(hp(build, [fighter, monk], [ihdBaseFeat])).toBe(15)
  })

  it('does NOT apply to NotHeroic (Epic/Legendary) classes', () => {
    const epic = epicClass('Epic')
    const build = {
      ...makeEmptyBuild(),
      classes: [{ name: 'Epic', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      totalLevel: 20,
    }
    expect(hp(build, [epic], [ihdBaseFeat])).toBe(0)
  })

  // V2 Build::ClassAtLevel falls back to "Unknown" for a heroic row with no
  // assigned class (Build.cpp:1226-1236); Classes/Unknown.class.xml carries
  // no <NotHeroic/> flag, so Class::ImprovedHeroicDurabilityFeats() still
  // synthesizes "Improved Heroic Durability (Unknown 5/10/15)" gated on
  // Requirement_ClassAtLevel("Unknown", N). A build with classless heroic
  // levels (raydc.DDOBuild: 20 blank heroic rows, real V2 oracle HP 330)
  // reaches these milestones in V2 even though build.classes never records
  // an entry for the blank name (buildStats.ts's `!bc.name` skip is correct
  // for the *named*-class loop but must not swallow the Unknown case).
  it('applies to classless ("Unknown") heroic levels the same as a named class', () => {
    const unknown: DDOClass = { Name: 'Unknown', HitPoints: 0 } as DDOClass
    const build = {
      ...makeEmptyBuild(),
      classes: [{ name: '', levels: 0 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 20 }, () => ''),
      totalLevel: 20,
    }
    // 20 classless heroic levels → all three milestones (5, 10, 15) → +15.
    expect(hp(build, [unknown], [ihdBaseFeat])).toBe(15)
  })

  it('does not apply the Unknown milestone when heroic levels are all classed', () => {
    const fighter = heroicClass('Fighter')
    const unknown: DDOClass = { Name: 'Unknown', HitPoints: 0 } as DDOClass
    const build = {
      ...makeEmptyBuild(),
      classes: [{ name: 'Fighter', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
      totalLevel: 20,
    }
    const total = hp(build, [fighter, unknown], [ihdBaseFeat])
    expect(total).toBe(15) // Fighter's own three milestones only, no Unknown double-count.
  })
})

// ---------------------------------------------------------------------------
// 1 + 3. Loader parity against the real shipped DataFiles
// ---------------------------------------------------------------------------

maybeDescribe('loader parity — race-inline feats + flag normalisation', () => {
  it('folds race-inline <Feat> definitions into the feat catalogue', () => {
    const feats = loadFeats(DATA_DIR)
    // Drow defines "Drow Spell Resistance" inline (Drow.race.xml:15-36); it
    // appears in no Feats.xml entry and is granted by name via <GrantedFeat>.
    const drowSR = feats.find(f => f.Name === 'Drow Spell Resistance')
    expect(drowSR).toBeDefined()
    const effects = Array.isArray(drowSR!.Effect) ? drowSR!.Effect : [drowSR!.Effect]
    expect(effects.some(e => e?.Type === 'SpellResistance')).toBe(true)
  })

  it('Drow Spell Resistance grants +6 SpellResistance when the race is selected', () => {
    const feats = loadFeats(DATA_DIR)
    const races = loadRaces(DATA_DIR)
    const classes = loadClasses(DATA_DIR)
    const build = {
      ...makeEmptyBuild(),
      race: 'Drow',
      classes: [{ name: 'Wizard', levels: 1 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      totalLevel: 1,
    }
    const stats = computeBuildStats(
      { ...emptyInput(), allRaces: races, allClasses: classes, allFeats: feats },
      build,
    )
    expect(stats.total('spellResistance')).toBeGreaterThanOrEqual(6)
  })

  it('normalises <NotHeroic/> to a boolean (Epic/Legendary heroic=false)', () => {
    const classes = loadClasses(DATA_DIR)
    const epic = classes.find(c => c.Name === 'Epic')
    const legendary = classes.find(c => c.Name === 'Legendary')
    const fighter = classes.find(c => c.Name === 'Fighter')
    expect(epic?.NotHeroic).toBe(true)
    expect(legendary?.NotHeroic).toBe(true)
    // A genuine heroic class has no flag at all.
    expect(fighter?.NotHeroic).toBeFalsy()
    // The heroic filter used by past-life gating must now exclude Epic/Legendary.
    const heroic = classes.filter(c => !c.NotHeroic).map(c => c.Name)
    expect(heroic).not.toContain('Epic')
    expect(heroic).not.toContain('Legendary')
    expect(heroic).toContain('Fighter')
  })

  it('derives Race.IsIconic from IconicClass presence (Race.cpp:84-87)', () => {
    const races = loadRaces(DATA_DIR)
    const bladeforged = races.find(r => r.Name === 'Bladeforged') // IconicClass = Paladin
    const drow = races.find(r => r.Name === 'Drow')               // no IconicClass
    expect(bladeforged?.IsIconic).toBe(true)
    expect(drow?.IsIconic).toBe(false)
  })

  it('Racial Completionist applies +2 all abilities when every heroic race is past-lifed', () => {
    const races = loadRaces(DATA_DIR)
    const classes = loadClasses(DATA_DIR)
    const feats = loadFeats(DATA_DIR)
    // Iconic races (IconicClass present) must NOT be required — they have no
    // racial past life. Gating set = heroic, non-iconic races (Race.cpp:84-87).
    const heroicRaces = races.filter(r => !r.NotHeroic && !r.IsIconic).map(r => r.Name)
    const pastLives: Record<string, number> = {}
    for (const rn of heroicRaces) pastLives[rn] = 3

    const build = {
      ...makeEmptyBuild(),
      race: 'Drow',
      classes: [{ name: 'Wizard', levels: 1 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      totalLevel: 1,
      pastLives,
    }
    const withRC = computeBuildStats(
      { ...emptyInput(), allRaces: races, allClasses: classes, allFeats: feats }, build,
    )
    const baseline = computeBuildStats(
      { ...emptyInput(), allRaces: races, allClasses: classes, allFeats: feats },
      { ...build, pastLives: {} },
    )
    // Racial Completionist contributes an AbilityBonus Item="All" of +2 to
    // every ability (other past-life ability bonuses also stack, so we assert
    // on the RC-sourced contribution directly rather than the net total).
    for (const ab of ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']) {
      const rc = withRC.resolve(`ability.${ab}`).bonuses
        .filter(b => /Racial Completionist/.test(b.source))
        .reduce((s, b) => s + b.value, 0)
      expect(rc).toBe(2)
      // And it must NOT fire without the past lives.
      const rcBaseline = baseline.resolve(`ability.${ab}`).bonuses
        .some(b => /Racial Completionist/.test(b.source))
      expect(rcBaseline).toBe(false)
    }
  })
})
