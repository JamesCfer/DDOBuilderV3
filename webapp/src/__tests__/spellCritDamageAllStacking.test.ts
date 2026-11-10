// V2 matches an Item=All SpellCriticalDamage effect against every spell power
// type (Effect::HasSpellPower), so it lands in each per-type pool and stacks
// with that type's own effects by bonus type. Fuzz seed 17089: Elfcrafted Plate
// Armor (+0.25 Equipment, All) and Ruler of Ruin (+12 Equipment, Force and
// Physical) are both Equipment bonuses, so only the 12 counts on Force and
// Physical. V2 Force crit damage 14, V3 was 14.25.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { spellPowerRowValues } from '../lib/spellPowerRow'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('Item=All spell critical damage stacks per type (V2)', () => {
  it('fuzz-17089: Equipment All bonus loses to a larger Equipment Force bonus', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-17089.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    expect(spellPowerRowValues(stats, 'Force').critMultiplier).toBeCloseTo(2 + 14 / 100, 6)
    expect(spellPowerRowValues(stats, 'Physical').critMultiplier).toBeCloseTo(2 + 14 / 100, 6)
    // Types without their own Equipment bonus still get the All bonus.
    expect(spellPowerRowValues(stats, 'Acid').critMultiplier).toBeCloseTo(2 + 0.25 / 100, 6)
  })
})
