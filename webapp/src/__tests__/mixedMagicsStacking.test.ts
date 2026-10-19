// V2 BreakdownItemClassCasterLevel::CreateOtherEffects adds the Mixed Magics
// bonus (min(20, level) - classLevels) once per trained source: Wild Mage
// WMUnstableSorcery, Arcane Trickster ATMoreMagicMoreFun and Archmage
// AMMixedMagics are three separate `if` blocks, so two trained sources add
// it twice. V3 used to treat Mixed Magics as on/off and add it once.

import { describe, it, expect } from 'vitest'
import { mixedMagicsSourceCount, hasMixedMagics } from '../lib/mixedMagics'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import type { Effect } from '../types/ddo'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

const twoSources = {
  classes: [{ name: 'Wizard', levels: 6 }, { name: 'Sorcerer', levels: 6 }, { name: 'Rogue', levels: 8 }],
  totalLevel: 20, epicLevels: 0, legendaryLevels: 0,
  enhancementChoices: { 'Wild Mage': { WMUnstableSorcery: 1 }, 'Arcane Trickster': { ATMoreMagicMoreFun: 1 } },
  enhancementSelections: {
    'Wild Mage': { WMUnstableSorcery: 'Mixed Magics' },
    'Arcane Trickster': { ATMoreMagicMoreFun: 'Mixed Magics' },
  },
} as unknown as CharacterBuild

describe('Mixed Magics stacks once per trained source, as in V2', () => {
  it('counts each trained source', () => {
    expect(mixedMagicsSourceCount(twoSources)).toBe(2)
    expect(hasMixedMagics(twoSources)).toBe(true)
  })

  it('referee adds the bonus once per source to class caster levels', () => {
    const stats = {
      resolve: () => ({ total: 0, bonuses: [] }), total: () => 0,
      keys: () => [], weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    // Wizard 6 + 2 x (20 - 6) = 34, which is what V2's breakdown totals
    const rows = buildParityRows({ casterLevel: { Wizard: 34 } } as OracleJson, stats, twoSources, {})
    expect(rows.find(r => r.stat === 'cl.Wizard')).toMatchObject({ v2: 34, v3: 34 })
  })
  it('ClassCasterLevel amounts read the stacked caster level', () => {
    const ctx: EffectContext = {
      race: 'Human', alignment: 'True Neutral',
      classLevels: { Wizard: 6 }, baseClassLevels: { Wizard: 6 }, totalLevel: 20,
      feats: new Set(), enhancements: new Set(), stances: new Set(), bab: 10, weaponTypes: new Set(),
      abilityTotals: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
      mixedMagicsCapLevel: 20, mixedMagicsSources: 2,
    }
    const amounts = Array.from({ length: 41 }, (_, i) => i)
    const effect = { Type: 'EnergyResistance', Bonus: 'Enhancement', AType: 'ClassCasterLevel', StackSource: 'Wizard', Item: ['Fire'],
      Amount: { '#text': amounts.join(' ') } } as unknown as Effect
    const out = parseEffect(effect, 1, 'test', 0, 0, ctx)
    // index is the caster level: 6 + 2 x (20 - 6) = 34
    expect(out[0].value).toBe(34)
  })
})
