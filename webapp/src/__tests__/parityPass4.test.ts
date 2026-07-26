// V2 → V3 parity pass 4: numerical-parity fixes for Hitpoints, Saves,
// Skills, SpellPoints, AC, and Dodge breakdowns.
//
// V2 sources cited:
//   BreakdownItemAC.cpp:71-82            (tower-shield MDB cap on DEX)
//   BreakdownItemDodge.cpp:31-65         (dodge cap from dodgeCap/MDB/MDBShields)
//   BreakdownItemSave.cpp:117-131        (-1 per neg level)
//   BreakdownItemSave.cpp:484-510        (Divine Grace cap)
//   BreakdownItemSave.cpp:513-565        (Half-Elf Lesser Divine Grace)
//   BreakdownItemSkill.cpp:152-166       (-1 per neg level)
//   BreakdownItemSpellPoints.cpp:55-72   (+1 SP per fate point @ L20+)
//   BreakdownItemHitpoints.cpp:88-105    (+2 HP per fate point @ L20+)
//   BreakdownItemHitpoints.cpp:107-122   (-5 HP per neg level)
//   BreakdownItemHitpoints.cpp:139-152   (style-bonus formula)
//   BreakdownItemHitpoints.cpp:168-194   (reaper HP level cap)
//   Effect.h:Effect_MaxDexBonusTowerShield (separate breakdown for tower MDB)

import { describe, expect, it } from 'vitest'
import { parseEffect, parseItemBuff, type EffectContext } from '../lib/effectParser'
import {
  reaperHpCap, styleBonusHp, effectiveDodgeCap,
  divineGraceCap, halfElfLesserDivineGraceCap,
} from '../lib/v2Formulas'
import type { Effect, ItemBuff } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human', alignment: 'True Neutral',
  classLevels: { Fighter: 20 }, baseClassLevels: { Fighter: 20 }, totalLevel: 20,
  feats: new Set(), enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(), bab: 20, weaponTypes: new Set(),
}
const mk = (Type: string, extra: Partial<Effect> = {}): Effect =>
  ({ Type, Amount: 1, Bonus: 'Enhancement', AType: 'Stacks', ...extra }) as Effect

describe('Parity pass 4 — effect routing', () => {
  it('HitpointsStyleBonus routes to styleFeats counter (BreakdownItemHitpoints.cpp:139)', () => {
    const out = parseEffect(mk('HitpointsStyleBonus', { Amount: 1 }), 1, 'Combat Style Feat', 0, 0, ctx)
    expect(out[0].statKey).toBe('styleFeats')
    expect(out[0].value).toBe(1)
  })

  it('parseItemBuff also routes HitpointsStyleBonus to styleFeats', () => {
    const buff: ItemBuff = ({ Type: 'HitpointsStyleBonus', Value1: 1, BonusType: 'Feat' } as unknown) as ItemBuff
    const out = parseItemBuff(buff, 'Test')
    expect(out[0].statKey).toBe('styleFeats')
  })

  it('MaxDexBonusTowerShield routes to mdbShields, not mdb (Effect.h:Effect_MaxDexBonusTowerShield)', () => {
    const out = parseEffect(mk('MaxDexBonusTowerShield', { Amount: 3 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('mdbShields')
    expect(out[0].value).toBe(3)
  })

  it('parseItemBuff also routes MaxDexBonusTowerShield to mdbShields', () => {
    const buff: ItemBuff = ({ Type: 'MaxDexBonusTowerShield', Value1: 4, BonusType: 'Equipment' } as unknown) as ItemBuff
    const out = parseItemBuff(buff, 'Tower Shield')
    expect(out[0].statKey).toBe('mdbShields')
  })
})

describe('Parity pass 4 — reaper HP cap (BreakdownItemHitpoints.cpp:168-194)', () => {
  it('caps reaper HP at 50 for levels 1-5', () => {
    expect(reaperHpCap(1)).toBe(50)
    expect(reaperHpCap(5)).toBe(50)
  })

  it('caps reaper HP at 100 for levels 6-10', () => {
    expect(reaperHpCap(6)).toBe(100)
    expect(reaperHpCap(10)).toBe(100)
  })

  it('caps reaper HP at 200 for levels 11-15', () => {
    expect(reaperHpCap(15)).toBe(200)
  })

  it('caps reaper HP at 400 for levels 16-20', () => {
    expect(reaperHpCap(20)).toBe(400)
  })

  it('caps reaper HP at 800 for levels 21-25', () => {
    expect(reaperHpCap(25)).toBe(800)
  })

  it('reaper HP unbounded above level 25', () => {
    expect(reaperHpCap(30)).toBe(Infinity)
  })
})

describe('Parity pass 4 — style bonus HP (BreakdownItemHitpoints.cpp:139-152)', () => {
  it('returns 0 with no style feats', () => {
    expect(styleBonusHp(0, 200)).toBe(0)
  })

  it('Fighter 20 (200 HD) with 1 style feat = 50 HP (25% × 1 × 200)', () => {
    // Fighter d10 × 20 = 200 HD; 0.25 × 1 × 200 = 50
    expect(styleBonusHp(1, 200)).toBe(50)
  })

  it('Fighter 20 with 4 style feats = 200 HP (25% × 4 × 200)', () => {
    expect(styleBonusHp(4, 200)).toBe(200)
  })

  it('caps at 4 style feats per :144 min(4, count)', () => {
    expect(styleBonusHp(5, 200)).toBe(200)
    expect(styleBonusHp(99, 200)).toBe(200)
  })

  it('Wizard 20 (120 HD) with 2 style feats = 60 HP', () => {
    // Wizard d6 × 20 = 120 HD; 0.25 × 2 × 120 = 60
    expect(styleBonusHp(2, 120)).toBe(60)
  })
})

describe('Parity pass 4 — effective dodge cap (BreakdownItemDodge.cpp:31-65)', () => {
  it('cloth armor + no tower shield: only dodgeCap applies', () => {
    const cap = effectiveDodgeCap({
      dodgeCap: 25, hasDodgeCap: true,
      mdb: 5, hasMdb: true,
      mdbShields: 0,
      isClothArmor: true, isTowerShield: false,
    })
    expect(cap).toBe(25)  // mdb not applied because Cloth (line 50-56)
  })

  it('non-cloth armor: MDB caps below dodgeCap', () => {
    const cap = effectiveDodgeCap({
      dodgeCap: 25, hasDodgeCap: true,
      mdb: 5, hasMdb: true,
      mdbShields: 0,
      isClothArmor: false, isTowerShield: false,
    })
    expect(cap).toBe(5)
  })

  it('tower shield + non-cloth: most restrictive of all three caps wins', () => {
    const cap = effectiveDodgeCap({
      dodgeCap: 25, hasDodgeCap: true,
      mdb: 12, hasMdb: true,
      mdbShields: 2,
      isClothArmor: false, isTowerShield: true,
    })
    expect(cap).toBe(2)
  })

  it('no caps anywhere returns Infinity (no clamp)', () => {
    const cap = effectiveDodgeCap({
      dodgeCap: 0, hasDodgeCap: false,
      mdb: 0, hasMdb: false,
      mdbShields: 0,
      isClothArmor: true, isTowerShield: false,
    })
    expect(cap).toBe(Infinity)
  })
})

describe('Parity pass 4 — Divine Grace cap (BreakdownItemSave.cpp:484-510)', () => {
  it('Paladin 20 → cap 62 (2 + 3×20)', () => {
    expect(divineGraceCap(20, 0)).toBe(62)
  })

  it('Paladin 1 → not eligible (level < 2), cap 0', () => {
    expect(divineGraceCap(1, 0)).toBe(0)
  })

  it('Paladin 2 → cap 8', () => {
    expect(divineGraceCap(2, 0)).toBe(8)
  })

  it('Sacred Fist 6 → cap 20 (Sacred Fist also gets Divine Grace)', () => {
    expect(divineGraceCap(0, 6)).toBe(20)
  })

  it('multiclass picks the higher cap', () => {
    expect(divineGraceCap(2, 6)).toBe(20)  // max(8, 20)
  })
})

describe('Parity pass 4 — Half-Elf Lesser Divine Grace cap (BreakdownItemSave.cpp:520-549)', () => {
  it('base cap is 2 with no Improved Dilettante upgrades', () => {
    expect(halfElfLesserDivineGraceCap(0)).toBe(2)
  })

  it('+1 per Improved Dilettante upgrade trained (max 3)', () => {
    expect(halfElfLesserDivineGraceCap(1)).toBe(3)
    expect(halfElfLesserDivineGraceCap(2)).toBe(4)
    expect(halfElfLesserDivineGraceCap(3)).toBe(5)
  })
})
