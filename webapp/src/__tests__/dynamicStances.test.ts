/**
 * Dynamic stance toggles — V2 CStancesPane parity.
 *
 * V2 surfaces a toggle for every <Stance> block hosted on something the
 * build has acquired: trained tree items (destiny MANTLES like "Holy
 * Mantle"), equipped items via their ItemBuffs.xml template ("Enhanced
 * Bloodrage" on Legendary Blood-Stained Doctor's Gloves), trained spells,
 * and trained feats. V3's Stances panel previously showed only the static
 * Stances.xml list, so none of these build-specific toggles existed in the
 * UI. Group semantics: named groups other than "User"/"Metamagics" are
 * single-selection (StancesPane.cpp:388, StanceGroup.cpp:16-19).
 *
 * Fixture: the committed golden build (exampledps) trains Divine Crusader
 * ("Holy Mantle", group "Mantle") + Fury of the Wild ("Mantle of Fury") and
 * wears the Bloodrage gloves.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { loadAllCatalogues } from '../server/dataLoaders'
import {
  collectDynamicStances, isSingleSelectionGroup,
} from '../lib/stances/dynamicStances'
import type { Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'exampledps.DDOBuild')
const have = existsSync(DATA) && existsSync(FIXTURE)

describe('single-selection group rule (V2 StanceGroup)', () => {
  it('named groups are single-selection; User/Metamagics/Auto are not', () => {
    expect(isSingleSelectionGroup('Mantle')).toBe(true)
    expect(isSingleSelectionGroup('User')).toBe(false)
    expect(isSingleSelectionGroup('Metamagics')).toBe(false)
    expect(isSingleSelectionGroup('Auto')).toBe(false)
  })
})

describe.skipIf(!have)('collectDynamicStances on the golden build', () => {
  const cat = loadAllCatalogues(DATA)
  const { build } = importV2Build(readFileSync(FIXTURE, 'utf-8'))
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }
  const itemBuffTemplates = new Map<string, unknown>(
    cat.allItemBuffs.map(b => [(b as { Type: string }).Type, b]),
  )
  const stances = collectDynamicStances(build, {
    allTrees: cat.allTrees,
    allFeats: cat.allFeats,
    allSpells: cat.allSpells,
    itemBuffTemplates,
    gearItems,
  })
  const byName = new Map(stances.map(s => [s.name, s]))

  it('surfaces the trained destiny mantle as a "Mantle"-group toggle', () => {
    const s = byName.get('Mantle of Fury')
    expect(s?.group).toBe('Mantle')
    expect(s?.source).toContain('Fury of the Wild')
  })

  it('surfaces the Enhanced Bloodrage stance from equipped gear via its ItemBuffs template', () => {
    const s = byName.get('Enhanced Bloodrage')
    expect(s).toBeTruthy()
    expect((s?.source ?? '').length).toBeGreaterThan(0)
  })

  it('does not surface stances from untrained enhancements', () => {
    // "Holy Mantle" is listed in the file's stale V2 ActiveStances but the
    // Divine Crusader mantle enhancement itself is NOT trained — V2 only
    // surfaces a toggle when the hosting enhancement is trained.
    expect(byName.has('Holy Mantle')).toBe(false)
    // Legendary Dreadnought is not one of the three selected destinies.
    expect(byName.has('Master\'s Blitz')).toBe(false)
  })

  it('every stance has a non-empty name, group, and source', () => {
    for (const s of stances) {
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.group.length).toBeGreaterThan(0)
      expect(s.source.length).toBeGreaterThan(0)
    }
  })
})
