// V2 → V3 import tests using the real example build files V2 ships in
// `Output/Example Builds/`. The test asserts that the importer produces a
// structurally-correct V3 CharacterBuild from a known-good V2 .DDOBuild.
//
// V2 source file: Output/Example Builds/YingsMonk.DDOBuild
// Expected stats (from the file's per-level state):
//   Race: Aasimar
//   Alignment: Lawful Neutral
//   Total Level: 34 (20 heroic Monk + 10 Epic + 4 Legendary)
//   Active stances include "Lawful", "Aasimar", "Centered" etc.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')

function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

describe('V2 importer — Yings Monk (Aasimar 20 Monk / 10 Epic / 4 Legendary)', () => {
  const xml = load('YingsMonk.DDOBuild')
  const { build, warnings } = importV2Build(xml)

  it('parses without warnings', () => {
    expect(warnings).toEqual([])
  })

  it('imports race + alignment', () => {
    expect(build.race).toBe('Aasimar')
    expect(build.alignment).toBe('Lawful Neutral')
  })

  it('has 20 heroic levels of Monk', () => {
    expect(build.totalLevel).toBe(20)
    expect(build.classes[0].name).toBe('Monk')
    expect(build.classes[0].levels).toBe(20)
    expect(build.levelClasses?.length).toBe(20)
    expect(build.levelClasses?.every(c => c === 'Monk')).toBe(true)
  })

  it('has 10 Epic + 4 Legendary tier levels', () => {
    expect(build.epicLevels).toBe(10)
    expect(build.legendaryLevels).toBe(4)
  })

  it('imports many active stances', () => {
    expect(build.activeBuffs).toContain('Lawful')
    expect(build.activeBuffs).toContain('Aasimar')
    expect(build.activeBuffs).toContain('Centered')
    expect(build.activeBuffs).toContain('Two Weapon Fighting')
  })

  it('imports past lives (heroic + racial completionist)', () => {
    // Yings Monk has every heroic past life maxed (3 each).
    expect(build.pastLives['Monk']).toBeGreaterThanOrEqual(3)
    expect(build.pastLives['Fighter']).toBeGreaterThanOrEqual(3)
  })

  it('imports skill ranks and the per-level skill array', () => {
    // Yings allocates 4 ranks of Concentration at level 1 (12 SP × class skill).
    expect(build.skillRanks['Concentration']).toBeGreaterThanOrEqual(4)
    expect(build.skillRanksByLevel?.[1]?.['Concentration']).toBe(4)
  })

  it('imports tomes (character-scoped)', () => {
    expect(build.abilityTomes.Strength).toBe(8)
    expect(build.abilityTomes.Wisdom).toBe(8)
  })

  it('imports ability scores from spend table', () => {
    // V2 `<XxxSpend>` is the VALUE INCREASE above 8 (score = 8 + spend),
    // confirmed against Build::AbilityAtLevel and the v2calc oracle.
    // Yings: WisSpend=10 → 18, ConSpend=9 → 17, IntSpend=0 → 8.
    expect(build.baseAbilities.Wisdom).toBe(18)
    expect(build.baseAbilities.Constitution).toBe(17)
    expect(build.baseAbilities.Intelligence).toBe(8)
  })

  it('imports destiny tree selection (active Tier5 = Legendary Dreadnought)', () => {
    // YingsMonk's Destiny_SelectedTrees lists Fury of the Wild / Shadowdancer
    // / Legendary Dreadnought / Divine Crusader, with Tier5Tree =
    // "Legendary Dreadnought".
    expect(build.selectedDestinyTrees.includes('Fury of the Wild')).toBe(true)
    expect(build.selectedDestinyTrees.includes('Shadowdancer')).toBe(true)
    expect(build.activeEpicDestiny).toBe('Legendary Dreadnought')
  })

  it('imports heroic enhancement trees (Henshin Mystic, Shintao, etc.)', () => {
    expect(build.enhancementChoices['Shintao']).toBeDefined()
    expect(build.enhancementChoices['Henshin Mystic']).toBeDefined()
    // Each tree carries actual rank choices keyed by enhancement internal name.
    expect(Object.keys(build.enhancementChoices['Shintao']).length).toBeGreaterThan(5)
  })

  it('imports gear (named gear set + slot map)', () => {
    expect(build.activeGearSetName).toBe('Standard')
    expect(build.gear['Helmet']).toContain('Skullcap')
    expect(build.gear['Necklace']).toBeTruthy()
    expect(build.gear['Armor']).toBeTruthy()
  })

  it('imports gear augments (slot:type:idx → augment name)', () => {
    // Helmet has a Green / Colorless augment slot in the file.
    const helmetAugs = Object.entries(build.augmentChoices)
      .filter(([k]) => k.startsWith('Helmet:'))
    expect(helmetAugs.length).toBeGreaterThan(0)
    const greenSlot = helmetAugs.find(([k]) => k.includes('Green'))
    expect(greenSlot?.[1]).toContain('Sapphire')
  })
})
