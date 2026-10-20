// V2 maps a SpellCriticalDamage effect's Items through spellPowerTypeMap,
// which only knows "Light/Alignment": a bare "Light" (Harper Agent's Harper
// Spell Training I lists Force, Physical, Sonic, Light and Good) is
// SpellPower_Unknown and adds nothing to the Light/Alignment crit multiplier.
// V3 normalised "Light" to LightAlignment, so it showed +2% that V2 does not
// (fuzz seeds 7709 and 7716 against v2calc).

import { describe, it, expect } from 'vitest'
import { parseEffect } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

const harper = {
  Type: 'SpellCriticalDamage', Bonus: 'Enhancement', AType: 'Simple', Amount: 2,
  Item: ['Force', 'Physical', 'Sonic', 'Light', 'Good'],
} as unknown as Effect

describe('SpellCriticalDamage Items follow V2 spellPowerTypeMap', () => {
  it('drops a bare Light item', () => {
    const keys = parseEffect(harper, 1, 't').map(b => b.statKey)
    expect(keys).toEqual(['spCritDmg.Force', 'spCritDmg.Physical', 'spCritDmg.Sonic', 'spCritDmg.Good'])
  })

  it('keeps Light/Alignment', () => {
    const keys = parseEffect({ ...harper, Item: ['Light/Alignment'] } as unknown as Effect, 1, 't').map(b => b.statKey)
    expect(keys).toEqual(['spCritDmg.LightAlignment'])
  })
})
