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
    power: stats.total(`sp.${spKey}`) + stats.total('sp.Universal'),
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
