/**
 * Marker effects with no Amount (AType NotNeeded / SpellInfo) previously died
 * at parseEffect's null-Amount early-return and were silently dropped:
 * Immunity (99 uses), DRBypass (49), GrantSpell (78) / SpellListAddition
 * (34), SLACharge. V2 consumes all of them (Breakdown_Immunities, the DR
 * breakdown's bypass list, SpellsControl spell-list additions, CSLAControl).
 */

import { describe, it, expect } from 'vitest'
import { parseEffect } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

const mk = (e: Record<string, unknown>) => e as unknown as Effect

describe('NotNeeded/SpellInfo marker effects survive the null-Amount guard', () => {
  it('Immunity emits immunity.<Item> markers', () => {
    const out = parseEffect(mk({ Type: 'Immunity', Bonus: 'Feat', Item: ['Sleep'], AType: 'NotNeeded' }), 1, 't')
    expect(out).toEqual([{ statKey: 'immunity.Sleep', value: 1, bonusType: 'Feat', source: 't' }])
  })

  it('DRBypass uses the Value field for the DR kind', () => {
    const out = parseEffect(mk({ Type: 'DRBypass', Bonus: 'Feat', Item: ['All'], Value: 'Adamantine', AType: 'NotNeeded' }), 1, 't')
    expect(out).toEqual([{ statKey: 'drBypass.Adamantine', value: 1, bonusType: 'Feat', source: 't' }])
  })

  it('GrantSpell emits grantSpell.<Class>.<Spell> with the spell level', () => {
    const out = parseEffect(mk({
      Type: 'GrantSpell', Bonus: 'Feat', Item: ['Obscuring Mist', 'Warlock'],
      AType: 'SpellInfo', Amount: { '#text': '1 10 -1', size: 3 },
    }), 1, 't')
    expect(out).toEqual([{ statKey: 'grantSpell.Warlock.Obscuring Mist', value: 1, bonusType: 'Feat', source: 't' }])
  })

  it('SpellListAddition routes the same way', () => {
    const out = parseEffect(mk({
      Type: 'SpellListAddition', Bonus: 'Enhancement', Item: ['Power Word: Stun', 'Dark Apostate'],
      AType: 'SpellInfo', Amount: { '#text': '8 40 15', size: 3 },
    }), 1, 't')
    expect(out[0].statKey).toBe('grantSpell.Dark Apostate.Power Word: Stun')
    expect(out[0].value).toBe(8)
  })

  it('SLACharge (has an Amount) emits slaCharge.<name>', () => {
    const out = parseEffect(mk({
      Type: 'SLACharge', Bonus: 'Racial', Item: ['Healing Hands'],
      AType: 'Simple', Amount: { '#text': 1, size: 1 },
    }), 1, 't')
    expect(out).toEqual([{ statKey: 'slaCharge.Healing Hands', value: 1, bonusType: 'Racial', source: 't', percent: false, asItemEffect: false }])
  })
})
