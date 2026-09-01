import type { AttackRate } from '../../server/dataLoaders'

function parseApm(s: string): number[] {
  return s.trim().split(/\s+/).map(Number)
}

/**
 * Looks up attacks per minute from the V2 AttackRates.xml table.
 * BAB is clamped to [0, 25]. Scans backward from the given BAB to find the
 * nearest defined (non-zero) value, matching V2's sparse table format where
 * only select BAB breakpoints (e.g. 20, 25) are populated.
 * Returns 0 when no entry matches or no non-zero value exists at or below the BAB.
 */
export function lookupAttacksPerMinute(
  rates: AttackRate[],
  style: string,
  bab: number,
  race = 'All',
): number {
  const clampedBab = Math.max(0, Math.min(25, bab))

  for (const targetRace of [race, 'All']) {
    const entry = rates.find(r => r.Style === style && (r.Race ?? 'All') === targetRace)
    if (entry?.AttacksPerMinute) {
      const apm = parseApm(entry.AttacksPerMinute)
      for (let b = clampedBab; b >= 0; b--) {
        if ((apm[b] ?? 0) > 0) return apm[b]
      }
      return 0
    }
  }

  return 0
}

/**
 * Derives the V2 AttackRates.xml style name from current build combat setup.
 * Style names must match the `Style` elements in AttackRates.xml exactly.
 */
export function pickCombatStyleName(opts: {
  twfTier: number
  twoHanded: boolean
  hasOffhand: boolean
  isUnarmed: boolean
}): string {
  if (opts.isUnarmed) return 'Unarmed'
  if (opts.twoHanded) return 'Two Handed Fighting'
  if (opts.twfTier >= 1 && opts.hasOffhand) return 'Two Weapon Fighting'
  if (!opts.hasOffhand) return 'Single WeaponFighting'
  return 'Sword and Board'
}

/**
 * The two-weapon-fighting tier a character fights at: 0 (no TWF feat) through
 * 4 (Perfect Two Weapon Fighting). Each tier adds an off-hand attack chance,
 * and tier >= 1 selects the "Two Weapon Fighting" attack-rate style above.
 *
 * Takes the character's whole feat set, not their trained choices: Rangers and
 * Dark Hunters are GRANTED Two Weapon Fighting / Improved / Greater at class
 * levels 2 / 6 / 11, and reading trained feats alone left those builds fighting
 * at tier 0 — the granted feats did nothing at all to the combat numbers.
 */
export function twoWeaponFightingTier(feats: Iterable<string>): 0 | 1 | 2 | 3 | 4 {
  const f = feats instanceof Set ? feats : new Set(feats)
  if (f.has('Perfect Two Weapon Fighting')) return 4
  if (f.has('Greater Two Weapon Fighting')) return 3
  if (f.has('Improved Two Weapon Fighting')) return 2
  if (f.has('Two Weapon Fighting')) return 1
  return 0
}
