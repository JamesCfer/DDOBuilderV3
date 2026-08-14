// V3 CharacterBuild → V2 .DDOBuild XML exporter.
//
// This is the write-back counterpart to v2Import.ts. It serialises a V3
// `CharacterBuild` into the V2 <DDOBuilderCharacterData>/<Character>/<Life>/
// <Build> XML tree so that a build edited in V3 can be re-opened in the V2
// MFC application — closing the "V3 can read V2 files but never write them"
// parity gap.
//
// V2 schema authority (element names + nesting):
//   Character.h  Character_PROPERTIES  (StrTome..ChaTome, SpecialFeats, Tomes,
//                Lives, GuildLevel, ApplyGuildBuffs, ActiveLifeIndex,
//                ActiveBuildIndex, ContentIDontOwn)
//   Life.h       Life_PROPERTIES       (Name, Race, Alignment, Level4..40,
//                SpecialFeats, Builds, SelfAndPartyBuffs, …)
//   Build.h      Build_PROPERTIES      (Level, Class1..3, AbilitySpend,
//                LevelTraining, ActiveStances, *_SelectedTrees,
//                *SpendInTree, ActiveGear, EquippedGear, GearSetSnapshot,
//                Notes, Level4..40)
//
// Round-trip fidelity is guarded by v2RoundTripExport.test.ts: importV2Build
// → exportV2Build → importV2Build must reproduce every field V3 models.
// Fields V2 carries that V3 does not model (FavorFeats, full embedded item
// effect definitions) are emitted best-effort / by-name only; see the inline
// notes and PARITY_TODO.md.

import type {
  Ability, CharacterBuild, CharacterDocument, FiligreeSlot, Item, ItemAugment, ItemBuff,
} from '../types/ddo'
import { POINT_BUY_COSTS } from '../types/ddo'

/**
 * Optional item catalogue passed to the exporter for F2 (gear-effect
 * embedding). When provided, each equipped item's full V2 definition — its
 * <Buff> effects, <SetBonus>, <Material>, <EquipmentSlot> and metadata — is
 * embedded inside <EquippedGear>, matching what V2 writes and trusts on load.
 * A bare lookup `Map`/`Record` (name → Item) or a function both work.
 */
export type ItemCatalogue =
  | Map<string, Item>
  | Record<string, Item>
  | ((name: string) => Item | undefined)

function lookupItem(cat: ItemCatalogue | undefined, name: string): Item | undefined {
  if (!cat) return undefined
  if (typeof cat === 'function') return cat(name)
  if (cat instanceof Map) return cat.get(name)
  return cat[name]
}

// ---------------------------------------------------------------------------
// XML emission helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Minimal indenting XML builder. */
class Xml {
  private parts: string[] = []
  private depth = 0

  private pad(): string {
    return '  '.repeat(this.depth)
  }

  open(tag: string, attrs?: string): this {
    this.parts.push(`${this.pad()}<${tag}${attrs ? ' ' + attrs : ''}>`)
    this.depth++
    return this
  }

  close(tag: string): this {
    this.depth--
    this.parts.push(`${this.pad()}</${tag}>`)
    return this
  }

  /** Self-closing presence marker, e.g. <IsTier5/>. */
  empty(tag: string): this {
    this.parts.push(`${this.pad()}<${tag}/>`)
    return this
  }

  /** Leaf element with text content. */
  leaf(tag: string, value: string | number): this {
    // Catalogue-sourced fields (e.g. a numeric Description1) may arrive as a
    // non-string; coerce defensively before escaping.
    const text = typeof value === 'string' ? esc(value) : String(value)
    this.parts.push(`${this.pad()}<${tag}>${text}</${tag}>`)
    return this
  }

  raw(line: string): this {
    this.parts.push(`${this.pad()}${line}`)
    return this
  }

  toString(): string {
    return this.parts.join('\n') + '\n'
  }
}

// ---------------------------------------------------------------------------
// Reverse maps / reconstruction helpers
// ---------------------------------------------------------------------------

// Inverse of v2Import.ts V2_TO_V3_SLOT. The V2 EquippedGear node stores one
// child element per inventory slot using these V2 names.
export const V3_TO_V2_SLOT: Record<string, string> = {
  Helmet: 'Helmet', Necklace: 'Necklace', Trinket: 'Trinket', Cloak: 'Cloak',
  Belt: 'Belt', Goggles: 'Goggles', Gloves: 'Gloves', Boots: 'Boots',
  Bracers: 'Bracers', Armor: 'Armor', Ring: 'Ring1', Ring2: 'Ring2',
  'Main Hand': 'MainHand', 'Off Hand': 'OffHand', Quiver: 'Quiver', Arrow: 'Arrow',
  // Cosmetic slots (InventorySlotTypes.h:33-38) — display-only, no stat effects.
  'Cosmetic Helmet': 'CosmeticHelm', 'Cosmetic Armor': 'CosmeticArmor',
  'Cosmetic Cloak': 'CosmeticCloak', 'Cosmetic Weapon': 'CosmeticWeapon1',
  'Cosmetic Off Hand': 'CosmeticWeapon2',
}

const ABILITIES: Ability[] = [
  'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
]
const SPEND_KEY: Record<Ability, string> = {
  Strength: 'StrSpend', Dexterity: 'DexSpend', Constitution: 'ConSpend',
  Intelligence: 'IntSpend', Wisdom: 'WisSpend', Charisma: 'ChaSpend',
}
const TOME_KEY: Record<Ability, string> = {
  Strength: 'StrTome', Dexterity: 'DexTome', Constitution: 'ConTome',
  Intelligence: 'IntTome', Wisdom: 'WisTome', Charisma: 'ChaTome',
}

/**
 * The 21 <SkillTomes> children, in V2 write order. Every one is a REQUIRED
 * DL_SIMPLE element (SkillTomes.h SkillTomes_PROPERTIES): the real V2 SAX
 * reader raises "SkillTomes was missing <skill> element" if any is absent,
 * so the exporter must always write all 21 (zeros included). Each entry maps
 * the V2 element name to the V3 display name so tomes keyed either way
 * (V2-import passthrough vs V3 UI names) are found.
 */
export const V2_SKILL_TOMES: ReadonlyArray<readonly [string, string]> = [
  ['Balance', 'Balance'], ['Bluff', 'Bluff'], ['Concentration', 'Concentration'],
  ['Diplomacy', 'Diplomacy'], ['DisableDevice', 'Disable Device'],
  ['Haggle', 'Haggle'], ['Heal', 'Heal'], ['Hide', 'Hide'],
  ['Intimidate', 'Intimidate'], ['Jump', 'Jump'], ['Listen', 'Listen'],
  ['MoveSilently', 'Move Silently'], ['OpenLock', 'Open Lock'],
  ['Perform', 'Perform'], ['Repair', 'Repair'], ['Search', 'Search'],
  ['SpellCraft', 'Spellcraft'], ['Spot', 'Spot'], ['Swim', 'Swim'],
  ['Tumble', 'Tumble'], ['UMD', 'Use Magic Device'],
]

/**
 * V2 EquippedGear slot element → the <EquipmentSlot> flag V2 uses for that
 * slot (EquipmentSlot.h). Used as the fallback when a gear item is emitted
 * without a catalogue definition: Item_PROPERTIES declares Slots as a
 * required DL_OBJECT, so every embedded item must carry an <EquipmentSlot>
 * with at least the flag matching where it is equipped.
 */
const V2_SLOT_FLAG: Record<string, string> = {
  Helmet: 'Helmet', Necklace: 'Necklace', Trinket: 'Trinket', Cloak: 'Cloak',
  Belt: 'Belt', Goggles: 'Goggles', Gloves: 'Gloves', Boots: 'Boots',
  Bracers: 'Bracers', Armor: 'Armor', Ring1: 'Ring', Ring2: 'Ring',
  MainHand: 'Weapon1', OffHand: 'Weapon2', Quiver: 'Quiver', Arrow: 'Arrow',
  CosmeticHelm: 'CosmeticHelm', CosmeticArmor: 'CosmeticArmor',
  CosmeticCloak: 'CosmeticCloak', CosmeticWeapon1: 'CosmeticWeapon1',
  CosmeticWeapon2: 'CosmeticWeapon2',
}

/** Known DDO base classes — used to reconstruct past-life feat Type/name. */
const HEROIC_CLASSES = new Set([
  'Alchemist', 'Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid',
  'Favored Soul', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue',
  'Sorcerer', 'Warlock', 'Wizard',
])
const RACES = new Set([
  'Dwarf', 'Elf', 'Gnome', 'Halfling', 'Half-Elf', 'Half-Orc', 'Human',
  'Warforged', 'Drow', 'Aasimar', 'Tiefling', 'Tabaxi', 'Shifter',
  'Dragonborn', 'Half-Elf', 'Gnome',
])

/**
 * A trained-feat record destined for a particular character level, with the
 * V2 <Type> string. Built by inverting v2Import.ts buildFeatSlotKey.
 */
interface FeatForLevel {
  level: number   // 1-based character level
  type: string
  name: string
}

/**
 * Invert the V3 feat-slot keys back to (character level, Type) so they can be
 * emitted inside the right <LevelTraining> block. Mirrors the key formats in
 * v2Import.ts buildFeatSlotKey:
 *   heroic-${lvl}
 *   alterDarkGift-4              (universal, V2 Build.cpp:1091)
 *   race-${lvl}-${type}-${idx}
 *   epic-${epicLvl}-${type}-${idx}
 *   legendary-${legLvl}-${type}-${idx}
 *   ${class}-${classLevel}-${type}-${idx}
 */
function featsByLevel(build: CharacterBuild): Map<number, FeatForLevel[]> {
  const byLevel = new Map<number, FeatForLevel[]>()
  const heroic = build.levelClasses ?? []

  const push = (level: number, type: string, name: string) => {
    if (level < 1) return
    const list = byLevel.get(level) ?? []
    list.push({ level, type, name })
    byLevel.set(level, list)
  }

  for (const [key, name] of Object.entries(build.featChoices)) {
    if (!name) continue
    let m: RegExpMatchArray | null

    if ((m = key.match(/^heroic-(\d+)$/))) {
      push(Number(m[1]), 'Standard', name)
      continue
    }
    if (key === 'alterDarkGift-4') {
      push(4, 'Alter Dark Gift', name)
      continue
    }
    if ((m = key.match(/^race-(\d+)-(.+)-(\d+)$/))) {
      push(Number(m[1]), m[2], name)
      continue
    }
    if ((m = key.match(/^epic-(\d+)-(.+)-(\d+)$/))) {
      push(20 + Number(m[1]), m[2], name)
      continue
    }
    if ((m = key.match(/^legendary-(\d+)-(.+)-(\d+)$/))) {
      push(30 + Number(m[1]), m[2], name)
      continue
    }
    // Class-granted: ${class}-${classLevel}-${type}-${idx}. Find the character
    // level at which `class` reaches `classLevel` in the heroic slice.
    if ((m = key.match(/^(.+)-(\d+)-(.+)-(\d+)$/))) {
      const className = m[1]
      const classLevel = Number(m[2])
      const type = m[3]
      let seen = 0
      let charLevel = -1
      for (let i = 0; i < heroic.length; i++) {
        if (heroic[i] === className) {
          seen++
          if (seen === classLevel) { charLevel = i + 1; break }
        }
      }
      push(charLevel, type, name)
      continue
    }
  }
  return byLevel
}

/** Class label V2 stores in <LevelTraining> for character level `charLevel`. */
function classAtLevel(build: CharacterBuild, charLevel: number): string {
  if (charLevel <= 20) {
    const c = (build.levelClasses ?? [])[charLevel - 1] ?? ''
    return c || 'Unknown'
  }
  if (charLevel <= 30) return 'Epic'
  return 'Legendary'
}

// ---------------------------------------------------------------------------
// Section emitters
// ---------------------------------------------------------------------------

function emitAbilitySpend(xml: Xml, build: CharacterBuild): void {
  // V2 semantics (verified against V2-authored builds + Build::AbilityAtLevel =
  // `8 + racial + GetAbilitySpend`): each `<XxxSpend>` is the ability VALUE
  // INCREASE above 8 (score − 8, range 0–10), NOT the point-buy cost.
  // `<AvailableSpend>` is the point budget (sum of point-buy costs). Writing the
  // point cost into `*Spend` (e.g. 10 for a 16) made V2 read inflated ability
  // scores from V3-generated files — for any ability raised to 15–18, where the
  // cost exceeds the value increase. Found by the v2calc oracle on 30 builds.
  let pointBudget = 0
  const spends: Record<Ability, number> = {} as Record<Ability, number>
  for (const ab of ABILITIES) {
    const score = build.baseAbilities[ab] ?? 8
    spends[ab] = Math.max(0, score - 8)
    pointBudget += POINT_BUY_COSTS[score] ?? 0
  }
  xml.open('AbilitySpend')
  xml.leaf('AvailableSpend', pointBudget)
  for (const ab of ABILITIES) xml.leaf(SPEND_KEY[ab], spends[ab])
  xml.close('AbilitySpend')
}

function emitLevelTraining(xml: Xml, build: CharacterBuild): void {
  const totalLevels = 20 + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  const feats = featsByLevel(build)
  const skillsByLevel = build.skillRanksByLevel ?? {}

  for (let lvl = 1; lvl <= totalLevels; lvl++) {
    const perSkill = skillsByLevel[lvl] ?? {}
    const pointsSpent = Object.values(perSkill).reduce((a, b) => a + (b || 0), 0)
    xml.open('LevelTraining')
    xml.leaf('Class', classAtLevel(build, lvl))
    // SkillPointsAvailable/SkillPointsSpent are REQUIRED DL_SIMPLE children
    // (LevelTraining.h). V3 does not track the per-level point pool, so emit
    // the spent count for both — V2 recomputes availability from class + Int.
    xml.leaf('SkillPointsAvailable', pointsSpent)
    xml.leaf('SkillPointsSpent', pointsSpent)
    for (const f of feats.get(lvl) ?? []) {
      xml.open('TrainedFeat')
      xml.leaf('FeatName', f.name)
      xml.leaf('Type', f.type)
      xml.leaf('LevelTrainedAt', 0)
      xml.close('TrainedFeat')
    }
    for (const [skill, ranks] of Object.entries(perSkill)) {
      for (let r = 0; r < ranks; r++) {
        xml.open('TrainedSkill')
        xml.leaf('Skill', skill)
        xml.close('TrainedSkill')
      }
    }
    xml.close('LevelTraining')
  }
}

function emitSpendInTree(
  xml: Xml,
  tag: string,
  choices: Record<string, Record<string, number>>,
  selections: Record<string, Record<string, string>>,
): void {
  for (const [treeName, items] of Object.entries(choices)) {
    if (!treeName || Object.keys(items).length === 0) continue
    xml.open(tag)
    xml.leaf('TreeName', treeName)
    xml.leaf('TreeVersion', 1)
    const sels = selections[treeName] ?? {}
    for (const [name, ranks] of Object.entries(items)) {
      if (!ranks) continue
      xml.open('TrainedEnhancement')
      xml.leaf('EnhancementName', name)
      if (sels[name]) xml.leaf('Selection', sels[name])
      xml.leaf('Ranks', ranks)
      xml.close('TrainedEnhancement')
    }
    xml.close(tag)
  }
}

function emitSelectedTrees(
  xml: Xml, tag: string, trees: string[], tier5?: string, pad = 0,
): void {
  xml.open(tag)
  const names = [...trees]
  while (names.length < pad) names.push('No selection')
  for (const t of names) xml.leaf('TreeName', t || 'No selection')
  if (tier5) xml.leaf('Tier5Tree', tier5)
  xml.close(tag)
}

const SNAPSHOT_KEY: Record<Ability, string> = {
  Strength: 'SnapshotStrength', Dexterity: 'SnapshotDexterity',
  Constitution: 'SnapshotConstitution', Intelligence: 'SnapshotIntelligence',
  Wisdom: 'SnapshotWisdom', Charisma: 'SnapshotCharisma',
}

/**
 * F2 — embed an item's V2 definition (Buffs + metadata + SetBonus). The
 * <Name> is emitted by the caller; this adds everything V2 stores after it so
 * the re-opened file carries the item's effects without re-resolving by name.
 *
 * V2's Item_PROPERTIES (Item.h) makes <Description>, <MinLevel> and
 * <EquipmentSlot> REQUIRED once the slot element exists, so they are always
 * emitted — with defaults (empty description, level 0, the equipping slot's
 * flag) when no catalogue definition is available.
 */
function emitItemDefinition(xml: Xml, item: Item | undefined, v2Slot: string): void {
  if (item?.Icon) xml.leaf('Icon', item.Icon)
  xml.leaf('Description', item?.Description ?? '')
  if (item?.DropLocation) xml.leaf('DropLocation', item.DropLocation)
  xml.leaf('MinLevel', item?.MinLevel ?? 0)
  const slots = item?.EquipmentSlot
    ? Object.entries(item.EquipmentSlot).filter(([, on]) => on).map(([s]) => s)
    : []
  if (slots.length === 0 && V2_SLOT_FLAG[v2Slot]) slots.push(V2_SLOT_FLAG[v2Slot])
  xml.open('EquipmentSlot')
  for (const slot of slots) xml.empty(slot)
  xml.close('EquipmentSlot')
  if (!item) return
  if (item.Material) xml.leaf('Material', item.Material)
  const buffs: ItemBuff[] = item.Buff
    ? (Array.isArray(item.Buff) ? item.Buff : [item.Buff])
    : []
  for (const b of buffs) {
    if (!b?.Type) continue
    xml.open('Buff')
    xml.leaf('Type', b.Type)
    if (b.Value1 != null) xml.leaf('Value1', b.Value1)
    if (b.BonusType) xml.leaf('BonusType', b.BonusType)
    if (b.Percent) xml.empty('Percent')
    if (b.Description1) xml.leaf('Description1', b.Description1)
    if (b.Item) xml.leaf('Item', b.Item)
    xml.close('Buff')
  }
  const sets = item.SetBonus
    ? (Array.isArray(item.SetBonus) ? item.SetBonus : [item.SetBonus])
    : []
  for (const s of sets) {
    if (s) xml.leaf('SetBonus', s)
  }
}

/** Per-build sentient-jewel state emitted inside each <EquippedGear>. */
interface SentientInfo {
  personality?: string
  filigrees?: FiligreeSlot[]
  artifactFiligrees?: FiligreeSlot[]
}

/**
 * The build's filigree slots, blank entries included.
 *
 * V2 sizes its list to the chosen slot count and writes an empty `<Name/>`
 * for every unfilled slot (EquippedGear::SetNumFiligrees, EquippedGear.cpp:466
 * — it pads with blank WeaponFiligree entries). Trimming the trailing blanks
 * would export a smaller `<NumFiligrees>` than the player picked, so re-import
 * would silently shrink the jewel.
 */
function filigreesToEmit(slots: FiligreeSlot[] | undefined): FiligreeSlot[] {
  return [...(slots ?? [])]
}

function emitGearSet(
  xml: Xml,
  setName: string,
  slots: Record<string, string>,
  augments: Record<string, string>,
  snapshot?: Partial<Record<Ability, number>>,
  itemCatalogue?: ItemCatalogue,
  sentient?: SentientInfo,
  augmentLevels?: Record<string, number>,
  augmentValues?: Record<string, number>,
): void {
  xml.open('EquippedGear')
  xml.leaf('Name', setName)
  for (const [v3Slot, v2Slot] of Object.entries(V3_TO_V2_SLOT)) {
    const itemName = slots[v3Slot]
    if (!itemName) continue
    xml.open(v2Slot)
    // V3 stores gear by name only. F2: when an item catalogue is supplied, embed
    // the full item definition (Buffs + metadata) so V2 re-opens the slot with
    // the item's effects — matching what V2 writes and trusts on load. Without a
    // catalogue, <Name> plus the required Item defaults (Description, MinLevel,
    // EquipmentSlot) are emitted; V2 then re-resolves the rest by name.
    xml.leaf('Name', itemName)
    const itemDef = lookupItem(itemCatalogue, itemName)
    emitItemDefinition(xml, itemDef, v2Slot)
    const defAugs: ItemAugment[] = itemDef?.ItemAugment
      ? (Array.isArray(itemDef.ItemAugment) ? itemDef.ItemAugment : [itemDef.ItemAugment])
      : []
    // Augments are keyed `slot:type:index` where `index` is the position of the
    // augment in the item's FULL <ItemAugment> list (including empty slots). The
    // importer increments its index counter for every <ItemAugment> entry, even
    // empty ones, so to round-trip the indices we rebuild a sparse array and pad
    // gaps with empty <ItemAugment/> placeholders.
    const prefix = `${v3Slot}:`
    const slotAugs: { type: string; name: string; key: string }[] = []
    for (const [k, augName] of Object.entries(augments)) {
      if (!k.startsWith(prefix)) continue
      // Key is `slot:type:index`; the augment `type` may itself contain colons
      // (e.g. "IoD: Accessory: Claw Slot"), so split on the first and last
      // colon only: slot before the first, index after the last, type between.
      const firstColon = k.indexOf(':')
      const lastColon = k.lastIndexOf(':')
      if (firstColon === lastColon) continue
      const type = k.slice(firstColon + 1, lastColon)
      const idx = Number(k.slice(lastColon + 1))
      if (!type || !augName || !Number.isInteger(idx)) continue
      slotAugs[idx] = { type, name: augName, key: k }
    }
    for (let i = 0; i < slotAugs.length; i++) {
      const a = slotAugs[i]
      xml.open('ItemAugment')
      if (!a) {
        // Padding slot: import skips it (no SelectedAugment) but still
        // advances the index counter, keeping later indices aligned. <Type>
        // is a REQUIRED DL_STRING child (ItemAugment.h), so it must be
        // present even here — use the catalogue item's slot type when known.
        xml.leaf('Type', defAugs[i]?.Type ?? '')
      } else {
        xml.leaf('Type', a.type)
        xml.leaf('SelectedAugment', a.name)
        xml.leaf('SelectedLevelIndex', augmentLevels?.[a.key] ?? 0)
        if (augmentValues?.[a.key] !== undefined) {
          xml.leaf('Value', augmentValues[a.key])
        }
      }
      xml.close('ItemAugment')
    }
    xml.close(v2Slot)
  }
  // Sentient-jewel block (Personality + filigrees). V2 stores these per gear
  // set; <NumFiligrees> is a REQUIRED DL_SIMPLE child (EquippedGear.h) and is
  // always written. Each <Filigree>/<ArtifactFiligree> needs a <Name> child
  // (TrainedFiligree.h DL_STRING) — V2 itself writes empty <Name/> for
  // unfilled slots.
  if (sentient?.personality) xml.leaf('Personality', sentient.personality)
  const filigrees = filigreesToEmit(sentient?.filigrees)
  xml.leaf('NumFiligrees', filigrees.length)
  const emitFiligree = (tag: string, f: FiligreeSlot) => {
    xml.open(tag)
    xml.leaf('Name', f.name ?? '')
    if (f.rare) xml.empty('Rare')
    xml.close(tag)
  }
  for (const f of filigrees) emitFiligree('Filigree', f)
  // V2 has no <NumArtifactFiligrees>: the element count IS the count (it pads
  // to MAX_ARTIFACT_FILIGREE = 10 on load, stdafx.h:62), so every configured
  // artifact slot is emitted for the count to survive a round trip.
  for (const f of filigreesToEmit(sentient?.artifactFiligrees)) {
    emitFiligree('ArtifactFiligree', f)
  }
  // V2 EquippedGear.Snapshot{Ability} — per-set ability snapshot for gear-swap
  // "what-if" comparisons (F3). Emitted after the slot elements.
  if (snapshot) {
    for (const ab of ABILITIES) {
      if (snapshot[ab] != null) xml.leaf(SNAPSHOT_KEY[ab], snapshot[ab] as number)
    }
  }
  xml.close('EquippedGear')
}

/**
 * Standalone <EquippedGear> XML fragment for one gear set — V2 Gear menu
 * Copy parity (EquipmentPane::OnGearCopy writes exactly this via
 * EquippedGear::Write to a custom clipboard format). V3 puts it on the text
 * clipboard so sets can be moved between builds/documents (and pasted from
 * fragments lifted out of .DDOBuild files).
 */
export function exportGearSetXml(
  setName: string,
  slots: Record<string, string>,
  augments: Record<string, string>,
  itemCatalogue?: ItemCatalogue,
): string {
  const xml = new Xml()
  emitGearSet(xml, setName, slots, augments, undefined, itemCatalogue)
  return xml.toString()
}

/**
 * Reconstruct Character-level <SpecialFeats> from V3 pastLives. F5: when the
 * original V2 <Type> was captured on import (`pastLifeTypes`), reproduce it
 * exactly — Iconic vs Epic past lives are otherwise indistinguishable by name.
 * Falls back to name-based class/race detection for builds authored in V3.
 */
function emitSpecialFeats(xml: Xml, build: CharacterBuild): void {
  xml.open('SpecialFeats')
  const knownTypes = build.pastLifeTypes ?? {}
  for (const [key, count] of Object.entries(build.pastLives)) {
    if (!count) continue
    let type = knownTypes[key] ?? ''
    let featName = key
    if (!type) {
      // No captured type → infer from the key (V3-authored builds).
      if (HEROIC_CLASSES.has(key)) type = 'HeroicPastLife'
      else if (RACES.has(key)) type = 'RacialPastLife'
      else type = 'EpicPastLife'
    }
    if (type === 'HeroicPastLife' || type === 'RacialPastLife') {
      featName = `Past Life: ${key}`
    }
    for (let i = 0; i < count; i++) {
      xml.open('TrainedFeat')
      xml.leaf('FeatName', featName)
      xml.leaf('Type', type)
      xml.leaf('LevelTrainedAt', 0)
      xml.close('TrainedFeat')
    }
  }
  xml.close('SpecialFeats')
}

/** Emit a FeatsListObject (e.g. <FavorFeats>) from a flat name list. */
function emitFeatsList(xml: Xml, tag: string, feats: string[], type: string): void {
  xml.open(tag)
  for (const name of feats) {
    if (!name) continue
    xml.open('TrainedFeat')
    xml.leaf('FeatName', name)
    xml.leaf('Type', type)
    xml.leaf('LevelTrainedAt', 0)
    xml.close('TrainedFeat')
  }
  xml.close(tag)
}

/** Emit the inner <Build>…</Build> element for one build. */
function emitBuild(xml: Xml, build: CharacterBuild, itemCatalogue?: ItemCatalogue): void {
  xml.open('Build', 'version="1"')
  const totalLevels = 20 + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  xml.leaf('Level', totalLevels)

  // Class1/2/3 — V2 first-seen ordering of heroic classes.
  const seen: string[] = []
  for (const c of build.levelClasses ?? []) {
    if (c && !seen.includes(c)) seen.push(c)
  }
  xml.leaf('Class1', seen[0] || 'Unknown')
  xml.leaf('Class2', seen[1] || 'Unknown')
  xml.leaf('Class3', seen[2] || 'Unknown')

  emitAbilitySpend(xml, build)
  emitLevelTraining(xml, build)

  // ── Trained spells (DL_OBJECT_VECTOR TrainedSpell) — F3 ──────────────────
  for (const [cls, byLevel] of Object.entries(build.trainedSpells ?? {})) {
    for (const [lvlStr, spells] of Object.entries(byLevel)) {
      for (const spell of spells) {
        if (!spell) continue
        xml.open('TrainedSpell')
        xml.leaf('Class', cls)
        xml.leaf('Level', Number(lvlStr))
        xml.leaf('SpellName', spell)
        xml.close('TrainedSpell')
      }
    }
  }

  // ── Active stances ───────────────────────────────────────────────────────
  xml.open('ActiveStances')
  for (const s of build.activeBuffs ?? []) xml.leaf('Stances', s)
  xml.close('ActiveStances')

  // ── Selected trees ───────────────────────────────────────────────────────
  emitSelectedTrees(
    xml, 'Destiny_SelectedTrees',
    (build.selectedDestinyTrees ?? []).filter(Boolean),
    build.activeEpicDestiny, 3,
  )
  emitSelectedTrees(
    xml, 'Enhancement_SelectedTrees', build.enhancementPinned ?? [], undefined, 7,
  )
  // Reaper_SelectedTrees is a REQUIRED DL_OBJECT child of Build (Build.h);
  // V2 writes it even when nothing is selected ("No selection" x3).
  emitSelectedTrees(
    xml, 'Reaper_SelectedTrees',
    Object.keys(build.reaperChoices ?? {}).filter(Boolean).slice(0, 3),
    undefined, 3,
  )

  // ── Spend-in-tree blocks ────────────────────────────────────────────────
  emitSpendInTree(xml, 'EnhancementSpendInTree', build.enhancementChoices, build.enhancementSelections)
  emitSpendInTree(xml, 'ReaperSpendInTree', build.reaperChoices, {})
  emitSpendInTree(xml, 'DestinySpendInTree', build.destinyChoices, build.destinySelections)

  // ── Attack chains (DL_STRING ActiveAttackChain + DL_OBJECT_LIST) — F3 ────
  const activeChain = build.activeAttackChain ?? ''
  if (activeChain) xml.leaf('ActiveAttackChain', activeChain)
  else xml.empty('ActiveAttackChain')
  for (const [chName, attacks] of Object.entries(build.attackChains ?? {})) {
    xml.open('AttackChain')
    xml.leaf('Name', chName)
    for (const a of attacks) {
      if (a) xml.leaf('Attacks', a)
    }
    xml.close('AttackChain')
  }

  // ── Gear ─────────────────────────────────────────────────────────────────
  xml.leaf('ActiveGear', build.activeGearSetName || 'Standard')
  const named = build.namedGearSets ?? {}
  const namedAug = build.namedGearAugments ?? {}
  const snapshots = build.gearSetSnapshots ?? {}
  const sentient: SentientInfo = {
    personality: build.sentientGem?.personality,
    filigrees: build.filigreeSlots,
    artifactFiligrees: build.artifactFiligreeSlots,
  }
  const setNames = Object.keys(named)
  if (setNames.length > 0) {
    for (const name of setNames) {
      emitGearSet(xml, name, named[name] ?? {}, namedAug[name] ?? {}, snapshots[name], itemCatalogue, sentient)
    }
  } else {
    // Always emit the active set, even with nothing equipped: V2 gives every
    // build a "Standard" layout with no items (Build.cpp:97-100), and the
    // sentient jewel — personality and both filigree lists — lives INSIDE
    // <EquippedGear>. Skipping the empty set dropped a build's filigrees.
    const name = build.activeGearSetName || 'Standard'
    emitGearSet(xml, name, build.gear ?? {}, build.augmentChoices, snapshots[name], itemCatalogue, sentient, build.augmentLevelChoices, build.augmentValueChoices)
  }
  // GearSetSnapshot — names the snapshot baseline set (F3).
  if (build.gearSetSnapshot) xml.leaf('GearSetSnapshot', build.gearSetSnapshot)

  // ── Favor feats (FeatsListObject) — F3 ───────────────────────────────────
  emitFeatsList(xml, 'FavorFeats', build.favorFeats ?? [], 'Favor')

  // ── Notes — REQUIRED DL_STRING child of Build; write even when empty ────
  if (build.notes) xml.leaf('Notes', build.notes)
  else xml.empty('Notes')

  // ── Ability level-ups (Level4..40) ───────────────────────────────────────
  // All ten are REQUIRED DL_ENUM children of Build (Build.h); V2 writes every
  // one with the enum default ("Strength") when the player never picked.
  for (const lvl of [4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const) {
    xml.leaf(`Level${lvl}`, build.abilityLevelUps?.[lvl] ?? 'Strength')
  }

  xml.close('Build')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A life to serialise: name/race/alignment + special feats + its builds. */
export interface ExportLife {
  name: string
  race: string
  alignment: string
  /** Life-level SpecialFeats beyond past lives (F4). */
  specialFeats: string[]
  builds: CharacterBuild[]
}

/** Inputs for the full multi-life document exporter (F1). */
export interface ExportDocument {
  name?: string
  lives: ExportLife[]
  guildLevel: number
  applyGuildBuffs: boolean
  /** Character-level ContentIDontOwn (F4). */
  contentIDontOwn: string[]
  activeLifeIndex: number
  activeBuildIndex: number
}

/**
 * Serialise a full Character → Life[] → Build[] document into V2 .DDOBuild XML
 * (F1). Every life and every build is emitted, preserving the active indices.
 * Character-level tomes/SpecialFeats are taken from the active build (the V2
 * model keeps a single Character-level tome/past-life set shared by all lives).
 */
export function exportV2Document(doc: ExportDocument, itemCatalogue?: ItemCatalogue): string {
  const xml = new Xml()
  xml.raw('<?xml version="1.0"?>')
  xml.open('DDOBuilderCharacterData')
  xml.open('Character', 'version="1"')

  // The Character-level tomes + past-life SpecialFeats are shared in V2. Use
  // the active build (falling back to the first) as the authoritative source.
  const activeLife = doc.lives[doc.activeLifeIndex] ?? doc.lives[0]
  const activeBuild = activeLife?.builds[doc.activeBuildIndex] ?? activeLife?.builds[0]
    ?? doc.lives[0]?.builds[0]

  // ── Character: tomes ─────────────────────────────────────────────────────
  for (const ab of ABILITIES) {
    xml.leaf(TOME_KEY[ab], activeBuild?.abilityTomes?.[ab] ?? 0)
  }

  // ── Character: SpecialFeats (past lives) ────────────────────────────────
  if (activeBuild) emitSpecialFeats(xml, activeBuild)
  else { xml.open('SpecialFeats'); xml.close('SpecialFeats') }

  // ── Character: SkillTomes ────────────────────────────────────────────────
  // All 21 skill elements are REQUIRED by V2's SAX reader (SkillTomes.h);
  // omitting any aborts the load ("SkillTomes was missing Balance element").
  const skillTomes = activeBuild?.skillTomes ?? {}
  xml.open('SkillTomes')
  for (const [v2Name, v3Name] of V2_SKILL_TOMES) {
    xml.leaf(v2Name, skillTomes[v2Name] ?? skillTomes[v3Name] ?? 0)
  }
  xml.close('SkillTomes')

  // ── Lives ────────────────────────────────────────────────────────────────
  for (const life of doc.lives) {
    xml.open('Life', 'version="1"')
    xml.leaf('Name', life.name || 'Imported V3 Build')
    xml.leaf('Race', life.race || 'Human')
    xml.leaf('Alignment', life.alignment || 'True Neutral')
    // Life-level SpecialFeats (F4): universal-tree access, Granted feats, …
    // (V2 Type for these access feats is UniversalTree; reproduced best-effort.)
    // The element itself is a REQUIRED DL_OBJECT child of Life (Life.h), so it
    // is written even when empty.
    emitFeatsList(xml, 'SpecialFeats', life.specialFeats, 'UniversalTree')
    for (const build of life.builds) emitBuild(xml, build, itemCatalogue)
    // Life-level self/party buffs round-trip via each build's activeBuffs /
    // ActiveStances; no separate list emitted.
    xml.close('Life')
  }

  // ── Character footer ─────────────────────────────────────────────────────
  xml.leaf('GuildLevel', doc.guildLevel ?? 0)
  xml.leaf('ApplyGuildBuffs', doc.applyGuildBuffs ? 1 : 0)
  xml.leaf('ActiveLifeIndex', doc.activeLifeIndex ?? 0)
  xml.leaf('ActiveBuildIndex', doc.activeBuildIndex ?? 0)
  // ContentIDontOwn (F4): each entry is its own repeated element.
  for (const c of doc.contentIDontOwn ?? []) {
    if (c) xml.leaf('ContentIDontOwn', c)
  }

  xml.close('Character')
  xml.close('DDOBuilderCharacterData')
  return xml.toString()
}

/**
 * Convenience wrapper: serialise a CharacterDocument (the model produced by
 * importV2Document) to V2 XML. Resolves the active life/build indices from the
 * document's activeLifeId/activeBuildId.
 */
export function exportV2DocumentModel(doc: CharacterDocument, itemCatalogue?: ItemCatalogue): string {
  const activeLifeIndex = Math.max(0, doc.lives.findIndex(l => l.id === doc.activeLifeId))
  const activeLife = doc.lives[activeLifeIndex] ?? doc.lives[0]
  const activeBuildIndex = activeLife
    ? Math.max(0, activeLife.builds.findIndex(b => b.id === doc.activeBuildId))
    : 0
  return exportV2Document({
    name: doc.name,
    lives: doc.lives.map(l => ({
      name: l.name,
      race: l.race,
      alignment: l.alignment,
      specialFeats: l.specialFeats ?? [],
      builds: l.builds,
    })),
    guildLevel: doc.guildLevel ?? 0,
    applyGuildBuffs: doc.applyGuildBuffs ?? false,
    contentIDontOwn: doc.contentIDontOwn ?? [],
    activeLifeIndex,
    activeBuildIndex,
  }, itemCatalogue)
}

/**
 * Serialise a V3 build into V2 .DDOBuild XML. The output is a complete
 * <DDOBuilderCharacterData> document with a single Life containing a single
 * Build (V3's working model). V2 will open it as a one-life, one-build
 * character. Pass `itemCatalogue` (F2) to embed each equipped item's full V2
 * definition (Buffs + metadata); omit it to emit gear by name only.
 */
export function exportV2Build(build: CharacterBuild, itemCatalogue?: ItemCatalogue): string {
  return exportV2Document({
    lives: [{
      name: build.name || 'Imported V3 Build',
      race: build.race || 'Human',
      alignment: build.alignment || 'True Neutral',
      specialFeats: [],
      builds: [build],
    }],
    guildLevel: build.guildLevel ?? 0,
    applyGuildBuffs: build.applyGuildBuffs ?? false,
    contentIDontOwn: [],
    activeLifeIndex: 0,
    activeBuildIndex: 0,
  }, itemCatalogue)
}
