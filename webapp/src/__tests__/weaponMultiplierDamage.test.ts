// A weapon written X[ndS] rolls its dice X times: V2's Base Damage line
// (BreakdownItemWeapon m_baseDamage) is that X, the item's own WeaponDamage
// pooled with Weapon_BaseDamage effects (weapon.baseDamage, #297). The damage
// estimators rolled (diceNum + bonusW) dice instead, so a 5.6[1d6] weapon
// counted as 1d6 plus effects.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expectedDamage } from '../lib/combat/expectedDamage'
import { extractCore } from '../lib/combat/autoDamage'
import { buildAttackEntry } from '../lib/combat/attackEntry'
import type { BuildStats, WeaponInfo } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const weapon: WeaponInfo = {
  name: 'Kopesh', slot: 'Main Hand', diceNum: 1, diceSides: 6,
  critThreatRange: 3, critMultiplier: 2, attackModifier: 'Strength',
  weaponType: 'Khopesh', weaponDamage: 5.6,
}
const map: Record<string, number> = { 'weapon.baseDamage': 5.85, 'weapon.bonusW': 0.25 }
const stats = {
  resolve: (k: string) => ({ total: map[k] ?? 0, bonuses: [] }) as never,
  total: (k: string) => map[k] ?? 0,
  keys: () => Object.keys(map),
  weapon, armorMaxDex: null, slaList: [], grantedFeatsList: [],
  isWeaponProficient: () => true,
} as unknown as BuildStats

describe('estimators roll the [W] multiplier', () => {
  it('expectedDamage rolls 5.85 x 1d6', () => {
    const d = expectedDamage(k => map[k] ?? 0, Object.keys(map), weapon)
    expect(d.weaponDice).toBeCloseTo(5.85 * 3.5, 6)
  })
  it('the combat overview rolls 5.85 x 1d6', () => {
    const r = buildAttackEntry(stats, weapon, 10, 0, { foeAC: 0 })
    expect(r.breakdown.weaponDie).toBeCloseTo(5.85 * 3.5, 6)
  })
  it('the damage simulator gets W 5.85 of 1d6', () => {
    const core = extractCore(stats, weapon, 10, 0, { attacksPerMinute: 60 })
    expect(core.wMult).toBeCloseTo(5.85, 6)
    expect(core.wCount).toBe(1)
  })
  it('a weapon with no WeaponDamage keeps 1 + bonus [W]', () => {
    const plain = { ...weapon, weaponDamage: undefined }
    const d = expectedDamage(k => map[k] ?? 0, Object.keys(map), plain)
    expect(d.weaponDice).toBeCloseTo(1.25 * 3.5, 6)
  })

  const file = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'collection', 'Dodge v7.DDOBuild')
  const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
  it.skipIf(!existsSync(file) || !existsSync(DATA))('Dodge v7 main hand rolls V2 base damage 5.85', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats: s } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
    const w = s.weapon!
    const d = expectedDamage(k => s.total(k), s.keys(), w)
    expect(d.weaponDice).toBeCloseTo(5.85 * w.diceNum * (w.diceSides + 1) / 2, 6)
  }, 120_000)
})
