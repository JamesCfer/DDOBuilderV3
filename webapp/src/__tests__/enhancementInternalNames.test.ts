/**
 * Regression: the stat engine must resolve enhancement/destiny/reaper choice
 * keys by InternalName.
 *
 * V2 `.DDOBuild` files store TrainedEnhancement by `<EnhancementName>` — the
 * item's InternalName (e.g. "WCCore1") — and V3's TreeGrid UI ALSO writes
 * choices under `item.InternalName ?? item.Name` (TreeGrid.tsx itemKey).
 * But `accumulateEnhancementTree` / `computeTreeAP` / `collectEnhTree` /
 * `collectAvailableAttacks` looked up `choices[item.Name]` (display name)
 * only, so every enhancement, epic-destiny, and reaper effect resolved to
 * rank 0 and contributed NOTHING to computed stats — for imported and
 * UI-authored builds alike. (exclusionGroups.ts and the panels already did
 * the dual lookup, which is why the trees LOOKED right in the UI while the
 * Analysis numbers were missing all tree effects.)
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes, resetBonusTypes } from '../lib/bonus'
import type { Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')
const have = existsSync(DATA) && existsSync(FIXTURE)

describe.skipIf(!have)('enhancement choices keyed by InternalName reach the stat engine', () => {
  const cat = loadAllCatalogues(DATA)
  initBonusTypes(cat.allBonusTypes)
  const { build } = importV2Build(readFileSync(FIXTURE, 'utf-8'))

  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }

  const input: BuildStatsInput = {
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs, gearItems,
  }

  it('the imported build has InternalName-keyed enhancement spends (fixture sanity)', () => {
    const allKeys = Object.values(build.enhancementChoices).flatMap(c => Object.keys(c))
    expect(allKeys.length).toBeGreaterThan(0)
    // V2 InternalNames don't contain the "Tree: Ability" display format.
    expect(allKeys.some(k => !k.includes(':'))).toBe(true)
  })

  it('enhancement/destiny tree effects contribute to computed stats', () => {
    const withTrees = computeBuildStats(input, build)
    const withoutTrees = computeBuildStats(input, {
      ...build,
      enhancementChoices: {}, enhancementSelections: {},
      destinyChoices: {}, destinySelections: {},
      reaperChoices: {},
    })
    // An end-game build with 80+ spent AP must differ from the same build
    // with every tree wiped. Pre-fix both computed identical stats.
    const keysThatMustMove = ['hp']
    const moved = keysThatMustMove.filter(k => withTrees.total(k) !== withoutTrees.total(k))
    expect(moved).toEqual(keysThatMustMove)
  })

  it('at least one resolved hp bonus is sourced from a trained tree', () => {
    const stats = computeBuildStats(input, build)
    const treeNames = [
      ...Object.keys(build.enhancementChoices),
      ...Object.keys(build.destinyChoices),
      ...Object.keys(build.reaperChoices ?? {}),
    ]
    const sources = stats.resolve('hp').bonuses.map(b => b.source)
    expect(sources.some(s => treeNames.some(t => s.startsWith(`${t}:`)))).toBe(true)
  })

  it('cleanup', () => { resetBonusTypes() })
})
