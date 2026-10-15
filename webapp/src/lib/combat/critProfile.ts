// The wielded weapon's critical profile — one source of truth for threat range
// and multipliers.
//
// Crit bonuses arrive on FOUR different stat keys, and every consumer used to
// read a different subset:
//
//   weapon.threatRange           Improved Critical (feat)
//   melee.crit.range             Weapon_CriticalRange effects, Keen
//   melee.crit.multiplier        Weapon_CriticalMultiplier (e.g. Dragonlord +2)
//   weapon.critMultiplier19to20  Weapon_CriticalMultiplier19To20
//
// The Analysis breakdown showed the weapon's base multiplier only (so a
// Dragonlord's +2 was invisible) and counted just the feat half of the threat
// range; the Combat panel counted the other half. Both now go through here.

import type { WeaponInfo } from '../buildStats'

export interface CritProfile {
  /** Threat faces on the weapon itself: 1 = "20", 3 = "18-20". */
  baseThreatFaces: number
  /** Extra threat faces from feats (Improved Critical) and effects (Keen, …). */
  bonusThreatFaces: number
  /** Total faces that threaten a critical, capped at 20. */
  threatFaces: number
  /** Lowest d20 face that threatens — 16 for a 16-20 weapon. */
  lowestThreatFace: number
  /** "16–20", or "20" when only a natural 20 threatens. */
  threatDisplay: string
  /** Share of d20 faces that threaten: 5 faces → 0.25. */
  critChance: number
  /** The weapon's own multiplier. */
  baseMultiplier: number
  /** Added by effects (Weapon_CriticalMultiplier). */
  bonusMultiplier: number
  /** Multiplier applied on threat faces below 19. */
  multiplier: number
  /** Extra multiplier that applies only on a natural 19-20. */
  bonus19to20: number
  /** Multiplier applied on a natural 19 or 20. */
  multiplier19to20: number
  /** Faces (at most 2) that use the 19-20 multiplier. */
  faces19to20: number
  /** Faces that use the standard multiplier. */
  facesStandard: number
  /** Flat damage added only on a confirmed critical. */
  critOnlyDamage: number
}

type Total = (key: string) => number

/**
 * True for a weapon wielded in the off-hand slot, which V2 gives its own crit
 * lines. Handwraps standing in for the off hand use the main hand's.
 */
export function isOffhandSlotWeapon(weapon?: WeaponInfo | null): boolean {
  return weapon?.slot === 'Off Hand' || weapon?.slot === 'Weapon2' || weapon?.slot === 'OffHand'
}

/**
 * Stat key of the off-hand weapon's enhancement line. V2 feeds a shield's
 * line from ShieldEnchantment effects and any other weapon's from
 * Weapon_Enchantment (BreakdownItemWeapon m_weaponEnchantment).
 */
export function offhandEnchantKey(weapon?: WeaponInfo | null): string {
  const shield = ['Buckler', 'Small Shield', 'Large Shield', 'Tower Shield'].includes(weapon?.weaponType ?? '')
  return shield ? 'offhand.shieldEnchant' : 'offhand.enchant'
}

/**
 * Resolve the effective critical profile of the wielded weapon.
 *
 * With no weapon equipped the caller is unarmed: DDO's unarmed profile is a
 * natural 20 threat at ×2, which is also `WeaponInfo`'s default.
 */
export function critProfile(
  total: Total,
  weapon?: WeaponInfo | null,
  opts: { offhand?: boolean } = {},
): CritProfile {
  // V2 gives a wielded off-hand weapon its own lines
  // (BreakdownItemWeaponEffects): the item's base range and multiplier arrive
  // as Base bonuses in the offhand.crit.* pools (none for a rune arm), with
  // only the effects that name the off-hand weapon.
  if (opts.offhand) {
    const bonusThreatFaces = total('offhand.crit.range')
    const threatFaces = Math.max(1, Math.min(20, bonusThreatFaces))
    const multiplier = total('offhand.crit.multiplier')
    const bonus19to20 = total('offhand.crit.multiplier19to20')
    return finishProfile(0, bonusThreatFaces, threatFaces, 0, multiplier, bonus19to20,
      total('melee.crit.damage'))
  }

  const baseThreatFaces = Math.max(1, weapon?.critThreatRange ?? 1)
  // Both keys are real sources of extra threat faces; counting one and not the
  // other is what made Improved Critical and Keen disagree between panels.
  const bonusThreatFaces = total('weapon.threatRange') + total('melee.crit.range')
  const threatFaces = Math.max(1, Math.min(20, baseThreatFaces + bonusThreatFaces))

  const baseMultiplier = weapon?.critMultiplier ?? 2
  const bonusMultiplier = total('melee.crit.multiplier')

  // V2 seeds the 19-20 multiplier with the standard one and stacks 19-20-only
  // effects on top (BreakdownItemWeaponCriticalMultiplier.cpp:52-66).
  const bonus19to20 = total('weapon.critMultiplier19to20')
  return finishProfile(baseThreatFaces, bonusThreatFaces, threatFaces, baseMultiplier,
    bonusMultiplier, bonus19to20, total('melee.crit.damage'))
}

function finishProfile(
  baseThreatFaces: number,
  bonusThreatFaces: number,
  threatFaces: number,
  baseMultiplier: number,
  bonusMultiplier: number,
  bonus19to20: number,
  critOnlyDamage: number,
): CritProfile {
  const multiplier = baseMultiplier + bonusMultiplier
  const multiplier19to20 = multiplier + bonus19to20

  // DDO applies the 19-20 multiplier only on a natural 19 or 20; faces below
  // that (17-18 on a keened falchion) use the standard multiplier.
  const faces19to20 = Math.min(2, threatFaces)
  const facesStandard = threatFaces - faces19to20

  const lowestThreatFace = 21 - threatFaces

  return {
    baseThreatFaces,
    bonusThreatFaces,
    threatFaces,
    lowestThreatFace,
    threatDisplay: threatFaces > 1 ? `${lowestThreatFace}–20` : '20',
    critChance: threatFaces / 20,
    baseMultiplier,
    bonusMultiplier,
    multiplier,
    bonus19to20,
    multiplier19to20,
    faces19to20,
    facesStandard,
    critOnlyDamage,
  }
}
