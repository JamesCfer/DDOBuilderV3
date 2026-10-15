// V2 BreakdownItemWeapon keeps an enhancement line per hand: a shield's from
// ShieldEnchantment (the item's own +X keeps the template's shield-type
// Items), any other weapon's from Weapon_Enchantment naming its type or group.
// An ItemSlot requirement picks the hand (Requirement::EvaluateItemSlot), so
// Battle Engineer's Weapon1-only Infused Weapons stays off a rune arm. V3 had
// no off-hand line. Values pinned to v2calc weaponOffhand.enchantment.

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
  ['Dodge v7.DDOBuild', 15],        // buckler: its +15 only, not Swashbuckling
  ['Melee Sorcerer.DDOBuild', 1],   // rune arm: Enchant Weapons, no Infused Weapons
  ['Odd tank.DDOBuild', 18],        // tower shield +15 and Shield Expertise 3
] as const

describe('off-hand enhancement line (oracle-pinned)', () => {
  for (const [name, total] of cases) {
    const file = join(COLL, name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const rows = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
        .find(s => s.title === 'Off Hand')?.rows ?? []
      expect(rows.find(r => r.label === 'Enhancement')?.total).toBe(total)
    }, 120_000)
  }
})
