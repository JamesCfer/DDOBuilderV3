// AP spend accounting for enhancement / destiny / reaper trees.
//
// The same "how many points has this tree eaten" arithmetic was copy-pasted
// into EnhancementTreePanel, EpicDestiniesPanel and ReaperPanel, and the
// engine had no access to it at all — which is how a build could carry AP
// spent in a tree it can no longer reach: the panel counted those points in
// its header while showing no tree to account for them.

import type { EnhancementTree, EnhancementTreeItem } from '../types/ddo'

export type TreeChoices = Record<string, number>

/** `CostPerRank` arrives as a string, a number, or a text node — normalise to
 *  the string form the per-rank parser expects. */
export function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw || '1'
  if (typeof raw === 'object' && !Array.isArray(raw) && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    if (t != null) return String(t) || '1'
  }
  return '1'
}

/**
 * V2 `EnhancementTreeItem::CostPerRank` is a per-rank list ("2 1 1" = 2 AP for
 * the first rank, 1 for each after). A single value applies to every rank; no
 * value at all means 1 AP per rank.
 */
export function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const maxRanks = typeof item.Ranks === 'number' ? item.Ranks : 1
  const parts = normalizeCostPerRank(item.CostPerRank).trim().split(/\s+/).map(Number).filter(isFinite)
  const costs = parts.length === 0
    ? Array(maxRanks).fill(1)
    : parts.length === 1
    ? Array(maxRanks).fill(parts[0])
    : Array.from({ length: maxRanks }, (_, i) => parts[i] ?? parts[parts.length - 1])
  return costs.slice(0, rank).reduce((a: number, b: number) => a + b, 0)
}

/** Total AP spent in one tree. Accepts either key form (V2 InternalName or
 *  the display Name — older V3 saves used the latter). */
export function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const key = item.InternalName ?? item.Name
    return sum + costUpToRank(item, choices[key] ?? choices[item.Name] ?? 0)
  }, 0)
}
