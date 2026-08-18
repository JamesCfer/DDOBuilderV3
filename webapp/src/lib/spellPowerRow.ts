// Spell power / critical chance / critical multiplier for one spell power
// type, as shown in the Analysis panel's "Spell Powers" table.
//
// V2 parity notes:
//   - BreakdownItemSpellPower::CreateOtherEffects folds the three Universal
//     breakdowns (power, lore, critical multiplier) into every concrete spell
//     power type rather than showing a "Universal" row of its own.
//   - `spCritDmg.All` is the Item=All form of SpellCriticalDamage, which V2
//     matches against every spell power type (Effect::HasSpellPower), so it
//     is universal in effect — the forum export folds it in the same way
//     (lib/export/sections.ts spellPowers).
//   - Critical chance has no base: V2's SpellDamage.cpp:59 starts it at 0 and
//     takes the breakdown total verbatim (truncated to an int at display).
//   - Critical multiplier starts at ×2 and each point of SpellCriticalDamage
//     adds 1% on top (SpellDamage.cpp:60,78-83:
//     `spellCriticalMultiplier += pBI->ReplacementTotal() / 100.0`).

import type { ResolvedBonus } from './bonus'

/** A spell crit deals double damage before any SpellCriticalDamage effect. */
export const SPELL_CRIT_MULT_BASE = 2

// The 17 concrete spell power types (V2 spellPowerTypeMap minus All/Universal
// pseudo-entries) — mirrors effectParser.ts's SP_ALL_TYPES. Used to discover
// which alternates a SpellPowerReplacement marker (e.g. Tiefling's "Infernal
// Sovereign") was trained for, since SpellPowerStatSource only exposes lookup
// by exact key, not enumeration.
const SPELL_POWER_ELEMENTS = [
  'Acid', 'Chaos', 'Cold', 'Electric', 'Evil', 'Fire', 'Force', 'Lawful',
  'LightAlignment', 'Negative', 'Physical', 'Poison', 'Positive', 'Repair',
  'Rust', 'Sonic', 'Untyped',
]

/**
 * V2 BreakdownItemSpellPower::ReplacementTotal (SpellDamage.cpp): a trained
 * SpellPowerReplacement effect (Tiefling's "Infernal Sovereign") lets one
 * elemental spell power substitute for another whenever the other is higher.
 * Only spell POWER is affected — V2 registers the replacement listener solely
 * on the Effect_SpellPower breakdown, not critical chance or multiplier.
 */
export function replacementSpellPower(stats: SpellPowerStatSource, key: string): number {
  const universal = stats.total('sp.Universal')
  let best = stats.total(`sp.${key}`) + universal
  for (const alt of SPELL_POWER_ELEMENTS) {
    if (alt === key) continue
    if (stats.total(`spellPowerReplacement.${key}.${alt}`) <= 0) continue
    const altPower = stats.total(`sp.${alt}`) + universal
    if (altPower > best) best = altPower
  }
  return best
}

/** The slice of BuildStats this module needs — keeps it React/hook free. */
export interface SpellPowerStatSource {
  total(key: string): number
  resolve(key: string): { bonuses: ResolvedBonus[] }
}

export interface SpellPowerRowValues {
  /** Total spell power (type + universal). */
  power: number
  /** Critical chance in percent, truncated as V2 displays it. */
  critChance: number
  /** Critical multiplier, e.g. 2.61 for +61% spell critical damage. */
  critMultiplier: number
  powerBonuses: ResolvedBonus[]
  critChanceBonuses: ResolvedBonus[]
  /** Percentage points, so the tooltip total reads as critMultiplier × 100. */
  critMultiplierBonuses: ResolvedBonus[]
}

export function spellPowerRowValues(
  stats: SpellPowerStatSource,
  spKey: string,
): SpellPowerRowValues {
  const critDmg = stats.total(`spCritDmg.${spKey}`)
    + stats.total('spCritDmg.Universal')
    + stats.total('spCritDmg.All')

  return {
    power: replacementSpellPower(stats, spKey),
    critChance: Math.trunc(
      stats.total(`spCrit.${spKey}`) + stats.total('spCrit.Universal')),
    critMultiplier: SPELL_CRIT_MULT_BASE + critDmg / 100,
    powerBonuses: [
      ...stats.resolve(`sp.${spKey}`).bonuses,
      ...stats.resolve('sp.Universal').bonuses,
    ],
    critChanceBonuses: [
      ...stats.resolve(`spCrit.${spKey}`).bonuses,
      ...stats.resolve('spCrit.Universal').bonuses,
    ],
    critMultiplierBonuses: [
      {
        value: SPELL_CRIT_MULT_BASE * 100,
        type: 'Base',
        source: 'Base critical multiplier (×2)',
        active: true,
      },
      ...stats.resolve(`spCritDmg.${spKey}`).bonuses,
      ...stats.resolve('spCritDmg.Universal').bonuses,
      ...stats.resolve('spCritDmg.All').bonuses,
    ],
  }
}
