// A build's chosen filigree slot counts must survive a save/load round trip.
// V2 EquippedGear::SetNumFiligrees (EquippedGear.cpp:466) keeps the filigree
// list sized exactly to the chosen count — blank entries included — so the
// count is data, not a display default.

import { describe, expect, it } from 'vitest'
import { reducer, migrateLoad, MAX_FILIGREE_SLOTS } from '../context/CharacterContext'
import { emptyBuild } from '../types/ddo'
import { exportV2Build } from '../lib/v2Export'
import { importV2Build } from '../lib/v2Import'
import type { CharacterBuild } from '../types/ddo'

/** Round trip through the storage migration, as LOAD_BUILD / document load do. */
const reload = (b: CharacterBuild) => migrateLoad(JSON.parse(JSON.stringify(b)) as CharacterBuild)

function buildWithCounts(weapon: number, artifact: number): CharacterBuild {
  let b = emptyBuild()
  b = reducer(b, { type: 'SET_FILIGREE_COUNT', count: weapon })
  b = reducer(b, { type: 'SET_ARTIFACT_FILIGREE_COUNT', count: artifact })
  return b
}

describe('filigree slot counts survive loading a build', () => {
  it('keeps a count larger than the old fixed defaults', () => {
    const loaded = reload(buildWithCounts(12, 14))
    expect(loaded.filigreeSlots).toHaveLength(12)
    expect(loaded.artifactFiligreeSlots).toHaveLength(14)
  })

  it('keeps a count smaller than the old fixed defaults', () => {
    const loaded = reload(buildWithCounts(3, 2))
    expect(loaded.filigreeSlots).toHaveLength(3)
    expect(loaded.artifactFiligreeSlots).toHaveLength(2)
  })

  it('keeps the filigrees themselves, not just the count', () => {
    let b = buildWithCounts(8, 3)
    b = reducer(b, { type: 'SET_FILIGREE', slotIndex: 7, name: 'Sucker Punch: Deception' })
    b = reducer(b, { type: 'SET_FILIGREE_RARE', slotIndex: 7, rare: true })
    b = reducer(b, { type: 'SET_ARTIFACT_FILIGREE', slotIndex: 2, name: 'Treachery: Deadly Strike' })
    const loaded = reload(b)
    expect(loaded.filigreeSlots[7]).toEqual({ name: 'Sucker Punch: Deception', rare: true })
    expect(loaded.artifactFiligreeSlots[2].name).toBe('Treachery: Deadly Strike')
  })

  it('still fills in defaults for a build saved before slots existed', () => {
    const legacy = { ...emptyBuild() } as Record<string, unknown>
    delete legacy.filigreeSlots
    delete legacy.artifactFiligreeSlots
    const loaded = migrateLoad(legacy as unknown as CharacterBuild)
    expect(loaded.filigreeSlots).toHaveLength(6)
    expect(loaded.artifactFiligreeSlots).toHaveLength(10)
  })

  it('clamps a corrupt oversized count to MAX_FILIGREE_SLOTS', () => {
    const raw = {
      ...emptyBuild(),
      filigreeSlots: Array.from({ length: 40 }, () => ({ name: '', rare: false })),
    } as unknown as CharacterBuild
    expect(migrateLoad(raw).filigreeSlots).toHaveLength(MAX_FILIGREE_SLOTS)
  })

  it('survives a V2 XML export/import round trip', () => {
    let b = buildWithCounts(9, 4)
    b = reducer(b, { type: 'SET_FILIGREE', slotIndex: 1, name: 'Sucker Punch: Deception' })
    b = reducer(b, { type: 'SET_ARTIFACT_FILIGREE', slotIndex: 0, name: 'Treachery: Deadly Strike' })
    const xml = exportV2Build(b)
    const loaded = importV2Build(xml).build
    expect(loaded.filigreeSlots).toHaveLength(9)
    expect(loaded.artifactFiligreeSlots).toHaveLength(4)
    expect(loaded.filigreeSlots[1].name).toBe('Sucker Punch: Deception')
    expect(loaded.artifactFiligreeSlots[0].name).toBe('Treachery: Deadly Strike')
  })
})
