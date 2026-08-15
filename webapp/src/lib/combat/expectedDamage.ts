// Expected damage of one swing, crits included — the number the optimizer
// maximises when you ask it for "damage".
//
// DDO's per-swing damage is
//
//     (W × weapon dice) + damage bonus          on a normal hit
//     ((W × weapon dice) + damage bonus) × M    on a critical, plus any
//                                               crit-only damage
//
// and the multiplier M depends on WHICH face threatened: handwraps critting on
// 16-20 with a ×4 multiplier and a ×6 on 19-20 land ×4 on a natural 16/17/18
// and ×6 on a natural 19/20. Averaging over the d20 gives one comparable
// number per build:
//
//     perSwing = Σ over the 20 faces  P(face) × damage(face)
//
// Deliberately foe-independent: no AC, PRR or fortification. Those describe the
// target, not the build, and folding them in would make the optimizer chase
// whatever dummy the panel happens to be configured for. `buildAttackEntry`
// remains the place for a full DPS estimate against a specific foe.

import type { BuildStats, WeaponInfo } from '../buildStats'
import { critProfile, type CritProfile } from './critProfile'

export interface ExpectedDamage {
  /** Average of the weapon's damage dice, including bonus W. */
  weaponDice: number
  /** Flat damage bonus (melee.damage) plus the ability contribution. */
  damageBonus: number
  /** The ability-modifier part of the damage bonus. */
  abilityDamage: number
  /** Damage before any multiplier — what a normal hit deals, pre-Melee Power. */
  baseDamage: number
  /** Damage of a normal (non-critical) hit. */
  normalHit: number
  /** Damage of a critical on a face below 19. */
  critStandard: number
  /** Damage of a critical on a natural 19-20. */
  crit19to20: number
  /** Probability-weighted damage of a single swing, crits included. */
  perSwing: number
  /** Multiplier the crits are worth over a build with no crits at all. */
  critUplift: number
  crit: CritProfile
}

type Total = (key: string) => number

function avgDie(diceNum: number, diceSides: number): number {
  return diceNum * (diceSides + 1) / 2
}

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Which ability feeds melee damage, mirroring CombatPanel: any ability named by
 * a `melee.damageAbility.*` effect, whichever of those scores is highest,
 * falling back to Strength.
 */
export function damageAbilityScore(total: Total, keys: string[]): number {
  let best = 'Strength'
  for (const key of keys) {
    const m = /^melee\.(?:attackAbility|damageAbility)\.(.+)$/.exec(key)
    if (!m || total(key) === 0) continue
    if (total(`ability.${m[1]}`) > total(`ability.${best}`)) best = m[1]
  }
  return total(`ability.${best}`)
}

/**
 * Expected damage per swing for the wielded weapon.
 *
 * `keys` is the stat map's key list (used to find which ability drives damage);
 * pass `stats.keys()`.
 */
export function expectedDamage(
  total: Total,
  keys: string[],
  weapon?: WeaponInfo | null,
): ExpectedDamage {
  const crit = critProfile(total, weapon)

  const bonusW = total('weapon.bonusW')
  const diceNum = (weapon?.diceNum ?? 1) + bonusW
  const diceSides = weapon?.diceSides ?? 2
  const weaponDice = avgDie(diceNum, diceSides)

  const abilityMult = total('melee.damageAbilityMult') || 1
  const abilityDamage = modifier(damageAbilityScore(total, keys)) * abilityMult
  const flatDamage = total('melee.damage')
  const damageBonus = flatDamage + abilityDamage

  const baseDamage = weaponDice + damageBonus

  // Melee Power scales the whole swing (V2 applies it after the multiplier).
  const powerMult = 1 + total('melee.power') / 100
  // Sneak dice are flat on a crit — DDO does not multiply them.
  const sneak = (total('melee.sneakDice') + total('melee.sneakAttack')) * 3.5

  const normalHit = (baseDamage + sneak) * powerMult
  const critFor = (mult: number) => (baseDamage * mult + crit.critOnlyDamage + sneak) * powerMult
  const critStandard = critFor(crit.multiplier)
  const crit19to20 = critFor(crit.multiplier19to20)

  const nonCritFaces = 20 - crit.threatFaces
  const perSwing = (
    nonCritFaces * normalHit
    + crit.facesStandard * critStandard
    + crit.faces19to20 * crit19to20
  ) / 20

  return {
    weaponDice,
    damageBonus,
    abilityDamage,
    baseDamage,
    normalHit,
    critStandard,
    crit19to20,
    perSwing,
    critUplift: normalHit > 0 ? perSwing / normalHit : 1,
    crit,
  }
}

/** Derived combat stat keys, exposed through `stats.total()` / Analysis. */
export const DERIVED_DAMAGE_KEYS = [
  'damage.perSwing',
  'damage.normalHit',
  'damage.crit',
  'damage.crit19to20',
  'crit.threatFaces',
  'crit.chance',
  'crit.multiplier',
  'crit.multiplier19to20',
] as const

/**
 * Compute every derived combat stat for a build, keyed for `stats.total()`.
 * Kept as plain numbers so the optimizer scores them exactly like any other
 * stat and the Analysis rows read them the same way.
 */
export function derivedCombatStats(
  total: Total,
  keys: string[],
  weapon?: WeaponInfo | null,
): Map<string, number> {
  const dmg = expectedDamage(total, keys, weapon)
  return new Map<string, number>([
    ['damage.perSwing', dmg.perSwing],
    ['damage.normalHit', dmg.normalHit],
    ['damage.crit', dmg.critStandard],
    ['damage.crit19to20', dmg.crit19to20],
    ['crit.threatFaces', dmg.crit.threatFaces],
    ['crit.chance', dmg.crit.critChance * 100],
    ['crit.multiplier', dmg.crit.multiplier],
    ['crit.multiplier19to20', dmg.crit.multiplier19to20],
  ])
}

/** Convenience wrapper for callers holding a whole `BuildStats`. */
export function expectedDamageFor(stats: BuildStats): ExpectedDamage {
  return expectedDamage(k => stats.total(k), stats.keys(), stats.weapon)
}

/**
 * Wrap an assembled `BuildStats` so the derived combat stats answer to
 * `total()` / `resolve()` / `keys()` like any other stat.
 *
 * Both the pure `computeBuildStats` (what the optimizer scores) and the React
 * hook go through here, so a build's damage number is identical whether it is
 * being displayed or being optimized.
 */
export function withDerivedCombatStats(base: BuildStats): BuildStats {
  const derived = derivedCombatStats(base.total, base.keys(), base.weapon)
  return {
    ...base,
    total: (key: string) => derived.get(key) ?? base.total(key),
    resolve: (key: string) => {
      const value = derived.get(key)
      if (value === undefined) return base.resolve(key)
      // Derived rows have no bonus chain of their own — they are a function of
      // the stats that DO, so point the reader at the computation.
      return {
        total: value,
        bonuses: [{ value, type: 'Computed', source: 'Weapon + crit profile', active: true }],
      }
    },
    keys: () => [...base.keys(), ...derived.keys()],
  }
}
