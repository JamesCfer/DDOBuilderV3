// V2's Base Damage line (BreakdownItemWeapon m_baseDamage, "the X of X[2d6]")
// is the wielded item's own WeaponDamage as a Base line pooled with that
// hand's Weapon_BaseDamage effects. V3 never read WeaponDamage, dropped every
// Item=All effect (Ninja Assassin guild, Shintao, Combat Brute) and gave
// shield-only effects to the main hand. Values pinned to v2calc
// weaponMain/weaponOffhand.baseDamage.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildBreakdownSections } from '../components/breakdowns/breakdownSections'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const cases = [
  ['UserBuilds/collection/Dodge v7.DDOBuild', 5.85, 6.05],   // guild +0.25 both hands, shield mastery off hand
  ['Example Builds/YingsMonk.DDOBuild', 12.85, 0],            // handwraps: Shintao, Combat Brute, guild
  ['UserBuilds/collection/Melee Sorcerer.DDOBuild', 1, 0],    // rune arm defines no WeaponDamage
] as const

describe('weapon base damage [W] lines (oracle-pinned)', () => {
  for (const [name, main, off] of cases) {
    const file = join(ROOT, 'Output', name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const sections = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
      const row = (title: string) => sections.find(s => s.title === title)?.rows
        .find(r => r.label === 'Base Damage [W]')?.total
      expect(row('Melee')).toBeCloseTo(main, 6)
      expect(row('Off Hand')).toBeCloseTo(off, 6)
    }, 120_000)
  }
})
