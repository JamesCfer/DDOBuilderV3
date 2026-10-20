// V2 BreakdownItemDodge::CappedTotal caps dodge by Breakdown_MaxDexBonus
// whenever the Cloth Armor stance is off. An armor item that prints no
// MaximumDexterityBonus contributes 0 to that breakdown, so its wearer's
// dodge is capped at 0 (plus any MaxDexBonus effects). V3 only applied the
// MDB cap when the armor printed a value or an MDB effect existed, so
// fuzz seeds 8260 and 8266 (+5 Cormyrian Engraved Breastplate, no printed
// MDB) showed 5% and 1% dodge where V2 shows 0.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))
const dodgeOf = (seed: number) => computeV3ForXml(
  readFileSync(join(ROOT, 'Output', 'FuzzBuilds', `fuzz-${seed}.DDOBuild`), 'utf8'), cat).stats.total('dodge')

describe('armor with no printed max dex bonus caps dodge at 0', () => {
  it('fuzz-8260 (dodge 5 before the cap) shows 0', () => {
    expect(dodgeOf(8260)).toBe(0)
  })
  it('fuzz-8266 (dodge 1 before the cap) shows 0', () => {
    expect(dodgeOf(8266)).toBe(0)
  })
})
