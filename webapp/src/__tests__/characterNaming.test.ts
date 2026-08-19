import { describe, expect, it } from 'vitest'
import {
  addLifeToDocument,
  applyCharacterName,
  characterNameOf,
  defaultLifeName,
  deleteLifeFromDocument,
  emptyDocument,
  hasAutoLifeName,
  promoteBuildToLife,
  renameLife,
  syncBuildIntoDocument,
} from '../lib/multiLife'
import { migrateDocument } from '../hooks/usePersistence'
import { emptyBuild } from '../types/ddo'
import type { CharacterDocument } from '../types/ddo'

// Saves are named after the character (CharacterInfo's Name field), not by a
// positional "Life N" label.

describe('character naming — helpers', () => {
  it('falls back to the placeholder for a blank build name', () => {
    expect(characterNameOf({ ...emptyBuild(), name: 'Kavall' })).toBe('Kavall')
    expect(characterNameOf({ ...emptyBuild(), name: '   ' })).toBe('New Character')
    expect(characterNameOf(undefined)).toBe('New Character')
  })

  it('numbers generated life names only when there is more than one life', () => {
    expect(defaultLifeName('Kavall', 0, 1)).toBe('Kavall')
    expect(defaultLifeName('Kavall', 1, 3)).toBe('Kavall — Life 2')
  })

  it('treats legacy "Life N" labels as generated and anything else as user-typed', () => {
    const life = { ...emptyDocument().lives[0], autoName: undefined }
    expect(hasAutoLifeName({ ...life, name: 'Life 3' })).toBe(true)
    expect(hasAutoLifeName({ ...life, name: '' })).toBe(true)
    expect(hasAutoLifeName({ ...life, name: 'Past Life: Monk' })).toBe(false)
  })
})

describe('character naming — documents', () => {
  it('names a new document and its life after the build', () => {
    const doc = emptyDocument({ ...emptyBuild(), name: 'Kavall' })
    expect(doc.name).toBe('Kavall')
    expect(doc.lives[0].name).toBe('Kavall')
  })

  it('renames the document and its auto-named lives when the character is renamed', () => {
    const b = { ...emptyBuild(), name: 'Kavall' }
    let doc = emptyDocument(b)
    doc = addLifeToDocument(doc)
    expect(doc.lives.map(l => l.name)).toEqual(['Kavall — Life 1', 'Kavall — Life 2'])

    const renamed = syncBuildIntoDocument(doc, { ...doc.lives[1].builds[0], name: 'Thalia' })
    expect(renamed.name).toBe('Thalia')
    expect(renamed.lives.map(l => l.name)).toEqual(['Thalia — Life 1', 'Thalia — Life 2'])
  })

  it('leaves a hand-renamed life alone but keeps renaming the rest', () => {
    let doc = emptyDocument({ ...emptyBuild(), name: 'Kavall' })
    doc = addLifeToDocument(doc)
    doc = renameLife(doc, doc.lives[0].id, 'Past Life: Monk')
    const renamed = applyCharacterName(doc, 'Thalia')
    expect(renamed.lives[0].name).toBe('Past Life: Monk')
    expect(renamed.lives[1].name).toBe('Thalia — Life 2')
  })

  it('hands a life back to auto-naming when its name is cleared', () => {
    const doc = emptyDocument({ ...emptyBuild(), name: 'Kavall' })
    let named = renameLife(doc, doc.lives[0].id, 'Something')
    named = renameLife(named, named.lives[0].id, '  ')
    expect(named.lives[0].name).toBe('Kavall')
    expect(named.lives[0].autoName).toBe(true)
  })

  it('drops the life number again when a character is back to one life', () => {
    let doc = emptyDocument({ ...emptyBuild(), name: 'Kavall' })
    doc = addLifeToDocument(doc)
    const next = deleteLifeFromDocument(doc, doc.lives[1].id)
    expect(next.lives.map(l => l.name)).toEqual(['Kavall'])
  })

  it('names a promoted life after the source character', () => {
    expect(promoteBuildToLife({ ...emptyBuild(), name: 'Kavall' }).name).toBe('Kavall')
    expect(promoteBuildToLife({ ...emptyBuild(), name: 'Kavall' }, { name: 'Life of steel' }).name)
      .toBe('Life of steel')
  })

  it('re-derives "Life N" names on documents saved before auto-naming', () => {
    const legacy = {
      ...emptyDocument({ ...emptyBuild(), name: 'Kavall' }),
      name: 'New Character',
    } as CharacterDocument
    legacy.lives = legacy.lives.map(l => ({ ...l, name: 'Life 1', autoName: undefined }))
    const migrated = migrateDocument(legacy)
    expect(migrated.name).toBe('Kavall')
    expect(migrated.lives[0].name).toBe('Kavall')
  })

  it('keeps a stored document name that the placeholder check would not claim', () => {
    const doc = emptyDocument({ ...emptyBuild(), name: 'Kavall' })
    expect(migrateDocument({ ...doc, name: 'Imported V2 Character' }).name)
      .toBe('Imported V2 Character')
  })
})
