// Loading a saved character must show the character's name, not its life's.
//
// Documents written before builds were named from their file took the build
// name from the LIFE ("Life 1"), and that name is baked into everything
// already stored — a build opened from an account came back with "Life 1" in
// the Character page's Name field. migrateDocument now repairs names nobody
// chose on every load path.

import { describe, expect, it } from 'vitest'
import { repairCharacterNames, findActiveBuild, emptyDocument } from '../lib/multiLife'
import { migrateDocument } from '../hooks/usePersistence'
import { emptyBuild } from '../types/ddo'
import type { CharacterDocument } from '../types/ddo'

/** A document as an old V2 import wrote it: every name is the life's. */
function legacyDoc(overrides: Partial<CharacterDocument> = {}): CharacterDocument {
  const build = { ...emptyBuild(), id: 'b1', name: 'Life 1' }
  const doc = emptyDocument(build)
  return {
    ...doc,
    name: 'Life 1',
    lives: [{ ...doc.lives[0], name: 'Life 1', builds: [build] }],
    ...overrides,
  }
}

describe('repairCharacterNames', () => {
  it('renames "Life 1" builds to the name the save is listed under', () => {
    const fixed = repairCharacterNames(legacyDoc(), 'Maetrim')
    expect(fixed.name).toBe('Maetrim')
    expect(findActiveBuild(fixed)?.name).toBe('Maetrim')
  })

  it('prefers the document name over the listed name when it is a real one', () => {
    const fixed = repairCharacterNames(legacyDoc({ name: 'Maetrim' }), 'copy of maetrim')
    expect(fixed.name).toBe('Maetrim')
    expect(findActiveBuild(fixed)?.name).toBe('Maetrim')
  })

  it('never overwrites a name the user typed', () => {
    const doc = legacyDoc()
    doc.lives[0].builds[0] = { ...doc.lives[0].builds[0], name: 'Bob the Barbarian' }
    const fixed = repairCharacterNames(doc, 'Saved As Something Else')
    expect(findActiveBuild(fixed)?.name).toBe('Bob the Barbarian')
  })

  it('repairs every build in every life, not just the active one', () => {
    const doc = legacyDoc()
    const second = { ...emptyBuild(), id: 'b2', name: '' }
    doc.lives.push({ ...doc.lives[0], id: 'l2', name: 'Life 2', builds: [second] })
    const fixed = repairCharacterNames(doc, 'Maetrim')
    expect(fixed.lives.flatMap(l => l.builds).map(b => b.name)).toEqual(['Maetrim', 'Maetrim'])
    // Life names themselves are untouched — they are the life picker's labels.
    expect(fixed.lives.map(l => l.name)).toEqual(['Life 1', 'Life 2'])
  })

  it('leaves the document alone when there is no better name available', () => {
    const doc = legacyDoc()
    expect(repairCharacterNames(doc)).toBe(doc)
  })

  it('runs as part of migrateDocument, so every load path is repaired', () => {
    const fixed = migrateDocument(legacyDoc(), 'Maetrim')
    expect(findActiveBuild(fixed)?.name).toBe('Maetrim')
  })
})
