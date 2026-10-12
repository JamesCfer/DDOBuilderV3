// V2 grants Completionist through its AutomaticAcquisition block, which
// requires character Level 3 (Feats.xml). DDOBuilder.cpp:494-550 only
// replaces the feat's past-life Requirements; Build::AutomaticFeats
// (Build.cpp:2527-2584) still needs the Level 3 acquisition met first, so a
// level 1 or 2 build never gets the +2 to abilities and skills. V3 granted it
// at any level.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildAutomaticFeatGroups } from '../lib/automaticFeats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import type { DDOClass } from '../types/ddo'
import { emptyBuild } from '../types/ddo'

describe('Completionist needs character level 3', () => {
  const classes = [{ Name: 'Rogue' } as unknown as DDOClass]
  const has = (totalLevel: number) => buildAutomaticFeatGroups(
    { ...emptyBuild(), totalLevel, pastLives: { Rogue: 1 } }, classes, [],
  ).some(g => g.source === 'Completionist')
  it('is not granted below level 3', () => {
    expect(has(1)).toBe(false)
    expect(has(2)).toBe(false)
  })
  it('is granted from level 3', () => {
    expect(has(3)).toBe(true)
    expect(has(20)).toBe(true)
  })
})

describe('Completionist level gate (oracle-pinned)', () => {
  const ROOT = join(__dirname, '..', '..', '..')
  const SAVE = join(ROOT, 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')
  const DATA = join(ROOT, 'Output', 'DataFiles')
  // Life 0 build 0 is a level 1 Monk with every past life. v2calc: DEX 24.
  it.skipIf(!existsSync(SAVE) || !existsSync(DATA))('Maetrim life 0 build 0 has no Completionist bonus', () => {
    const xml = readFileSync(SAVE, 'utf8')
      .replace(/<ActiveLifeIndex>\d+/, '<ActiveLifeIndex>0')
      .replace(/<ActiveBuildIndex>\d+/, '<ActiveBuildIndex>0')
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.total('ability.Dexterity')).toBe(24)
  }, 120_000)
})
