// V2 Build::ApplyItem applies an item's own top-level <Effect> list through
// NotifyItemEffect, which feeds AddGroupWeapon to AddWeaponToGroup. Midnight
// Greetings (a kukri) adds Kukri to the Centered group that way, so a monk
// wielding it is Centered. V3 only read item BUFF group adds, so fuzz seed
// 11112 (Fighter 4 / Monk 8 / Cleric 8) lost Centered and with it Flurry of
// Blows, Ki from Monk levels and Fast Movement (ki 125 vs 45, speed 40 vs 30).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('item top-level AddGroupWeapon effects', () => {
  it('fuzz-11112: Midnight Greetings makes its kukri a Centered weapon', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-11112.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    expect([...(stats.activeStances ?? [])]).toContain('Centered')
    expect(stats.total('ki.max')).toBe(125)
    expect(stats.total('speed')).toBe(140)
  })
})
