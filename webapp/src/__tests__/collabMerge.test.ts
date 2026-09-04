// Merging concurrent edits to a shared build.
//
// The failure this guards against: two people editing the same build, each
// sending the whole document, and the second save wiping out the first.

import { describe, it, expect } from 'vitest'
import { mergeDocuments, deepEqual } from '../lib/collab/merge'

interface Doc {
  name: string
  guildLevel: number
  lives: Array<{ id: string; name: string; builds: Array<{ id: string; name: string; totalLevel: number }> }>
}

const BASE: Doc = {
  name: 'Thundercleave',
  guildLevel: 100,
  lives: [
    { id: 'l1', name: 'Life 1', builds: [{ id: 'b1', name: 'Barbarian', totalLevel: 20 }] },
    { id: 'l2', name: 'Life 2', builds: [{ id: 'b2', name: 'Wizard', totalLevel: 20 }] },
  ],
}

const clone = (d: Doc): Doc => JSON.parse(JSON.stringify(d))

describe('mergeDocuments', () => {
  it('keeps both edits when two people change different fields', () => {
    const ours = clone(BASE); ours.guildLevel = 150
    const theirs = clone(BASE); theirs.name = 'Stormrage'

    const merged = mergeDocuments(BASE, ours, theirs)
    expect(merged.guildLevel).toBe(150)
    expect(merged.name).toBe('Stormrage')
  })

  it('resolves the same field last-write-wins', () => {
    const ours = clone(BASE); ours.guildLevel = 150
    const theirs = clone(BASE); theirs.guildLevel = 200

    expect(mergeDocuments(BASE, ours, theirs).guildLevel).toBe(200)
  })

  it('leaves the shared document untouched, by identity, on a no-op edit', () => {
    const ours = clone(BASE); ours.guildLevel = 150
    const theirs = clone(BASE)

    expect(mergeDocuments(BASE, ours, theirs)).toBe(ours)
  })

  it('merges edits to different lives instead of clobbering one', () => {
    const ours = clone(BASE); ours.lives[0].name = 'Barb life'
    const theirs = clone(BASE); theirs.lives[1].name = 'Caster life'

    const merged = mergeDocuments(BASE, ours, theirs)
    expect(merged.lives.map(l => l.name)).toEqual(['Barb life', 'Caster life'])
  })

  it('merges edits to different builds inside the same life', () => {
    const ours = clone(BASE)
    ours.lives[0].builds.push({ id: 'b3', name: 'Fighter', totalLevel: 20 })
    const theirs = clone(BASE)
    theirs.lives[0].builds[0].totalLevel = 18

    const merged = mergeDocuments(BASE, ours, theirs)
    expect(merged.lives[0].builds.map(b => b.name)).toEqual(['Barbarian', 'Fighter'])
    expect(merged.lives[0].builds[0].totalLevel).toBe(18)
  })

  it('keeps a life someone else added while this client edited another', () => {
    const ours = clone(BASE)
    ours.lives.push({ id: 'l3', name: 'Life 3', builds: [] })
    const theirs = clone(BASE); theirs.lives[0].name = 'Renamed'

    const merged = mergeDocuments(BASE, ours, theirs)
    expect(merged.lives.map(l => l.id)).toEqual(['l1', 'l2', 'l3'])
    expect(merged.lives[0].name).toBe('Renamed')
  })

  it('applies a deletion the client made, in the shared order', () => {
    const ours = clone(BASE); ours.guildLevel = 120
    const theirs = clone(BASE); theirs.lives = [theirs.lives[1]]

    const merged = mergeDocuments(BASE, ours, theirs)
    expect(merged.lives.map(l => l.id)).toEqual(['l2'])
    expect(merged.guildLevel).toBe(120)
  })

  it('does not resurrect a life someone else deleted', () => {
    const ours = clone(BASE); ours.lives = [ours.lives[0]]
    const theirs = clone(BASE); theirs.guildLevel = 90

    const merged = mergeDocuments(BASE, ours, theirs)
    expect(merged.lives.map(l => l.id)).toEqual(['l1'])
    expect(merged.guildLevel).toBe(90)
  })

  it('treats an un-keyed array as one value', () => {
    // levelClasses only means anything as a whole list, so the last edit wins
    // rather than being spliced position by position.
    const base = { levelClasses: ['Fighter', 'Fighter', 'Rogue'] }
    const ours = { levelClasses: ['Fighter', 'Wizard', 'Rogue'] }
    const theirs = { levelClasses: ['Barbarian', 'Fighter', 'Rogue'] }
    expect(mergeDocuments(base, ours, theirs).levelClasses)
      .toEqual(['Barbarian', 'Fighter', 'Rogue'])
  })

  it('merges added and removed object keys', () => {
    const base = { tomes: { Strength: 3 } }
    const ours = { tomes: { Strength: 3, Dexterity: 5 } }
    const theirs = { tomes: { Constitution: 4 } } as { tomes: Record<string, number> }

    // The client added Constitution and removed Strength; Dexterity, which it
    // never saw, survives.
    expect(mergeDocuments(base, ours as { tomes: Record<string, number> }, theirs).tomes)
      .toEqual({ Dexterity: 5, Constitution: 4 })
  })

  it('takes the client document whole when it has no base to merge against', () => {
    const theirs = clone(BASE); theirs.name = 'Fresh'
    expect(mergeDocuments(undefined, BASE, theirs)).toBe(theirs)
  })
})

describe('deepEqual', () => {
  it('compares nested structures by value', () => {
    expect(deepEqual(BASE, clone(BASE))).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual(null, undefined)).toBe(false)
  })
})
