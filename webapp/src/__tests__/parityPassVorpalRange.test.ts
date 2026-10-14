// V2 BreakdownItemWeaponVorpalRange: a natural 20 is always vorpal, so the
// line is 1 plus Weapon_VorpalRange effects and reads "20" or "19-20"
// (v2calc weaponMain.vorpalRange: 1 on most builds, 2 on exampledps). V3's
// row showed only the bonuses ("+1") and hid itself with none.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildBreakdownSections } from '../components/breakdowns/breakdownSections'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const cases = [
  [join(ROOT, 'Output', 'UserBuilds', 'collection', 'exampledps.DDOBuild'), 2, '19-20'],
  [join(ROOT, 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild'), 1, '20'],
] as const

describe('Vorpal Range row (oracle-pinned)', () => {
  for (const [file, total, display] of cases) {
    it.skipIf(!existsSync(file) || !existsSync(DATA))(`${file.split('/').pop()}: ${display}`, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const sections = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
      const row = sections.find(s => s.title === 'Weapon Effects')?.rows.find(r => r.label === 'Vorpal Range')
      expect(row?.total).toBe(total)
      expect(row?.display).toBe(display)
    }, 120_000)
  }
})
