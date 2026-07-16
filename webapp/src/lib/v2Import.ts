// V2 .DDOBuild XML → V3 CharacterBuild importer.
//
// V2 stores characters as <DDOBuilderCharacterData>/<Character>/<Life>/<Build>
// trees with per-level <LevelTraining> blocks. Each LevelTraining contains the
// class taken at that character level plus the feats / skills trained then.
// Enhancement choices live in EnhancementSpendInTree blocks, gear lives in
// EquippedGear, and stances in ActiveStances.
//
// V2 sources cited:
//   Build.cpp                serialise / deserialise
//   Life.cpp                 serialise / deserialise
//   Character.cpp            serialise / deserialise
//   EquippedGear.cpp         <EquippedGear> structure
//   TrainedEnhancement.cpp   <EnhancementName>/<Ranks>/<Selection>/<IsTier5>

import { XMLParser } from 'fast-xml-parser'
import type {
  Ability, BuildClass, CharacterBuild, CharacterDocument, FiligreeSlot, Life,
  QuestDifficulty,
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
  // V2 XML reuses the same tag names in both single and list contexts (e.g.
  // <TreeName> appears once inside <EnhancementSpendInTree> but as a list
  // inside <Destiny_SelectedTrees>). We only force arrays for tags whose
  // semantics are always "list of"; mixed-cardinality tags are normalised
  // via arr() at the call site.
  isArray: (name, jpath) => {
    const ALWAYS_ARRAY = new Set([
      'TrainedFeat', 'TrainedSkill', 'TrainedEnhancement', 'TrainedSpell',
      'LevelTraining', 'Build', 'Life',
      'Augment', 'CompletedQuest', 'EquippedGear', 'ItemAugment',
      'Buff', 'AttackChain',
      'EnhancementSpendInTree', 'ReaperSpendInTree', 'DestinySpendInTree',
    ])
    if (ALWAYS_ARRAY.has(name)) return true
    // Stances list inside ActiveStances; TreeName inside *_SelectedTrees;
    // Filigree / ArtifactFiligree inside SentientGem. Use jpath to scope.
    if (name === 'Stances' && /ActiveStances/.test(jpath)) return true
    if (name === 'TreeName' && /_SelectedTrees/.test(jpath)) return true
    if (name === 'Filigree' && /SentientGem|Filigrees/.test(jpath)) return true
    if (name === 'ArtifactFiligree' && /SentientGem|Filigrees/.test(jpath)) return true
    // SelfAndPartyBuffs are at Life level, multiple sibling elements
    if (name === 'SelfAndPartyBuffs') return true
    // ContentIDontOwn is a Character-level DL_STRING_LIST (repeated element).
    if (name === 'ContentIDontOwn') return true
    // <Attacks> inside an <AttackChain> is a DL_STRING_LIST.
    if (name === 'Attacks' && /AttackChain/.test(jpath)) return true
    return false
  },
})

// ---------------------------------------------------------------------------
// Helpers
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

function mapClassName(raw: string): string {
  if (!raw || raw === 'Unknown') return ''
  return raw
}

// ---------------------------------------------------------------------------
// Sub-parsers
// ---------------------------------------------------------------------------

/**
 * V2 `<XxxSpend>` is the ability VALUE INCREASE above 8, NOT the point-buy
 * cost. Confirmed against `Build::AbilityAtLevel` = `8 + racial +
 * GetAbilitySpend`, where `GetAbilitySpend` returns 0..10 (indexed into the
 * per-step cost table). So score = 8 + spend, capped at 18 (max +10). The old
 * code treated the field as a point cost (16→score 16 instead of the correct
 * 8+16 clamp), misreading every V2-authored build's abilities. Found by the
 * v2calc oracle.
 */
function spendToScore(spent: number): number {
  return 8 + Math.max(0, Math.min(10, spent))
}

function parseAbilities(spend: AnyRec | undefined): Record<Ability, number> {
  const result: Record<Ability, number> = {
    Strength: 8, Dexterity: 8, Constitution: 8, Intelligence: 8, Wisdom: 8, Charisma: 8,
  }
  if (!spend) return result
  result.Strength = spendToScore(asNum(spend.StrSpend))
  result.Dexterity = spendToScore(asNum(spend.DexSpend))
  result.Constitution = spendToScore(asNum(spend.ConSpend))
  result.Intelligence = spendToScore(asNum(spend.IntSpend))
  result.Wisdom = spendToScore(asNum(spend.WisSpend))
  result.Charisma = spendToScore(asNum(spend.ChaSpend))
  return result
}

interface LevelTrainingV2 {
  className: string
  feats: { name: string; type: string; level: number }[]
  skills: string[]
}

function parseLevelTraining(lt: AnyRec | undefined): LevelTrainingV2 {
  if (!lt) return { className: '', feats: [], skills: [] }
  return {
    className: mapClassName(asStr(lt.Class)),
    feats: arr(lt.TrainedFeat as AnyRec | AnyRec[] | undefined).map(f => ({
      name: asStr((f as AnyRec).FeatName),
      type: asStr((f as AnyRec).Type),
      level: asNum((f as AnyRec).LevelTrainedAt),
    })),
    skills: arr(lt.TrainedSkill as AnyRec | AnyRec[] | undefined).map(s => asStr((s as AnyRec).Skill)),
  }
}

function parseEnhancements(buildNode: AnyRec, tag: string): {
  choices: Record<string, Record<string, number>>
  selections: Record<string, Record<string, string>>
  pinned: string[]
} {
  // V2 stores TreeName + TrainedEnhancement[] inside <EnhancementSpendInTree>,
  // <DestinySpendInTree>, and <ReaperSpendInTree>. Each TrainedEnhancement uses
  // <EnhancementName> (not <Name>), <Ranks>, optional <Selection>, optional
  // <IsTier5/> empty marker.
  const choices: Record<string, Record<string, number>> = {}
  const selections: Record<string, Record<string, string>> = {}
  const pinned: string[] = []

  const trees = arr(buildNode[tag] as AnyRec | AnyRec[] | undefined)
  for (const t of trees) {
    const tr = t as AnyRec
    const treeName = asStr(tr.TreeName)
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

const V2_TO_V3_SLOT: Record<string, string> = {
  Helmet: 'Helmet', Necklace: 'Necklace', Trinket: 'Trinket', Cloak: 'Cloak',
  Belt: 'Belt', Goggles: 'Goggles', Gloves: 'Gloves', Boots: 'Boots',
  Bracers: 'Bracers', Armor: 'Armor', Ring1: 'Ring', Ring2: 'Ring2',
  MainHand: 'Main Hand', OffHand: 'Off Hand', Quiver: 'Quiver', Arrow: 'Arrow',
  // Cosmetic slots (InventorySlotTypes.h:33-38) — display-only in V2; imported
  // so they round-trip, but useBuildStats strips them from stat aggregation.
  CosmeticHelm: 'Cosmetic Helmet', CosmeticArmor: 'Cosmetic Armor',
  CosmeticCloak: 'Cosmetic Cloak', CosmeticWeapon1: 'Cosmetic Weapon',
  CosmeticWeapon2: 'Cosmetic Off Hand',
}

function parseGear(equippedGearNode: AnyRec): {
  gear: Record<string, string>
  augmentChoices: Record<string, string>
} {
  const gear: Record<string, string> = {}
  const augmentChoices: Record<string, string> = {}
  for (const [v2Slot, v3Slot] of Object.entries(V2_TO_V3_SLOT)) {
    const item = getRec(equippedGearNode, v2Slot)
    if (!item) continue
    const name = asStr(item.Name)
    if (!name) continue
    gear[v3Slot] = name

    // Each item carries <ItemAugment> children with Type + SelectedAugment.
    // Key format is `slot:type:arrayIndex` — array index matches the position
    // in the ItemAugment list, which is what GearPanel uses when rendering.
    const augs = arr(item.ItemAugment as AnyRec | AnyRec[] | undefined)
    for (let augIdx = 0; augIdx < augs.length; augIdx++) {
      const ar = augs[augIdx] as AnyRec
      const type = asStr(ar.Type)
      const augName = asStr(ar.SelectedAugment)
      if (!type || !augName) continue
      augmentChoices[`${v3Slot}:${type}:${augIdx}`] = augName
    }
  }
  return { gear, augmentChoices }
}

function parseFiligreeSlots(parent: AnyRec, tag: 'Filigree' | 'ArtifactFiligree', count: number): FiligreeSlot[] {
  const list = arr(parent[tag] as AnyRec | AnyRec[] | undefined)
  const slots: FiligreeSlot[] = []
  for (const f of list) {
    const fr = f as AnyRec
    slots.push({
      name: asStr(fr.Name ?? fr.SetBonus ?? f),
      // <Rare/> is a presence-marker in V2 XML; fast-xml-parser emits '' for
      // empty self-closing tags, so Boolean() would always be false. Check key
      // existence instead.
      rare: 'Rare' in fr || 'IsRare' in fr,
    })
  }
  while (slots.length < count) slots.push({ name: '', rare: false })
  return slots.slice(0, count)
}

// ---------------------------------------------------------------------------
// Feat slot key construction
//
// V3's FeatSlots component generates slot keys as:
//   heroic-${charLvl}                         universal standard feat
//   race-${charLvl}-${type}-${localIdx}        race-granted feat
//   ${className}-${classLevel}-${type}-${localIdx}  class-granted feat
//   epic-${epicLevel}-${type}-${localIdx}      epic tier feat
//   legendary-${legLevel}-${type}-${localIdx}  legendary tier feat
//
// localIdx is a per-(level, type) counter (always 0 in practice since each
// class/race has at most one slot per level+type combination).
//
// Race feat types taken from the race XML FeatSlot definitions. Any type not
// in this set and not "Standard" is attributed to the current LevelTraining's
// class, which matches V3's class-slot key format.
// ---------------------------------------------------------------------------

const HEROIC_UNIVERSAL_LEVELS = new Set([1, 3, 6, 9, 12, 15, 18])

// All FeatType values that come from race FeatSlot definitions rather than
// class FeatSlot definitions. Sourced from the race XML files.
const RACE_FEAT_TYPES = new Set([
  'Aasimar Bond',
  'Dark Gift',                         // DarkBargainer
  'Dragonborn Racial',                  // Dragonborn
  'Dilettante Feat',                    // Half-Elf
  'Human Bonus Feat',                   // Human
  'Purple Dragon Knight Bonus Feat',    // Purple Dragon Knight
  'Animalistic Aspect',                 // Shifter
])

/**
 * Build a V3-compatible feat slot key from V2 LevelTraining data.
 *
 * @param charLvl     1-indexed character level of the LevelTraining block
 * @param className   V2 Class field from the same LevelTraining block
 * @param featType    V2 Type field from the TrainedFeat
 * @param heroicSlice per-level heroic class array (index = charLvl-1)
 * @param counters    mutable per-slot-type counter to assign localIdx
 */
function buildFeatSlotKey(
  charLvl: number,
  className: string,
  featType: string,
  heroicSlice: string[],
  counters: Record<string, number>,
): string {
  // Epic levels (class === "Epic", charLvl 21-30)
  if (className === 'Epic' && charLvl > 20) {
    const epicLevel = charLvl - 20
    const ck = `epic-${epicLevel}-${featType}`
    const idx = counters[ck] ?? 0
    counters[ck] = idx + 1
    return `epic-${epicLevel}-${featType}-${idx}`
  }

  // Legendary levels (class === "Legendary", charLvl 31-34)
  if (className === 'Legendary' && charLvl > 30) {
    const legLevel = charLvl - 30
    const ck = `legendary-${legLevel}-${featType}`
    const idx = counters[ck] ?? 0
    counters[ck] = idx + 1
    return `legendary-${legLevel}-${featType}-${idx}`
  }

  // Universal standard heroic feat
  if (featType === 'Standard' && HEROIC_UNIVERSAL_LEVELS.has(charLvl)) {
    return `heroic-${charLvl}`
  }

  // Universal "Alter Dark Gift" feat slot — V2 grants this unconditionally
  // to every build at character level 4 (Build::TrainableFeatTypeAtLevel,
  // Build.cpp:1091: "you have to be level 4 to go into the Lamordia zone
  // where this feat can be acquired"), independent of race or class. Not
  // backed by any race/class FeatSlot XML data.
  if (featType === 'Alter Dark Gift' && charLvl === 4) {
    return 'alterDarkGift-4'
  }

  // Race-granted feat (type is in the static race feat type set)
  if (RACE_FEAT_TYPES.has(featType)) {
    const ck = `race-${charLvl}-${featType}`
    const idx = counters[ck] ?? 0
    counters[ck] = idx + 1
    return `race-${charLvl}-${featType}-${idx}`
  }

  // Class-granted feat: compute class level as how many times className
  // appears in heroicSlice up to and including this character level.
  const classLevel = heroicSlice.slice(0, charLvl).filter(c => c === className).length
  const ck = `${className}-${classLevel}-${featType}`
  const idx = counters[ck] ?? 0
  counters[ck] = idx + 1
  return `${className}-${classLevel}-${featType}-${idx}`
}

// ---------------------------------------------------------------------------
// Special-feat parsing (Character / Life FeatsListObject → V3 model)
// ---------------------------------------------------------------------------

/**
 * Parse a V2 <SpecialFeats>/<FavorFeats> FeatsListObject. Past-life types are
 * folded into `pastLives`; all other special feats (UniversalTree access,
 * Favor rewards, Granted, …) are returned as a flat name list for
 * `Life.specialFeats` / `build` favor feats.
 */
function parseFeatsListObject(node: AnyRec | undefined): {
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
    const name = asStr(fr.FeatName)
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
// Per-build parser
//
// Parses a single <Build> node (given its parent <Life> and <Character> for
// the fields that live above the build level: name/race/alignment/tomes/past
// lives). Shared by the active-build importer (importV2Build) and the full
// multi-life document importer (importV2Document).
// ---------------------------------------------------------------------------

function parseBuildNode(
  buildNode: AnyRec,
  life: AnyRec,
  character: AnyRec,
): CharacterBuild {
  const out = emptyBuild()

  // ── Top-level character fields ───────────────────────────────────────────
  out.name = asStr(life.Name) || asStr(character.Name) || 'Imported V2 Build'
  out.race = asStr(life.Race) || 'Human'
  out.alignment = asStr(life.Alignment) || 'True Neutral'
  out.guildLevel = asNum(character.GuildLevel)
  out.applyGuildBuffs = Boolean(character.ApplyGuildBuffs)

  // ── Tomes ────────────────────────────────────────────────────────────────
  out.abilityTomes = {
    Strength: asNum(character.StrTome),
    Dexterity: asNum(character.DexTome),
    Constitution: asNum(character.ConTome),
    Intelligence: asNum(character.IntTome),
    Wisdom: asNum(character.WisTome),
    Charisma: asNum(character.ChaTome),
  }

  // SkillTomes live at the Character level in V2 XML, not inside Life.
  const skillTomesNode = getRec(character, 'SkillTomes')
  if (skillTomesNode) {
    for (const [k, v] of Object.entries(skillTomesNode)) {
      const n = asNum(v)
      if (n > 0) out.skillTomes[k] = n
    }
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  out.notes = asStr(life.Notes) || asStr(buildNode.Notes) || ''

  // ── Per-level training (drives class composition + feats + skills) ──────
  const levelTrainings = arr(buildNode.LevelTraining as AnyRec | AnyRec[] | undefined)
    .map(parseLevelTraining)

  // V2 stores 34 LevelTraining entries: heroic 1-20 carry the actual class,
  // 21-30 carry "Epic", 31-34 carry "Legendary".
  const heroicSlice = levelTrainings.slice(0, 20).map(lt => lt.className)
  const epicSlice = levelTrainings.slice(20, 30).map(lt => lt.className)
  const legendarySlice = levelTrainings.slice(30, 34).map(lt => lt.className)

  out.levelClasses = heroicSlice
  out.totalLevel = heroicSlice.filter(Boolean).length
  out.epicLevels = epicSlice.filter(c => c === 'Epic').length
  out.legendaryLevels = legendarySlice.filter(c => c === 'Legendary').length

  // Aggregate triple from heroic per-level (V2 first-seen ordering)
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

  // ── Ability scores (point-buy spend) ─────────────────────────────────────
  out.baseAbilities = parseAbilities(getRec(buildNode, 'AbilitySpend'))

  // ── Ability level-ups: V2 stores <Level4>, <Level8>, … at Build level ────
  // (NOT inside LevelTraining as AbilityLevelUp). All ten elements are always
  // present in a V2 file (required DL_ENUMs, default "Strength"), so ignore
  // entries beyond the build's actual level — they are unpicked defaults.
  const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
  const charLevel = out.totalLevel + out.epicLevels + out.legendaryLevels
  for (const lvl of [4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const) {
    if (lvl > charLevel) continue
    const val = asStr(buildNode[`Level${lvl}`])
    if (val && (ABILITIES as readonly string[]).includes(val)) {
      out.abilityLevelUps[lvl] = val as Ability
    }
  }

  // ── Feats / skills from per-level training ────────────────────────────────
  out.featChoices = {}
  out.skillRanks = {}
  out.skillRanksByLevel = {}

  // Per-slot-type counter used by buildFeatSlotKey to assign localIdx.
  const featSlotCounters: Record<string, number> = {}

  for (let i = 0; i < levelTrainings.length; i++) {
    const lt = levelTrainings[i]
    const charLvl = i + 1

    for (const f of lt.feats) {
      if (!f.name) continue
      const slotKey = buildFeatSlotKey(
        charLvl, lt.className, f.type, heroicSlice, featSlotCounters,
      )
      out.featChoices[slotKey] = f.name
    }

    for (const skill of lt.skills) {
      out.skillRanks[skill] = (out.skillRanks[skill] ?? 0) + 1
      const at = (out.skillRanksByLevel[charLvl] ?? (out.skillRanksByLevel[charLvl] = {}))
      at[skill] = (at[skill] ?? 0) + 1
    }
  }

  // ── Enhancements (heroic + epic destiny + reaper) ────────────────────────
  const enh = parseEnhancements(buildNode, 'EnhancementSpendInTree')
  out.enhancementChoices = enh.choices
  out.enhancementSelections = enh.selections
  out.enhancementPinned = enh.pinned

  // Add trees that were selected in V2 but have 0 AP spent (not in enh.pinned)
  const enhSelectedTrees = arr(getRec(buildNode, 'Enhancement_SelectedTrees')?.TreeName as string | string[] | undefined)
    .map(asStr).filter(t => t && t !== 'No selection')
  for (const treeName of enhSelectedTrees) {
    if (!out.enhancementPinned.includes(treeName)) {
      out.enhancementPinned.push(treeName)
    }
  }

  const dest = parseEnhancements(buildNode, 'DestinySpendInTree')
  out.destinyChoices = dest.choices
  out.destinySelections = dest.selections

  const reap = parseEnhancements(buildNode, 'ReaperSpendInTree')
  out.reaperChoices = reap.choices

  // ── Destiny tree selection ───────────────────────────────────────────────
  const destinySel = arr(getRec(buildNode, 'Destiny_SelectedTrees')?.TreeName as string | string[] | undefined)
    .map(asStr).filter(t => t && t !== 'No selection')
  out.selectedDestinyTrees = [
    destinySel[0] ?? '', destinySel[1] ?? '', destinySel[2] ?? '',
  ]
  // V2 stores Tier5Tree separately; surface as the active destiny.
  out.activeEpicDestiny = asStr(getRec(buildNode, 'Destiny_SelectedTrees')?.Tier5Tree)

  // ── Gear (the active EquippedGear set; V2 supports multiple gear sets) ──
  const gearSets = arr(buildNode.EquippedGear as AnyRec | AnyRec[] | undefined)
  const activeGearName = asStr(buildNode.ActiveGear)
  const activeGearSet = (gearSets.find(g => asStr((g as AnyRec).Name) === activeGearName)
    ?? gearSets[0]) as AnyRec | undefined
  if (activeGearSet) {
    const g = parseGear(activeGearSet)
    out.gear = g.gear
    out.augmentChoices = g.augmentChoices
    out.activeGearSetName = activeGearName || asStr(activeGearSet.Name) || ''
    // Save every gear set as a named-set so the user can switch.
    out.namedGearSets = {}
    out.namedGearAugments = {}
    for (const set of gearSets) {
      const setName = asStr((set as AnyRec).Name)
      if (!setName) continue
      const parsed = parseGear(set as AnyRec)
      out.namedGearSets[setName] = parsed.gear
      out.namedGearAugments[setName] = parsed.augmentChoices
    }
  }

  // ── Sentient gem + filigrees ─────────────────────────────────────────────
  // V2 stores <Personality>, <Filigree>, and <ArtifactFiligree> inside the
  // active <EquippedGear> node, not in a separate <SentientGem> wrapper at
  // build level. Fall back to a build-level wrapper for older formats.
  const sentientNode = getRec(buildNode, 'SentientGem')
    ?? (activeGearSet as AnyRec | undefined)
    ?? getRec(buildNode, 'Filigrees')
    ?? buildNode
  out.sentientGem.personality = asStr(sentientNode.Personality)
  out.filigreeSlots = parseFiligreeSlots(sentientNode, 'Filigree', 6)
  out.artifactFiligreeSlots = parseFiligreeSlots(sentientNode, 'ArtifactFiligree', 10)

  // ── Active stances ───────────────────────────────────────────────────────
  out.activeBuffs = arr(getRec(buildNode, 'ActiveStances')?.Stances as string | string[] | undefined)
    .map(asStr).filter(Boolean)

  // SelfAndPartyBuffs live at the Life level in V2 XML (after </Build>), not
  // inside the Build node.
  const selfBuffs = arr(life.SelfAndPartyBuffs as string | string[] | undefined).map(asStr).filter(Boolean)
  for (const b of selfBuffs) {
    if (!out.activeBuffs.includes(b)) out.activeBuffs.push(b)
  }

  // ── Past lives (Character.SpecialFeats with Type=*PastLife) ─────────────
  // Character-level FeatsListObject holds past lives plus character-wide
  // special feats (e.g. Falconry / Vistani universal-tree access can also
  // appear here). Past lives fold into `pastLives`.
  const charSpecial = parseFeatsListObject(getRec(character, 'SpecialFeats'))
  out.pastLifeTypes = {}
  for (const [k, n] of Object.entries(charSpecial.pastLives)) {
    out.pastLives[k] = (out.pastLives[k] ?? 0) + n
  }
  for (const [k, t] of Object.entries(charSpecial.pastLifeTypes)) {
    out.pastLifeTypes[k] = t
  }
  // Non-past-life Special feats trained N times (Inherent Racial/Universal
  // Action Point, Inherent Fate Point, Inherent Melee Power, …) are
  // effect-bearing and feed the AP budget / stats exactly like past lives —
  // fold them into pastLives by count (previously parsed but dropped).
  for (const name of charSpecial.feats) {
    out.pastLives[name] = (out.pastLives[name] ?? 0) + 1
    out.pastLifeTypes[name] = 'Special'
  }

  // ── Spells (per class / spell-level) — F3 ─────────────────────────────────
  // V2 <TrainedSpells> is a DL_OBJECT_VECTOR of <TrainedSpell> with
  // <Class>/<Level>/<SpellName> (TrainedSpell.h:24-27).
  for (const s of arr(buildNode.TrainedSpell as AnyRec | AnyRec[] | undefined)) {
    const sr = s as AnyRec
    const cls = asStr(sr.Class)
    const lvl = asNum(sr.Level)
    const spell = asStr(sr.SpellName)
    if (!cls || !spell) continue
    const byClass = out.trainedSpells[cls] ?? (out.trainedSpells[cls] = {})
    const byLevel = byClass[lvl] ?? (byClass[lvl] = [])
    if (!byLevel.includes(spell)) byLevel.push(spell)
  }

  // ── Attack chains — F3 ────────────────────────────────────────────────────
  // V2 <AttackChain> (AttackChain.h): <Name> + <Attacks> string list, plus a
  // build-level <ActiveAttackChain> string naming the live chain. V3 models
  // chains as name → ordered attack labels in `attackChains` and stores the
  // active chain name under the reserved key '' is avoided; the active chain is
  // surfaced via attackChains key membership (active chain name kept as-is).
  for (const ch of arr(buildNode.AttackChain as AnyRec | AnyRec[] | undefined)) {
    const cr = ch as AnyRec
    const chName = asStr(cr.Name)
    if (!chName) continue
    out.attackChains[chName] = arr(cr.Attacks as string | string[] | undefined)
      .map(asStr).filter(Boolean)
  }
  out.activeAttackChain = asStr(buildNode.ActiveAttackChain)

  // ── Favor feats (Build.m_FavorFeats FeatsListObject) — F3 ─────────────────
  out.favorFeats = parseFeatsListObject(getRec(buildNode, 'FavorFeats')).feats

  // ── Gear-set ability snapshots (EquippedGear.Snapshot*) — F3 ──────────────
  // V2 stores six <Snapshot{Ability}> values inside each <EquippedGear> plus a
  // build-level <GearSetSnapshot> naming the snapshot baseline set.
  out.gearSetSnapshot = asStr(buildNode.GearSetSnapshot)
  out.gearSetSnapshots = {}
  for (const set of arr(buildNode.EquippedGear as AnyRec | AnyRec[] | undefined)) {
    const sr = set as AnyRec
    const setName = asStr(sr.Name)
    if (!setName) continue
    const snap: Partial<Record<Ability, number>> = {}
    const pairs: [Ability, string][] = [
      ['Strength', 'SnapshotStrength'], ['Dexterity', 'SnapshotDexterity'],
      ['Constitution', 'SnapshotConstitution'], ['Intelligence', 'SnapshotIntelligence'],
      ['Wisdom', 'SnapshotWisdom'], ['Charisma', 'SnapshotCharisma'],
    ]
    let any = false
    for (const [ab, tag] of pairs) {
      if (tag in sr) { snap[ab] = asNum(sr[tag]); any = true }
    }
    if (any) out.gearSetSnapshots[setName] = snap
  }

  // ── Quest completions (best-effort) ──────────────────────────────────────
  // V2 stores <CompletedQuests> on the Build node (Build.h Build_PROPERTIES),
  // not the Life node. Reading from `life` here silently imported nothing.
  const completed = arr(getRec(buildNode, 'CompletedQuests')?.CompletedQuest as AnyRec | AnyRec[] | undefined)
  for (const q of completed) {
    const name = asStr((q as AnyRec).Name)
    const diff = asStr((q as AnyRec).Difficulty) as QuestDifficulty
    if (name) {
      out.completedQuests[name] = true
      if (diff) out.questDifficulty[name] = diff
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ImportResult {
  /** The active life's active build (back-compat for single-build callers). */
  build: CharacterBuild
  /**
   * The full Character → Life[] → Build[] document (F1). Every life and build
   * in the file is imported; `activeLifeId`/`activeBuildId` point at the build
   * returned in `build`. Callers that only need the active build can ignore it.
   */
  document: CharacterDocument
  warnings: string[]
}

/**
 * Parse the <Character>/<Life>/<Build> skeleton out of a V2 .DDOBuild XML
 * string. Returns the parsed nodes and the active indices.
 */
function parseRoot(xml: string) {
  const parsed = parser.parse(xml) as AnyRec
  const root = (parsed.DDOBuilderCharacterData ?? parsed) as AnyRec
  const character = getRec(root, 'Character') ?? root
  const lives = arr(character.Life as AnyRec | AnyRec[] | undefined)
  const activeLifeIdx = asNum(character.ActiveLifeIndex)
  const activeBuildIdx = asNum(character.ActiveBuildIndex ?? '')
  return { character, lives, activeLifeIdx, activeBuildIdx }
}

/**
 * Parses a standalone <EquippedGear> XML fragment (V2 Gear menu Paste parity
 * — EquipmentPane::OnGearPaste reads the same XML OnGearCopy wrote). Returns
 * null when the text is not a gear-set fragment.
 */
export function importGearSetXml(xml: string): {
  name: string
  gear: Record<string, string>
  augmentChoices: Record<string, string>
} | null {
  try {
    const parsed = parser.parse(xml) as AnyRec
    // The parser is configured with EquippedGear in its isArray list.
    const node = arr(parsed.EquippedGear as AnyRec | AnyRec[] | undefined)[0]
    if (!node) return null
    const g = parseGear(node)
    return { name: asStr(node.Name) || 'Pasted Set', gear: g.gear, augmentChoices: g.augmentChoices }
  } catch {
    return null
  }
}

/**
 * Import the FULL multi-life / multi-build document (F1). Every <Life> and its
 * every <Build> is imported into the CharacterDocument model, preserving the
 * V2 ActiveLifeIndex / ActiveBuildIndex selection. The exporter
 * (exportV2Document) emits all of them.
 */
export function importV2Document(xml: string): {
  document: CharacterDocument
  warnings: string[]
} {
  const warnings: string[] = []
  const { character, lives, activeLifeIdx, activeBuildIdx } = parseRoot(xml)

  const docLives: Life[] = []
  let activeLifeId = ''
  let activeBuildId = ''

  for (let li = 0; li < lives.length; li++) {
    const lifeNode = lives[li]
    const buildNodes = arr(lifeNode.Build as AnyRec | AnyRec[] | undefined)
    const lifeId = generateId()

    const lifeSpecial = parseFeatsListObject(getRec(lifeNode, 'SpecialFeats'))
    const builds: CharacterBuild[] = []
    for (let bi = 0; bi < buildNodes.length; bi++) {
      const build = parseBuildNode(buildNodes[bi], lifeNode, character)
      builds.push(build)
      // The active build is the one at (ActiveLifeIndex, ActiveBuildIndex).
      if (li === activeLifeIdx && bi === activeBuildIdx) {
        activeLifeId = lifeId
        activeBuildId = build.id
      }
    }
    if (builds.length === 0) {
      warnings.push(`Life ${li} ("${asStr(lifeNode.Name)}") has no <Build>; skipped.`)
      continue
    }

    docLives.push({
      id: lifeId,
      name: asStr(lifeNode.Name) || `Life ${li + 1}`,
      race: asStr(lifeNode.Race) || 'Human',
      alignment: asStr(lifeNode.Alignment) || 'True Neutral',
      abilityTomes: {
        Strength: asNum(character.StrTome),
        Dexterity: asNum(character.DexTome),
        Constitution: asNum(character.ConTome),
        Intelligence: asNum(character.IntTome),
        Wisdom: asNum(character.WisTome),
        Charisma: asNum(character.ChaTome),
      },
      skillTomes: builds[0].skillTomes,
      selfBuffs: arr(lifeNode.SelfAndPartyBuffs as string | string[] | undefined).map(asStr).filter(Boolean),
      // F4: Life-level SpecialFeats beyond past lives (universal-tree access,
      // Granted feats, …) — previously dropped.
      specialFeats: lifeSpecial.feats,
      builds,
    })
  }

  // Fall back to the first life/build if the active indices are out of range.
  if (!activeLifeId && docLives.length > 0) {
    activeLifeId = docLives[0].id
    activeBuildId = docLives[0].builds[0]?.id ?? ''
  }

  const document: CharacterDocument = {
    id: generateId(),
    name: asStr(character.Name) || docLives[0]?.name || 'Imported V2 Character',
    guildLevel: asNum(character.GuildLevel),
    applyGuildBuffs: Boolean(character.ApplyGuildBuffs),
    characterTomes: {
      Strength: asNum(character.StrTome),
      Dexterity: asNum(character.DexTome),
      Constitution: asNum(character.ConTome),
      Intelligence: asNum(character.IntTome),
      Wisdom: asNum(character.WisTome),
      Charisma: asNum(character.ChaTome),
    },
    // F4: Character-level ContentIDontOwn (adventure packs not owned).
    contentIDontOwn: arr(character.ContentIDontOwn as string | string[] | undefined).map(asStr).filter(Boolean),
    lives: docLives,
    activeLifeId,
    activeBuildId,
    _v: 2,
  }

  if (docLives.length === 0) {
    warnings.push('No <Life> found in V2 build; document has no lives.')
  }

  return { document, warnings }
}

/**
 * Import the active life's active build (back-compat). Also returns the full
 * multi-life document (F1) so newer callers can access every life/build.
 */
export function importV2Build(xml: string): ImportResult {
  const { document, warnings } = importV2Document(xml)
  const life = document.lives.find(l => l.id === document.activeLifeId) ?? document.lives[0]
  const build = life?.builds.find(b => b.id === document.activeBuildId)
    ?? life?.builds[0]
    ?? emptyBuild()
  if (document.lives.length === 0) {
    return { build: emptyBuild(), document, warnings: [...warnings] }
  }
  return { build, document, warnings }
}
