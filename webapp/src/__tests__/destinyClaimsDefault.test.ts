// Epic destiny claims (Feats.xml Acquire=EpicDestinyTree) moved from the Past
// Lives panel to the Epic Destinies panel and default to all claimed on new
// builds. Saved builds and imported V2 files keep their own claim state.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { migrateLoad } from '../context/CharacterContext'
import { emptyBuild, EPIC_DESTINY_CLAIMS, pastLifeCount } from '../types/ddo'
import { importV2Build } from '../lib/v2Import'
import { exportV2Build } from '../lib/v2Export'
import { loadAllCatalogues } from '../server/dataLoaders'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')
const haveData = existsSync(DATA)
const haveFixture = existsSync(FIXTURE)

describe('destiny claims default', () => {
  it('a new build has every epic destiny claimed', () => {
    const b = emptyBuild()
    for (const name of EPIC_DESTINY_CLAIMS) expect(b.pastLives[name]).toBe(1)
  })

  it('claims do not count as past lives', () => {
    expect(pastLifeCount(emptyBuild().pastLives)).toBe(0)
    expect(pastLifeCount({ ...emptyBuild().pastLives, Bard: 2 })).toBe(2)
  })

  it('a saved build keeps its stored claims (no default re-applied on load)', () => {
    const saved = { ...emptyBuild(), pastLives: { 'Divine Crusader': 1, 'Shadowdancer': 0, Bard: 3 } }
    const loaded = migrateLoad(JSON.parse(JSON.stringify(saved)))
    expect(loaded.pastLives).toEqual({ 'Divine Crusader': 1, 'Shadowdancer': 0, Bard: 3 })
  })
})

describe.skipIf(!haveData)('destiny claim list against the catalogue', () => {
  it('matches every Acquire=EpicDestinyTree feat', () => {
    const cat = loadAllCatalogues(DATA)
    const names = cat.allFeats
      .filter(f => (f as { Acquire?: string }).Acquire === 'EpicDestinyTree')
      .map(f => f.Name)
      .sort()
    expect([...EPIC_DESTINY_CLAIMS].sort()).toEqual(names)
  })
})

describe.skipIf(!haveFixture)('V2 import/export of destiny claims', () => {
  const xml = readFileSync(FIXTURE, 'utf-8')

  it('imports the file\'s claims once each (not stacked on the new-build default)', () => {
    const { build } = importV2Build(xml)
    for (const name of EPIC_DESTINY_CLAIMS) {
      expect(build.pastLives[name]).toBe(1)
      expect(build.pastLifeTypes?.[name]).toBe('EpicDestinyTree')
    }
  })

  it('a V2 file with no claims imports with none claimed', () => {
    const stripped = xml.replace(/<TrainedFeat>(?:(?!<\/TrainedFeat>)[\s\S])*?<Type>EpicDestinyTree<\/Type>(?:(?!<\/TrainedFeat>)[\s\S])*?<\/TrainedFeat>/g, '')
    expect(stripped).not.toContain('EpicDestinyTree')
    const { build } = importV2Build(stripped)
    for (const name of EPIC_DESTINY_CLAIMS) expect(build.pastLives[name] ?? 0).toBe(0)
  })

  it('exports claims as V2 EpicDestinyTree special feats', () => {
    const out = exportV2Build(emptyBuild())
    const count = (out.match(/<Type>EpicDestinyTree<\/Type>/g) ?? []).length
    expect(count).toBe(EPIC_DESTINY_CLAIMS.length)
  })
})
