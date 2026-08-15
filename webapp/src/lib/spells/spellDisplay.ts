// Turning a Spell's raw data-file fields into the lines the hover card shows.
//
// Kept apart from the component so the formatting is testable on its own, and
// so the panel row and the card never disagree about what a spell does.

import type { Spell, Effect } from '../../types/ddo'
import { getAmountAtRank, parseAmount } from '../effectParser'

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

/**
 * "AbilityBonus" → "Ability Bonus"; leaves already-spaced text alone.
 *
 * An effect's Type is a list when one effect grants several things at once —
 * Heroism is Weapon_Attack + SaveBonus + SkillBonus in a single entry — so a
 * list is joined rather than assumed to be a string.
 */
export function humanizeType(type: unknown): string {
  if (Array.isArray(type)) {
    return type.map(humanizeType).filter(Boolean).join(', ')
  }
  if (typeof type !== 'string') return ''
  return type
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

export interface DamageLine {
  /** The dice as written in the data file, e.g. "1d6+3". */
  dice: string
  /** Damage type, e.g. "Fire". Absent on a few entries that omit it. */
  damage?: string
  /** Spell power that scales it, when it differs from the damage type. */
  spellPower?: string
  /** How it grows, e.g. "per caster level" or "per 2 caster levels". */
  scaling?: string
  /** The dice at this build's caster level — only when it can be trusted. */
  atCasterLevel?: string
}

interface RawDice {
  Number?: unknown
  Sides?: unknown
  Bonus?: unknown
}

/** "1d6+3", "2d8", "5" — whatever the parts add up to. */
function diceText(number: number, sides: number, bonus: number): string {
  const base = sides > 0 && number > 0 ? `${number}d${sides}` : ''
  if (!base) return bonus ? String(bonus) : ''
  if (!bonus) return base
  return `${base}${bonus > 0 ? '+' : '−'}${Math.abs(bonus)}`
}

function dicePart(raw: RawDice | undefined): { number: number; sides: number; bonus: number } | null {
  if (!raw) return null
  const number = parseAmount(raw.Number)[0] ?? 0
  const sides = parseAmount(raw.Sides)[0] ?? 0
  const bonus = parseAmount(raw.Bonus)[0] ?? 0
  if (!number && !sides && !bonus) return null
  return { number, sides, bonus }
}

/**
 * The damage lines for a spell at a given caster level.
 *
 * V2 (SpellDice.cpp:76) totals a spell as
 *   standard dice + per-caster-level dice × floor(casterLevel / perCasterLevels)
 * with the caster level clamped to the spell's MaxCasterLevel.
 *
 * The scaled total is only reported for `PerCasterLevels` of 1, which is what
 * the data's own description text agrees with (Fireball: "1d6+3 per caster
 * level (Maximum damage 10d6+30)" — exactly floor(10/1) × 1d6+3). For spells
 * that scale every N levels that formula does not match the game (Magic
 * Missile caps at 5 missiles at caster level 9, where the formula gives 4),
 * so those lines state how they scale and leave the arithmetic alone rather
 * than print a number that would be wrong.
 */
export function spellDamageLines(spell: Spell, casterLevel: number): DamageLine[] {
  const max = spell.MaxCasterLevel ?? Infinity
  const effective = Math.max(0, Math.min(casterLevel, max))

  const lines: DamageLine[] = []
  for (const entry of toArray(spell.SpellDamage)) {
    const dice = (entry as { SpellDice?: Record<string, unknown> }).SpellDice
    if (!dice) continue

    const per = parseAmount(dice.PerCasterLevels)[0] ?? 1
    // The data files spell the flat part BaseDice; V2's schema calls it
    // StandardDice, and the per-level part DicePerCasterLevel where the files
    // say BonusDice. Accept both names for each.
    const standard = dicePart(dice.BaseDice as RawDice | undefined)
      ?? dicePart(dice.StandardDice as RawDice | undefined)
    const scaling = dicePart(dice.BonusDice as RawDice | undefined)
      ?? dicePart(dice.DicePerCasterLevel as RawDice | undefined)
    const part = scaling ?? standard
    if (!part) continue

    const damage = entry.Damage as string | undefined
    const spellPower = entry.SpellPower as string | undefined
    const line: DamageLine = {
      dice: diceText(part.number, part.sides, part.bonus),
      damage: typeof damage === 'string' ? damage : undefined,
      spellPower: typeof spellPower === 'string' && spellPower !== damage ? spellPower : undefined,
    }

    if (scaling) {
      line.scaling = per === 1 ? 'per caster level' : `per ${per} caster levels`
      const steps = Math.floor(effective / per)
      if (per === 1 && steps > 0) {
        const base = standard ?? { number: 0, sides: 0, bonus: 0 }
        // A flat "+1 per caster level" carries no sides of its own, so the
        // die size comes from whichever part actually rolls one.
        line.atCasterLevel = diceText(
          base.number + scaling.number * steps,
          scaling.sides || base.sides,
          base.bonus + scaling.bonus * steps,
        )
        // Cloudkill is "2d6 + 1 per caster level" — the flat base still needs
        // showing alongside the scaling part.
        if (standard) line.dice = `${diceText(standard.number, standard.sides, standard.bonus)} + ${line.dice}`
      }
    }
    lines.push(line)
  }
  return lines
}

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

export interface SaveLine {
  /** "Reflex", "Will", … or whatever check the data names. */
  versus: string
  /** What a successful save does, e.g. "Half Damage". */
  effect?: string
}

export function spellSaveLines(spell: Spell): SaveLine[] {
  const out: SaveLine[] = []
  for (const dc of toArray(spell.SpellDC)) {
    const raw = dc as { DCVersus?: unknown; DCType?: unknown }
    if (typeof raw.DCVersus !== 'string' || !raw.DCVersus) continue
    out.push({
      versus: raw.DCVersus,
      effect: typeof raw.DCType === 'string' && raw.DCType ? raw.DCType : undefined,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export interface EffectLine {
  /** "+10 Energy Resistance" — the value, when the data carries one. */
  value?: string
  label: string
  /** Bonus type, shown as a chip so stacking is visible. */
  bonusType?: string
  /** What it applies to, e.g. "Acid, Cold, Electric". */
  targets?: string
}

/**
 * One readable line per Effect. Amounts indexed by caster level (AType
 * "ClassCasterLevel") are read at this build's caster level, the same way the
 * stat engine reads them; anything else takes the first value.
 */
export function spellEffectLines(spell: Spell, casterLevel: number): EffectLine[] {
  const out: EffectLine[] = []
  for (const effect of toArray(spell.Effect) as Effect[]) {
    if (!effect?.Type) continue
    const amounts = parseAmount(effect.Amount)
    const amount = /CasterLevel/i.test(effect.AType ?? '')
      ? getAmountAtRank(effect.Amount, casterLevel + 1)   // index 0 is caster level 0
      : amounts[0]

    // Every one of these fields is a list in at least one data-file entry, so
    // none of them may be assumed to be a string.
    const targets = toArray(effect.Item).filter(Boolean).map(String)
    const label = humanizeType(effect.DisplayName) || humanizeType(effect.Type)
    if (!label) continue
    const bonus = Array.isArray(effect.Bonus) ? effect.Bonus[0] : effect.Bonus
    out.push({
      value: amount ? `${amount > 0 ? '+' : '−'}${Math.abs(amount)}` : undefined,
      label,
      bonusType: typeof bonus === 'string' && bonus && bonus !== 'Unknown' ? bonus : undefined,
      targets: targets.length > 0 ? targets.join(', ') : undefined,
    })
  }
  return out
}
