// U1 — Multi-life / multi-build document UI: pure document-manipulation
// helpers behind the LifeBuildBar / DocumentContext / document persistence.
//
// V2 model: a Character document holds Life[] each holding Build[]; the
// active build is edited in place and siblings are stored snapshots
// (Character.h:100-117, Life.h:106-124). These tests cover the document
// transforms the UI composes: sync-back of the live build, switching the
// active life/build, add/delete lives and builds (with last-one guards and
// active-pointer fallback), and the workflow on a real 35-build V2 file.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  emptyDocument,
  findActiveBuild,
  findActiveLife,
  syncBuildIntoDocument,
  setActiveBuild,
  addLifeToDocument,
  addBuildToLife,
  deleteLifeFromDocument,
  deleteBuildFromDocument,
  renameLife,
} from '../lib/multiLife'
import { importV2Document } from '../lib/v2Import'
import { exportV2DocumentModel } from '../lib/v2Export'
import { emptyBuild } from '../types/ddo'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

describe('U1 — emptyDocument', () => {
  it('wraps a given build as the single active build of a one-life document', () => {
    const b = { ...emptyBuild(), name: 'Hero', race: 'Dwarf' }
    const doc = emptyDocument(b)
    expect(doc.lives).toHaveLength(1)
    expect(doc.lives[0].builds).toHaveLength(1)
    expect(doc.activeBuildId).toBe(b.id)
    expect(doc.activeLifeId).toBe(doc.lives[0].id)
    expect(doc.name).toBe('Hero')
    expect(doc.lives[0].race).toBe('Dwarf')
    expect(findActiveBuild(doc)?.id).toBe(b.id)
  })

  it('creates a fresh build when none is given', () => {
    const doc = emptyDocument()
    expect(findActiveBuild(doc)).toBeDefined()
    expect(doc.lives[0].builds[0].id).toBe(doc.activeBuildId)
  })
})

describe('U1 — syncBuildIntoDocument', () => {
  it('replaces the stored active build with the live-edited one', () => {
    const b = emptyBuild()
    const doc = emptyDocument(b)
    const edited = { ...b, name: 'Renamed', race: 'Elf' }
    const synced = syncBuildIntoDocument(doc, edited)
    expect(findActiveBuild(synced)?.name).toBe('Renamed')
    // Life-level mirror fields follow the build.
    expect(findActiveLife(synced)?.race).toBe('Elf')
    // Other lives/builds untouched; original doc not mutated.
    expect(findActiveBuild(doc)?.name).toBe(b.name)
  })

  it('updates activeBuildId when the live build has a new id (LOAD/RESET)', () => {
    const doc = emptyDocument()
    const replacement = { ...emptyBuild(), name: 'Loaded' }
    const synced = syncBuildIntoDocument(doc, replacement)
    expect(synced.activeBuildId).toBe(replacement.id)
    expect(findActiveBuild(synced)?.name).toBe('Loaded')
    // The replaced slot is reused, not appended.
    expect(synced.lives[0].builds).toHaveLength(1)
  })
})

describe('U1 — setActiveBuild', () => {
  it('switches active life and build by id', () => {
    let doc = emptyDocument()
    doc = addLifeToDocument(doc)
    const firstLife = doc.lives[0]
    const switched = setActiveBuild(doc, firstLife.id, firstLife.builds[0].id)
    expect(switched.activeLifeId).toBe(firstLife.id)
    expect(switched.activeBuildId).toBe(firstLife.builds[0].id)
  })

  it('falls back to the first build of the life when buildId is unknown', () => {
    const doc = emptyDocument()
    const switched = setActiveBuild(doc, doc.lives[0].id, 'nope')
    expect(switched.activeBuildId).toBe(doc.lives[0].builds[0].id)
  })

  it('is a no-op for an unknown life', () => {
    const doc = emptyDocument()
    expect(setActiveBuild(doc, 'nope', 'nope')).toBe(doc)
  })
})

describe('U1 — addLifeToDocument / addBuildToLife', () => {
  it('appends a fresh life with one level-1 build and makes it active', () => {
    const doc = emptyDocument()
    const next = addLifeToDocument(doc)
    expect(next.lives).toHaveLength(2)
    expect(next.activeLifeId).toBe(next.lives[1].id)
    expect(next.activeBuildId).toBe(next.lives[1].builds[0].id)
    // Lives are named after the character, not by position alone.
    expect(next.lives[1].name).toBe('New Character \u2014 Life 2')
    expect(next.lives[1].builds[0].name).toBe('New Character')
  })

  it('clones the source build into the life with a fresh id (level snapshot)', () => {
    const b = { ...emptyBuild(), name: 'Snap', notes: 'keep me' }
    const doc = emptyDocument(b)
    const next = addBuildToLife(doc, doc.activeLifeId, b)
    expect(next.lives[0].builds).toHaveLength(2)
    const added = next.lives[0].builds[1]
    expect(added.id).not.toBe(b.id)
    expect(added.name).toBe('Snap')
    expect(added.notes).toBe('keep me')
    expect(next.activeBuildId).toBe(added.id)
  })

  it('adds a fresh build when no source is given', () => {
    const doc = emptyDocument()
    const next = addBuildToLife(doc, doc.activeLifeId)
    expect(next.lives[0].builds).toHaveLength(2)
    expect(next.lives[0].builds[1].id).not.toBe(next.lives[0].builds[0].id)
  })
})

describe('U1 — delete guards and active fallback', () => {
  it('never deletes the last life', () => {
    const doc = emptyDocument()
    expect(deleteLifeFromDocument(doc, doc.lives[0].id)).toBe(doc)
  })

  it('never deletes the last build in a life', () => {
    const doc = emptyDocument()
    expect(deleteBuildFromDocument(doc, doc.lives[0].id, doc.lives[0].builds[0].id)).toBe(doc)
  })

  it('deleting the active life activates the previous life', () => {
    let doc = emptyDocument()
    doc = addLifeToDocument(doc) // active = Life 2
    const next = deleteLifeFromDocument(doc, doc.activeLifeId)
    expect(next.lives).toHaveLength(1)
    expect(next.activeLifeId).toBe(next.lives[0].id)
    expect(next.activeBuildId).toBe(next.lives[0].builds[0].id)
  })

  it('deleting a non-active build keeps the active pointer', () => {
    const b = emptyBuild()
    let doc = emptyDocument(b)
    doc = addBuildToLife(doc, doc.activeLifeId, b) // active = clone
    const next = deleteBuildFromDocument(doc, doc.activeLifeId, b.id)
    expect(next.lives[0].builds).toHaveLength(1)
    expect(next.activeBuildId).toBe(doc.activeBuildId)
  })

  it('deleting the active build activates the previous build in the life', () => {
    const b = emptyBuild()
    let doc = emptyDocument(b)
    doc = addBuildToLife(doc, doc.activeLifeId, b) // active = clone (index 1)
    const next = deleteBuildFromDocument(doc, doc.activeLifeId, doc.activeBuildId)
    expect(next.lives[0].builds).toHaveLength(1)
    expect(next.activeBuildId).toBe(b.id)
  })
})

describe('U1 — renameLife', () => {
  it('renames only the targeted life', () => {
    let doc = emptyDocument()
    doc = addLifeToDocument(doc)
    const next = renameLife(doc, doc.lives[0].id, 'Past Life: Monk')
    expect(next.lives[0].name).toBe('Past Life: Monk')
    expect(next.lives[1].name).toBe('New Character \u2014 Life 2')
  })
})

describe('U1 — full workflow on a real multi-build V2 document', () => {
  it('switch → edit → sync → export keeps all 35 builds and the new selection', () => {
    const { document } = importV2Document(load('Maetrim_EndGameHandwrapsMonk.DDOBuild'))
    expect(document.lives[0].builds).toHaveLength(35)

    // Switch the active build to the first one (V2 ActiveBuildIndex was 34).
    const first = document.lives[0].builds[0]
    let doc = setActiveBuild(document, document.lives[0].id, first.id)
    expect(findActiveBuild(doc)?.id).toBe(first.id)

    // Edit the live build and sync it back.
    const edited = { ...first, notes: 'edited in V3' }
    doc = syncBuildIntoDocument(doc, edited)
    expect(findActiveBuild(doc)?.notes).toBe('edited in V3')
    expect(doc.lives[0].builds).toHaveLength(35)

    // Export the whole document and re-import: every build survives and the
    // active index now points at build 0.
    const xml = exportV2DocumentModel(doc)
    const { document: reimported } = importV2Document(xml)
    expect(reimported.lives[0].builds).toHaveLength(35)
    const active = findActiveBuild(reimported)
    expect(active).toBeDefined()
    expect(reimported.lives[0].builds[0].id).toBe(active!.id)
    expect(active!.notes).toBe('edited in V3')
  })
})
