// Gear slot naming — the one place that knows how the app's display slot
// names relate to the `<EquipmentSlot>` child tag items carry in the XML.
//
// The two vocabularies are NOT the same, and the mismatches are exactly where
// slots silently come up empty:
//   'Main Hand' → <Weapon1/>      'Off Hand' → <Weapon2/>
//   'Arrow'     → <Arrows/>       'Ring2'    → <Ring/>  (items say Ring for both)
// Everything else is spelled identically in both. The item-XML names are V2's
// InventorySlotTypeMap text (InventorySlotTypes.h:50-73), except that item
// files tag either ring slot as plain `Ring` rather than Ring1/Ring2.

/** Display slot → `<EquipmentSlot>` child tag. Slots not listed are identical. */
const ITEM_SLOT_KEY: Record<string, string> = {
  Ring2: 'Ring',
  'Main Hand': 'Weapon1',
  'Off Hand': 'Weapon2',
  Arrow: 'Arrows',
  'Cosmetic Helmet': 'CosmeticHelm',
  'Cosmetic Armor': 'CosmeticArmor',
  'Cosmetic Cloak': 'CosmeticCloak',
  'Cosmetic Weapon': 'CosmeticWeapon1',
  'Cosmetic Off Hand': 'CosmeticWeapon2',
}

/**
 * The `<EquipmentSlot>` tag to filter the item catalogue by for a display
 * slot — i.e. the `slot` query parameter `/api/items` matches against.
 */
export function itemSlotKey(displaySlot: string): string {
  return ITEM_SLOT_KEY[displaySlot] ?? displaySlot
}

/**
 * The display slot(s) an item tagged with `itemKey` can be equipped into.
 * `Ring` yields both ring slots; every other key yields exactly one.
 */
export function displaySlotsForItemKey(itemKey: string): string[] {
  if (itemKey === 'Ring') return ['Ring', 'Ring2']
  const matches = Object.keys(ITEM_SLOT_KEY).filter(
    display => ITEM_SLOT_KEY[display] === itemKey && display !== 'Ring2',
  )
  return matches.length > 0 ? matches : [itemKey]
}
