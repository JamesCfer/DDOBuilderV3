// V2 BreakdownItemSave adds the Half-Elf Lesser Divine Grace only when the
// full Divine Grace feat is not trained (`if (!AddDivineGrace())
// AddHalfElfDivineGrace()`). V3 added both, and since both are feat-side
// Divine bonuses they stacked: fuzz seed 8922 (Half-Elf Paladin dilettante
// with 8 Paladin levels, Charisma 14) got +2 too much on every save.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('Half-Elf Lesser Divine Grace', () => {
  it('fuzz-8922: is skipped when the full Divine Grace feat is trained', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-8922.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    const sources = stats.resolve('save.Will').bonuses.map(b => b.source)
    expect(sources.some(s => s.startsWith('Divine Grace'))).toBe(true)
    expect(sources.some(s => s.startsWith('Lesser Divine Grace'))).toBe(false)
    expect(stats.total('save.Will')).toBe(11)
  })
})
