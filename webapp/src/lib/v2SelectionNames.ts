// V2 enhancement selection names that carry stray whitespace in the data.
// V2 matches a trained <Selection> by its exact name, and Arcane Archer's
// "Elemental Damage" option is spelled "Elemental Damage " (Elemental Arrows
// III) and "Elemental Damage  " (IV) to keep the two distinct. V3's XML parser
// trims values, so exports must restore the exact spelling or V2 drops the
// selection. Keyed by enhancement InternalName. The v2SelectionWhitespace test
// rescans the data so this list cannot go stale after a V2 sync.
export const V2_SELECTION_NAMES: Readonly<Record<string, string>> = {
  AAElementalArrowsIII: 'Elemental Damage ',
  AAElementalArrowsIV: 'Elemental Damage  ',
  AAElfElementalArrowsIII: 'Elemental Damage ',
  AAElfElementalArrowsIV: 'Elemental Damage  ',
}

/** The selection name exactly as V2's data spells it. */
export function v2SelectionName(enhancement: string, selection: string): string {
  const raw = V2_SELECTION_NAMES[enhancement]
  return raw !== undefined && raw.trim() === selection.trim() ? raw : selection
}
