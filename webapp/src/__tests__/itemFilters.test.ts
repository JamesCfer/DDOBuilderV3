import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadItems, loadWeaponGroups } from '../server/dataLoaders'
import {
  itemCategory,
  itemMatchesType,
  itemTypeLabel,
  itemTypeOptions,
  isMinorArtifact,
} from '../lib/itemFilters'
import { findGearByEffect } from '../lib/findGear'
import type { Item } from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

// Trimmed WeaponGroupings.xml sample — same shape the API returns.
const GROUPS: WeaponGroupSpec[] = [
  { Name: 'Martial', Weapon: ['Longsword', 'Great Sword', 'Battle Axe'] },
  { Name: 'One Handed', Weapon: ['Longsword', 'Battle Axe'] },
  { Name: 'Two Handed', Weapon: ['Great Sword'] },
  { Name: 'Axe', Weapon: ['Battle Axe'] },
  { Name: 'Shield', Weapon: ['Small Shield', 'Tower Shield'] },
]

const LONGSWORD = { Name: 'Sword of Shadow', Weapon: 'Longsword', MinLevel: 12 } as Item
const GREATSWORD = { Name: 'Epic Antique Greataxe', Weapon: 'Great Sword', MinLevel: 20 } as Item
const SMALL_SHIELD = {
  Name: 'Bulwark of the Sun', Weapon: 'Small Shield', ShieldBonus: 8, MinLevel: 15,
} as Item
const MEDIUM_ARMOR = { Name: 'Elder Scale', Armor: 'Medium', MinLevel: 10 } as Item
const LIGHT_ARMOR = { Name: 'Shadowscale', Armor: 'Light', MinLevel: 8 } as Item
const NECKLACE = { Name: 'Torc of Prince Raiyum', MinLevel: 16 } as Item
const ARTIFACT_WEAPON = {
  Name: 'Thunder-Forged', Weapon: 'Longsword', MinLevel: 28, MinorArtifact: '',
} as Item

const ALL = [LONGSWORD, GREATSWORD, SMALL_SHIELD, MEDIUM_ARMOR, LIGHT_ARMOR, NECKLACE, ARTIFACT_WEAPON]

describe('itemCategory', () => {
  it('separates weapons, shields, armor and accessories', () => {
    expect(itemCategory(LONGSWORD)).toBe('weapon')
    expect(itemCategory(SMALL_SHIELD)).toBe('shield')
    expect(itemCategory(MEDIUM_ARMOR)).toBe('armor')
    expect(itemCategory(NECKLACE)).toBe('accessory')
  })

  it('treats orbs and rune arms as off-hand accessories, not weapons', () => {
    expect(itemCategory({ Name: 'Orb', Weapon: 'Orb' } as Item)).toBe('accessory')
    expect(itemCategory({ Name: 'Arm', Weapon: 'Rune Arm' } as Item)).toBe('accessory')
  })

  it('reads the MinorArtifact presence flag, which parses as an empty string', () => {
    expect(isMinorArtifact(ARTIFACT_WEAPON)).toBe(true)
    expect(isMinorArtifact(LONGSWORD)).toBe(false)
  })
})

describe('itemTypeLabel', () => {
  it('labels weapons by type and armor by class', () => {
    expect(itemTypeLabel(LONGSWORD)).toBe('Longsword')
    expect(itemTypeLabel(MEDIUM_ARMOR)).toBe('Medium Armor')
    expect(itemTypeLabel({ Name: 'D', Armor: 'Docent' } as Item)).toBe('Docent')
    expect(itemTypeLabel(NECKLACE)).toBe('')
  })
})

describe('itemMatchesType', () => {
  it('matches an exact weapon type', () => {
    expect(itemMatchesType(LONGSWORD, 'wt:Longsword', GROUPS)).toBe(true)
    expect(itemMatchesType(GREATSWORD, 'wt:Longsword', GROUPS)).toBe(false)
  })

  it('matches a weapon class from WeaponGroupings.xml', () => {
    expect(itemMatchesType(GREATSWORD, 'wg:Two Handed', GROUPS)).toBe(true)
    expect(itemMatchesType(LONGSWORD, 'wg:Two Handed', GROUPS)).toBe(false)
    expect(itemMatchesType(LONGSWORD, 'wg:Martial', GROUPS)).toBe(true)
  })

  it('matches an armor class', () => {
    expect(itemMatchesType(MEDIUM_ARMOR, 'ar:Medium', GROUPS)).toBe(true)
    expect(itemMatchesType(LIGHT_ARMOR, 'ar:Medium', GROUPS)).toBe(false)
  })

  it('matches broad categories and Minor Artifacts', () => {
    expect(itemMatchesType(SMALL_SHIELD, 'cat:shield', GROUPS)).toBe(true)
    expect(itemMatchesType(LONGSWORD, 'cat:shield', GROUPS)).toBe(false)
    expect(itemMatchesType(ARTIFACT_WEAPON, 'special:artifact', GROUPS)).toBe(true)
    expect(itemMatchesType(LONGSWORD, 'special:artifact', GROUPS)).toBe(false)
  })

  it('matches everything when no filter is set', () => {
    for (const item of ALL) expect(itemMatchesType(item, '', GROUPS)).toBe(true)
    for (const item of ALL) expect(itemMatchesType(item, undefined, GROUPS)).toBe(true)
  })
})

describe('itemTypeOptions', () => {
  const optionGroups = itemTypeOptions(ALL, GROUPS)
  const values = optionGroups.flatMap(g => g.options.map(o => o.value))

  it('offers only types present in the supplied items', () => {
    expect(values).toContain('wt:Longsword')
    expect(values).toContain('wt:Great Sword')
    expect(values).toContain('ar:Medium')
    expect(values).not.toContain('wt:Khopesh')
    expect(values).not.toContain('ar:Heavy')
  })

  it('files shields under their own group, apart from weapons', () => {
    const shields = optionGroups.find(g => g.label === 'Shield type')
    expect(shields?.options.map(o => o.value)).toEqual(['wt:Small Shield'])
    const weapons = optionGroups.find(g => g.label === 'Weapon type')
    expect(weapons?.options.map(o => o.value)).not.toContain('wt:Small Shield')
  })

  it('counts matching items per option', () => {
    const weapons = optionGroups.find(g => g.label === 'Weapon type')
    // Longsword + the Minor Artifact longsword
    expect(weapons?.options.find(o => o.value === 'wt:Longsword')?.count).toBe(2)
  })

  it('offers Minor Artifacts alongside the categories', () => {
    const categories = optionGroups.find(g => g.label === 'Category')
    expect(categories?.options.map(o => o.value)).toContain('special:artifact')
  })

  it('omits the weapon-class group for a slot holding no weapons', () => {
    const accessoryOnly = itemTypeOptions([NECKLACE, MEDIUM_ARMOR], GROUPS)
    expect(accessoryOnly.find(g => g.label === 'Weapon class')).toBeUndefined()
    expect(accessoryOnly.find(g => g.label === 'Armor type')).toBeDefined()
  })
})

describe('findGearByEffect — item type filter', () => {
  it('narrows results to one weapon type', () => {
    const results = findGearByEffect(ALL, { itemType: 'wt:Longsword', weaponGroups: GROUPS })
    expect(results.map(r => r.item.Name)).toEqual(['Sword of Shadow', 'Thunder-Forged'])
  })

  it('narrows results to an armor class', () => {
    const results = findGearByEffect(ALL, { itemType: 'ar:Medium', weaponGroups: GROUPS })
    expect(results.map(r => r.item.Name)).toEqual(['Elder Scale'])
  })

  it('combines the type filter with level bounds', () => {
    const results = findGearByEffect(ALL, {
      itemType: 'cat:weapon',
      weaponGroups: GROUPS,
      maxLevel: 20,
    })
    expect(results.map(r => r.item.Name)).toEqual(['Sword of Shadow', 'Epic Antique Greataxe'])
  })

  it('finds Minor Artifacts across every slot', () => {
    const results = findGearByEffect(ALL, { itemType: 'special:artifact', weaponGroups: GROUPS })
    expect(results.map(r => r.item.Name)).toEqual(['Thunder-Forged'])
  })
})

// ---------------------------------------------------------------------------
// Real catalogue — guards the field names the filters read (Weapon / Armor /
// MinorArtifact) against future data-file changes.
// ---------------------------------------------------------------------------
const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const maybeDescribe = existsSync(DATA_DIR) ? describe : describe.skip

maybeDescribe('itemFilters over the real item catalogue', () => {
  const items = loadItems(DATA_DIR)
  const groups = loadWeaponGroups(DATA_DIR)
  const optionGroups = itemTypeOptions(items, groups)
  const optionsIn = (label: string) =>
    optionGroups.find(g => g.label === label)?.options ?? []

  it('offers the weapon types players search for', () => {
    const weapons = optionsIn('Weapon type').map(o => o.value)
    for (const type of ['wt:Longsword', 'wt:Great Sword', 'wt:Khopesh', 'wt:Quarterstaff']) {
      expect(weapons).toContain(type)
    }
  })

  it('offers every shield size, separate from the weapon list', () => {
    const shields = optionsIn('Shield type').map(o => o.value)
    expect(shields).toEqual(
      expect.arrayContaining(['wt:Buckler', 'wt:Small Shield', 'wt:Large Shield', 'wt:Tower Shield']),
    )
    expect(optionsIn('Weapon type').map(o => o.value)).not.toContain('wt:Tower Shield')
  })

  it('offers every armor class', () => {
    expect(optionsIn('Armor type').map(o => o.value)).toEqual(
      expect.arrayContaining(['ar:Cloth', 'ar:Light', 'ar:Medium', 'ar:Heavy', 'ar:Docent']),
    )
  })

  it('finds Minor Artifacts', () => {
    const artifacts = items.filter(i => itemMatchesType(i, 'special:artifact', groups))
    expect(artifacts.length).toBeGreaterThan(0)
    expect(artifacts.every(isMinorArtifact)).toBe(true)
  })

  it('resolves weapon classes so a class filter is a superset of its types', () => {
    const twoHanded = items.filter(i => itemMatchesType(i, 'wg:Two Handed', groups))
    const greatswords = items.filter(i => itemMatchesType(i, 'wt:Great Sword', groups))
    expect(greatswords.length).toBeGreaterThan(0)
    expect(twoHanded.length).toBeGreaterThan(greatswords.length)
    expect(twoHanded).toEqual(expect.arrayContaining(greatswords))
  })
})
