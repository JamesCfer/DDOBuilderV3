// V2 Build::AutomaticFeats skips a class's automatic feat when the character
// already holds it as many times as Feat::MaxTimesAcquire allows, counting
// feats trained at that character level or earlier. Fuzz seeds 8443 and 8494
// train Greater Pact Attunement / Pact Attunement in a heroic slot before
// Acolyte of the Skin grants it, so V2 applies it once. V3 applied both the
// trained copy and the class grant (+2 Eldritch Blast d6 and d8 too many).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))
const statsOf = (seed: number) => computeV3ForXml(
  readFileSync(join(ROOT, 'Output', 'FuzzBuilds', `fuzz-${seed}.DDOBuild`), 'utf8'), cat).stats

describe('a class auto feat already trained earlier is not granted again', () => {
  it('fuzz-8443: Greater Pact Attunement trained at 18 counts once', () => {
    const s = statsOf(8443)
    expect(s.total('eldritchBlast.d6')).toBe(6)
    expect(s.total('eldritchBlast.d8')).toBe(7)
  })
  it('fuzz-8494: Pact Attunement trained at 15 counts once', () => {
    const s = statsOf(8494)
    expect(s.total('eldritchBlast.d6')).toBe(4)
    expect(s.total('eldritchBlast.d8')).toBe(5)
  })
})
