// communitySnapshot tests — server-side BuildSnapshot computation for the
// community listing. Uses the real V2 catalogues + an Example Builds fixture
// (same pattern as v2RoundTripDocument.test.ts); skips when data is absent.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Document } from '../lib/v2Import'
import { loadAllCatalogues } from '../server/dataLoaders'
import { buildSnapshotFromDocument } from '../server/communitySnapshot'
import type { CharacterDocument } from '../types/ddo'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

const haveData = existsSync(DATA_DIR) && existsSync(FIXTURE_DIR)
const maybeDescribe = haveData ? describe : describe.skip

describe('buildSnapshotFromDocument — input validation', () => {
  const emptyCat = {
    allBonusTypes: [], allItems: [],
  } as unknown as ReturnType<typeof loadAllCatalogues>

  it('throws on a non-document', () => {
    expect(() => buildSnapshotFromDocument(null as unknown as CharacterDocument, emptyCat))
      .toThrow(/Invalid build document/)
    expect(() => buildSnapshotFromDocument({} as CharacterDocument, emptyCat))
      .toThrow(/Invalid build document/)
  })

  it('throws when the document has no active build', () => {
    const doc = { lives: [], activeLifeId: '', activeBuildId: '' } as unknown as CharacterDocument
    expect(() => buildSnapshotFromDocument(doc, emptyCat)).toThrow(/no active build/)
  })
})

maybeDescribe('buildSnapshotFromDocument — real catalogues + fixture', () => {
  it('computes a plausible snapshot for YingsMonk', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'), 'utf-8')
    const { document } = importV2Document(xml)
    const cat = loadAllCatalogues(DATA_DIR)

    const snapshot = buildSnapshotFromDocument(document, cat)

    expect(snapshot.race).toBeTruthy()
    expect(snapshot.classes).toContain('Monk')
    expect(snapshot.classesLabel).toMatch(/Monk \d+/)
    expect(snapshot.totalLevel).toBeGreaterThan(0)
    expect(snapshot.hp).toBeGreaterThan(0)
    expect(snapshot.ac).toBeGreaterThan(0)
    expect(snapshot.prr).toBeGreaterThan(0)
    expect(snapshot.mrr).toBeGreaterThan(0)
    expect(snapshot.meleePower).toBeGreaterThan(0)
    expect(snapshot.rangedPower).toBeGreaterThan(0)

    // The snapshot is a plain JSON-serialisable object (persisted to the DB).
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })
})
