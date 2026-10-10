// V2 names iconic past-life stances "<Race> " (trailing space) so they stay
// distinct from the race's own auto-stance, and its saves persist both forms
// in <ActiveStances>. The importer's XML parser trimmed every value, which
// collapsed the pair onto the race stance; buildStats then dropped that as
// the build's own race, and the past-life stance's bonuses never fired.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { resolveBonus } from '../lib/bonus'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const WIZ = join(ROOT, 'Output', 'UserBuilds', 'collection', 'wiz dc caster.DDOBuild')

const xml = (stances: string[]) => `<?xml version="1.0" encoding="utf-8"?>
<DDOBuilderCharacterData>
  <Character>
    <Life>
      <Race>Dhampir Dark Bargainer</Race>
      <Build version="1">
        <Level>20</Level>
        <ActiveStances>
${stances.map(s => `          <Stances>${s}</Stances>`).join('\n')}
        </ActiveStances>
      </Build>
    </Life>
    <ActiveLifeIndex>0</ActiveLifeIndex>
    <ActiveBuildIndex>0</ActiveBuildIndex>
  </Character>
</DDOBuilderCharacterData>`

describe('iconic past-life stance names keep their trailing space on import', () => {
  it('keeps the race stance and the iconic stance apart', () => {
    const { build } = importV2Build(xml(['Dhampir Dark Bargainer', 'Dhampir Dark Bargainer ']))
    expect(build.activeBuffs).toEqual(['Dhampir Dark Bargainer', 'Dhampir Dark Bargainer '])
  })

  it('keeps other iconic stances spaced and leaves plain names alone', () => {
    const { build } = importV2Build(xml(['Razorclaw Shifter ', 'Power Attack']))
    expect(build.activeBuffs).toEqual(['Razorclaw Shifter ', 'Power Attack'])
  })

  // Oracle-pinned: v2calc reports Necromancy DC 69 and Negative spell power
  // 1026 for this save; 3 of each comes from "Past Life: Dark Bargainer" x3.
  it.skipIf(!existsSync(WIZ) || !existsSync(DATA))('wiz dc caster gets its Dark Bargainer past-life stance bonus (V2 oracle)', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(readFileSync(WIZ, 'utf8'), cat)
    expect(stats.activeStances).toContain('Dhampir Dark Bargainer ')
    const necro = resolveBonus([
      ...stats.resolve('dc.All').bonuses,
      ...stats.resolve('dc.Necromancy').bonuses,
    ]).total
    expect(necro).toBe(69)
    const pastLife = stats.resolve('sp.Negative').bonuses
      .filter(b => b.active !== false && b.v2Name === 'Past Life: Dark Bargainer')
    expect(pastLife.reduce((n, b) => n + b.value, 0)).toBe(15)
  }, 120_000)
})
