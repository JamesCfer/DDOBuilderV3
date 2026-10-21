// V2 Build::ApplyGearEffects applies items in InventorySlotType order (Arrows,
// Armor, Belt, Boots, Bracers, Cloak, Gloves, Goggles, Helmet, Necklace,
// Quiver, Ring1, Ring2, Trinket, Weapon1, Weapon2), and
// BreakdownItem::RemoveNonStacking keeps the LATER of two Highest-Only item
// effects with equal magnitude. Fuzz seed 8489 wears Prisoner's Manacles
// (+20 melee threat, Bracers) and Iron Cloak of the Wolf (-20, Cloak): V2
// keeps the cloak's -20, V3 kept whichever its own gear order listed last.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('equal-magnitude item effects resolve in V2 slot order', () => {
  it('fuzz-8489: the Cloak -20 melee threat beats the Bracers +20', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-8489.DDOBuild'), 'utf8')
    expect(computeV3ForXml(xml, cat).stats.total('threat.melee')).toBe(-20)
  })
})
