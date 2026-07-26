// V2 → V3 parity pass 3: validates parser aliases, forum export AutomaticFeats /
// SelfAndPartyBuffs sections, and PastLives category split.
//
// V2 sources cited in the report:
//   Effect.h:44 (Effect_DodgeCapBonus)
//   Effect.h:167 (Effect_SpellPenetrationBonus)
//   ForumExportDlg.cpp:1454-1530 (FES_AutomaticFeats)
//   ForumExportDlg.cpp:1583-1610 (FES_SelfAndPartyBuffs)
//   ForumExportDlg.cpp:421-435   (PastLives category split)

import { describe, expect, it } from 'vitest'
import { parseEffect, parseItemBuff, type EffectContext } from '../lib/effectParser'
import { emitForumExport, DEFAULT_SECTIONS } from '../lib/export/sections'
import { buildAutomaticFeatGroups } from '../lib/automaticFeats'
import { emptyBuild } from '../types/ddo'
import type { Effect, ItemBuff, DDOClass, Race, Stance, OptionalBuff, Feat } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human', alignment: 'True Neutral',
  classLevels: { Fighter: 20 }, baseClassLevels: { Fighter: 20 }, totalLevel: 20,
  feats: new Set(), enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(), bab: 20, weaponTypes: new Set(),
}
const mk = (Type: string, extra: Partial<Effect> = {}): Effect =>
  ({ Type, Amount: 1, Bonus: 'Enhancement', AType: 'Stacks', ...extra }) as Effect

describe('Parity pass 3 — parser aliases', () => {
  it('DodgeCapBonus aliases to dodgeCap (Effect.h:44)', () => {
    const out = parseEffect(mk('DodgeCapBonus', { Amount: 5 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('dodgeCap')
    expect(out[0].value).toBe(5)
  })

  it('SpellPenetrationBonus aliases to spellPenetration (Effect.h:167)', () => {
    const out = parseEffect(mk('SpellPenetrationBonus', { Amount: 3 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('spellPenetration')
    expect(out[0].value).toBe(3)
  })

  it('parseItemBuff also resolves DodgeCapBonus', () => {
    const buff: ItemBuff = { Type: 'DodgeCapBonus', Value1: 4, BonusType: 'Enhancement' } as ItemBuff
    const out = parseItemBuff(buff, 'Item')
    expect(out[0].statKey).toBe('dodgeCap')
    expect(out[0].value).toBe(4)
  })

  it('parseItemBuff also resolves SpellPenetrationBonus', () => {
    const buff: ItemBuff = { Type: 'SpellPenetrationBonus', Value1: 2, BonusType: 'Enhancement' } as ItemBuff
    const out = parseItemBuff(buff, 'Item')
    expect(out[0].statKey).toBe('spellPenetration')
    expect(out[0].value).toBe(2)
  })
})

describe('Parity pass 3 — buildAutomaticFeatGroups', () => {
  const fighter: DDOClass = { Name: 'Fighter', AutomaticFeats: [
    { Level: 1, Feats: ['Tower Shield Proficiency'] },
    { Level: 2, Feats: 'Bonus Combat Feat' },
  ] } as unknown as DDOClass
  const wiz: DDOClass = { Name: 'Wizard', NotHeroic: false } as unknown as DDOClass
  const human: Race = { Name: 'Human', GrantedFeat: ['Skilled'] } as unknown as Race

  it('emits race-granted feats', () => {
    const build = { ...emptyBuild(), race: 'Human' }
    const groups = buildAutomaticFeatGroups(build, [fighter], [human])
    expect(groups.find(g => g.source === 'Human')?.feats).toEqual(['Skilled'])
  })

  it('emits class auto-feats up to current class level (V2 parity: includes character level)', () => {
    const build = {
      ...emptyBuild(),
      classes: [
        { name: 'Fighter', levels: 1 }, { name: '', levels: 0 }, { name: '', levels: 0 },
      ] as [{ name: string; levels: number }, { name: string; levels: number }, { name: string; levels: number }],
      levelClasses: ['Fighter'],
      totalLevel: 1,
    }
    const groups = buildAutomaticFeatGroups(build, [fighter], [human])
    const lvl1 = groups.find(g => g.feats.includes('Tower Shield Proficiency'))
    expect(lvl1).toBeDefined()
    expect(lvl1?.charLevel).toBe(1)
    expect(lvl1?.source).toContain('Fighter')
    // Class level 2 hasn't been reached, so no Bonus Combat Feat group.
    expect(groups.find(g => g.feats.includes('Bonus Combat Feat'))).toBeUndefined()
  })

  it('emits Completionist when all heroic classes have ≥ 3 past lives', () => {
    const build = {
      ...emptyBuild(),
      pastLives: { Fighter: 3, Wizard: 3 },
    }
    const groups = buildAutomaticFeatGroups(build, [fighter, wiz], [human])
    expect(groups.find(g => g.source === 'Completionist')).toBeDefined()
  })
})

describe('Parity pass 3 — forum export AutomaticFeats section', () => {
  const fighter: DDOClass = { Name: 'Fighter', AutomaticFeats: [
    { Level: 1, Feats: 'Simple Weapon Proficiency' },
  ] } as unknown as DDOClass
  const human: Race = { Name: 'Human', GrantedFeat: 'Skilled' } as unknown as Race

  it('emits Automatic Feats heading when catalogues are supplied', () => {
    const build = {
      ...emptyBuild(), race: 'Human',
      classes: [{ name: 'Fighter', levels: 1 }, { name: '', levels: 0 }, { name: '', levels: 0 }] as
        [{ name: string; levels: number }, { name: string; levels: number }, { name: string; levels: number }],
    }
    const text = emitForumExport({ build, stats: null, allClasses: [fighter], allRaces: [human] })
    expect(text).toMatch(/Automatic Feats/)
    expect(text).toMatch(/Skilled/)
    expect(text).toMatch(/Simple Weapon Proficiency/)
  })

  it('omits Automatic Feats heading when catalogues are missing', () => {
    const text = emitForumExport({ build: emptyBuild(), stats: null })
    expect(text).not.toMatch(/Automatic Feats/)
  })
})

describe('Parity pass 3 — forum export SelfAndPartyBuffs section', () => {
  const stances: Stance[] = [{ Name: 'Sneak Attack', Group: 'rogue' } as unknown as Stance]
  const buffs: OptionalBuff[] = [{ Name: 'Greater Heroism' } as unknown as OptionalBuff]

  it('separates self-buffs from stances when both catalogues are provided', () => {
    const build = { ...emptyBuild(), activeBuffs: ['Sneak Attack', 'Greater Heroism'] }
    const text = emitForumExport({ build, stats: null, allStances: stances, allSelfBuffs: buffs })
    expect(text).toMatch(/Active Stances.*\n\s*Sneak Attack/)
    expect(text).toMatch(/Self & Party Buffs.*\n\s*Greater Heroism/)
  })

  it('omits Self & Party Buffs heading when there are no non-stance buffs', () => {
    const build = { ...emptyBuild(), activeBuffs: ['Sneak Attack'] }
    const text = emitForumExport({ build, stats: null, allStances: stances, allSelfBuffs: buffs })
    expect(text).not.toMatch(/Self & Party Buffs/)
  })
})

describe('Parity pass 3 — forum export PastLives category split', () => {
  const fighter: DDOClass = { Name: 'Fighter' } as unknown as DDOClass
  const wizard:  DDOClass = { Name: 'Wizard'  } as unknown as DDOClass
  const human:   Race     = { Name: 'Human' } as unknown as Race
  const purplev: Race     = { Name: 'Purple Dragon Knight', IsIconic: true } as unknown as Race
  const epicFeats: Feat[] = [
    { Name: 'Ancient Knowledge', Acquire: 'EpicPastLife', Sphere: 'Arcane' },
    { Name: 'Brace',             Acquire: 'EpicPastLife', Sphere: 'Martial' },
  ]

  it('groups past lives into Heroic / Iconic / Epic / Racial buckets', () => {
    const build = {
      ...emptyBuild(),
      pastLives: {
        Fighter: 3, Wizard: 2,
        Human: 3,
        'Purple Dragon Knight': 1,
        'Ancient Knowledge': 2,
      },
    }
    const text = emitForumExport({
      build, stats: null,
      allClasses: [fighter, wizard],
      allRaces: [human, purplev],
      epicPastLifeFeats: epicFeats,
    })
    expect(text).toMatch(/Heroic Past Lives:.*Fighter x3/)
    expect(text).toMatch(/Heroic Past Lives:.*Wizard x2/)
    expect(text).toMatch(/Iconic Past Lives:.*Purple Dragon Knight x1/)
    expect(text).toMatch(/Epic Past Lives:.*Ancient Knowledge x2/)
    expect(text).toMatch(/Racial Past Lives:.*Human x3/)
  })

  it('falls back to flat list when catalogues are not supplied (legacy callers)', () => {
    const build = { ...emptyBuild(), pastLives: { Fighter: 3 } }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Past Lives/)
    expect(text).toMatch(/Fighter x3/)
    expect(text).not.toMatch(/Heroic Past Lives:/)
  })
})

describe('Parity pass 3 — DEFAULT_SECTIONS includes new emitters', () => {
  it('includes AutomaticFeats and SelfAndPartyBuffs in default order', () => {
    const ids = DEFAULT_SECTIONS.map(s => s.id)
    expect(ids).toContain('AutomaticFeats')
    expect(ids).toContain('SelfAndPartyBuffs')
    expect(ids.indexOf('GrantedFeats')).toBeLessThan(ids.indexOf('AutomaticFeats'))
    expect(ids.indexOf('ActiveStances')).toBeLessThan(ids.indexOf('SelfAndPartyBuffs'))
  })
})
