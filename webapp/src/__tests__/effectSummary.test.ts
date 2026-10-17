import { describe, it, expect } from 'vitest'
import { summarizeEffect } from '../lib/effectSummary'
import type { Effect } from '../types/ddo'

describe('summarizeEffect', () => {
  it('lists every rank and the bonus type for an untrained item', () => {
    const e = { Type: 'Doublestrike', Bonus: 'Stacking', AType: 'Stacks', Amount: { '#text': '1 2 3' } } as unknown as Effect
    expect(summarizeEffect(e)).toMatchObject({ label: 'Doublestrike', amount: '+1/+2/+3', bonus: 'Stacking' })
  })
  it('shows the trained rank only, with the weapon items', () => {
    const e = { Type: 'Weapon_AttackAndDamage', Bonus: 'Enhancement', AType: 'Simple', Amount: '1 2 3', Item: ['Axes', 'Handaxe'] } as unknown as Effect
    expect(summarizeEffect(e, 2)).toMatchObject({ label: 'Weapon Attack And Damage: Axes, Handaxe', amount: '+2' })
  })
  it('marks penalties and number-less effects', () => {
    expect(summarizeEffect({ Type: 'MetamagicCostIntensify', Bonus: 'Destiny', AType: 'Simple', Amount: '-15' } as unknown as Effect))
      .toMatchObject({ amount: '-15', negative: true })
    expect(summarizeEffect({ Type: 'GrantFeat', AType: 'NotNeeded', Item: 'Haste' } as unknown as Effect).amount).toBe('')
  })
})
