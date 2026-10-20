// V2 BreakdownItemSpellPoints picks a multi-stat class's casting stat
// (Class::ClassCastingStat: highest total, first wins ties) when the
// breakdown is created, and re-picks only when an observed breakdown changes.
// It observes the chosen stat AND, at level 20+, the Fate Points breakdown.
// Fuzz seed 7739 (Gnome Favored Soul 20) ties Charisma and Wisdom at 14 early,
// so Charisma is picked first; its 39 fate points then arrive and re-run the
// pick with final totals, where the necklace's Wisdom 20 wins. V3 ignored the
// fate point trigger and kept Charisma (2177 SP vs V2's 2264).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))

describe('fate points re-run the casting stat pick for spell points', () => {
  it('Favored Soul with fate points uses the final higher Wisdom', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-7739.DDOBuild'), 'utf8')
    const { stats } = computeV3ForXml(xml, cat)
    const sources = stats.resolve('spellPoints').bonuses.map(b => b.source)
    expect(sources).toContain('Favored Soul (Wisdom) bonus SP')
    expect(stats.total('spellPoints')).toBe(2264)
  })
})
