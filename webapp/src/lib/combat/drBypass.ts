// V2's "DR Bypass" weapon line (BreakdownItemWeaponDRBypass::Value): the
// sorted, de-duplicated list of damage reduction kinds one hand's weapon
// bypasses. It comes from the weapon's own <DRBypass> entries and every
// active DRBypass effect whose Item names that weapon type (or All).

import type { BuildStats } from '../buildStats'

/** The DR kinds a hand bypasses, sorted the way V2 sorts them. */
export function drBypassList(
  stats: Pick<BuildStats, 'keys' | 'total'>,
  hand: 'main' | 'off',
): string[] {
  const prefix = hand === 'main' ? 'weapon.drBypass.' : 'offhand.drBypass.'
  const kinds = new Set<string>()
  for (const k of stats.keys()) {
    if (k.startsWith(prefix) && stats.total(k) > 0) kinds.add(k.slice(prefix.length))
  }
  // V2 std::sort on std::string: plain code-unit order, not locale order.
  return [...kinds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** V2's display text for the line: the kinds joined with ", ". */
export function drBypassText(
  stats: Pick<BuildStats, 'keys' | 'total'>,
  hand: 'main' | 'off',
): string {
  return drBypassList(stats, hand).join(', ')
}
