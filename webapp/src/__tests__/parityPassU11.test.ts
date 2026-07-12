/**
 * Parity pass U11 — Special / Favor feat train/revoke logic
 * (V2 `CSpecialFeatPane` / `CFeatSelectionDialog::OnFeatButtonLeftClick`/
 * `OnFeatButtonRightClick`, `FeatSelectionDialog.cpp:141-191`).
 *
 * V2's Special-feats pane lets the user left-click a feat tile to train it
 * (up to `Feat::MaxTimesAcquire()`, default 1) and right-click to revoke the
 * most recent copy. V3 had `build.pastLives`/`build.favorFeats` as pure
 * import/export/compute plumbing (Done #92/N9) but no component ever
 * mutated them — a build authored fresh in V3 could never acquire a Special
 * or Favor feat. `lib/specialFeats.ts` is the pure train/revoke/cap logic
 * the new UI (and the reducer) share.
 */

import { describe, it, expect } from 'vitest'
import { emptyBuild } from '../types/ddo'
import {
  specialFeatTrainedCount, canTrainSpecialFeat, canRevokeSpecialFeat,
  trainSpecialFeat, revokeSpecialFeat,
  favorFeatTrainedCount, canTrainFavorFeat, canRevokeFavorFeat,
  trainFavorFeat, revokeFavorFeat,
} from '../lib/specialFeats'

describe('U11 — Special feat train/revoke (build.pastLives + pastLifeTypes)', () => {
  it('training increments the count and tags the V2 Type for round-trip (N9/F5 parity)', () => {
    const build = emptyBuild()
    const patch = trainSpecialFeat(build, 'Inherent Melee Power')
    expect(patch.pastLives['Inherent Melee Power']).toBe(1)
    expect(patch.pastLifeTypes?.['Inherent Melee Power']).toBe('Special')
  })

  it('repeated training accumulates (Chrism re-redemption model)', () => {
    let build = emptyBuild()
    build = { ...build, ...trainSpecialFeat(build, 'Inherent Melee Power') }
    build = { ...build, ...trainSpecialFeat(build, 'Inherent Melee Power') }
    expect(specialFeatTrainedCount(build, 'Inherent Melee Power')).toBe(2)
  })

  it('caps training at MaxTimesAcquire, matching FeatSelectionDialog.cpp:154-155', () => {
    let build = emptyBuild()
    build = { ...build, ...trainSpecialFeat(build, 'Inherent Melee Power') }
    expect(canTrainSpecialFeat(build, 'Inherent Melee Power', 1)).toBe(false)
    expect(canTrainSpecialFeat(build, 'Inherent Melee Power', 4)).toBe(true)
  })

  it('revoke decrements and cannot go below 0', () => {
    let build = emptyBuild()
    build = { ...build, ...trainSpecialFeat(build, 'Tome of Destiny') }
    expect(canRevokeSpecialFeat(build, 'Tome of Destiny')).toBe(true)
    build = { ...build, ...revokeSpecialFeat(build, 'Tome of Destiny') }
    expect(specialFeatTrainedCount(build, 'Tome of Destiny')).toBe(0)
    expect(canRevokeSpecialFeat(build, 'Tome of Destiny')).toBe(false)
    // revoking an untrained feat is a no-op, not a negative count
    build = { ...build, ...revokeSpecialFeat(build, 'Tome of Destiny') }
    expect(specialFeatTrainedCount(build, 'Tome of Destiny')).toBe(0)
  })
})

describe('U11 — Favor feat train/revoke (build.favorFeats, Build::m_FavorFeats parity)', () => {
  it('training appends a copy', () => {
    const build = emptyBuild()
    const feats = trainFavorFeat(build, 'House Cannith Favor Rewards')
    expect(feats).toEqual(['House Cannith Favor Rewards'])
  })

  it('repeated training up to MaxTimesAcquire, then blocked', () => {
    let build = emptyBuild()
    build = { ...build, favorFeats: trainFavorFeat(build, 'House Cannith Favor Rewards') }
    expect(canTrainFavorFeat(build, 'House Cannith Favor Rewards', 2)).toBe(true)
    build = { ...build, favorFeats: trainFavorFeat(build, 'House Cannith Favor Rewards') }
    expect(favorFeatTrainedCount(build, 'House Cannith Favor Rewards')).toBe(2)
    expect(canTrainFavorFeat(build, 'House Cannith Favor Rewards', 2)).toBe(false)
  })

  it('revoke removes only the first occurrence (Build::RevokeSpecialFeat:3313-3328 parity)', () => {
    let build = emptyBuild()
    build = { ...build, favorFeats: ['A', 'B', 'A'] }
    build = { ...build, favorFeats: revokeFavorFeat(build, 'A') }
    expect(build.favorFeats).toEqual(['B', 'A'])
    expect(canRevokeFavorFeat(build, 'B')).toBe(true)
  })

  it('revoking an untrained favor feat is a no-op', () => {
    const build = { ...emptyBuild(), favorFeats: ['A'] }
    expect(revokeFavorFeat(build, 'Not Trained')).toEqual(['A'])
    expect(canRevokeFavorFeat(build, 'Not Trained')).toBe(false)
  })
})
