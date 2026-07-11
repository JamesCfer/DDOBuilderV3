// communitySnapshot — computes the published-build stat snapshot server-side.
//
// Mirrors scripts/v2GoldenCompare.ts: resolve the active build's equipped gear
// against the item catalogue, then run the pure computeBuildStats aggregation
// (src/lib/buildStats.ts — no React involved) to extract the headline numbers
// shown in the community listing.

import type { CharacterDocument, Item } from '../types/ddo'
import { loadAllCatalogues } from './dataLoaders'
import { computeBuildStats } from '../lib/buildStats'
import { findActiveBuild } from '../lib/multiLife'
import { initBonusTypes } from '../lib/bonus'
import type { BuildSnapshot } from './communityStore'

export type Catalogues = ReturnType<typeof loadAllCatalogues>

export function buildSnapshotFromDocument(
  document: CharacterDocument,
  cat: Catalogues
): BuildSnapshot {
  if (!document || typeof document !== 'object' || !Array.isArray(document.lives)) {
    throw new Error('Invalid build document')
  }
  const build = findActiveBuild(document)
  if (!build || !Array.isArray(build.classes) || typeof build.totalLevel !== 'number') {
    throw new Error('Build document has no active build')
  }

  if (cat.allBonusTypes.length > 0) initBonusTypes(cat.allBonusTypes)

  // Resolve equipped gear names to full Item objects (v2GoldenCompare parity).
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear ?? {})) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }

  const stats = computeBuildStats({
    allClasses: cat.allClasses,
    allRaces: cat.allRaces,
    allFeats: cat.allFeats,
    allTrees: cat.allTrees,
    allSelfBuffs: cat.allSelfBuffs,
    allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses,
    allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees,
    allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells,
    allGuildBuffs: cat.allGuildBuffs,
    gearItems,
  }, build)

  const activeClasses = build.classes.filter(c => c.name && c.levels > 0)
  return {
    race: build.race,
    classes: activeClasses.map(c => c.name),
    classesLabel: activeClasses.map(c => `${c.name} ${c.levels}`).join(' / '),
    totalLevel: build.totalLevel,
    hp: stats.total('hp'),
    ac: stats.total('ac'),
    prr: stats.total('prr'),
    mrr: stats.total('mrr'),
    meleePower: stats.total('melee.power'),
    rangedPower: stats.total('ranged.power'),
  }
}
