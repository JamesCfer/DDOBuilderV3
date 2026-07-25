// buildStats — full V2-style stat aggregation (pure computation layer).
//
// Collects bonuses from every source (race, class, feats, enhancements,
// epic destiny, reaper, gear, augments, set bonuses, filigrees, self-buffs,
// tomes, skill ranks) into a StatMap, then exposes a resolve(statKey) function
// that applies DDO stacking rules.
//
// Two-phase approach:
//   Phase 1 – accumulate raw bonuses into a Map<statKey, RawBonus[]>
//   Phase 2 – resolve ability scores, then add ability-mod-derived bonuses
//
// This module is deliberately free of React/context imports so it can be used
// from the Express server (community build snapshots) and CLI scripts as well
// as from the useBuildStats hook, which wraps computeBuildStats/buildStatMap
// with memoisation and re-exports everything here.

import type { CharacterBuild } from '../types/ddo'
import { SKILLS } from './gamedata'
import type {
  Race, DDOClass, Feat, EnhancementTree, EnhancementTreeItem, Item,
  Effect, EnhancementSelection, Augment, SetBonus, FiligreeSetBonus, Filigree,
  OptionalBuff, FiligreeSlot, Spell, GuildBuff, ItemBuff,
} from '../types/ddo'
import { parseEffect, parseItemBuff } from './effectParser'
import type { EffectContext, ItemBuffTemplate } from './effectParser'
import { resolveBonus, emptyResolvedStat } from './bonus'
import type { RawBonus, ResolvedStat } from './bonus'
import { deriveWeaponClasses } from './weapons/groups'
import type { WeaponGroupSpec, RuntimeGroupAdd, RuntimeGroupMerge } from './weapons/groups'
import { buildAutomaticFeatGroups } from './automaticFeats'
import {
  reaperHpCap, styleBonusHp, effectiveDodgeCap,
  divineGraceCap, halfElfLesserDivineGraceCap,
} from './v2Formulas'
import { getLevelClasses, tomeCapAtLevel } from './levelProgression'

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface BuildStats {
  /** Resolve a stat key to its stacked total + annotated bonus list */
  resolve: (key: string) => ResolvedStat
  /** Shortcut: total value for a stat key */
  total: (key: string) => number
  /** All accumulated stat keys (useful for iteration) */
  keys: () => string[]
  /** Equipped weapon info (null if no weapon equipped) */
  weapon: WeaponInfo | null
  /** Armor max-DEX cap (null = no cap) */
  armorMaxDex: number | null
  /** Sorted list of SLA spell names derived from SpellLikeAbility effects
   *  (V2 CSLAControl parity — replaces manual build.slaCharges for display). */
  slaList: string[]
  /** Sorted list of feat names granted by GrantFeat effects from enhancements,
   *  items, or augments (V2 GrantedFeatsPane parity). Does not include feats
   *  already present in the player-trained / auto-granted set. */
  grantedFeatsList: string[]
  /**
   * Returns true if the character has weapon proficiency for the given weapon
   * type (V2 Build::IsWeaponInGroup("Proficiency", wt) parity).
   * Proficiency is granted by AddGroupWeapon effects on trained feats and
   * enhancements (e.g. "Simple Weapon Proficiency: Club" adds Club to the
   * dynamic "Proficiency" group).
   */
  isWeaponProficient: (weaponType: string) => boolean
}

export interface WeaponInfo {
  name: string
  slot: string
  diceNum: number
  diceSides: number
  critThreatRange: number   // number of threat faces, e.g. 2 = threatens on 19-20
  critMultiplier: number
  attackModifier: string    // 'Strength' | 'Dexterity'
  weaponType?: string       // base weapon type, e.g. 'Longsword' (for group lookup)
}

// ---------------------------------------------------------------------------
// External data the hook consumers must supply
// ---------------------------------------------------------------------------

export interface BuildStatsInput {
  allClasses: DDOClass[]
  allRaces: Race[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]        // enhancement + destiny + reaper trees
  allSelfBuffs: OptionalBuff[]
  allAugments: Augment[]
  allSetBonuses: SetBonus[]
  allFiligreeBonuses: FiligreeSetBonus[]
  allFiligrees: Filigree[]
  gearItems: Record<string, Item>    // slot → resolved Item object
  /** Static weapon-group catalogue (from /api/weapongroups). Optional. */
  allWeaponGroups?: WeaponGroupSpec[]
  /** All spell metadata (from /api/spells). Optional — used for trained-spell self-effects. */
  allSpells?: Spell[]
  /** All guild-buff definitions (from /api/guildbuffs). Optional. */
  allGuildBuffs?: GuildBuff[]
  /**
   * ItemBuffs.xml template catalogue (from /api/itembuffs). Optional — used to
   * resolve flavour-named item Buff Types (e.g. Vampirism, PhysicalSheltering)
   * whose stat effects live only in the template (V2 Item::FindEffect).
   */
  allItemBuffs?: ItemBuffTemplate[]
  /**
   * Life-level "Special" acquired feats (V2 `Life.specialFeats` /
   * `Life::AllSpecialFeats`), e.g. Chrism reincarnation-cache feats (Inherent
   * Melee/Ranged Power, Inherent MRR/PRR, Inherent Universal Spell Power,
   * Inherent Fate Point, Inherent RAP/UAP Bonus). One entry per redemption —
   * duplicates represent repeated training (V2 allows up to +4 stacks).
   * Optional — not owned by CharacterBuild, so callers must supply it from
   * the owning Life.
   */
  specialFeats?: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type StatMap = Map<string, RawBonus[]>

function add(map: StatMap, key: string, bonus: RawBonus): void {
  const list = map.get(key)
  if (list) list.push(bonus)
  else map.set(key, [bonus])
}

function addParsed(map: StatMap, bonuses: ReturnType<typeof parseEffect>, fromGear = false): void {
  for (const pb of bonuses) {
    // V2 <ApplyAsItemEffect/>: the effect joins m_itemEffects, i.e. the gear
    // pool where RemoveNonStacking ("Highest Only" per bonus type) applies
    // (BreakdownItem.cpp:623-698, :205-221).
    const asGear = fromGear || pb.asItemEffect === true
    add(map, pb.statKey, { value: pb.value, type: pb.bonusType, source: pb.source, fromGear: asGear, percent: pb.percent, stackGroup: pb.stackGroup, stackAmounts: pb.stackAmounts })
  }
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

// V2 walks ALL LevelTraining entries — including the Epic/Legendary
// pseudo-class levels — when collecting class AutomaticFeats
// (Build::UpdateFeats, Build.cpp:2437-2465). Epic.class.xml grants
// "Epic Skills" (+1 all skills) and "Epic Power" (+6 ranged/spell power)
// at EVERY epic level, Legendary.class.xml similar; iterating only
// build.classes silently dropped all of them (−10 all skills, −84
// ranged/spell power at level 34 on the golden build).
function classesWithEpicPseudo(build: CharacterBuild): Array<{ name: string, levels: number }> {
  const out = build.classes.filter(bc => bc.name && bc.levels > 0)
  if ((build.epicLevels ?? 0) > 0) out.push({ name: 'Epic', levels: build.epicLevels ?? 0 })
  if ((build.legendaryLevels ?? 0) > 0) out.push({ name: 'Legendary', levels: build.legendaryLevels ?? 0 })
  return out
}

// V2 .DDOBuild files and the TreeGrid UI both key enhancement choices by the
// item's InternalName (e.g. "WCCore1"); older V3 saves used the display Name.
// Every rank/selection lookup must accept either key (same policy as
// exclusionGroups.ts / TreeGrid.tsx itemKey).
type EnhKeyed = { Name: string; InternalName?: string }

export function enhancementRank(
  choices: Record<string, number> | undefined,
  item: EnhKeyed,
): number {
  if (!choices) return 0
  return choices[item.InternalName ?? ''] ?? choices[item.Name] ?? 0
}

export function enhancementSelection(
  selections: Record<string, string> | undefined,
  item: EnhKeyed,
): string | undefined {
  if (!selections) return undefined
  return selections[item.InternalName ?? ''] ?? selections[item.Name]
}

function abMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

// ---------------------------------------------------------------------------
// Runtime weapon-group adds (proficiency + Kensei focus weapons, etc.)
// ---------------------------------------------------------------------------

/**
 * Collects AddGroupWeapon / MergeGroups effects from all trained feats and
 * enhancements. Returns the runtime adds that must be passed to
 * deriveWeaponClasses so that dynamically-built groups (most importantly
 * "Proficiency") are correctly resolved.
 *
 * V2 parity: Build::AddWeaponToGroup (Build.cpp:5407) populates m_weaponGroups
 * from Effect_AddGroupWeapon effects on every active feat/enhancement.
 * Build::IsWeaponInGroup then searches that runtime list.
 */
export function buildRuntimeGroupAdds(
  input: BuildStatsInput,
  build: CharacterBuild,
): { adds: RuntimeGroupAdd[], merges: RuntimeGroupMerge[] } {
  const { allFeats, allTrees, allClasses, allRaces } = input
  const adds: RuntimeGroupAdd[] = []
  const merges: RuntimeGroupMerge[] = []

  // Collect all trained feat names (player choices + auto-feats + race grants)
  const featNames = new Set<string>()
  for (const f of Object.values(build.featChoices)) if (f) featNames.add(f)
  const race = allRaces.find(r => r.Name === build.race)
  if (race) for (const f of toArray(race.GrantedFeat)) featNames.add(f as string)
  for (const bc of classesWithEpicPseudo(build)) {
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls) continue
    for (const af of toArray(cls.AutomaticFeats)) {
      if ((af.Level ?? 0) > bc.levels) continue
      const names = af.Feats
      if (typeof names === 'string') featNames.add(names)
      else if (Array.isArray(names)) for (const n of names) featNames.add(n)
    }
  }

  function extractFromEffects(effects: Effect[]): void {
    for (const eff of effects) {
      const its = toArray(eff.Item) as string[]
      if (eff.Type === 'AddGroupWeapon' && its.length >= 2) {
        const group = its[0]
        for (let i = 1; i < its.length; i++) {
          if (its[i]) adds.push({ group, weaponType: its[i] })
        }
      } else if (eff.Type === 'MergeGroups' && its.length >= 2) {
        merges.push({ baseGroup: its[0], mergedGroup: its[1] })
      } else if (eff.Type === 'WeaponProficiencyClass') {
        // e.g. "Half-Elf Dilettante: Ranger" → Item=Ranged grants proficiency
        // with every weapon in the Ranged static group via a group merge.
        for (const cls of its) {
          if (cls) merges.push({ baseGroup: 'Proficiency', mergedGroup: cls })
        }
      }
    }
  }

  // Feats
  for (const featName of featNames) {
    const feat = allFeats.find(f => f.Name === featName)
    if (feat) extractFromEffects(toArray(feat.Effect))
  }

  // Enhancements (heroic, destiny, reaper)
  const selectedDestinySet = new Set((build.selectedDestinyTrees ?? []).filter(Boolean))

  function collectEnhTree(
    treeName: string,
    choices: Record<string, number>,
    selections: Record<string, string>,
  ): void {
    const tree = allTrees.find(t => t.Name === treeName)
    if (!tree) return
    for (const item of (tree.EnhancementTreeItem ?? [])) {
      const rank = enhancementRank(choices, item)
      if (rank <= 0) continue
      const selectedOption = enhancementSelection(selections, item)
      if (selectedOption) {
        const options = getSelectorOptions(item)
        const opt = options.find(o => o.Name === selectedOption)
        if (opt) {
          extractFromEffects(toArray(opt.Effect as Effect | Effect[] | undefined))
        }
      }
      // V2 EnhancementTreeItem::GetEffects: own <Effect> list always applies
      // alongside the selected option's effects (never replaced by them).
      extractFromEffects(toArray(item.Effect))
    }
  }

  for (const [treeName, choices] of Object.entries(build.enhancementChoices)) {
    collectEnhTree(treeName, choices, build.enhancementSelections[treeName] ?? {})
  }
  for (const [treeName, choices] of Object.entries(build.destinyChoices)) {
    if (!selectedDestinySet.has(treeName)) continue
    collectEnhTree(treeName, choices, build.destinySelections?.[treeName] ?? {})
  }
  for (const [treeName, choices] of Object.entries(build.reaperChoices ?? {})) {
    collectEnhTree(treeName, choices, build.reaperSelections?.[treeName] ?? {})
  }

  return { adds, merges }
}

// tomeCapAtLevel is imported from lib/levelProgression so the rule is shared
// across the codebase (V2 Life::TomeAtLevel parity).

const MAX_BAB = 25

// ---------------------------------------------------------------------------
// Save / BAB / SP helpers
// ---------------------------------------------------------------------------

function saveBase(saveType: unknown, levels: number): number {
  const s = String(saveType ?? '')
  // Epic/Legendary pseudo-classes declare <Fortitude>None</Fortitude> etc. —
  // V2 contributes NOTHING for them (epic levels grant no base saves). The
  // old poor-progression fallback silently added +3/+1, inflating every save
  // by a uniform +4 at level 34.
  if (s === 'None' || s === '') return 0
  if (s === 'Strong' || s === 'Type2') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)
}

/**
 * Space-separated numeric XML tables (BAB, SpellPointsPerLevel, …) carry a
 * `size` attribute, so fast-xml-parser wraps the text as `{ '#text': '…',
 * size: N }` instead of a bare string. Unwrap `#text` before parsing; a plain
 * `String()` on the object yields "[object Object]" → every number NaN → the
 * table reads as empty (the cause of Monk BAB computing as 0). Verified
 * against v2calc.
 */
function xmlText(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'object' && '#text' in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>)['#text'] ?? '')
  }
  return String(raw)
}

/** V2 BAB: per-class fraction is truncated, then summed across classes. */
function classBAB(cls: DDOClass, levels: number): number {
  const arr = xmlText(cls.BAB).trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  let raw = 0
  if (arr.length > levels) raw = arr[levels]
  else if (arr.length > 0) raw = arr[arr.length - 1]
  return Math.trunc(raw)
}

/** V2 SpellPointsPerLevel is a 21-entry table indexed by class levels (0..20). */
function spellPointsAtLevel(perLevel: unknown, levels: number): number {
  const arr = xmlText(perLevel).trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  if (arr.length === 0) return 0
  const idx = Math.min(Math.max(levels, 0), arr.length - 1)
  return arr[idx] | 0
}

/** Pick the highest-value casting stat for multi-stat classes (e.g. Favored Soul). */
function pickCastingStat(
  cs: string | string[] | undefined,
  abilModMap: Record<string, number>,
): string | null {
  if (!cs) return null
  const list = Array.isArray(cs) ? cs : [cs]
  if (list.length === 0) return null
  return list.reduce((best, ab) =>
    (abilModMap[ab] ?? -Infinity) > (abilModMap[best] ?? -Infinity) ? ab : best,
  )
}

// ---------------------------------------------------------------------------
// Enhancement tree AP and effect helpers
// ---------------------------------------------------------------------------

function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw || '1'
  if (typeof raw === 'object' && !Array.isArray(raw) && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    if (t != null) return String(t) || '1'
  }
  return '1'
}

function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const maxRanks = typeof item.Ranks === 'number' ? item.Ranks : 1
  const str = normalizeCostPerRank(item.CostPerRank)
  const parts = str.trim().split(/\s+/).map(Number).filter(isFinite)
  const costs =
    parts.length === 0 ? Array(maxRanks).fill(1) :
    parts.length === 1 ? Array(maxRanks).fill(parts[0]) :
    Array.from({ length: maxRanks }, (_, i) => parts[i] ?? parts[parts.length - 1])
  return (costs as number[]).slice(0, rank).reduce((a: number, b: number) => a + b, 0)
}

function computeTreeAP(items: EnhancementTreeItem[], choices: Record<string, number>): number {
  return items.reduce((sum, item) => sum + costUpToRank(item, enhancementRank(choices, item)), 0)
}

export function getSelectorOptions(item: EnhancementTreeItem): EnhancementSelection[] {
  if (!item.Selector || item.Selector.length === 0) return []
  const group = item.Selector[0]
  const raw = group.EnhancementSelection
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

// ---------------------------------------------------------------------------
// Phase 1 accumulators
// ---------------------------------------------------------------------------

function accumulateRace(map: StatMap, race: Race): void {
  const ABILITY_FIELDS = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
  for (const ab of ABILITY_FIELDS) {
    const val = (race as unknown as Record<string, unknown>)[ab]
    if (typeof val === 'number' && val !== 0) {
      add(map, `ability.${ab}`, { value: val, type: 'Racial', source: `${race.Name} racial` })
    }
  }
}

/**
 * V2 parity: Class HP is `c.HitPoints() * classLevels` for every class,
 * Epic and Legendary included (BreakdownItemHitpoints.cpp:68-73 —
 * `classBonus` always uses the full, un-halved amount). The `/2` at
 * BreakdownItemHitpoints.cpp:74-83 only scales the *separate*
 * `classHitpoints` accumulator that feeds the Combat Style percentage bonus
 * (see the `nonEpicHD` computation below, in buildStatMap) — it never halves
 * the class's own HP effect. The CON-mod component is applied separately at
 * total-character-level scope (see accumulateClasses below).
 */
function accumulateClass(
  map: StatMap,
  cls: DDOClass,
  levels: number,
  intMod: number,
): void {
  const label = `${cls.Name} (${levels} lv)`

  add(map, 'bab', { value: classBAB(cls, levels), type: 'Stacking', source: label })
  add(map, 'save.Fort',   { value: saveBase(cls.Fortitude, levels), type: 'Base', source: label })
  add(map, 'save.Reflex', { value: saveBase(cls.Reflex,    levels), type: 'Base', source: label })
  add(map, 'save.Will',   { value: saveBase(cls.Will,      levels), type: 'Base', source: label })

  const hd = cls.HitPoints ?? 6
  const classHp = hd * levels
  add(map, 'hp', { value: classHp, type: 'Base', source: `${label} (d${hd})` })

  const sp = spellPointsAtLevel(cls.SpellPointsPerLevel, levels)
  if (sp > 0) add(map, 'spellPoints', { value: sp, type: 'Base', source: label })

  // Skill points are added via the per-level walk below (so the ×4 first-level
  // bonus applies to the actual class taken at character level 1).
  void intMod
}

/**
 * V2 parity wrapper: walk the per-level array (Build::m_Levels) and feed each
 * unique class into accumulateClass with its actual level count. Heroic
 * (1-20), Epic (21-30), Legendary (31-34) tiers are all collapsed into this
 * single source so multiclass HP/saves/BAB/SP are correct.
 *
 * Skill points use the per-character-level rule: ×4 at character level 1,
 * 1× thereafter, with each level reading the class actually trained then.
 */
function accumulateClasses(
  map: StatMap,
  build: CharacterBuild,
  allClasses: DDOClass[],
  conMod: number,
  intMod: number,
): void {
  const levelClasses = getLevelClasses(build)
  // Build per-class totals across heroic + epic + legendary slots
  const counts = new Map<string, number>()
  for (const c of levelClasses) if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  if ((build.epicLevels ?? 0) > 0) counts.set('Epic', build.epicLevels)
  if ((build.legendaryLevels ?? 0) > 0) counts.set('Legendary', build.legendaryLevels)

  for (const [name, levels] of counts) {
    const cls = allClasses.find(c => c.Name === name)
    if (!cls) continue
    accumulateClass(map, cls, levels, intMod)
  }

  // Per-character-level skill points: ×4 at level 1, then 1× per level (V2 parity)
  for (let i = 0; i < levelClasses.length && i < 20; i++) {
    const name = levelClasses[i]
    if (!name) continue
    const cls = allClasses.find(c => c.Name === name)
    if (!cls) continue
    const pts = Math.max(1, (cls.SkillPoints ?? 2) + intMod)
    const total = i === 0 ? pts * 4 : pts
    add(map, 'skillPoints', {
      value: total,
      type: 'Base',
      source: `${name} (lv ${i + 1})${i === 0 ? ' ×4' : ''}`,
    })
  }

  // CON bonus to HP applies per total character level (V2 BreakdownItemHitpoints)
  const totalChar = (build.totalLevel ?? 0) + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  if (totalChar > 0 && conMod !== 0) {
    add(map, 'hp', {
      value: conMod * totalChar,
      type: 'AbilityBonus',
      source: `Constitution × ${totalChar}`,
    })
  }
}

function accumulateFeat(map: StatMap, feat: Feat, rank: number, source: string, totalLevel = 0, ctx?: EffectContext): void {
  for (const eff of toArray(feat.Effect)) {
    // For AType=TotalLevel / ClassLevel etc. effects in feats, pass totalLevel as the level arg
    addParsed(map, parseEffect(eff, rank, source, totalLevel, 0, ctx))
  }
}

function accumulateEnhancementTree(
  map: StatMap,
  tree: EnhancementTree,
  choices: Record<string, number>,
  selections: Record<string, string>,
  classLevels: number,
  ctx?: EffectContext,
): void {
  const items = tree.EnhancementTreeItem ?? []
  const treeAP = computeTreeAP(items, choices)

  for (const item of items) {
    const rank = enhancementRank(choices, item)
    if (rank <= 0) continue

    const source = `${tree.Name}: ${item.Name}`
    const selectedOption = enhancementSelection(selections, item)

    if (selectedOption) {
      const options = getSelectorOptions(item)
      const opt = options.find(o => o.Name === selectedOption)
      if (opt) {
        for (const eff of toArray(opt.Effect as Effect | Effect[] | undefined)) {
          addParsed(map, parseEffect(eff, rank, `${source} (${selectedOption})`, classLevels, treeAP, ctx))
        }
      }
    }

    // V2 EnhancementTreeItem::GetEffects (EnhancementTreeItem.cpp:486-522):
    // the item's own <Effect> list ALWAYS applies, in ADDITION to the chosen
    // selector option's effects — "even if it had a sub-selection it may
    // still have effects that always apply regardless of the sub-selection".
    for (const eff of toArray(item.Effect)) {
      addParsed(map, parseEffect(eff, rank, source, classLevels, treeAP, ctx))
    }
  }
}

function accumulateGear(
  map: StatMap,
  gearItems: Record<string, Item>,
  buffCatalogue?: Map<string, ItemBuffTemplate>,
  ctx?: EffectContext,
): void {
  for (const [slot, item] of Object.entries(gearItems)) {
    const source = `${item.Name} (${slot})`
    for (const buff of toArray(item.Buff)) {
      addParsed(map, parseItemBuff(buff, source, buffCatalogue, ctx), true)
    }
    // Armor bonus from armor/shield items — treated as Armor bonus type
    if (item.ArmorBonus) {
      add(map, 'ac', { value: item.ArmorBonus, type: 'Armor', source, fromGear: true })
    }
    if (item.ShieldBonus) {
      add(map, 'ac', { value: item.ShieldBonus, type: 'Shield', source, fromGear: true })
    }
    // V2 BreakdownItemAC.cpp:71-82 + BreakdownItemDodge.cpp:55-63: tower
    // shield items contribute their MaximumDexterityBonus to the dedicated
    // mdbShields breakdown, which caps DEX-to-AC and dodge when a tower
    // shield is equipped.
    const armorType = item.Armor
    const isTowerShield = armorType === 'TowerShield' || armorType === 'Tower Shield'
    if (isTowerShield && typeof item.MaximumDexterityBonus === 'number') {
      add(map, 'mdbShields', { value: item.MaximumDexterityBonus, type: 'Equipment', source, fromGear: true })
    }
    // V2 armor check penalty: armor and shield clamped to ≤0, accumulated separately.
    if (item.ArmorCheckPenalty != null && item.ArmorCheckPenalty < 0) {
      const slotLower = slot.toLowerCase()
      const isShield = slotLower.includes('shield') || (item.Armor === 'Shield' || item.Armor === 'TowerShield')
      const key = isShield ? 'armorCheckPenaltyShield' : 'armorCheckPenalty'
      add(map, key, {
        value: item.ArmorCheckPenalty,
        type: 'Penalty',
        source: `${item.Name} ACP`,
        fromGear: true,
      })
    }
  }
}

/**
 * V2 armor stance detection: returns the active armor stance from the equipped
 * armor item (Cloth/Light/Medium/Heavy) plus shield-type stances.
 */
function deriveArmorStances(gearItems: Record<string, Item>, activeBuffs?: string[]): Set<string> {
  const stances = new Set<string>()
  // V2 Build::IsStanceActive reads the build's TRACKED stance state
  // (serialized <ActiveStances>), not a live re-derivation from gear — the
  // two can legitimately diverge (e.g. heavy armor equipped without the
  // proficiency feat leaves the stance at "Cloth Armor"). An explicit armor
  // stance recorded on the build wins; gear derivation is the fallback for
  // builds authored fresh in V3 with no recorded stance.
  const ARMOR_STANCES = ['Cloth Armor', 'Light Armor', 'Medium Armor', 'Heavy Armor']
  const explicit = activeBuffs?.find(s => ARMOR_STANCES.includes(s))
  const armor = gearItems['Armor'] ?? gearItems['Body']
  if (explicit) {
    stances.add(explicit)
  } else if (armor) {
    const t = armor.Armor
    if (t === 'Cloth' || t == null) stances.add('Cloth Armor')
    else if (t === 'Light')  stances.add('Light Armor')
    else if (t === 'Medium') stances.add('Medium Armor')
    else if (t === 'Heavy')  stances.add('Heavy Armor')
    // Docent (warforged): treat per item.Material? Default to Cloth Armor.
  } else {
    stances.add('Cloth Armor')
  }
  // Shield stance from off-hand ('Off Hand' is the canonical app slot name)
  const shield = gearItems['Off Hand'] ?? gearItems['OffHand'] ?? gearItems['Shield']
  if (shield) {
    const t = shield.Armor
    if (t === 'Tower Shield' || t === 'TowerShield') stances.add('Tower Shield')
    else if (t === 'Heavy Shield' || t === 'HeavyShield') stances.add('Heavy Shield')
    else if (t === 'Light Shield' || t === 'LightShield') stances.add('Light Shield')
    else if (t === 'Buckler') stances.add('Buckler')
  }
  return stances
}

/**
 * Resolve a selected augment name against its host item's own embedded
 * augment options FIRST, falling back to the global Augments catalogue.
 * V2 parity: `ItemAugment::GetSelectedAugment()` (ItemAugment.cpp:66-79)
 * checks `ItemSpecificAugments()` before `FindAugmentByName()`. Some items
 * (e.g. "Gem of Many Facets") define unique per-item augment choices —
 * usually set-bonus grants — inline that never appear in the global
 * Augments/*.xml catalogue.
 */
function resolveAugment(
  key: string,
  augName: string,
  gearItems: Record<string, Item>,
  allAugments: Augment[],
): Augment | undefined {
  const slot = key.split(':')[0]
  const item = gearItems[slot]
  if (item) {
    for (const ia of toArray(item.ItemAugment)) {
      for (const specific of toArray(ia.Augment)) {
        if (specific.Name === augName) return specific
      }
    }
  }
  return allAugments.find(a => a.Name === augName)
}

// V2 Build.cpp:4975-5012 (ApplyItem augment loop): a ChooseLevel augment's
// effect Amount is REPLACED by LevelValue[SelectedLevelIndex] (LevelValue2 for
// the second effect when DualValues); with no stored index V2 falls back to
// indexing by the host item's MinLevel. The augment's printed Amount is only
// the display maximum (e.g. Sapphire of Dodge: Amount 17, LevelValue
// "1 3 5 6 8 9 11 12 14" — index 8 → +14, not +17).
function chooseLevelValues(raw: unknown): number[] {
  if (raw == null) return []
  const text = typeof raw === 'object' && '#text' in (raw as Record<string, unknown>)
    ? String((raw as Record<string, unknown>)['#text'] ?? '')
    : String(raw)
  return text.trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
}

function accumulateAugments(
  map: StatMap,
  augmentChoices: Record<string, string>,
  gearItems: Record<string, Item>,
  allAugments: Augment[],
  ctx?: EffectContext,
  augmentLevelChoices?: Record<string, number>,
): void {
  for (const [key, augName] of Object.entries(augmentChoices)) {
    if (!augName) continue
    const aug = resolveAugment(key, augName, gearItems, allAugments)
    if (!aug) continue
    const source = `Augment: ${aug.Name}`
    const augAny = aug as Augment & { ChooseLevel?: unknown, DualValues?: unknown, LevelValue2?: unknown }
    const hasChooseLevel = augAny.ChooseLevel !== undefined
    const levelValues = hasChooseLevel ? chooseLevelValues(augAny.LevelValue) : []
    const levelValues2 = hasChooseLevel ? chooseLevelValues(augAny.LevelValue2) : []
    const hostItem = gearItems[key.split(':')[0]]
    const fallbackIdx = Math.max(0, (hostItem?.MinLevel ?? 1) - 1)
    const levelIdx = augmentLevelChoices?.[key] ?? fallbackIdx
    let effIndex = 0
    for (const rawEff of toArray(aug.Effect)) {
      let eff = rawEff
      if (hasChooseLevel && levelValues.length > 0) {
        const table = (augAny.DualValues !== undefined && effIndex === 1 && levelValues2.length > 0)
          ? levelValues2 : levelValues
        const idx = Math.min(Math.max(0, levelIdx), table.length - 1)
        eff = { ...rawEff, Amount: table[idx] }
      }
      effIndex++
      // V2 augment effects live in the item pool (m_itemEffects) — they obey
      // "Highest Only" bonus-type stacking against other gear bonuses (e.g. a
      // Sapphire of Resistance does NOT stack with an item Resistance bonus).
      addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx), true)
    }
  }
}

function accumulateSetBonuses(
  map: StatMap,
  gearItems: Record<string, Item>,
  allSetBonuses: SetBonus[],
  augmentChoices: Record<string, string>,
  allAugments: Augment[],
  ctx?: EffectContext,
): void {
  // Group selected augments by their host gear slot. The augment key is
  // "slot:augmentType:index" (GearPanel augmentKey), so the slot is the
  // first ":"-delimited segment.
  const augmentsBySlot = new Map<string, Augment[]>()
  for (const [key, augName] of Object.entries(augmentChoices)) {
    if (!augName) continue
    const slot = key.split(':')[0]
    const aug = resolveAugment(key, augName, gearItems, allAugments)
    if (!aug) continue
    const arr = augmentsBySlot.get(slot) ?? []
    arr.push(aug)
    augmentsBySlot.set(slot, arr)
  }

  // Count equipped items per set-bonus name. V2 Build::ApplyItem (Build.cpp:
  // 4905-4922) + Item::HasSetBonus (Item.cpp:508-548): augment-granted set
  // bonuses always count; the item's NATIVE set bonuses count only when no
  // augment on that item has SuppressSetBonus.
  const counts = new Map<string, number>()
  const bump = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1)

  for (const [slot, item] of Object.entries(gearItems)) {
    const slotAugs = augmentsBySlot.get(slot) ?? []
    let suppressNative = false
    for (const aug of slotAugs) {
      if ('SuppressSetBonus' in aug && aug.SuppressSetBonus !== undefined) suppressNative = true
      for (const name of toArray(aug.SetBonus)) bump(name)
    }
    if (!suppressNative) {
      for (const name of toArray(item.SetBonus)) bump(name)
    }
  }
  // Set-bonus augments slotted in the sentient jewel (no host item) still count.
  for (const [slot, augs] of augmentsBySlot) {
    if (gearItems[slot]) continue
    for (const aug of augs) {
      for (const name of toArray(aug.SetBonus)) bump(name)
    }
  }

  for (const [bonusName, count] of counts) {
    const sb = allSetBonuses.find(s => s.Type === bonusName)
    if (!sb) continue
    for (const buff of toArray(sb.Buff)) {
      if (count < buff.EquippedCount) continue
      const source = `${bonusName} set (${buff.EquippedCount}pc)`
      for (const eff of toArray(buff.Effect)) {
        // V2 Build::ApplySetBonus (Build.cpp:5267-5276) calls NotifyItemEffect,
        // joining m_itemEffects (the gear "Highest Only" pool).
        addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx), true)
      }
    }
  }
}

function accumulateFiligreeSlots(
  map: StatMap,
  slots: FiligreeSlot[],
  allFiligrees: Filigree[],
  sourcePrefix: string,
  setCounts: Map<string, number>,
  ctx?: EffectContext,
): void {
  const byName = new Map<string, Filigree>(allFiligrees.map(f => [f.Name, f]))
  for (const slot of slots) {
    if (!slot.name) continue
    const fil = byName.get(slot.name)
    if (!fil) continue
    const source = `${sourcePrefix}: ${fil.Name}`
    for (const eff of toArray(fil.Effect)) {
      if (eff.Rare && !slot.rare) continue  // rare effects only apply when slot is marked rare
      // V2 Build::ApplyFiligree (Build.cpp:5225-5251) calls NotifyItemEffect,
      // joining m_itemEffects (the gear "Highest Only" pool).
      addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx), true)
    }
    // The XML loader's isArray list includes 'SetBonus', so catalogue-loaded
    // filigrees carry ['Deadly Rain'] rather than 'Deadly Rain'. Normalise so
    // set counting works for both shapes (V2 counts per set-bonus Type name).
    for (const sb of toArray(fil.SetBonus as string | string[] | undefined)) {
      if (sb) setCounts.set(sb, (setCounts.get(sb) ?? 0) + 1)
    }
  }
}

function accumulateFiligrees(
  map: StatMap,
  filigreeSlots: FiligreeSlot[],
  artifactFiligreeSlots: FiligreeSlot[],
  allFiligrees: Filigree[],
  allFiligreeBonuses: FiligreeSetBonus[],
  ctx?: EffectContext,
): void {
  const setCounts = new Map<string, number>()

  accumulateFiligreeSlots(map, filigreeSlots, allFiligrees, 'Filigree', setCounts, ctx)
  accumulateFiligreeSlots(map, artifactFiligreeSlots, allFiligrees, 'Artifact Filigree', setCounts, ctx)

  for (const [bonusName, count] of setCounts) {
    const fsb = allFiligreeBonuses.find(s => s.Type === bonusName)
    if (!fsb) continue
    for (const buff of toArray(fsb.Buff)) {
      if (count < buff.EquippedCount) continue
      const source = `${bonusName} filigree set (${buff.EquippedCount}pc)`
      for (const eff of toArray(buff.Effect)) {
        // V2 Build::ApplyFiligree's ApplySetBonus call (Build.cpp:5262) also
        // routes through NotifyItemEffect — same gear pool as above.
        addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx), true)
      }
    }
  }
}

// V2 Life::SelfAndPartyBuffs — the OptionalBuff catalogue applies ONLY to
// buffs the user selected in the buffs pane, NOT to active stances. A stance
// that happens to share a catalogue buff's name (e.g. the Fury of the Wild
// "Primal Scream" stance vs the party-buff entry) must not double-apply.
function accumulateSelfBuffs(
  map: StatMap,
  selfBuffNames: string[],
  allSelfBuffs: OptionalBuff[],
  ctx?: EffectContext,
): void {
  for (const buffName of selfBuffNames) {
    const buff = allSelfBuffs.find(b => b.Name === buffName)
    if (!buff) continue
    const source = `Buff: ${buff.Name}`
    for (const eff of toArray(buff.Effect)) {
      // V2 Build::NotifyOptionalBuff (Build.cpp:6065-6074) calls
      // NotifyItemEffect, joining m_itemEffects (the gear "Highest Only" pool).
      addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx), true)
    }
  }
}

/**
 * Guild buffs apply when applyGuildBuffs is true and the buff's required level
 * is at or below the build's guild level. Mirrors V2 Build::ApplyGuildBuffs.
 */
function accumulateGuildBuffs(
  map: StatMap,
  guildLevel: number,
  applyGuildBuffs: boolean,
  allGuildBuffs: GuildBuff[] | undefined,
  ctx: EffectContext | undefined,
  totalCharLevel: number,
): void {
  if (!applyGuildBuffs || !allGuildBuffs) return
  for (const gb of allGuildBuffs) {
    const reqLevel = (gb as { Level?: number }).Level ?? 0
    if (reqLevel > guildLevel) continue
    const effects = (gb as { Effect?: Effect | Effect[] }).Effect
    for (const eff of toArray(effects)) {
      // V2 Build::ApplyGuildBuffs (Build.cpp:5967-6062) calls NotifyItemEffect,
      // joining m_itemEffects (the gear "Highest Only" pool). Pass the total
      // character level (heroic + epic + legendary) as the classLevels arg —
      // AType="TotalLevel" effects (e.g. "Game Hunter") index their Amount
      // table by it (V2 Effect.cpp:1205-1219, Amount_TotalLevel uses
      // `m_pBuild->Level()`), not by a fixed rank-1 lookup.
      addParsed(map, parseEffect(eff, 1, `Guild Buff: ${gb.Name}`, totalCharLevel, 0, ctx), true)
    }
  }
}

/**
 * Trained-spell self-effects. V2 parity: spells with Effect entries (e.g.
 * passive buffs cast on self) contribute their bonuses while trained.
 * Stance-gated effects fire only when their gating stance is active.
 */
function accumulateTrainedSpells(
  map: StatMap,
  trainedSpells: Record<string, Record<number, string[]>> | undefined,
  allSpells: Spell[],
  ctx?: EffectContext,
): void {
  if (!trainedSpells) return
  for (const [className, byLevel] of Object.entries(trainedSpells)) {
    // V2 Build::ApplySpellEffects (Build.cpp:2373-2385) — "we need to ignore
    // this spell if it is a carry over from a class change": stale trained
    // spells from a class the build no longer has levels in must not apply
    // (e.g. a Wizard-life "Tenser's Transformation" +4 STR/DEX/CON firing on
    // a 0-Wizard build). Conservative version of V2's spell-slot gate.
    if (ctx && (ctx.classLevels[className] ?? 0) <= 0) continue
    for (const names of Object.values(byLevel)) {
      for (const spellName of names) {
        const spell = allSpells.find(s => s.Name === spellName)
        if (!spell) continue
        for (const eff of toArray(spell.Effect)) {
          // V2 Build::ApplySpellEffects (Build.cpp:2388-2404): stamps the
          // spell's class as StackSource for ClassLevel/ClassCasterLevel
          // amounts, and calls SetApplyAsItemEffect() on EVERY spell effect —
          // trained-spell effects join the gear "Highest Only" pool.
          const atype = (eff as { AType?: string }).AType
          // V2 stamps the spell's class UNCONDITIONALLY — Spells.xml carries a
          // literal StackSource "Unknown" on some spells (e.g. Merfolk's
          // Blessing), which must be overwritten or the effect resolves to
          // class level 0 and contributes nothing.
          const stamped = (atype === 'ClassLevel' || atype === 'ClassCasterLevel')
            ? { ...eff, StackSource: className }
            : eff
          addParsed(map, parseEffect(stamped, 1, `Spell: ${spell.Name}`, 0, 0, ctx), true)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Weapon info extractor
// ---------------------------------------------------------------------------

/** Builds a WeaponInfo from a weapon item (null if the item is not a weapon). */
export function weaponInfoFromItem(item: Item | undefined, slot: string): WeaponInfo | null {
  if (!item?.Weapon) return null
  const am = toArray(item.AttackModifier as string | string[] | undefined)
  return {
    name: item.Name,
    slot,
    diceNum: item.BaseDice?.Number ?? 1,
    diceSides: item.BaseDice?.Sides ?? 6,
    critThreatRange: item.CriticalThreatRange ?? 1,
    critMultiplier: item.CriticalMultiplier ?? 2,
    attackModifier: am.length > 0 ? am[0] : 'Strength',
    weaponType: typeof item.Weapon === 'string' ? item.Weapon : undefined,
  }
}

// Canonical app slot names are 'Main Hand' / 'Off Hand' (GearPanel,
// v2Import); the Weapon1/MainHand/Weapon2/OffHand spellings are legacy
// fixture conventions kept for back-compat.
export function extractWeaponInfo(gearItems: Record<string, Item>): WeaponInfo | null {
  for (const slot of ['Main Hand', 'Weapon1', 'MainHand', 'Weapon']) {
    const wi = weaponInfoFromItem(gearItems[slot], slot)
    if (wi) return wi
  }
  return null
}

/** Off-hand weapon for two-weapon fighting (null if no off-hand weapon). */
export function extractOffhandWeaponInfo(gearItems: Record<string, Item>): WeaponInfo | null {
  for (const slot of ['Off Hand', 'Weapon2', 'OffHand']) {
    const wi = weaponInfoFromItem(gearItems[slot], slot)
    if (wi) return wi
  }
  return null
}

export function extractArmorMaxDex(gearItems: Record<string, Item>): number | null {
  const armor = gearItems['Armor'] ?? gearItems['Body']
  if (armor?.MaximumDexterityBonus != null) return armor.MaximumDexterityBonus
  return null
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

/**
 * V2 parity: cosmetic slots never contribute stat effects. In V2 the cosmetic
 * slots (InventorySlotTypes.h:33-38) are declared AFTER the Inventory_Count
 * sentinel, and Build::ApplyGearEffects (Build.cpp:4824-4834) only loops
 * `Inventory_Unknown+1 .. Inventory_Count`, so equipped cosmetic items are
 * displayed but their effects are never applied. Strip them before any stat
 * aggregation so V3 matches.
 */
export function stripCosmeticSlots(gearItems: Record<string, Item>): Record<string, Item> {
  const out: Record<string, Item> = {}
  for (const [slot, item] of Object.entries(gearItems)) {
    if (slot.startsWith('Cosmetic')) continue
    out[slot] = item
  }
  return out
}

/**
 * Pure variant of the stat-aggregation pipeline. Builds the same StatMap
 * the hook produces but without React. Use from CLI tools and unit tests
 * to compare V3-computed numbers against V2 (e.g. via the V2 importer).
 */
/**
 * Single resolution pass. `abilityTotalsOverride` (when given) replaces the
 * inherent chargen-time ability totals in the EffectContext — used by the
 * fixed-point wrapper below to feed fully-resolved ability scores back into
 * ability-gated requirements and ability-mod ATypes (V2 parity: BreakdownItem
 * observers re-evaluate against the live ability breakdown totals, not the
 * chargen snapshot).
 */
// V3 gear slot → V2 InventorySlotTypeMap text (InventorySlotTypes.h:50-73) —
// the names MaterialType requirements use in their second Item field.
const V3_SLOT_TO_V2_ENUM: Record<string, string> = {
  Helmet: 'Helmet', Necklace: 'Necklace', Trinket: 'Trinket', Cloak: 'Cloak',
  Belt: 'Belt', Goggles: 'Goggles', Gloves: 'Gloves', Boots: 'Boots',
  Bracers: 'Bracers', Armor: 'Armor', Ring: 'Ring1', Ring2: 'Ring2',
  'Main Hand': 'Weapon1', 'Off Hand': 'Weapon2', Quiver: 'Quiver', Arrow: 'Arrows',
}

function buildStatMapOnce(
  input: BuildStatsInput,
  build: CharacterBuild,
  abilityTotalsOverride?: Record<string, number>,
  skillTotalsOverride?: Record<string, number>,
  casterLevelsOverride?: Record<string, number>,
): StatMap {
  const map: StatMap = new Map()

  const {
    allClasses, allRaces, allFeats, allTrees,
    allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
    allWeaponGroups, allSpells, allGuildBuffs, allItemBuffs, specialFeats,
  } = input
  // Cosmetic slots are display-only in V2 (effects never applied) — drop them
  // here so gear buffs, set bonuses, armor stances and weapon detection all
  // ignore them.
  const gearItems = stripCosmeticSlots(input.gearItems)

  // ItemBuffs.xml template catalogue (Type → template) for resolving
  // flavour-named item Buff Types via parseItemBuff (V2 Item::FindEffect).
  const buffCatalogue = allItemBuffs && allItemBuffs.length > 0
    ? new Map<string, ItemBuffTemplate>(allItemBuffs.map(b => [b.Type, b]))
    : undefined

    // ──────────────────────────────────────────────────────────────────────
    // Build the EffectContext used to gate effects via Requirements::Met.
    // Uses a chargen-time snapshot of the build (ability scores from base+
    // race+levelup only — no gear/enhancement bonuses) to avoid cycles.
    // ──────────────────────────────────────────────────────────────────────
    const ctxRace = allRaces.find(r => r.Name === build.race)
    // V2 parity: per-class totals are derived from the per-level array
    // (Build::m_Levels) rather than the aggregate triple. This makes
    // ClassLevels(name) match V2 Build::ClassLevels for any check that
    // doesn't pass an explicit level cap.
    const ctxLevelClasses = getLevelClasses(build)
    const ctxClassLevels: Record<string, number> = {}
    const ctxBaseClassLevels: Record<string, number> = {}
    for (const c of ctxLevelClasses) {
      if (!c) continue
      ctxClassLevels[c] = (ctxClassLevels[c] ?? 0) + 1
      const cls = allClasses.find(cc => cc.Name === c)
      const baseClass = cls?.BaseClass ?? c
      ctxBaseClassLevels[baseClass] = (ctxBaseClassLevels[baseClass] ?? 0) + 1
      if (baseClass !== c) {
        ctxBaseClassLevels[c] = (ctxBaseClassLevels[c] ?? 0) + 1
      }
    }
    // Epic/Legendary are class-like StackSources for ClassLevel-scaled effects
    // (V2 Build::ClassLevels("Epic"/"Legendary")). Register their counts so
    // Amount[classLevel] indexes by the epic/legendary level count — 0 on a
    // purely-heroic build (Amount[0]), not the total character level.
    ctxClassLevels['Epic'] = build.epicLevels ?? 0
    ctxClassLevels['Legendary'] = build.legendaryLevels ?? 0
    ctxBaseClassLevels['Epic'] = build.epicLevels ?? 0
    ctxBaseClassLevels['Legendary'] = build.legendaryLevels ?? 0
    const ctxFeats = new Set<string>()
    for (const f of Object.values(build.featChoices)) if (f) ctxFeats.add(f)
    if (ctxRace) for (const f of toArray(ctxRace.GrantedFeat)) ctxFeats.add(f)
    for (const bc of classesWithEpicPseudo(build)) {
      const cls = allClasses.find(c => c.Name === bc.name)
      for (const af of toArray(cls?.AutomaticFeats)) {
        const lvl = af.Level ?? 0
        if (lvl > bc.levels) continue
        const names = af.Feats
        if (typeof names === 'string') ctxFeats.add(names)
        else if (Array.isArray(names)) for (const n of names) ctxFeats.add(n)
      }
    }
    const ctxEnhancements = new Set<string>()
    for (const choices of Object.values(build.enhancementChoices)) {
      for (const [name, rank] of Object.entries(choices)) {
        if (rank > 0) ctxEnhancements.add(name)
      }
    }
    // Only the 3 selected destiny trees contribute (V2: you can only spend in
    // selected trees; deselecting a tree removes its effects).
    const selectedDestinySet = new Set((build.selectedDestinyTrees ?? []).filter(Boolean))
    for (const [treeName, choices] of Object.entries(build.destinyChoices)) {
      if (!selectedDestinySet.has(treeName)) continue
      for (const [name, rank] of Object.entries(choices)) {
        if (rank > 0) ctxEnhancements.add(name)
      }
    }
    for (const choices of Object.values(build.reaperChoices ?? {})) {
      for (const [name, rank] of Object.entries(choices)) {
        if (rank > 0) ctxEnhancements.add(name)
      }
    }
    // Selector picks per trained item (V2 Requirement.cpp:839-855 needs the
    // chosen option to evaluate two-Item Enhancement requirements strictly).
    const ctxEnhancementSelections: Record<string, string> = {}
    for (const sels of Object.values(build.enhancementSelections ?? {})) {
      for (const [name, sel] of Object.entries(sels)) if (sel) ctxEnhancementSelections[name] = sel
    }
    for (const [treeName, sels] of Object.entries(build.destinySelections ?? {})) {
      if (!selectedDestinySet.has(treeName)) continue
      for (const [name, sel] of Object.entries(sels)) if (sel) ctxEnhancementSelections[name] = sel
    }
    for (const sels of Object.values(build.reaperSelections ?? {})) {
      for (const [name, sel] of Object.entries(sels)) if (sel) ctxEnhancementSelections[name] = sel
    }
    // Choice keys may be InternalNames (V2 imports, current TreeGrid) or
    // display Names (legacy saves); requirement <Item> refs use InternalName.
    // Add each trained item's OTHER name so both namespaces resolve.
    for (const tree of allTrees) {
      for (const item of tree.EnhancementTreeItem ?? []) {
        const internal = item.InternalName
        if (!internal) continue
        if (ctxEnhancements.has(internal)) ctxEnhancements.add(item.Name)
        else if (ctxEnhancements.has(item.Name)) ctxEnhancements.add(internal)
        const sel = ctxEnhancementSelections[internal] ?? ctxEnhancementSelections[item.Name]
        if (sel !== undefined) {
          ctxEnhancementSelections[internal] = sel
          ctxEnhancementSelections[item.Name] = sel
        }
      }
    }
    // Pass 1: inherent-only ability totals (base + race + levelup). The
    // fixed-point wrapper re-runs with the fully-resolved totals.
    const ctxAbilityTotals: Record<string, number> = {}
    const ABILITIES_C = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
    if (abilityTotalsOverride) {
      Object.assign(ctxAbilityTotals, abilityTotalsOverride)
    } else {
      for (const ab of ABILITIES_C) {
        const base = build.baseAbilities[ab] ?? 8
        const racial = ctxRace ? Number((ctxRace as unknown as Record<string, number>)[ab]) || 0 : 0
        const lv = Object.values(build.abilityLevelUps).filter(v => v === ab).length
        ctxAbilityTotals[ab] = base + racial + lv
      }
    }
    const ctxStances = deriveArmorStances(gearItems, build.activeBuffs)
    // V2 parity: Build::IsStanceActive checks both armor-derived stances AND
    // player-toggled stances.  Merge activeBuffs so that effects gated on e.g.
    // "Mountain Stance", "Favored Weapon", "Power Attack", "Rage", etc. fire
    // correctly when the player has toggled them on in the Stances panel.
    for (const s of build.activeBuffs) ctxStances.add(s)
    // V2 parity: StancesPane.cpp:329-354 adds an Auto-controlled stance named
    // after every race, gated on Requirement_Race; CStanceButton::Evaluate
    // auto-activates it when the build's race matches. Effects gated on
    // Requirement_Stance:<raceName> (e.g. Bladeforged +10 Repair/Rust spell
    // power, Morninglord, Shifter, Razorclaw Shifter, Aasimar Scourge, Deep
    // Gnome, …) only fire once that race stance is active. Mirror that here so
    // those race-form effects fire without the player toggling anything.
    if (build.race) ctxStances.add(build.race)
    // V2 parity: Monk and Sacred Fist are "Centered" when wearing cloth/no armor.
    // Centered gates all Monk Ki effects (KiMaximum, KiHit, KiPassive, KiCritical).
    {
      const monkLevels = (ctxClassLevels['Monk'] ?? 0) + (ctxClassLevels['Sacred Fist'] ?? 0)
      if (monkLevels > 0 && ctxStances.has('Cloth Armor')) {
        ctxStances.add('Centered')
      }
    }
    // Approximate BAB from class progressions (heroic + tier classes). Avoids cycles.
    // V2 parity: each class contributes classBAB(levels) where levels is its
    // total in the per-level array; epic/legendary tiers add their tables.
    let ctxBAB = 0
    for (const [name, levels] of Object.entries(ctxClassLevels)) {
      const cls = allClasses.find(c => c.Name === name)
      if (cls) ctxBAB += classBAB(cls, levels)
    }
    if ((build.epicLevels ?? 0) > 0) {
      const epicCls = allClasses.find(c => c.Name === 'Epic')
      if (epicCls) ctxBAB += classBAB(epicCls, build.epicLevels)
    }
    if ((build.legendaryLevels ?? 0) > 0) {
      const legCls = allClasses.find(c => c.Name === 'Legendary')
      if (legCls) ctxBAB += classBAB(legCls, build.legendaryLevels)
    }
    ctxBAB = Math.min(MAX_BAB, ctxBAB)
    const ctxWeaponTypes = new Set<string>()
    let mainWeaponType = ''
    let offWeaponType = ''
    for (const [slot, item] of Object.entries(gearItems)) {
      if (item.Weapon) {
        ctxWeaponTypes.add(item.Weapon)
        if (slot === 'Main Hand' || slot === 'Weapon1' || slot === 'MainHand' || slot === 'Weapon') {
          mainWeaponType ||= item.Weapon
        }
        if (slot === 'Off Hand' || slot === 'Weapon2' || slot === 'OffHand') {
          offWeaponType ||= item.Weapon
        }
      }
    }
    const groups = allWeaponGroups ?? []
    // V2 parity: Build::AddWeaponToGroup populates runtime group membership from
    // AddGroupWeapon effects on all trained feats/enhancements. Build the same
    // runtime adds here so weapon-class requirement gates (WeaponClassMainHand /
    // WeaponClassOffHand) and proficiency checks are accurate.
    const { adds: runtimeGroupAdds, merges: runtimeGroupMerges } = buildRuntimeGroupAdds(input, build)
    const ctxWeaponClassMain = deriveWeaponClasses(mainWeaponType, groups, runtimeGroupAdds, runtimeGroupMerges)
    const ctxWeaponClassOff = deriveWeaponClasses(offWeaponType, groups, runtimeGroupAdds, runtimeGroupMerges)

    // V2 parity: the StancesPane auto-activates weapon-type and fighting-style
    // stances from the equipped weapons (they default ON when the weapon is
    // wielded). Effects gated on "Two Handed Fighting" / "Two Weapon Fighting" /
    // "Single Weapon Fighting", the weapon type itself ("Quarterstaff",
    // "Dwarven Axe", "Handwraps", …), or "Shield" otherwise never fired in V3,
    // where stances were purely player-toggled (43 THF / 29 TWF / 19 SWF +
    // weapon-type-gated effects in the live data). Player toggles still merge in
    // via activeBuffs above; this only adds the gear-derived defaults.
    if (mainWeaponType) ctxStances.add(mainWeaponType)
    if (offWeaponType) ctxStances.add(offWeaponType)
    {
      const hasShield = ['Tower Shield', 'Heavy Shield', 'Light Shield', 'Buckler']
        .some(s => ctxStances.has(s))
      if (hasShield) ctxStances.add('Shield')
      const twoHandedMain = ctxWeaponClassMain.has('Two Handed')
      const hasOffhandWeapon = offWeaponType !== ''
      if (twoHandedMain) {
        ctxStances.add('Two Handed Fighting')
      } else if (hasOffhandWeapon) {
        ctxStances.add('Two Weapon Fighting')
      } else if (mainWeaponType && !hasShield) {
        ctxStances.add('Single Weapon Fighting')
      }
    }
    const ctxSliderValues: Record<string, number> = {
      ...((build as { sliderValues?: Record<string, number> }).sliderValues ?? {}),
    }
    // V2 Requirement::EvaluateMaterialType inputs: equipped item Material per
    // V2 slot name (Requirement.cpp:1083-1100).
    const ctxMaterialBySlot: Record<string, string> = {}
    for (const [v3Slot, item] of Object.entries(gearItems)) {
      const v2Slot = V3_SLOT_TO_V2_ENUM[v3Slot]
      const material = (item as { Material?: string }).Material
      if (v2Slot && material) ctxMaterialBySlot[v2Slot] = material
    }

    const ctx: EffectContext = {
      race: build.race,
      alignment: build.alignment,
      classLevels: ctxClassLevels,
      baseClassLevels: ctxBaseClassLevels,
      totalLevel: build.totalLevel,
      feats: ctxFeats,
      enhancements: ctxEnhancements,
      enhancementSelections: ctxEnhancementSelections,
      abilityTotals: ctxAbilityTotals,
      stances: ctxStances,
      bab: ctxBAB,
      weaponTypes: ctxWeaponTypes,
      sliderValues: ctxSliderValues,
      weaponClassMain: ctxWeaponClassMain,
      weaponClassOffhand: ctxWeaponClassOff,
      materialBySlot: ctxMaterialBySlot,
      skillTotals: skillTotalsOverride,
      casterLevels: casterLevelsOverride,
    }

    // ── Ability base scores ───────────────────────────────────────────────
    const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
    // V2 tome cap counts the CHARACTER level (heroic+epic+legendary) — a +8
    // tome was being capped at +7 forever because heroic totalLevel is 20.
    const tomeCap = tomeCapAtLevel(Math.max(1, build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)))
    for (const ab of ABILITIES) {
      const base = build.baseAbilities[ab]
      if (base) add(map, `ability.${ab}`, { value: base, type: 'Base', source: 'Point buy' })
      // V2: tomes are Inherent type (capped by character level)
      const rawTome = build.abilityTomes[ab] ?? 0
      const tome = Math.min(rawTome, tomeCap)
      if (tome) add(map, `ability.${ab}`, {
        value: tome, type: 'Inherent',
        source: rawTome > tome ? `Ability tome (+${rawTome}, capped at +${tome})` : 'Ability tome',
      })
      // V2: level-up bonuses are 'Level Up' type
      const lvlUps = Object.values(build.abilityLevelUps).filter(v => v === ab).length
      if (lvlUps) add(map, `ability.${ab}`, { value: lvlUps, type: 'Level Up', source: 'Level-up bonuses' })
    }

    // V2 Effect.cpp Amount_TotalLevel indexes by m_pBuild->Level() — the FULL
    // character level (heroic + epic + legendary), same as the guild-buff fix.
    // Feed this to every accumulateFeat so feat-sourced AType=TotalLevel
    // tables (e.g. Echoing Soul's 40-entry SaveBonus) read the right row.
    const charLevelTotal = (build.totalLevel ?? 0) + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)

    // ── Race ─────────────────────────────────────────────────────────────
    const race = allRaces.find(r => r.Name === build.race)
    if (race) {
      accumulateRace(map, race)
      for (const featName of toArray(race.GrantedFeat)) {
        const feat = allFeats.find(f => f.Name === featName)
        if (feat) accumulateFeat(map, feat, 1, `${build.race}: ${featName}`, charLevelTotal, ctx)
      }
    }

    // ── Phase 1.5: quick ability resolve for CON-mod HP ──────────────────
    function quickResolve(key: string): number {
      return resolveBonus(map.get(key) ?? []).total
    }
    const conMod = abMod(quickResolve('ability.Constitution'))

    // ── Classes ───────────────────────────────────────────────────────────
    const intMod = abMod(quickResolve('ability.Intelligence'))
    accumulateClasses(map, build, allClasses, conMod, intMod)

    // V2 parity: automatic feats are granted at the character level the
    // class hits the relevant class-level. We still iterate the aggregate
    // here because the feat itself is an idempotent grant (rank=1); the
    // important V2 behavior is that the feat fires only when its class
    // level has been reached, which `bc.levels` already encodes.
    // V2 Build::AutomaticFeats (Build.cpp:2493-2564) keeps a RUNNING count of
    // grants across ALL classes/levels and stops at Feat::MaxTimesAcquire —
    // whose default is 1 (Feat.h:65). A feat listed by two classes'
    // AutomaticFeats (e.g. "Flurry of Blows" via Sacred Fist AND Dragon
    // Disciple) is granted once, not once per class; multi-grant feats
    // (Epic Power ×10, Eldritch Blast Damage ×5) carry explicit values.
    const grantedAutoFeatTotals = new Map<string, number>()
    for (const bc of classesWithEpicPseudo(build)) {
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls) continue

      // V2 parity: m_effects (feat effects) are summed without bonus-type
      // stacking rules — only m_itemEffects has RemoveNonStacking applied.
      // Count how many times each auto-feat fires so we pass rank=count
      // to accumulateFeat, which uses Amount*rank for AType=Simple effects.
      // This lets repeated grants (e.g. "Warlock: Eldritch Blast Damage" ×5)
      // stack correctly even when their bonus type is "Highest Only".
      const autoFeatCounts = new Map<string, number>()
      for (const autoFeat of toArray(cls.AutomaticFeats)) {
        if ((autoFeat.Level ?? 1) > bc.levels) continue
        const names = toArray(
          typeof autoFeat.Feats === 'string' ? autoFeat.Feats :
          Array.isArray(autoFeat.Feats) ? autoFeat.Feats : undefined
        )
        for (const featName of names) {
          autoFeatCounts.set(featName, (autoFeatCounts.get(featName) ?? 0) + 1)
        }
      }
      for (const [featName, rawCount] of autoFeatCounts) {
        const feat = allFeats.find(f => f.Name === featName)
        if (!feat) continue
        // V2 stops granting once MaxTimesAcquire (default 1) is reached,
        // counting across every class that grants the feat.
        const already = grantedAutoFeatTotals.get(featName) ?? 0
        const count = Math.min(rawCount, Math.max(0, (feat.MaxTimesAcquire ?? 1) - already))
        if (count <= 0) continue
        grantedAutoFeatTotals.set(featName, already + count)
        accumulateFeat(map, feat, count, `${bc.name}: ${featName}${count > 1 ? ` ×${count}` : ''}`, charLevelTotal, ctx)
      }
    }

    // ── Chosen feats ──────────────────────────────────────────────────────
    for (const [slotKey, featName] of Object.entries(build.featChoices)) {
      if (!featName) continue
      const feat = allFeats.find(f => f.Name === featName)
      if (feat) accumulateFeat(map, feat, 1, `Feat: ${featName} (${slotKey})`, charLevelTotal, ctx)
    }

    // ── Past lives ────────────────────────────────────────────────────────
    for (const [source, count] of Object.entries(build.pastLives)) {
      if (!count) continue
      const feat = allFeats.find(f =>
        f.Name === source || f.Name === `Past Life: ${source}` || f.Name === `Racial Past Life: ${source}`)
      if (feat) accumulateFeat(map, feat, count, `Past life: ${source} ×${count}`, charLevelTotal, ctx)
    }

    // ── Favor Reward feats (V2 Build::SpecialFeats merges FavorFeats) ─────
    // Build.cpp:1603-1609: favor-reward feats ("House Deneith Favor Rewards"
    // +5 HP, Draconic Vitality, …) join the applied-feat list like any other
    // special feat. V3 parsed build.favorFeats for eligibility/AP only and
    // never applied their effects.
    if (build.favorFeats && build.favorFeats.length > 0) {
      const favorCounts = new Map<string, number>()
      for (const name of build.favorFeats) favorCounts.set(name, (favorCounts.get(name) ?? 0) + 1)
      for (const [name, count] of favorCounts) {
        const feat = allFeats.find(f => f.Name === name)
        if (feat) accumulateFeat(map, feat, count, `Favor: ${name}${count > 1 ? ` ×${count}` : ''}`, charLevelTotal, ctx)
      }
    }

    // ── Life-level Special feats (V2 Life::AllSpecialFeats) ────────────────
    // Chrism reincarnation-cache feats and similar Type="Special" acquisitions
    // were imported into Life.specialFeats but never applied to any stat —
    // count repeated redemptions (duplicate names) as the effect rank.
    if (specialFeats && specialFeats.length > 0) {
      const specialCounts = new Map<string, number>()
      for (const name of specialFeats) {
        specialCounts.set(name, (specialCounts.get(name) ?? 0) + 1)
      }
      for (const [name, count] of specialCounts) {
        const feat = allFeats.find(f => f.Name === name)
        if (feat) accumulateFeat(map, feat, count, `Special: ${name}${count > 1 ? ` ×${count}` : ''}`, charLevelTotal, ctx)
      }
    }

    // ── Auto-acquired feats (V2 Build::AutomaticFeats via <AutomaticAcquisition>) ──
    // V2 grants some feats purely through the per-feat AutomaticAcquisition
    // mechanism — they are in no class AutomaticFeats list nor race GrantedFeat,
    // so V3's accumulation above never applied their *effects*. The ones with
    // real stat effects:
    //   • Heroic Durability — AutomaticAcquisition SpecificLevel 1 → +30 HP for
    //     every character (universal; V3 was under-counting HP by 30).
    //   • Completionist / Racial Completionist — +2 to all ability scores when
    //     every heroic class / race past life is at 3 (gating reused from
    //     buildAutomaticFeatGroups, which already lists them for display/export).
    // The other auto-acquired stat feats are deliberately excluded: Attack
    // (base AC 10, dodge cap 25, shield PRR, damage multipliers — already
    // modeled as hardcoded defaults / the combat estimator in V3) and Defensive
    // Fighting (a player-toggled stance).
    {
      const alreadyApplied = new Set<string>(Object.values(build.featChoices).filter(Boolean))
      const autoNames = new Set<string>(['Heroic Durability'])
      const groups = buildAutomaticFeatGroups(build, allClasses, allRaces ?? [])
      for (const g of groups) {
        for (const f of g.feats) {
          if (f === 'Completionist' || f === 'Racial Completionist') autoNames.add(f)
        }
      }
      for (const fn of autoNames) {
        if (alreadyApplied.has(fn)) continue
        if (fn === 'Heroic Durability' && build.totalLevel < 1) continue
        const feat = allFeats.find(f => f.Name === fn)
        if (feat) accumulateFeat(map, feat, 1, `Automatic: ${fn}`, charLevelTotal, ctx)
      }

      // V2 Class::ImprovedHeroicDurabilityFeats (Class.cpp:375-399): every heroic
      // (non-NotHeroic) class dynamically synthesizes "Improved Heroic Durability
      // (<Class> 5/10/15)" feats, each auto-acquired via Requirement_ClassAtLevel
      // at class level 5, 10 and 15. Each grants the base "Improved Heroic
      // Durability" effect (+5 max HP, Feats.xml:3791). These exist in no XML
      // AutomaticFeats / GrantedFeat list, so V3 was under-counting HP by +5 per
      // milestone class-level each heroic class reaches (max +15 per class).
      const ihdBase = allFeats.find(f => f.Name === 'Improved Heroic Durability')
      if (ihdBase) {
        for (const bc of build.classes) {
          if (!bc.name || bc.levels <= 0) continue
          const cls = allClasses.find(c => c.Name === bc.name)
          if (!cls || cls.NotHeroic) continue
          let milestones = 0
          for (let level = 5; level <= 15; level += 5) {
            if (bc.levels >= level) milestones++
          }
          if (milestones > 0) {
            accumulateFeat(map, ihdBase, milestones, `Improved Heroic Durability (${bc.name})`, charLevelTotal, ctx)
          }
        }
      }
    }

    // ── Heroic enhancements ───────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.enhancementChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      const selections = build.enhancementSelections[treeName] ?? {}
      const matchedClass = build.classes.find(bc =>
        bc.name && treeName.toLowerCase().includes(bc.name.toLowerCase())
      )
      accumulateEnhancementTree(map, tree, choices, selections, matchedClass?.levels ?? build.totalLevel, ctx)
    }

    // ── Epic destiny ──────────────────────────────────────────────────────
    // Only the selected destiny trees apply, and selector picks (destinySelections)
    // feed the chosen option's effects — V2 parity.
    for (const [treeName, choices] of Object.entries(build.destinyChoices)) {
      if (!selectedDestinySet.has(treeName)) continue
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      const selections = build.destinySelections?.[treeName] ?? {}
      accumulateEnhancementTree(map, tree, choices, selections, build.totalLevel, ctx)
    }

    // ── Reaper ────────────────────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.reaperChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      // Reaper selector picks (e.g. Dread Adversary "Reaper's Offense III:
      // +1 Strength" — UNGATED, counts outside reaper difficulty in V2).
      accumulateEnhancementTree(map, tree, choices, build.reaperSelections?.[treeName] ?? {}, build.totalLevel, ctx)
    }

    // ── Gear item buffs ───────────────────────────────────────────────────
    accumulateGear(map, gearItems, buffCatalogue, ctx)

    // ── Augments ─────────────────────────────────────────────────────────
    // Include sentient-gem augments alongside regular slot augments (Stream 3).
    // Augments slotted into cosmetic-slot items are dropped: V2 never calls
    // ApplyItem for cosmetic slots, so their augments (and set-bonus
    // contributions) are ignored along with the host item.
    const allAugmentChoices = {} as Record<string, string>
    for (const [key, name] of Object.entries(build.augmentChoices)) {
      if (key.startsWith('Cosmetic')) continue
      allAugmentChoices[key] = name
    }
    if (build.sentientGem.majorAugment) {
      allAugmentChoices['SentientMajor'] = build.sentientGem.majorAugment
    }
    if (build.sentientGem.minorAugment) {
      allAugmentChoices['SentientMinor'] = build.sentientGem.minorAugment
    }
    accumulateAugments(map, allAugmentChoices, gearItems, allAugments, ctx, build.augmentLevelChoices)

    // ── Gear set bonuses ──────────────────────────────────────────────────
    // Pass the merged augment choices so augment-granted set bonuses (and
    // SuppressSetBonus) are honoured (V2 Item::HasSetBonus, Item.cpp:508-548).
    accumulateSetBonuses(map, gearItems, allSetBonuses, allAugmentChoices, allAugments, ctx)

    // ── Filigrees + filigree set bonuses ──────────────────────────────────
    accumulateFiligrees(map, build.filigreeSlots, build.artifactFiligreeSlots ?? [], allFiligrees, allFiligreeBonuses, ctx)

    // ── Self / party buffs ────────────────────────────────────────────────
    accumulateSelfBuffs(map, build.selfBuffs ?? [], allSelfBuffs, ctx)

    // ── Trained-spell self-effects (V2 parity) ────────────────────────────
    if (allSpells && allSpells.length > 0) {
      accumulateTrainedSpells(map, build.trainedSpells, allSpells, ctx)
    }

    // ── Guild buffs (V2 parity) ───────────────────────────────────────────
    accumulateGuildBuffs(map, build.guildLevel, build.applyGuildBuffs, allGuildBuffs, ctx,
      (build.totalLevel ?? 0) + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0))

    // ── Skill tomes ───────────────────────────────────────────────────────
    for (const [skill, bonus] of Object.entries(build.skillTomes ?? {})) {
      if (!bonus) continue
      add(map, `skill.${skill}`, { value: bonus, type: 'Tome', source: `${skill} tome` })
    }

    // ── GrantFeat effects: V2 does NOT apply the granted feat's own stat
    // effects ────────────────────────────────────────────────────────────
    // V2 Build::ApplyEnhancementEffects (and the item/augment equivalents)
    // notifies GrantFeat effects only to the breakdowns registered for
    // Effect_GrantFeat — verified in the compiled source, that is
    // CGrantedFeatsPane (tracks the name for the Granted Feats panel and
    // Feat-type Requirement/prerequisite checks) and a narrow
    // BreakdownItemPRR re-derive trigger. No breakdown calls
    // Build::ApplyFeatEffects for a GrantFeat-sourced feat — that only
    // happens for feats reached through TrainFeat/AutomaticFeats/favor-feat
    // paths. A prior pass (#59) assumed GrantFeat re-applies the granted
    // feat's Effect list and fed it through accumulateFeat here; that
    // over-applied stance-gated feats whose Requirements happen to be met
    // (e.g. Fury of the Wild "I'm Always Angry" grants the Barbarian "Rage"
    // feat, whose AbilityBonus/SaveBonus/ACBonus effects are gated on
    // `Requirement Stance=Rage` — on any build with the Rage stance toggled,
    // V3 added a phantom +4 STR/+4 CON/+2 Will-morale/-2 AC that V2 never
    // applies). `grantedFeat.<FeatName>` markers are still emitted (see
    // effectParser.ts) and still populate `grantedFeatsList` below, matching
    // V2's GrantedFeatsPane display and feat-prerequisite parity — they are
    // simply never fed back through accumulateFeat.

    // ── Armor stance derivation ──────────────────────────────────────────
    // V2 derives the armor stance from the equipped armor's <Armor> field.
    // Used for: PRR derivation (BAB×multiplier), MRR cap (Cloth=50, Light=100),
    // dodge cap (Cloth = no MDB cap), AC stacking-armor%, etc.
    const armorStances = deriveArmorStances(gearItems, build.activeBuffs)

    // V2 BreakdownItemMRRCap: Cloth Armor → 50, Light Armor → 100, Medium/Heavy → none.
    if (armorStances.has('Cloth Armor')) {
      add(map, 'mrrCap', { value: 50,  type: 'Stance', source: 'Cloth Armor' })
    } else if (armorStances.has('Light Armor')) {
      add(map, 'mrrCap', { value: 100, type: 'Stance', source: 'Light Armor' })
    }

    // ── Stack-merge (V2 BreakdownItem::AddEffect + Amount_Stacks) ──────────
    // Identical AType=Stacks effects (same DisplayName/Type/Bonus/Item/Amount)
    // are ONE effect in V2 whose value is Amount[stackCount-1], NOT the sum.
    // Collapse each stackGroup to a single bonus valued from the count — e.g.
    // Monk "Ocean Stance: Strength Penalty" from Ocean Stance + Adept/Master/
    // Grandmaster of Forms merges to a single -2 (Amount="-2 -2 -2 -2") not -8;
    // the positive tier bonuses (WIS/dodge/saves/Ki, Amount="2 2 3 4") read the
    // tier count. MUST run before Phase 2 reads ability totals (line below), so
    // the merged ability values feed saves/HP/skills within this same pass.
    for (const [key, bonuses] of map) {
      if (!bonuses.some(b => b.stackGroup)) continue
      const groups = new Map<string, RawBonus[]>()
      const passthrough: RawBonus[] = []
      for (const b of bonuses) {
        if (b.stackGroup && b.stackAmounts && b.stackAmounts.length > 1) {
          const g = groups.get(b.stackGroup) ?? []
          g.push(b); groups.set(b.stackGroup, g)
        } else {
          passthrough.push(b)
        }
      }
      const rebuilt = passthrough
      for (const g of groups.values()) {
        // A single-source ranked effect already resolved its own rank via
        // getAmountAtRank (V2 reaches the same row by replaying one AddEffect
        // per trained rank — BreakdownItem.cpp:818-836). Only genuine
        // cross-source duplicates (monk forms ×4, Primal Scream stacks) get
        // the count-based Amount[] override; collapsing a singleton would
        // discard the rank-correct value for Amount[0].
        if (g.length === 1) {
          rebuilt.push({ ...g[0], stackGroup: undefined, stackAmounts: undefined })
          continue
        }
        const amounts = g[0].stackAmounts!
        const idx = Math.min(g.length - 1, amounts.length - 1)
        rebuilt.push({ ...g[0], value: amounts[idx], stackGroup: undefined, stackAmounts: undefined, source: `${g[0].source} (×${g.length} stacks → Amount[${idx}])` })
      }
      map.set(key, rebuilt)
    }

    // =========================================================================
    // Phase 2: resolve ability scores fully, add ability-mod-derived bonuses
    // =========================================================================

    function resolveAbility(ab: string): number {
      return resolveBonus(map.get(`ability.${ab}`) ?? []).total
    }

    const strMod     = abMod(resolveAbility('Strength'))
    const dexMod     = abMod(resolveAbility('Dexterity'))
    const conModFull = abMod(resolveAbility('Constitution'))
    const intModFull = abMod(resolveAbility('Intelligence'))
    const wisMod     = abMod(resolveAbility('Wisdom'))
    const chaMod     = abMod(resolveAbility('Charisma'))

    // Saves — V2 BreakdownItemSave.cpp:133-150 (LargestStatBonus).
    // Default: CON→Fort, DEX→Reflex, WIS→Will. SaveBonusAbility feats (e.g.
    // Force of Personality → CHA for Will; Insightful Reflexes → INT for Reflex)
    // substitute a different ability when its modifier is higher.
    {
      const saveOpts: Record<string, Array<{ ability: string; mod: number }>> = {
        Fort:   [{ ability: 'Constitution', mod: conModFull }],
        Reflex: [{ ability: 'Dexterity',    mod: dexMod }],
        Will:   [{ ability: 'Wisdom',       mod: wisMod }],
      }
      for (const [key, bonuses] of map.entries()) {
        const m = key.match(/^save\.(Fort|Reflex|Will)\.ability\.(.+)$/)
        if (m && bonuses.length > 0) {
          saveOpts[m[1]].push({ ability: m[2], mod: abMod(resolveAbility(m[2])) })
        }
      }
      for (const [saveKey, opts] of Object.entries(saveOpts)) {
        const best = opts.reduce((a, b) => b.mod > a.mod ? b : a)
        if (best.mod !== 0) {
          add(map, `save.${saveKey}`, { value: best.mod, type: 'Ability mod', source: best.ability })
        }
      }
    }

    // V2 Divine Grace: Paladin (auto at level 2) and Sacred Fist add CHA mod to all saves,
    // capped at 2 + 3*levels of the relevant class. (BreakdownItemSave.cpp:484-510)
    {
      const palLevels = build.classes.filter(c => c.name === 'Paladin').reduce((s, c) => s + c.levels, 0)
      const sfLevels  = build.classes.filter(c => c.name === 'Sacred Fist').reduce((s, c) => s + c.levels, 0)
      const cap = divineGraceCap(palLevels, sfLevels)
      if (chaMod > 0 && cap > 0) {
        const bonus = Math.min(chaMod, cap)
        if (bonus > 0) {
          const src = `Divine Grace (Charisma, capped @ ${cap})`
          add(map, 'save.Fort',   { value: bonus, type: 'Divine', source: src })
          add(map, 'save.Reflex', { value: bonus, type: 'Divine', source: src })
          add(map, 'save.Will',   { value: bonus, type: 'Divine', source: src })
        }
      }
    }

    // Melee (weapon attack modifier checked — could be DEX for finesse weapons)
    const weaponInfo = extractWeaponInfo(gearItems)
    const meleeAtkMod = weaponInfo?.attackModifier === 'Dexterity' ? dexMod : strMod
    const meleeAtkAbName = weaponInfo?.attackModifier === 'Dexterity' ? 'Dexterity' : 'Strength'
    if (meleeAtkMod !== 0) add(map, 'melee.toHit', { value: meleeAtkMod, type: 'Ability mod', source: meleeAtkAbName })
    if (strMod !== 0)      add(map, 'melee.damage', { value: strMod, type: 'Ability mod', source: 'Strength' })

    // Ranged
    if (dexMod !== 0) add(map, 'ranged.toHit', { value: dexMod, type: 'Ability mod', source: 'Dexterity' })

    // Initiative
    if (dexMod !== 0) add(map, 'initiative', { value: dexMod, type: 'Ability mod', source: 'Dexterity' })

    // AC: base 10 + DEX mod, capped by armor MDB and (when tower shield
    // equipped) by tower-shield MDB. V2 BreakdownItemAC.cpp:62-82 applies
    // both caps in sequence; whichever yields the lowest dex bonus wins.
    add(map, 'ac', { value: 10, type: 'Base', source: 'Base AC' })
    const armorMaxDexBase = extractArmorMaxDex(gearItems)
    // V2 BreakdownItemMDB sums the armor's printed MaximumDexterityBonus AND
    // every Effect_MaxDexBonus (armor-mastery enhancements, etc.) into a single
    // Breakdown_MaxDexBonus->Total(). V3 only used the printed item value, so
    // enhancements that raise the dex cap were ignored. The armor's printed
    // field is not part of the `mdb` stat (which collects only Effect_MaxDexBonus
    // contributions), so adding them together does not double-count.
    const mdbEffectBonus = resolveBonus(map.get('mdb') ?? []).total
    const armorMaxDex = armorMaxDexBase != null ? armorMaxDexBase + mdbEffectBonus : null
    let effectiveDexForAC = dexMod
    let dexCapLabel: string | null = null
    if (armorMaxDex != null && effectiveDexForAC > armorMaxDex) {
      effectiveDexForAC = armorMaxDex
      dexCapLabel = `MDB ${armorMaxDex}`
    }
    if (armorStances.has('Tower Shield')) {
      const mdbShieldsTotal = resolveBonus(map.get('mdbShields') ?? []).total
      if (effectiveDexForAC > mdbShieldsTotal) {
        effectiveDexForAC = mdbShieldsTotal
        dexCapLabel = `Tower Shield MDB ${mdbShieldsTotal}`
      }
    }
    if (effectiveDexForAC !== 0) {
      add(map, 'ac', {
        value: effectiveDexForAC,
        type: 'Ability mod',
        source: dexCapLabel != null ? `Dexterity (capped at ${dexCapLabel})` : 'Dexterity',
      })
    }

    // V2 BreakdownItemAC.cpp:19-20,115-157 — armor enchantment + percentage
    // armor/shield AC.
    //
    // (1) The AC breakdown registers Effect_EnchantArmor, so an armor's magical
    //     enchantment ("Armor Enhancement" bonus type) adds to AC directly. V3
    //     parked it in the unused `armor.enchantment` stat — fold it into AC.
    // (2) Effect_ArmorACBonus / Effect_ACBonusShield are PERCENTAGE bonuses
    //     (Breakdown_BonusArmorAC / Breakdown_BonusShieldAC):
    //       armor amount  = trunc((armorAC + armorEnhancement) * pct / 100)
    //       shield amount = trunc(shieldAC * pct / 100)   [only with a shield]
    //     V3 previously added them as flat AC points — wrong on armored builds.
    const armorEnchantment = resolveBonus(map.get('armor.enchantment') ?? []).total
    if (armorEnchantment !== 0) {
      add(map, 'ac', { value: armorEnchantment, type: 'Armor Enhancement', source: 'Armor enchantment' })
    }
    {
      const acBonuses = map.get('ac') ?? []
      const armorBaseAC = resolveBonus(acBonuses.filter(b => b.type === 'Armor')).total
      const armorEnhAC  = resolveBonus(acBonuses.filter(b => b.type === 'Armor Enhancement')).total
      const armorPct = resolveBonus(map.get('armorACPercent') ?? []).total
      if (armorPct !== 0) {
        const base = armorBaseAC + armorEnhAC
        const amount = Math.trunc((base * armorPct) / 100)
        if (amount !== 0) {
          add(map, 'ac', { value: amount, type: 'Stacking', source: `Armor ${armorPct}% of ${base}` })
        }
      }
      // Shield % bonus is gated on a shield being equipped (V2 "Shield" stance)
      // and uses only the printed shield AC as its base.
      const hasShield = armorStances.has('Tower Shield') || armorStances.has('Heavy Shield')
        || armorStances.has('Light Shield') || armorStances.has('Buckler')
      if (hasShield) {
        const shieldBaseAC = resolveBonus(acBonuses.filter(b => b.type === 'Shield')).total
        const shieldPct = resolveBonus(map.get('shieldACPercent') ?? []).total
        if (shieldPct > 0) {
          const amount = Math.trunc((shieldBaseAC * shieldPct) / 100)
          if (amount !== 0) {
            add(map, 'ac', { value: amount, type: 'Stacking', source: `Shield ${shieldPct}% of ${shieldBaseAC}` })
          }
        }
      }
    }

    // HP: CON mod correction if gear changed CON. V2 BreakdownItemHitpoints.cpp:126-136
    // scales the whole Constitution bonus by `pBuild->Level()` (heroic + epic +
    // legendary) — the correction here must use the same total-character-level
    // scope as the base contribution added in accumulateClasses, not just the
    // heroic `build.totalLevel`, or epic/legendary builds under-count this delta.
    const totalCharLevel = (build.totalLevel ?? 0) + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
    if (conModFull !== conMod && totalCharLevel > 0) {
      const delta = (conModFull - conMod) * totalCharLevel
      if (delta !== 0) {
        add(map, 'hp', { value: delta, type: 'Ability mod', source: 'Constitution (gear/enhancement adjustment)' })
      }
    }

    // Speed base
    add(map, 'speed', { value: 100, type: 'Base', source: 'Base movement speed' })

    // V2 "Attack" feat (universal, no stance gating) grants base combat values
    // that V3 otherwise lacked a default for: +50% damage vs helpless foes,
    // +20% strikethrough, +20% off-hand attack chance, −10 unconscious range,
    // and the base 25% Dodge Cap (Feats.xml Attack "Base Dodge Cap"
    // DodgeCapBonus 25 — V2 BreakdownItemDodge caps dodge at "25% plus any
    // effects that increase it", so without this the dodge cap was ~23 too low
    // and every no-armor build's dodge was clamped far below V2). Base AC 10,
    // shield PRR, and damage multipliers remain modeled as hardcoded defaults.
    add(map, 'helpless', { value: 50, type: 'Base', source: 'Attack (base helpless damage)' })
    add(map, 'melee.strikethrough', { value: 20, type: 'Base', source: 'Attack (base strikethrough)' })
    add(map, 'offhand.attack', { value: 20, type: 'Base', source: 'Attack (base off-hand attack chance)' })
    add(map, 'unconsciousRange', { value: -10, type: 'Base', source: 'Attack (standard death at -10)' })
    add(map, 'dodgeCap', { value: 25, type: 'Base', source: 'Attack (base dodge cap 25%)' })

    // V2 BreakdownItemMaximumKi.cpp:31-58 — Maximum Ki = base 40 + WIS mod × 5
    // (plus any KiMaximum effects, parsed into ki.max). V2 adds the base + WIS
    // contribution unconditionally; V3 had only the effect-sourced ki.max.
    add(map, 'ki.max', { value: 40, type: 'Base', source: 'Standard Max Ki' })
    if (wisMod !== 0) {
      add(map, 'ki.max', { value: wisMod * 5, type: 'Ability', source: 'Wisdom bonus ×5' })
    }

    // ── Skill points ──────────────────────────────────────────────────────
    // V2 Class::SkillPoints: max(1, classBase + raceSkillBonus + intModForLevel),
    // ×4 at character level 1. INT-for-level uses base+race+levelup only (no
    // tomes at L1, no gear/enhancements ever — gear isn't equipped at chargen).
    {
      const intInherent = (build.baseAbilities.Intelligence ?? 8)
        + (race ? Number((race as unknown as Record<string, number>).Intelligence) || 0 : 0)
      const intLvlUps = Object.values(build.abilityLevelUps).filter(v => v === 'Intelligence').length
      const intModL1 = abMod(intInherent)
      const intModL2 = abMod(intInherent + intLvlUps)
      const raceSP = (race as unknown as Record<string, unknown>)?.SkillPoints
      const raceSkillBonus = typeof raceSP === 'number' ? raceSP : 0

      // Replace the per-class 'Base' skillPoints with a precise V2 sum.
      // (accumulateClass already added a 'Base' entry; we replace that path
      // with a single corrective term tagged differently to avoid double-counting.)
      // Simpler: zero out the existing Base entries and re-add per-level.
      const existing = map.get('skillPoints')
      if (existing) map.set('skillPoints', existing.filter(b => b.type !== 'Base'))

      let classIdx = 0  // 0-based char level
      for (const bc of build.classes) {
        if (!bc.name || bc.levels <= 0) continue
        const cls = allClasses.find(c => c.Name === bc.name)
        const baseSpp = cls?.SkillPoints ?? 2
        for (let i = 0; i < bc.levels && classIdx < 20; i++, classIdx++) {
          const mod = classIdx === 0 ? intModL1 : intModL2
          const pts = Math.max(1, baseSpp + raceSkillBonus + mod)
          const total = classIdx === 0 ? pts * 4 : pts
          add(map, 'skillPoints', {
            value: total,
            type: 'Stacking',
            source: `${bc.name} L${classIdx + 1}: max(1, ${baseSpp}+${raceSkillBonus}+${mod})${classIdx === 0 ? '×4' : ''}`,
          })
        }
      }
    }

    // ── Skills ────────────────────────────────────────────────────────────
    const classSkillSet = new Set<string>()
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls?.ClassSkill) continue
      for (const s of toArray(cls.ClassSkill)) classSkillSet.add(s)
    }
    // V2 Build::SkillAtLevel (Build.cpp:2019-2054): each spend counts 1.0 rank
    // if the skill is a class skill OF THE CLASS TRAINED AT THAT LEVEL, else
    // 0.5 — a per-level decision, not a per-build union (a Bard 18/Ftr 1/Barb 1
    // spending Perform at its Fighter level gets 0.5, not 1.0).
    const perClassSkills = new Map<string, Set<string>>()
    const classSkillsFor = (name: string | undefined): Set<string> => {
      if (!name) return new Set()
      let set = perClassSkills.get(name)
      if (!set) {
        set = new Set(toArray(allClasses.find(c => c.Name === name)?.ClassSkill))
        perClassSkills.set(name, set)
      }
      return set
    }
    const skillLevelClasses = getLevelClasses(build)

    const abilModMap: Record<string, number> = {
      Strength: strMod, Dexterity: dexMod, Constitution: conModFull,
      Intelligence: intModFull, Wisdom: wisMod, Charisma: chaMod,
    }

    // V2 ACP-affected skills (multiplier 1 unless noted)
    const ACP_SKILLS: Record<string, number> = {
      Balance: 1, Hide: 1, Jump: 1, 'Move Silently': 1, Tumble: 1, Swim: 2,
    }
    const armorACP  = Math.min(0, resolveBonus(map.get('armorCheckPenalty') ?? []).total)
    const shieldACP = Math.min(0, resolveBonus(map.get('armorCheckPenaltyShield') ?? []).total)

    // V2 BreakdownItemSkill.cpp:152-166 — every skill takes -1 per neg level.
    const negLevels = Math.max(0, Math.round(resolveBonus(map.get('negativeLevel') ?? []).total))

    for (const { name: skill, ability } of SKILLS) {
      const abilMod = abilModMap[ability] ?? 0
      if (abilMod !== 0) {
        add(map, `skill.${skill}`, {
          value: abilMod,
          type: 'Ability mod',
          source: `${ability} mod`,
        })
      }
      // V2 stores trained levels; rank = 1.0 per spend at a level whose class
      // has the skill as a class skill, 0.5 otherwise (SkillAtLevel). Use the
      // per-level spend data when available; fall back to the whole-build
      // union heuristic for legacy saves without per-level data.
      const byLevel = build.skillRanksByLevel
      let ranksValue = 0
      if (byLevel && Object.keys(byLevel).length > 0) {
        for (const [lvlStr, ranks] of Object.entries(byLevel)) {
          const spent = ranks?.[skill] ?? 0
          if (!spent) continue
          const clsName = skillLevelClasses[Number(lvlStr) - 1]
          ranksValue += spent * (classSkillsFor(clsName).has(skill) ? 1 : 0.5)
        }
      } else {
        const trained = build.skillRanks?.[skill] ?? 0
        ranksValue = classSkillSet.has(skill) ? trained : trained / 2
      }
      if (ranksValue > 0) {
        add(map, `skill.${skill}`, { value: ranksValue, type: 'Ranks', source: 'Skill ranks' })
      }

      // V2 Armor Check Penalty: stacks separately from armor and shield.
      const acpMult = ACP_SKILLS[skill]
      if (acpMult) {
        if (armorACP < 0) {
          add(map, `skill.${skill}`, {
            value: armorACP * acpMult,
            type: 'Penalty',
            source: acpMult > 1 ? `Armor check penalty ×${acpMult}` : 'Armor check penalty',
          })
        }
        if (shieldACP < 0) {
          add(map, `skill.${skill}`, {
            value: shieldACP * acpMult,
            type: 'Penalty',
            source: acpMult > 1 ? `Armor check penalty (Shield) ×${acpMult}` : 'Armor check penalty (Shield)',
          })
        }
      }
      if (negLevels > 0) {
        add(map, `skill.${skill}`, {
          value: -negLevels,
          type: 'Stacking',
          source: `Negative levels (-1 × ${negLevels})`,
        })
      }
    }

    // V2 BreakdownItemBAB.cpp:43-55 — an OverrideBAB effect (e.g. Tenser's
    // Transformation, certain enhancements) boosts BAB up to the character
    // level, capped at MAX_BAB. V3 parsed the effect into `babOverride` but
    // never applied it; fold the positive boost back into `bab`.
    {
      const babOverride = resolveBonus(map.get('babOverride') ?? []).total
      if (babOverride > 0) {
        const classBabSum = resolveBonus(map.get('bab') ?? []).total
        // V2 Build::Level() — the FULL character level (heroic+epic+legendary).
        const charLevel = build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
        const boost = Math.min(MAX_BAB, charLevel) - classBabSum
        if (boost > 0) {
          add(map, 'bab', { value: boost, type: 'Stacking', source: 'BAB boost to character level (max 25)' })
        }
      }
    }

    // ── Armor PRR (BAB × armor multiplier) ───────────────────────────────
    // V2 BreakdownItemPRR::CreateOtherEffects (BreakdownItemPRR.cpp:43-122,
    // as of upstream 2.0.0.81):
    //   Mithral Body feat: BAB × 1, ELSE Light Armor + proficiency: BAB × 1
    //   Medium Armor + Medium Armor Proficiency: round(BAB × 1.5)
    //   Adamantine Body feat: BAB × 2, ELSE Heavy Armor + proficiency: BAB × 2
    // (pre-.81 V2 double-stacked body feats with armor proficiency — two
    // independent ifs; .81 made the body feat take precedence via else-if)
    {
      const babTotal = Math.min(MAX_BAB, resolveBonus(map.get('bab') ?? []).total)
      if (babTotal > 0) {
        const trainedFeats = new Set<string>(Object.values(build.featChoices).filter(Boolean))
        // Auto-feats from classes & race
        for (const bc of classesWithEpicPseudo(build)) {
          const cls = allClasses.find(c => c.Name === bc.name)
          for (const af of toArray(cls?.AutomaticFeats)) {
            const names = af.Feats
            if (typeof names === 'string') trainedFeats.add(names)
            else if (Array.isArray(names)) names.forEach(n => trainedFeats.add(n))
          }
        }
        if (race) {
          for (const f of toArray(race.GrantedFeat)) trainedFeats.add(f)
        }
        const has = (f: string) => trainedFeats.has(f)

        if (has('Mithral Body')) {
          add(map, 'prr', { value: babTotal, type: 'Feat', source: 'Mithral Body PRR (BAB×1)' })
        } else if (armorStances.has('Light Armor') && has('Light Armor Proficiency')) {
          add(map, 'prr', { value: babTotal, type: 'Stance', source: 'Light Armor PRR (BAB×1)' })
        }
        if (armorStances.has('Medium Armor') && has('Medium Armor Proficiency')) {
          add(map, 'prr', { value: Math.round(babTotal * 1.5), type: 'Stance', source: 'Medium Armor PRR (BAB×1.5)' })
        }
        if (has('Adamantine Body')) {
          add(map, 'prr', { value: babTotal * 2, type: 'Feat', source: 'Adamantine Body PRR (BAB×2)' })
        } else if (armorStances.has('Heavy Armor') && has('Heavy Armor Proficiency')) {
          add(map, 'prr', { value: babTotal * 2, type: 'Stance', source: 'Heavy Armor PRR (BAB×2)' })
        }
      }
    }

    // V2 SpellPoints: per-casting-class bonus = (classLevels + 9) * BaseStatToBonus(castingStat).
    // Class::ClassCastingStat picks the highest-mod stat for multi-stat classes (FavoredSoul).
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls) continue
      if (spellPointsAtLevel(cls.SpellPointsPerLevel, bc.levels) <= 0) continue
      const stat = pickCastingStat(cls.CastingStat as string | string[] | undefined, abilModMap)
      if (!stat) continue
      const mod = abilModMap[stat] ?? 0
      const bonus = (bc.levels + 9) * mod
      if (bonus !== 0) {
        add(map, 'spellPoints', {
          value: bonus,
          type: 'Ability mod',
          source: `${bc.name} (${stat}) bonus SP`,
        })
      }
    }

    // V2 Favored Soul / Sorcerer SP multiplier = 1 + (FvS+Sorc levels) / min(buildLevel, 20).
    // Pure FvS/Sorc 20 → 2x SP; multiclass → partial multiplier.
    //
    // V2 parity (BreakdownItemSpellPoints::Multiplier + BreakdownItem::Total):
    // the multiplier is applied ONLY to item (gear) spell-point effects —
    // SumItems(m_itemEffects, /*bApplyMultiplier*/ true) — while class SP,
    // casting-ability SP and feat/enhancement SP (m_otherEffects / m_effects)
    // are summed with bApplyMultiplier = false. The class SP tables for
    // Sorcerer/Favored Soul are already larger than the Wizard/Cleric tables,
    // so the base doubling is baked into the data; the run-time multiplier only
    // boosts SP granted by equipment. Multiplying the whole subtotal (as V3 did
    // previously) over-counted class and ability SP. (V2 comment:
    // "favored souls and sorcerers get up to double spell points from item effects".)
    {
      const fvsLv  = build.classes.filter(c => c.name === 'Favored Soul').reduce((s, c) => s + c.levels, 0)
      const sorcLv = build.classes.filter(c => c.name === 'Sorcerer').reduce((s, c) => s + c.levels, 0)
      const total = fvsLv + sorcLv
      if (total > 0) {
        const lvCap = Math.min(build.totalLevel, 20)
        if (lvCap > 0) {
          const factor = total / lvCap
          // Only the gear-sourced SP contributions are multiplied (V2 m_itemEffects).
          const gearSP = resolveBonus((map.get('spellPoints') ?? []).filter(b => b.fromGear)).total
          const bonus = Math.round(gearSP * factor)
          if (bonus !== 0) {
            add(map, 'spellPoints', {
              value: bonus,
              type: 'Multiplier',
              source: `Favored Soul/Sorcerer item-SP multiplier (×${(1 + factor).toFixed(2)})`,
            })
          }
        }
      }
    }

    // ── Phase 2.5: corrections that depend on resolved subtotals ─────────
    // Re-uses the local `negLevels` from the skills block scope.

    // V2 BreakdownItemSave.cpp:117-131 — saves take -1 per negative level.
    if (negLevels > 0) {
      const negSrc = `Negative levels (-1 × ${negLevels})`
      add(map, 'save.Fort',   { value: -negLevels, type: 'Stacking', source: negSrc })
      add(map, 'save.Reflex', { value: -negLevels, type: 'Stacking', source: negSrc })
      add(map, 'save.Will',   { value: -negLevels, type: 'Stacking', source: negSrc })
    }

    // V2 BreakdownItemHitpoints.cpp:107-122 — HP takes -5 per negative level.
    if (negLevels > 0) {
      add(map, 'hp', {
        value: -5 * negLevels,
        type: 'Stacking',
        source: `Negative levels (-5 × ${negLevels})`,
      })
    }

    // V2 BreakdownItemWeaponAttackBonus.cpp:82-115 — weapon attack bonus takes
    // -1 per negative level and the (positive-clamped) armor check penalty.
    // Both apply to melee and ranged to-hit; flow into the `*.attack` keys that
    // attackEntry adds onto the attack bonus.  (Non-proficiency and TWF
    // penalties are weapon-specific and handled in attackEntry / below.)
    if (negLevels > 0) {
      const src = `Negative levels (-1 × ${negLevels})`
      add(map, 'melee.attack',  { value: -negLevels, type: 'Penalty', source: src })
      add(map, 'ranged.attack', { value: -negLevels, type: 'Penalty', source: src })
    }
    if (armorACP < 0) {
      // V2 applies the armor check penalty to attack regardless of weapon.
      add(map, 'melee.attack',  { value: armorACP, type: 'Penalty', source: 'Armor check penalty' })
      add(map, 'ranged.attack', { value: armorACP, type: 'Penalty', source: 'Armor check penalty' })
    }

    // V2 fate points (BreakdownItemHitpoints.cpp:88-105 +2 HP each;
    // BreakdownItemSpellPoints.cpp:55-72 +1 SP each) — only at level 20+.
    if (build.totalLevel >= 20) {
      const fatePoints = Math.max(0, Math.round(resolveBonus(map.get('fatePoint') ?? []).total))
      if (fatePoints > 0) {
        add(map, 'hp', {
          value: 2 * fatePoints,
          type: 'Stacking',
          source: `Fate Points bonus (+2 × ${fatePoints})`,
        })
        add(map, 'spellPoints', {
          value: fatePoints,
          type: 'Stacking',
          source: `Fate Points bonus (+1 × ${fatePoints})`,
        })
      }
    }

    // V2 BreakdownItemSave.cpp:513-565 — Half-Elf Lesser Divine Grace.
    // Trigger feat: "Half-Elf Dilettante: Paladin". Cap = 2 + count of
    // "Improved Dilettante: Paladin" selections trained across the three
    // Half-Elf "Improved Dilettante I/II/III" enhancements (each +1).
    {
      const hasFeat = ctxFeats.has('Half-Elf Dilettante: Paladin')
      if (hasFeat && chaMod > 0) {
        let improvedCount = 0
        const halfElfTreeNames = ['Half-Elf', 'Half Elf']
        const dilettanteEnhNames = [
          'Half-Elf: Improved Dilettante I',
          'Half-Elf: Improved Dilettante II',
          'Half-Elf: Improved Dilettante III',
        ]
        for (const treeName of halfElfTreeNames) {
          const sels = build.enhancementSelections[treeName] ?? {}
          const choices = build.enhancementChoices[treeName] ?? {}
          const heTree = allTrees.find(t => t.Name === treeName)
          for (const enhName of dilettanteEnhNames) {
            const item = heTree?.EnhancementTreeItem?.find(i => i.Name === enhName)
            const rank = item ? enhancementRank(choices, item) : (choices[enhName] ?? 0)
            const sel = item ? enhancementSelection(sels, item) : sels[enhName]
            if (rank > 0 && sel === 'Improved Dilettante: Paladin') {
              improvedCount += 1
            }
          }
        }
        const cap = halfElfLesserDivineGraceCap(improvedCount)
        const bonus = Math.min(chaMod, cap)
        if (bonus > 0) {
          const src = `Lesser Divine Grace (Charisma, capped @ ${cap})`
          add(map, 'save.Fort',   { value: bonus, type: 'Divine', source: src })
          add(map, 'save.Reflex', { value: bonus, type: 'Divine', source: src })
          add(map, 'save.Will',   { value: bonus, type: 'Divine', source: src })
        }
      }
    }

    // V2 BreakdownItemTurnUndeadLevel.cpp:42-89 — base Turn Undead level from class levels.
    // Turn level = max(Cleric caster levels, Dark Apostate caster levels,
    //                  max(0, Paladin levels - 3)).
    // Added to 'turnUndead.levelBonus' as type 'Base' so the displayed total
    // includes both the class-derived base and any enhancement bonuses.
    // Similarly, BreakdownItemTurnUndeadHitDice adds the same base plus CHA mod
    // to 'turnUndead.diceBonus'.
    {
      const clericLevels = ctxClassLevels['Cleric'] ?? 0
      const darkApostateLevels = ctxClassLevels['Dark Apostate'] ?? 0
      const paladinLevels = ctxClassLevels['Paladin'] ?? 0
      const effectiveClericLevels = Math.max(clericLevels, darkApostateLevels)
      const effectivePaladinContrib = Math.max(0, paladinLevels - 3)
      const baseLevel = Math.max(effectiveClericLevels, effectivePaladinContrib)
      if (baseLevel > 0) {
        const classSource = effectiveClericLevels >= effectivePaladinContrib
          ? (darkApostateLevels > clericLevels ? 'Dark Apostate levels' : 'Cleric levels')
          : 'Paladin levels (−3)'
        add(map, 'turnUndead.levelBonus', { value: baseLevel, type: 'Base', source: classSource })
        add(map, 'turnUndead.diceBonus',  { value: baseLevel, type: 'Base', source: classSource })
        if (chaMod !== 0) {
          add(map, 'turnUndead.diceBonus', { value: chaMod, type: 'Ability mod', source: 'Charisma' })
        }
      }
    }

    // V2 BreakdownItemHitpoints.cpp:139-152 — fighting style bonus is a
    // *count* of style feats, then HP += 0.25 × min(4, count) × non-epic
    // class HD (Epic and Legendary classes contribute half-HD per :74-83).
    {
      const styleCount = Math.max(0, Math.round(resolveBonus(map.get('styleFeats') ?? []).total))
      if (styleCount > 0) {
        // V2 parity: classHitpoints accumulator includes heroic *and* tier
        // classes, with epic/legendary at half HD per :74-83. `ctxClassLevels`
        // already carries Epic/Legendary pseudo-class levels (at full HD) for
        // requirement gating elsewhere, so they must be skipped here — they
        // are added back explicitly below, at the correct half weight. Without
        // this exclusion Epic/Legendary HD was counted at 1.5× (once full via
        // this loop, once halved below).
        let nonEpicHD = 0
        for (const [name, levels] of Object.entries(ctxClassLevels)) {
          if (name === 'Epic' || name === 'Legendary') continue
          const cls = allClasses.find(c => c.Name === name)
          if (!cls) continue
          const hd = cls.HitPoints ?? 0
          nonEpicHD += hd * levels
        }
        const epicCls = allClasses.find(c => c.Name === 'Epic')
        if ((build.epicLevels ?? 0) > 0 && epicCls) {
          nonEpicHD += Math.floor(((epicCls.HitPoints ?? 0) * build.epicLevels) / 2)
        }
        const legCls = allClasses.find(c => c.Name === 'Legendary')
        if ((build.legendaryLevels ?? 0) > 0 && legCls) {
          nonEpicHD += Math.floor(((legCls.HitPoints ?? 0) * build.legendaryLevels) / 2)
        }
        const styleHP = styleBonusHp(styleCount, nonEpicHD)
        if (styleHP !== 0) {
          add(map, 'hp', {
            value: styleHP,
            type: 'Stacking',
            source: `Combat Style (${Math.min(4, styleCount)} × 25% × ${nonEpicHD} HD)`,
          })
        }
      }
    }

    // V2 BreakdownItemHitpoints.cpp:168-194 — HitpointsReaper (APCount-scaled,
    // accumulated in `hpReaperAP`) is summed, then capped by TOTAL character
    // level (heroic + epic + legendary, `pBuild->Level() + 1`): 50/100/200/
    // 400/800 at level ≤5/≤10/≤15/≤20/≤25 (no cap above level 25). Plain
    // `Hitpoints`-typed effects tagged Bonus="Reaper" (already merged into
    // `hp` directly, e.g. "Reaper's Defense I/II/IV"'s flat amounts) are
    // NOT part of this cap — apply the capped APCount total as a corrective
    // bonus alongside them.
    // V2 gates the whole block on the "Reaper" stance being toggled on
    // (Requirements.AddRequirement(Requirement_Stance, "Reaper"), :190-192) —
    // reaper HP only counts while the character is in Reaper mode.
    {
      const reaperSum = resolveBonus(map.get('hpReaperAP') ?? []).total
      if (reaperSum > 0 && ctxStances.has('Reaper')) {
        const capLevel = totalCharLevel + 1
        const cap = reaperHpCap(capLevel)
        const capped = Math.min(reaperSum, cap)
        add(map, 'hp', {
          value: capped,
          type: 'Reaper',
          source: isFinite(cap) && reaperSum > cap
            ? `Reaper Bonus (capped at level ${capLevel} max ${cap})`
            : 'Reaper Bonus',
        })
      }
    }

    // V2 BreakdownItemDodge.cpp:31-65 — dodge total is capped by
    // dodgeCap; additionally by armor MDB when not Cloth Armor and by
    // tower-shield MDB when Tower Shield active. Apply as a Stacking
    // corrective so the breakdown still shows individual contributors.
    {
      const dodgeRaw = resolveBonus(map.get('dodge') ?? []).total
      if (dodgeRaw > 0) {
        // V2 Breakdown_MaxDexBonus->Total() = the armor's printed
        // MaximumDexterityBonus PLUS Effect_MaxDexBonus effects; the dodge cap
        // compares against that total, not the effects alone.
        const armorItem = gearItems['Armor'] ?? gearItems['Body']
        const printedMdb = typeof armorItem?.MaximumDexterityBonus === 'number'
          ? armorItem.MaximumDexterityBonus : undefined
        const cap = effectiveDodgeCap({
          dodgeCap:    resolveBonus(map.get('dodgeCap') ?? []).total,
          hasDodgeCap: (map.get('dodgeCap') ?? []).length > 0,
          mdb:         resolveBonus(map.get('mdb') ?? []).total + (printedMdb ?? 0),
          hasMdb:      (map.get('mdb') ?? []).length > 0 || printedMdb !== undefined,
          mdbShields:  resolveBonus(map.get('mdbShields') ?? []).total,
          isClothArmor: armorStances.has('Cloth Armor'),
          isTowerShield: armorStances.has('Tower Shield'),
        })
        if (isFinite(cap) && dodgeRaw > cap) {
          add(map, 'dodge', {
            value: cap - dodgeRaw,
            type: 'Stacking',
            source: `Dodge capped at ${cap}`,
          })
        }
      }
    }

    // V2 SkillBonus with Item="All" applies to every skill (e.g. Completionist
    // +2 all skills). Distribute any skill.All contributions onto each skill,
    // then drop the marker key (which is otherwise never read).
    {
      const skillAll = map.get('skill.All')
      if (skillAll && skillAll.length > 0) {
        for (const { name } of SKILLS) {
          const key = `skill.${name}`
          const list = map.get(key) ?? []
          for (const b of skillAll) list.push({ ...b })
          map.set(key, list)
        }
        map.delete('skill.All')
      }
    }

    // (Runs AFTER the skill.All fan-out so the folded value equals the FINAL
    // skill total — V2's observer re-fires on any skill change.)
    // V2 BreakdownItemSpellPower.cpp:112-150 — each element's spell power adds
    // the *total* of a governing skill: Heal → Positive/Negative, Perform →
    // Sonic, Repair → Repair/Rust, Spellcraft → everything else. (The universal
    // spell power is added at the display layer.) V3 never folded the skill in,
    // so e.g. Heal ranks gave no Positive/Negative spell power. Fold the
    // governing-skill total into each element's sp.<element> key.
    {
      const skillTotal = (name: string) => resolveBonus(map.get(`skill.${name}`) ?? []).total
      const SP_SKILL: Record<string, string> = {
        Positive: 'Heal', Negative: 'Heal',
        Sonic: 'Perform',
        Repair: 'Repair', Rust: 'Repair',
      }
      // Default governing skill for every other element is Spellcraft.
      const SP_ELEMENTS = [
        'Acid', 'Cold', 'Electric', 'Fire', 'Force', 'LightAlignment',
        'Negative', 'Positive', 'Repair', 'Rust', 'Sonic', 'Poison',
        'Physical', 'Chaos', 'Evil', 'Lawful', 'Untyped',
      ]
      for (const el of SP_ELEMENTS) {
        const skill = SP_SKILL[el] ?? 'Spellcraft'
        const bonus = skillTotal(skill)
        if (bonus !== 0) {
          add(map, `sp.${el}`, {
            value: bonus,
            type: 'Skill Bonus',
            source: `${skill} skill bonus`,
          })
        }
      }
    }


    // ── Percentage effects (V2 BreakdownItem::DoPercentageEffects) ────────
    // Effects tagged <Percent/> add (base × percent / 100) of the stat's own
    // base total rather than a flat amount (e.g. Frenzied Berserker +25% HP).
    // V2 truncates EACH active percent effect's contribution individually and
    // sums the already-truncated amounts (BreakdownItem.cpp:474-503). Only
    // BreakdownItemHitpoints opts into the alternate "combine all percents
    // first, truncate once" path (DoAllPercentsAtOnce(), :498-501) — every
    // other percent-tagged stat truncates per-effect. Gear percents still obey
    // Highest-Only via the fromGear split in resolveBonus. Rewrite each
    // affected stat's bonus list: drop the raw percent markers and append the
    // computed contribution(s).
    for (const [key, bonuses] of map) {
      const pctBonuses = bonuses.filter(b => b.percent)
      if (pctBonuses.length === 0) continue
      const flatBonuses = bonuses.filter(b => !b.percent)
      // V2 RemoveTemporary (BreakdownItem.cpp:793-812): Bonus="Temporary"
      // effects are pulled out before baseTotal is computed for percentage
      // purposes, then added back flatly after all percentage effects apply
      // (:236-238) — a Temporary bonus is never itself scaled, nor does it
      // inflate the base that other %-bonuses on the same stat scale against.
      const base = resolveBonus(flatBonuses.filter(b => b.type !== 'Temporary')).total
      const resolvedPct = resolveBonus(pctBonuses.map(b => ({ ...b, percent: false })))
      const rebuilt = flatBonuses
      if (key === 'hp') {
        const percentSum = resolvedPct.total
        const contribution = Math.trunc((base * percentSum) / 100)
        if (contribution !== 0) {
          rebuilt.push({
            value: contribution,
            type: 'Stacking',
            source: `${percentSum}% of ${base}`,
          })
        }
      } else {
        for (const b of resolvedPct.bonuses) {
          if (!b.active) continue
          const contribution = Math.trunc((base * b.value) / 100)
          if (contribution !== 0) {
            rebuilt.push({
              value: contribution,
              type: 'Stacking',
              source: `${b.value}% of ${base} (${b.source})`,
            })
          }
        }
      }
      map.set(key, rebuilt)
    }

  return map
}

/**
 * Fixed-point stat-map resolution (V2 parity for ability-driven effects).
 *
 * V2's BreakdownItems observe the ability breakdowns: when gear/enhancement/
 * tome bonuses change an ability total, every dependent breakdown (Divine
 * Might-style ability-mod ATypes, ability-gated Requirements) re-evaluates
 * against the LIVE total. V3 resolves in passes instead: pass 1 uses the
 * inherent chargen totals (previous behaviour, documented as the "known
 * approximation"), then re-resolves with the fully-resolved totals until they
 * stop changing (bounded — ability→effect→ability chains in the data settle
 * in one or two iterations; the bound guards pathological oscillation).
 */
export function buildStatMap(input: BuildStatsInput, build: CharacterBuild): StatMap {
  const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
  const totalsOf = (m: StatMap): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const ab of ABILITIES) out[ab] = resolveBonus(m.get(`ability.${ab}`) ?? []).total
    return out
  }
  // Resolved skill totals for V2 EvaluateSkill gates (Requirement.cpp:1040).
  const skillsOf = (m: StatMap): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const key of m.keys()) {
      if (key.startsWith('skill.')) out[key.slice(6)] = resolveBonus(m.get(key) ?? []).total
    }
    return out
  }
  // Bonus caster levels per class (cl.<Class> effects + cl.All) for V2
  // ClassCasterLevel resolution: BreakdownItemCasterLevel totals class levels
  // PLUS CasterLevel effects (Epic/Legendary Knowledge, gear +CL), so e.g.
  // Merfolk's Blessing on a Bard 18 with Epic Knowledge ×5 + Legendary
  // Knowledge ×2 reads its Amount table at caster level 25, not 18.
  const casterOf = (m: StatMap): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const key of m.keys()) {
      if (key.startsWith('cl.')) out[key.slice(3)] = resolveBonus(m.get(key) ?? []).total
    }
    return out
  }
  let map = buildStatMapOnce(input, build)
  let totals = totalsOf(map)
  let skills = skillsOf(map)
  let casters = casterOf(map)
  for (let i = 0; i < 3; i++) {
    const next = buildStatMapOnce(input, build, totals, skills, casters)
    const nextTotals = totalsOf(next)
    const nextSkills = skillsOf(next)
    const nextCasters = casterOf(next)
    const stable = ABILITIES.every(ab => nextTotals[ab] === totals[ab])
      && Object.keys({ ...skills, ...nextSkills }).every(k => nextSkills[k] === skills[k])
      && Object.keys({ ...casters, ...nextCasters }).every(k => nextCasters[k] === casters[k])
    map = next
    totals = nextTotals
    skills = nextSkills
    casters = nextCasters
    if (stable) break
  }
  return map
}

/**
 * Pure variant of useBuildStats — builds the same BuildStats object the
 * React hook returns, but doesn't read from any context. Lets V2-imported
 * builds be evaluated head-to-head with V2 in unit tests.
 */
export function computeBuildStats(input: BuildStatsInput, build: CharacterBuild): BuildStats {
  const map = buildStatMap(input, build)
  const weaponInfo = extractWeaponInfo(input.gearItems)
  const armorMaxDex = extractArmorMaxDex(input.gearItems)
  const mapKeys = Array.from(map.keys())
  const slaList = mapKeys
    .filter(k => k.startsWith('sla.'))
    .sort()
    .map(k => k.slice(4))
  const grantedFeatsList = mapKeys
    .filter(k => k.startsWith('grantedFeat.'))
    .sort()
    .map(k => k.slice('grantedFeat.'.length))
  const groups = input.allWeaponGroups ?? []
  const { adds: groupAdds, merges: groupMerges } = buildRuntimeGroupAdds(input, build)
  return {
    resolve: (key: string): ResolvedStat => {
      const bonuses = map.get(key)
      return bonuses?.length ? resolveBonus(bonuses) : emptyResolvedStat()
    },
    total: (key: string): number => {
      const bonuses = map.get(key)
      return bonuses?.length ? resolveBonus(bonuses).total : 0
    },
    keys: () => Array.from(map.keys()),
    weapon: weaponInfo,
    armorMaxDex,
    slaList,
    grantedFeatsList,
    isWeaponProficient: (weaponType: string) =>
      deriveWeaponClasses(weaponType, groups, groupAdds, groupMerges).has('Proficiency'),
  }
}
