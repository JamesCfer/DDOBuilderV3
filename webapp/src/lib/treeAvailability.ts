// Enhancement-tree availability (V2 CEnhancementsPane::DetermineTrees parity).
//
// V2 (EnhancementsPane.cpp:316-340) decides which trees a build can see by
// evaluating each tree's <Requirements> block through the standard
// Requirement engine (EnhancementTree::MeetRequirements → Requirement::Met),
// then excluding reaper/destiny trees and un-trained Legacy trees. There is
// NO name matching: archetype classes reach their base class's trees via
// `BaseClass` requirements (Requirement.cpp:719 EvaluateBaseClass →
// Build::BaseClassLevels counts levels whose class OR its GetBaseClass()
// matches), iconic races see exactly the tree whose `Race` requirement names
// them (Requirement.cpp:988 EvaluateRace, strict equality), and universal
// trees gate on their tree-access feat (`Feat` requirement, counting
// special/favor acquisitions — Requirement.cpp:870 EvaluateFeat).
//
// V3 previously used a tree-name ↔ class/race-name substring heuristic in
// EnhancementTreePanel, which broke every archetype build (Arcane Trickster
// never matched "Thief-Acrobat"/"Mechanic", Dragon Lord never matched
// "Stalwart Defender"/"Vanguard", …) and iconic races ("Aasimar Scourge"
// never matched "Aasimar: Scourge of the Undead"). Worse, the panel prunes
// the pinned-tree list against the filtered set on mount, so imported V2
// builds silently LOST those trees' pins.

import type { CharacterBuild, DDOClass, EnhancementTree, Race } from '../types/ddo'
import { meetsRequirements } from './requirements'

export function isEnhancementTree(tree: EnhancementTree): boolean {
  return tree.IsReaperTree !== true && tree.IsEpicDestiny !== true
}

// V2 `EnhancementsPane.cpp:332` hides a `HasLegacy()` tree from the picker
// unless the character already has it trained (`SupportLegacyTrees()`).
export function isLegacyTreeVisible(tree: EnhancementTree, pinned: string[]): boolean {
  return tree.Legacy !== true || pinned.includes(tree.Name)
}

/**
 * Count every feat acquisition visible to tree requirements: trained feat
 * choices, past lives / character-level Special feats (name → count),
 * Life-level special feats (universal-tree access grants like "Harper Agent
 * Tree"), and repeatable Favor feats. Mirrors V2's
 * `Build::CurrentFeats` + `Life::GetSpecialFeatTrainedCount` union used by
 * `Requirement::EvaluateFeat`.
 */
export function buildFeatCountMap(
  build: CharacterBuild,
  specialFeats: string[] = [],
): Record<string, number> {
  const counts: Record<string, number> = {}
  const add = (name: string, n = 1) => {
    if (name) counts[name] = (counts[name] ?? 0) + n
  }
  for (const v of Object.values(build.featChoices)) add(v)
  for (const [name, n] of Object.entries(build.pastLives ?? {})) add(name, n)
  for (const f of build.favorFeats ?? []) add(f)
  for (const f of specialFeats) add(f)
  return counts
}

/**
 * The enhancement trees this build can see (V2 DetermineTrees parity):
 * requirement-engine evaluation of each tree's <Requirements>, minus
 * reaper/destiny trees, minus Legacy trees the build hasn't pinned.
 */
export function availableEnhancementTrees(
  trees: EnhancementTree[],
  build: CharacterBuild,
  allClasses: DDOClass[],
  race: Race | undefined,
  pinned: string[],
  specialFeats: string[] = [],
): EnhancementTree[] {
  const featCounts = buildFeatCountMap(build, specialFeats)
  const feats = new Set(Object.keys(featCounts))
  return trees.filter(tree =>
    isEnhancementTree(tree) &&
    isLegacyTreeVisible(tree, pinned) &&
    meetsRequirements(tree.Requirements, { build, allClasses, race, feats, featCounts }))
}
