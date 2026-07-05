import { describe, expect, it } from 'vitest'
import { parseEffect, parseItemBuff, type EffectContext } from '../lib/effectParser'
import type { Effect, ItemBuff } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human', alignment: 'True Neutral',
  classLevels: { Fighter: 20 }, baseClassLevels: { Fighter: 20 }, totalLevel: 20,
  feats: new Set(), enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(), bab: 20, weaponTypes: new Set(),
}
const mk = (Type: string, extra: Partial<Effect> = {}): Effect => ({
  Type, Amount: 1, Bonus: 'Enhancement', ...extra,
}) as Effect

describe('Audit-fix surfaced effect cases', () => {
  it('Weapon_Alacrity emits weapon.alacrity', () => {
    const out = parseEffect(mk('Weapon_Alacrity', { Amount: 10 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('weapon.alacrity')
    expect(out[0].value).toBe(10)
  })

  it('Weapon_Keen emits weapon.keen', () => {
    const out = parseEffect(mk('Weapon_Keen', { Amount: 1 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('weapon.keen')
  })

  it('Weapon_VorpalRange emits weapon.vorpalRange', () => {
    const out = parseEffect(mk('Weapon_VorpalRange', { Amount: 5 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('weapon.vorpalRange')
    expect(out[0].value).toBe(5)
  })

  it('Weapon_CriticalMultiplier emits melee.crit.multiplier (N8: shares the class-gated sibling total)', () => {
    const out = parseEffect(mk('Weapon_CriticalMultiplier', { Amount: 1 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('melee.crit.multiplier')
  })

  it('EldritchBlastD6 emits eldritchBlast.d6', () => {
    const out = parseEffect(mk('EldritchBlastD6', { Amount: 3 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('eldritchBlast.d6')
    expect(out[0].value).toBe(3)
  })

  it('EldritchBlastD8 emits eldritchBlast.d8', () => {
    const out = parseEffect(mk('EldritchBlastD8', { Amount: 1 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('eldritchBlast.d8')
  })

  it('Immunity emits immunity.<item>', () => {
    const out = parseEffect(mk('Immunity', { Amount: 1, Item: 'Fear' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('immunity.Fear')
  })

  it('TacticalDC with Item routes to per-tactic key', () => {
    const out = parseEffect(mk('TacticalDC', { Amount: 2, Item: 'Trip' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('tacticalDC.Trip')
  })

  it('parseItemBuff also surfaces weapon.alacrity', () => {
    const buff: ItemBuff = ({ Type: 'Weapon_Alacrity', Value1: 15, BonusType: 'Enhancement' } as unknown) as ItemBuff
    const out = parseItemBuff(buff, 'Test Item')
    expect(out[0].statKey).toBe('weapon.alacrity')
    expect(out[0].value).toBe(15)
  })
})
