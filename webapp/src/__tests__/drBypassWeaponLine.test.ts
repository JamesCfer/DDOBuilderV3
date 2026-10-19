// V2's "DR Bypass" weapon line (BreakdownItemWeaponDRBypass) lists, per hand,
// the DR kinds that hand's weapon bypasses: the weapon's own <DRBypass>
// entries (Build::ApplyWeaponEffects) plus every DRBypass effect whose Item
// names that weapon type or All (BreakdownItemWeaponEffects::AffectsThisWeapon).
// V3 used to pool DRBypass effects under one unscoped key and never read a
// weapon's own list, so the line did not exist and was never compared.

import { describe, it, expect } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import { drBypassList, drBypassText } from '../lib/combat/drBypass'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import { computeBuildStats } from '../hooks/useBuildStats'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, Effect, Item } from '../types/ddo'

const ctx = {
  weaponTypes: new Set(['Kama', 'Large Shield']),
  weaponTypeMain: 'Kama',
  weaponTypeOffhand: 'Large Shield',
} as unknown as EffectContext

const dr = (value: string, items: string[]) =>
  parseEffect({ Type: 'DRBypass', Bonus: 'Enhancement', Item: items, Value: value, AType: 'NotNeeded' } as unknown as Effect, 1, 't', 0, 0, ctx)
    .map(b => b.statKey)

function mockStats(vals: Record<string, number>, offhand = true): BuildStats {
  return {
    resolve: (k: string) => ({ total: vals[k] ?? 0, bonuses: [] }),
    total: (k: string) => vals[k] ?? 0,
    keys: () => Object.keys(vals), weapon: null, armorMaxDex: null,
    offhandWeapon: offhand ? { slot: 'Weapon2', weaponType: 'Large Shield' } : null,
  } as unknown as BuildStats
}

describe('DR Bypass weapon line', () => {
  it('routes a DRBypass effect to each hand its Item names', () => {
    expect(dr('Good', ['All'])).toEqual(['weapon.drBypass.Good', 'offhand.drBypass.Good'])
    expect(dr('Silver', ['Kama'])).toEqual(['weapon.drBypass.Silver'])
    expect(dr('Byeshk', ['Handwraps'])).toEqual([])
  })

  it('lists kinds sorted the V2 way and joins them with ", "', () => {
    const stats = mockStats({ 'weapon.drBypass.Slash': 1, 'weapon.drBypass.Cold Iron': 1, 'weapon.drBypass.Cold': 1, 'weapon.drBypass.Magic': 1 })
    expect(drBypassList(stats, 'main')).toEqual(['Cold', 'Cold Iron', 'Magic', 'Slash'])
    expect(drBypassText(stats, 'off')).toBe('')
  })

  it('referee compares each hand as a set of kinds', () => {
    const stats = mockStats({ 'weapon.drBypass.Magic': 1, 'weapon.drBypass.Slash': 1, 'offhand.drBypass.Bludgeon': 1 })
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const oracle = {
      weaponMain: {}, weaponOffhand: {},
      drBypassText: { main: 'Magic, Slash', offhand: 'Bludgeon, Magic' },
    } as unknown as OracleJson
    const rows = buildParityRows(oracle, stats, build, {})
    expect(rows.find(r => r.stat === 'drBypass.main')).toMatchObject({ v2: 2, v3: 2 })
    expect(rows.find(r => r.stat === 'drBypass.offhand')).toMatchObject({ v2: 2, v3: 1 })
  })

  it("feeds each hand's line from the wielded weapon's own DRBypass list", () => {
    const kama = { Name: 'Test Kama', Weapon: 'Kama', DRBypass: ['Slash', 'Magic'] } as unknown as Item
    const shield = { Name: 'Test Shield', Weapon: 'Large Shield', DRBypass: 'Bludgeon' } as unknown as Item
    const build = { ...emptyBuild(), gear: { Weapon1: kama.Name, Weapon2: shield.Name } as Record<string, string> }
    const stats = computeBuildStats({
      allClasses: [], allRaces: [], allFeats: [], allTrees: [], allSelfBuffs: [], allAugments: [],
      allSetBonuses: [], allFiligreeBonuses: [], allFiligrees: [],
      gearItems: { Weapon1: kama, Weapon2: shield } as Record<string, Item>,
    } as unknown as Parameters<typeof computeBuildStats>[0], build)
    expect(drBypassText(stats, 'main')).toBe('Magic, Slash')
    expect(drBypassText(stats, 'off')).toBe('Bludgeon')
  })
})
