// A V3 build that spends AP in a favor-unlocked universal tree (Falconry,
// Harper Agent, Horizon Walker, Inquisitive, Feydark Illusionist, Vistani
// Knife Fighter) must export the tree's access feat, or V2 throws the spend
// away on load.
//
// V3 lists those trees without the access feat (treeAvailability.ts,
// assumeUnlockFeats). V2 does not: CEnhancementsPane::DetermineTrees
// (EnhancementsPane.cpp:316-374) runs as soon as the build becomes active and
// resets any selected tree whose <Requirements> fail. The six trees each
// require "<Tree> Tree" (Feats.xml, Acquire UniversalTree, stored in the
// Life's SpecialFeats per Character.cpp:643) or a patron favor reward.

import { describe, it, expect } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { emptyBuild } from '../types/ddo'
import { exportV2Build, exportV2Document } from '../lib/v2Export'
import { importV2Document } from '../lib/v2Import'

function lifeSpecialFeats(xml: string): string[] {
  const doc = new XMLParser({ isArray: n => n === 'TrainedFeat' || n === 'Life' }).parse(xml)
  const life = doc.DDOBuilderCharacterData.Character.Life[0]
  return (life.SpecialFeats?.TrainedFeat ?? []).map((f: { FeatName: string }) => f.FeatName)
}

describe('unlock-gated tree spend exports its access feat', () => {
  it('adds "Falconry Tree" for a build with Falconry spend', () => {
    const build = { ...emptyBuild(), enhancementChoices: { Falconry: { 'Falconry: Core 1': 1 } } }
    const feats = lifeSpecialFeats(exportV2Build(build))
    expect(feats).toContain('Falconry Tree')
  })

  it('adds nothing for trees without spend or trees that are not unlock-gated', () => {
    const build = {
      ...emptyBuild(),
      enhancementChoices: { 'Harper Agent': {}, Fighter: { 'Kensei: Core 1': 1 } },
    }
    expect(lifeSpecialFeats(exportV2Build(build))).toEqual([])
  })

  it('does not duplicate an access feat the life already records', () => {
    const build = { ...emptyBuild(), enhancementChoices: { Inquisitive: { 'Inquisitive: Core 1': 1 } } }
    const xml = exportV2Document({
      lives: [{
        name: 'L', race: 'Human', alignment: 'True Neutral',
        specialFeats: ['Inquisitive Tree'], monitoredBonuses: [], builds: [build],
      }],
      guildLevel: 0, applyGuildBuffs: false, contentIDontOwn: [],
      activeLifeIndex: 0, activeBuildIndex: 0,
    })
    expect(lifeSpecialFeats(xml).filter(f => f === 'Inquisitive Tree')).toHaveLength(1)
  })

  it('round-trips through the importer as a Life special feat', () => {
    const build = { ...emptyBuild(), enhancementChoices: { 'Horizon Walker': { 'Horizon Walker: Core 1': 1 } } }
    const doc = importV2Document(exportV2Build(build)).document
    expect(doc.lives[0].specialFeats).toContain('Horizon Walker Tree')
  })
})

describe('favor rewards already unlock the tree', () => {
  it('adds no access feat when the build has the patron favor', () => {
    const build = {
      ...emptyBuild(),
      favorFeats: ['The Harpers Favor Rewards', 'The Harpers Favor Rewards', 'The Harpers Favor Rewards'],
      enhancementChoices: { 'Harper Agent': { 'Harper Agent: Core 1': 1 } },
    }
    expect(lifeSpecialFeats(exportV2Build(build))).toEqual([])
  })

  it('still adds it when the favor is below the tree requirement', () => {
    const build = {
      ...emptyBuild(),
      favorFeats: ['The Free Agents Favor Rewards', 'The Free Agents Favor Rewards', 'The Free Agents Favor Rewards'],
      enhancementChoices: { Falconry: { 'Falconry: Core 1': 1 } },
    }
    expect(lifeSpecialFeats(exportV2Build(build))).toEqual(['Falconry Tree'])
  })
})
