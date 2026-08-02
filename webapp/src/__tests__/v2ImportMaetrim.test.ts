// V2 → V3 import tests for the Maetrim_EndGameHandwrapsMonk.DDOBuild fixture.
//
// This build exercises several features not covered by the YingsMonk tests:
//   • ActiveBuildIndex = 34 (35 builds within one life; picks the active one)
//   • Filigrees and personality stored inside <EquippedGear>, not at build level
//   • Rare filigrees marked with an empty <Rare/> presence tag
//   • GuildLevel / ApplyGuildBuffs fields
//   • Multiple named gear sets (ActiveGear = "New artifact")

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')

function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

describe('V2 importer — Maetrim End-Game Handwraps Monk (Aasimar 20 Monk / 10 Epic / 6 Legendary)', () => {
  const xml = load('Maetrim_EndGameHandwrapsMonk.DDOBuild')
  const { build, warnings } = importV2Build(xml)

  it('parses without warnings', () => {
    expect(warnings).toEqual([])
  })

  it('picks the correct active build (index 34 out of 35)', () => {
    // The file has ActiveBuildIndex=34; the importer must read the 35th build,
    // which is the fully-levelled end-game snapshot. If it fell back to index 0
    // it would load an early progression build with far fewer levels.
    expect(build.totalLevel).toBe(20)
    expect(build.epicLevels).toBe(10)
    // 6 legendary levels since the V2 2.0.0.83 sync refreshed this example
    // save (V2's BUILD_START_LEVEL went 34 -> 36).
    expect(build.legendaryLevels).toBe(6)
  })

  it('imports race + alignment', () => {
    expect(build.race).toBe('Aasimar')
    expect(build.alignment).toBe('Lawful Neutral')
  })

  it('imports guild level and buff flag', () => {
    expect(build.guildLevel).toBe(200)
    expect(build.applyGuildBuffs).toBe(true)
  })

  it('imports sentient gem personality from gear set', () => {
    expect(build.sentientGem.personality).toBe('Sentient Jewel of the Kobold')
  })

  it('imports artifact filigrees with names and rare=true', () => {
    // Maetrim has rare artifact filigrees marked with empty <Rare/> elements.
    // fast-xml-parser emits '' for empty self-closing tags; the importer must
    // use key-existence rather than Boolean() to detect the rare flag.
    const first = build.artifactFiligreeSlots[0]
    expect(first.name).toBe("Snake Bite/Grandfather's Shield +2 Constitution")
    expect(first.rare).toBe(true)
  })

  it('imports multiple named gear sets and sets the active one', () => {
    // Active set renamed to 'Changed Again' by the V2 2.0.0.83 refresh of
    // this example save.
    expect(build.activeGearSetName).toBe('Changed Again')
    expect(build.gear['Helmet']).toContain('Skullcap')
    expect(build.gear['Main Hand']).toBeTruthy()
  })

  it('imports heroic enhancement trees', () => {
    expect(build.enhancementChoices['Shintao']).toBeDefined()
    expect(build.enhancementChoices['Falconry']).toBeDefined()
    expect(Object.keys(build.enhancementChoices['Shintao']).length).toBeGreaterThan(5)
  })

  it('imports past lives (75 heroic + 54 epic = many lives lived)', () => {
    const totalPastLives = Object.values(build.pastLives).reduce((s, n) => s + n, 0)
    expect(totalPastLives).toBeGreaterThanOrEqual(129)
  })

  it('imports ability scores from spend table', () => {
    // V2 `<XxxSpend>` = value increase above 8 (score = 8 + spend).
    expect(build.baseAbilities.Strength).toBe(8)    // StrSpend=0 → 8
    expect(build.baseAbilities.Dexterity).toBe(11)  // DexSpend=3 → 11
    expect(build.baseAbilities.Wisdom).toBe(17)     // WisSpend=9 → 17
  })
})
