// V2 BreakdownItemWeaponAttackBonus / DamageBonus in critical-effects mode
// build the off-hand weapon its own Critical Attack and Critical Damage lines:
// the off-hand standard line plus only the critical effects that reach the
// off-hand weapon. V3 had neither. Values pinned to v2calc weaponOffhand
// critAttackBonus / critDamageBonus.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildBreakdownSections } from '../components/breakdowns/breakdownSections'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const COLL = join(ROOT, 'Output', 'UserBuilds', 'collection')
const cases = [
  ['Melee Sorcerer.DDOBuild', 28, 12], // rune arm: +1 Infused Weapons, +3 Golden Souvenir Coin
  ['Dodge v7.DDOBuild', 56, 31],       // buckler: +6 Guild crit damage
  ['Odd tank.DDOBuild', 47, 21],       // tower shield: standard lines only
] as const

describe('off-hand critical attack and damage lines (oracle-pinned)', () => {
  for (const [name, atk, dmg] of cases) {
    const file = join(COLL, name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const rows = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
        .find(s => s.title === 'Off Hand')?.rows ?? []
      expect(rows.find(r => r.label === 'Crit Attack')?.total).toBe(atk)
      expect(rows.find(r => r.label === 'Crit Damage')?.total).toBe(dmg)
    }, 120_000)
  }
})
