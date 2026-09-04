import type { Item, ItemBuff } from '../types/ddo'
import { itemMatchesType } from './itemFilters'
import { buffSearchText } from './itemDisplay'
import { matchesTerms, itemSearchText, searchTerms } from './searchMatch'
import type { WeaponGroupSpec } from './weapons/groups'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

export interface FindGearQuery {
  /** Exact match on ItemBuff.Type */
  buffType?: string
  /** Free text matched against each buff's effect description: its rendered
   *  line ("+15 Intelligence (Enhancement)"), its raw <Type>, its bonus type
   *  and its target stat. Every whitespace-separated term must appear, so
   *  "insightful constitution" narrows where "constitution" alone would not. */
  buffSearch?: string
  /** Minimum ItemBuff.Value1 (applied after buff type filter) */
  minValue?: number
  minLevel?: number
  maxLevel?: number
  /** Free text matched against the item's name, description and set bonuses. */
  nameSearch?: string
  /** Item type token from `itemFilters` — e.g. `wt:Longsword`, `ar:Medium`,
   *  `wg:Two Handed`, `cat:shield`, `special:artifact`. */
  itemType?: string
  /** WeaponGroupings.xml data, needed only to resolve `wg:` tokens. */
  weaponGroups?: WeaponGroupSpec[]
}

export interface FindGearResult {
  item: Item
  /** Keys from item.EquipmentSlot */
  slots: string[]
  /** The buffs that matched the query (all buffs when no buff filter is set) */
  matchedBuffs: ItemBuff[]
}

/**
 * Filter `items` by the given query and return matching results sorted by
 * MinLevel ascending then name. Implements V2 FindGearDialog cross-slot search.
 */
export function findGearByEffect(items: Item[], query: FindGearQuery): FindGearResult[] {
  const { buffType, buffSearch, minValue, minLevel, maxLevel, nameSearch, itemType, weaponGroups } =
    query
  // Split once, not per item: the catalogue is 8779 entries long.
  const nameTerms = searchTerms(nameSearch)
  const buffTerms = searchTerms(buffSearch)

  const results: FindGearResult[] = []

  for (const item of items) {
    const lvl = item.MinLevel ?? 1
    if (minLevel != null && lvl < minLevel) continue
    if (maxLevel != null && lvl > maxLevel) continue
    if (nameTerms.length > 0 && !matchesTerms(itemSearchText(item), nameTerms)) continue
    if (itemType && !itemMatchesType(item, itemType, weaponGroups)) continue

    const allBuffs = toArray(item.Buff as ItemBuff | ItemBuff[] | undefined)
    let matchedBuffs: ItemBuff[]

    if (buffType) {
      matchedBuffs = allBuffs.filter(b => b.Type === buffType)
      if (matchedBuffs.length === 0) continue
    } else if (buffTerms.length > 0) {
      matchedBuffs = allBuffs.filter(b => matchesTerms(buffSearchText(b), buffTerms))
      if (matchedBuffs.length === 0) continue
    } else {
      matchedBuffs = allBuffs
    }

    if (minValue != null) {
      matchedBuffs = matchedBuffs.filter(b => (b.Value1 ?? 0) >= minValue)
      if (matchedBuffs.length === 0) continue
    }

    const slots = Object.keys(item.EquipmentSlot ?? {})
    results.push({ item, slots, matchedBuffs })
  }

  return results.sort(
    (a, b) => (a.item.MinLevel ?? 0) - (b.item.MinLevel ?? 0) || a.item.Name.localeCompare(b.item.Name),
  )
}
