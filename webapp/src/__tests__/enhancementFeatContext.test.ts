// Tester report (Character page, builds #304 / #311): "Feydark still doesn't
// work, unlike the other trees, even with magical training and favor."
//
// Feydark Illusionist's first core needs FeatAnySource "Magical Training".
// TreeGrid evaluated item requirements against the slot-trained feats only,
// so Magical Training from any other source (Wizard's automatic grant, an
// enhancement's GrantFeat) never unlocked it. V2 checks Build::CurrentFeats
// plus granted feats (Requirement.cpp:877-938).
//
// Same report: "racial points from past racial lives are not being added".
// V2 keeps bonus racial / universal AP in their own pools
// (Build::AvailableActionPoints, Build.cpp:1760-1795).

import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { meetsRequirements } from '../lib/requirements'
import { treeGrantedFeats, treeItemFeatContext } from '../lib/enhancementFeats'
import { availableActionPoints, computeBonusActionPoints } from '../lib/actionPoints'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, Requirements } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

function build(cls: string, levels: number, extra: Partial<CharacterBuild> = {}): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: cls, levels }, { name: '', levels: 0 }, { name: '', levels: 0 }],
    levelClasses: Array.from({ length: levels }, () => cls),
    totalLevel: levels,
    epicLevels: 0,
    legendaryLevels: 0,
    ...extra,
  }
}

describe('FeatAnySource accepts granted feats', () => {
  const req = { Requirement: [{ Type: 'FeatAnySource', Item: 'Magical Training' }] } as unknown as Requirements
  const featReq = { Requirement: [{ Type: 'Feat', Item: 'Magical Training' }] } as unknown as Requirements
  const b = build('Fighter', 20)
  it('passes on a granted feat only for FeatAnySource', () => {
    const ctx = { build: b, allClasses: [], feats: new Set<string>(), featCounts: {}, grantedFeats: new Set(['Magical Training']) }
    expect(meetsRequirements(req, ctx)).toBe(true)
    expect(meetsRequirements(featReq, ctx)).toBe(false)
    expect(meetsRequirements(req, { ...ctx, grantedFeats: new Set<string>() })).toBe(false)
  })
})

describe.skipIf(!have)('Feydark Illusionist core 1 (Magical Training from any source)', () => {
  const cat = loadAllCatalogues(DATA)
  const { allClasses, allRaces, allFeats, allTrees } = cat
  const race = allRaces.find(r => r.Name === 'Human')
  const feydark = allTrees.find(t => t.Name === 'Feydark Illusionist')!
  const core1 = feydark.EnhancementTreeItem!.find(i => i.InternalName === 'FeydarkCore1')!

  const met = (b: CharacterBuild) => meetsRequirements(core1.Requirements, {
    build: b, allClasses, race, ...treeItemFeatContext(b, allClasses, race, allTrees, [], allFeats),
  })

  it('a Wizard (automatic Magical Training) can take it', () => {
    const wiz = build('Wizard', 20)
    // The old evaluation (slot-trained feats only) said no.
    expect(meetsRequirements(core1.Requirements, { build: wiz, allClasses, race })).toBe(false)
    expect(met(wiz)).toBe(true)
  })

  it('a Fighter who trained Magical Training can take it, one who did not cannot', () => {
    expect(met(build('Fighter', 20))).toBe(false)
    expect(met(build('Fighter', 20, { featChoices: { 'lvl1-Heroic': 'Magical Training' } }))).toBe(true)
  })

  it('Magical Training granted by an enhancement counts (Arcane Archer rank 3)', () => {
    const tree = allTrees.find(t => (t.EnhancementTreeItem ?? []).some(i => i.InternalName === 'AAEnergyOfTheWild')
      && t.Name.includes('Arcane Archer'))!
    const ranger = build('Ranger', 20, {
      enhancementChoices: { [tree.Name]: { AAEnergyOfTheWild: 3 } },
    })
    expect(treeGrantedFeats(ranger, allTrees).has('Magical Training')).toBe(true)
    expect(met(ranger)).toBe(true)
    // Rank 2 does not grant it (the GrantFeat effect is <Rank>3</Rank>).
    const r2 = { ...ranger, enhancementChoices: { [tree.Name]: { AAEnergyOfTheWild: 2 } } }
    expect(treeGrantedFeats(r2, allTrees).has('Magical Training')).toBe(false)
  })

  it('racial past lives add racial AP to the racial pool only', () => {
    const b = build('Fighter', 20, { pastLives: { Human: 3, Elf: 3 } })
    const bonus = computeBonusActionPoints(b, allFeats)
    expect(bonus.racial).toBe(2)
    const none = { racial: 0, universal: 0, class: 0 }
    expect(availableActionPoints(20, bonus, none, 'racial')).toBe(82)
    expect(availableActionPoints(20, bonus, none, 'class')).toBe(80)
    // 80 spent in class trees: only the racial bonus is left, for the racial tree.
    const classFull = { racial: 0, universal: 0, class: 80 }
    expect(availableActionPoints(20, bonus, classFull, 'racial')).toBe(2)
    expect(availableActionPoints(20, bonus, classFull, 'class')).toBe(0)
    expect(availableActionPoints(20, bonus, classFull, 'universal')).toBe(0)
  })
})
