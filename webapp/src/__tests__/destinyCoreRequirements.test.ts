// Epic-destiny core progression — regression test.
//
// Destiny cores chain on the PREVIOUS core via a Type=Enhancement
// requirement (e.g. U51FuryOfTheWildCore2 requires U51FuryOfTheWildCore1).
// The Enhancement requirement evaluator used to search only the heroic
// enhancementChoices, so a core trained in destinyChoices was invisible and
// every core past the first rendered permanently locked in the Epic
// Destinies panel (and was never offered by the optimizer).
//
// V2 parity: Build::IsEnhancementTrained walks all trained trees — heroic,
// destiny, and reaper alike.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { availableDestinyTrees } from '../lib/destiny'
import { meetsRequirements, meetsSingleRequirement } from '../lib/requirements'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

function epicBuild(epicLevels: number): CharacterBuild {
  const build = emptyBuild()
  build.race = 'Human'
  build.classes = [{ name: 'Fighter', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }]
  build.levelClasses = Array(20).fill('Fighter')
  build.totalLevel = 20
  build.epicLevels = epicLevels
  return build
}

describe('Enhancement requirements search destiny and reaper trees', () => {
  it('sees ranks trained in destinyChoices', () => {
    const build = {
      ...emptyBuild(),
      destinyChoices: { 'Fury of the Wild': { U51FuryOfTheWildCore1: 1 } },
    } as CharacterBuild
    const req = { Type: 'Enhancement', Item: 'U51FuryOfTheWildCore1' }
    expect(meetsSingleRequirement(req, { build, allClasses: [] })).toBe(true)
  })

  it('sees ranks trained in reaperChoices', () => {
    const build = {
      ...emptyBuild(),
      reaperChoices: { 'Dread Adversary': { DreadAdversaryCore1: 1 } },
    } as CharacterBuild
    const req = { Type: 'Enhancement', Item: 'DreadAdversaryCore1' }
    expect(meetsSingleRequirement(req, { build, allClasses: [] })).toBe(true)
  })

  it('matches selector options recorded in destinySelections', () => {
    const build = {
      ...emptyBuild(),
      destinyChoices: { 'Draconic Incarnation': { U51DraconicIncarnationCore1: 1 } },
      destinySelections: { 'Draconic Incarnation': { U51DraconicIncarnationCore1: 'Draconic Bloodline: Black' } },
    } as CharacterBuild
    const req = {
      Type: 'Enhancement',
      Item: ['U51DraconicIncarnationCore1', 'Draconic Bloodline: Black'],
    }
    expect(meetsSingleRequirement(req, { build, allClasses: [] })).toBe(true)
    const wrong = {
      Type: 'Enhancement',
      Item: ['U51DraconicIncarnationCore1', 'Draconic Bloodline: Red'],
    }
    expect(meetsSingleRequirement(wrong, { build, allClasses: [] })).toBe(false)
  })
})

describe.skipIf(!have)('Epic Destinies on real data', () => {
  const cat = loadAllCatalogues(DATA)
  const destinies = cat.allTrees.filter(t => t.IsEpicDestiny === true)
  const race = cat.allRaces.find(r => r.Name === 'Human')

  it('offers every destiny tree to any level-20+ character', () => {
    const avail = availableDestinyTrees(destinies, epicBuild(0), cat.allClasses, race)
    expect(avail.length).toBe(destinies.length)
    expect(avail.length).toBeGreaterThanOrEqual(13)
  })

  it('unlocks each core once the previous core is trained and the level is met', () => {
    const fury = destinies.find(t => t.Name === 'Fury of the Wild')!
    const cores = (fury.EnhancementTreeItem ?? [])
      .filter(it => (it.YPosition ?? 0) === 0)
      .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))
    expect(cores.length).toBeGreaterThanOrEqual(3)

    const build = epicBuild(10)   // character level 30
    const ctx = { build, allClasses: cat.allClasses, race }

    // Untrained: only the first core's requirements are met.
    expect(meetsRequirements(cores[0].Requirements, ctx)).toBe(true)
    expect(meetsRequirements(cores[1].Requirements, ctx)).toBe(false)

    // Train core 1 (in destinyChoices, as the Epic Destinies panel does) —
    // core 2 (level 23 + core 1) must now be trainable at level 30.
    build.destinyChoices = {
      'Fury of the Wild': { [cores[0].InternalName ?? cores[0].Name]: 1 },
    }
    expect(meetsRequirements(cores[1].Requirements, ctx)).toBe(true)

    // Train core 2 as well — core 3 (level 26 + core 2) unlocks too.
    build.destinyChoices['Fury of the Wild'][cores[1].InternalName ?? cores[1].Name] = 1
    expect(meetsRequirements(cores[2].Requirements, ctx)).toBe(true)
  })
})
