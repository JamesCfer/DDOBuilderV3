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
 *
 * Ranks are NOT capped at the item's current `Ranks`: V2 SpendInTree::EndElement
 * charges every saved rank (TrainedEnhancement::Cost falls back to the first
 * cost past the end of the list), so a build saved before an item dropped from
 * 3 ranks to 1 (Update 81 reaper clickies) keeps spending AP for all three.
 */
export function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const parts = normalizeCostPerRank(item.CostPerRank).trim().split(/\s+/).map(Number).filter(isFinite)
  let total = 0
  for (let i = 0; i < rank; i++) total += parts.length === 0 ? 1 : (parts[i] ?? parts[0])
  return total
}

/** Total AP spent in one tree. Accepts either key form (V2 InternalName or
 *  the display Name — older V3 saves used the latter). */
export function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const key = item.InternalName ?? item.Name
    return sum + costUpToRank(item, choices[key] ?? choices[item.Name] ?? 0)
  }, 0)
}

function effectList(raw: unknown): Array<{ Type?: unknown; Rank?: unknown }> {
  if (raw == null) return []
  return (Array.isArray(raw) ? raw : [raw]) as Array<{ Type?: unknown; Rank?: unknown }>
}

/** A GrantFeat effect among `effects` that fires on one of ranks now+1..was.
 *  V2 `EnhancementTreeItem::GetEffects` (EnhancementTreeItem.cpp:486-515)
 *  returns an effect with a <Rank> only for exactly that rank. */
function grantsFeat(effects: unknown, was: number, now: number): boolean {
  return effectList(effects).some(e => {
    const types = Array.isArray(e?.Type) ? e.Type : [e?.Type]
    if (!types.includes('GrantFeat')) return false
    if (e.Rank == null) return true
    const rank = Number(e.Rank)
    return rank > now && rank <= was
  })
}

/**
 * True when lowering a tree's spend from `before` to `after` revokes an
 * enhancement rank with a GrantFeat effect (its own effects or the chosen
 * selection's). V2 `Build::RevokeEnhancementEffects` (Build.cpp:3748-3822)
 * runs `VerifyGear` exactly then, unequipping gear whose requirements the
 * build no longer meets.
 */
export function revokedSpendGrantsFeat(
  tree: EnhancementTree,
  before: TreeChoices,
  after: TreeChoices,
  selections: Record<string, string> = {},
): boolean {
  for (const item of tree.EnhancementTreeItem ?? []) {
    const key = item.InternalName ?? item.Name
    const was = before[key] ?? before[item.Name] ?? 0
    const now = after[key] ?? after[item.Name] ?? 0
    if (was <= 0 || now >= was) continue
    if (grantsFeat(item.Effect, was, now)) return true
    const chosen = selections[key] ?? selections[item.Name]
    if (!chosen) continue
    for (const group of item.Selector ?? []) {
      for (const sel of group.EnhancementSelection ?? []) {
        if (sel.Name === chosen && grantsFeat(sel.Effect, was, now)) return true
      }
    }
  }
  return false
}
