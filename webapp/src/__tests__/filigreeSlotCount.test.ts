// Selectable filigree slot counts (V2 EquipmentPane "Num Filigrees" combo,
// MAX_FILIGREE = 20 in stdafx.h — same maximum for weapon and artifact).

import { describe, expect, it } from 'vitest'
import { reducer, MAX_FILIGREE_SLOTS } from '../context/CharacterContext'
import { emptyBuild } from '../types/ddo'

describe('filigree slot count actions', () => {
  it('grows the weapon slot array preserving existing selections', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_FILIGREE', slotIndex: 0, name: 'Treachery: Deadly Strike' })
    b = reducer(b, { type: 'SET_FILIGREE_COUNT', count: 12 })
    expect(b.filigreeSlots).toHaveLength(12)
    expect(b.filigreeSlots[0].name).toBe('Treachery: Deadly Strike')
    expect(b.filigreeSlots[11]).toEqual({ name: '', rare: false })
  })

  it('shrinks the array, dropping slots past the new count', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_FILIGREE_COUNT', count: 12 })
    b = reducer(b, { type: 'SET_FILIGREE', slotIndex: 11, name: 'Sucker Punch: Deception' })
    b = reducer(b, { type: 'SET_FILIGREE_COUNT', count: 3 })
    expect(b.filigreeSlots).toHaveLength(3)
  })

  it('clamps to 1..MAX_FILIGREE_SLOTS (20, V2 MAX_FILIGREE)', () => {
    expect(MAX_FILIGREE_SLOTS).toBe(20)
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_FILIGREE_COUNT', count: 99 })
    expect(b.filigreeSlots).toHaveLength(20)
    b = reducer(b, { type: 'SET_FILIGREE_COUNT', count: 0 })
    expect(b.filigreeSlots).toHaveLength(1)
  })

  it('artifact slots resize independently of weapon slots', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_ARTIFACT_FILIGREE_COUNT', count: 15 })
    expect(b.artifactFiligreeSlots).toHaveLength(15)
    expect(b.filigreeSlots).toHaveLength(6) // default weapon count untouched
  })
})
