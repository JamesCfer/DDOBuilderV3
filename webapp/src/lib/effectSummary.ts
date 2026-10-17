// One readable line per data-file Effect, for hover tooltips.
//
// "Melee Power +3 (Enhancement)", "Fortification +10% (Profane)",
// "Doublestrike +1/+2/+3 (Stacking)". The bonus type is kept apart from the
// text so the tooltip can colour it.

import type { Effect } from '../types/ddo'
import { parseAmount } from './effectParser'
import { humanizeType } from './spells/spellDisplay'

export interface EffectLine {
  /** What it changes, e.g. "Melee Power" or "Skill Bonus: Spot". */
  label: string
  /** "+3", "+1/+2/+3", "-10%", or "" when the effect carries no number. */
  amount: string
  /** Bonus type as written in the data, e.g. "Enhancement", "Stacking". */
  bonus?: string
  /** True when the number is a penalty. */
  negative: boolean
  /** How a non-flat amount scales, e.g. "per class level". */
  scaling?: string
  /** The effect has its own requirements (situational in game). */
  conditional: boolean
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v]
}

const SCALING: Record<string, string> = {
  ClassLevel: 'per class level',
  TotalLevel: 'per character level',
  APCount: 'per AP spent in the tree',
  HalfAbilityMod: 'half the ability modifier',
  AbilityMod: 'ability modifier',
  AbilityValue: 'ability score',
  Slider: 'per stack',
  SliderValue: 'per stack',
}

// ATypes that describe or grant something rather than add a number.
const NO_NUMBER = new Set(['NotNeeded', 'SpellInfo', 'Unknown'])

function signed(n: number, percent: boolean): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
  return (n >= 0 ? '+' : '') + v + (percent ? '%' : '')
}

function isFlag(v: unknown): boolean {
  return v === true || v === ''
}

/**
 * @param rank The rank to show (1-based). 0 or less lists every rank's value,
 *             which is what an untrained item should show.
 */
export function summarizeEffect(effect: Effect, rank = 0): EffectLine {
  const types = toArray(effect.Type as unknown as string | string[]).map(humanizeType).filter(Boolean)
  const items = toArray(effect.Item).map(String).filter(Boolean)
  const name = effect.DisplayName && effect.DisplayName !== types.join(', ')
    ? `${effect.DisplayName}: ${types.join(', ')}`
    : types.join(', ')
  const label = items.length > 0 ? `${name}: ${items.join(', ')}` : name

  const atype = effect.AType ?? 'Unknown'
  const percent = isFlag(effect.Percent) || /Percent/.test(String(effect.Type))
  let amount = ''
  let negative = false
  if (!NO_NUMBER.has(atype)) {
    const values = parseAmount(effect.Amount)
    if (values.length > 0) {
      if (rank > 0) {
        const v = values[Math.min(rank, values.length) - 1]
        amount = signed(v, percent)
        negative = v < 0
      } else {
        const distinct = [...new Set(values)]
        amount = distinct.length === 1
          ? signed(distinct[0], percent)
          : values.map(v => signed(v, percent)).join('/')
        negative = values.every(v => v < 0)
      }
    }
  }

  return {
    label,
    amount,
    bonus: effect.Bonus ? String(effect.Bonus) : undefined,
    negative,
    scaling: SCALING[atype],
    conditional: effect.Requirements != null,
  }
}

export function summarizeEffects(raw: Effect | Effect[] | undefined, rank = 0): EffectLine[] {
  return toArray(raw).filter(e => e && e.Type).map(e => summarizeEffect(e, rank))
}
