// V2 pools every FalseLife effect in its own False Life breakdown
// (BreakdownsPane Breakdown_FalseLife) and BreakdownItemHitpoints then adds
// that total to hit points as one "False Life" bonus. V3 put FalseLife
// straight into the hit point pool with the item's bonus type, so an
// Enhancement False Life lost Highest-Only to an Enhancement HP item: fuzz
// seed 9024 (Docent of Shadow False Life 10 plus Guardian's Girdle +40 HP)
// was 10 HP short.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('False Life pool', () => {
  it('fuzz-9024: False Life stacks with an Enhancement HP item', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-9024.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.total('falseLife')).toBe(10)
    expect(stats.total('hp')).toBe(391)
  })
})
