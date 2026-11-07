// V2 honors Stance requirements on AddGroupWeapon effects: Bladesworn
// Transformation's simple/martial proficiency only applies while that stance
// is toggled on. Fuzz seed 15664 (feat trained, stance off, Light Pick) takes
// V2's -4 "Non proficient penalty": V2 4 to hit, V3 was 8.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))
const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-15664.DDOBuild'), 'utf8')

describe('stance-gated AddGroupWeapon (V2)', () => {
  it('fuzz-15664: Bladesworn Transformation off grants no Light Pick proficiency', () => {
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.isWeaponProficient('Light Pick')).toBe(false)
    const penalty = stats.resolve('melee.toHit').bonuses
      .filter(b => b.active && b.source === 'Non proficient penalty')
    expect(penalty.map(b => b.value)).toEqual([-4])
    expect(stats.total('melee.toHit')).toBe(4)
  })

  it('stance on: proficiency applies again', () => {
    const on = xml.replace(/<ActiveStances>\s*<\/ActiveStances>/g,
      '<ActiveStances><Stances>Bladesworn Transformation</Stances></ActiveStances>')
    const { stats } = computeV3ForXml(on, cat)
    expect(stats.isWeaponProficient('Light Pick')).toBe(true)
  })
})
