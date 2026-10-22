// V2 Buff::UpdatedEffects appends an item buff's <Item2> to every template
// effect's Item list. The "Favored Weapon" item buff (ItemBuffs.xml
// AddGroupWeapon [Favored Weapon]) names the weapon's own type in Item2, so
// Build::NotifyItemEffect -> AddWeaponToGroup puts that weapon in the
// Favored Weapon group and the auto "Favored Weapon" stance turns on. V3
// ignored Item2, so fuzz seed 8836 (Epic Dynastic Falcata, a Khopesh) lost
// Warpriest: Righteous Weapons I (+3 Universal Spell Power, +1 attack and
// damage, gated on that stance).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('item buff Favored Weapon', () => {
  it('fuzz-8836: the Epic Dynastic Falcata counts as a Favored Weapon', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-8836.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.activeStances).toContain('Favored Weapon')
    const sources = stats.resolve('sp.Universal').bonuses.filter(b => b.active !== false).map(b => b.source)
    expect(sources.some(s => s.includes('Righteous Weapons I'))).toBe(true)
  })
})
