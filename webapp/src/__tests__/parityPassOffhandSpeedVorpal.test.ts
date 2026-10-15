// V2 BreakdownItemWeaponEffects keeps an attack speed and vorpal range line per
// hand: Weapon_Alacrity / WeaponAlacrityClass / Weapon_VorpalRange land on the
// off-hand only when their Item names its weapon type or group. V3 had no
// off-hand lines at all. Values pinned to v2calc weaponOffhand (the main hand
// differs on both builds: 36 and 45).

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
  ['Melee Sorcerer.DDOBuild', 6],
  ['Dodge v7.DDOBuild', 15],
] as const

describe('off-hand attack speed and vorpal range (oracle-pinned)', () => {
  for (const [name, speed] of cases) {
    const file = join(COLL, name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const rows = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
        .find(s => s.title === 'Off Hand')?.rows ?? []
      expect(rows.find(r => r.label === 'Attack Speed')?.total).toBe(speed)
      const vorpal = rows.find(r => r.label === 'Vorpal Range')
      expect(vorpal?.total).toBe(1)
      expect(vorpal?.display).toBe('20')
    }, 120_000)
  }
})
