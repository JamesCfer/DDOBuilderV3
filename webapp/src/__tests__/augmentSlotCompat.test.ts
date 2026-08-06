/**
 * Augment slot compatibility + pre-slotted defaults (user bug reports).
 *
 * V2 source:
 *   DDOBuilder/Augment.cpp:63-89   Augment::IsCompatibleWithSlot — an augment
 *                                  fits a slot when the slot's type appears
 *                                  ANYWHERE in the augment's <Type> list.
 *   DDOBuilder/ItemAugment.h       ItemAugment::SelectedAugment — catalogue
 *                                  items may ship with an augment pre-slotted
 *                                  (e.g. Kindling's "Sealed in Fire" seal).
 *
 * V3 previously filtered `/api/augments?type=X` with strict `Type === X`,
 * which silently hid every augment whose <Type> list has more than one entry
 * (1993 of ~2238 in the shipped data): colorless/blue slots appeared to have
 * no augments at all, green/yellow slots were missing the other colors they
 * accept, and colored set augments could never be slotted. Catalogue
 * SelectedAugment defaults were not modeled at all.
 */

import { describe, it, expect } from 'vitest'
import { augmentMatchesSlotType, effectiveAugmentChoice } from '../lib/gearSlotUpgrades'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, ItemAugment, OptionalBuff, SetBonus, Augment,
} from '../types/ddo'

describe('augmentMatchesSlotType (V2 Augment::IsCompatibleWithSlot parity)', () => {
  it('matches a scalar Type exactly', () => {
    expect(augmentMatchesSlotType('Green', 'Green')).toBe(true)
    expect(augmentMatchesSlotType('Green', 'Blue')).toBe(false)
  })

  it('matches anywhere in a Type array (multi-color augments)', () => {
    // e.g. "Globe of True Imperial Blood": Blue/Green/Orange/Purple
    const types = ['Blue', 'Green', 'Orange', 'Purple']
    expect(augmentMatchesSlotType(types, 'Blue')).toBe(true)
    expect(augmentMatchesSlotType(types, 'Purple')).toBe(true)
    expect(augmentMatchesSlotType(types, 'Red')).toBe(false)
  })

  it('matches set augments listing every color (e.g. "Perfect Silence")', () => {
    const all = ['Blue', 'Green', 'Orange', 'Purple', 'Red', 'Yellow', 'Colorless']
    for (const color of all) {
      expect(augmentMatchesSlotType(all, color)).toBe(true)
    }
  })

  it('is exact on non-color slot types (trailing space distinguishes tiers)', () => {
    // LostPurpose data uses "Lost Purpose" (legendary) vs "Lost Purpose "
    // (heroic) — V2 compares raw strings, so the two must not cross-match.
    expect(augmentMatchesSlotType(['Lost Purpose '], 'Lost Purpose')).toBe(false)
    expect(augmentMatchesSlotType(['Lost Purpose '], 'Lost Purpose ')).toBe(true)
  })

  it('never matches a missing Type', () => {
    expect(augmentMatchesSlotType(undefined, 'Blue')).toBe(false)
  })
})

describe('effectiveAugmentChoice (SelectedAugment default vs player choice)', () => {
  const sealed: ItemAugment = { Type: 'Sealed in Fire', SelectedAugment: 'Sealed in Fire' }
  const plain: ItemAugment = { Type: 'Blue' }

  it('falls back to the item default when the player made no choice', () => {
    expect(effectiveAugmentChoice({}, 'Weapon1:Sealed in Fire:0', sealed)).toBe('Sealed in Fire')
  })

  it('a stored choice wins over the default', () => {
    const choices = { 'Weapon1:Sealed in Fire:0': 'Flames of Purity' }
    expect(effectiveAugmentChoice(choices, 'Weapon1:Sealed in Fire:0', sealed)).toBe('Flames of Purity')
  })

  it("the explicit '' from clearing a pre-filled slot keeps it empty", () => {
    const choices = { 'Weapon1:Sealed in Fire:0': '' }
    expect(effectiveAugmentChoice(choices, 'Weapon1:Sealed in Fire:0', sealed)).toBe('')
  })

  it('slots with no default stay empty', () => {
    expect(effectiveAugmentChoice({}, 'Ring1:Blue:0', plain)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// buildStats — a catalogue SelectedAugment default applies its effects
// ---------------------------------------------------------------------------

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

const sealAugment: Augment = {
  Name: 'Test Seal',
  Type: 'Sealed in Fire',
  MinLevel: 1,
  Effect: { Type: 'PRR', Bonus: 'Sealed', AType: 'Simple', Amount: 10 },
} as unknown as Augment

const otherSeal: Augment = {
  Name: 'Other Seal',
  Type: 'Sealed in Fire',
  MinLevel: 1,
  Effect: { Type: 'PRR', Bonus: 'Sealed', AType: 'Simple', Amount: 4 },
} as unknown as Augment

const sealedItem: Item = {
  Name: 'Test Sealed Blade',
  ItemAugment: [{ Type: 'Sealed in Fire', SelectedAugment: 'Test Seal' }],
} as unknown as Item

describe('catalogue SelectedAugment defaults in build stats', () => {
  function statsWith(augmentChoices: Record<string, string>) {
    const build = {
      ...makeEmptyBuild(),
      gear: { Weapon1: 'Test Sealed Blade' } as Record<string, string>,
      augmentChoices,
    }
    return computeBuildStats({
      ...emptyInput(),
      gearItems: { Weapon1: sealedItem } as Record<string, Item>,
      allAugments: [sealAugment, otherSeal],
    }, build)
  }

  it('applies the pre-slotted default when the player made no choice', () => {
    expect(statsWith({}).total('prr')).toBe(10)
  })

  it('a player-picked replacement overrides the default', () => {
    expect(statsWith({ 'Weapon1:Sealed in Fire:0': 'Other Seal' }).total('prr')).toBe(4)
  })

  it("an explicit '' (cleared slot) suppresses the default", () => {
    expect(statsWith({ 'Weapon1:Sealed in Fire:0': '' }).total('prr')).toBe(0)
  })
})
