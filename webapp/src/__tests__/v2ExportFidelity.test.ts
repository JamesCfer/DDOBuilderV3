// V2 exporter structural fidelity — required-element guarantees.
//
// The real V2 Windows app (2.0.0.81) loads .DDOBuild files through generated
// SAX readers (XmlLib/DLMacros.h). Children declared with the non-optional
// macro variants (DL_SIMPLE / DL_ENUM / DL_STRING / DL_VECTOR / DL_OBJECT)
// are verified in the element's EndElement handler (DL_GENERIC_MISSING,
// DLMacros.h:607): if the parent element exists but a required child is
// absent, V2 aborts the load with
//   "The XML parser reported the following problem: <Parent> was missing
//    <Child> element"
// (proven live with a V3 export whose <SkillTomes/> was empty).
//
// This test codifies the full required-children map derived from the V2
// headers and asserts every element the exporter emits satisfies it, for
// - a minimal V3-authored build (no catalogue → default item fields),
// - a fuzz-generated build with full catalogue gear embedding, and
// - re-exports of the two genuine V2-authored fixtures.
// The map itself is validated against the V2-authored fixtures (they must
// pass, or the map is over-strict).

import { describe, expect, it, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XMLParser } from 'fast-xml-parser'
import { emptyBuild } from '../types/ddo'
import type { Item } from '../types/ddo'
import { exportV2Build, exportV2DocumentModel, V2_SKILL_TOMES } from '../lib/v2Export'
import { importV2Document } from '../lib/v2Import'
import { loadAllCatalogues } from '../server/dataLoaders'
import type { LoadedCatalogues } from '../server/dataLoaders'
import { generateRandomBuild } from '../lib/fuzz/randomBuild'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

// ---------------------------------------------------------------------------
// Required-children map (V2 SAX contract)
// ---------------------------------------------------------------------------

const SKILLS = V2_SKILL_TOMES.map(([v2]) => v2)

/** EquippedGear slot elements — each holds an Item (Item.h Item_PROPERTIES). */
const SLOT_ITEMS = [
  'Helmet', 'Necklace', 'Trinket', 'Cloak', 'Belt', 'Goggles', 'Gloves',
  'Boots', 'Bracers', 'Armor', 'MainHand', 'OffHand', 'Quiver', 'Arrow',
  'Ring1', 'Ring2', 'CosmeticHelm', 'CosmeticArmor', 'CosmeticCloak',
  'CosmeticWeapon1', 'CosmeticWeapon2',
]
const ITEM_REQUIRED = ['Name', 'Description', 'MinLevel', 'EquipmentSlot']

/** element name → children V2's SAX reader requires when the element exists. */
const REQUIRED: Record<string, string[]> = {
  // Character.h Character_PROPERTIES
  Character: [
    'StrTome', 'DexTome', 'ConTome', 'IntTome', 'WisTome', 'ChaTome',
    'SpecialFeats', 'SkillTomes', 'ActiveLifeIndex', 'ActiveBuildIndex',
  ],
  // SkillTomes.h — all 21 skills, each a required DL_SIMPLE
  SkillTomes: SKILLS,
  // Life.h Life_PROPERTIES
  Life: ['Name', 'Race', 'Alignment', 'SpecialFeats'],
  // Build.h Build_PROPERTIES
  Build: [
    'Level', 'Class1', 'Class2', 'Class3', 'AbilitySpend', 'ActiveStances',
    'Destiny_SelectedTrees', 'Enhancement_SelectedTrees', 'Reaper_SelectedTrees',
    'ActiveAttackChain', 'ActiveGear', 'FavorFeats', 'Notes',
    'Level4', 'Level8', 'Level12', 'Level16', 'Level20',
    'Level24', 'Level28', 'Level32', 'Level36', 'Level40',
  ],
  // AbilitySpend.h
  AbilitySpend: [
    'AvailableSpend', 'StrSpend', 'DexSpend', 'ConSpend', 'IntSpend',
    'WisSpend', 'ChaSpend',
  ],
  // LevelTraining.h
  LevelTraining: ['SkillPointsAvailable', 'SkillPointsSpent'],
  // TrainedFeat.h / TrainedSkill.h / TrainedSpell.h
  TrainedFeat: ['FeatName', 'Type', 'LevelTrainedAt'],
  TrainedSkill: ['Skill'],
  TrainedSpell: ['Class', 'Level', 'SpellName'],
  // SpendInTree.h + TrainedEnhancement.h
  EnhancementSpendInTree: ['TreeName', 'TreeVersion'],
  ReaperSpendInTree: ['TreeName', 'TreeVersion'],
  DestinySpendInTree: ['TreeName', 'TreeVersion'],
  TrainedEnhancement: ['EnhancementName', 'Ranks'],
  // AttackChain.h
  AttackChain: ['Name'],
  // EquippedGear.h
  EquippedGear: ['Name', 'NumFiligrees'],
  // ItemAugment.h — <Type> required even for empty padding slots
  ItemAugment: ['Type'],
  // TrainedFiligree.h
  Filigree: ['Name'],
  ArtifactFiligree: ['Name'],
  // Buff.h
  Buff: ['Type'],
}

// Parse with every element as an array so single/multiple children look alike.
const structParser = new XMLParser({
  ignoreAttributes: true,
  isArray: () => true,
  // A leaf like <Notes/> parses to '' — normalise to object-less leaf below.
})

type Node = Record<string, unknown>

/**
 * Walk the parsed tree and collect one violation string per element instance
 * that is missing a V2-required child.
 */
function findMissingRequired(xml: string): string[] {
  const doc = structParser.parse(xml) as Node
  const violations: string[] = []
  const visit = (tag: string, node: unknown, parentTag: string, path: string) => {
    if (node === null || typeof node !== 'object') {
      // Leaf text — still counts as an existing element with NO children.
      node = {}
    }
    const rec = node as Node
    const kids = Object.keys(rec)
    let required = REQUIRED[tag]
    if (!required && parentTag === 'EquippedGear' && SLOT_ITEMS.includes(tag)) {
      required = ITEM_REQUIRED
    }
    if (required) {
      for (const r of required) {
        if (!kids.includes(r)) violations.push(`${path} missing <${r}>`)
      }
    }
    for (const k of kids) {
      const v = rec[k]
      const list = Array.isArray(v) ? v : [v]
      for (const child of list) visit(k, child, tag, `${path}/${k}`)
    }
  }
  for (const [k, v] of Object.entries(doc)) {
    for (const child of Array.isArray(v) ? v : [v]) visit(k, child, '', `/${k}`)
  }
  return violations
}

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

// ---------------------------------------------------------------------------
// Map sanity: genuine V2-authored files must satisfy the map
// ---------------------------------------------------------------------------

describe('required-children map is not over-strict', () => {
  it.each(['YingsMonk.DDOBuild', 'Maetrim_EndGameHandwrapsMonk.DDOBuild'])(
    'V2-authored fixture %s passes the map', (file) => {
      expect(findMissingRequired(loadFixture(file))).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// V3-authored builds (no catalogue) — the live-app failure mode
// ---------------------------------------------------------------------------

describe('exportV2Build emits every V2-required element (no catalogue)', () => {
  it('SkillTomes always contains all 21 skill elements', () => {
    const xml = exportV2Build(emptyBuild())
    for (const skill of SKILLS) {
      expect(xml, `SkillTomes must contain <${skill}>`).toContain(`<${skill}>`)
    }
    expect(SKILLS).toHaveLength(21)
  })

  it('skill tomes keyed by V3 display names land in the V2 elements', () => {
    const build = emptyBuild()
    build.skillTomes = { 'Disable Device': 3, 'Use Magic Device': 2, Balance: 1 }
    const xml = exportV2Build(build)
    expect(xml).toContain('<DisableDevice>3</DisableDevice>')
    expect(xml).toContain('<UMD>2</UMD>')
    expect(xml).toContain('<Balance>1</Balance>')
  })

  it('an empty V3 build satisfies the whole required-children map', () => {
    const violations = findMissingRequired(exportV2Build(emptyBuild()))
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('gear emitted without a catalogue still carries required Item children', () => {
    const build = emptyBuild()
    build.gear = { Helmet: 'Mystery Hat', Ring: 'Mystery Ring' }
    // Augment at index 1 forces an index-0 padding <ItemAugment>, which must
    // still carry the required <Type> child.
    build.augmentChoices = { 'Helmet:Blue Augment Slot:1': 'Sapphire of Whatever' }
    const xml = exportV2Build(build)
    const violations = findMissingRequired(xml)
    expect(violations, violations.join('\n')).toEqual([])
    expect(xml).toContain('<Helmet>')
    expect(xml).toContain('<EquipmentSlot>')
  })

  it('always writes Reaper_SelectedTrees, Notes and all ten Level-up elements', () => {
    const xml = exportV2Build(emptyBuild())
    expect(xml).toContain('<Reaper_SelectedTrees>')
    expect(xml).toContain('<Notes/>')
    for (const lvl of [4, 8, 12, 16, 20, 24, 28, 32, 36, 40]) {
      expect(xml).toContain(`<Level${lvl}>`)
    }
  })
})

// ---------------------------------------------------------------------------
// Fuzz build + real fixtures with full catalogue gear embedding
// ---------------------------------------------------------------------------

describe.skipIf(!haveData)('required elements with real catalogues', () => {
  let cat: LoadedCatalogues
  let itemMap: Map<string, Item>

  beforeAll(() => {
    cat = loadAllCatalogues(DATA_DIR)
    itemMap = new Map(cat.allItems.map(i => [i.Name, i]))
  }, 120_000)

  it('fuzz build (seed 9000) export satisfies the map, incl. embedded gear', () => {
    const { build } = generateRandomBuild(cat, { seed: 9000 })
    const xml = exportV2Build(build, itemMap)
    const violations = findMissingRequired(xml)
    expect(violations, violations.join('\n')).toEqual([])
    for (const skill of SKILLS) expect(xml).toContain(`<${skill}>`)
  }, 60_000)

  it.each(['YingsMonk.DDOBuild', 'Maetrim_EndGameHandwrapsMonk.DDOBuild'])(
    '%s re-export loses no required element vs the original', (file) => {
      const doc = importV2Document(loadFixture(file)).document
      const exported = exportV2DocumentModel(doc, itemMap)
      const violations = findMissingRequired(exported)
      expect(violations, violations.join('\n')).toEqual([])
      // The original satisfied the map (test above); the re-export satisfying
      // it too means no required element was lost anywhere in the tree.
    }, 60_000)
})
