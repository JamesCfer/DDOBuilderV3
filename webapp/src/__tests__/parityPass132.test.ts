/**
 * Parity pass 132 — the last three residual builds (151/151 oracle-exact).
 *
 * Root causes, each verified with the new per-effect oracle dump
 * (V2CALC_DUMP_EFFECTS / BreakdownItem::V2CalcDumpEffects):
 *  1. V2 EquippedGear::SetItem removes the OFF-HAND item when the main-hand
 *     weapon cannot have one (CanEquipTo2ndWeapon: two-handed melee / bows /
 *     handwraps / quarterstaff never; crossbows only with "Artificer Rune
 *     Arm Use"). The item AND its slotted augments contribute nothing
 *     ("New New Inquiz": repeating crossbow + rune arm on a pure Fighter).
 *  2. Persisted user stances whose stance definition's Requirements fail
 *     are revoked at load (CStanceButton::Evaluate → DisableStance) — a
 *     longbow monk's persisted "Wind Stance" dies because Centered is off
 *     (Nerfer); and persisted AUTO-family stances are never taken from the
 *     file at all.
 *  3. Feat-granted Group=Auto stances (Paladin "Aura of Good"/"Aura of
 *     Courage") auto-activate from the feat, never from the file — Sacred
 *     Defender "Resistance Aura" (+saves) is gated on one (Odd tank).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, Feat, Item } from '../types/ddo'

const fighter = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1 1',
} as unknown as DDOClass

function input(over: Partial<BuildStatsInput>): BuildStatsInput {
  return {
    allRaces: [], allClasses: [fighter], allFeats: [], allTrees: [],
    allSelfBuffs: [], allAugments: [], allSetBonuses: [],
    allFiligreeBonuses: [], allFiligrees: [], allWeaponGroups: [],
    gearItems: {},
    ...over,
  } as BuildStatsInput
}

function build(over: Partial<ReturnType<typeof makeEmptyBuild>>) {
  return {
    ...makeEmptyBuild(),
    totalLevel: 20,
    classes: [{ name: 'Fighter', levels: 20 }],
    ...over,
  }
}

// ---------------------------------------------------------------------------
// 1 — off-hand removal (V2 EquippedGear::SetItem + CanEquipTo2ndWeapon)
// ---------------------------------------------------------------------------

describe('off-hand removal when the main hand forbids one (V2 CanEquipTo2ndWeapon)', () => {
  const crossbow = { Name: 'Test RXbow', Weapon: 'Repeating Light Crossbow' } as unknown as Item
  const runeArm = {
    Name: 'Test Rune Arm', Weapon: 'Rune Arm',
    Buff: [{ Type: 'FalseLife', Value1: 30, BonusType: 'Enhancement' }],
  } as unknown as Item

  it('crossbow main hand WITHOUT Artificer Rune Arm Use → off-hand contributes nothing', () => {
    const stats = computeBuildStats(
      input({ gearItems: { 'Main Hand': crossbow, 'Off Hand': runeArm } }),
      build({}),
    )
    expect(stats.resolve('hp').bonuses.some(b => b.source.includes('Test Rune Arm'))).toBe(false)
  })

  it('crossbow main hand WITH the feat → off-hand applies', () => {
    const runeArmUse = { Name: 'Artificer Rune Arm Use', Acquire: 'Train' } as unknown as Feat
    const stats = computeBuildStats(
      input({
        allFeats: [runeArmUse],
        gearItems: { 'Main Hand': crossbow, 'Off Hand': runeArm },
      }),
      build({ featChoices: { '1': 'Artificer Rune Arm Use' } }),
    )
    expect(stats.resolve('hp').bonuses.some(b => b.source.includes('Test Rune Arm'))).toBe(true)
  })

  it('two-handed main hand always drops the off-hand', () => {
    const maul = { Name: 'Test Maul', Weapon: 'Maul' } as unknown as Item
    const stats = computeBuildStats(
      input({ gearItems: { 'Main Hand': maul, 'Off Hand': runeArm } }),
      build({}),
    )
    expect(stats.resolve('hp').bonuses.some(b => b.source.includes('Test Rune Arm'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2 — persisted user stances honor their definition's Requirements
// ---------------------------------------------------------------------------

describe('persisted user stances (V2 CStanceButton::Evaluate at load)', () => {
  // A feat granting a non-auto stance that requires Centered, plus a
  // sensor effect gated on that stance — the Wind Stance pattern.
  const windFeat = {
    Name: 'Test Wind Stance', Acquire: 'Automatic',
    Stance: [{
      Name: 'Test Wind Stance', Group: 'Monk Stance',
      Requirements: { Requirement: [{ Type: 'Stance', Item: ['Centered'] }] },
    }],
    Effect: {
      Type: 'AbilityBonus', Bonus: 'Feat', Item: 'Dexterity',
      AType: 'Simple', Amount: 2,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Test Wind Stance' } },
    },
  } as unknown as Feat

  const cls = {
    Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
    Will: 'Type1', BAB: '1 1',
    AutomaticFeats: [{ Level: 1, Feats: 'Test Wind Stance' }],
  } as unknown as DDOClass

  it('a persisted stance whose requirements FAIL is revoked (no Centered → no Wind DEX)', () => {
    // A longbow is not a centering weapon → Centered stays off (the Nerfer
    // pattern: longbow monk persists "Wind Stance", V2 revokes it at load).
    const longbow = { Name: 'Test Longbow', Weapon: 'Longbow' } as unknown as Item
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [windFeat], gearItems: { 'Main Hand': longbow } }),
      build({ activeBuffs: ['Test Wind Stance'] }),
    )
    expect(stats.resolve('ability.Dexterity').bonuses
      .some(b => b.source.includes('Test Wind Stance'))).toBe(false)
  })

  it('a persisted stance with no requirements keeps its toggled state', () => {
    const toggleFeat = {
      Name: 'Test Toggle', Acquire: 'Automatic',
      Stance: [{ Name: 'Test Toggle', Group: 'User' }],
      Effect: {
        Type: 'AbilityBonus', Bonus: 'Feat', Item: 'Strength',
        AType: 'Simple', Amount: 2,
        Requirements: { Requirement: { Type: 'Stance', Item: 'Test Toggle' } },
      },
    } as unknown as Feat
    const cls2 = {
      ...cls, AutomaticFeats: [{ Level: 1, Feats: 'Test Toggle' }],
    } as unknown as DDOClass
    const on = computeBuildStats(
      input({ allClasses: [cls2], allFeats: [toggleFeat] }),
      build({ activeBuffs: ['Test Toggle'] }),
    )
    expect(on.resolve('ability.Strength').bonuses
      .some(b => b.source.includes('Test Toggle'))).toBe(true)
    const off = computeBuildStats(
      input({ allClasses: [cls2], allFeats: [toggleFeat] }),
      build({}),
    )
    expect(off.resolve('ability.Strength').bonuses
      .some(b => b.source.includes('Test Toggle'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3 — feat-granted Group=Auto stances self-activate
// ---------------------------------------------------------------------------

describe('feat-granted Auto stances (V2 NewStance → Auto group)', () => {
  it('an Auto stance from an automatic feat activates without any toggle', () => {
    const aura = {
      Name: 'Test Aura of Good', Acquire: 'Automatic',
      Stance: [{ Name: 'Test Aura of Good', Group: 'Auto' }],
    } as unknown as Feat
    const sensor = {
      Name: 'Aura Sensor', Acquire: 'Automatic',
      Effect: {
        Type: 'SaveBonus', Bonus: 'Enhancement', Item: 'All',
        AType: 'Simple', Amount: 3,
        Requirements: { Requirement: { Type: 'Stance', Item: 'Test Aura of Good' } },
      },
    } as unknown as Feat
    const cls = {
      Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
      Will: 'Type1', BAB: '1 1',
      AutomaticFeats: [{ Level: 1, Feats: ['Test Aura of Good', 'Aura Sensor'] }],
    } as unknown as DDOClass
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [aura, sensor] }),
      build({}),        // nothing persisted, nothing toggled
    )
    expect(stats.resolve('save.Will').bonuses
      .some(b => b.source.includes('Aura Sensor'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4 — alignment stances derive from the build's alignment
// ---------------------------------------------------------------------------

describe('alignment stances (auto-derived, never persisted)', () => {
  const sensor = {
    Name: 'Lawful Sensor', Acquire: 'Automatic',
    Effect: {
      Type: 'SaveBonus', Bonus: 'Enhancement', Item: 'All',
      AType: 'Simple', Amount: 2,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Lawful' } },
    },
  } as unknown as Feat
  const cls = {
    Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
    Will: 'Type1', BAB: '1 1',
    AutomaticFeats: [{ Level: 1, Feats: 'Lawful Sensor' }],
  } as unknown as DDOClass

  it('a Lawful Good build activates the "Lawful" stance without persistence', () => {
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [sensor] }),
      build({ alignment: 'Lawful Good' }),
    )
    expect(stats.resolve('save.Will').bonuses
      .some(b => b.source.includes('Lawful Sensor'))).toBe(true)
  })

  it('a Chaotic Neutral build does NOT — even with a stale persisted "Lawful"', () => {
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [sensor] }),
      build({ alignment: 'Chaotic Neutral', activeBuffs: ['Lawful'] }),
    )
    expect(stats.resolve('save.Will').bonuses
      .some(b => b.source.includes('Lawful Sensor'))).toBe(false)
  })
})
