/**
 * Per-weapon-class effects (V2 BreakdownItemWeaponAttackBonus.cpp:233-279,
 * BreakdownItemWeaponDamageBonus.cpp:157-205, CriticalThreatRange/Multiplier):
 * applied only when the wielded weapon is a member of the named class
 * (Build::IsWeaponInGroup). Previously the whole family returned [].
 */

import { describe, it, expect } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

function ctx(extra: Partial<EffectContext> = {}): EffectContext {
  return {
    race: 'Human', alignment: 'True Neutral',
    classLevels: {}, baseClassLevels: {}, totalLevel: 20,
    feats: new Set(), enhancements: new Set(),
    abilityTotals: {}, stances: new Set(), bab: 20,
    weaponTypes: new Set(['Quarterstaff']),
    weaponClassMain: new Set(['Melee', 'Two Handed', 'Quarterstaff']),
    ...extra,
  }
}

const mk = (e: Record<string, unknown>) => e as unknown as Effect

describe('weapon-class gated effects', () => {
  it('WeaponAttackBonusClass applies when the main weapon is in the class', () => {
    const eff = mk({ Type: 'WeaponAttackBonusClass', Bonus: 'Enhancement', AType: 'Simple', Amount: { '#text': 3 }, Item: ['Melee'] })
    const out = parseEffect(eff, 1, 't', 0, 0, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.toHit')
    expect(out[0].value).toBe(3)
  })

  it('does not apply for a non-member class, or without weapon context', () => {
    const eff = mk({ Type: 'WeaponDamageBonusClass', Bonus: 'Enhancement', AType: 'Simple', Amount: { '#text': 2 }, Item: ['Ranged'] })
    expect(parseEffect(eff, 1, 't', 0, 0, ctx())).toEqual([])
    expect(parseEffect(eff, 1, 't', 0, 0, undefined)).toEqual([])
  })

  it('multi-Type attack+damage class combos expand and gate per type', () => {
    const eff = mk({ Type: ['WeaponAttackBonusClass', 'WeaponDamageBonusClass'], Bonus: 'Enhancement', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Quarterstaff'] })
    const out = parseEffect(eff, 1, 't', 0, 0, ctx())
    expect(out.map(o => o.statKey).sort()).toEqual(['melee.damage', 'melee.toHit'])
  })

  it('crit range / multiplier / crit damage route to the combat keys', () => {
    const range = mk({ Type: 'WeaponCriticalRangeClass', Bonus: 'Competence', AType: 'Simple', Amount: { '#text': 2 }, Item: ['Melee'] })
    const mult = mk({ Type: 'WeaponCriticalMultiplierClass', Bonus: 'Competence', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Simple'] })
    const critDmg = mk({ Type: 'WeaponDamageBonusCriticalClass', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 4 }, Item: ['Two Handed'] })
    expect(parseEffect(range, 1, 't', 0, 0, ctx())[0].statKey).toBe('melee.crit.range')
    expect(parseEffect(mult, 1, 't', 0, 0, ctx())).toEqual([]) // 'Simple' not in member set
    expect(parseEffect(critDmg, 1, 't', 0, 0, ctx())[0].statKey).toBe('melee.crit.damage')
  })

  it('Weapon_Enchantment(Class) pools in weapon.enchantMain (fed to attack AND damage by buildStats)', () => {
    // V2 pools weapon enchantment in its own per-weapon sub-breakdown
    // (Breakdown_WeaponEnchantment) whose TOTAL then feeds the attack and
    // damage lines as one entry; buildStats composes that from this key.
    const ench = mk({ Type: 'Weapon_Enchantment', Bonus: 'Enhancement', AType: 'Simple', Amount: { '#text': 1 }, Item: ['All'] })
    expect(parseEffect(ench, 1, 't', 0, 0, ctx()).map(o => o.statKey)).toEqual(['weapon.enchantMain'])
    const enchC = mk({ Type: 'Weapon_EnchantmentClass', Bonus: 'Enhancement', AType: 'Simple', Amount: { '#text': 2 }, Item: ['Two Handed'] })
    expect(parseEffect(enchC, 1, 't', 0, 0, ctx()).map(o => o.statKey)).toEqual(['weapon.enchantMain'])
  })

  it('Weapon_BaseDamage adds +W only for the wielded weapon type', () => {
    const w = mk({ Type: 'Weapon_BaseDamage', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Quarterstaff', 'Dagger'] })
    expect(parseEffect(w, 1, 't', 0, 0, ctx())[0].statKey).toBe('weapon.bonusW')
    expect(parseEffect(w, 1, 't', 0, 0, ctx({ weaponTypes: new Set(['Longbow']) }))).toEqual([])
  })

  it('Weapon_AttackAbility emits the ability candidate marker for the weapon type', () => {
    const eff = mk({ Type: 'Weapon_AttackAbility', Bonus: 'Feat', AType: 'NotNeeded', Item: ['Charisma', 'Quarterstaff', 'Dagger'] })
    const out = parseEffect(eff, 1, 't', 0, 0, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.attackAbility.Charisma')
  })
})
