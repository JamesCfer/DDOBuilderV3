// Override table for effects whose in-game text carries no numbers.
//
// procText.ts derives simulation entries from DisplayText, which works for the
// ~67 flavour-only effects that state their dice. Another ~54 describe real
// outgoing damage in words alone -- "your attacks have a high chance to deal
// very strong fire damage over time" is the entire specification DDO ships for
// Dripping with Magma.
//
// The numbers below come from DDO wiki, which documents these from datamining
// and large-sample testing. Each entry cites its page and, where the wiki gives
// one, the sample size behind the figure. Anything still genuinely unknown is
// left out rather than guessed at, so it surfaces in the panel's "not modelled"
// list where a player can enter their own number.
//
// Sources:
//   https://ddowiki.com/page/Category:Magma-Like_Effects
//   https://ddowiki.com/page/Dripping_with_Magma
//   https://ddowiki.com/page/Incineration
//   https://ddowiki.com/page/Greater_Sunburst
//   https://ddowiki.com/page/Magma_Surge
//   https://ddowiki.com/page/Shockwave
//   https://ddowiki.com/page/Slicing_Winds
//   https://ddowiki.com/page/Alchemical_Attunement
//   https://ddowiki.com/page/Inflict_Blight
//   https://ddowiki.com/page/Vile_Grip_of_the_Hidden_Hand
//   https://ddowiki.com/page/Legendary_Green_Steel

import type { DebuffSpec, DotSpec, ProcSpec } from './damageSim'
import { isOutgoingDamage, type DamageTag } from './procText'

export interface CatalogEntry {
  procs: Array<Omit<ProcSpec, 'name'>>
  dots: Array<Omit<DotSpec, 'name'>>
  debuffs: Array<Omit<DebuffSpec, 'name'>>
  /** Where these numbers came from, shown in the audit list. */
  note: string
  /**
   * 'exact' when the wiki documents the dice and the proc rate outright.
   * 'estimated' when part of it is still inferred.
   */
  confidence: 'exact' | 'estimated'
}

/**
 * Effects whose prose mentions damage but which never damage your target.
 * Matched against the effect's <Type>.
 */
const IGNORE = [
  /auto-?repair/i,
  /healers? bounty/i,
  /everbright/i,
  /swim like a fish/i,
  /vampirism/i,          // self-healing, not target damage
  /riposte/i,            // retaliation
  /banishing fists/i,    // instant kill below a HP threshold, not a damage roll
  /light ?bringer/i,     // ditto
  /sovereign nightmares/i,
  /strength sapping/i,   // a save-or-exhausted rider
  /sunsword/i,           // a scripted raid mechanic
  /litany/i,             // self-heal / ability damage riders
  /savant$/i,            // two-piece set descriptions
  /virulent poison/i,    // 5d6 Constitution damage -- ability damage, not HP
]

export function isIgnored(type: string): boolean {
  return IGNORE.some(re => re.test(type))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function proc(o: {
  chance: number; dice: number; sides: number; flat: number; tag: DamageTag
  trigger?: 'hit' | 'crit' | 'natural 20'; icd?: number
}): Omit<ProcSpec, 'name'> {
  return {
    trigger: o.trigger ?? 'hit',
    chance: o.chance,
    icd: o.icd ?? 0,
    dice: o.dice,
    sides: o.sides,
    flat: o.flat,
    // Item procs do not scale with Melee/Ranged Power.
    rpRate: 0,
    dsScale: false,
    tag: o.tag,
  }
}

function dot(o: {
  chance: number; cap: number; perTick: number; dice: number; sides: number
  tick: number; dur: number; tag: DamageTag; icd?: number; decayAll?: boolean
  trigger?: 'hit' | 'crit' | 'natural 20'
}): Omit<DotSpec, 'name'> {
  return {
    trigger: o.trigger ?? 'hit',
    chance: o.chance,
    icd: o.icd ?? 0,
    cap: o.cap,
    perTick: o.perTick,
    dice: o.dice,
    sides: o.sides,
    tick: o.tick,
    dur: o.dur,
    decayAll: o.decayAll ?? false,
    rpRate: 0,
    tag: o.tag,
  }
}

// ---------------------------------------------------------------------------
// Magma-Like Effects
// ---------------------------------------------------------------------------
//
// https://ddowiki.com/page/Category:Magma-Like_Effects documents the whole
// family as sharing every one of these properties:
//
//   - 10d20 damage of the effect's element per stack
//   - stack up to 5 times
//   - last 5 seconds
//   - tick once on application and once every 4 seconds
//   - remove ALL stacks at once on expiry
//   - 1 second internal cooldown between applications
//
// Only the damage type varies across the eight members.

const MAGMA_FAMILY: Record<string, DamageTag> = {
  'bitterfrostbite': 'cold',
  'drippingwithmagma': 'fire',
  'gripofvenom': 'poison',
  'lightninglash': 'electric',
  'lingeringacidicburn': 'acid',
  'ripplingenergy': 'force',
  'rupturingecho': 'sonic',
}

function magmaLike(tag: DamageTag): CatalogEntry {
  return {
    procs: [],
    dots: [dot({
      // The wiki calls the proc chance "high" and describes the 1s internal
      // cooldown as the binding constraint on uptime, so the cooldown does the
      // limiting here rather than a chance roll.
      chance: 100,
      icd: 1,
      cap: 5,
      perTick: 0,
      dice: 10,
      sides: 20,
      tick: 4,
      dur: 5,
      decayAll: true,
      tag,
    })],
    debuffs: [],
    note: '10d20 per stack, 5 stacks, 5s, ticks every 4s, drops all on expiry, 1s cooldown (DDO wiki: Magma-Like Effects)',
    confidence: 'exact',
  }
}

// ---------------------------------------------------------------------------
// Named effects with documented numbers
// ---------------------------------------------------------------------------

/** Exact-match table, keyed by lower-cased effect name. */
const NAMED: Record<string, () => CatalogEntry> = {
  // Magma-like relatives that deal different damage.
  // "Less damage than default (10d10 vs standard 10d20 per stack). Does not
  //  scale with Spellpower at all. Has a reduced ICD (0.5 seconds, not 1)"
  'alchemicalearthattunement': () => ({
    procs: [],
    dots: [dot({
      chance: 100, icd: 0.5, cap: 5, perTick: 0, dice: 10, sides: 10,
      tick: 4, dur: 5, decayAll: true, tag: 'acid',
    })],
    debuffs: [],
    note: '10d10 per stack, 5 stacks, 0.5s cooldown (DDO wiki: Alchemical Attunement)',
    confidence: 'exact',
  }),

  // "On an Acid, Negative, Poison or Evil spell, 10% chance to apply a short
  //  acid dot dealing 1d100 damage, 5 stacks max."
  'inflictblight': () => ({
    procs: [],
    dots: [dot({
      chance: 10, icd: 1, cap: 5, perTick: 0, dice: 1, sides: 100,
      tick: 4, dur: 5, decayAll: true, tag: 'acid',
    })],
    debuffs: [],
    note: '10% for a 1d100 acid DoT, 5 stacks (DDO wiki: Magma-Like Effects)',
    confidence: 'exact',
  }),

  // "1% to deal 10d440 fire damage to a single target."
  'alchemicalfireattunement': () => ({
    procs: [proc({ chance: 1, dice: 10, sides: 440, flat: 0, tag: 'fire' })],
    dots: [], debuffs: [],
    note: '1% for 10d440 fire (DDO wiki: Alchemical Attunement)',
    confidence: 'exact',
  }),
  'alchemicalairattunement': () => ({
    procs: [proc({ chance: 1, dice: 10, sides: 440, flat: 0, tag: 'electric' })],
    dots: [], debuffs: [],
    note: '1% for 10d440 electric (DDO wiki: Alchemical Attunement)',
    confidence: 'exact',
  }),

  // "Applies 10 stacks at once, each stack lasts 4 seconds. This effect has at
  //  least a 30 second cooldown between applications. Appears to be at least
  //  1d60 damage per stack, and deals damage once every 2-3 seconds."
  'alchemicalwaterattunement': () => ({
    procs: [],
    dots: [dot({
      chance: 100, icd: 30, cap: 10, perTick: 0, dice: 1, sides: 60,
      tick: 2, dur: 4, decayAll: false, tag: 'cold',
    })],
    debuffs: [],
    note: '10 stacks of 1d60 cold at once, 4s each, 30s cooldown; the wiki calls 1d60 a lower bound (DDO wiki: Alchemical Attunement)',
    confidence: 'estimated',
  }),

  // "2% chance of 200+8d20 Fire damage (average 284 per proc)"
  'incineration': () => ({
    procs: [proc({ chance: 2, dice: 8, sides: 20, flat: 200, tag: 'fire' })],
    dots: [], debuffs: [],
    note: '2% for 8d20+200 fire (DDO wiki: Incineration)',
    confidence: 'exact',
  }),
  // "This damage is dealt twice as often as a standard Incineration weapon."
  'greaterincineration': () => ({
    procs: [proc({ chance: 4, dice: 8, sides: 20, flat: 200, tag: 'fire' })],
    dots: [], debuffs: [],
    note: '4% for 8d20+200 fire — twice the base proc rate (DDO wiki: Incineration)',
    confidence: 'exact',
  }),

  // "Likely Proc rate: 2.0% ... Damage Formula: 10d10+200 ... Sample size: 136385"
  'greatersunburst': () => ({
    procs: [proc({ chance: 2, dice: 10, sides: 10, flat: 200, tag: 'light' })],
    dots: [], debuffs: [],
    note: '2% for 10d10+200 light, tested over 136,385 swings (DDO wiki: Greater Sunburst)',
    confidence: 'exact',
  }),

  // "On-hit: 2% chance of activating, 3d20+40 fire damage for 4 tics
  //  (1 per 2 seconds over 8 seconds)"
  'magmasurge': () => ({
    procs: [],
    dots: [dot({
      chance: 2, cap: 1, perTick: 40, dice: 3, sides: 20,
      tick: 2, dur: 8, decayAll: true, tag: 'fire',
    })],
    debuffs: [],
    note: '2% for 3d20+40 fire every 2s over 8s (DDO wiki: Magma Surge)',
    confidence: 'exact',
  }),

  // "2% chance of 3 ticks of (8d10+80) slashing damage"
  'slicingwinds': () => ({
    procs: [],
    dots: [dot({
      chance: 2, cap: 1, perTick: 80, dice: 8, sides: 10,
      tick: 2, dur: 6, decayAll: true, tag: 'physical',
    })],
    debuffs: [],
    note: '2% for 8d10+80 slashing every 2s over 6s (DDO wiki: Slicing Winds)',
    confidence: 'exact',
  }),
  // "2% chance for (8d100+400) slashing damage every 2 seconds for 6 seconds"
  'legendaryslicingwinds': () => ({
    procs: [],
    dots: [dot({
      chance: 2, cap: 1, perTick: 400, dice: 8, sides: 100,
      tick: 2, dur: 6, decayAll: true, tag: 'physical',
    })],
    debuffs: [],
    note: '2% for 8d100+400 slashing every 2s over 6s (DDO wiki: Slicing Winds)',
    confidence: 'exact',
  }),

  // Vorpal shockwaves. The wiki gives dice but no proc rate; these fire on a
  // natural 20, which the engine already models as its own trigger.
  'shockwave': () => shockwave(20, 3, 60),
  'whelmingshockwave': () => shockwave(20, 3, 60),
  'legendarywhelmingshockwave': () => shockwave(100, 10, 600),
  'overwhelmingshockwave': () => shockwave(100, 10, 600),

  // Vile Grip of the Hidden Hand: "1% for 10d44 of evil damage".
  // The data file truncates the name to "Vile Grip of the Hidden".
  'vilegripofthehidden': () => vileGrip(44),
  'vilegripofthehiddenhand': () => vileGrip(44),
  // "1% for 10d440 of evil damage"
  'legendaryvilegripofthehiddenhand': () => vileGrip(440),

  // Legendary Green Steel. The wiki brackets these figures as community
  // measurements rather than datamined values, so they stay estimated.
  // "Attacks and offensive spells have a [15%] chance to deal untyped
  //  damage. [70-120, ~86 average]"
  'legendarysteam': () => ({
    procs: [proc({ chance: 15, dice: 1, sides: 51, flat: 69, tag: 'untyped' })],
    dots: [], debuffs: [],
    note: '15% for 70-120 untyped (~86 average) — a measured range, not a datamined figure (DDO wiki: Legendary Green Steel)',
    confidence: 'estimated',
  }),

  // "Attacks and offensive spells have a [10~20%] chance to blind enemies
  //  with [around 100] Light damage."
  'legendaryradiance': () => ({
    procs: [proc({ chance: 15, dice: 0, sides: 0, flat: 100, tag: 'light' })],
    dots: [], debuffs: [],
    note: 'roughly 15% for about 100 light — the wiki gives ranges, not exact figures (DDO wiki: Legendary Green Steel)',
    confidence: 'estimated',
  }),

  // "Attacks and offensive spells have a [10~20%] chance to blind enemies with
  //  [around 100] Light damage."
  'brazenbrilliance': () => ({
    procs: [proc({ chance: 15, dice: 0, sides: 0, flat: 100, tag: 'light' })],
    dots: [], debuffs: [],
    note: 'roughly 15% for about 100 light — the wiki gives ranges, not exact figures (DDO wiki: Brazen Brilliance)',
    confidence: 'estimated',
  }),
}

function vileGrip(sides: number): CatalogEntry {
  return {
    procs: [proc({ chance: 1, dice: 10, sides, flat: 0, tag: 'evil' })],
    dots: [], debuffs: [],
    note: `1% for 10d${sides} evil (DDO wiki: Vile Grip of the Hidden Hand)`,
    confidence: 'exact',
  }
}

function shockwave(dice: number, sides: number, flat: number): CatalogEntry {
  return {
    procs: [proc({
      trigger: 'natural 20', chance: 100,
      dice, sides, flat, tag: 'physical',
    })],
    dots: [], debuffs: [],
    note: `${dice}d${sides}+${flat} bludgeoning on vorpal (DDO wiki: Shockwave)`,
    confidence: 'exact',
  }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Normalises an effect name for table lookup. DDO's own data is inconsistent
 * about spacing -- "GreaterSunburst" and "Greater Sunburst", "MagmaSurge" and
 * "Legendary Magma Surge" all appear -- so everything non-alphanumeric goes.
 */
const key = (type: string): string => type.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Returns simulation entries for an effect whose prose states no numbers, or
 * null when nothing documented covers it.
 *
 * `parseEffectText` is tried first by the caller; this only runs on what that
 * leaves behind. Effects with no documented numbers deliberately return null so
 * the panel can list them as unmodelled rather than invent a figure.
 */
export function catalogLookup(type: string, displayText: string): CatalogEntry | null {
  if (isIgnored(type)) return null
  // The same exclusions parseEffectText applies. Without this a numberless
  // guard -- "Cacophonic Guard: ... occasionally ... devastating enemies" --
  // would be counted as damage you deal.
  if (!isOutgoingDamage(type) || !isOutgoingDamage(displayText)) return null

  const k = key(type)

  const magmaTag = MAGMA_FAMILY[k]
  if (magmaTag) return magmaLike(magmaTag)

  const named = NAMED[k]
  if (named) return named()

  return null
}

/** Exposed for tests and for documenting coverage. */
export const CATALOG_NAMES: string[] = [
  ...Object.keys(MAGMA_FAMILY),
  ...Object.keys(NAMED),
]
