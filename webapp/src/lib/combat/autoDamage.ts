// Build -> damage-simulation inputs.
//
// This is the "automatic" half of the damage calculator. The simulation engine
// (damageSim.ts) is a faithful port of NicDamageCalc, which expects a human to
// type in every number. This module fills those numbers in from the character:
// scalars come off the stat map that useBuildStats already computes, and the
// effect lists are assembled by reading every equipped item's buffs through
// procText.ts and procCatalog.ts.
//
// The result is editable. Nothing here is a final answer -- it is a starting
// position that saves the player transcribing forty fields, and every entry it
// produces carries a source and a confidence so the panel can show its work.

import type { BuildStats, WeaponInfo } from '../../hooks/useBuildStats'
import type { Item, ItemBuff, SetBonus } from '../../types/ddo'
import type { ItemBuffSpec } from '../../server/dataLoaders'
import {
  emptyLists, type CoreParams, type SimLists,
  type ProcSpec, type DotSpec, type DebuffSpec,
} from './damageSim'
import { parseEffectText } from './procText'
import { catalogLookup, isIgnored } from './procCatalog'

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/** One line of "here is what I added and why". */
export interface AuditEntry {
  /** The entry's name in the simulation lists. */
  name: string
  /** Which list it landed in. */
  kind: 'proc' | 'dot' | 'debuff'
  /** Equipped item or set that granted it. */
  source: string
  /** 'exact' = numbers came from the game data; 'estimated' = inferred. */
  confidence: 'exact' | 'estimated'
  /** Why the numbers are what they are. */
  note: string
}

export interface AutoDamageResult {
  core: CoreParams
  lists: SimLists
  audit: AuditEntry[]
  /** Effects that clearly do damage but could not be modelled at all. */
  unmodelled: string[]
}

// ---------------------------------------------------------------------------
// Target and encounter defaults
// ---------------------------------------------------------------------------

/**
 * Target defaults. These match CombatPanel's foe defaults so the two Analysis
 * tabs describe the same dummy unless the player changes one.
 */
export const DEFAULT_TARGET = {
  ac: 80,
  fort: 50,
  prr: 50,
  mrr: 0,
}

export const DEFAULT_ENCOUNTER = {
  dur: 60,
  trials: 2000,
  seed: 1,
}

export interface AutoDamageOptions {
  /** Ranged builds read ranged.power / ranged.doubleshot instead of melee. */
  ranged?: boolean
  /** Attacks per minute, from lookupAttacksPerMinute. */
  attacksPerMinute: number
  /** Percentage of attacks that qualify for sneak attack. */
  sneakPct?: number
  ac?: number
  fort?: number
  prr?: number
  mrr?: number
  dur?: number
  trials?: number
  seed?: number
}

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Weapon types that scale with Ranged Power and Doubleshot rather than Melee
 * Power and Doublestrike. Listed explicitly because the weapon-group catalogue
 * is data-driven and does not ship a stable "Ranged" class name.
 */
const RANGED_WEAPONS = new Set([
  'Longbow', 'Shortbow', 'Great Crossbow', 'Heavy Crossbow', 'Light Crossbow',
  'Repeating Heavy Crossbow', 'Repeating Light Crossbow',
  'Dart', 'Throwing Axe', 'Throwing Dagger', 'Throwing Hammer', 'Shuriken',
])

export function isRangedWeapon(weaponType: string | undefined): boolean {
  return !!weaponType && RANGED_WEAPONS.has(weaponType)
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

/**
 * Maps the stat map onto the calculator's scalar inputs.
 *
 * The mapping mirrors attackEntry.ts so the two models read the same build the
 * same way, with two deliberate exceptions:
 *
 *  - `deadly` / `deadlyCrit` carry every flat damage bonus, not just Deadly.
 *    The engine's "critable bucket" is dice + flat, multiplied on a crit, which
 *    is how DDO resolves weapon damage; splitting Deadly out separately would
 *    double-count it.
 *  - `prof` / `prec` are flat percentage adders to hit chance with no DDO stat
 *    behind them. They exist because the engine derives hit chance from an
 *    AB/AC ratio rather than a d20 target. Proficiency seeds at 20% when the
 *    build is proficient and 0 when it is not; precision starts at 0. Both are
 *    calibration knobs the player is expected to tune.
 */
export function extractCore(
  stats: BuildStats,
  weapon: WeaponInfo,
  abilityScore: number,
  bab: number,
  opts: AutoDamageOptions,
): CoreParams {
  const ranged = opts.ranged ?? false

  const power = ranged ? stats.total('ranged.power') : stats.total('melee.power')
  const multiAttack = ranged
    ? stats.total('ranged.doubleshot')
    : stats.total('melee.doublestrike')

  const abilityMod = modifier(abilityScore)
  const damageAbilMult = stats.total('melee.damageAbilityMult') || 1
  const toHit = stats.total('melee.toHit') + stats.total('melee.attack')

  // Flat damage that rides the crit multiplier, and the crit-only extra.
  const flatDamage = stats.total('melee.damage') + abilityMod * damageAbilMult
  const critOnlyDamage = stats.total('melee.crit.damage')

  // Threat faces, then the lowest d20 face that threatens.
  const threatFaces = Math.max(
    1,
    weapon.critThreatRange + stats.total('melee.crit.range') + stats.total('weapon.threatRange'),
  )

  const bonusW = stats.total('weapon.bonusW')

  const proficient = weapon.weaponType ? stats.isWeaponProficient(weapon.weaponType) : true

  return {
    // To-hit
    atk: bab + toHit + abilityMod,
    prof: proficient ? 20 : 0,
    prec: 0,
    seeker: 0,
    threat: 21 - threatFaces,
    critMult: weapon.critMultiplier + stats.total('melee.crit.multiplier'),
    crit19: stats.total('weapon.critMultiplier19to20'),
    confPrec: true,

    // Critable bucket
    wMult: 1,
    wCount: weapon.diceNum + bonusW,
    wSides: weapon.diceSides,
    wFlat: 0,
    deadly: flatDamage,
    deadlyCrit: flatDamage + critOnlyDamage,
    coreTag: 'physical',

    // Sneak attack
    sneakPct: opts.sneakPct ?? 0,
    decHit: 0,
    decDmg: stats.total('melee.sneakDamage') + stats.total('ranged.sneakDamage'),
    sneakDice: stats.total('melee.sneakDice') + stats.total('melee.sneakAttack'),
    sneakTag: 'physical',

    // Imbue
    imbBonus: stats.total('imbueDice'),
    imbSides: 8,
    imbRate: 100,
    imbSrc: 'RP',
    imbSP: 0,
    imbMRR: true,
    imbTag: 'untyped',

    // Scaling
    rp: power,
    ds: multiAttack,
    apm: opts.attacksPerMinute,

    // Target
    ac: opts.ac ?? DEFAULT_TARGET.ac,
    fort: opts.fort ?? DEFAULT_TARGET.fort,
    bypass: stats.total('fortBypass'),
    prr: opts.prr ?? DEFAULT_TARGET.prr,
    mrr: opts.mrr ?? DEFAULT_TARGET.mrr,

    // Simulation
    dur: opts.dur ?? DEFAULT_ENCOUNTER.dur,
    trials: opts.trials ?? DEFAULT_ENCOUNTER.trials,
    seed: opts.seed ?? DEFAULT_ENCOUNTER.seed,
  }
}

// ---------------------------------------------------------------------------
// Effect lists
// ---------------------------------------------------------------------------

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/** Keeps generated names unique so rider/requires links stay unambiguous. */
function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) { used.add(base); return base }
  for (let i = 2; ; i++) {
    const n = `${base} ${i}`
    if (!used.has(n)) { used.add(n); return n }
  }
}

/**
 * Reads every equipped item's buffs and turns the damage-dealing ones into
 * simulation entries.
 *
 * A buff contributes through one of two paths. If its DisplayText states dice
 * or a range, procText derives the entry from the prose. If it states no
 * numbers at all -- Dripping with Magma and its family -- procCatalog supplies
 * an estimate. Buffs that already carry <Effect> blocks are skipped: those are
 * stat effects that useBuildStats has folded into the scalars above, and
 * counting them here would double them.
 */
export function extractLists(
  gearItems: Record<string, Item>,
  itemBuffs: ItemBuffSpec[],
  setBonuses: SetBonus[] = [],
  equippedSets: string[] = [],
): { lists: SimLists; audit: AuditEntry[]; unmodelled: string[] } {
  const lists = emptyLists()
  const audit: AuditEntry[] = []
  const unmodelled: string[] = []
  const used = new Set<string>()

  // Buff Type -> template, for DisplayText and Effect lookup.
  const templates = new Map<string, ItemBuffSpec>()
  for (const b of itemBuffs) {
    if (b?.Type) templates.set(b.Type.trim().toLowerCase(), b)
  }

  /** Folds one effect's prose into the lists. */
  const ingest = (type: string, displayText: string, source: string): void => {
    if (!type || isIgnored(type)) return

    const parsed = parseEffectText(type, displayText)
    let entry: {
      procs: Array<Omit<ProcSpec, 'name'>>
      dots: Array<Omit<DotSpec, 'name'>>
      debuffs: Array<Omit<DebuffSpec, 'name'>>
      confidence: 'exact' | 'estimated'
      note: string
    } | null = null

    if (parsed.procs.length || parsed.dots.length || parsed.debuffs.length) {
      entry = {
        procs: parsed.procs,
        dots: parsed.dots,
        debuffs: parsed.debuffs,
        confidence: parsed.exact ? 'exact' : 'estimated',
        note: parsed.notes.length
          ? parsed.notes.join('; ')
          : 'read from the effect description',
      }
    } else {
      const cat = catalogLookup(type, displayText)
      if (cat) {
        // The catalogue reports its own confidence: most entries carry
        // wiki-documented dice and proc rates and count as exact.
        entry = {
          procs: cat.procs, dots: cat.dots, debuffs: cat.debuffs,
          confidence: cat.confidence, note: cat.note,
        }
      } else if (/\bdamage\b/i.test(displayText) && !/spell power|critical hit/i.test(displayText)) {
        unmodelled.push(`${type} (${source})`)
      }
    }
    if (!entry) return

    for (const p of entry.procs) {
      const name = uniqueName(type, used)
      lists.procs.push({ ...p, name, source, confidence: entry.confidence })
      audit.push({ name, kind: 'proc', source, confidence: entry.confidence, note: entry.note })
    }
    for (const d of entry.dots) {
      const name = uniqueName(type, used)
      lists.dots.push({ ...d, name, source, confidence: entry.confidence })
      audit.push({ name, kind: 'dot', source, confidence: entry.confidence, note: entry.note })
    }
    for (const v of entry.debuffs) {
      const name = uniqueName(type, used)
      lists.debuffs.push({ ...v, name, source, confidence: entry.confidence })
      audit.push({ name, kind: 'debuff', source, confidence: entry.confidence, note: entry.note })
    }
  }

  for (const [slot, item] of Object.entries(gearItems)) {
    if (!item) continue
    const source = `${item.Name} (${slot})`
    for (const buff of asArray<ItemBuff>(item.Buff)) {
      const type = (buff?.Type ?? '').trim()
      if (!type) continue
      const tpl = templates.get(type.toLowerCase())
      // A template carrying <Effect> blocks is a stat effect that
      // useBuildStats already applied. Only flavour-only templates, and buffs
      // with no template at all, describe procs.
      if (tpl?.Effect) continue
      const text = tpl?.DisplayText ?? buff?.Description1 ?? ''
      if (!text) continue
      ingest(type, text.replace(/\s+/g, ' '), source)
    }
  }

  // Set bonuses describe their procs in prose too.
  const wanted = new Set(equippedSets.map(s => s.trim().toLowerCase()))
  for (const set of setBonuses) {
    const setName = (set as { Name?: string }).Name ?? ''
    if (!setName || !wanted.has(setName.trim().toLowerCase())) continue
    for (const b of asArray((set as { SetBonusBuff?: unknown }).SetBonusBuff)) {
      const desc = (b as { Description?: string })?.Description
      const hasEffect = (b as { Effect?: unknown })?.Effect
      if (!desc || hasEffect) continue
      ingest(setName, desc.replace(/\s+/g, ' '), `${setName} (set bonus)`)
    }
  }

  return { lists, audit, unmodelled }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildAutoDamage(
  stats: BuildStats,
  weapon: WeaponInfo,
  abilityScore: number,
  bab: number,
  gearItems: Record<string, Item>,
  itemBuffs: ItemBuffSpec[],
  opts: AutoDamageOptions,
  setBonuses: SetBonus[] = [],
  equippedSets: string[] = [],
): AutoDamageResult {
  const core = extractCore(stats, weapon, abilityScore, bab, opts)
  const { lists, audit, unmodelled } = extractLists(gearItems, itemBuffs, setBonuses, equippedSets)
  return { core, lists, audit, unmodelled }
}
