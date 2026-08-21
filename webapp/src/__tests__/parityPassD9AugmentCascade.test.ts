/**
 * Parity pass — D9: an augment's cascading extra-slot fields (`<AddAugment>`,
 * `<GrantAugment>`, `<GrantConditionalAugment>`) were entirely unmodeled.
 *
 * V2 (`Augment.h:41-44`, applied via the shared `AddAugment()` helper in
 * `GlobalSupportFunctions.cpp:1967-2010`, called from
 * `ItemSelectDialog.cpp:730-760 OnAugmentSelect` /
 * `FindGearDialog.cpp:608-635`) lets selecting certain augments append one or
 * more *new* augment slots to the host item — the mechanic behind Legendary
 * Alchemical crafting (`Alchemical.Augments.xml`: picking a material in the
 * "Legendary Alchemical Material" slot adds a "Legendary Alchemical Tier 1"
 * slot, whose own choice can cascade further to Tier 2), Thunderforged
 * (`GrantConditionalAugment` gates a bonus Red slot on Two Handed weapons via
 * `WeaponClass`), and Legendary Green Steel Heroic.
 *
 * `gearSlotUpgrades.ts`'s `resolveAugmentSlots` only implemented the
 * unrelated `<SlotUpgrade>` mechanism (D2) — no consumer of
 * `AddAugment`/`GrantAugment`/`GrantConditionalAugment` existed anywhere in
 * `webapp/`, so any Alchemical/Thunderforged/Greensteel-Heroic item exposed
 * only its native slot(s) and could never reach its higher-tier slots.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadItems, loadAugments } from '../server/dataLoaders'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
} from '../types/ddo'
import { resolveAugmentSlots } from '../lib/gearSlotUpgrades'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)
const maybeDescribe = haveData ? describe : describe.skip

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

// ---------------------------------------------------------------------------
// Data loading — the fields parse generically already (loadAugments casts
// the raw XML directly), so this just confirms real shipped data carries
// them under the names the Augment type now declares.
// ---------------------------------------------------------------------------

maybeDescribe('loadAugments parses AddAugment/GrantConditionalAugment (V2 Augment.h:41-44)', () => {
  const augments = loadAugments(DATA_DIR)

  it('a Legendary Alchemical material augment carries AddAugment', () => {
    const adamantine = augments.find(a => a.Name === 'Adamantine' && a.Type === 'Legendary Alchemical Material')
    expect(adamantine).toBeDefined()
    expect(adamantine!.AddAugment).toBe('Legendary Alchemical Tier 1')
  })

  it('a Thunderforged augment carries GrantConditionalAugment gated on WeaponClass', () => {
    const gated = augments.find(a => a.GrantConditionalAugment != null)
    expect(gated).toBeDefined()
    expect(gated!.GrantConditionalAugment).toBe('Red')
    expect(gated!.WeaponClass).toBe('Two Handed')
  })
})

// ---------------------------------------------------------------------------
// Pure resolution helper — cascading slots
// ---------------------------------------------------------------------------

describe('resolveAugmentSlots cascades AddAugment/GrantAugment/GrantConditionalAugment', () => {
  const item: Item = {
    Name: 'Legendary Alchemical Battleaxe',
    Weapon: 'Battle Axe',
    ItemAugment: [
      { Type: 'Legendary Alchemical Material' },
      { Type: 'Red' },
    ],
  } as Item

  const materialAugment: Augment = {
    Name: 'Adamantine', Type: 'Legendary Alchemical Material', AddAugment: 'Legendary Alchemical Tier 1',
  }
  const tier1Augment: Augment = {
    Name: 'Fire I: Combustion', Type: 'Legendary Alchemical Tier 1', AddAugment: 'Legendary Alchemical Tier 2',
  }
  const tier2Augment: Augment = { Name: 'Fire II: Overwhelming Incineration', Type: 'Legendary Alchemical Tier 2' }
  const allAugments = [materialAugment, tier1Augment, tier2Augment]

  it('with no augment chosen, only the 2 native slots resolve', () => {
    const resolved = resolveAugmentSlots(item, 'Weapon1', {}, {}, allAugments)
    expect(resolved).toHaveLength(2)
    expect(resolved.map(r => r.augment.Type)).toEqual(['Legendary Alchemical Material', 'Red'])
  })

  it('choosing Adamantine in the Material slot unlocks a Tier 1 slot at index 2', () => {
    const choices = { 'Weapon1:Legendary Alchemical Material:0': 'Adamantine' }
    const resolved = resolveAugmentSlots(item, 'Weapon1', {}, choices, allAugments)
    expect(resolved).toHaveLength(3)
    expect(resolved[2]).toEqual({ augment: { Type: 'Legendary Alchemical Tier 1' }, index: 2 })
  })

  it('cascades further: choosing a Tier 1 augment unlocks Tier 2 in the same resolve pass', () => {
    const choices = {
      'Weapon1:Legendary Alchemical Material:0': 'Adamantine',
      'Weapon1:Legendary Alchemical Tier 1:2': 'Fire I: Combustion',
    }
    const resolved = resolveAugmentSlots(item, 'Weapon1', {}, choices, allAugments)
    expect(resolved.map(r => r.augment.Type)).toEqual([
      'Legendary Alchemical Material', 'Red', 'Legendary Alchemical Tier 1', 'Legendary Alchemical Tier 2',
    ])
    expect(resolved[3].index).toBe(3)
  })

  it('does not add a duplicate slot type that already exists on the item (V2 AddAugment "only if not already present")', () => {
    const dupItem: Item = {
      Name: 'Dup Test',
      ItemAugment: [{ Type: 'Legendary Alchemical Material' }, { Type: 'Legendary Alchemical Tier 1' }],
    } as Item
    const choices = { 'Weapon1:Legendary Alchemical Material:0': 'Adamantine' }
    const resolved = resolveAugmentSlots(dupItem, 'Weapon1', {}, choices, allAugments)
    expect(resolved).toHaveLength(2)
  })

  it('GrantAugment adds its slot unconditionally', () => {
    const grantItem: Item = { Name: 'Grant Test', ItemAugment: [{ Type: 'Colorless' }] } as Item
    const grantAugment: Augment = { Name: 'Sealed Rune', Type: 'Colorless', GrantAugment: 'Rune Bonus' }
    const choices = { 'Ring:Colorless:0': 'Sealed Rune' }
    const resolved = resolveAugmentSlots(grantItem, 'Ring', {}, choices, [grantAugment])
    expect(resolved.map(r => r.augment.Type)).toContain('Rune Bonus')
  })

  describe('GrantConditionalAugment gates on the host weapon\'s class', () => {
    const twoHanded: WeaponGroupSpec[] = [{ Name: 'Two Handed', Weapon: ['Great Axe', 'Battle Axe'] }]
    const thunderforgedAugment: Augment = {
      Name: 'Thunderforged Rune', Type: 'Thunderforged', GrantConditionalAugment: 'Red', WeaponClass: 'Two Handed',
    }

    it('grants the conditional slot when the weapon is a member of WeaponClass', () => {
      const twoHandedItem: Item = { Name: 'Great Axe of Thunder', Weapon: 'Great Axe', ItemAugment: [{ Type: 'Thunderforged' }] } as Item
      const choices = { 'Weapon1:Thunderforged:0': 'Thunderforged Rune' }
      const resolved = resolveAugmentSlots(twoHandedItem, 'Weapon1', {}, choices, [thunderforgedAugment], twoHanded)
      expect(resolved.map(r => r.augment.Type)).toContain('Red')
    })

    it('withholds the conditional slot when the weapon is not a member of WeaponClass', () => {
      const oneHandedItem: Item = { Name: 'Dagger of Thunder', Weapon: 'Dagger', ItemAugment: [{ Type: 'Thunderforged' }] } as Item
      const choices = { 'Weapon1:Thunderforged:0': 'Thunderforged Rune' }
      const resolved = resolveAugmentSlots(oneHandedItem, 'Weapon1', {}, choices, [thunderforgedAugment], twoHanded)
      expect(resolved.map(r => r.augment.Type)).not.toContain('Red')
    })
  })
})

// ---------------------------------------------------------------------------
// End-to-end against real shipped data: a cascaded slot's chosen augment
// contributes stats exactly like a native slot (proves the index convention
// lines up with buildStats.ts's generic "slot:type:index" augmentChoices key).
// ---------------------------------------------------------------------------

maybeDescribe('a resolved AddAugment cascade slot applies stats like any other augment', () => {
  const items = loadItems(DATA_DIR)
  const allAugments = loadAugments(DATA_DIR)
  const axe = items.find(i => i.Name === 'Legendary Alchemical Battleaxe')!

  it('picking Adamantine then slotting a Tier 1 effect-bearing augment contributes its effect', () => {
    expect(axe).toBeDefined()
    const resolvedBefore = resolveAugmentSlots(axe, 'Weapon1', {}, {}, allAugments)
    expect(resolvedBefore).toHaveLength(2) // native Material + Red only

    const materialKey = `Weapon1:${resolvedBefore[0].augment.Type}:0`
    const choicesWithMaterial = { [materialKey]: 'Adamantine' }
    const resolvedAfter = resolveAugmentSlots(axe, 'Weapon1', {}, choicesWithMaterial, allAugments)
    expect(resolvedAfter).toHaveLength(3)
    const tier1Slot = resolvedAfter[2]
    expect(tier1Slot.augment.Type).toBe('Legendary Alchemical Tier 1')

    const tier1Choice = allAugments.find(a => a.Type === 'Legendary Alchemical Tier 1' && a.Effect != null)
    expect(tier1Choice).toBeDefined()

    const tier1Key = `Weapon1:Legendary Alchemical Tier 1:${tier1Slot.index}`
    const build = {
      ...makeEmptyBuild(),
      gear: { Weapon1: 'Legendary Alchemical Battleaxe' },
      augmentChoices: { ...choicesWithMaterial, [tier1Key]: tier1Choice!.Name },
    }
    const withAugment = computeBuildStats(
      { ...emptyInput(), gearItems: { Weapon1: axe }, allAugments }, build)
    const withoutAugment = computeBuildStats(
      { ...emptyInput(), gearItems: { Weapon1: axe }, allAugments },
      { ...makeEmptyBuild(), gear: { Weapon1: 'Legendary Alchemical Battleaxe' } })

    const changed = withAugment.keys().some(k => withAugment.total(k) !== withoutAugment.total(k))
      || withoutAugment.keys().some(k => withAugment.total(k) !== withoutAugment.total(k))
    expect(changed).toBe(true)
  })
})
