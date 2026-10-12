// Colour identity for bonus types in the breakdown tooltips.
//
// DDO has dozens of bonus types, far more than colour can tell apart. So the
// eight that matter most when planning gear each get a fixed slot, and every
// other type folds into one neutral "other" swatch. The type's name is always
// printed beside its swatch, so colour is never the only cue.
//
// Slots are fixed per type, never assigned by rank: Insightful is the same
// blue on every stat, whatever else is on it. The colours themselves are CSS
// tokens (--bonus-1 .. --bonus-8, --bonus-other in styles/theme.css) so light
// themes can step them for their surface.

const SLOTS: Record<string, number> = {
  'Insightful': 1,
  'Artifact': 2,
  'Quality': 3,
  'Enhancement': 4,
  'Sacred': 5,
  'Luck': 6,
  'Exceptional': 7,
  'Profane': 8,
}

/** Slot 1..8 for the highlighted types, 0 for everything else. */
export function bonusTypeSlot(type: string): number {
  return SLOTS[type.trim()] ?? 0
}

/** CSS colour for a bonus type's swatch. */
export function bonusTypeColor(type: string): string {
  const slot = bonusTypeSlot(type)
  return slot ? `var(--bonus-${slot})` : 'var(--bonus-other)'
}
