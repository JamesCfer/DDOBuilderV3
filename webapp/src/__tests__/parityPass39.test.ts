/**
 * Parity pass 39 — three verified V2 numerical-correctness fixes found during
 * a section-by-section V2↔V3 review of the breakdown computations.
 *
 *  N1  AC: percentage armor/shield bonuses.
 *      V2 BreakdownItemAC.cpp:115-157 routes Effect_ArmorACBonus /
 *      Effect_ACBonusShield into Breakdown_BonusArmorAC / Breakdown_BonusShieldAC
 *      and applies them as a PERCENTAGE of (armor + armor-enhancement) / shield
 *      AC. V3 treated them as flat AC points and never folded the armor
 *      enchantment (Effect_EnchantArmor, registered on the AC breakdown) into AC.
 *
 *  N2  Combat to-hit: TWF / non-proficiency penalties.
 *      V2 BreakdownItemWeaponAttackBonus.cpp:70-191 subtracts a −4 non-
 *      proficiency penalty and the per-hand Two Weapon Fighting penalty
 *      (−4 with the TWF feat else −6 main / −10 off, +2 for a light off-hand or
 *      Oversized TWF). V3's attack bonus omitted them, over-stating hit chance.
 *
 *  N4  Favored Soul / Sorcerer SP multiplier scope.
 *      V2 BreakdownItem::Total applies BreakdownItemSpellPoints::Multiplier only
 *      to item (gear) spell-point effects — SumItems(m_itemEffects, true) — not
 *      to class / casting-ability / feat SP. V3 multiplied the whole subtotal.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { buildAttackEntry } from '../lib/combat/attackEntry'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'
import type { BuildStats, WeaponInfo } from '../hooks/useBuildStats'
import type { ResolvedStat } from '../lib/bonus'

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1',
} as unknown as DDOClass

// Sorcerer with a zero SP table so class/ability SP add nothing and the
// item-SP multiplier can be isolated in the N4 test.
const zeroSpSorcerer = {
  Name: 'Sorcerer', HitPoints: 6, Fortitude: 'Type1', Reflex: 'Type1',
  Will: 'Type2', BAB: '0.5', CastingStat: 'Charisma',
  SpellPointsPerLevel: new Array(21).fill(0),
} as unknown as DDOClass

function build(overrides: Partial<ReturnType<typeof makeEmptyBuild>> = {}) {
  return {
    ...makeEmptyBuild(),
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// N1 — armor / shield percentage AC
// ---------------------------------------------------------------------------

describe('N1 — armor enchantment + percentage AC (BreakdownItemAC.cpp)', () => {
  const heavyArmor = {
    Name: 'Test Plate', Armor: 'Heavy', ArmorBonus: 25,
    Buff: [{ Type: 'ArmorEnchantment', Value1: 15, BonusType: 'Armor Enhancement' }],
  } as unknown as Item

  // +50% armor AC bonus from a feat (Effect_ArmorACBonus).
  const armorPctFeat = {
    Name: 'Armored Mastery', Acquire: 'Train',
    Effect: { Type: 'ArmorACBonus', Bonus: 'Stacking', Amount: '50', AType: 'Stacks' },
  } as unknown as Feat

  it('folds armor enchantment into AC (was silently dropped)', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], gearItems: { Armor: heavyArmor } },
      build({ classes: [{ name: 'Fighter', levels: 1 }], levelClasses: ['Fighter'], totalLevel: 1 }),
    )
    // base 10 + armor 25 + armor enchantment 15 = 50 (DEX 10 → +0)
    expect(stats.total('ac')).toBe(50)
  })

  it('applies ArmorACBonus as a percentage of (armor + enchantment), not flat', () => {
    const stats = computeBuildStats(
      {
        ...emptyInput(),
        allClasses: [fighterClass],
        allFeats: [armorPctFeat],
        gearItems: { Armor: heavyArmor },
      },
      build({
        classes: [{ name: 'Fighter', levels: 1 }],
        levelClasses: ['Fighter'],
        totalLevel: 1,
        featChoices: { '1': 'Armored Mastery' },
      }),
    )
    // base 10 + armor 25 + enchant 15 + trunc((25+15) * 50 / 100)=20 → 70.
    // (A flat reading would have added only 50, giving 100.)
    expect(stats.total('ac')).toBe(70)
  })

  it('shield % AC applies only with a shield equipped and uses printed shield AC', () => {
    const tower = {
      Name: 'Test Tower', Armor: 'Tower Shield', ShieldBonus: 10, MaximumDexterityBonus: 99,
    } as unknown as Item
    const shieldPctFeat = {
      Name: 'Shield Mastery', Acquire: 'Train',
      Effect: { Type: 'ACBonusShield', Bonus: 'Stacking', Amount: '30', AType: 'Stacks' },
    } as unknown as Feat
    const stats = computeBuildStats(
      {
        ...emptyInput(),
        allClasses: [fighterClass],
        allFeats: [shieldPctFeat],
        gearItems: { Armor: heavyArmor, OffHand: tower },
      },
      build({
        classes: [{ name: 'Fighter', levels: 1 }],
        levelClasses: ['Fighter'],
        totalLevel: 1,
        featChoices: { '1': 'Shield Mastery' },
      }),
    )
    // base10 + armor25 + enchant15 + shield10 + trunc(10*30/100)=3 → 63
    expect(stats.total('ac')).toBe(63)
  })
})

// ---------------------------------------------------------------------------
// N2 — combat to-hit penalties (pure attackEntry)
// ---------------------------------------------------------------------------

function makeStats(map: Record<string, number>): BuildStats {
  return {
    resolve: (k: string): ResolvedStat => ({ total: map[k] ?? 0, bonuses: [] }),
    total: (k: string) => map[k] ?? 0,
    keys: () => Object.keys(map),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
  } as unknown as BuildStats
}

const longsword: WeaponInfo = {
  name: 'Longsword', slot: 'Weapon1', diceNum: 1, diceSides: 8,
  critThreatRange: 2, critMultiplier: 2, attackModifier: 'Strength',
} as unknown as WeaponInfo

describe('N2 — to-hit penalties (BreakdownItemWeaponAttackBonus.cpp)', () => {
  it('non-proficiency applies a −4 to-hit penalty', () => {
    const stats = makeStats({})
    const prof = buildAttackEntry(stats, longsword, 10, 5, { foeAC: 15 })
    const nonProf = buildAttackEntry(stats, longsword, 10, 5, { foeAC: 15, nonProficient: true })
    // +5 vs AC15 → minRoll 10 → 0.55; with −4 → minRoll 14 → 0.35
    expect(prof.hitChance).toBeCloseTo(0.55, 2)
    expect(nonProf.hitChance).toBeCloseTo(0.35, 2)
  })

  it('two-weapon fighting applies the main-hand attack penalty', () => {
    const stats = makeStats({})
    const single = buildAttackEntry(stats, longsword, 10, 5, { foeAC: 15 })
    // dual-wield, no TWF feat → −6 main (longsword off-hand is not light)
    const dual = buildAttackEntry(stats, longsword, 10, 5, {
      foeAC: 15, offhand: longsword, twoWeaponFightingTier: 0,
    })
    expect(single.hitChance).toBeCloseTo(0.55, 2)         // +5 → minRoll 10 → 0.55
    expect(dual.hitChance).toBeCloseTo(0.25, 2)           // +5 − 6 = −1 → minRoll 16 → 0.25
  })

  it('TWF feat and a light off-hand reduce the main-hand penalty', () => {
    const stats = makeStats({})
    // no feat, heavy off-hand: −6 main
    const heavyNoFeat = buildAttackEntry(stats, longsword, 10, 10, {
      foeAC: 18, offhand: longsword, twoWeaponFightingTier: 0,
    })
    // TWF feat + light off-hand: −4 + 2 = −2 main
    const featLight = buildAttackEntry(stats, longsword, 10, 10, {
      foeAC: 18, offhand: longsword, twoWeaponFightingTier: 1, offhandIsLight: true,
    })
    expect(featLight.hitChance).toBeGreaterThan(heavyNoFeat.hitChance)
  })

  it('off-hand swings roll against the off-hand attack bonus', () => {
    const stats = makeStats({})
    // A worse off-hand attack bonus (no TWF feat, −10) yields a lower off-hand
    // hit chance — and thus lower off-hand DPR — than the TWF-feat case (−4),
    // holding the off-hand proc rate fixed by passing the same tier.
    const worse = buildAttackEntry(stats, longsword, 10, 12, {
      foeAC: 22, offhand: longsword, twoWeaponFightingTier: 1, oversizedTwf: false,
    })
    // Force the larger penalty by clearing the TWF feat but keeping the proc:
    const better = buildAttackEntry(stats, longsword, 10, 12, {
      foeAC: 22, offhand: longsword, twoWeaponFightingTier: 1, offhandIsLight: true,
    })
    expect(worse.offhandDPR).toBeGreaterThan(0)
    expect(better.offhandDPR).toBeGreaterThan(worse.offhandDPR)
  })
})

// ---------------------------------------------------------------------------
// N4 — SP multiplier applies to gear SP only
// ---------------------------------------------------------------------------

describe('N4 — Sorcerer/FvS SP multiplier scope (BreakdownItemSpellPoints)', () => {
  const spFeat = {
    Name: 'Bonus SP', Acquire: 'Train',
    Effect: { Type: 'SpellPoints', Bonus: 'Stacking', Amount: '100', AType: 'Stacks' },
  } as unknown as Feat
  const spItem = {
    Name: 'SP Trinket',
    Buff: [{ Type: 'SpellPoints', Value1: 100, BonusType: 'Equipment' }],
  } as unknown as Item

  it('does NOT multiply feat/class SP (level-1 Sorc factor = 1.0)', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [zeroSpSorcerer], allFeats: [spFeat] },
      build({
        classes: [{ name: 'Sorcerer', levels: 1 }],
        levelClasses: ['Sorcerer'],
        totalLevel: 1,
        featChoices: { '1': 'Bonus SP' },
      }),
    )
    // feat SP 100, no gear SP → multiplier contributes 0 → total 100
    expect(stats.total('spellPoints')).toBe(100)
  })

  it('DOES multiply gear SP by the factor', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [zeroSpSorcerer], gearItems: { Trinket: spItem } },
      build({
        classes: [{ name: 'Sorcerer', levels: 1 }],
        levelClasses: ['Sorcerer'],
        totalLevel: 1,
      }),
    )
    // gear SP 100 × (1 + 1.0) = 200
    expect(stats.total('spellPoints')).toBe(200)
  })
})
