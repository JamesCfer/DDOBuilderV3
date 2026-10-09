// U13: V2's Granted Feats pane also lists "Inactive Granted Feats": feats
// granted by an applied effect whose activation requirements are not met
// (GrantedFeatsPane.cpp:272-323 PopulateGrantedFeatsList). Example from the
// shipped data: Vanguard grants Deflect Arrows only while Sword and Board is on.

import { describe, expect, it } from 'vitest'
import {
  parseEffect, inactiveGrantedFeats, INACTIVE_GRANTED_FEAT_KEY_PREFIX, type EffectContext,
} from '../lib/effectParser'
import type { Effect } from '../types/ddo'

const ctx = (stances: string[]): EffectContext => ({
  race: 'Human', alignment: 'True Neutral',
  classLevels: { Fighter: 20 }, baseClassLevels: { Fighter: 20 }, totalLevel: 20,
  feats: new Set(), enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(stances), bab: 20, weaponTypes: new Set(),
})

// Vanguard.tree.xml
const deflectArrows = {
  Type: 'GrantFeat', Bonus: 'Enhancement', Item: 'Deflect Arrows', AType: 'NotNeeded',
  Requirements: { Requirement: { Type: 'Stance', Item: 'Sword and Board' } },
} as unknown as Effect

describe('U13 - inactive granted feats', () => {
  it('grants the feat when its stance is active', () => {
    const out = parseEffect(deflectArrows, 1, 'Vanguard', 0, 0, ctx(['Sword and Board']))
    expect(out.map(o => o.statKey)).toEqual(['grantedFeat.Deflect Arrows'])
  })

  it('reports the feat as inactive when its stance is off', () => {
    const out = parseEffect(deflectArrows, 1, 'Vanguard', 0, 0, ctx([]))
    expect(out.map(o => o.statKey)).toEqual([`${INACTIVE_GRANTED_FEAT_KEY_PREFIX}Deflect Arrows`])
  })

  it('lists inactive grants sorted, without feats another source grants actively', () => {
    const keys = [
      'grantedFeat.Evasion',
      `${INACTIVE_GRANTED_FEAT_KEY_PREFIX}Evasion`,
      `${INACTIVE_GRANTED_FEAT_KEY_PREFIX}Improved Evasion`,
      `${INACTIVE_GRANTED_FEAT_KEY_PREFIX}Deflect Arrows`,
      'str',
    ]
    expect(inactiveGrantedFeats(keys, ['Evasion'])).toEqual(['Deflect Arrows', 'Improved Evasion'])
  })
})
