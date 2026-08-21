/**
 * Raid 3-piece augment sets ("3 pieces equipped: …" raid essences slotted into
 * an item's augment slots) must count toward a set's equipped total exactly
 * like a set-bearing item does — V2 Build::ApplyItem walks each slotted
 * augment's <SetBonus> alongside the item's own (Build.cpp:4905-4929).
 *
 * The Set Bonuses panel used to count only item-native <SetBonus> entries (the
 * item-name-only /api/item-setbonuses endpoint), so these sets never appeared
 * in the panel even though the stat map applied their effects. Both paths now
 * share `computeSetBonusCounts`.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadAugments, loadSetBonuses } from '../server/dataLoaders'
import { computeSetBonusCounts, mergeAugmentChoices } from '../lib/buildStats'
import { emptyBuild } from '../types/ddo'
import type { Augment, Item, SetBonus } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

/** A raid essence augment: grants a 3-piece set and suppresses the host's own. */
const RAID_AUGMENT = 'Imbued Infusion'
const RAID_SET = 'Imbued Infusion'

function itemWithColorlessSlot(name: string, nativeSet?: string): Item {
  return {
    Name: name,
    ItemAugment: [{ Type: 'Colorless' }],
    ...(nativeSet ? { SetBonus: nativeSet } : {}),
  } as unknown as Item
}

describe.runIf(haveData)('raid 3-piece augment set bonuses', () => {
  const allAugments = loadAugments(DATA_DIR) as unknown as Augment[]
  const allSetBonuses = loadSetBonuses(DATA_DIR) as unknown as SetBonus[]

  it('the raid essence augment and its set are both in the catalogue', () => {
    const aug = allAugments.find(a => a.Name === RAID_AUGMENT)
    expect(aug).toBeDefined()
    expect(aug!.SetBonus).toBeDefined()
    const def = allSetBonuses.find(s => s.Type === RAID_SET)
    expect(def).toBeDefined()
    const buffs = Array.isArray(def!.Buff) ? def!.Buff : [def!.Buff!]
    expect(buffs.some(b => Number(b.EquippedCount) === 3)).toBe(true)
  })

  it('counts one augment-granted set per slotted essence', () => {
    const slots = ['Goggles', 'Helmet', 'Necklace']
    const gearItems: Record<string, Item> = {}
    const augmentChoices: Record<string, string> = {}
    for (const slot of slots) {
      gearItems[slot] = itemWithColorlessSlot(`Test ${slot}`)
      augmentChoices[`${slot}:Colorless:0`] = RAID_AUGMENT
    }
    const counts = computeSetBonusCounts(gearItems, augmentChoices, allAugments)
    expect(counts.get(RAID_SET)).toBe(3)
  })

  it('a slotted essence suppresses the host item’s own set bonus', () => {
    const gearItems = { Goggles: itemWithColorlessSlot('Test Goggles', 'Legendary Inevitable Balance') }
    const withoutAugment = computeSetBonusCounts(gearItems, {}, allAugments)
    expect(withoutAugment.get('Legendary Inevitable Balance')).toBe(1)
    expect(withoutAugment.get(RAID_SET)).toBeUndefined()

    const withAugment = computeSetBonusCounts(
      gearItems, { 'Goggles:Colorless:0': RAID_AUGMENT }, allAugments,
    )
    expect(withAugment.get(RAID_SET)).toBe(1)
    expect(withAugment.get('Legendary Inevitable Balance')).toBeUndefined()
  })

  it('mergeAugmentChoices feeds the panel the same picks the stat map uses', () => {
    const build = emptyBuild()
    build.gear = { Goggles: 'Test Goggles', Cosmetic1: 'Test Cosmetic' }
    build.augmentChoices = {
      'Goggles:Colorless:0': RAID_AUGMENT,
      'Cosmetic1:Colorless:0': RAID_AUGMENT,
    }
    build.sentientGem.majorAugment = RAID_AUGMENT
    const gearItems = {
      Goggles: itemWithColorlessSlot('Test Goggles'),
      Cosmetic1: itemWithColorlessSlot('Test Cosmetic'),
    }
    const merged = mergeAugmentChoices(build, gearItems)
    // cosmetic slots never contribute; the sentient gem does
    expect(merged['Cosmetic1:Colorless:0']).toBeUndefined()
    expect(merged['Goggles:Colorless:0']).toBe(RAID_AUGMENT)
    expect(merged['SentientMajor']).toBe(RAID_AUGMENT)
    expect(computeSetBonusCounts(gearItems, merged, allAugments).get(RAID_SET)).toBe(2)
  })

  it('picks up an item’s pre-slotted augment default', () => {
    const build = emptyBuild()
    build.gear = { Goggles: 'Test Goggles' }
    const gearItems = {
      Goggles: {
        Name: 'Test Goggles',
        ItemAugment: [{ Type: 'Colorless', SelectedAugment: RAID_AUGMENT }],
      } as unknown as Item,
    }
    const merged = mergeAugmentChoices(build, gearItems)
    expect(merged['Goggles:Colorless:0']).toBe(RAID_AUGMENT)
    expect(computeSetBonusCounts(gearItems, merged, allAugments).get(RAID_SET)).toBe(1)
  })
})
