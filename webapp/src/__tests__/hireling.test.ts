import { describe, expect, it } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human',
  alignment: 'True Neutral',
  classLevels: { Cleric: 20 },
  baseClassLevels: { Cleric: 20 },
  totalLevel: 20,
  feats: new Set(),
  enhancements: new Set(),
  abilityTotals: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 18, Charisma: 10 },
  stances: new Set(),
  bab: 15,
  weaponTypes: new Set(),
}

const mk = (Type: string, extra: Partial<Effect> = {}): Effect => ({
  Type, Amount: 1, Bonus: 'Enhancement', AType: 'Stacks', ...extra,
}) as Effect

describe('Hireling effect parsing (Stream 4)', () => {
  it('HirelingHitpoints emits hireling.hp', () => {
    const out = parseEffect(mk('HirelingHitpoints', { Amount: 50 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('hireling.hp')
    expect(out[0].value).toBe(50)
  })

  it('HirelingPRR/MRR/Dodge land on hireling.* keys', () => {
    expect(parseEffect(mk('HirelingPRR', { Amount: 10 }), 1, 'Test', 0, 0, ctx)[0].statKey).toBe('hireling.prr')
    expect(parseEffect(mk('HirelingMRR', { Amount: 10 }), 1, 'Test', 0, 0, ctx)[0].statKey).toBe('hireling.mrr')
    expect(parseEffect(mk('HirelingDodge', { Amount: 5 }), 1, 'Test', 0, 0, ctx)[0].statKey).toBe('hireling.dodge')
  })

  it('HirelingAbilityBonus distinguishes per-Item', () => {
    const out = parseEffect(
      mk('HirelingAbilityBonus', { Amount: 4, Item: ['Strength', 'Constitution'] as unknown as string }),
      1, 'Test', 0, 0, ctx,
    )
    expect(out.map(b => b.statKey).sort()).toEqual([
      'hireling.ability.Constitution',
      'hireling.ability.Strength',
    ])
  })

  it('HirelingSaveBonus default bucket is All', () => {
    const out = parseEffect(mk('HirelingSaveBonus', { Amount: 2 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('hireling.save.All')
  })

  it('HirelingGrantFeat encodes feat name in bonusType', () => {
    const out = parseEffect(
      mk('HirelingGrantFeat', { Amount: 1, Item: 'Power Attack' }),
      1, 'Test', 0, 0, ctx,
    )
    expect(out[0].statKey).toBe('hireling.grantedFeats')
    expect(out[0].bonusType).toBe('Power Attack')
  })
})
