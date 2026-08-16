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
import { computeTreeSpent } from './enhancementSpend'

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
 * Every feat named by a `Feat` requirement anywhere in a tree's
 * `<Requirements>` block.
 *
 * For enhancement trees these are, without exception, ACCOUNT UNLOCKS rather
 * than build choices: the tree-access feat ("Feydark Illusionist Tree") or
 * the patron favor reward that grants it ("Summer Court Favor Rewards" ≥ 3).
 * No enhancement tree gates on a feat you pick in a feat slot — the
 * destiny-claim feats that look like it (Fatesinger, Shadowdancer, …) belong
 * to epic destiny trees, which `isEnhancementTree` already excludes.
 */
export function treeUnlockFeats(tree: EnhancementTree): string[] {
  const found: string[] = []
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'Requirement') {
        for (const req of (Array.isArray(value) ? value : [value]) as Array<Record<string, unknown>>) {
          if (req?.Type !== 'Feat') continue
          const item = req.Item
          for (const name of (Array.isArray(item) ? item : [item]) as string[]) {
            if (typeof name === 'string' && name) found.push(name)
          }
        }
      } else {
        walk(value)
      }
    }
  }
  walk(tree.Requirements)
  return [...new Set(found)]
}

/** True when the only thing standing between the build and this tree is an unlock feat. */
export function isUnlockGatedTree(
  tree: EnhancementTree,
  build: CharacterBuild,
  allClasses: DDOClass[],
  race: Race | undefined,
  specialFeats: string[] = [],
): boolean {
  if (!isEnhancementTree(tree)) return false
  const featCounts = buildFeatCountMap(build, specialFeats)
  const strict = meetsRequirements(tree.Requirements, {
    build, allClasses, race, feats: new Set(Object.keys(featCounts)), featCounts,
  })
  if (strict) return false
  return treeUnlockFeats(tree).length > 0
    && meetsRequirements(tree.Requirements, withUnlocks(tree, featCounts, build, allClasses, race))
}

function withUnlocks(
  tree: EnhancementTree,
  featCounts: Record<string, number>,
  build: CharacterBuild,
  allClasses: DDOClass[],
  race: Race | undefined,
) {
  const counts = { ...featCounts }
  // A large count so `Value`-thresholded favor requirements ("… ≥ 3") pass too.
  for (const name of treeUnlockFeats(tree)) counts[name] = Math.max(counts[name] ?? 0, 999)
  return { build, allClasses, race, feats: new Set(Object.keys(counts)), featCounts: counts }
}

export interface TreeAvailabilityOptions {
  /**
   * Treat a tree's own unlock feats as already earned (default true).
   *
   * V2 hides Feydark Illusionist, Falconry, Harper Agent, Horizon Walker,
   * Inquisitive and Vistani Knife Fighter until the build records the favor
   * reward that grants them. A planner is not the game client: the person
   * planning a build knows what their account has unlocked, and hiding six
   * universal trees behind bookkeeping they have to do first means they never
   * appear at all. So they are listed, and the picker labels them as favor
   * unlocks. Class, race and level gating is untouched — only `Feat`
   * requirements are waived, and only the tree's own.
   *
   * Pass false for strict V2 parity (oracle comparisons).
   */
  assumeUnlockFeats?: boolean
}

/**
 * The enhancement trees this build can see: requirement-engine evaluation of
 * each tree's <Requirements>, minus reaper/destiny trees, minus Legacy trees
 * the build hasn't pinned — with account-unlock feats assumed unless the
 * caller opts out (see TreeAvailabilityOptions).
 */
export function availableEnhancementTrees(
  trees: EnhancementTree[],
  build: CharacterBuild,
  allClasses: DDOClass[],
  race: Race | undefined,
  pinned: string[],
  specialFeats: string[] = [],
  options: TreeAvailabilityOptions = {},
): EnhancementTree[] {
  const assumeUnlockFeats = options.assumeUnlockFeats !== false
  const featCounts = buildFeatCountMap(build, specialFeats)
  const feats = new Set(Object.keys(featCounts))
  return trees.filter(tree => {
    if (!isEnhancementTree(tree) || !isLegacyTreeVisible(tree, pinned)) return false
    if (meetsRequirements(tree.Requirements, { build, allClasses, race, feats, featCounts })) return true
    if (!assumeUnlockFeats || treeUnlockFeats(tree).length === 0) return false
    return meetsRequirements(tree.Requirements, withUnlocks(tree, featCounts, build, allClasses, race))
  })
}

/**
 * Enhancement trees the build has AP sunk into but can no longer reach —
 * what's left behind when a class is swapped out or a level is re-assigned
 * (a Rogue's Assassin spend surviving a rebuild into Monk / Sacred Fist).
 *
 * V2 does not let those points linger: `CEnhancementsPane::DetermineTrees`
 * (EnhancementsPane.cpp:340-374) walks the selected trees, and for any that
 * is no longer compatible with the race/class setup calls
 * `Build::Enhancement_ResetEnhancementTree` — "no user confirmation for this
 * as they have already changed the base requirement that included the tree.
 * All APs spent in this tree have to be returned to the pool of those
 * available."
 *
 * V3 pruned only the PINNED list, so the spend stayed in the document:
 * invisible (no tree on screen owns it), still counted in the "N / 80 AP"
 * header, and still feeding its effects into the build.
 *
 * Returns the tree names, each with the AP it is holding. Availability is
 * evaluated with unlock feats assumed — the same list the picker shows — so a
 * favor-unlock tree is never treated as orphaned.
 */
export function orphanedEnhancementTrees(
  trees: EnhancementTree[],
  build: CharacterBuild,
  allClasses: DDOClass[],
  race: Race | undefined,
  specialFeats: string[] = [],
): Array<{ name: string; spent: number }> {
  // No catalogue, no judgement. A still-loading tree list would make every
  // tree look unavailable, and without the class catalogue every class-gated
  // tree's requirement fails — either would orphan a whole build's spend
  // (the failure mode of the V2-import regression in PARITY_TODO #142).
  if (trees.length === 0 || allClasses.length === 0) return []
  const pinned = build.enhancementPinned ?? []
  const available = new Set(
    availableEnhancementTrees(trees, build, allClasses, race, pinned, specialFeats).map(t => t.Name),
  )
  const out: Array<{ name: string; spent: number }> = []
  for (const [name, choices] of Object.entries(build.enhancementChoices ?? {})) {
    if (available.has(name)) continue
    const tree = trees.find(t => t.Name === name)
    // A tree that isn't in the catalogue at all is left alone — that is a
    // data-version mismatch, not a build the user changed.
    if (!tree || !isEnhancementTree(tree)) continue
    const spent = computeTreeSpent(tree, choices ?? {})
    if (spent > 0) out.push({ name, spent })
  }
  return out
}
