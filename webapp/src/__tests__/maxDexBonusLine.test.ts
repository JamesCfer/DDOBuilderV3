// V2's Max Dex Bonus line (BreakdownItemMDB) totals the "No limit" 999 effect
// (only while the Cloth Armor stance is on and no tower shield is equipped),
// the armor's printed MaximumDexterityBonus as an item effect, and every
// Effect_MaxDexBonus. The Cloth Armor stance needs cloth, docent or no armor
// AND neither Mithral Body nor Adamantine Body (Stances.xml). The referee
// used to drop the body feat check for robes and drop the printed value when
// the no-limit effect applied.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

function v3MaxDex(seed: number): number | undefined {
  const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', `fuzz-${seed}.DDOBuild`), 'utf8')
  const { stats, build, gearItems } = computeV3ForXml(xml, cat)
  const oracle = { breakdowns: { maxDexBonus: 0 } } as unknown as OracleJson
  return buildParityRows(oracle, stats, build, gearItems).find(r => r.stat === 'maxDexBonus')?.v3
}

describe('Max Dex Bonus line', () => {
  it('fuzz-8403: Mithral Body in a cloth robe has no "No limit" effect (V2 5)', () => {
    expect(v3MaxDex(8403)).toBe(5)
  })
  it('fuzz-8450: a robe printing 999 adds on top of the "No limit" 999 (V2 2000)', () => {
    expect(v3MaxDex(8450)).toBe(2000)
  })
})
