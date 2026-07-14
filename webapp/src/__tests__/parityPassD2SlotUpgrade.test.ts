/**
 * Parity pass — D2: `<SlotUpgrade>` (item augment-slot color upgrades) was
 * parsed nowhere in V3.
 *
 * V2 `Item.h:97` / `SlotUpgrade.h`/`.cpp` models named upgrades that let one
 * of an item's augment slots additionally accept other colors;
 * `ItemSelectDialog.cpp:462-476` (`EnableControls`) and `:823-881`
 * (`PopulateSlotUpgradeList` / `OnUpgradeSelect`) render the extra pickable
 * slot colors and, once chosen, append a real augment slot of that color to
 * the item. Confirmed in data: `Chains`/`Shackles`/`Five Rings` (and
 * Legendary variants) all carry a `<SlotUpgrade>` granting
 * Blue/Colorless/Green/Yellow options.
 *
 * V3's `Item` type had no `SlotUpgrade` field and `dataLoaders.ts`'s
 * `loadItems` did no post-processing for it, so the Gear panel's
 * augment-slot UI could never surface the alternate colors.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadItems, loadAugments } from '../server/dataLoaders'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree, Item, OptionalBuff, SetBonus, Augment } from '../types/ddo'
import {
  slotUpgrades, upgradeTypeOptions, slotUpgradeKey, resolveAugmentSlots, pendingSlotUpgrades,
} from '../lib/gearSlotUpgrades'

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
// Data loading
// ---------------------------------------------------------------------------

maybeDescribe('loadItems parses <SlotUpgrade> (V2 Item.h:97 / SlotUpgrade.h)', () => {
  const items = loadItems(DATA_DIR)

  it('Chains carries a SlotUpgrade with 4 color options', () => {
    const chains = items.find(i => i.Name === 'Chains')
    expect(chains).toBeDefined()
    const upgrades = slotUpgrades(chains)
    expect(upgrades).toHaveLength(1)
    expect(upgrades[0].Type).toBe('Slavelords Upgrade')
    expect(upgradeTypeOptions(upgrades[0])).toEqual(['Blue', 'Colorless', 'Green', 'Yellow'])
  })

  it('Legendary Five Rings, Legendary/regular Shackles also carry SlotUpgrade', () => {
    for (const name of ['Legendary Five Rings', 'Legendary Shackles', 'Shackles', 'Legendary Chains']) {
      const item = items.find(i => i.Name === name)
      expect(item, name).toBeDefined()
      expect(slotUpgrades(item).length, name).toBeGreaterThan(0)
    }
  })

  it('an item without SlotUpgrade (e.g. a generic ring) has none', () => {
    const noUpgrade = items.find(i => i.Name !== 'Chains' && slotUpgrades(i).length === 0 && (i.ItemAugment != null))
    expect(noUpgrade).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Pure resolution helpers
// ---------------------------------------------------------------------------

describe('resolveAugmentSlots / pendingSlotUpgrades', () => {
  const chains: Item = {
    Name: 'Chains',
    ItemAugment: [
      { Type: 'Slavelords Prefix' },
      { Type: 'Slavelords Suffix' },
      { Type: 'Slavelords Extra' },
      { Type: 'Slavelords Bonus' },
      { Type: 'Slavelords Set Bonus' },
    ],
    SlotUpgrade: { Type: 'Slavelords Upgrade', UpgradeType: ['Blue', 'Colorless', 'Green', 'Yellow'] },
  } as Item

  it('with no choice made, all 5 native augments resolve and the upgrade is pending', () => {
    const resolved = resolveAugmentSlots(chains, 'Belt', {})
    expect(resolved).toHaveLength(5)
    expect(resolved.map(r => r.index)).toEqual([0, 1, 2, 3, 4])

    const pending = pendingSlotUpgrades(chains, 'Belt', {})
    expect(pending).toHaveLength(1)
    expect(pending[0].key).toBe(slotUpgradeKey('Belt', 'Slavelords Upgrade', 0))
    expect(pending[0].options).toEqual(['Blue', 'Colorless', 'Green', 'Yellow'])
  })

  it('once a color is chosen, a 6th augment slot resolves at index 5 and the upgrade is no longer pending', () => {
    const key = slotUpgradeKey('Belt', 'Slavelords Upgrade', 0)
    const choices = { [key]: 'Green' }

    const resolved = resolveAugmentSlots(chains, 'Belt', choices)
    expect(resolved).toHaveLength(6)
    expect(resolved[5]).toEqual({ augment: { Type: 'Green' }, index: 5 })

    expect(pendingSlotUpgrades(chains, 'Belt', choices)).toHaveLength(0)
  })

  it('an item with no SlotUpgrade resolves only its native augments', () => {
    const plain: Item = { Name: 'Plain Ring', ItemAugment: { Type: 'Blue' } } as Item
    expect(resolveAugmentSlots(plain, 'Ring', {})).toEqual([{ augment: { Type: 'Blue' }, index: 0 }])
    expect(pendingSlotUpgrades(plain, 'Ring', {})).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// End-to-end: a chosen slot-upgrade augment contributes stats exactly like a
// native augment slot (buildStats.ts keys augmentChoices generically by
// "slot:type:index" — proves the index convention above lines up).
// ---------------------------------------------------------------------------

maybeDescribe('a resolved slot-upgrade augment applies stats like any other augment', () => {
  const items = loadItems(DATA_DIR)
  const allAugments = loadAugments(DATA_DIR)
  const chains = items.find(i => i.Name === 'Chains')!

  it('picking Blue then slotting a real Blue augment contributes its effect', () => {
    const blueAugment = allAugments.find(a => {
      const raw = a as unknown as { Type?: string | string[] }
      const types = Array.isArray(raw.Type) ? raw.Type : raw.Type ? [raw.Type] : []
      return types.includes('Blue') && a.Effect != null
    })
    expect(blueAugment).toBeDefined()

    const resolved = resolveAugmentSlots(chains, 'Belt', {
      [slotUpgradeKey('Belt', 'Slavelords Upgrade', 0)]: 'Blue',
    })
    const upgradeSlot = resolved.find(r => r.augment.Type === 'Blue')
    expect(upgradeSlot).toBeDefined()

    const augmentKey = `Belt:Blue:${upgradeSlot!.index}`
    const build = {
      ...makeEmptyBuild(),
      gear: { Belt: 'Chains' },
      augmentChoices: { [augmentKey]: blueAugment!.Name },
    }
    const withAugment = computeBuildStats(
      { ...emptyInput(), gearItems: { Belt: chains }, allAugments }, build)
    const withoutAugment = computeBuildStats(
      { ...emptyInput(), gearItems: { Belt: chains }, allAugments }, { ...makeEmptyBuild(), gear: { Belt: 'Chains' } })

    // Any effect the augment carries should differ the two totals somewhere.
    const changed = withAugment.keys().some(k => withAugment.total(k) !== withoutAugment.total(k))
      || withoutAugment.keys().some(k => withAugment.total(k) !== withoutAugment.total(k))
    expect(changed).toBe(true)
  })
})
