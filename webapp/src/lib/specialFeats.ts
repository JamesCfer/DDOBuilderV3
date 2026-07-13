// V2 `CSpecialFeatPane` / `CFeatSelectionDialog` parity for the "Special" and
// "Favor" feat groups (SpecialFeatsPane.cpp, FeatSelectionDialog.cpp:141-191).
//
// V2 trains/revokes these by left/right-clicking a feat tile, capped by
// `Feat::MaxTimesAcquire()` (default 1):
//   - Acquire=Special  → `Build::TrainSpecialFeat` → `Life::TrainSpecialFeat`
//     falls through to `Character::TrainSpecialFeat` for pure Special feats
//     (not UniversalTree/PastLife), which V3 already models as a counted
//     entry in `build.pastLives` + `build.pastLifeTypes` (parity pass N9 /
//     `v2Import.ts:585-592`).
//   - Acquire=Favor    → `Build::TrainSpecialFeat` appends a copy to
//     `Build::m_FavorFeats` (a flat, order-independent list allowing repeats);
//     revoke removes the first occurrence.
//
// These are pure functions so the panel (and the reducer) can share one
// source of truth without duplicating the counting/capping logic.

import type { CharacterBuild } from '../types/ddo'

export function specialFeatTrainedCount(
  build: Pick<CharacterBuild, 'pastLives'>,
  featName: string,
): number {
  return build.pastLives[featName] ?? 0
}

export function canTrainSpecialFeat(
  build: Pick<CharacterBuild, 'pastLives'>,
  featName: string,
  maxTimesAcquire: number,
): boolean {
  return specialFeatTrainedCount(build, featName) < maxTimesAcquire
}

export function canRevokeSpecialFeat(
  build: Pick<CharacterBuild, 'pastLives'>,
  featName: string,
): boolean {
  return specialFeatTrainedCount(build, featName) > 0
}

/** Returns the `pastLives`/`pastLifeTypes` patch for training one copy of a Special feat. */
export function trainSpecialFeat(
  build: Pick<CharacterBuild, 'pastLives' | 'pastLifeTypes'>,
  featName: string,
): Pick<CharacterBuild, 'pastLives' | 'pastLifeTypes'> {
  return {
    pastLives: { ...build.pastLives, [featName]: specialFeatTrainedCount(build, featName) + 1 },
    pastLifeTypes: { ...build.pastLifeTypes, [featName]: 'Special' },
  }
}

/** Returns the `pastLives` patch for revoking one copy of a Special feat (no-op below 0). */
export function revokeSpecialFeat(
  build: Pick<CharacterBuild, 'pastLives'>,
  featName: string,
): Pick<CharacterBuild, 'pastLives'> {
  const count = specialFeatTrainedCount(build, featName)
  if (count <= 0) return { pastLives: build.pastLives }
  return { pastLives: { ...build.pastLives, [featName]: count - 1 } }
}

export function favorFeatTrainedCount(
  build: Pick<CharacterBuild, 'favorFeats'>,
  featName: string,
): number {
  return (build.favorFeats ?? []).filter(f => f === featName).length
}

export function canTrainFavorFeat(
  build: Pick<CharacterBuild, 'favorFeats'>,
  featName: string,
  maxTimesAcquire: number,
): boolean {
  return favorFeatTrainedCount(build, featName) < maxTimesAcquire
}

export function canRevokeFavorFeat(
  build: Pick<CharacterBuild, 'favorFeats'>,
  featName: string,
): boolean {
  return favorFeatTrainedCount(build, featName) > 0
}

/** Appends one copy of `featName` to `favorFeats` (V2: push_back onto m_FavorFeats). */
export function trainFavorFeat(
  build: Pick<CharacterBuild, 'favorFeats'>,
  featName: string,
): string[] {
  return [...(build.favorFeats ?? []), featName]
}

/** Removes the first occurrence of `featName` from `favorFeats` (no-op if absent). */
export function revokeFavorFeat(
  build: Pick<CharacterBuild, 'favorFeats'>,
  featName: string,
): string[] {
  const feats = [...(build.favorFeats ?? [])]
  const idx = feats.indexOf(featName)
  if (idx >= 0) feats.splice(idx, 1)
  return feats
}
