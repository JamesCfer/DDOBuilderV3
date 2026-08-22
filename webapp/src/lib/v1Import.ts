// V1 .ddocp XML → V3 CharacterDocument importer.
//
// DDOBuilder V1 stored a single character per file under a
// <DDOCharacterData>/<Character> root (no Life/Build hierarchy). V2 imports
// these via "File → Import V1 file..." (CDDOBuilderApp::OnFileImport,
// DDOBuilder.cpp:294-325) which parses the file with the Legacy* SAX classes
// and converts it with CDDOBuilderApp::ConvertToNewDataStructure
// (DDOBuilder.cpp:1793-1949). This module ports that exact pipeline to V3,
// producing the same CharacterDocument model v2Import.ts produces (a document
// with a single Life containing a single Build).
//
// V2 sources cited:
//   LegacyCharacter.h:33-74          <Character> child schema
//   LegacyEquippedGear.{h,cpp}       <EquippedGear> slots (element "EquippedGear")
//   LegacyItem.cpp:45-59             item-name fixups (Legendary Greensteel)
//   LegacySentientJewel.{h,cpp}      <SentientJewel> incl. deprecated Filigree1-8
//   SelectedTrees.cpp:139-176        TranslateNamesFromV1 (tree-name migration)
//   SpendInTree.cpp                  TranslateNamesFromV1 (same table, spend trees)
//   TrainedFeat.cpp:151-...          TranslateOldFeatNames (feat-name migration)
//   TrainedFiligree.cpp              TranslateOldNamesFromV1 (filigree migration)
//   DDOBuilder.cpp:1793-1949         ConvertToNewDataStructure (field mapping)

import { XMLParser } from 'fast-xml-parser'
import type {
  Ability, BuildClass, CharacterBuild, CharacterDocument, FiligreeSlot, Life,
} from '../types/ddo'
import { emptyBuild } from '../types/ddo'

// ---------------------------------------------------------------------------
// XML parsing
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name, jpath) => {
    // DL_OBJECT_LIST / DL_OBJECT_VECTOR members repeat their element directly
    // (no wrapper element), see XmlLib/DLMacros.h DL_OBJECT_LIST_START.
    const ALWAYS_ARRAY = new Set([
      'TrainedFeat', 'TrainedSkill', 'TrainedEnhancement', 'TrainedSpell',
      'LevelTraining', 'EquippedGear', 'ItemAugment',
      'EnhancementSpendInTree', 'ReaperSpendInTree', 'DestinySpendInTree',
    ])
    if (ALWAYS_ARRAY.has(name)) return true
    if (name === 'Stances' && /ActiveStances/.test(jpath)) return true
    // V1 selected-tree containers are SelectedEnhancementTrees /
    // SelectedDestinyTrees (LegacyEnhancementSelectedTrees.cpp /
    // LegacyDestinySelectedTrees.cpp), each a DL_STRING_VECTOR of <TreeName>.
    if (name === 'TreeName' && /Selected(Enhancement|Destiny)Trees/.test(jpath)) return true
    if (name === 'Filigree' && /SentientJewel/.test(jpath)) return true
    if (name === 'ArtifactFiligree' && /SentientJewel/.test(jpath)) return true
    // DL_STRING_LIST at Character level (LegacyCharacter.h:73).
    if (name === 'SelfAndPartyBuffs') return true
    return false
  },
})

// ---------------------------------------------------------------------------
// Helpers (mirrors of v2Import.ts module-private helpers; not exported there)
// ---------------------------------------------------------------------------

type AnyRec = Record<string, unknown>

function arr<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function asStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return ''
}

function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function getRec(parent: AnyRec, key: string): AnyRec | undefined {
  const v = parent[key]
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as AnyRec
  return undefined
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ---------------------------------------------------------------------------
// V1 → V2 name-translation tables
// ---------------------------------------------------------------------------

/**
 * Enhancement / destiny tree renames, applied to both selected-tree lists
 * (SelectedTrees::TranslateNamesFromV1, SelectedTrees.cpp:139-176, including
 * the Tier5Tree value) and tree-spend blocks (SpendInTree::TranslateNamesFromV1,
 * SpendInTree.cpp — identical table).
 */
const TREE_NAME_TRANSLATIONS: Record<string, string> = {
  'Ravager': 'Ravager (Barbarian)',
  'Ravager (Ftr)': 'Ravager (Fighter)',
  'Arch-Mage': 'Archmage',
  'Dark Bargainer': 'Dhampir Dark Bargainer',
}

function translateTreeName(name: string): string {
  return TREE_NAME_TRANSLATIONS[name] ?? name
}

/**
 * Feat renames applied by TrainedFeat::TranslateOldFeatNames
 * (TrainedFeat.cpp:151ff) when V1/V2 files are parsed. V2 runs this in
 * TrainedFeat::EndElement, i.e. for every trained feat (per-level feats AND
 * SpecialFeats).
 */
const FEAT_NAME_TRANSLATIONS: Record<string, string> = (() => {
  const map: Record<string, string> = {
    'Purity of Heart': 'Purity of Spirit',
    'Warlock: Pact: Fey': 'Pact: Fey',
    'Warlock: Pact: Fiend': 'Pact: Fiend',
    'Warlock: Pact: Great Old One': 'Pact: Great Old One',
    'Warlock: Pact: Celestial': 'Pact: Celestial',
    'Warlock: Pact: The Abyss': 'Pact: The Abyss',
    'Warlock: Pact: The Carceri Storm': 'Pact: The Carceri Storm',
    'Past Life: Bard (Stormsinger)': 'Past Life: Bard - Stormsinger',
    'Past Life: Cleric (Dark Apostate)': 'Past Life: Cleric - Dark Apostate',
    'Past Life: Druid (Blight Caster)': 'Past Life: Druid - Blight Caster',
    'Past Life: Fighter (Dragon Lord)': 'Past Life: Fighter - Dragon Lord',
    'Past Life: Paladin (Sacred Fist)': 'Past Life: Paladin - Sacred Fist',
    'Past Life: Ranger (Dark Hunter)': 'Past Life: Ranger - Dark Hunter',
    'Past Life: Sorcerer (Wild Mage)': 'Past Life: Sorcerer - Wild Mage',
    'Past Life: Warlock (Acolyte of the Skin)': 'Past Life: Warlock - Acolyte of the Skin',
    "Amaunator's Brilliance": "Amaunator's Flames",
  }
  // Cleric domain feats: "<X> Domain Tier I..IV" → "Domain of <Y>" /
  // "Improved …" / "Greater …" / "Master of the Domain of …". Old names use
  // the singular domain ("Animal"), new names sometimes pluralise ("Animals").
  // Fire deliberately maps only Tier I and Tier IV — V2 leaves Fire II/III
  // alone (commented out in TrainedFeat.cpp).
  const domains: [string, string][] = [
    ['Air', 'Air'], ['Animal', 'Animals'], ['Chaos', 'Chaos'],
    ['Death', 'Death'], ['Destruction', 'Destruction'], ['Earth', 'Earth'],
    ['Good', 'Good'], ['Healing', 'Healing'], ['Knowledge', 'Knowledge'],
    ['Law', 'Law'], ['Luck', 'Luck'], ['Magic', 'Magic'],
    ['Protection', 'Protection'], ['Strength', 'Strength'], ['Sun', 'Sun'],
    ['Trickery', 'Trickery'], ['War', 'War'], ['Water', 'Water'],
  ]
  for (const [oldD, newD] of domains) {
    map[`${oldD} Domain Tier I`] = `Domain of ${newD}`
    map[`${oldD} Domain Tier II`] = `Improved Domain of ${newD}`
    map[`${oldD} Domain Tier III`] = `Greater Domain of ${newD}`
    map[`${oldD} Domain Tier IV`] = `Master of the Domain of ${newD}`
  }
  map['Fire Domain Tier I'] = 'Domain of Fire'
  delete map['Fire Domain Tier II']
  delete map['Fire Domain Tier III']
  map['Fire Domain Tier IV'] = 'Master of the Domain of Fire'
  return map
})()

function translateFeatName(name: string): string {
  return FEAT_NAME_TRANSLATIONS[name] ?? name
}

/**
 * Filigree renames (TrainedFiligree::TranslateOldNamesFromV1,
 * TrainedFiligree.cpp), applied by ConvertToNewDataStructure to both weapon
 * and artifact filigrees (DDOBuilder.cpp:1902, 1925).
 */
const FILIGREE_NAME_TRANSLATIONS: Record<string, string> = {
  'The Serpent: Negative and Poison Spellpower': 'The Serpent: +9 Negative/Poison Spell Power',
  'Eye of the Beholder: Spellpower': 'Eye of the Beholder: +6 Universal Spell Power',
  'Lunar Magic: Universal Spellpower': 'Lunar Magic: +6 Universal Spell Power',
  "Nystul's Mystical Defence: Constitution": "Nystul's Mystical Defense: +1 Constitution",
  "Nystul's Mystical Defence: Electric Absorption": "Nystul's Mystical Defense: +5% Electric Absorption",
  "Nystul's Mystical Defence/Electrocution: +6 MRR": "Nystul's Mystical Defense/Electrocution +6 MRR",
}

function translateFiligreeName(name: string): string {
  return FILIGREE_NAME_TRANSLATIONS[name] ?? name
}

/**
 * Item-name fixups applied by LegacyItem::EndElement (LegacyItem.cpp:45-59):
 * "Legendary Greensteel" items were renamed "Legendary Green Steel" and their
 * "Helmet" suffix became "Helm".
 */
function translateItemName(name: string): string {
  if (!name.includes('Legendary Greensteel')) return name
  return name
    .split('Legendary Greensteel').join('Legendary Green Steel')
    .split('Helmet').join('Helm')
}

// ---------------------------------------------------------------------------
// Point-buy spend → score (same table as v2Import; V1 BuildPoints is the same
// AbilitySpend structure, mapped via Set_BuildPoints at DDOBuilder.cpp:1821)
// ---------------------------------------------------------------------------

const COST_TO_SCORE: Record<number, number> = {
  0: 8, 1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 8: 15, 10: 16, 13: 17, 16: 18,
}

function spendToScore(spent: number): number {
  let best = 8
  for (const [costStr, scoreVal] of Object.entries(COST_TO_SCORE)) {
    const cost = Number(costStr)
    if (cost <= spent && scoreVal > best) best = scoreVal
  }
  return best
}

// ---------------------------------------------------------------------------
// Feat slot key construction (mirrors v2Import.ts buildFeatSlotKey — V2's
// ConvertToNewDataStructure replays each LevelTraining feat through
// Build::TrainFeat at DDOBuilder.cpp:1832-1840, which is exactly what the
// slot-key reconstruction below models for V3.)
// ---------------------------------------------------------------------------

const HEROIC_UNIVERSAL_LEVELS = new Set([1, 3, 6, 9, 12, 15, 18])

const RACE_FEAT_TYPES = new Set([
  'Aasimar Bond',
  'Dark Gift',
  'Dragonborn Racial',
  'Dilettante Feat',
  'Human Bonus Feat',
  'Purple Dragon Knight Bonus Feat',
  'Animalistic Aspect',
])

function buildFeatSlotKey(
  charLvl: number,
  className: string,
  featType: string,
  heroicSlice: string[],
  counters: Record<string, number>,
): string {
  if (className === 'Epic' && charLvl > 20) {
    const epicLevel = charLvl - 20
    const ck = `epic-${epicLevel}-${featType}`
    const idx = counters[ck] ?? 0
    counters[ck] = idx + 1
    return `epic-${epicLevel}-${featType}-${idx}`
  }
  if (className === 'Legendary' && charLvl > 30) {
    const legLevel = charLvl - 30
    const ck = `legendary-${legLevel}-${featType}`
    const idx = counters[ck] ?? 0
    counters[ck] = idx + 1
    return `legendary-${legLevel}-${featType}-${idx}`
  }
  if (featType === 'Standard' && HEROIC_UNIVERSAL_LEVELS.has(charLvl)) {
    return `heroic-${charLvl}`
  }
  if (RACE_FEAT_TYPES.has(featType)) {
    const ck = `race-${charLvl}-${featType}`
    const idx = counters[ck] ?? 0
    counters[ck] = idx + 1
    return `race-${charLvl}-${featType}-${idx}`
  }
  const classLevel = heroicSlice.slice(0, charLvl).filter(c => c === className).length
  const ck = `${className}-${classLevel}-${featType}`
  const idx = counters[ck] ?? 0
  counters[ck] = idx + 1
  return `${className}-${classLevel}-${featType}-${idx}`
}

// ---------------------------------------------------------------------------
// Sub-parsers
// ---------------------------------------------------------------------------

/**
 * Parse a tree-spend block list (EnhancementSpendInTree / DestinySpendInTree /
 * ReaperSpendInTree). Tree names go through the V1→V2 rename table
 * (SpendInTree::TranslateNamesFromV1).
 */
function parseTreeSpend(characterNode: AnyRec, tag: string): {
  choices: Record<string, Record<string, number>>
  selections: Record<string, Record<string, string>>
  pinned: string[]
} {
  const choices: Record<string, Record<string, number>> = {}
  const selections: Record<string, Record<string, string>> = {}
  const pinned: string[] = []

  for (const t of arr(characterNode[tag] as AnyRec | AnyRec[] | undefined)) {
    const tr = t as AnyRec
    const treeName = translateTreeName(asStr(tr.TreeName))
    if (!treeName || treeName === 'No selection') continue
    const tChoices: Record<string, number> = {}
    const tSelections: Record<string, string> = {}
    for (const e of arr(tr.TrainedEnhancement as AnyRec | AnyRec[] | undefined)) {
      const er = e as AnyRec
      const name = asStr(er.EnhancementName ?? er.Name)
      const ranks = asNum(er.Ranks)
      const sel = asStr(er.Selection)
      if (!name) continue
      if (ranks > 0) tChoices[name] = ranks
      if (sel) tSelections[name] = sel
    }
    if (Object.keys(tChoices).length > 0) {
      choices[treeName] = tChoices
      pinned.push(treeName)
    }
    if (Object.keys(tSelections).length > 0) selections[treeName] = tSelections
  }
  return { choices, selections, pinned }
}

/** Selected-tree container (<SelectedEnhancementTrees>/<SelectedDestinyTrees>). */
function parseSelectedTrees(node: AnyRec | undefined): { trees: string[]; tier5: string } {
  if (!node) return { trees: [], tier5: '' }
  const trees = arr(node.TreeName as string | string[] | undefined)
    .map(asStr)
    .filter(t => t && t !== 'No selection')
    .map(translateTreeName)
  return { trees, tier5: translateTreeName(asStr(node.Tier5Tree)) }
}

/**
 * V1 gear slots (LegacyEquippedGear.h:31-51) → V3 slot keys. Cosmetic slots
 * have no V3 equivalent and are reported as warnings. Same slot key targets
 * as v2Import's V2_TO_V3_SLOT.
 */
const V1_TO_V3_SLOT: Record<string, string> = {
  Helmet: 'Helmet', Necklace: 'Necklace', Trinket: 'Trinket', Cloak: 'Cloak',
  Belt: 'Belt', Goggles: 'Goggles', Gloves: 'Gloves', Boots: 'Boots',
  Bracers: 'Bracers', Armor: 'Armor', Ring1: 'Ring', Ring2: 'Ring2',
  MainHand: 'Main Hand', OffHand: 'Off Hand', Quiver: 'Quiver', Arrow: 'Arrow',
}

const V1_COSMETIC_SLOTS = [
  'CosmeticArmor', 'CosmeticCloak', 'CosmeticHelm', 'CosmeticWeapon1', 'CosmeticWeapon2',
]

function parseGearSet(gearNode: AnyRec, warnings: string[]): {
  gear: Record<string, string>
  augmentChoices: Record<string, string>
} {
  const gear: Record<string, string> = {}
  const augmentChoices: Record<string, string> = {}
  for (const [v1Slot, v3Slot] of Object.entries(V1_TO_V3_SLOT)) {
    const item = getRec(gearNode, v1Slot)
    if (!item) continue
    const name = translateItemName(asStr(item.Name))
    if (!name) continue
    gear[v3Slot] = name
    // <ItemAugment> children carry Type + SelectedAugment (LegacyItem.h:28).
    // V2 reconciles these against the live item database
    // (Build::GetLatestVersionOfItem, Build.cpp:4491); V3 keeps the selected
    // augment names verbatim and lets the gear panel resolve them.
    const augs = arr(item.ItemAugment as AnyRec | AnyRec[] | undefined)
    for (let augIdx = 0; augIdx < augs.length; augIdx++) {
      const ar = augs[augIdx] as AnyRec
      const type = asStr(ar.Type)
      const augName = asStr(ar.SelectedAugment)
      if (!type || !augName) continue
      augmentChoices[`${v3Slot}:${type}:${augIdx}`] = augName
    }
  }
  const setName = asStr(gearNode.Name)
  for (const slot of V1_COSMETIC_SLOTS) {
    const item = getRec(gearNode, slot)
    if (item && asStr(item.Name)) {
      warnings.push(
        `Gear set "${setName}": cosmetic item "${asStr(item.Name)}" (${slot}) has no V3 slot; skipped.`,
      )
    }
  }
  return { gear, augmentChoices }
}

/**
 * Parse the <SentientJewel> of a gear set (LegacySentientJewel.h). Includes
 * the deprecated <Filigree1>..<Filigree8>/<RareFiligree1>.. backwards-compat
 * fields, which V2 folds into the Filigrees list in
 * LegacySentientJewel::EndElement. Filigree names go through
 * TranslateOldNamesFromV1 (DDOBuilder.cpp:1902/1925).
 */
function parseSentientJewel(jewel: AnyRec | undefined, count: { weapon: number; artifact: number }): {
  personality: string
  filigrees: FiligreeSlot[]
  artifactFiligrees: FiligreeSlot[]
} {
  const filigrees: FiligreeSlot[] = []
  const artifactFiligrees: FiligreeSlot[] = []
  let personality = ''
  if (jewel) {
    personality = asStr(jewel.Personality)
    for (const f of arr(jewel.Filigree as AnyRec | AnyRec[] | undefined)) {
      const fr = (f && typeof f === 'object' ? f : {}) as AnyRec
      filigrees.push({
        name: translateFiligreeName(asStr(fr.Name ?? f)),
        rare: 'Rare' in fr,
      })
    }
    // Deprecated FiligreeN / RareFiligreeN pairs (very old V1 files).
    for (let i = 1; i <= 8; i++) {
      const name = asStr(jewel[`Filigree${i}`])
      if (!name) continue
      filigrees.push({
        name: translateFiligreeName(name),
        rare: `RareFiligree${i}` in jewel,
      })
    }
    for (const f of arr(jewel.ArtifactFiligree as AnyRec | AnyRec[] | undefined)) {
      const fr = (f && typeof f === 'object' ? f : {}) as AnyRec
      const name = translateFiligreeName(asStr(fr.Name ?? f))
      if (!name) continue
      artifactFiligrees.push({ name, rare: 'Rare' in fr })
    }
  }
  while (filigrees.length < count.weapon) filigrees.push({ name: '', rare: false })
  while (artifactFiligrees.length < count.artifact) artifactFiligrees.push({ name: '', rare: false })
  return {
    personality,
    filigrees: filigrees.slice(0, count.weapon),
    artifactFiligrees: artifactFiligrees.slice(0, count.artifact),
  }
}

/**
 * Parse the Character-level <SpecialFeats> FeatsListObject
 * (LegacyCharacter.h:47, applied via Character::AddSpecialFeats at
 * DDOBuilder.cpp:1828). Past-life feats fold into pastLives; everything else
 * becomes a Life-level special feat. Feat names go through the V1 rename
 * table first (TrainedFeat::EndElement).
 */
function parseSpecialFeats(node: AnyRec | undefined): {
  pastLives: Record<string, number>
  pastLifeTypes: Record<string, string>
  feats: string[]
} {
  const pastLives: Record<string, number> = {}
  const pastLifeTypes: Record<string, string> = {}
  const feats: string[] = []
  if (!node) return { pastLives, pastLifeTypes, feats }
  for (const f of arr(node.TrainedFeat as AnyRec | AnyRec[] | undefined)) {
    const fr = f as AnyRec
    const name = translateFeatName(asStr(fr.FeatName))
    const type = asStr(fr.Type)
    if (!name) continue
    if (type === 'HeroicPastLife' || type === 'RacialPastLife') {
      const key = name.replace(/^Past Life:\s*/, '')
      pastLives[key] = (pastLives[key] ?? 0) + 1
      pastLifeTypes[key] = type
    } else if (type === 'EpicPastLife' || type === 'IconicPastLife') {
      pastLives[name] = (pastLives[name] ?? 0) + 1
      pastLifeTypes[name] = type
    } else {
      feats.push(name)
    }
  }
  return { pastLives, pastLifeTypes, feats }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface V1ImportResult {
  document: CharacterDocument
  warnings: string[]
}

/** True when the XML's root element is V1's <DDOCharacterData>. */
export function isV1CharacterXml(text: string): boolean {
  return /<\s*DDOCharacterData[\s>]/.test(text)
}

/**
 * Import a DDOBuilder V1 .ddocp file. Produces a CharacterDocument with a
 * single Life containing a single Build (V2's ConvertToNewDataStructure also
 * creates exactly one new life + build for the import, DDOBuilder.cpp:1801).
 */
export function importV1Build(xml: string): V1ImportResult {
  const warnings: string[] = []

  let parsed: AnyRec
  try {
    parsed = parser.parse(xml) as AnyRec
  } catch (err) {
    warnings.push(`V1 import: XML parse error: ${err instanceof Error ? err.message : String(err)}`)
    return { document: emptyDocument(), warnings }
  }

  // An empty <DDOCharacterData/> parses to '' rather than an object, so test
  // key presence separately from object-ness.
  const hasRoot = 'DDOCharacterData' in parsed
  const root = getRec(parsed, 'DDOCharacterData')
  const character = root ? getRec(root, 'Character') : undefined
  if (!hasRoot) {
    warnings.push('V1 import: root element <DDOCharacterData> not found; not a V1 .ddocp file.')
    return { document: emptyDocument(), warnings }
  }
  if (!character) {
    warnings.push('V1 import: <Character> element not found inside <DDOCharacterData>.')
    return { document: emptyDocument(), warnings }
  }

  const out = emptyBuild()

  // ── Identity (DDOBuilder.cpp:1802-1804) ──────────────────────────────────
  out.name = asStr(character.Name) || 'Imported V1 Build'
  out.race = asStr(character.Race) || 'Human'
  // LegacyCharacter defaults Alignment to Lawful Good (LegacyCharacter.h:35).
  out.alignment = asStr(character.Alignment) || 'Lawful Good'

  // ── Ability tomes (DDOBuilder.cpp:1805-1810) ─────────────────────────────
  out.abilityTomes = {
    Strength: asNum(character.StrTome),
    Dexterity: asNum(character.DexTome),
    Constitution: asNum(character.ConTome),
    Intelligence: asNum(character.IntTome),
    Wisdom: asNum(character.WisTome),
    Charisma: asNum(character.ChaTome),
  }

  // ── Ability level-ups (DDOBuilder.cpp:1811-1820) ─────────────────────────
  const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
  for (const lvl of [4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const) {
    const val = asStr(character[`Level${lvl}`])
    if (val && (ABILITIES as readonly string[]).includes(val)) {
      out.abilityLevelUps[lvl] = val as Ability
    }
  }

  // ── Build points (DDOBuilder.cpp:1821; V1 element is <AbilitySpend>) ─────
  const spend = getRec(character, 'AbilitySpend')
  out.baseAbilities = {
    Strength: spendToScore(asNum(spend?.StrSpend)),
    Dexterity: spendToScore(asNum(spend?.DexSpend)),
    Constitution: spendToScore(asNum(spend?.ConSpend)),
    Intelligence: spendToScore(asNum(spend?.IntSpend)),
    Wisdom: spendToScore(asNum(spend?.WisSpend)),
    Charisma: spendToScore(asNum(spend?.ChaSpend)),
  }

  // ── Skill tomes (DDOBuilder.cpp:1822) ────────────────────────────────────
  const skillTomesNode = getRec(character, 'SkillTomes')
  if (skillTomesNode) {
    for (const [k, v] of Object.entries(skillTomesNode)) {
      const n = asNum(v)
      if (n > 0) out.skillTomes[k] = n
    }
  }

  // ── Special feats → past lives (DDOBuilder.cpp:1828) ─────────────────────
  const special = parseSpecialFeats(getRec(character, 'SpecialFeats'))
  out.pastLives = { ...special.pastLives }
  out.pastLifeTypes = { ...special.pastLifeTypes }

  // ── Per-level training (DDOBuilder.cpp:1829-1840) ────────────────────────
  // Class1/2/3 are only used by V2 to seed the class dropdowns
  // (DDOBuilder.cpp:1824-1826, skipping "Unknown"); the authoritative class
  // composition comes from the LevelTraining list, which is what V3 stores.
  const levelTrainings = arr(character.LevelTraining as AnyRec | AnyRec[] | undefined)
  const heroicSlice = levelTrainings.slice(0, 20).map(lt => {
    const c = asStr((lt as AnyRec).Class)
    return c === 'Unknown' ? '' : c
  })
  const epicSlice = levelTrainings.slice(20, 30).map(lt => asStr((lt as AnyRec).Class))
  const legendarySlice = levelTrainings.slice(30, 40).map(lt => asStr((lt as AnyRec).Class))

  out.levelClasses = heroicSlice
  out.totalLevel = heroicSlice.filter(Boolean).length
  out.epicLevels = epicSlice.filter(c => c === 'Epic').length
  out.legendaryLevels = legendarySlice.filter(c => c === 'Legendary').length

  const counts: Record<string, number> = {}
  const seen: string[] = []
  for (const c of heroicSlice) {
    if (!c) continue
    counts[c] = (counts[c] ?? 0) + 1
    if (!seen.includes(c)) seen.push(c)
  }
  out.classes = [
    { name: seen[0] ?? '', levels: counts[seen[0]] ?? 0 },
    { name: seen[1] ?? '', levels: counts[seen[1]] ?? 0 },
    { name: seen[2] ?? '', levels: counts[seen[2]] ?? 0 },
  ] as [BuildClass, BuildClass, BuildClass]

  out.featChoices = {}
  out.skillRanks = {}
  out.skillRanksByLevel = {}
  const featSlotCounters: Record<string, number> = {}
  for (let i = 0; i < levelTrainings.length; i++) {
    const lt = levelTrainings[i] as AnyRec
    const charLvl = i + 1
    const className = asStr(lt.Class)
    for (const f of arr(lt.TrainedFeat as AnyRec | AnyRec[] | undefined)) {
      const fr = f as AnyRec
      const name = translateFeatName(asStr(fr.FeatName))
      const type = asStr(fr.Type)
      if (!name) continue
      const slotKey = buildFeatSlotKey(charLvl, className, type, heroicSlice, featSlotCounters)
      out.featChoices[slotKey] = name
    }
    for (const s of arr(lt.TrainedSkill as AnyRec | AnyRec[] | undefined)) {
      const skill = asStr((s as AnyRec).Skill)
      if (!skill || skill === 'Unknown') continue
      out.skillRanks[skill] = (out.skillRanks[skill] ?? 0) + 1
      const at = (out.skillRanksByLevel[charLvl] ?? (out.skillRanksByLevel[charLvl] = {}))
      at[skill] = (at[skill] ?? 0) + 1
    }
  }

  // ── Enhancements (DDOBuilder.cpp:1841-1857) ──────────────────────────────
  // Legacy top-level <Tier5Tree> is folded into the enhancement selected-trees
  // (DDOBuilder.cpp:1841-1846); V3 has no explicit enhancement-tier-5 field —
  // tier-5 membership is carried by the IsTier5 flags on the spends — so the
  // value only participates in tree-name translation.
  const enh = parseTreeSpend(character, 'EnhancementSpendInTree')
  out.enhancementChoices = enh.choices
  out.enhancementSelections = enh.selections
  out.enhancementPinned = enh.pinned

  const enhSelected = parseSelectedTrees(getRec(character, 'SelectedEnhancementTrees'))
  for (const treeName of enhSelected.trees) {
    if (!out.enhancementPinned.includes(treeName)) out.enhancementPinned.push(treeName)
  }

  const dest = parseTreeSpend(character, 'DestinySpendInTree')
  out.destinyChoices = dest.choices
  out.destinySelections = dest.selections

  const reap = parseTreeSpend(character, 'ReaperSpendInTree')
  out.reaperChoices = reap.choices

  // Destiny tree selection: <SelectedDestinyTrees> plus the legacy top-level
  // <U51Destiny_Tier5Tree> override (DDOBuilder.cpp:1849-1854).
  const destSelected = parseSelectedTrees(getRec(character, 'SelectedDestinyTrees'))
  out.selectedDestinyTrees = [
    destSelected.trees[0] ?? '', destSelected.trees[1] ?? '', destSelected.trees[2] ?? '',
  ]
  out.activeEpicDestiny =
    translateTreeName(asStr(character.U51Destiny_Tier5Tree)) || destSelected.tier5

  // ── Trained spells (DDOBuilder.cpp:1858) ─────────────────────────────────
  for (const s of arr(character.TrainedSpell as AnyRec | AnyRec[] | undefined)) {
    const sr = s as AnyRec
    const cls = asStr(sr.Class)
    const lvl = asNum(sr.Level)
    const spell = asStr(sr.SpellName)
    if (!cls || !spell) continue
    const byClass = out.trainedSpells[cls] ?? (out.trainedSpells[cls] = {})
    const byLevel = byClass[lvl] ?? (byClass[lvl] = [])
    if (!byLevel.includes(spell)) byLevel.push(spell)
  }

  // ── Notes (DDOBuilder.cpp:1859-1862) ─────────────────────────────────────
  // V2 rewrites \n → \r\n for MFC edit controls; V3 textareas use \n natively
  // so the text is kept as-is.
  out.notes = asStr(character.Notes)

  // ── Gear sets (DDOBuilder.cpp:1863-1944) ─────────────────────────────────
  // V2 looks each legacy item up in the live item database
  // (GetLatestVersionOfItem) and drops items it cannot find. V3 imports have
  // no item database in scope, so names are kept verbatim (after the
  // Legendary Greensteel rename) for the gear panel to resolve.
  const gearSets = arr(character.EquippedGear as AnyRec | AnyRec[] | undefined)
  const activeGearName = asStr(character.ActiveGear)
  out.namedGearSets = {}
  out.namedGearAugments = {}
  for (const set of gearSets) {
    const sr = set as AnyRec
    const setName = asStr(sr.Name)
    if (!setName) continue
    const parsedSet = parseGearSet(sr, warnings)
    out.namedGearSets[setName] = parsedSet.gear
    out.namedGearAugments[setName] = parsedSet.augmentChoices
  }
  const activeGearSet = (gearSets.find(g => asStr((g as AnyRec).Name) === activeGearName)
    ?? gearSets[0]) as AnyRec | undefined
  if (activeGearSet) {
    const g = parseGearSet(activeGearSet, [])  // warnings already collected above
    out.gear = g.gear
    out.augmentChoices = g.augmentChoices
    out.activeGearSetName = activeGearName || asStr(activeGearSet.Name) || ''

    // Sentient jewel of the active set (DDOBuilder.cpp:1889-1940).
    const jewel = parseSentientJewel(getRec(activeGearSet, 'SentientJewel'), {
      weapon: out.filigreeSlots.length || 6,
      artifact: out.artifactFiligreeSlots.length || 10,
    })
    out.sentientGem.personality = jewel.personality
    out.filigreeSlots = jewel.filigrees
    out.artifactFiligreeSlots = jewel.artifactFiligrees
  }

  // ── Document assembly ─────────────────────────────────────────────────────
  // Stances / SelfAndPartyBuffs / GuildLevel / ApplyGuildBuffs exist in the V1
  // schema (LegacyCharacter.h:38-39,48,73) but ConvertToNewDataStructure does
  // not carry them into the new build; mirror that here.
  const lifeId = generateId()
  const life: Life = {
    id: lifeId,
    name: out.name,
    race: out.race,
    alignment: out.alignment,
    abilityTomes: { ...out.abilityTomes },
    skillTomes: { ...out.skillTomes },
    selfBuffs: [],
    specialFeats: special.feats,
    monitoredBonuses: [],
    builds: [out],
  }

  const document: CharacterDocument = {
    id: generateId(),
    name: out.name,
    guildLevel: 0,
    applyGuildBuffs: false,
    characterTomes: { ...out.abilityTomes },
    contentIDontOwn: [],
    lives: [life],
    activeLifeId: lifeId,
    activeBuildId: out.id,
    _v: 2,
  }

  return { document, warnings }
}

function emptyDocument(): CharacterDocument {
  return {
    id: generateId(),
    name: 'Imported V1 Character',
    guildLevel: 0,
    applyGuildBuffs: false,
    characterTomes: {},
    contentIDontOwn: [],
    lives: [],
    activeLifeId: '',
    activeBuildId: '',
    _v: 2,
  }
}
