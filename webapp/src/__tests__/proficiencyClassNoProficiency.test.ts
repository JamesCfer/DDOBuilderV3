// V2 never treats WeaponProficiencyClass as weapon proficiency: only
// AddGroupWeapon/MergeGroups change the "Proficiency" group. Fuzz seed 14965
// (Half-Elf Wild Mage 7 / Acolyte of the Skin 13 with Dilettante: Ranger and a
// Repeating Heavy Crossbow) takes V2's -4 "Non proficient penalty":
// V2 22 to hit, V3 was 26.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('WeaponProficiencyClass grants no proficiency (V2)', () => {
  it('fuzz-14965: Dilettante Ranger still takes -4 with a Repeating Heavy Crossbow', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-14965.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.isWeaponProficient('Repeating Heavy Crossbow')).toBe(false)
    const penalty = stats.resolve('melee.toHit').bonuses
      .filter(b => b.active && b.source === 'Non proficient penalty')
    expect(penalty.map(b => b.value)).toEqual([-4])
    expect(stats.total('melee.toHit')).toBe(22)
  })
})
