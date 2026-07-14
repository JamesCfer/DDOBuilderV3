// D2 — V2 `SlotUpgrade` (SlotUpgrade.h): items like Chains/Shackles/Five
// Rings (and their Legendary variants) carry a one-time, player-chosen
// augment-slot upgrade. The player picks one color from `UpgradeType`; V2
// then appends a real augment slot of that color to the item and forgets
// the upgrade was ever available (ItemSelectDialog.cpp:823-881
// `PopulateSlotUpgradeList` / `OnUpgradeSelect`).
//
// V3 models the choice as `build.slotUpgradeChoices` (parallel to
// `augmentChoices`) rather than mutating the catalogue item: once a color is
// chosen, the resolved augment slot is appended to the item's native
// `ItemAugment` list at a stable index (`nativeCount + slotUpgradeIndex`),
// which `augmentChoices` already keys on generically — no change needed to
// `buildStats.ts`, `v2Import.ts`, or `v2Export.ts`, all of which already key
// augments by "slot:type:index" regardless of index count.
//
// Residual edge case (not modeled): V2 turns a color choice into a real
// ItemAugment slot the instant it's picked, even before the player fills it
// with an actual augment. V3's `.DDOBuild` exporter only emits `<ItemAugment>`
// entries for indices present in `augmentChoices`, so a color picked but not
// yet filled with an augment won't survive an export→V2-reimport round trip
// (it re-appears as an unresolved SlotUpgrade in V2). It survives V3's own
// JSON save/reload fine, since `slotUpgradeChoices` is a plain build field.

import type { Item, ItemAugment, SlotUpgrade } from '../types/ddo'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

export function slotUpgrades(item: Item | undefined): SlotUpgrade[] {
  return toArray(item?.SlotUpgrade)
}

export function upgradeTypeOptions(upgrade: SlotUpgrade): string[] {
  return toArray(upgrade.UpgradeType)
}

/** Key into `build.slotUpgradeChoices`. `index` is the SlotUpgrade's position in the item's SlotUpgrade list. */
export function slotUpgradeKey(slot: string, upgradeType: string, index: number): string {
  return `${slot}:${upgradeType}:${index}`
}

export interface ResolvedAugmentSlot {
  augment: ItemAugment
  /** Index to use with the existing `augmentKey(slot, augment.Type, index)` / `augmentChoices` convention. */
  index: number
}

/**
 * The item's native augment slots plus one synthetic slot per SlotUpgrade
 * the player has already assigned a color to. Order matches V2's
 * `AddAugment` (GlobalSupportFunctions.cpp:1964-2006) fallback path — append
 * to the end — which is what happens for every real SlotUpgrade item today
 * (none carry a trailing "Mythic" slot, the one case V2 special-cases).
 */
export function resolveAugmentSlots(
  item: Item | undefined,
  slot: string,
  slotUpgradeChoices: Record<string, string>,
): ResolvedAugmentSlot[] {
  const native = toArray(item?.ItemAugment)
  const resolved: ResolvedAugmentSlot[] = native.map((augment, index) => ({ augment, index }))
  const upgrades = slotUpgrades(item)
  upgrades.forEach((upgrade, upgradeIndex) => {
    const chosen = slotUpgradeChoices[slotUpgradeKey(slot, upgrade.Type, upgradeIndex)]
    if (chosen) {
      resolved.push({ augment: { Type: chosen }, index: native.length + upgradeIndex })
    }
  })
  return resolved
}

export interface PendingSlotUpgrade {
  upgrade: SlotUpgrade
  index: number
  key: string
  options: string[]
}

/** SlotUpgrade entries the player has not yet assigned a color to. */
export function pendingSlotUpgrades(
  item: Item | undefined,
  slot: string,
  slotUpgradeChoices: Record<string, string>,
): PendingSlotUpgrade[] {
  return slotUpgrades(item)
    .map((upgrade, index) => ({
      upgrade,
      index,
      key: slotUpgradeKey(slot, upgrade.Type, index),
      options: upgradeTypeOptions(upgrade),
    }))
    .filter(({ key }) => !slotUpgradeChoices[key])
}
