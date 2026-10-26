// V2 reads weapon names through weaponTypeMap, which also accepts wiki
// spellings (WeaponTypes.h: "Handaxe" for Hand Axe, "Short Sword" for
// Shortsword, ...). Weapon Finesse lists "Handaxe", so V2 gives a Hand Axe
// its +2 to hit; V3 compared the raw text against the item's "Hand Axe"
// and dropped it (fuzz seed 10373, Drow Dragon Disciple 20: V2 31, V3 29).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { canonicalWeaponType } from '../lib/gamedata'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('V2 weapon type aliases', () => {
  it('maps wiki spellings to the canonical weapon type', () => {
    expect(canonicalWeaponType('Handaxe')).toBe('Hand Axe')
    expect(canonicalWeaponType('Short Sword')).toBe('Shortsword')
    expect(canonicalWeaponType('Dwarven Waraxe')).toBe('Dwarven Axe')
    expect(canonicalWeaponType('Hand Axe')).toBe('Hand Axe')
    expect(canonicalWeaponType('Centered')).toBe('Centered')
  })

  it('fuzz-10373: Weapon Finesse ("Handaxe") adds +2 to hit with a Hand Axe', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-10373.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    const finesse = stats.resolve('melee.toHit').bonuses
      .filter(b => b.active && b.source.includes('Weapon Finesse'))
    expect(finesse.map(b => b.value)).toEqual([2])
    expect(stats.total('melee.toHit')).toBe(31)
  })
})
