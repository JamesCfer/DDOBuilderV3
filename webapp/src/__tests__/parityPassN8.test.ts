/**
 * N8: universal (non-class-gated) `Weapon_CriticalMultiplier` effect must feed
 * the same `melee.crit.multiplier` stat key its class-gated sibling
 * (`WeaponCriticalMultiplierClass`) uses. V2 (`BreakdownItemWeaponCriticalMultiplier.cpp:70-93`)
 * sums both `Effect_Weapon_CriticalMultiplier` and `Effect_WeaponCriticalMultiplierClass`
 * into the same total. V3 previously routed the universal effect to a dead
 * `weapon.critMultiplier` stat key that nothing reads (the combat estimator's
 * `attackEntry.ts`/`CombatPanel.tsx` only read `melee.crit.multiplier`), so
 * abilities like Aasimar "Scourge of the Undead: Destroyer of the Dead" were
 * silent no-ops.
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

describe('N8 — Weapon_CriticalMultiplier routes to melee.crit.multiplier', () => {
  it('parseEffect: Weapon_CriticalMultiplier emits melee.crit.multiplier', () => {
    const eff = { Type: 'Weapon_CriticalMultiplier', Amount: 1, Bonus: 'Enhancement', AType: 'Stacks' } as Effect
    const out = parseEffect(eff, 1, 'Test', 0, 0, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.crit.multiplier')
    expect(out[0].value).toBe(1)
  })

  it('parseItemBuff: Weapon_CriticalMultiplier emits melee.crit.multiplier', () => {
    const buff = { Type: 'Weapon_CriticalMultiplier', Amount: 1, AType: 'Stacks' } as ItemBuff
    const out = parseItemBuff(buff, 'Test Item')
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.crit.multiplier')
  })

  it('stacks additively with the class-gated sibling in the same total', () => {
    const universal = { Type: 'Weapon_CriticalMultiplier', Amount: 1, Bonus: 'Enhancement', AType: 'Stacks' } as Effect
    const gated = { Type: 'WeaponCriticalMultiplierClass', Amount: 1, Bonus: 'Feat', Item: ['Melee'], AType: 'Stacks' } as unknown as Effect
    const gatedCtx: EffectContext = { ...ctx, weaponClassMain: new Set(['Melee']) }
    const outUniversal = parseEffect(universal, 1, 'Test', 0, 0, ctx)
    const outGated = parseEffect(gated, 1, 'Test', 0, 0, gatedCtx)
    expect(outUniversal[0].statKey).toBe(outGated[0].statKey)
  })
})
