// V2 has no "WeaponGroup" requirement type (RequirementTypes.h), so the one
// effect that uses it, Two Handed Specialty's "Hand and a Half" 1.6x damage
// ability multiplier (Legendary.class.xml), parses as Requirement_Unknown and
// Requirement::Met's default case returns false: V2 never applies it. V3
// passed unknown requirement types, so a bastard sword and board build got
// 2.7x Strength to damage instead of V2's 1.1x.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requirementsMet, type EffectContext } from '../lib/effectParser'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

function ctx(extra: Partial<EffectContext> = {}): EffectContext {
  return {
    race: 'Human', alignment: 'True Neutral',
    classLevels: {}, baseClassLevels: {}, totalLevel: 30,
    feats: new Set(), enhancements: new Set(),
    abilityTotals: {}, stances: new Set(), bab: 20,
    weaponTypes: new Set(['Bastard Sword']),
    ...extra,
  }
}

describe('WeaponGroup requirement', () => {
  it('is never met (not a V2 requirement type)', () => {
    const reqs = { Requirement: [{ Type: 'WeaponGroup', Item: 'Hand and a Half' }] }
    expect(requirementsMet(reqs as never, ctx({ weaponClassMain: new Set(['Hand and a Half']) }))).toBe(false)
  })
})

describe('Two Handed Specialty with a bastard sword (oracle-pinned)', () => {
  const ROOT = join(__dirname, '..', '..', '..')
  const SAVE = join(ROOT, 'Output', 'UserBuilds', 'collection', 'Warlocks.DDOBuild')
  const DATA = join(ROOT, 'Output', 'DataFiles')
  // Life 8 build 1: bastard sword and large shield with Two Handed
  // Specialty. v2calc: main-hand damage bonus 51.
  it.skipIf(!existsSync(SAVE) || !existsSync(DATA))('Warlocks life 8 main-hand damage matches V2', () => {
    const xml = readFileSync(SAVE, 'utf8')
      .replace(/<ActiveLifeIndex>\d+/, '<ActiveLifeIndex>7')
      .replace(/<ActiveBuildIndex>\d+/, '<ActiveBuildIndex>0')
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.total('melee.damage')).toBe(51)
  }, 120_000)
})
