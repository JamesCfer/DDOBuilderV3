// Enhancement-tree availability via the requirement engine.
//
// V2 source: CEnhancementsPane::DetermineTrees (EnhancementsPane.cpp:316-340)
// evaluates each tree's <Requirements> through the standard Requirement
// engine — no name matching. Key behaviors:
//   - BaseClass requirements count archetype levels toward the base class
//     (Requirement.cpp:719 EvaluateBaseClass → Build::BaseClassLevels, which
//     matches levelClass OR FindClass(levelClass).GetBaseClass()).
//   - Race requirements are strict equality over the Item list
//     (Requirement.cpp:988 EvaluateRace) — an iconic race sees its own tree,
//     NOT the base race's tree.
//   - Universal trees gate on tree-access feats, counting special/favor
//     acquisitions against the requirement's Value (Requirement.cpp:870
//     EvaluateFeat: count >= Value, default 1).
//
// V3 previously used a tree-name substring heuristic in EnhancementTreePanel
// that failed every archetype build (Arcane Trickster ↛ Thief-Acrobat,
// Dragon Lord ↛ Stalwart Defender/Vanguard, Blight Caster ↛ Season's
// Herald) and iconic races ("Aasimar Scourge" ↛ "Aasimar: Scourge of the
// Undead") — and the panel's mount-time prune then silently DROPPED those
// trees from the imported pinned list. Confirmed against 4 of 5 real
// user-submitted .DDOBuild files.

import { describe, expect, it } from 'vitest'
import { availableEnhancementTrees, buildFeatCountMap } from '../lib/treeAvailability'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass, EnhancementTree, Race } from '../types/ddo'

const rogue: DDOClass = { Name: 'Rogue' }
const fighter: DDOClass = { Name: 'Fighter' }
const paladin: DDOClass = { Name: 'Paladin' }
const arcaneTrickster: DDOClass = { Name: 'Arcane Trickster', BaseClass: 'Rogue' } as DDOClass
const dragonLord: DDOClass = { Name: 'Dragon Lord', BaseClass: 'Fighter' } as DDOClass
const allClasses = [rogue, fighter, paladin, arcaneTrickster, dragonLord]

const thiefAcrobat: EnhancementTree = {
  Name: 'Thief-Acrobat',
  Requirements: { Requirement: [{ Type: 'BaseClass', Item: 'Rogue' }] },
} as unknown as EnhancementTree

const vanguard: EnhancementTree = {
  Name: 'Vanguard',
  Requirements: {
    RequiresOneOf: {
      Requirement: [
        { Type: 'Class', Item: 'Fighter' },
        { Type: 'Class', Item: 'Paladin' },
      ],
    },
  },
} as unknown as EnhancementTree

const aasimarTree: EnhancementTree = {
  Name: 'Aasimar', IsRacialTree: true,
  Requirements: { Requirement: [{ Type: 'Race', Item: 'Aasimar' }] },
} as unknown as EnhancementTree

const scourgeTree: EnhancementTree = {
  Name: 'Aasimar: Scourge of the Undead', IsRacialTree: true,
  Requirements: { Requirement: [{ Type: 'Race', Item: 'Aasimar Scourge' }] },
} as unknown as EnhancementTree

const harperTree: EnhancementTree = {
  Name: 'Harper Agent', IsUniversalTree: true,
  Requirements: {
    RequiresOneOf: {
      Requirement: [
        { Type: 'Feat', Item: 'Harper Agent Tree' },
        { Type: 'Feat', Item: 'The Harpers Favor Rewards', Value: 3 },
      ],
    },
  },
} as unknown as EnhancementTree

function makeBuild(over: Partial<CharacterBuild>): CharacterBuild {
  return { ...emptyBuild(), ...over } as CharacterBuild
}

function names(trees: EnhancementTree[]): string[] {
  return trees.map(t => t.Name)
}

describe('availableEnhancementTrees (V2 DetermineTrees parity)', () => {
  it('archetype class reaches its base class trees via BaseClass requirement', () => {
    const build = makeBuild({
      classes: [{ name: 'Arcane Trickster', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array(20).fill('Arcane Trickster'),
      totalLevel: 20,
    })
    const avail = availableEnhancementTrees([thiefAcrobat], build, allClasses, undefined, [], [])
    expect(names(avail)).toContain('Thief-Acrobat')
  })

  it('RequiresOneOf class alternatives are honored (Vanguard for Paladin)', () => {
    const build = makeBuild({
      classes: [{ name: 'Paladin', levels: 10 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array(10).fill('Paladin'),
      totalLevel: 10,
    })
    const avail = availableEnhancementTrees([vanguard], build, allClasses, undefined, [], [])
    expect(names(avail)).toContain('Vanguard')
  })

  it('iconic race sees its own racial tree and NOT the base race tree', () => {
    const scourgeRace = { Name: 'Aasimar Scourge' } as Race
    const build = makeBuild({ race: 'Aasimar Scourge', totalLevel: 10 })
    const avail = availableEnhancementTrees(
      [aasimarTree, scourgeTree], build, allClasses, scourgeRace, [], [])
    expect(names(avail)).toEqual(['Aasimar: Scourge of the Undead'])
  })

  it('universal tree unlocks via a Life-level special feat', () => {
    const build = makeBuild({ totalLevel: 10 })
    const without = availableEnhancementTrees([harperTree], build, allClasses, undefined, [], [])
    expect(names(without)).not.toContain('Harper Agent')
    const withFeat = availableEnhancementTrees(
      [harperTree], build, allClasses, undefined, [], ['Harper Agent Tree'])
    expect(names(withFeat)).toContain('Harper Agent')
  })

  it('Feat requirement with Value counts favor-feat acquisitions', () => {
    const twoFavor = makeBuild({ totalLevel: 10, favorFeats: ['The Harpers Favor Rewards', 'The Harpers Favor Rewards'] })
    expect(names(availableEnhancementTrees([harperTree], twoFavor, allClasses, undefined, [], [])))
      .not.toContain('Harper Agent')
    const threeFavor = makeBuild({
      totalLevel: 10,
      favorFeats: ['The Harpers Favor Rewards', 'The Harpers Favor Rewards', 'The Harpers Favor Rewards'],
    })
    expect(names(availableEnhancementTrees([harperTree], threeFavor, allClasses, undefined, [], [])))
      .toContain('Harper Agent')
  })

  it('non-matching class still cannot see class trees', () => {
    const build = makeBuild({
      classes: [{ name: 'Paladin', levels: 10 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array(10).fill('Paladin'),
      totalLevel: 10,
    })
    const avail = availableEnhancementTrees([thiefAcrobat], build, allClasses, undefined, [], [])
    expect(names(avail)).toEqual([])
  })
})

describe('buildFeatCountMap', () => {
  it('merges featChoices, pastLives counts, favorFeats, and specialFeats', () => {
    const build = makeBuild({
      featChoices: { 'heroic-1': 'Toughness' },
      pastLives: { Monk: 3 },
      favorFeats: ['Reward A', 'Reward A'],
    })
    const counts = buildFeatCountMap(build, ['Harper Agent Tree'])
    expect(counts['Toughness']).toBe(1)
    expect(counts['Monk']).toBe(3)
    expect(counts['Reward A']).toBe(2)
    expect(counts['Harper Agent Tree']).toBe(1)
  })
})
