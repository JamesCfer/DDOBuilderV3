// Shortlisting equippable items for the optimizer's gear domain.
//
// The item catalogue is ~10k items — 3686 of them main-hand weapons alone.
// One optimizer evaluation is a full computeBuildStats pass, so handing the
// raw catalogue to the move generator would burn the entire evaluation budget
// on a single round of one slot. Instead each empty slot contributes a small
// shortlist, ranked by a CHEAP static read of the item's own buffs: how much
// does this item claim to give of the stats the objective actually asks for?
//
// The ranking only decides who gets evaluated. Which shortlisted item (if
// any) is worth equipping is still settled by the real stat engine, with the
// build's full stacking rules — an item that ranks first here loses to a
// worse-looking one whenever its bonus type is already covered.

import type { Item, ItemBuff } from '../../types/ddo'
import { parseItemBuff } from '../effectParser'
import type { ObjectiveSpec } from './objective'

/** Items evaluated per empty slot per round. */
export const DEFAULT_CANDIDATES_PER_SLOT = 24

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

/**
 * How much of the objective's stats this item's buffs claim to provide.
 *
 * Deliberately crude: no requirement checks, no stacking, no context. It is a
 * relevance filter, not a score — 0 means "this item's buffs touch nothing
 * the objective asked for", which is the only judgement it needs to make
 * reliably.
 */
export function itemRelevance(item: Item, objectiveKeys: ReadonlySet<string>): number {
  let score = 0
  for (const buff of toArray<ItemBuff>(item.Buff)) {
    let parsed
    try {
      parsed = parseItemBuff(buff, item.Name)
    } catch {
      continue                      // malformed buff — not a reason to crash a run
    }
    for (const pb of parsed) {
      if (objectiveKeys.has(pb.statKey)) score += Math.abs(pb.value) || 1
    }
  }
  return score
}

export interface ShortlistOptions {
  /** Only items at or below this MinLevel are equippable. */
  maxLevel: number
  /** Items kept per slot. Defaults to DEFAULT_CANDIDATES_PER_SLOT. */
  perSlot?: number
}

/**
 * Rank one slot's items and keep the top few relevant ones.
 *
 * Items whose buffs touch none of the objective's stats are dropped outright
 * rather than padding the shortlist: equipping them cannot improve the
 * objective, so an evaluation spent on one is an evaluation wasted.
 */
export function shortlistForSlot(
  items: Item[],
  objective: ObjectiveSpec,
  opts: ShortlistOptions,
): Item[] {
  const keys = new Set(objective.stats.map(s => s.key))
  const perSlot = opts.perSlot ?? DEFAULT_CANDIDATES_PER_SLOT
  return items
    .filter(i => Number(i.MinLevel ?? 0) <= opts.maxLevel)
    .map(item => ({ item, relevance: itemRelevance(item, keys) }))
    .filter(c => c.relevance > 0)
    .sort((a, b) =>
      b.relevance - a.relevance
      // Deterministic tail: higher-level items first, then by name.
      || Number(b.item.MinLevel ?? 0) - Number(a.item.MinLevel ?? 0)
      || a.item.Name.localeCompare(b.item.Name))
    .slice(0, perSlot)
    .map(c => c.item)
}

/** Shortlist every slot of a `slot → items` catalogue. Empty lists are dropped. */
export function shortlistCandidates(
  bySlot: Record<string, Item[]>,
  objective: ObjectiveSpec,
  opts: ShortlistOptions,
): Record<string, Item[]> {
  const out: Record<string, Item[]> = {}
  for (const [slot, items] of Object.entries(bySlot)) {
    const kept = shortlistForSlot(items, objective, opts)
    if (kept.length > 0) out[slot] = kept
  }
  return out
}
