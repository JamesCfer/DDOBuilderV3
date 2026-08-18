import { describe, expect, it } from 'vitest'
import { parseEffect, parseItemBuff, type EffectContext } from '../lib/effectParser'
import type { Effect, ItemBuff } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human',
  alignment: 'True Neutral',
  classLevels: { Fighter: 20 },
  baseClassLevels: { Fighter: 20 },
  totalLevel: 20,
  feats: new Set(),
  enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(),
  bab: 20,
  weaponTypes: new Set(),
}

const mk = (Type: string, extra: Partial<Effect> = {}): Effect => ({
  Type,
  Amount: 1,
  Bonus: 'Enhancement',
  Item: 'All',  // pass-134: weapon effects need an Item scope (V2 AffectsThisWeapon)
  AType: 'Stacks',
  ...extra,
}) as Effect

describe('parseEffect — niche V2 effects', () => {
  it('Regeneration emits regeneration stat', () => {
    const out = parseEffect(mk('Regeneration', { Amount: 5 }), 1, 'Test', 0, 0, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('regeneration')
    expect(out[0].value).toBe(5)
  })

  it('Guard with Item emits guard.<item>', () => {
    const out = parseEffect(mk('Guard', { Amount: 10, Item: 'Fire' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('guard.Fire')
    expect(out[0].value).toBe(10)
  })

  it('Guard without Item emits bare guard', () => {
    const out = parseEffect(mk('Guard', { Amount: 5, Item: undefined }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('guard')
  })

  it('GhostTouch emits ghostTouch stat', () => {
    const out = parseEffect(mk('GhostTouch', { Amount: 1 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('ghostTouch')
  })

  it('FortificationBase aliases to fortification', () => {
    const out = parseEffect(mk('FortificationBase', { Amount: 100 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('fortification')
    expect(out[0].value).toBe(100)
  })

  it('Incorporeality emits incorporeality stat', () => {
    const out = parseEffect(mk('Incorporeality', { Amount: 25 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('incorporeality')
  })

  it('ImplementInYourHands maps to implementInHands.<item>', () => {
    const out = parseEffect(mk('ImplementInYourHands', { Amount: 1, Item: 'Orb' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('implementInHands.Orb')
  })

  it('SpellPowerReplacement emits a self.alternate marker (V2 data uses AType=NotNeeded)', () => {
    // Real data (Tiefling.tree.xml "Infernal Sovereign"): AType=NotNeeded,
    // Item[0] is the type this effect is declared under, Item[1] the
    // alternate that may substitute in if it is higher.
    const out = parseEffect(
      mk('SpellPowerReplacement', { AType: 'NotNeeded', Item: ['Acid', 'Fire'] as unknown as string }),
      1, 'Test', 0, 0, ctx,
    )
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('spellPowerReplacement.Acid.Fire')
  })

  it('SpellPowerReplacement normalizes Light/Alignment on both sides', () => {
    const out = parseEffect(
      mk('SpellPowerReplacement', { AType: 'NotNeeded', Item: ['Light/Alignment', 'Fire'] as unknown as string }),
      1, 'Test', 0, 0, ctx,
    )
    expect(out[0].statKey).toBe('spellPowerReplacement.LightAlignment.Fire')
  })
})

describe('parseEffect — stat aggregation basics', () => {
  it('AbilityBonus emits one entry per Item', () => {
    const out = parseEffect(mk('AbilityBonus', { Amount: 2, Item: ['Strength', 'Dexterity'] as unknown as string }), 1, 'Test', 0, 0, ctx)
    expect(out.map(b => b.statKey).sort()).toEqual(['ability.Dexterity', 'ability.Strength'])
    expect(out.every(b => b.value === 2)).toBe(true)
  })

  it('SkillBonus emits skill.<item>', () => {
    const out = parseEffect(mk('SkillBonus', { Amount: 5, Item: 'Heal' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('skill.Heal')
    expect(out[0].value).toBe(5)
  })

  it('Hitpoints emits hp', () => {
    const out = parseEffect(mk('Hitpoints', { Amount: 20 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('hp')
    expect(out[0].value).toBe(20)
  })

  it('respects Stance requirement gating', () => {
    const eff = mk('PRR', {
      Amount: 10,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Defensive Fighting' } },
    })
    const noStance = parseEffect(eff, 1, 'Test', 0, 0, ctx)
    expect(noStance).toEqual([])
    const ctxWith = { ...ctx, stances: new Set(['Defensive Fighting']) }
    const withStance = parseEffect(eff, 1, 'Test', 0, 0, ctxWith)
    expect(withStance).toHaveLength(1)
    expect(withStance[0].statKey).toBe('prr')
  })

  // These two feed the Epic Destiny point pool (V2 BreakdownItemDestinyAps):
  // fate points contribute floor(total/3) and DestinyAPBonus adds directly.
  it('FatePoint emits the fatePoint stat', () => {
    const out = parseEffect(mk('FatePoint', { Amount: 1 }), 1, 'Epic Past Life', 0, 0, ctx)
    expect(out[0].statKey).toBe('fatePoint')
    expect(out[0].value).toBe(1)
  })

  it('DestinyAPBonus emits the destinyAP stat', () => {
    const out = parseEffect(mk('DestinyAPBonus', { Amount: 4 }), 1, 'Epic Completionist', 0, 0, ctx)
    expect(out[0].statKey).toBe('destinyAP')
    expect(out[0].value).toBe(4)
  })

  // Crit-only weapon damage (V2 BreakdownItemWeaponDamageBonus.cpp:184-202):
  // applies only on a confirmed crit → surfaced as melee.crit.damage.
  it.each(['Weapon_DamageCritical', 'Weapon_AttackAndDamageCritical', 'WeaponOtherDamageBonusCritical'])(
    '%s emits melee.crit.damage',
    type => {
      const out = parseEffect(mk(type, { Amount: 6 }), 1, 'Weapon', 0, 0, ctx)
      expect(out[0].statKey).toBe('melee.crit.damage')
      expect(out[0].value).toBe(6)
    },
  )

  it('Weapon_CriticalMultiplier19To20 emits weapon.critMultiplier19to20', () => {
    const out = parseEffect(mk('Weapon_CriticalMultiplier19To20', { Amount: 1 }), 1, 'Weapon', 0, 0, ctx)
    expect(out[0].statKey).toBe('weapon.critMultiplier19to20')
    expect(out[0].value).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// N1 — SkillBonusAbility fan-out (V2 BreakdownItemSkill parity)
// ---------------------------------------------------------------------------
describe('SkillBonusAbility — fans out to per-skill stat keys', () => {
  const CHA_SKILLS = ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform', 'Use Magic Device']
  const INT_SKILLS = ['Disable Device', 'Repair', 'Search', 'Spellcraft']
  const WIS_SKILLS = ['Heal', 'Listen', 'Spot']

  it('parseEffect with Charisma fans out to all CHA-governed skills', () => {
    const eff = mk('SkillBonusAbility', { Amount: 1, Item: 'Charisma', Bonus: 'Feat' })
    const out = parseEffect(eff, 1, 'Bard Past Life', 0, 0, ctx)
    const keys = out.map(b => b.statKey).sort()
    expect(keys).toEqual(CHA_SKILLS.map(s => `skill.${s}`).sort())
    expect(out.every(b => b.value === 1)).toBe(true)
    expect(out.every(b => b.bonusType === 'Feat')).toBe(true)
  })

  it('parseEffect with Intelligence fans out to all INT-governed skills', () => {
    const eff = mk('SkillBonusAbility', { Amount: 1, Item: 'Intelligence', Bonus: 'Feat' })
    const out = parseEffect(eff, 1, 'Artificer Past Life', 0, 0, ctx)
    const keys = out.map(b => b.statKey).sort()
    expect(keys).toEqual(INT_SKILLS.map(s => `skill.${s}`).sort())
  })

  it('parseEffect with Wisdom fans out to WIS-governed skills', () => {
    const eff = mk('SkillBonusAbility', { Amount: 2, Item: 'Wisdom', Bonus: 'Exceptional' })
    const out = parseEffect(eff, 1, 'Greensteel Augment', 0, 0, ctx)
    const keys = out.map(b => b.statKey).sort()
    expect(keys).toEqual(WIS_SKILLS.map(s => `skill.${s}`).sort())
  })

  it('parseEffect with All fans out to all 21 skills', () => {
    const eff = mk('SkillBonusAbility', { Amount: 1, Item: 'All', Bonus: 'Enhancement' })
    const out = parseEffect(eff, 1, 'Test Source', 0, 0, ctx)
    expect(out).toHaveLength(21)
    expect(out.every(b => b.statKey.startsWith('skill.'))).toBe(true)
  })

  it('parseItemBuff SkillBonusAbility with Charisma fans out to all CHA-governed skills', () => {
    const buff: ItemBuff = { Type: 'SkillBonusAbility', Value1: 2, Item: 'Charisma', BonusType: 'Competence' }
    const out = parseItemBuff(buff, 'Command Armor')
    const keys = out.map(b => b.statKey).sort()
    expect(keys).toEqual(CHA_SKILLS.map(s => `skill.${s}`).sort())
    expect(out.every(b => b.value === 2)).toBe(true)
  })

  it('parseItemBuff SkillBonusAbility does not emit dead skill.<Ability>.ability keys', () => {
    const buff: ItemBuff = { Type: 'SkillBonusAbility', Value1: 1, Item: 'Intelligence', BonusType: 'Competence' }
    const out = parseItemBuff(buff, 'Test Item')
    expect(out.some(b => b.statKey === 'skill.Intelligence.ability')).toBe(false)
  })
})
