import { describe, expect, it } from 'vitest'
import { buildAttackEntry } from '../lib/combat/attackEntry'
import type { BuildStats, WeaponInfo } from '../hooks/useBuildStats'
import type { ResolvedStat } from '../lib/bonus'

function makeStats(map: Record<string, number>): BuildStats {
  return {
    resolve: (k: string): ResolvedStat => ({ total: map[k] ?? 0, bonuses: [] }),
    total: (k: string) => map[k] ?? 0,
    keys: () => Object.keys(map),
    weapon: null,
    armorMaxDex: null,
  }
}

const falchion: WeaponInfo = {
  name: 'Falchion',
  slot: 'Weapon1',
  diceNum: 2,
  diceSides: 4,
  critThreatRange: 3,         // 18-20 threat
  critMultiplier: 2,
  attackModifier: 'Strength',
}

describe('buildAttackEntry', () => {
  it('produces a deterministic positive DPR for a basic Fighter swing', () => {
    const stats = makeStats({
      'melee.toHit': 3,
      'melee.damage': 5,
      'melee.power': 50,
    })
    // STR 22 (mod +6) + BAB 20 + melee.toHit +3 = +29. Against an easier AC.
    const r = buildAttackEntry(stats, falchion, 22, 20, {
      foeAC: 25,
      twoHanded: true,
    })
    expect(r.totalDPR).toBeGreaterThan(0)
    expect(r.dps).toBeGreaterThan(0)
    expect(r.hitChance).toBeCloseTo(0.95, 2) // bonus +29 vs AC 25 → caps at 0.95
    expect(r.critChance).toBeGreaterThan(0)
  })

  it('hit chance saturates at 0.95 for very high attack bonuses', () => {
    const stats = makeStats({})
    const r = buildAttackEntry(stats, falchion, 30, 30, { foeAC: 0 })
    expect(r.hitChance).toBeCloseTo(0.95, 2)
  })

  it('hit chance bottoms out at 0.05 for impossible attacks', () => {
    const stats = makeStats({})
    const r = buildAttackEntry(stats, falchion, 8, 0, { foeAC: 999 })
    expect(r.hitChance).toBeCloseTo(0.05, 2)
  })

  it('helpless damage multiplier applies when helpless flag set', () => {
    const stats = makeStats({ helpless: 50 })
    const a = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25 })
    const b = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25, helpless: true })
    expect(b.totalDPR).toBeGreaterThan(a.totalDPR * 1.4) // ~×1.5 factor
  })

  it('PRR mitigation reduces total DPR', () => {
    const stats = makeStats({})
    const a = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25 })
    const b = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25, foePRR: 100 })
    expect(b.totalDPR).toBeLessThan(a.totalDPR)
    expect(b.totalDPR).toBeCloseTo(a.totalDPR * 0.5, 1)
  })

  it('doublestrike adds expected damage proportionally', () => {
    const a = buildAttackEntry(makeStats({}), falchion, 18, 10, { foeAC: 25 })
    const b = buildAttackEntry(
      makeStats({ 'melee.doublestrike': 50 }), falchion, 18, 10, { foeAC: 25 },
    )
    expect(b.totalDPR).toBeGreaterThan(a.totalDPR * 1.4)
  })

  // ---- Gap 1: separate 19-20 critical multiplier ----
  // V2 BreakdownItemWeaponCriticalMultiplier.cpp: the 19-20 multiplier seeds
  // itself with the standard multiplier and stacks 19-20-only effects on top.
  it('applies a 19-20 crit multiplier only to the 19-20 threat faces', () => {
    // 19-20 weapon (critThreatRange 2 = faces 19,20). With a +1 19-20 multiplier
    // bonus, every threat face benefits (both faces lie in 19-20).
    const narrow: WeaponInfo = { ...falchion, critThreatRange: 2 }
    const base = buildAttackEntry(makeStats({}), narrow, 18, 20, { foeAC: 10 })
    const boosted = buildAttackEntry(
      makeStats({ 'weapon.critMultiplier19to20': 1 }), narrow, 18, 20, { foeAC: 10 },
    )
    expect(boosted.critDamage).toBeGreaterThan(base.critDamage)

    // 17-20 weapon (critThreatRange 4): only 2 of the 4 threat faces (19,20) get
    // the bonus, so the average crit damage rises by less than the narrow case.
    const wide: WeaponInfo = { ...falchion, critThreatRange: 4 }
    const wideBase = buildAttackEntry(makeStats({}), wide, 18, 20, { foeAC: 10 })
    const wideBoost = buildAttackEntry(
      makeStats({ 'weapon.critMultiplier19to20': 1 }), wide, 18, 20, { foeAC: 10 },
    )
    const narrowGain = boosted.critDamage - base.critDamage
    const wideGain = wideBoost.critDamage - wideBase.critDamage
    // Narrow: all faces boosted; wide: half the faces → ~half the gain.
    expect(wideGain).toBeCloseTo(narrowGain / 2, 4)
  })

  // ---- Gap 2: crit-only damage bonus ----
  // V2 BreakdownItemWeaponDamageBonus.cpp:184-202: `*Critical` damage effects
  // land only on a confirmed crit.
  it('adds melee.crit.damage to crit damage but not to normal hit damage', () => {
    const a = buildAttackEntry(makeStats({}), falchion, 18, 20, { foeAC: 10 })
    const b = buildAttackEntry(
      makeStats({ 'melee.crit.damage': 10 }), falchion, 18, 20, { foeAC: 10 },
    )
    // Normal hit damage unchanged; crit damage rises by exactly +10 (mult 1.0).
    expect(b.hitDamage).toBeCloseTo(a.hitDamage, 6)
    expect(b.critDamage).toBeCloseTo(a.critDamage + 10, 6)
  })

  // ---- Gap 3: off-hand doublestrike ----
  // V2 BreakdownItemOffhandDoublestrike.cpp:44-77: the 50%-of-main-hand
  // (65% with Perfect TWF) derived base now lives in buildStats phase 2.5, so
  // attackEntry consumes the `offhand.doublestrike` stat total directly.
  it('scales off-hand DPR by the offhand.doublestrike stat total', () => {
    const noDs = buildAttackEntry(makeStats({}), falchion, 18, 20, {
      foeAC: 10, offhand: falchion, twoWeaponFightingTier: 2,
    })
    const plain = buildAttackEntry(makeStats({ 'offhand.doublestrike': 50 }), falchion, 18, 20, {
      foeAC: 10, offhand: falchion, twoWeaponFightingTier: 2,
    })
    const perfect = buildAttackEntry(makeStats({ 'offhand.doublestrike': 65 }), falchion, 18, 20, {
      foeAC: 10, offhand: falchion, twoWeaponFightingTier: 2,
    })
    // Off-hand DPR scales by the (1 + off-hand doublestrike) factor...
    expect(plain.offhandDPR).toBeCloseTo(noDs.offhandDPR * 1.5, 4)
    // ...up to the 60% off-hand ceiling. Perfect Two Weapon Fighting derives
    // 65% OF the main hand's doublestrike, so a build whose derived total lands
    // above 60% is clamped there rather than scaling by 1.65.
    expect(perfect.offhandDPR).toBeCloseTo(noDs.offhandDPR * 1.6, 4)
  })

  // ---- Gap 4: fortification downgrades crits to normal hits ----
  it('fortification converts a fraction of crits to normal hits', () => {
    const stats = makeStats({})
    // No off-hand & no PRR ⇒ totalDPR == mainDPR, so per-swing scaling is exact.
    const none = buildAttackEntry(stats, falchion, 18, 20, { foeAC: 10 })
    const full = buildAttackEntry(stats, falchion, 18, 20, { foeAC: 10, foeFortification: 100 })
    const half = buildAttackEntry(stats, falchion, 18, 20, { foeAC: 10, foeFortification: 50 })
    const { hitChance: h, critChance: c, hitDamage: hd, critDamage: cd } = none
    const perSwingNoFort = (h - c) * hd + c * cd
    // 100% fort: every crit deals hitDamage instead of critDamage.
    const perSwingFullFort = h * hd
    expect(full.totalDPR).toBeCloseTo(none.totalDPR * (perSwingFullFort / perSwingNoFort), 4)
    // 50% fort sits exactly halfway in expected per-swing damage.
    const perSwingHalf = (h - c * 0.5) * hd + c * 0.5 * cd
    expect(half.totalDPR).toBeCloseTo(none.totalDPR * (perSwingHalf / perSwingNoFort), 4)
    expect(full.totalDPR).toBeLessThan(none.totalDPR)
  })
})

const handwraps: WeaponInfo = {
  name: 'Handwraps', slot: 'Weapon1', diceNum: 1, diceSides: 6,
  critThreatRange: 1, critMultiplier: 2, weaponType: 'Handwraps',
  attackModifier: 'Strength',
} as WeaponInfo

describe('unarmed off-hand strikes', () => {
  it('takes no two-weapon penalty when the off hand IS the handwraps', () => {
    const stats = makeStats({ 'melee.damage': 10 })
    const armed = buildAttackEntry(stats, falchion, 20, 20, {
      foeAC: 30, offhand: falchion, twoWeaponFightingTier: 1,
    })
    const unarmed = buildAttackEntry(stats, handwraps, 20, 20, {
      foeAC: 30, offhand: handwraps, twoWeaponFightingTier: 1,
    })
    // Dual-wielding two weapons costs to-hit; striking with both fists does not.
    const solo = buildAttackEntry(stats, handwraps, 20, 20, { foeAC: 30 })
    expect(unarmed.hitChance).toBeCloseTo(solo.hitChance, 6)
    expect(armed.hitChance).toBeLessThan(solo.hitChance)
  })
})

describe('doublestrike caps at 100%', () => {
  const swing = (doublestrike: number) => {
    const stats = makeStats({ 'melee.damage': 10, 'melee.doublestrike': doublestrike })
    return buildAttackEntry(stats, falchion, 20, 20, { foeAC: 10, twoHanded: true }).mainDPR
  }

  it('adds its own percentage below the cap', () => {
    expect(swing(50)).toBeCloseTo(swing(0) * 1.5, 6)
  })

  it('caps the off-hand doublestrike at 60%', () => {
    const dpr = (offhandDs: number) => buildAttackEntry(
      makeStats({ 'melee.damage': 10, 'offhand.doublestrike': offhandDs }),
      falchion, 20, 20,
      { foeAC: 10, offhand: falchion, twoWeaponFightingTier: 4 },
    ).offhandDPR
    expect(dpr(90)).toBeCloseTo(dpr(60), 6)
    expect(dpr(30)).toBeLessThan(dpr(60))
  })

  it('stops at double — a swing cannot happen a third time', () => {
    expect(swing(100)).toBeCloseTo(swing(0) * 2, 6)
    // Anything past 100% is wasted rather than compounding: 250% doublestrike
    // used to report 3.5× the damage of a single swing.
    expect(swing(250)).toBeCloseTo(swing(0) * 2, 6)
    expect(swing(250)).toBe(swing(100))
  })
})
