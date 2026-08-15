// V3 V2-parity DPS calculator.
//
// Mirrors the field gathering of V2 DDOBuilder/AttackEntry.cpp:44-81 and the
// per-swing damage formulas of Attack.cpp / AttackChain.cpp.
//
// The function is pure (consumes a stats map + weapon info) so it can be unit
// tested independently of React.

import type { BuildStats, WeaponInfo } from '../../hooks/useBuildStats'
import { critProfile } from './critProfile'

export interface AttackEntryOptions {
  offhand?: WeaponInfo | null
  helpless?: boolean
  /** Foe AC. Used to estimate hit chance. */
  foeAC: number
  /** Foe PRR (percentage damage reduction). */
  foePRR?: number
  /** Foe fortification (0-100). Reduces crit damage proportionally. */
  foeFortification?: number
  /** Optional override of attack-chain length per round. Defaults to 5. */
  attacksPerRound?: number
  /** True if both hands are filled and TWF feats grant offhand attacks. */
  twoWeaponFightingTier?: 0 | 1 | 2 | 3 | 4
  /** True for two-handed weapons (THF / Strikethrough). */
  twoHanded?: boolean
  /** Off-hand weapon is a light weapon (reduces TWF attack penalty by 2). */
  offhandIsLight?: boolean
  /** Oversized Two Weapon Fighting feat trained (reduces TWF penalty by 2). */
  oversizedTwf?: boolean
  /** Character is non-proficient with the main-hand weapon (−4 to-hit). */
  nonProficient?: boolean
}

export interface AttackEntryResult {
  /** Per-round average main-hand damage (before fortification mitigation). */
  mainDPR: number
  /** Per-round average off-hand damage. */
  offhandDPR: number
  /** Per-round expected total damage incl. fortification mitigation. */
  totalDPR: number
  /** DPS (per second) assuming 1.5 attacks/sec baseline (V2 typical). */
  dps: number
  /** Probability that a single attack lands a hit. */
  hitChance: number
  /** Probability that a single attack confirms a critical hit. */
  critChance: number
  /** Average non-crit damage for a single hit. */
  hitDamage: number
  /** Average critical-hit damage for a single confirmed crit. */
  critDamage: number
}

const TWF_OFFHAND_CHANCE = [0, 0.20, 0.40, 0.60, 0.80, 1.00] // tier 0..4 (Perfect = 100%)

function avgDie(diceNum: number, diceSides: number): number {
  return diceNum * (diceSides + 1) / 2
}

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Estimates the chance to hit a foe with the given AC, given attack bonus.
 * V2 simulates a d20 roll; minimum hit on natural 2 (auto miss on 1).
 * Returns a value in [0.05, 0.95].
 */
function hitChanceVsAC(attackBonus: number, foeAC: number): number {
  const minRoll = Math.max(2, Math.min(20, foeAC - attackBonus))
  // Faces 2..20 inclusive → 19 faces on a d20 are valid (face 1 always misses)
  const validRolls = 21 - minRoll
  const chance = Math.max(0.05, Math.min(0.95, validRolls / 20))
  return chance
}

/** PRR-style damage mitigation: actualDmg = base * 100 / (100 + PRR). */
function applyPRR(damage: number, foePRR: number): number {
  if (foePRR <= 0) return damage
  return damage * (100 / (100 + foePRR))
}

/**
 * Computes a single attack-entry result. Reads bonus stats by key from
 * `stats.total(...)` so that any V2-parity bonus chain plugs straight in.
 */
export function buildAttackEntry(
  stats: BuildStats,
  weapon: WeaponInfo,
  abilityScore: number,
  bab: number,
  opts: AttackEntryOptions,
): AttackEntryResult {
  const meleePower = stats.total('melee.power')
  const meleePowerMult = 1 + meleePower / 100
  const doublestrike = stats.total('melee.doublestrike') / 100
  const damageAbilMult = stats.total('melee.damageAbilityMult') || 1
  const helplessDmg = stats.total('helpless') / 100
  const strikethrough = stats.total('melee.strikethrough') / 100
  const offhandAttackBonus = stats.total('offhand.attack') / 100
  const offhandDoublestrike = stats.total('offhand.doublestrike') / 100
  const meleeToHit = stats.total('melee.toHit') + stats.total('melee.attack')
  const meleeDamage = stats.total('melee.damage')
  // Threat range and both multipliers come from critProfile so this agrees with
  // the Analysis breakdown — reading only `melee.crit.range` here dropped
  // Improved Critical, which arrives on `weapon.threatRange`.
  const crit = critProfile(k => stats.total(k), weapon)
  const critOnlyDamage = crit.critOnlyDamage
  const sneakDice = stats.total('melee.sneakDice') + stats.total('melee.sneakAttack')

  const abilityMod = modifier(abilityScore)
  // Effect_Weapon_BaseDamage: extra base damage dice (+W) for the wielded
  // weapon type (gated in effectParser against ctx.weaponTypes).
  const bonusW = stats.total('weapon.bonusW')
  const weaponDie = avgDie(weapon.diceNum + bonusW, weapon.diceSides)
  const baseDamage = weaponDie + meleeDamage + abilityMod * damageAbilMult
  const sneakBonus = sneakDice * 3.5 // 1d6 = 3.5
  const hitDmgRaw = (baseDamage + sneakBonus) * meleePowerMult

  // V2 BreakdownItemWeaponAttackBonus.cpp:139-191. `meleeToHit` already folds
  // in BAB-independent bonuses plus the global negative-level / armor-check
  // penalties (added in useBuildStats). Here we add the weapon-specific
  // non-proficiency penalty and the per-hand Two Weapon Fighting penalties.
  const nonProfPenalty = opts.nonProficient ? -4 : 0
  const rawAttackBonus = bab + meleeToHit + abilityMod + nonProfPenalty

  // TWF attack penalty (only when dual-wielding, i.e. an off-hand is present):
  //   main hand: −4 with the TWF feat, else −6;  off hand: −4 with TWF, else −10
  //   +2 to both if the off-hand is light or Oversized TWF is trained.
  let mainTwfPenalty = 0
  let offhandTwfPenalty = 0
  if (opts.offhand) {
    const hasTwfFeat = (opts.twoWeaponFightingTier ?? 0) >= 1
    mainTwfPenalty = hasTwfFeat ? -4 : -6
    offhandTwfPenalty = hasTwfFeat ? -4 : -10
    if (opts.offhandIsLight || opts.oversizedTwf) {
      mainTwfPenalty += 2
      offhandTwfPenalty += 2
    }
  }

  const attackBonus = rawAttackBonus + mainTwfPenalty
  const hitC = hitChanceVsAC(attackBonus, opts.foeAC)

  // Crit math: threat range = (21 - critThreatRange) .. 20 (faces that threaten).
  const threatFaces = crit.threatFaces
  const critC = (threatFaces / 20) * hitC

  // V2 distinguishes the standard crit multiplier from the 19-20 multiplier
  // (BreakdownItemWeaponCriticalMultiplier.cpp). DDO applies the 19-20 multiplier
  // only on natural 19/20 rolls; lower threat faces (e.g. 17-18 on a falchion)
  // use the standard multiplier. Split the threat faces accordingly so the
  // higher 19-20 multiplier only weights the at-most-2 top faces.
  const stdMult = crit.multiplier
  const mult19to20 = crit.multiplier19to20
  const faces19to20 = crit.faces19to20 // 19 and/or 20
  const facesStd = crit.facesStandard // 17,18,... when keened past 19-20
  // Per-crit damage = (base × multiplier) + crit-only bonus; sneak is added flat
  // (DDO does not multiply sneak dice on crits).
  const critDmgForMult = (mult: number) => (baseDamage * mult + critOnlyDamage + sneakBonus) * meleePowerMult
  // Probability-weighted average crit damage across the two multiplier tiers.
  const critDmg19to20 = critDmgForMult(mult19to20)
  const critDmgStd = critDmgForMult(stdMult)
  const critDmgScaled =
    threatFaces > 0
      ? (faces19to20 * critDmg19to20 + facesStd * critDmgStd) / threatFaces
      : critDmgStd

  // Fortification (DDO mechanic): a fortified foe negates a fraction of crits,
  // downgrading them to normal hits rather than reducing crit *damage*. With
  // fortification F, a fraction F of confirmed crits deal hitDamage instead of
  // critDamage; the swing still lands. (Closed-form analogue of DDO's per-crit
  // fortification roll — overcome-fortification is not modelled.)
  const fortF = Math.min(1, Math.max(0, (opts.foeFortification ?? 0) / 100))
  const effCritC = critC * (1 - fortF) // crits that survive fortification

  // Per-attack expected damage = nonCritHits * hitDmg + crits * critDmg.
  // hit-with-surviving-crit = effCritC; every other landed swing (including
  // fortification-downgraded crits) deals hitDmg.
  const expectedRaw = (hitC - effCritC) * hitDmgRaw + effCritC * critDmgScaled
  // Doublestrike adds another swing of equal expected value
  const withDoublestrike = expectedRaw * (1 + doublestrike)
  // Strikethrough effectively scales DPS up against multi-target (THF only)
  const withStrike = opts.twoHanded ? withDoublestrike * (1 + strikethrough) : withDoublestrike
  // Helpless scales total damage
  const helplessFactor = opts.helpless ? 1 + helplessDmg : 1
  const mainDPR = withStrike * helplessFactor

  // Off-hand
  let offhandDPR = 0
  if (opts.offhand) {
    const offhandTier = opts.twoWeaponFightingTier ?? 0
    // `offhand.doublestrike` already carries V2's derived base — 50% of the
    // main-hand doublestrike, or 65% with Perfect Two Weapon Fighting
    // (BreakdownItemOffhandDoublestrike.cpp:44-77, mirrored in buildStats
    // phase 2.5) — plus any explicit DoublestrikeOffhand effects.
    const offhandDoublestrikeChance = offhandDoublestrike
    // Probability the off-hand swings at all (TWF tier proc + any attack bonus),
    // multiplied up by the off-hand doublestrike for the extra off-hand swing.
    const offhandChance =
      Math.min(1, TWF_OFFHAND_CHANCE[offhandTier] + offhandAttackBonus) *
      (1 + offhandDoublestrikeChance)
    const ohDie = avgDie(opts.offhand.diceNum, opts.offhand.diceSides)
    const ohRaw = (ohDie + meleeDamage + abilityMod * (damageAbilMult / 2) + sneakBonus) * meleePowerMult
    // Off-hand swings roll against the off-hand attack bonus (larger TWF penalty).
    const offhandHitC = hitChanceVsAC(rawAttackBonus + offhandTwfPenalty, opts.foeAC)
    offhandDPR = ohRaw * offhandHitC * offhandChance * helplessFactor
  }

  // Fortification is already applied at the per-swing expected-damage level
  // above (crit downgrade), so only PRR remains to mitigate the total.
  const totalDPR = applyPRR(mainDPR + offhandDPR, opts.foePRR ?? 0)

  const attacksPerRound = opts.attacksPerRound ?? 5
  // Heuristic: 1.5 attacks/sec baseline (V2 displays per-attack & per-second)
  const dps = totalDPR * (attacksPerRound / 6) * 1.0 // 6-second round → DPS = DPR / 6 * APR

  return {
    mainDPR,
    offhandDPR,
    totalDPR,
    dps,
    hitChance: hitC,
    critChance: critC,
    hitDamage: hitDmgRaw,
    critDamage: critDmgScaled,
  }
}
