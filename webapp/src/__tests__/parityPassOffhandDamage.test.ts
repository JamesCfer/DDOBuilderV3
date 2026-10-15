// V2 BreakdownItemWeaponDamageBonus builds a separate damage line for the
// off-hand weapon: the best damage ability scaled by the off-hand Damage
// Ability Multiplier (50% by default) and truncated, the off-hand enhancement
// line, and only the Weapon_Damage / AttackAndDamage / DamageBonusClass /
// DamageBonusDamageType effects that reach the off-hand weapon. V3 had no
// off-hand damage line. Values pinned to v2calc weaponOffhand.damageBonus.

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
  ['Melee Sorcerer.DDOBuild', 8],    // rune arm: no ability line, gear damage only (main 45)
  ['Dodge v7.DDOBuild', 25],         // buckler: 50% of Dex, its own +15 (main 46)
  ['Odd tank.DDOBuild', 21],         // tower shield: 50% of Str with no main-hand weapon
] as const

describe('off-hand damage line (oracle-pinned)', () => {
  for (const [name, total] of cases) {
    const file = join(COLL, name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const rows = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
        .find(s => s.title === 'Off Hand')?.rows ?? []
      expect(rows.find(r => r.label === 'Damage')?.total).toBe(total)
    }, 120_000)
  }
})
