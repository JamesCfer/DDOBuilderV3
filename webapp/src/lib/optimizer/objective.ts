// Objective model for the build optimizer (Custom › Optimizer).
//
// An objective is an ordered list of breakdown stat keys. Two scoring modes:
//  - 'priority': strict lexicographic ordering — a build is better when the
//    first stat is higher; the second stat only breaks ties, and so on.
//    Matches "I want the most melee power possible, then damage, then HP".
//  - 'weighted': single scalar = Σ weight_i × total(key_i). Matches "melee
//    power and damage both matter, melee power twice as much".
//
// Scores are represented as vectors (one entry per objective stat, in
// priority order) so both modes share the same evaluation path.

export type ObjectiveMode = 'priority' | 'weighted'

export interface ObjectiveStat {
  /** Breakdown stat key, e.g. 'melee.power' (see OPTIMIZER_STATS). */
  key: string
  label: string
  /** Only meaningful in 'weighted' mode. */
  weight: number
}

export interface ObjectiveSpec {
  mode: ObjectiveMode
  stats: ObjectiveStat[]
}

export type ScoreVector = number[]

const EPS = 1e-9

export function scoreVector(spec: ObjectiveSpec, total: (key: string) => number): ScoreVector {
  return spec.stats.map(s => total(s.key))
}

/** > 0 when `a` beats `b` under the objective, < 0 when worse, 0 when equal. */
export function compareScores(spec: ObjectiveSpec, a: ScoreVector, b: ScoreVector): number {
  if (spec.mode === 'weighted') {
    const wa = a.reduce((acc, v, i) => acc + v * (spec.stats[i]?.weight ?? 1), 0)
    const wb = b.reduce((acc, v, i) => acc + v * (spec.stats[i]?.weight ?? 1), 0)
    const d = wa - wb
    return Math.abs(d) <= EPS ? 0 : d
  }
  for (let i = 0; i < spec.stats.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (Math.abs(d) > EPS) return d
  }
  return 0
}

/**
 * Collapse a score-vector delta to one scalar used ONLY to order candidate
 * moves in the lazy-greedy queue (final winner selection always uses the
 * exact compareScores). In priority mode higher-priority stats dominate via
 * a large base factor; ordering precision on far tie-breakers is a heuristic
 * trade-off the search tolerates.
 */
export function scalarGain(spec: ObjectiveSpec, before: ScoreVector, after: ScoreVector): number {
  if (spec.mode === 'weighted') {
    return after.reduce((acc, v, i) => acc + (v - (before[i] ?? 0)) * (spec.stats[i]?.weight ?? 1), 0)
  }
  const n = spec.stats.length
  let acc = 0
  for (let i = 0; i < n; i++) acc += ((after[i] ?? 0) - (before[i] ?? 0)) * Math.pow(1000, n - 1 - i)
  return acc
}

// ---------------------------------------------------------------------------
// Registry of stats the optimizer UI offers as objectives. Keys must match
// the breakdown engine's stat keys (components/breakdowns/breakdownSections).
// ---------------------------------------------------------------------------

export interface OptimizerStatDef {
  key: string
  label: string
  group: string
}

export const OPTIMIZER_STATS: OptimizerStatDef[] = [
  { key: 'melee.power',        label: 'Melee Power',         group: 'Melee' },
  { key: 'melee.damage',       label: 'Melee Damage Bonus',  group: 'Melee' },
  { key: 'melee.toHit',        label: 'Melee To-Hit',        group: 'Melee' },
  { key: 'melee.doublestrike', label: 'Doublestrike',        group: 'Melee' },
  { key: 'melee.sneakDice',    label: 'Sneak Attack Dice',   group: 'Melee' },
  { key: 'melee.strikethrough', label: 'Strikethrough',      group: 'Melee' },
  { key: 'ranged.power',       label: 'Ranged Power',        group: 'Ranged' },
  { key: 'ranged.doubleshot',  label: 'Doubleshot',          group: 'Ranged' },
  { key: 'ranged.toHit',       label: 'Ranged To-Hit',       group: 'Ranged' },
  { key: 'hp',                 label: 'Hit Points',          group: 'Defense' },
  { key: 'ac',                 label: 'Armor Class',         group: 'Defense' },
  { key: 'prr',                label: 'PRR',                 group: 'Defense' },
  { key: 'mrr',                label: 'MRR',                 group: 'Defense' },
  { key: 'dodge',              label: 'Dodge',               group: 'Defense' },
  { key: 'fortification',      label: 'Fortification',       group: 'Defense' },
  { key: 'save.Fort',          label: 'Fortitude Save',      group: 'Saves' },
  { key: 'save.Reflex',        label: 'Reflex Save',         group: 'Saves' },
  { key: 'save.Will',          label: 'Will Save',           group: 'Saves' },
  { key: 'spellPoints',        label: 'Spell Points',        group: 'Casting' },
  { key: 'spellPower.Universal', label: 'Universal Spell Power', group: 'Casting' },
  { key: 'spellPower.Fire',    label: 'Fire Spell Power',    group: 'Casting' },
  { key: 'spellPower.Cold',    label: 'Cold Spell Power',    group: 'Casting' },
  { key: 'spellPower.Electric', label: 'Electric Spell Power', group: 'Casting' },
  { key: 'spellPower.Acid',    label: 'Acid Spell Power',    group: 'Casting' },
  { key: 'spellPower.Positive', label: 'Positive Spell Power', group: 'Casting' },
  { key: 'spellPower.Negative', label: 'Negative Spell Power', group: 'Casting' },
  { key: 'spellPower.Force',   label: 'Force Spell Power',   group: 'Casting' },
  { key: 'spellPenetration',   label: 'Spell Penetration',   group: 'Casting' },
  { key: 'dc.All',             label: 'Universal Spell DC',  group: 'Casting' },
  { key: 'tacticalDC.All',     label: 'Tactical DC (All)',   group: 'Misc' },
  { key: 'helpless',           label: 'Helpless Damage',     group: 'Misc' },
  { key: 'imbueDice',          label: 'Imbue Dice',          group: 'Misc' },
  { key: 'ability.Strength',   label: 'Strength',            group: 'Abilities' },
  { key: 'ability.Dexterity',  label: 'Dexterity',           group: 'Abilities' },
  { key: 'ability.Constitution', label: 'Constitution',      group: 'Abilities' },
  { key: 'ability.Intelligence', label: 'Intelligence',      group: 'Abilities' },
  { key: 'ability.Wisdom',     label: 'Wisdom',              group: 'Abilities' },
  { key: 'ability.Charisma',   label: 'Charisma',            group: 'Abilities' },
]

/**
 * Map a favorites-list key ("Section/Label", as stored by favoritesStore) to
 * a registry stat by label. The row label alone is ambiguous across sections
 * ("Damage Bonus" exists under both Melee and Ranged), so "Section Label" is
 * matched first. Returns null for rows the optimizer can't target (composite
 * display rows, hireling stats, …).
 */
export function statForFavoriteKey(favKey: string): OptimizerStatDef | null {
  const slash = favKey.indexOf('/')
  const section = slash >= 0 ? favKey.slice(0, slash).trim().toLowerCase() : ''
  const label = (slash >= 0 ? favKey.slice(slash + 1) : favKey).trim().toLowerCase()
  const qualified = `${section} ${label}`.trim()
  return (
    OPTIMIZER_STATS.find(s => s.label.toLowerCase() === qualified)
    ?? OPTIMIZER_STATS.find(s => s.label.toLowerCase() === label)
    ?? OPTIMIZER_STATS.find(s => `${s.group.toLowerCase()} ${s.label.toLowerCase()}` === qualified)
    ?? null
  )
}
