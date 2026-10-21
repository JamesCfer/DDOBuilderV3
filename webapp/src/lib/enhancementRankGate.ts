// V2 parity: rank-for-rank enhancement prerequisites.
//
// When an enhancement requires another multi-rank enhancement (and the
// requirement gives no explicit <Value>), each rank needs a matching rank of
// the prerequisite: Air Savant Pierce Electric Resistance rank 3 needs One
// with the Storm rank 3. meetsRequirements only checks "is it trained at all",
// so this is the second gate V2 applies on top.
//
// V2 sources:
//   Requirement.cpp MetEnhancements        train gate (trainedRanks < prereq ranks)
//   RequiresOneOf.cpp MetEnhancements      OR over the group's Enhancement entries
//   EnhancementTreeItem.cpp CanTrain       calls MetEnhancements with current ranks
//   SpendInTree.cpp HasTrainedDependants   revoke gate (dependant ranks >= ours blocks)
import type { Requirement, Requirements } from '../types/ddo'

/** Looks up the max ranks of an enhancement by InternalName; undefined if unknown. */
export type MaxRanksOf = (internalName: string) => number | undefined
/** Current trained ranks of an enhancement by InternalName (0 if untrained). */
export type RanksOf = (internalName: string) => number

function asArray<T>(v: T | T[] | undefined): T[] {
  return Array.isArray(v) ? v : v != null ? [v] : []
}

function reqItem(req: Requirement): string {
  return Array.isArray(req.Item) ? req.Item[0] ?? '' : req.Item ?? ''
}

// V2 Requirement::MetEnhancements for one Enhancement requirement.
function metEnhancement(
  req: Requirement, trainedRanks: number, ranksOf: RanksOf, maxRanksOf: MaxRanksOf,
): boolean {
  const name = reqItem(req)
  const ranks = ranksOf(name)
  if (ranks <= 0) return false
  const maxRanks = maxRanksOf(name)
  // Unknown or single-rank prerequisite: trained is enough.
  if (maxRanks === undefined || maxRanks === 1) return true
  if (req.Value != null && req.Value > 0) return ranks >= req.Value
  // Training rank (trainedRanks + 1) needs at least that many prerequisite ranks.
  return trainedRanks < ranks
}

/**
 * Can the next rank be trained, given the item currently has `trainedRanks`?
 * Only Enhancement requirements are considered; everything else is left to
 * meetsRequirements.
 */
export function enhancementRanksAllowNext(
  reqs: Requirements | undefined,
  trainedRanks: number,
  ranksOf: RanksOf,
  maxRanksOf: MaxRanksOf,
): boolean {
  if (!reqs) return true
  for (const r of asArray(reqs.Requirement)) {
    if (r.Type === 'Enhancement' && !metEnhancement(r, trainedRanks, ranksOf, maxRanksOf)) return false
  }
  for (const g of asArray(reqs.RequiresOneOf)) {
    const enh = asArray(g.Requirement).filter(r => r.Type === 'Enhancement')
    if (enh.length > 0 && !enh.some(r => metEnhancement(r, trainedRanks, ranksOf, maxRanksOf))) return false
  }
  return true
}

/** Does this Requirements block name `internalName` as an Enhancement prerequisite? */
export function requiresEnhancement(reqs: Requirements | undefined, internalName: string): boolean {
  if (!reqs) return false
  const all = [
    ...asArray(reqs.Requirement),
    ...asArray(reqs.RequiresOneOf).flatMap(g => asArray(g.Requirement)),
  ]
  return all.some(r => r.Type === 'Enhancement' && reqItem(r) === internalName)
}
