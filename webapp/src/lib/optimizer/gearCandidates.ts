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

import type { Augment, Effect, Filigree, Item, ItemBuff } from '../../types/ddo'
import { parseEffect, parseItemBuff } from '../effectParser'
import { expandDerivedKeys } from '../combat/expectedDamage'
import type { ObjectiveSpec } from './objective'

/** Items evaluated per empty slot per round. */
export const DEFAULT_CANDIDATES_PER_SLOT = 24

/** Augments offered per colour, and filigrees offered per empty slot. */
export const DEFAULT_AUGMENTS_PER_COLOUR = 12
export const DEFAULT_FILIGREES = 16

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

/**
 * The stat keys a candidate must touch to be worth trying. Derived objectives
 * (Damage per Swing, Crit Multiplier) expand into the raw keys that feed them —
 * nothing parses to a derived key, so without this a derived objective matched
 * no gear, no augments and no filigrees at all, and the search had nothing to
 * evaluate.
 */
export function objectiveKeys(objective: ObjectiveSpec): Set<string> {
  return expandDerivedKeys(objective.stats.map(s => s.key))
}

/**
 * Relevance of an `Effect`-carrying entity (augment, filigree) — the same
 * crude read as `itemRelevance`, over Effects instead of item Buffs.
 */
export function effectRelevance(
  effects: Effect | Effect[] | undefined,
  source: string,
  objectiveKeys: ReadonlySet<string>,
): number {
  let score = 0
  for (const effect of toArray<Effect>(effects)) {
    let parsed
    try {
      parsed = parseEffect(effect, 1, source)
    } catch {
      continue
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
  const keys = objectiveKeys(objective)
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

/**
 * Shortlist augments per colour. `Type` may list several colours — the
 * augment is a candidate for each of them.
 */
export function shortlistAugments(
  augments: Augment[],
  objective: ObjectiveSpec,
  opts: ShortlistOptions,
): Record<string, Augment[]> {
  const keys = objectiveKeys(objective)
  const perColour = opts.perSlot ?? DEFAULT_AUGMENTS_PER_COLOUR
  const byColour = new Map<string, Array<{ augment: Augment; relevance: number }>>()
  for (const augment of augments) {
    if (Number(augment.MinLevel ?? 1) > opts.maxLevel) continue
    const relevance = effectRelevance(augment.Effect, augment.Name, keys)
    if (relevance <= 0) continue
    for (const colour of toArray<string>(augment.Type)) {
      if (!byColour.has(colour)) byColour.set(colour, [])
      byColour.get(colour)!.push({ augment, relevance })
    }
  }
  const out: Record<string, Augment[]> = {}
  for (const [colour, list] of byColour) {
    out[colour] = list
      .sort((a, b) => b.relevance - a.relevance || a.augment.Name.localeCompare(b.augment.Name))
      .slice(0, perColour)
      .map(c => c.augment)
  }
  return out
}

/** Shortlist filigrees. They carry no level requirement, so only relevance ranks them. */
export function shortlistFiligrees(
  filigrees: Filigree[],
  objective: ObjectiveSpec,
  perSlot = DEFAULT_FILIGREES,
): Filigree[] {
  const keys = objectiveKeys(objective)
  return filigrees
    .map(filigree => ({ filigree, relevance: effectRelevance(filigree.Effect, filigree.Name, keys) }))
    .filter(c => c.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || a.filigree.Name.localeCompare(b.filigree.Name))
    .slice(0, perSlot)
    .map(c => c.filigree)
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
