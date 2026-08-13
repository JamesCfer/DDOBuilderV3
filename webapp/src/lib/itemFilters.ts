// Item type / category filtering shared by the gear slot picker and the
// cross-slot "Find Gear" dialog.
//
// Items carry their kind in three different places:
//   * `Weapon`  — the weapon type ("Longsword", "Great Sword"), which also
//                 covers off-hand gear the game models as weapons: shields
//                 ("Small Shield", "Tower Shield"), Orbs, Rune Arms, Collars.
//   * `Armor`   — the armor class ("Cloth" / "Light" / "Medium" / "Heavy" /
//                 "Docent").
//   * `MinorArtifact` — V2 `Item.h:100` presence-only flag.
//
// A filter value is a prefixed token so one <select> can offer categories,
// weapon classes, weapon types, armor classes and the special flags together:
//
//   cat:weapon        every weapon (excluding shields/orbs/rune arms)
//   wg:Two Handed     weapon class from WeaponGroupings.xml
//   wt:Longsword      one exact weapon type
//   ar:Medium         one exact armor class
//   special:artifact  Minor Artifacts

import type { Item } from '../types/ddo'
import { deriveWeaponClasses, type WeaponGroupSpec } from './weapons/groups'

export type ItemCategory = 'weapon' | 'shield' | 'armor' | 'accessory'

/** Off-hand types the game groups as shields (WeaponGroupings.xml "Shield"),
 *  plus the cosmetic variant which carries no ShieldBonus. */
const SHIELD_TYPES = new Set([
  'Buckler',
  'Small Shield',
  'Large Shield',
  'Tower Shield',
  'Cosmetic Shield',
])

/** Off-hand items stored in `Weapon` that are neither weapons nor shields. */
const OFFHAND_TYPES = new Set(['Orb', 'Rune Arm', 'RuneArm', 'Collar'])

/** Weapon classes worth offering as a filter, in display order. Anything not
 *  listed here (Centered, Swashbuckling, Single Weapon, …) is a rules-engine
 *  grouping rather than a way a player shops for gear. */
const WEAPON_CLASS_ORDER = [
  'Simple', 'Martial', 'Exotic',
  'One Handed', 'Two Handed', 'Light',
  'Melee', 'Ranged', 'Thrown',
  'Axe', 'Bow', 'Crossbow',
  'Slashing', 'Bludgeoning', 'Piercing', 'Finesseable',
]

export function isShieldItem(item: Item): boolean {
  if (item.Weapon && SHIELD_TYPES.has(item.Weapon)) return true
  return item.ShieldBonus != null && !item.Weapon
}

export function isMinorArtifact(item: Item): boolean {
  return 'MinorArtifact' in item
}

/** Broad kind of an item. Minor Artifact is deliberately not a category —
 *  an artifact is also a weapon/armor/accessory, and filters on both axes. */
export function itemCategory(item: Item): ItemCategory {
  if (isShieldItem(item)) return 'shield'
  if (item.Weapon && !OFFHAND_TYPES.has(item.Weapon)) return 'weapon'
  if (item.Armor) return 'armor'
  return 'accessory'
}

/** Human-readable type of an item — "Longsword", "Medium Armor", "Docent". */
export function itemTypeLabel(item: Item): string {
  if (item.Weapon) return item.Weapon === 'RuneArm' ? 'Rune Arm' : item.Weapon
  if (item.Armor) return item.Armor === 'Docent' ? 'Docent' : `${item.Armor} Armor`
  return ''
}

/** The weapon classes a weapon type belongs to, from WeaponGroupings.xml. */
function weaponClassesOf(item: Item, groups: WeaponGroupSpec[]): Set<string> {
  if (!item.Weapon) return new Set()
  return deriveWeaponClasses(item.Weapon, groups)
}

/**
 * Does `item` satisfy the type filter token? An empty/unknown token matches
 * everything so callers can pass their state straight through.
 */
export function itemMatchesType(
  item: Item,
  filter: string | undefined,
  groups: WeaponGroupSpec[] = [],
): boolean {
  if (!filter) return true
  const sep = filter.indexOf(':')
  if (sep < 0) return true
  const kind = filter.slice(0, sep)
  const value = filter.slice(sep + 1)

  switch (kind) {
    case 'cat':
      return itemCategory(item) === value
    case 'wg':
      return weaponClassesOf(item, groups).has(value)
    case 'wt':
      return item.Weapon === value
    case 'ar':
      return item.Armor === value
    case 'special':
      return value === 'artifact' ? isMinorArtifact(item) : true
    default:
      return true
  }
}

export interface ItemTypeOption {
  value: string
  label: string
  /** How many of the supplied items match — shown in the option label. */
  count: number
}

export interface ItemTypeOptionGroup {
  label: string
  options: ItemTypeOption[]
}

/**
 * Build the grouped option list for a type <select>, derived from the items
 * actually on offer so a slot picker never lists types it cannot show.
 * Groups and options with no matching items are dropped.
 */
export function itemTypeOptions(
  items: Item[],
  groups: WeaponGroupSpec[] = [],
): ItemTypeOptionGroup[] {
  const categories = new Map<string, number>()
  const weaponTypes = new Map<string, number>()
  const shieldTypes = new Map<string, number>()
  const armorTypes = new Map<string, number>()
  const weaponClasses = new Map<string, number>()
  let artifacts = 0

  const bump = (map: Map<string, number>, key: string) =>
    map.set(key, (map.get(key) ?? 0) + 1)

  for (const item of items) {
    const category = itemCategory(item)
    bump(categories, category)
    if (isMinorArtifact(item)) artifacts++

    if (category === 'shield') {
      if (item.Weapon) bump(shieldTypes, item.Weapon)
    } else if (item.Weapon) {
      bump(weaponTypes, itemTypeLabel(item))
      for (const cls of weaponClassesOf(item, groups)) bump(weaponClasses, cls)
    }
    if (item.Armor) bump(armorTypes, item.Armor)
  }

  const byName = (a: ItemTypeOption, b: ItemTypeOption) => a.label.localeCompare(b.label)
  const from = (map: Map<string, number>, prefix: string, label = (k: string) => k) =>
    Array.from(map, ([key, count]) => ({ value: `${prefix}:${key}`, label: label(key), count }))
      .sort(byName)

  const categoryLabels: Record<string, string> = {
    weapon: 'Weapons',
    shield: 'Shields',
    armor: 'Body armor',
    accessory: 'Accessories',
  }

  const result: ItemTypeOptionGroup[] = []

  const categoryOptions = (['weapon', 'shield', 'armor', 'accessory'] as const)
    .filter(c => categories.has(c))
    .map(c => ({ value: `cat:${c}`, label: categoryLabels[c], count: categories.get(c) ?? 0 }))
  if (artifacts > 0) {
    categoryOptions.push({ value: 'special:artifact', label: 'Minor Artifacts', count: artifacts })
  }
  if (categoryOptions.length > 1) result.push({ label: 'Category', options: categoryOptions })

  const classOptions = WEAPON_CLASS_ORDER.filter(c => weaponClasses.has(c)).map(c => ({
    value: `wg:${c}`,
    label: c,
    count: weaponClasses.get(c) ?? 0,
  }))
  if (classOptions.length > 0) result.push({ label: 'Weapon class', options: classOptions })

  const weaponOptions = from(weaponTypes, 'wt')
  if (weaponOptions.length > 0) result.push({ label: 'Weapon type', options: weaponOptions })

  const shieldOptions = from(shieldTypes, 'wt')
  if (shieldOptions.length > 0) result.push({ label: 'Shield type', options: shieldOptions })

  const armorOptions = from(armorTypes, 'ar', k => (k === 'Docent' ? 'Docent' : `${k} Armor`))
  if (armorOptions.length > 0) result.push({ label: 'Armor type', options: armorOptions })

  return result
}

/** Label for a filter token, for use outside a <select> (chips, summaries). */
export function itemTypeFilterLabel(
  filter: string,
  optionGroups: ItemTypeOptionGroup[],
): string {
  for (const group of optionGroups) {
    for (const option of group.options) if (option.value === filter) return option.label
  }
  return filter
}
