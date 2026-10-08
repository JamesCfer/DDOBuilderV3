// V2 2.0.0.84 / 2.0.0.85 engine changes ported to V3:
//   - Requirement type FeatTrained (Two Handed Fighting line for Rangers)
//   - ATypes HalfAbilityTotal (Ninja Spy / Vile Chemist Doubleshot) and
//     HalfStrikethrough ("Lock In" Melee Power)
//   - Archmage AMMixedMagics as a third "Mixed Magics" source
//   - "Queen's Diplomacy" selection renamed to "Otto's Whistler" on load

import { describe, expect, it } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import { meetsSingleRequirement } from '../lib/requirements'
import { hasMixedMagics } from '../lib/mixedMagics'
import { upgradeSelection, upgradeSelections } from '../lib/selectionUpgrades'
import { migrateLoad } from '../context/CharacterContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, Effect, Requirement } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human',
  alignment: 'True Neutral',
  classLevels: { Monk: 20 },
  baseClassLevels: { Monk: 20 },
  totalLevel: 20,
  feats: new Set(),
  enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 45, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(),
  bab: 20,
  weaponTypes: new Set(),
}

describe('FeatTrained requirement', () => {
  const req: Requirement = { Type: 'FeatTrained', Item: 'Two Weapon Fighting' } as Requirement

  it('ignores a feat that is only granted automatically', () => {
    const build: CharacterBuild = { ...emptyBuild(), featChoices: {} }
    // A granted feat appears in the feat set / counts, but not as trained.
    const feats = new Set(['Two Weapon Fighting'])
    expect(meetsSingleRequirement(req, {
      build, allClasses: [], feats, featCounts: { 'Two Weapon Fighting': 1 },
    })).toBe(false)
  })

  it('is met by a feat trained in a slot', () => {
    const build: CharacterBuild = { ...emptyBuild(), featChoices: { 'L1-Heroic': 'Two Weapon Fighting' } }
    expect(meetsSingleRequirement(req, { build, allClasses: [] })).toBe(true)
  })
})

describe('HalfAbilityTotal / HalfStrikethrough ATypes', () => {
  it('HalfAbilityTotal is half the ability total, capped', () => {
    const effect = {
      Type: 'Doubleshot', Bonus: 'Enhancement', AType: 'HalfAbilityTotal',
      StackSource: 'Dexterity', Cap: 50,
    } as unknown as Effect
    expect(parseEffect(effect, 1, 'Test', 0, 0, ctx)[0].value).toBe(22.5)
    const capped = parseEffect({ ...effect, Cap: 20 } as Effect, 1, 'Test', 0, 0, ctx)
    expect(capped[0].value).toBe(20)
  })

  it('HalfStrikethrough reads the resolved Strikethrough total', () => {
    const effect = { Type: 'MeleePower', Bonus: 'Feat', AType: 'HalfStrikethrough' } as unknown as Effect
    const out = parseEffect(effect, 1, 'Lock In', 0, 0, { ...ctx, strikethroughTotal: 61 })
    expect(out[0].statKey).toBe('melee.power')
    expect(out[0].value).toBe(30.5)
  })
})

describe('Mixed Magics sources', () => {
  it('counts a trained Archmage AMMixedMagics', () => {
    const build: CharacterBuild = {
      ...emptyBuild(),
      enhancementChoices: { Archmage: { AMMixedMagics: 1 } },
    }
    expect(hasMixedMagics(build)).toBe(true)
  })

  it('counts Wild Mage only with the Mixed Magics selection', () => {
    const build: CharacterBuild = {
      ...emptyBuild(),
      enhancementChoices: { 'Wild Mage': { WMUnstableSorcery: 1 } },
      enhancementSelections: { 'Wild Mage': { WMUnstableSorcery: 'Something Else' } },
    }
    expect(hasMixedMagics(build)).toBe(false)
    build.enhancementSelections['Wild Mage'].WMUnstableSorcery = 'Mixed Magics'
    expect(hasMixedMagics(build)).toBe(true)
  })
})

describe('renamed enhancement selections', () => {
  it("moves Queen's Diplomacy to Otto's Whistler", () => {
    expect(upgradeSelection("Queen's Diplomacy")).toBe("Otto's Whistler")
    expect(upgradeSelection('Fey Flash')).toBe('Fey Flash')
  })

  it('upgrades saved builds on load', () => {
    const raw = {
      ...emptyBuild(),
      enhancementSelections: {
        'Shiradi Champion': { U51ShiradiChampionStrikeUpgradeI: "Queen's Diplomacy" },
      },
    }
    const loaded = migrateLoad(raw)
    expect(loaded.enhancementSelections['Shiradi Champion'].U51ShiradiChampionStrikeUpgradeI)
      .toBe("Otto's Whistler")
  })

  it('returns the same object when nothing changes', () => {
    const sel = { T: { A: 'Fey Flash' } }
    expect(upgradeSelections(sel)).toBe(sel)
  })
})

describe('AP spent on ranks an item no longer has', () => {
  it('charges every saved rank, like V2 SpendInTree', async () => {
    const { costUpToRank } = await import('../lib/enhancementSpend')
    // Update 81 cut Reaper's Resistance from 3 ranks at 1 AP to 1 rank at 2 AP;
    // a build saved with 3 ranks still spends 3 x 2 in V2.
    const item = { Name: "Reaper's Resistance", Ranks: 1, CostPerRank: '2' } as never
    expect(costUpToRank(item, 3)).toBe(6)
    expect(costUpToRank({ Name: 'x', Ranks: 3, CostPerRank: '2 1 1' } as never, 3)).toBe(4)
  })
})
