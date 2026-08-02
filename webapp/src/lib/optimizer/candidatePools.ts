// The shortlisted content the optimizer is allowed to choose from.
//
// Separate from the shortlisting itself (gearCandidates.ts) so the search
// strategies and the panel can pass the pools around as one value.

import type { Augment, Filigree, Item } from '../../types/ddo'

export interface CandidatePools {
  /** Equippable items per EMPTY display gear slot. */
  gearCandidates?: Record<string, Item[]>
  /** Augments per augment colour, for empty augment slots on equipped items. */
  augmentCandidates?: Record<string, Augment[]>
  /** Filigrees offered to empty weapon / artifact filigree slots. */
  filigreeCandidates?: Filigree[]
}
