// Free-text matching for the item and filigree pickers.
//
// Searching only a Name means the catalogue can only be found by a name the
// player already knows. Gear and filigrees carry the rest of what people
// actually search for in two other fields:
//   * `Description` — "+1 Charisma", "makes hitting incorporeal creatures
//                     easier", the flavour text naming the effect
//   * `SetBonus`    — the named set(s) the piece belongs to ("Angelic Wings",
//                     "Legendary Dread Isle")
// so all three are searched together.
//
// A query is matched term-by-term: every whitespace-separated term must appear
// somewhere in that text, in any order ("shadow goggle" finds the goggles
// described as attuned to the Shadowfell). Any single-term query therefore
// still behaves exactly like the old substring match.

import type { Filigree, Item } from '../types/ddo'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

// Searching runs over the whole catalogue (8779 items) on every keystroke, and
// descriptions are long — lower-casing them once per item and keeping it
// against the catalogue object costs one pass rather than one per keystroke.
// A WeakMap keeps nothing alive: entries go when the catalogue does.
const haystacks = new WeakMap<object, string>()

function haystackOf(source: object, parts: () => (string | undefined)[]): string {
  const cached = haystacks.get(source)
  if (cached !== undefined) return cached
  const text = parts().filter(Boolean).join('\n').toLowerCase()
  haystacks.set(source, text)
  return text
}

/** Everything an item is searchable by: name, description and set names. */
export function itemSearchText(item: Item): string {
  return haystackOf(item, () => [
    item.Name,
    item.Description,
    ...toArray(item.SetBonus),
  ])
}

/** Everything a filigree is searchable by: name, description and its set. */
export function filigreeSearchText(filigree: Filigree): string {
  return haystackOf(filigree, () => [
    filigree.Name,
    filigree.Description,
    ...toArray(filigree.SetBonus),
  ])
}

/** Splits a raw query into lower-cased terms; an empty query has no terms. */
export function searchTerms(query: string | undefined): string[] {
  return (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
}

/** True when every term of `query` appears in `text`. An empty query matches. */
export function matchesTerms(text: string, terms: string[]): boolean {
  return terms.every(t => text.includes(t))
}

/** Does the item match a free-text query (name / description / set bonus)? */
export function itemMatchesSearch(item: Item, query: string | undefined): boolean {
  const terms = searchTerms(query)
  if (terms.length === 0) return true
  return matchesTerms(itemSearchText(item), terms)
}

/** Does the filigree match a free-text query (name / description / set)? */
export function filigreeMatchesSearch(filigree: Filigree, query: string | undefined): boolean {
  const terms = searchTerms(query)
  if (terms.length === 0) return true
  return matchesTerms(filigreeSearchText(filigree), terms)
}
