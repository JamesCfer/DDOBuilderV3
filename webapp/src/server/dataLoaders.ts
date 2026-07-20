// V2 game-data loaders, extracted from server.ts so the CLI can use them too.
//
// V3 reads the same XML data the V2 application ships in
// `Output/DataFiles/`. The webapp's Express server exposes them via
// /api/* endpoints, but pure tooling (parity diff CLI, regression tests)
// also wants direct access. This module is the single source of truth
// for "load X from XML on disk".

import path from 'path'
import fs from 'fs'
import { XMLParser } from 'fast-xml-parser'
import type {
  Race, DDOClass, Feat, EnhancementTree, Item, Augment, SetBonus,
  FiligreeSetBonus, Filigree, OptionalBuff, GuildBuff, Stance, Spell,
  Patron, Quest, SentientGem,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

// ---------------------------------------------------------------------------
// XML parser
// ---------------------------------------------------------------------------

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => [
    'Race', 'Class', 'Feat', 'Effect', 'Requirement', 'RequiresOneOf',
    'RequiresNoneOf', 'Group', 'Item', 'EnhancementTree', 'EnhancementTreeItem',
    'EnhancementSelection', 'Selector', 'FeatSlot', 'AutomaticFeats',
    'ClassSkill', 'Alignment', 'Augment', 'Buff', 'ItemAugment',
    'SlotUpgrade', 'UpgradeType',
    'SetBonus', 'Gem', 'Stance', 'Spell', 'Patron', 'Quest', 'GuildBuff',
    'GrantedFeat', 'ClassFeat', 'RacialFeat', 'WeaponGroup', 'Weapon',
    'OptionalBuff', 'Filigree', 'SpellDC', 'SpellDamage', 'ClassSpell',
    'ModAbility',
  ].includes(name),
})

function readXml(filePath: string): unknown {
  const xml = fs.readFileSync(filePath, 'utf-8')
  return xmlParser.parse(xml)
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export function loadRaces(dataDir: string): Race[] {
  const dir = path.join(dataDir, 'Races')
  if (!fs.existsSync(dir)) return []
  // Case-insensitive — V2 ships these on case-insensitive Windows file systems.
  const files = fs.readdirSync(dir).filter(f => /\.race\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Races?: { Race?: unknown[] } }
      const races = (parsed?.Races?.Race ?? []) as Race[]
      // V2 Race::IsIconic() == HasIconicClass() (Race.cpp:84-87): there is no
      // <IsIconic> XML tag — a race is iconic iff it declares an <IconicClass>.
      // Derive it here so consumers (past-life gating, race pickers, exporter)
      // can test r.IsIconic the way V2 does.
      // <NoPastLife /> is a presence-only flag (Race.h DL_FLAG), same as
      // <NotHeroic /> on classes below — the XML parser delivers it as ""
      // which is falsy, so `!r.NoPastLife` never actually excluded Wood Elf
      // (the only race that carries it) from Racial Completionist gating.
      return races.map(r => ({
        ...r,
        IsIconic: r.IconicClass != null && r.IconicClass !== '',
        NoPastLife: 'NoPastLife' in (r as object) ? true : undefined,
      }))
    } catch { return [] }
  })
}

export function loadClasses(dataDir: string): DDOClass[] {
  const dir = path.join(dataDir, 'Classes')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.class\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Classes?: { Class?: unknown[] } }
      const classes = (parsed?.Classes?.Class ?? []) as DDOClass[]
      // <NotHeroic /> is a presence-only flag (Class.h DL_FLAG); the XML parser
      // delivers it as "" which is falsy, so `!c.NotHeroic` wrongly treated
      // Epic/Legendary as heroic. Normalise to an explicit boolean (matches the
      // tree-flag normalisation below).
      return classes.map(c => ({ ...c, NotHeroic: 'NotHeroic' in (c as object) ? true : undefined }))
    } catch { return [] }
  })
}

export function loadFeats(dataDir: string): Feat[] {
  const out: Feat[] = []
  // V2 CDDOBuilderApp::UpdateFeats (DDOBuilder.cpp:1293-1320): every feat named
  // in a class/race FeatSlot's <FeatUpdateList> gets that slot's FeatType ADDED
  // to its Group list, so plain group matching offers it in ALL slots of that
  // type (e.g. "Two Weapon Fighting" gains group "Monk Bonus" from the Monk
  // level-1 slot's list and is then offered in the level-2/6 Monk Bonus slots
  // too). Collected while walking the class/race files below, applied at the end.
  const groupAmendments: Array<{ featType: string, featNames: string[] }> = []
  const collectSlotAmendments = (owner: Record<string, unknown>) => {
    const slots = owner?.FeatSlot
    for (const slot of (Array.isArray(slots) ? slots : slots ? [slots] : [])) {
      const s = slot as Record<string, unknown>
      const featType = typeof s.FeatType === 'string' ? s.FeatType : ''
      const list = s.FeatUpdateList
      const names = (Array.isArray(list) ? list : list ? [list] : []).filter(
        (n): n is string => typeof n === 'string' && n.length > 0,
      )
      if (featType && names.length) groupAmendments.push({ featType, featNames: names })
    }
  }
  // Standard feats
  try {
    const parsed = readXml(path.join(dataDir, 'Feats.xml')) as { Feats?: { Feat?: unknown[] } }
    const feats = parsed?.Feats?.Feat ?? []
    out.push(...((Array.isArray(feats) ? feats : [feats]) as Feat[]))
  } catch { /* no Feats.xml */ }
  // Class-defined inline feats (Epic destinies, Monk bonus feats, etc.).
  // V2 folds these into the global feat catalogue (Class.h ClassFeats list,
  // referenced by name from <AutomaticFeats>).
  const classDir = path.join(dataDir, 'Classes')
  if (fs.existsSync(classDir)) {
    try {
      const classFiles = fs.readdirSync(classDir).filter(f => /\.class\.xml$/i.test(f))
      for (const f of classFiles) {
        try {
          const parsed = readXml(path.join(classDir, f)) as { Classes?: { Class?: unknown } }
          const classes = parsed?.Classes?.Class
          const classList = Array.isArray(classes) ? classes : classes ? [classes] : []
          for (const cls of classList) {
            collectSlotAmendments(cls as Record<string, unknown>)
            const classFeats = (cls as Record<string, unknown>)?.Feat
            if (!classFeats) continue
            const list = Array.isArray(classFeats) ? classFeats : [classFeats]
            out.push(...(list as Feat[]))
          }
        } catch { /* skip bad file */ }
      }
    } catch { /* no Classes dir */ }
  }
  // Race-defined inline feats. V2 parses these into Race::RacialFeats and they
  // resolve against the global feat catalogue when a race grants them by name
  // (e.g. Drow <GrantedFeat>Drow Spell Resistance</GrantedFeat> + matching
  // <Feat> in Drow.race.xml:15-36). V3 previously folded only class-inline
  // feats, so the *effects* of race-granted inline feats were silently missing.
  const raceDir = path.join(dataDir, 'Races')
  if (fs.existsSync(raceDir)) {
    try {
      const raceFiles = fs.readdirSync(raceDir).filter(f => /\.race\.xml$/i.test(f))
      for (const f of raceFiles) {
        try {
          const parsed = readXml(path.join(raceDir, f)) as { Races?: { Race?: unknown } }
          const races = parsed?.Races?.Race
          const raceList = Array.isArray(races) ? races : races ? [races] : []
          for (const race of raceList) {
            collectSlotAmendments(race as Record<string, unknown>)
            const raceFeats = (race as Record<string, unknown>)?.Feat
            if (!raceFeats) continue
            const list = Array.isArray(raceFeats) ? raceFeats : [raceFeats]
            out.push(...(list as Feat[]))
          }
        } catch { /* skip bad file */ }
      }
    } catch { /* no Races dir */ }
  }
  // Apply the V2 UpdateFeats group amendments now that every feat is loaded.
  if (groupAmendments.length) {
    const byName = new Map<string, Feat>()
    for (const f of out) if (f?.Name && !byName.has(f.Name)) byName.set(f.Name, f)
    for (const { featType, featNames } of groupAmendments) {
      for (const name of featNames) {
        const feat = byName.get(name)
        if (!feat) continue // V2 logs unknown names; nothing to amend
        const groups = Array.isArray(feat.Group) ? feat.Group : feat.Group ? [feat.Group] : []
        if (!groups.includes(featType)) feat.Group = [...groups, featType]
      }
    }
  }
  return out
}

export function loadEnhancementTrees(dataDir: string): EnhancementTree[] {
  const dir = path.join(dataDir, 'EnhancementTrees')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.tree\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Enhancements?: { EnhancementTree?: unknown[] } }
      const trees = (parsed?.Enhancements?.EnhancementTree ?? []) as Record<string, unknown>[]
      return trees.map(tree => {
        // self-closing item flags (<Tier5/>, <Clickie/>) arrive as "" — normalise
        // to explicit booleans so consumers can test them truthily.
        const items = tree.EnhancementTreeItem
        const normItems = Array.isArray(items)
          ? (items as Record<string, unknown>[]).map(it => ({
              ...it,
              Tier5: 'Tier5' in it ? true : undefined,
              Clickie: 'Clickie' in it ? true : undefined,
            }))
          : items
        return {
          ...tree,
          EnhancementTreeItem: normItems,
          // self-closing tags arrive as "" — normalise to explicit booleans
          IsReaperTree: 'IsReaperTree' in tree ? true : undefined,
          IsEpicDestiny: 'IsEpicDestiny' in tree ? true : undefined,
          IsRacialTree: 'IsRacialTree' in tree ? true : undefined,
          IsUniversalTree: 'IsUniversalTree' in tree ? true : undefined,
          Legacy: 'Legacy' in tree ? true : undefined,
        }
      }) as EnhancementTree[]
    } catch { return [] }
  })
}

/** The ten per-spell metamagic DL_FLAGs in V2 Spell.h:67-76 (no EschewMaterials). */
const SPELL_METAMAGIC_FLAGS = [
  'Accelerate', 'Embolden', 'Empower', 'EmpowerHealing', 'Enlarge',
  'Extend', 'Heighten', 'Intensify', 'Maximize', 'Quicken',
] as const

/** Unwraps fast-xml-parser's `{ '#text': N, size: M }` shape to a plain number. */
function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isNaN(n) ? undefined : n
  }
  if (v && typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return asNumber((v as Record<string, unknown>)['#text'])
  }
  return undefined
}

/**
 * Loads Spells.xml and reconciles the parsed shape with the typed `Spell`
 * contract. Two XML quirks must be normalised:
 *   1. Self-closing flags (`<Heighten/>`, `<CastingStatMod/>`) arrive as "" —
 *      falsy — so `spell.Heighten === true` / `if (dc.CastingStatMod)` never
 *      fired (metamagics and the DC casting-stat term silently vanished). We
 *      promote presence to an explicit boolean (V2 treats these as DL_FLAG).
 *   2. `<Amount size="1">25</Amount>` parses to `{ '#text': 25, size: 1 }`;
 *      coerce to a number so `dc.Amount ?? 10` is arithmetic-safe.
 *
 * The per-class spell Level / Cost / MaxCasterLevel live in each class XML's
 * `<ClassSpell>` list (Spells.xml has no <Level>/<Class>), exactly as V2
 * stamps them via Spell::UpdateSpell (Spell.cpp:147-162). We merge those here
 * so `spell.Level[className]` is populated for SpellsPanel/DC display.
 */
export function loadSpells(dataDir: string): Spell[] {
  let spells: Spell[]
  try {
    const parsed = readXml(path.join(dataDir, 'Spells.xml')) as { Spells?: { Spell?: unknown[] } }
    spells = (parsed?.Spells?.Spell ?? []) as Spell[]
  } catch { return [] }

  // Per-class spell level/cost map keyed by spell name.
  type ClassSpellInfo = { className: string; level: number; cost?: number; maxCasterLevel?: number }
  const byName = new Map<string, ClassSpellInfo[]>()
  try {
    const dir = path.join(dataDir, 'Classes')
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter(n => /\.class\.xml$/i.test(n))) {
        const parsed = readXml(path.join(dir, f)) as { Classes?: { Class?: unknown[] } }
        for (const c of (parsed?.Classes?.Class ?? []) as Record<string, unknown>[]) {
          const className = c.Name as string
          const cs = c.ClassSpell
          const list = Array.isArray(cs) ? cs : cs ? [cs] : []
          for (const e of list as Record<string, unknown>[]) {
            const name = e.Name as string
            const level = asNumber(e.Level)
            if (!name || level == null) continue
            const arr = byName.get(name) ?? []
            arr.push({ className, level, cost: asNumber(e.Cost), maxCasterLevel: asNumber(e.MaxCasterLevel) })
            byName.set(name, arr)
          }
        }
      }
    }
  } catch { /* class spell lists optional */ }

  return spells.map(raw => {
    const s = { ...raw } as Spell & Record<string, unknown>
    // 1. promote metamagic / CastingStatMod presence flags to booleans
    for (const flag of SPELL_METAMAGIC_FLAGS) {
      if (flag in s) s[flag] = true
    }
    // 2. normalise SpellDC blocks
    const dcs = Array.isArray(s.SpellDC) ? s.SpellDC : s.SpellDC ? [s.SpellDC] : []
    if (dcs.length > 0) {
      s.SpellDC = dcs.map(dc => {
        const d = { ...dc } as Record<string, unknown>
        if ('CastingStatMod' in d) d.CastingStatMod = true
        if ('Amount' in d) {
          const n = asNumber(d.Amount)
          if (n != null) d.Amount = n
        }
        return d as unknown as typeof dc
      })
    }
    // 3. merge per-class Level / Cost / MaxCasterLevel from <ClassSpell>
    const info = byName.get(s.Name)
    if (info && info.length > 0) {
      const levelMap: Record<string, number> = { ...(typeof s.Level === 'object' ? s.Level : {}) }
      for (const ci of info) levelMap[ci.className] = ci.level
      s.Level = levelMap
      // Spell-level cost / max-caster-level default from the (matching) class entry.
      if (s.Cost == null && info[0].cost != null) s.Cost = info[0].cost
      if (s.MaxCasterLevel == null && info[0].maxCasterLevel != null) s.MaxCasterLevel = info[0].maxCasterLevel
    }
    return s as Spell
  })
}

export function loadWeaponGroups(dataDir: string): WeaponGroupSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'WeaponGroupings.xml')) as {
      WeaponGroupings?: { WeaponGroup?: unknown[] }
    }
    return (parsed?.WeaponGroupings?.WeaponGroup ?? []) as WeaponGroupSpec[]
  } catch { return [] }
}

export function loadStances(dataDir: string): Stance[] {
  let stances: Stance[] = []
  try {
    const parsed = readXml(path.join(dataDir, 'Stances.xml')) as { Stances?: { Stance?: unknown[] } }
    stances = (parsed?.Stances?.Stance ?? []) as Stance[]
  } catch { return [] }
  // V2 parity: CStancesPane also surfaces <Stance> elements hosted on trained
  // feats. The "Attack" feat (Feats.xml, Acquire=Automatic at level 1 — every
  // build has it) hosts the universal user toggles "Reaper", "Action Boost"
  // and "Blocking". Conditional filigree set-bonus tiers (e.g. Deadly Rain
  // 5pc: "+20 Ranged Power while an Action Boost is active") are gated on
  // Requirement Stance:"Action Boost", so without this merge the trigger can
  // never be toggled in V3.
  try {
    const known = new Set(stances.map(s => s.Name))
    const attackFeat = loadFeats(dataDir).find(f => f.Name === 'Attack') as
      (Feat & { Stance?: Stance | Stance[] }) | undefined
    const hosted = attackFeat?.Stance
    const hostedList = Array.isArray(hosted) ? hosted : hosted ? [hosted] : []
    for (const s of hostedList) {
      if (s?.Name && !known.has(s.Name)) {
        known.add(s.Name)
        stances.push(s)
      }
    }
  } catch { /* Feats.xml unavailable — base stances only */ }
  return stances
}

export function loadItems(dataDir: string): Item[] {
  const dir = path.join(dataDir, 'Items')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.item$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Items?: { Item?: unknown[] } }
      const items = parsed?.Items?.Item
      if (!items) return []
      return (Array.isArray(items) ? items : [items]) as Item[]
    } catch { return [] }
  })
}

export function loadAugments(dataDir: string): Augment[] {
  const dir = path.join(dataDir, 'Augments')
  if (!fs.existsSync(dir)) return []
  // V2 ships Augment files as "*.Augments.xml" (capital A) on Windows and as
  // "*.augments.xml" historically; match either to be robust on Linux.
  const files = fs.readdirSync(dir).filter(f => /\.augments\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Augments?: { Augment?: unknown[] } }
      return (parsed?.Augments?.Augment ?? []) as Augment[]
    } catch { return [] }
  })
}

export function loadSetBonuses(dataDir: string): SetBonus[] {
  try {
    const parsed = readXml(path.join(dataDir, 'SetBonuses.xml')) as { SetBonuses?: { SetBonus?: unknown[] } }
    return (parsed?.SetBonuses?.SetBonus ?? []) as SetBonus[]
  } catch { return [] }
}

export function loadGuildBuffs(dataDir: string): GuildBuff[] {
  try {
    const parsed = readXml(path.join(dataDir, 'GuildBuffs.xml')) as { GuildBuffs?: { GuildBuff?: unknown[] } }
    return (parsed?.GuildBuffs?.GuildBuff ?? []) as GuildBuff[]
  } catch { return [] }
}

export function loadFiligreeSets(dataDir: string): Filigree[] {
  const dir = path.join(dataDir, 'FiligreeSets')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.filigree\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Filigrees?: { Filigree?: unknown[] } }
      const filigrees = (parsed?.Filigrees?.Filigree ?? []) as Filigree[]
      // V2 Effect_Rare is a DL_FLAG (Effect.h:623) splitting normal vs rare
      // effects (Filigree::NormalEffects/RareEffects). The XML self-closing
      // <Rare/> parses to "" (falsy), so the rare-slot gate in useBuildStats
      // never fired. Promote presence to an explicit boolean.
      return filigrees.map(fil => {
        const effects = fil.Effect
        if (effects === undefined) return fil
        const list = Array.isArray(effects) ? effects : [effects]
        const normEffects = list.map(e =>
          'Rare' in (e as object) ? { ...e, Rare: true } : e,
        )
        return { ...fil, Effect: Array.isArray(effects) ? normEffects : normEffects[0] }
      })
    } catch { return [] }
  })
}

export function loadFiligreeBonuses(dataDir: string): FiligreeSetBonus[] {
  const dir = path.join(dataDir, 'FiligreeSets')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.filigree\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Filigrees?: { SetBonus?: unknown[] } }
      return (parsed?.Filigrees?.SetBonus ?? []) as FiligreeSetBonus[]
    } catch { return [] }
  })
}

export function loadSelfAndPartyBuffs(dataDir: string): OptionalBuff[] {
  try {
    const parsed = readXml(path.join(dataDir, 'SelfAndPartyBuffs.xml')) as {
      SelfAndPartyBuffs?: { OptionalBuff?: unknown[] }
    }
    return (parsed?.SelfAndPartyBuffs?.OptionalBuff ?? []) as OptionalBuff[]
  } catch { return [] }
}

export function loadPatrons(dataDir: string): Patron[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Patrons.xml')) as { Patrons?: { Patron?: unknown[] } }
    return (parsed?.Patrons?.Patron ?? []) as Patron[]
  } catch { return [] }
}

export function loadQuests(dataDir: string): Quest[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Quests.xml')) as { Quests?: { Quest?: unknown[] } }
    return (parsed?.Quests?.Quest ?? []) as Quest[]
  } catch { return [] }
}

export function loadSentientGems(dataDir: string): SentientGem[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Sentient.gems.xml')) as { SentientGems?: { Gem?: unknown[] } }
    return (parsed?.SentientGems?.Gem ?? []) as SentientGem[]
  } catch { return [] }
}

// ---------------------------------------------------------------------------
// V2-parity additions: AttackRates, BonusTypes, Challenges, ItemBuffs,
// ItemClickies. These were not loaded by V3 previously even though they
// ship in the V2 DataFiles distribution.
// ---------------------------------------------------------------------------

/** V2 AttackRates.xml — attacks-per-minute tables keyed by combat style. */
export interface AttackRate {
  Style: string
  Race?: string
  AttacksPerMinute?: string
}

export function loadAttackRates(dataDir: string): AttackRate[] {
  try {
    const parsed = readXml(path.join(dataDir, 'AttackRates.xml')) as { AttackRates?: { Rate?: unknown[] } }
    return (parsed?.AttackRates?.Rate ?? []) as AttackRate[]
  } catch { return [] }
}

/** V2 BonusTypes.xml — stacking rules by bonus type name. */
export interface BonusTypeSpec {
  Name: string
  Stacking?: 'Highest Only' | 'Stacking' | string
}

export function loadBonusTypes(dataDir: string): BonusTypeSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'BonusTypes.xml')) as { BonusTypes?: { Bonus?: unknown[] } }
    return (parsed?.BonusTypes?.Bonus ?? []) as BonusTypeSpec[]
  } catch { return [] }
}

/** V2 Challenges.xml (added 2.0.0.79) — patron-affiliated challenges. */
export interface Challenge {
  Name: string
  Patron?: string
  AdventurePack?: string
  LevelRange?: string | { '#text'?: string }
  Favor?: number
}

/**
 * V2 IgnoredList.xml — default list of feat/item names hidden from selection
 * lists when "Ignore Lists Active" is on (CDDOBuilderApp::IgnoreList,
 * DDOBuilder.cpp:1481-1510). User additions/removals layer on top in V3
 * settings (V2 keeps them in the same file in the user data dir).
 */
/**
 * Adventure-pack names — the union of <AdventurePack> values from Quests.xml
 * and Challenges.xml, in first-seen order (V2 CDDOBuilderApp::LoadQuests /
 * LoadChallenges, DDOBuilder.cpp:1193-1201 + 1238-1246). Drives the
 * ContentPane ownership list; items from packs in Character.contentIDontOwn
 * are hidden from item-selection lists (ItemSelectDialog.cpp:312-318).
 */
export function loadAdventurePacks(dataDir: string): string[] {
  const packs: string[] = []
  const seen = new Set<string>()
  const add = (p: unknown) => {
    const name = typeof p === 'string' ? p : ''
    if (name && !seen.has(name)) { seen.add(name); packs.push(name) }
  }
  for (const q of loadQuests(dataDir)) add((q as { AdventurePack?: string }).AdventurePack)
  for (const c of loadChallenges(dataDir)) add((c as { AdventurePack?: string }).AdventurePack)
  return packs
}

export function loadIgnoredList(dataDir: string): string[] {
  try {
    const parsed = readXml(path.join(dataDir, 'IgnoredList.xml')) as { IgnoredList?: { Ignored?: unknown } }
    const raw = parsed?.IgnoredList?.Ignored
    const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : []
    return arr.map(String)
  } catch { return [] }
}

export function loadChallenges(dataDir: string): Challenge[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Challenges.xml')) as { Challenges?: { Challenge?: unknown[] } }
    return (parsed?.Challenges?.Challenge ?? []) as Challenge[]
  } catch { return [] }
}

/** V2 ItemBuffs.xml — item-buff display-text catalogue (Type → text). */
export interface ItemBuffSpec {
  Type: string
  DisplayText?: string
  // The buff template's Effect list (V2 Buff::Effects). Carries the real stat
  // effects that an item's <Buff> references by Type; parseItemBuff resolves
  // flavour-named Types against these (V2 Item::FindEffect, Item.cpp:452-472).
  Effect?: import('../types/ddo').Effect | import('../types/ddo').Effect[]
}

export function loadItemBuffs(dataDir: string): ItemBuffSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'ItemBuffs.xml')) as { Buffs?: { Buff?: unknown[] } }
    return (parsed?.Buffs?.Buff ?? []) as ItemBuffSpec[]
  } catch { return [] }
}

/** V2 ItemClickies.xml — clickie spell catalog (description + icon). */
export interface ItemClickieSpec {
  Name: string
  Description?: string
  Icon?: string
}

export function loadItemClickies(dataDir: string): ItemClickieSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'ItemClickies.xml')) as { Spells?: { Spell?: unknown[] } }
    return (parsed?.Spells?.Spell ?? []) as ItemClickieSpec[]
  } catch { return [] }
}

/**
 * Convenience: load every catalogue. Returns the same shape the React
 * `BuildStatsInput` expects (minus `gearItems`, which depend on the
 * specific build's equipped items).
 */
export interface LoadedCatalogues {
  allRaces: Race[]
  allClasses: DDOClass[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]
  allSelfBuffs: OptionalBuff[]
  allAugments: Augment[]
  allSetBonuses: SetBonus[]
  allFiligreeBonuses: FiligreeSetBonus[]
  allFiligrees: Filigree[]
  allWeaponGroups: WeaponGroupSpec[]
  allSpells: Spell[]
  allGuildBuffs: GuildBuff[]
  allItems: Item[]
  allAttackRates: AttackRate[]
  allBonusTypes: BonusTypeSpec[]
  allChallenges: Challenge[]
  allItemBuffs: ItemBuffSpec[]
  allItemClickies: ItemClickieSpec[]
}

export function loadAllCatalogues(dataDir: string): LoadedCatalogues {
  return {
    allRaces: loadRaces(dataDir),
    allClasses: loadClasses(dataDir),
    allFeats: loadFeats(dataDir),
    allTrees: loadEnhancementTrees(dataDir),
    allSelfBuffs: loadSelfAndPartyBuffs(dataDir),
    allAugments: loadAugments(dataDir),
    allSetBonuses: loadSetBonuses(dataDir),
    allFiligreeBonuses: loadFiligreeBonuses(dataDir),
    allFiligrees: loadFiligreeSets(dataDir),
    allWeaponGroups: loadWeaponGroups(dataDir),
    allSpells: loadSpells(dataDir),
    allGuildBuffs: loadGuildBuffs(dataDir),
    allItems: loadItems(dataDir),
    allAttackRates: loadAttackRates(dataDir),
    allBonusTypes: loadBonusTypes(dataDir),
    allChallenges: loadChallenges(dataDir),
    allItemBuffs: loadItemBuffs(dataDir),
    allItemClickies: loadItemClickies(dataDir),
  }
}
