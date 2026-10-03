import { describe, it, expect } from 'vitest'
import type { EnhancementTree } from '../types/ddo'
import {
  MAX_ENHANCEMENT_TREES, MAX_OTHER_TREES, MAX_RACIAL_TREES, canPinTree, pinnedTreeCounts,
} from '../lib/treeAvailability'

const tree = (Name: string, IsRacialTree = false) => ({ Name, IsRacialTree } as unknown as EnhancementTree)
const trees = [
  tree('Human', true), tree('Elf', true),
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(n => tree(n)),
]

describe('enhancement tree slots', () => {
  it('allows 1 racial + 6 other trees (7 total)', () => {
    expect(MAX_RACIAL_TREES).toBe(1)
    expect(MAX_OTHER_TREES).toBe(6)
    expect(MAX_ENHANCEMENT_TREES).toBe(7)
  })

  it('fills six non-racial slots alongside the racial tree', () => {
    const pinned = ['Human', 'A', 'B', 'C', 'D', 'E']
    expect(canPinTree(pinned, 'F', trees)).toBe(true)
    const full = [...pinned, 'F']
    expect(pinnedTreeCounts(full, trees)).toEqual({ racial: 1, other: 6 })
    expect(canPinTree(full, 'G', trees)).toBe(false)
  })

  it('rejects a second racial tree', () => {
    expect(canPinTree(['Human'], 'Elf', trees)).toBe(false)
    expect(canPinTree(['A'], 'Elf', trees)).toBe(true)
  })

  it('keeps the racial slot open when six others are pinned', () => {
    expect(canPinTree(['A', 'B', 'C', 'D', 'E', 'F'], 'Human', trees)).toBe(true)
  })
})
