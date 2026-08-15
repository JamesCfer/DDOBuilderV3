// The wielded weapon's crit profile, and the expected-damage number the
// optimizer maximises when asked for "damage".
//
// Crit bonuses arrive on four separate stat keys and each consumer used to read
// a different subset: Analysis showed the weapon's base multiplier only (a
// Dragonlord's +2 was invisible) and counted only the feat half of the threat
// range, while Combat counted only the effect half.

import { describe, it, expect } from 'vitest'
import { critProfile } from '../lib/combat/critProfile'
import { expectedDamage, derivedCombatStats } from '../lib/combat/expectedDamage'
import type { WeaponInfo } from '../lib/buildStats'

const weapon = (over: Partial<WeaponInfo> = {}): WeaponInfo => ({
  name: 'Handwraps', weaponType: 'Handwraps',
  diceNum: 1, diceSides: 6, critThreatRange: 1, critMultiplier: 2,
  ...over,
} as WeaponInfo)

/** Stat totals from a plain object, everything else zero. */
const totals = (map: Record<string, number>) => (key: string) => map[key] ?? 0

describe('critProfile', () => {
  it('counts BOTH threat-range keys — Improved Critical and Keen alike', () => {
    const p = critProfile(totals({
      'weapon.threatRange': 2,   // Improved Critical
      'melee.crit.range': 1,     // Keen / item effect
    }), weapon({ critThreatRange: 2 }))   // 19-20 weapon
    expect(p.threatFaces).toBe(5)
    expect(p.threatDisplay).toBe('16–20')
    expect(p.critChance).toBeCloseTo(0.25)
  })

  it('adds effect multipliers to the weapon (Dragonlord +2)', () => {
    const p = critProfile(totals({ 'melee.crit.multiplier': 2 }), weapon({ critMultiplier: 2 }))
    expect(p.baseMultiplier).toBe(2)
    expect(p.bonusMultiplier).toBe(2)
    expect(p.multiplier).toBe(4)
  })

  it('stacks the 19-20 multiplier on top of the standard one', () => {
    const p = critProfile(totals({
      'melee.crit.multiplier': 2,
      'weapon.critMultiplier19to20': 2,
    }), weapon())
    expect(p.multiplier).toBe(4)
    expect(p.multiplier19to20).toBe(6)
  })

  it('splits threat faces so only naturals 19-20 use the higher multiplier', () => {
    // Handwraps critting 16-20: 16/17/18 at the standard multiplier, 19/20 higher.
    const p = critProfile(totals({ 'weapon.threatRange': 4 }), weapon())
    expect(p.threatFaces).toBe(5)
    expect(p.facesStandard).toBe(3)
    expect(p.faces19to20).toBe(2)
  })

  it('never threatens on more than 20 faces, or fewer than 1', () => {
    expect(critProfile(totals({ 'melee.crit.range': 99 }), weapon()).threatFaces).toBe(20)
    expect(critProfile(totals({ 'melee.crit.range': -99 }), weapon()).threatFaces).toBe(1)
  })

  it('falls back to the unarmed profile with no weapon', () => {
    const p = critProfile(totals({}), null)
    expect(p.threatFaces).toBe(1)
    expect(p.threatDisplay).toBe('20')
    expect(p.multiplier).toBe(2)
  })
})

describe('expectedDamage', () => {
  // The reported example: handwraps critting 16-20 (25%), ×4 multiplier with
  // ×6 on 19-20.
  const handwrapStats = {
    'weapon.threatRange': 4,          // 20 → 16-20
    'melee.crit.multiplier': 2,       // ×2 base → ×4
    'weapon.critMultiplier19to20': 2, // → ×6 on 19-20
    'melee.damage': 20,
    'ability.Strength': 30,           // +10 modifier
  }

  it('builds the swing from dice + damage, exactly as DDO does', () => {
    const d = expectedDamage(totals(handwrapStats), Object.keys(handwrapStats), weapon())
    expect(d.weaponDice).toBe(3.5)          // 1d6
    expect(d.abilityDamage).toBe(10)        // (30-10)/2
    expect(d.damageBonus).toBe(30)          // 20 flat + 10 ability
    expect(d.baseDamage).toBe(33.5)
    expect(d.normalHit).toBe(33.5)
  })

  it('multiplies only the crit, at the multiplier for that face', () => {
    const d = expectedDamage(totals(handwrapStats), Object.keys(handwrapStats), weapon())
    expect(d.critStandard).toBe(33.5 * 4)
    expect(d.crit19to20).toBe(33.5 * 6)
  })

  it('averages over the d20: 15 normal faces, 3 at ×4, 2 at ×6', () => {
    const d = expectedDamage(totals(handwrapStats), Object.keys(handwrapStats), weapon())
    const expected = (15 * 33.5 + 3 * 33.5 * 4 + 2 * 33.5 * 6) / 20
    expect(d.perSwing).toBeCloseTo(expected, 6)
    expect(d.perSwing).toBeCloseTo(65.325, 3)
    // Crits are worth nearly double this build's damage.
    expect(d.critUplift).toBeCloseTo(1.95, 2)
  })

  it('adds crit-only damage on crits and never on a normal hit', () => {
    const withCritDmg = { ...handwrapStats, 'melee.crit.damage': 50 }
    const d = expectedDamage(totals(withCritDmg), Object.keys(withCritDmg), weapon())
    expect(d.normalHit).toBe(33.5)
    expect(d.critStandard).toBe(33.5 * 4 + 50)
    expect(d.crit19to20).toBe(33.5 * 6 + 50)
  })

  it('scales the whole swing by Melee Power', () => {
    const base = expectedDamage(totals(handwrapStats), Object.keys(handwrapStats), weapon())
    const powered = { ...handwrapStats, 'melee.power': 100 }
    const d = expectedDamage(totals(powered), Object.keys(powered), weapon())
    expect(d.perSwing).toBeCloseTo(base.perSwing * 2, 6)
  })

  it('counts extra W dice', () => {
    const withW = { ...handwrapStats, 'weapon.bonusW': 1 }
    const d = expectedDamage(totals(withW), Object.keys(withW), weapon())
    expect(d.weaponDice).toBe(7)   // 2d6
  })

  it('uses the highest ability an effect names for damage, not just Strength', () => {
    const finesse = {
      'melee.damageAbility.Dexterity': 1,
      'ability.Strength': 10,
      'ability.Dexterity': 40,
    }
    const d = expectedDamage(totals(finesse), Object.keys(finesse), weapon())
    expect(d.abilityDamage).toBe(15)   // (40-10)/2
  })

  it('weighs a bigger multiplier against a bigger flat bonus by crit frequency', () => {
    // The judgement the optimizer could not make before this number existed:
    // +2 crit multiplier vs +10 flat damage is not a fixed winner, it depends
    // on how often the build crits.
    const swing = (over: Record<string, number>) => {
      const map = { ...handwrapStats, ...over }
      return expectedDamage(totals(map), Object.keys(map), weapon()).perSwing
    }
    // Crits on 16-20 (25%): the flat bonus applies to every hit and wins.
    expect(swing({ 'melee.damage': 30 })).toBeGreaterThan(swing({ 'melee.crit.multiplier': 4 }))
    // Crits on 12-20 (45%): the multiplier now compounds often enough to win.
    expect(swing({ 'weapon.threatRange': 8, 'melee.crit.multiplier': 4 }))
      .toBeGreaterThan(swing({ 'weapon.threatRange': 8, 'melee.damage': 30 }))
  })
})

describe('derivedCombatStats', () => {
  it('exposes the damage and crit numbers as ordinary stat keys', () => {
    const map = {
      'weapon.threatRange': 4,
      'melee.crit.multiplier': 2,
      'weapon.critMultiplier19to20': 2,
      'melee.damage': 20,
      'ability.Strength': 30,
    }
    const derived = derivedCombatStats(totals(map), Object.keys(map), weapon())
    expect(derived.get('crit.threatFaces')).toBe(5)
    expect(derived.get('crit.chance')).toBeCloseTo(25)
    expect(derived.get('crit.multiplier')).toBe(4)
    expect(derived.get('crit.multiplier19to20')).toBe(6)
    expect(derived.get('damage.perSwing')).toBeCloseTo(65.325, 3)
  })
})
