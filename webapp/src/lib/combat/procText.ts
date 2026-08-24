// Turns DDO effect prose into simulation entries.
//
// ItemBuffs.xml carries 1,700-odd buff templates. Roughly 1,200 have <Effect>
// blocks that useBuildStats already folds into the stat map. The other ~500 are
// flavour-only: a <Type> and a <DisplayText> and nothing else. Those are almost
// entirely the on-hit procs, damage-over-time effects, and vulnerability
// debuffs -- exactly the damage the builder currently scores as zero.
//
// Rather than hand-maintain a table of several hundred named effects, this
// module reads the DisplayText and derives the proc/DoT/debuff shape from it.
// A hand-written override table (procCatalog.ts) covers the entries whose prose
// carries no numbers at all, e.g. "Dripping with Magma".
//
// Everything here is pure string work, so it unit tests against the real
// shipped data without a browser.

import type { DebuffSpec, DotSpec, ProcSpec, Trigger } from './damageSim'

// ---------------------------------------------------------------------------
// Damage tags
// ---------------------------------------------------------------------------

/**
 * Canonical damage tags. These are what a tagged Vulnerability debuff matches
 * against, so the spelling has to be stable across parser and catalog.
 */
export const DAMAGE_TAGS = [
  'fire', 'acid', 'cold', 'electric', 'sonic', 'light', 'darkness',
  'evil', 'good', 'lawful', 'chaotic', 'negative', 'positive',
  'force', 'poison', 'bleed', 'physical', 'untyped',
] as const

export type DamageTag = typeof DAMAGE_TAGS[number]

/** Prose spellings mapped onto the canonical tag set. */
const TAG_WORDS: Array<[RegExp, DamageTag]> = [
  [/\bfire\b|\bflame\b|\bburn(ing)?\b|\bmagma\b/i, 'fire'],
  [/\bacid(ic)?\b|\bcorrosive\b/i, 'acid'],
  [/\bcold\b|\bice\b|\bfrost\b|\bfreez\w*\b/i, 'cold'],
  [/\belectric(ity)?\b|\blightning\b|\bshock(ing)?\b/i, 'electric'],
  [/\bsonic\b|\bsound\b|\bthunder\w*\b/i, 'sonic'],
  [/\blight\b|\bradian\w*\b/i, 'light'],
  [/\bdarkness\b|\bshadow\b/i, 'darkness'],
  [/\bevil\b|\bunholy\b/i, 'evil'],
  [/\bgood\b|\bholy\b/i, 'good'],
  [/\blawful\b|\baxiomatic\b/i, 'lawful'],
  [/\bchaotic\b|\banarchic\b/i, 'chaotic'],
  [/\bnegative\b/i, 'negative'],
  [/\bpositive\b/i, 'positive'],
  [/\bforce\b/i, 'force'],
  [/\bpoison\b/i, 'poison'],
  [/\bbleed(ing)?\b/i, 'bleed'],
  [/\bbludgeoning\b|\bslashing\b|\bpiercing\b|\bphysical\b/i, 'physical'],
]

/**
 * Picks the damage tag named closest before `at` in the text, so
 * "3 to 18 electric damage, and target bleeds for 1 to 8 bleed damage" tags
 * each roll with its own element rather than with whichever matched first.
 */
export function tagNear(text: string, at: number): DamageTag {
  let best: DamageTag = 'untyped'
  let bestDist = Infinity
  for (const [re, tag] of TAG_WORDS) {
    const g = new RegExp(re.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = g.exec(text)) !== null) {
      const d = Math.abs(m.index - at)
      // Prefer a word that sits after the number (DDO writes "6d6 Fire damage")
      // but accept one just before it.
      const biased = m.index >= at ? d : d * 1.6
      if (biased < bestDist) { bestDist = biased; best = tag }
    }
  }
  return bestDist <= 60 ? best : 'untyped'
}

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

/**
 * Prose that describes damage flowing the wrong way (guards, retaliation) or
 * damage that is not dealt to your target at all (healing, temp HP, summons).
 * These must never be counted as your outgoing damage.
 */
const EXCLUDE = [
  /\bguard\b/i,
  /\bwhen (?:you are |the wearer is )?(?:hit|damaged|struck|attacked)\b/i,
  /\bon being (?:hit|damaged|attacked)\b/i,
  /\bwhen hit (?:or missed )?in (?:melee|combat)\b/i,
  /\bto your attacker\b/i,
  /\battacking creature takes\b/i,
  /\byou are healed\b/i,
  /\btemporary hit ?points\b/i,
  /\bhit ?points? (?:of )?(?:healing|are restored)\b/i,
  /\bheals? you\b/i,
  /\bon shield bash\b/i,
  /\bshield bash\b/i,
  /\bspell(?:s)? (?:gain|have) a \+?\d+% chance to critical/i,
]

export function isOutgoingDamage(text: string): boolean {
  return !EXCLUDE.some(re => re.test(text))
}

/**
 * Ability damage ("3d6 Constitution damage") is not hit-point damage, so it
 * must never reach a damage bucket. This is filtered per roll rather than per
 * effect: Deadly Spider Venom deals a real 10d6 poison DoT *and* a rider of
 * 3d6 Constitution damage, and only the second should be dropped.
 */
const ABILITY_AFTER =
  /^[\s\w+]{0,12}\b(?:strength|dexterity|constitution|intelligence|wisdom|charisma)\b/i

function isAbilityDamage(text: string, roll: Roll, matchLen: number): boolean {
  return ABILITY_AFTER.test(text.slice(roll.at + matchLen))
}

/** Spelled-out numbers DDO uses in duration clauses ("every two seconds"). */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
}

function numWord(raw: string): number {
  const n = Number(raw)
  if (Number.isFinite(n)) return n
  return WORD_NUMBERS[raw.toLowerCase()] ?? 0
}

/** Matches either digits or a spelled-out number. */
const NUM = '(\\d+(?:\\.\\d+)?|' + Object.keys(WORD_NUMBERS).join('|') + ')'

// ---------------------------------------------------------------------------
// Number extraction
// ---------------------------------------------------------------------------

export interface Roll {
  dice: number
  sides: number
  flat: number
  /** Character offset of the match, used to pick the nearest damage tag. */
  at: number
  /** Length of the matched text, used to inspect the words that follow it. */
  len: number
}

/** `6d6`, `1d8`, `30d3 + 90` -> dice/sides plus an optional flat addend. */
const DICE_RE = /(\d+)\s*d\s*(\d+)(?:\s*\+\s*(\d+))?/gi
/** `85 to 195`, `8 to 32`, `1-5` -> a uniform range, modelled as dice+flat. */
const RANGE_RE = /(\d+)\s*(?:to|-|–)\s*(\d+)/gi

/**
 * Converts a stated `lo to hi` range into the closest dice expression:
 * (hi - lo + 1) sides on one die, offset by lo - 1. That reproduces both the
 * mean and the spread rather than collapsing the range to its average.
 */
export function rangeToRoll(lo: number, hi: number, at: number, len = 0): Roll {
  if (hi <= lo) return { dice: 0, sides: 0, flat: lo, at, len }
  return { dice: 1, sides: hi - lo + 1, flat: lo - 1, at, len }
}

/**
 * Finds every damage roll in a fragment, dice notation and ranges alike, and
 * drops the ones that turn out to be ability damage or plain counts.
 */
export function findRolls(text: string): Roll[] {
  const out: Roll[] = []
  const taken: Array<[number, number]> = []

  let m: RegExpExecArray | null
  const dice = new RegExp(DICE_RE.source, 'gi')
  while ((m = dice.exec(text)) !== null) {
    out.push({
      dice: Number(m[1]),
      sides: Number(m[2]),
      flat: m[3] ? Number(m[3]) : 0,
      at: m.index,
      len: m[0].length,
    })
    taken.push([m.index, m.index + m[0].length])
  }

  const range = new RegExp(RANGE_RE.source, 'gi')
  while ((m = range.exec(text)) !== null) {
    const s = m.index
    const e = s + m[0].length
    // Skip ranges that are really part of a dice expression already captured.
    if (taken.some(([a, b]) => s < b && e > a)) continue
    // "1-5 stacks", "up to 20 times", "for 3 seconds" are counts, not damage.
    if (/^\s*(?:stacks?|times?|seconds?|%|hit ?points?)/i.test(text.slice(e))) continue
    out.push(rangeToRoll(Number(m[1]), Number(m[2]), s, m[0].length))
  }

  return out
    .filter(r => !isAbilityDamage(text, r, r.len))
    .sort((a, b) => a.at - b.at)
}

// ---------------------------------------------------------------------------
// Trigger, chance, and cooldown
// ---------------------------------------------------------------------------

/** Reads the trigger clause. Defaults to `hit`. */
export function readTrigger(text: string): Trigger {
  if (/\bon vorpal\b|\bnatural 20\b|\bvorpal\b/i.test(text)) return 'natural 20'
  if (/\bon crit(?:ical)?(?: hits?)?\b|\bcritical hits?\b/i.test(text)) return 'crit'
  return 'hit'
}

/**
 * Reads the proc chance. An explicit percentage wins; otherwise DDO's stock
 * adjectives map onto the community's working estimates.
 */
export function readChance(text: string): { chance: number; exact: boolean } {
  const pct = /(\d+(?:\.\d+)?)\s*%\s*chance/i.exec(text)
  if (pct) return { chance: Number(pct[1]), exact: true }
  if (/\bhigh chance\b|\bvery (?:good|high) chance\b/i.test(text)) return { chance: 50, exact: false }
  if (/\bgood chance\b/i.test(text)) return { chance: 25, exact: false }
  if (/\bsmall chance\b|\bslight chance\b|\brare\b/i.test(text)) return { chance: 5, exact: false }
  if (/\boccasionally\b/i.test(text)) return { chance: 10, exact: false }
  if (/\bchance\b/i.test(text)) return { chance: 10, exact: false }
  // "On Hit: 6d6 Evil damage" with no chance clause fires every hit.
  return { chance: 100, exact: true }
}

/**
 * Reads a stack cap: "can stack up to 15 times", "stacked up to 3 times",
 * "inflict ten stacks". Defaults to 1 -- a DoT that never says it stacks does
 * not stack.
 */
export function readStackCap(text: string): number {
  const upTo = new RegExp('stack(?:s|ed|ing)?\\s+up\\s+to\\s+' + NUM + '\\s*(?:times?|stacks?)', 'i')
    .exec(text)
  if (upTo) return Math.max(1, numWord(upTo[1]))
  const nStacks = new RegExp(NUM + '\\s+stacks\\b', 'i').exec(text)
  if (nStacks) return Math.max(1, numWord(nStacks[1]))
  return 1
}

/** Reads an internal cooldown, e.g. "can only proc once every 10 seconds". */
export function readIcd(text: string): number {
  const m = /once every (\d+(?:\.\d+)?)\s*second/i.exec(text)
  return m ? Number(m[1]) : 0
}

/** Reads a "every N seconds for M seconds" damage-over-time clause. */
export function readDotTiming(text: string): { tick: number; dur: number } | null {
  // Accepts both "every 2 seconds for 10 seconds" and DDO's spelled-out
  // "every two seconds for a duration of twelve seconds".
  const re = new RegExp(
    'every\\s+' + NUM + '\\s*seconds?' +
    '(?:\\s*(?:for|over)\\s+(?:a duration of\\s+)?' + NUM + '\\s*seconds?)?',
    'i',
  )
  const m = re.exec(text)
  if (m) {
    const tick = numWord(m[1]) || 2
    let dur = m[2] ? numWord(m[2]) : 0
    if (!dur) {
      // Glass Shards writes "every two seconds, lasts for 20 seconds", so the
      // duration clause is not adjacent to the tick clause.
      const lasts = new RegExp('(?:lasts?|lasting|remains?)\\s+(?:for\\s+)?' + NUM + '\\s*seconds?', 'i')
        .exec(text)
      if (lasts) dur = numWord(lasts[1])
    }
    return { tick, dur: dur || 12 }
  }
  // "stacking acid damage over time" with no numbers -- treat as a 2s tick
  // lasting 12s, the DDO norm for elemental attunement DoTs.
  if (/damage over time|periodically|damage each second/i.test(text)) {
    return { tick: 2, dur: 12 }
  }
  return null
}

// ---------------------------------------------------------------------------
// Vulnerability
// ---------------------------------------------------------------------------

/**
 * Reads DDO's stock Vulnerable clause:
 *   "Applies a stack of Vulnerable (1% more damage for 3 seconds. This effect
 *    stacks up to 20 times, and loses one stack on expiry.)"
 */
export function readVulnerability(text: string): Omit<DebuffSpec, 'name'> | null {
  // Require an actual application of the Vulnerable debuff. A passing mention
  // -- Glass Shards' "targets vulnerable to bleeding" -- is not one, and used
  // to fabricate a debuff out of that item's unrelated bleed stack cap.
  const applies =
    /(?:applies|adds|inflicts?|places?)\b[^.]{0,40}\bvulnerab/i.test(text) ||
    /\bstacks?\s+of\s+vulnerab/i.test(text) ||
    /vulnerab\w*[^.]{0,40}%\s*more damage/i.test(text)
  if (!applies) return null

  const pct = /(\d+(?:\.\d+)?)\s*%\s*more damage/i.exec(text)
  // Scope the stack duration to the Vulnerable clause. "85 to 195 Fire Damage
  // every 2 seconds for 10 seconds, and adds 1-5 stacks of Vulnerability" has
  // a "for 10 seconds" that belongs to the DoT, not to the debuff.
  const dur = pct
    ? /for\s+(\d+(?:\.\d+)?)\s*seconds?/i.exec(text.slice(pct.index))
    : null
  const cap = /stacks? up to\s+(\d+)\s*times?/i.exec(text)
  const applied = /adds?\s+(\d+)\s*(?:to|-|–)\s*(\d+)\s*stacks?/i.exec(text)

  // A bare mention of vulnerability with no numbers is not enough to model,
  // unless the text states how many stacks it applies -- "adds 1-5 stacks of
  // Vulnerability" is DDO's standard Vulnerable at 1% per stack for 3s.
  if (!pct && !cap && !applied) return null

  const stacksApplied = applied
    ? (Number(applied[1]) + Number(applied[2])) / 2
    : 1

  return {
    trigger: readTrigger(text),
    chance: readChance(text).chance,
    icd: readIcd(text),
    stacks: stacksApplied,
    cap: cap ? Number(cap[1]) : 20,
    decay: dur ? Number(dur[1]) : 3,
    // DDO's Vulnerable loses one stack per expiry rather than dropping whole.
    decayAll: /loses? (?:all|every) stack/i.test(text),
    target: 'vulnerability',
    value: pct ? Number(pct[1]) : 1,
    // An elemental Vulnerability ("Acid Vulnerability") in DDO still applies
    // the generic Vulnerable debuff -- the element names the trigger, not the
    // damage it boosts -- so this stays untagged on purpose.
    tag: '',
  }
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

export interface ParsedEffect {
  procs: Array<Omit<ProcSpec, 'name'>>
  dots: Array<Omit<DotSpec, 'name'>>
  debuffs: Array<Omit<DebuffSpec, 'name'>>
  /** False when any number in the result came from an adjective or a default. */
  exact: boolean
  /** Human-readable account of what was read, shown in the audit list. */
  notes: string[]
}

const EMPTY: ParsedEffect = { procs: [], dots: [], debuffs: [], exact: true, notes: [] }

/**
 * Strips the leading "Name: " label DDO puts at the front of every DisplayText,
 * so the effect's own name does not seed a damage tag. "Acid Guard VIII: When
 * Hit in Melee: ..." must not tag as acid off the label alone.
 */
export function stripLabel(displayText: string, type: string): string {
  const t = displayText.trim()
  const byType = new RegExp('^' + type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*', 'i')
  if (byType.test(t)) return t.replace(byType, '')
  // Fall back to the first colon when it looks like a label rather than prose.
  const c = t.indexOf(':')
  if (c > 0 && c < 48 && !/\d/.test(t.slice(0, c))) {
    // Never eat a trigger clause. "On Vorpal: ..." reads like a label, and
    // stripping it would silently demote the effect to a plain on-hit proc.
    if (/\bon\b|\bwhen\b|\bvorpal\b|\bcrit/i.test(t.slice(0, c))) return t
    return t.slice(c + 1).trim()
  }
  return t
}

/**
 * Parses one effect's prose into simulation entries.
 *
 * `type` is the buff's <Type>, used only to strip the label prefix.
 */
export function parseEffectText(type: string, displayText: string): ParsedEffect {
  if (!displayText) return EMPTY
  // Exclusions run against the full text: "Disease Guard" only reveals itself
  // as a guard through its own name, which stripLabel is about to remove.
  if (!isOutgoingDamage(displayText) || !isOutgoingDamage(type)) return EMPTY
  const body = stripLabel(displayText, type)

  // The effect's name is a fallback source of the damage element. "Forged
  // Lightning: On Hit: 2% Chance to do 300 to 500 damage" names its element
  // only in the label.
  const labelTag = tagNear(type, type.length)

  const notes: string[] = []
  let exact = true

  const trigger = readTrigger(body)
  const { chance, exact: chanceExact } = readChance(body)
  if (!chanceExact) {
    exact = false
    notes.push(`chance read as ${chance}% from wording, not a stated number`)
  }
  const icd = readIcd(body)

  const procs: Array<Omit<ProcSpec, 'name'>> = []
  const dots: Array<Omit<DotSpec, 'name'>> = []
  const debuffs: Array<Omit<DebuffSpec, 'name'>> = []

  const vuln = readVulnerability(body)
  if (vuln) debuffs.push(vuln)

  const timing = readDotTiming(body)
  // A DoT's stack cap is the item's own "stacks up to N times" clause. When a
  // Vulnerable debuff was also read out of the same prose, that clause belongs
  // to the debuff instead, so the DoT falls back to a single stack.
  const dotCap = vuln ? 1 : readStackCap(body)
  const rolls = findRolls(body)

  for (const r of rolls) {
    const bodyTag = tagNear(body, r.at)
    const tag = bodyTag === 'untyped' ? labelTag : bodyTag
    if (timing) {
      // "85 to 195 Fire Damage every 2 seconds for 10 seconds"
      dots.push({
        trigger, chance, icd,
        cap: dotCap,
        perTick: r.flat,
        dice: r.dice,
        sides: r.sides,
        tick: timing.tick,
        dur: timing.dur,
        // Item DoTs in DDO are not scaled by Melee/Ranged Power.
        rpRate: 0,
        tag,
      })
    } else {
      procs.push({
        trigger, chance, icd,
        dice: r.dice, sides: r.sides, flat: r.flat,
        // On-hit item procs do not scale with Melee/Ranged Power.
        rpRate: 0,
        dsScale: false,
        tag,
      })
    }
  }

  if (timing && rolls.length === 0 && /damage over time|stacking/i.test(body)) {
    // Prose describes a DoT but names no numbers. Leave it to the override
    // catalogue rather than inventing a figure here.
    return { procs, dots, debuffs, exact: false, notes: ['damage over time with no stated numbers'] }
  }

  if (procs.length === 0 && dots.length === 0 && debuffs.length === 0) return EMPTY

  if (timing && timing.dur === 12 && !/for\s+\d/.test(body)) {
    exact = false
    notes.push('duration assumed 12s')
  }

  return { procs, dots, debuffs, exact, notes }
}
