// Turns combat results into hover-breakdown rows.
//
// Kept out of the components so the explanation of a number is unit-testable
// and cannot silently drift from the number itself: every row here is built
// from the same intermediates the calculation used, never recomputed.

import type { AttackEntryResult } from './attackEntry'
import type { SimResult } from './damageSim'
import { fmtPercentValue } from './format'

/** Mirrors BreakdownTip's row union without importing from components. */
export type TipRow =
  | { kind: 'add'; label: string; value: number; note?: string }
  | { kind: 'mult'; label: string; factor: number; note?: string }
  | { kind: 'subtotal'; label: string; note?: string }
  | { kind: 'share'; label: string; value: number; note?: string }
  | { kind: 'note'; label: string }

/** Drops additive rows that contribute nothing, so the list stays readable. */
function compact(rows: TipRow[]): TipRow[] {
  return rows.filter(r => {
    if (r.kind === 'add') return r.value !== 0
    if (r.kind === 'mult') return r.factor !== 1
    if (r.kind === 'share') return r.value > 0
    return true
  })
}

// ---------------------------------------------------------------------------
// Combat overview (attackEntry)
// ---------------------------------------------------------------------------

/** The dice-and-flat rows shared by hit damage and crit damage. */
function baseRows(b: AttackEntryResult['breakdown']): TipRow[] {
  const diceLabel = b.bonusW > 0
    ? `Weapon dice ${b.diceNum}d${b.diceSides} +${b.bonusW}[W]`
    : `Weapon dice ${b.diceNum}d${b.diceSides}`
  return [
    { kind: 'add', label: diceLabel, value: b.weaponDie, note: 'average roll' },
    { kind: 'add', label: 'Damage bonuses', value: b.meleeDamage },
    {
      kind: 'add',
      label: 'Ability modifier',
      value: b.abilityDamage,
      note: b.damageAbilMult !== 1 ? `${b.abilityMod} × ${b.damageAbilMult}` : undefined,
    },
  ]
}

export function hitDamageRows(r: AttackEntryResult): TipRow[] {
  const b = r.breakdown
  return compact([
    ...baseRows(b),
    {
      kind: 'add',
      label: 'Sneak attack dice',
      value: b.sneakBonus,
      note: b.sneakDice > 0 ? `${b.sneakDice}d6` : undefined,
    },
    { kind: 'subtotal', label: 'Before Melee Power' },
    { kind: 'mult', label: 'Melee/Ranged Power', factor: b.meleePowerMult, note: `+${b.meleePower}` },
  ])
}

export function critDamageRows(r: AttackEntryResult): TipRow[] {
  const b = r.breakdown
  const rows: TipRow[] = [
    ...baseRows(b),
    { kind: 'subtotal', label: 'Base damage' },
    { kind: 'mult', label: 'Critical multiplier', factor: b.stdMult, note: `×${b.stdMult}` },
    { kind: 'add', label: 'Crit-only damage', value: b.critOnlyDamage },
    {
      kind: 'add',
      label: 'Sneak attack dice',
      value: b.sneakBonus,
      note: b.sneakDice > 0 ? 'not multiplied on crits' : undefined,
    },
    { kind: 'mult', label: 'Melee/Ranged Power', factor: b.meleePowerMult, note: `+${b.meleePower}` },
  ]
  // The displayed figure is a weighted average when the weapon threatens below
  // 19 and a separate 19-20 multiplier is in play, so say so rather than
  // showing a single chain that does not reach the number.
  if (b.facesStandard > 0 && b.mult19to20 !== b.stdMult) {
    rows.push({
      kind: 'note',
      label: `Averaged across ${b.threatFaces} threat faces: ` +
        `${b.faces19to20} at ×${b.mult19to20}, ${b.facesStandard} at ×${b.stdMult}.`,
    })
  }
  return compact(rows)
}

export function mainDprRows(r: AttackEntryResult): TipRow[] {
  const b = r.breakdown
  return compact([
    { kind: 'add', label: 'Expected damage per swing', value: b.expectedRaw },
    {
      kind: 'note',
      label: `${fmtPercentValue(r.hitChance * 100)} to hit, of which ` +
        `${fmtPercentValue(b.effectiveCritChance * 100)} crit after fortification.`,
    },
    { kind: 'mult', label: 'Doublestrike', factor: 1 + b.doublestrike, note: fmtPercentValue(b.doublestrike * 100) },
    ...(b.twoHanded
      ? [{ kind: 'mult' as const, label: 'Strikethrough', factor: 1 + b.strikethrough }]
      : []),
    { kind: 'mult', label: 'Helpless bonus', factor: b.helplessFactor },
  ])
}

export function totalDprRows(r: AttackEntryResult): TipRow[] {
  const b = r.breakdown
  return compact([
    { kind: 'add', label: 'Main hand DPR', value: r.mainDPR },
    { kind: 'add', label: 'Off-hand DPR', value: r.offhandDPR },
    { kind: 'subtotal', label: 'Before mitigation' },
    { kind: 'mult', label: 'Target PRR', factor: b.prrMult, note: `${b.foePRR} PRR` },
  ])
}

export function dpsRows(r: AttackEntryResult): TipRow[] {
  const b = r.breakdown
  return compact([
    { kind: 'add', label: 'Total damage per round', value: r.totalDPR },
    { kind: 'mult', label: 'Swings per round', factor: b.attacksPerRound / 6, note: `${b.attacksPerRound} per 6s round` },
  ])
}

export function offhandDprRows(r: AttackEntryResult): TipRow[] {
  const b = r.breakdown
  if (!b.offhand) return [{ kind: 'note', label: 'Nothing equipped in the off-hand.' }]
  return compact([
    { kind: 'add', label: 'Off-hand swing damage', value: b.offhand.raw },
    { kind: 'mult', label: 'Off-hand hit chance', factor: b.offhand.hitChance },
    { kind: 'mult', label: 'Off-hand swing chance', factor: b.offhand.chance },
    { kind: 'mult', label: 'Helpless bonus', factor: b.helplessFactor },
  ])
}

// ---------------------------------------------------------------------------
// Damage Calc (damageSim)
// ---------------------------------------------------------------------------

/**
 * Where an encounter's damage came from, as shares of the raw total.
 *
 * The simulation tracks each proc, DoT, and debuff by name, so this can name
 * the item that produced the damage rather than just its category.
 */
export function sourceShareRows(r: SimResult): TipRow[] {
  const b = r.buckets
  // The weapon's own damage sits in the fixed buckets; everything else is a
  // named effect off a piece of gear. Both are just contributions here, and
  // the question the tooltip answers is "what is carrying this build", so the
  // whole list sorts by size rather than pinning the built-ins to the top.
  const shares: Array<[string, number]> = [
    ['Weapon damage', b.critable],
    ['Sneak attack dice', b.sneak],
    ['Imbue dice', b.imbue],
    ...Object.entries(r.bySource),
  ]

  const rows: TipRow[] = shares
    .filter(([, value]) => value > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([label, value]) => ({ kind: 'share' as const, label, value }))

  if (rows.length === 0) rows.push({ kind: 'note', label: 'No damage recorded.' })
  return rows
}

/** Shares within one category, e.g. only the procs. */
export function bucketSourceRows(r: SimResult, kind: 'proc' | 'dot'): TipRow[] {
  const rows: TipRow[] = Object.entries(r.bySource)
    .filter(([name]) => r.sourceKind[name] === kind)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ kind: 'share' as const, label, value }))
  if (rows.length === 0) {
    rows.push({
      kind: 'note',
      label: kind === 'proc'
        ? 'No on-hit procs were found on the equipped gear.'
        : 'No damage-over-time effects were found on the equipped gear.',
    })
  }
  return rows
}

/** The per-encounter mean, explained as its raw parts and the mitigation. */
export function meanDamageRows(r: SimResult): TipRow[] {
  return sourceShareRows(r)
}
