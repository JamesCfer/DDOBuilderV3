// The V2 tree-version gate must never be judged against a catalogue that
// isn't there.
//
// V2 revokes a spend whose <TreeVersion> disagrees with the current
// catalogue's tree <Version>, counting a MISSING tree as version 0. V3
// reproduced that faithfully — and then the app handed it an empty tree list,
// because `usePersistence.importFile` was memoised with an empty dependency
// array and captured the first render's (still-loading) catalogue forever.
// Every tree in every imported file therefore looked "missing", every spend
// version-mismatched, and every enhancement, destiny and reaper point was
// silently revoked. The build imported with its gear, feats and levels intact
// and not one point spent anywhere.
//
// Two guards, because either alone leaves the hole open: the importer refuses
// to gate on an empty catalogue, and the caller waits for the real one.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { loadEnhancementTrees } from '../server/dataLoaders'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'exampledps.DDOBuild')
const have = existsSync(DATA) && existsSync(FIXTURE)

const spends = (build: { enhancementChoices: Record<string, Record<string, number>>
  destinyChoices: Record<string, Record<string, number>>
  reaperChoices?: Record<string, Record<string, number>> }) => ({
  enhancements: Object.values(build.enhancementChoices ?? {})
    .reduce((n, t) => n + Object.keys(t).length, 0),
  destinies: Object.values(build.destinyChoices ?? {})
    .reduce((n, t) => n + Object.keys(t).length, 0),
  reaper: Object.values(build.reaperChoices ?? {})
    .reduce((n, t) => n + Object.keys(t).length, 0),
})

describe.skipIf(!have)('V2 import — tree-version gate', () => {
  const xml = readFileSync(FIXTURE, 'utf-8')
  const allTrees = loadEnhancementTrees(DATA)

  const ungated = spends(importV2Build(xml).build)

  it('the fixture actually has spends to lose', () => {
    expect(ungated.enhancements).toBeGreaterThan(10)
    expect(ungated.destinies).toBeGreaterThan(10)
    expect(ungated.reaper).toBeGreaterThan(0)
  })

  it('keeps every spend when the catalogue has not loaded (empty list)', () => {
    // The regression: this used to return 0 / 0 / 0.
    expect(spends(importV2Build(xml, { allTrees: [] }).build)).toEqual(ungated)
  })

  it('keeps every spend when no catalogue is supplied at all', () => {
    expect(spends(importV2Build(xml, {}).build)).toEqual(ungated)
  })

  it('still applies the gate against a real catalogue', () => {
    // With real data the fixture's trees are current, so nothing is revoked.
    expect(spends(importV2Build(xml, { allTrees }).build)).toEqual(ungated)
  })

  it('still revokes a spend whose tree version genuinely disagrees', () => {
    // Bump every tree's version so no spend in the file can match: this is the
    // behaviour the empty-catalogue guard must NOT have disabled.
    const bumped = allTrees.map(t => ({ ...t, Version: (t.Version ?? 0) + 99 }))
    const gated = spends(importV2Build(xml, { allTrees: bumped }).build)
    expect(gated.enhancements).toBe(0)
    expect(gated.destinies).toBe(0)
    expect(gated.reaper).toBe(0)
  })

  it('leaves everything outside the trees untouched either way', () => {
    const withEmpty = importV2Build(xml, { allTrees: [] }).build
    const withReal = importV2Build(xml, { allTrees }).build
    for (const build of [withEmpty, withReal]) {
      expect(Object.values(build.gear ?? {}).filter(Boolean).length).toBeGreaterThan(5)
      expect(Object.values(build.featChoices ?? {}).filter(Boolean).length).toBeGreaterThan(5)
      expect(build.filigreeSlots.filter(s => s.name).length).toBeGreaterThan(0)
    }
  })
})
