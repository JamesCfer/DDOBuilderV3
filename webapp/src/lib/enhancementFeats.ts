// The feat context enhancement / destiny / reaper item requirements are
// evaluated against.
//
// V2 checks an item's `Feat` / `FeatAnySource` requirement against
// Build::CurrentFeats (trained feats, class and race automatic feats, special
// feats such as past lives and favor) and, for FeatAnySource, falls back to
// Build::IsGrantedFeat (GrantFeat effects from trained enhancements, destinies
// and gear). Requirement.cpp:877-938.
//
// TreeGrid used to evaluate with no feat context at all, which reads only the
// slot-trained feats. A Wizard (granted Magical Training at level 1) or a
// build that got Magical Training from an enhancement could therefore never
// open Feydark Illusionist, whose first core needs FeatAnySource "Magical
// Training".

import type { CharacterBuild, DDOClass, EnhancementTree, Feat, Race } from '../types/ddo'
import { prereqFeatCounts } from './featEligibility'
import { buildFeatCountMap } from './treeAvailability'

type RawEffect = { Type?: unknown; Item?: unknown; Rank?: unknown }

function asList<T>(raw: T | T[] | undefined | null): T[] {
  if (raw == null) return []
  return Array.isArray(raw) ? raw : [raw]
}

function addGranted(effects: unknown, rank: number, out: Set<string>): void {
  for (const e of asList(effects as RawEffect | RawEffect[])) {
    const types = asList(e?.Type as string | string[])
    if (!types.includes('GrantFeat')) continue
    // V2 EnhancementTreeItem::GetEffects: an effect with a <Rank> applies only
    // at exactly that rank.
    if (e.Rank != null && Number(e.Rank) !== rank) continue
    for (const name of asList(e.Item as string | string[])) {
      if (typeof name === 'string' && name) out.add(name)
    }
  }
}

/**
 * Feats granted by GrantFeat effects on trained enhancement, destiny and
 * reaper items (the item's own effects plus the chosen selection's).
 */
export function treeGrantedFeats(build: CharacterBuild, allTrees: EnhancementTree[]): Set<string> {
  const out = new Set<string>()
  const byName = new Map(allTrees.map(t => [t.Name, t]))
  const pools: Array<[Record<string, Record<string, number>> | undefined, Record<string, Record<string, string>> | undefined]> = [
    [build.enhancementChoices, build.enhancementSelections],
    [build.destinyChoices, build.destinySelections],
    [build.reaperChoices, build.reaperSelections],
  ]
  for (const [choicesByTree, selectionsByTree] of pools) {
    for (const [treeName, choices] of Object.entries(choicesByTree ?? {})) {
      const tree = byName.get(treeName)
      if (!tree || !choices) continue
      const selections = selectionsByTree?.[treeName] ?? {}
      for (const item of tree.EnhancementTreeItem ?? []) {
        const key = item.InternalName ?? item.Name
        const rank = choices[key] ?? choices[item.Name] ?? 0
        if (rank <= 0) continue
        addGranted(item.Effect, rank, out)
        const chosen = selections[key] ?? selections[item.Name]
        if (!chosen) continue
        for (const group of item.Selector ?? []) {
          for (const sel of group.EnhancementSelection ?? []) {
            if (sel.Name === chosen) addGranted(sel.Effect, rank, out)
          }
        }
      }
    }
  }
  return out
}

export interface TreeItemFeatContext {
  feats: Set<string>
  featCounts: Record<string, number>
  grantedFeats: Set<string>
}

/**
 * Feat context for evaluating tree-item requirements, ready to spread into a
 * RequirementContext.
 */
export function treeItemFeatContext(
  build: CharacterBuild,
  allClasses: DDOClass[],
  race: Race | undefined,
  allTrees: EnhancementTree[],
  specialFeats: string[] = [],
  allFeats?: Feat[],
): TreeItemFeatContext {
  // Every level the build has: automatic feats up to the top character level.
  const featCounts = prereqFeatCounts(build, Number.MAX_SAFE_INTEGER, allClasses, race, specialFeats, allFeats)
  // Past lives also under their bare key ("Human"), as tree requirements and
  // buildFeatCountMap name them.
  for (const [name, n] of Object.entries(buildFeatCountMap(build, specialFeats))) {
    featCounts[name] = Math.max(featCounts[name] ?? 0, n)
  }
  return {
    feats: new Set(Object.keys(featCounts)),
    featCounts,
    grantedFeats: treeGrantedFeats(build, allTrees),
  }
}
