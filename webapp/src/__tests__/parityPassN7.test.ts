/**
 * N7: universal (non-class-gated) `Weapon_CriticalRange` effect must feed
 * the same `melee.crit.range` stat key its class-gated sibling
 * (`WeaponCriticalRangeClass`) uses. V2 (`BreakdownItemWeaponCriticalThreatRange.cpp:52-57`)
 * sums both `Effect_Weapon_CriticalRange` and `Effect_WeaponCriticalRangeClass`
 * (plus `Weapon_Keen`) into the same crit-threat-range total. V3 previously
 * routed the universal effect to a dead `weapon.critRange` stat key that
 * nothing reads (the combat estimator's `attackEntry.ts`/`CombatPanel.tsx`
 * only read `melee.crit.range`), so abilities like Fighter Kensei "Keen Edge"
 * were silent no-ops.
 */

import { describe, it, expect } from 'vitest'
import { parseEffect, parseItemBuff, type EffectContext } from '../lib/effectParser'
import type { Effect, ItemBuff } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human', alignment: 'True Neutral',
  classLevels: { Fighter: 20 }, baseClassLevels: { Fighter: 20 }, totalLevel: 20,
  feats: new Set(), enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(), bab: 20, weaponTypes: new Set(),
}

describe('N7 — Weapon_CriticalRange routes to melee.crit.range', () => {
  it('parseEffect: Weapon_CriticalRange emits melee.crit.range', () => {
    const eff = { Type: 'Weapon_CriticalRange', Amount: 1, Bonus: 'Competence', Item: ['All'], AType: 'Stacks' } as Effect
    const out = parseEffect(eff, 1, 'Test', 0, 0, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.crit.range')
    expect(out[0].value).toBe(1)
  })

  it('parseItemBuff: Weapon_CriticalRange emits melee.crit.range', () => {
    const buff = { Type: 'Weapon_CriticalRange', Amount: 1, AType: 'Stacks' } as ItemBuff
    const out = parseItemBuff(buff, 'Test Item')
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.crit.range')
  })

  it('stacks additively with the class-gated sibling in the same total', () => {
    const universal = { Type: 'Weapon_CriticalRange', Amount: 1, Bonus: 'Competence', Item: ['All'], AType: 'Stacks' } as Effect
    const gated = { Type: 'WeaponCriticalRangeClass', Amount: 1, Bonus: 'Feat', Item: ['Melee'], AType: 'Stacks' } as unknown as Effect
    const gatedCtx: EffectContext = { ...ctx, weaponClassMain: new Set(['Melee']) }
    const outUniversal = parseEffect(universal, 1, 'Test', 0, 0, ctx)
    const outGated = parseEffect(gated, 1, 'Test', 0, 0, gatedCtx)
    expect(outUniversal[0].statKey).toBe(outGated[0].statKey)
  })
})
