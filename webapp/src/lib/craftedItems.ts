// Build-your-own crafted gear: the Cannith Crafted "Magic Item" for every slot
// (CannithCraftedRing.item, Boots_CannithCrafted.item, …) plus the craftable
// named items (Rune Arms, "(Craftable)" weapons) that carry V2's
// `<UserSetsLevel/>` flag.
//
// V2 ships these as `<MinLevel>0</MinLevel>` catalogue items. The item list
// always offers them whatever the level filter (ItemSelectDialog.cpp:306-308,
// `MinLevel == 0` passes), and once picked the player chooses the item's
// level from 1 to the character's level (SetupItemLevel / OnItemLevelSelect).
// That chosen level is stored as the item's MinLevel in the saved build, and
// every Cannith shard slot on the item reads its value from the shard's
// LevelValue table at that level (ItemSelectDialog.cpp:251-258 sets each
// "Cannith" slot's SelectedLevelIndex to MinLevel - 1).

import type { Item } from '../types/ddo'

/** V2 `Item::HasUserSetsLevel` — a presence-only flag, parses to `""`. */
export function userSetsLevel(item: Item | null | undefined): boolean {
  return !!item && item.UserSetsLevel !== undefined
}

/**
 * The level a user-levelled item is crafted at. V2 defaults a fresh pick to 1
 * (SetupItemLevel turns MinLevel 0 into 1); V3 stores the player's choice per
 * slot in `gearItemLevels`.
 */
export function craftedItemLevel(slot: string, gearItemLevels: Record<string, number> | undefined): number {
  const lvl = gearItemLevels?.[slot]
  return lvl != null && lvl >= 1 ? Math.floor(lvl) : 1
}

/**
 * The level an equipped item counts as: the chosen crafting level for a
 * user-levelled item, its catalogue MinLevel otherwise.
 */
export function effectiveItemLevel(
  item: Item | null | undefined,
  slot: string,
  gearItemLevels: Record<string, number> | undefined,
): number {
  if (userSetsLevel(item)) return craftedItemLevel(slot, gearItemLevels)
  return item?.MinLevel ?? 0
}

/** The augment slot types whose shard value follows the item's level. */
export function isCannithAugmentType(augmentType: string): boolean {
  return augmentType.includes('Cannith')
}

/**
 * The LevelValue index a crafted item forces on one of its augment slots, or
 * undefined when the slot keeps its own stored tier. Mirrors V2's
 * CItemSelectDialog::GetSelectedItem, which overwrites SelectedLevelIndex on
 * every "Cannith" slot with the item's level.
 */
export function craftedAugmentLevelIndex(
  item: Item | null | undefined,
  slot: string,
  augmentType: string,
  gearItemLevels: Record<string, number> | undefined,
): number | undefined {
  if (!userSetsLevel(item) || !isCannithAugmentType(augmentType)) return undefined
  return craftedItemLevel(slot, gearItemLevels) - 1
}
