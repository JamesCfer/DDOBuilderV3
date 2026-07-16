// Epic Destiny helpers (V2 parity). Pure functions so the parity tests can
// exercise the Tier-5 lock and tree-availability rules directly.

import type { CharacterBuild, DDOClass, EnhancementTree, EnhancementTreeItem, Race } from '../types/ddo'
import { meetsRequirements } from './requirements'
import { destinyPointPool } from './v2Formulas'

/**
 * The build's destiny point pool. `destinyPointPool` mirrors V2's
 * BreakdownItemDestinyAps control flow and expects the FULL character level
 * (V2 Build::Level() — heroic + epic + legendary); V3's `build.totalLevel`
 * is heroic-only, so the epic/legendary levels must be added back or a
 * level-34 build computes a pool with no epic/legendary points at all.
 */
export function destinyPoolForBuild(
  build: CharacterBuild,
  fatePoints = 0,
  destinyApBonus = 0,
): number {
  const charLevel = (build.totalLevel ?? 0) + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  return destinyPointPool(charLevel, fatePoints) + destinyApBonus
}

function rankOf(choices: Record<string, number>, item: EnhancementTreeItem): number {
  return choices[item.InternalName ?? item.Name] ?? choices[item.Name] ?? 0
}

/**
 * The single destiny tree that currently holds a trained Tier-5 enhancement,
 * or '' if none. V2 (Build::Destiny_TrainEnhancement): training a Tier-5 sets
 * the "Tier5Tree" and locks every other selected tree's Tier-5 items until it
 * is revoked.
 */
export function tier5LockedTree(
  selectedTrees: readonly string[],
  destinyChoices: Record<string, Record<string, number>>,
  trees: EnhancementTree[],
): string {
  for (const name of selectedTrees) {
    if (!name) continue
    const tree = trees.find(t => t.Name === name)
    const choices = destinyChoices[name]
    if (!tree || !choices) continue
    const hasTrainedTier5 = (tree.EnhancementTreeItem ?? []).some(
      it => it.Tier5 === true && rankOf(choices, it) > 0,
    )
    if (hasTrainedTier5) return name
  }
  return ''
}

/**
 * Destiny trees available for selection. V2 keys availability off each tree's
 * <Requirements> — a same-named "claim" feat (Acquire=EpicDestinyTree). All
 * epic destinies are accessible at epic levels (character level >= 20), so we
 * treat those claim feats as granted, then evaluate the tree's requirements
 * (so any tree with extra class/race/level requirements is still filtered).
 */
export function availableDestinyTrees(
  destinyTrees: EnhancementTree[],
  build: CharacterBuild,
  allClasses: DDOClass[],
  race?: Race,
): EnhancementTree[] {
  if ((build.totalLevel ?? 0) < 20) return []
  const feats = new Set<string>(Object.values(build.featChoices ?? {}).filter(Boolean) as string[])
  for (const t of destinyTrees) feats.add(t.Name)
  return destinyTrees.filter(t => meetsRequirements(t.Requirements, { build, allClasses, race, feats }))
}
