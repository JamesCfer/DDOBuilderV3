// V2 Build::IsStanceActive (Build.cpp:3899-3910) special-cases the stance
// name "FavoredWeapon", which Grace of Battle and Knowledge of Battle
// (FavoredSoul.class.xml) require: it is met when the "Favored Weapon" stance
// is active AND the build has Favored Soul levels of at least half its
// heroic level (min(20, Level()) / 2). No stance is literally named
// "FavoredWeapon", so V3 never met it and the Charisma / Wisdom to-hit and
// damage substitution never applied.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requirementsMet, type EffectContext } from '../lib/effectParser'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

function ctx(extra: Partial<EffectContext> = {}): EffectContext {
  return {
    race: 'Human', alignment: 'True Neutral',
    classLevels: {}, baseClassLevels: {}, totalLevel: 20,
    feats: new Set(), enhancements: new Set(),
    abilityTotals: {}, stances: new Set(), bab: 20,
    weaponTypes: new Set(),
    ...extra,
  }
}

const FAVORED = { Requirement: [{ Type: 'Stance', Item: 'FavoredWeapon' }] }

describe('FavoredWeapon stance requirement', () => {
  it('needs the Favored Weapon stance and half the heroic levels in Favored Soul', () => {
    const stances = new Set(['Favored Weapon'])
    expect(requirementsMet(FAVORED as never, ctx({ stances, classLevels: { 'Favored Soul': 10 } }))).toBe(true)
    expect(requirementsMet(FAVORED as never, ctx({ stances, classLevels: { 'Favored Soul': 9 } }))).toBe(false)
    expect(requirementsMet(FAVORED as never, ctx({ classLevels: { 'Favored Soul': 20 } }))).toBe(false)
    expect(requirementsMet(FAVORED as never, ctx({ stances, totalLevel: 7, classLevels: { 'Favored Soul': 3 } }))).toBe(true)
  })
})

describe('Grace of Battle (oracle-pinned)', () => {
  const ROOT = join(__dirname, '..', '..', '..')
  const SAVE = join(ROOT, 'Output', 'UserBuilds', 'collection', 'New Era Healer.DDOBuild')
  const DATA = join(ROOT, 'Output', 'DataFiles')
  // Life 1 build 1: a Favored Soul with Grace of Battle wielding a bastard
  // sword (a favored weapon). v2calc: main-hand attack 56, damage 36 (Charisma).
  it.skipIf(!existsSync(SAVE) || !existsSync(DATA))('New Era Healer life 1 build 1 uses Charisma like V2', () => {
    const xml = readFileSync(SAVE, 'utf8')
      .replace(/<ActiveLifeIndex>\d+/, '<ActiveLifeIndex>0')
      .replace(/<ActiveBuildIndex>\d+/, '<ActiveBuildIndex>0')
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.total('melee.toHit')).toBe(56)
  }, 120_000)
})
