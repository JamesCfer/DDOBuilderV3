// V2 Buff::UpdatedEffects stamps an item buff's own <Requirements> onto every
// effect when the buff carries a Value1 (Buff.cpp:240-262), so the effect only
// counts while they hold. Divine Vengeance grants Spell Resistance 30 / 35 only
// to a Paladin of level 19 / 20; V3 ignored the buff's requirements and gave
// fuzz seed 8961 (Dark Hunter 12 / Stormsinger 8, no Paladin) SR 35.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('item buff requirements', () => {
  it('fuzz-8961: Divine Vengeance gives no Spell Resistance to a non-Paladin', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-8961.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.total('spellResistance')).toBe(0)
  })
})
