// V2's Build::MainHandWeapon / OffhandWeapon report Weapon_Empty for an empty
// hand, and WeaponGroupings.xml lists "Empty" in the Centered, Crossbow and
// SwashbucklingOffhand groups, so GroupMember2 "SwashbucklingOffhand" holds
// with nothing in the off hand. V3 gave an empty hand no group at all, so the
// Swashbuckling stance never switched on for a one-weapon Swashbuckler:
// fuzz seed 8408 (Shuriken, empty off hand) lost Doublestrike, Doubleshot and
// the +1 weapon enchantment that stance gates.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('an empty hand belongs to the Empty weapon groups', () => {
  it('fuzz-8408: Swashbuckling is on with a Shuriken and an empty off hand', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-8408.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.activeStances).toContain('Swashbuckling')
    expect(stats.total('melee.doublestrike')).toBe(1)
    expect(stats.total('ranged.doubleshot')).toBe(1)
  })
})
