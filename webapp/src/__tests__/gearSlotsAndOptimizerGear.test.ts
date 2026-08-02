// 1. Gear slot naming (lib/gearSlots) — the app's display slot names and the
//    `<EquipmentSlot>` tags in the item XML disagree for weapons, arrows and
//    the second ring. Getting the mapping wrong makes a slot's picker come up
//    empty: GearPanel asked /api/items for slot "Main Hand", which no item is
//    tagged with, so weapons could never be selected.
// 2. The optimizer's gear domain — shortlisting, move generation, applying,
//    and an end-to-end run that equips something into an empty slot.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { itemSlotKey, displaySlotsForItemKey } from '../lib/gearSlots'
import { shortlistForSlot, itemRelevance } from '../lib/optimizer/gearCandidates'
import { gearMoves, applyMove, moveId, describeMove, type MoveContext } from '../lib/optimizer/moves'
import { optimizeBuild } from '../lib/optimizer/optimizer'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, Item } from '../types/ddo'
import type { ObjectiveSpec } from '../lib/optimizer/objective'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

// ---------------------------------------------------------------------------
// Slot naming
// ---------------------------------------------------------------------------

describe('gear slot naming', () => {
  it('maps the display slots whose item-XML tag differs', () => {
    expect(itemSlotKey('Main Hand')).toBe('Weapon1')
    expect(itemSlotKey('Off Hand')).toBe('Weapon2')
    expect(itemSlotKey('Arrow')).toBe('Arrows')
    expect(itemSlotKey('Ring2')).toBe('Ring')
    expect(itemSlotKey('Cosmetic Helmet')).toBe('CosmeticHelm')
  })

  it('passes identically-spelled slots through unchanged', () => {
    for (const slot of ['Helmet', 'Necklace', 'Trinket', 'Armor', 'Cloak',
      'Belt', 'Ring', 'Gloves', 'Bracers', 'Boots', 'Goggles', 'Quiver']) {
      expect(itemSlotKey(slot)).toBe(slot)
    }
  })

  it('inverts back to the display slot(s) an item can go in', () => {
    expect(displaySlotsForItemKey('Weapon1')).toEqual(['Main Hand'])
    expect(displaySlotsForItemKey('Weapon2')).toEqual(['Off Hand'])
    expect(displaySlotsForItemKey('Arrows')).toEqual(['Arrow'])
    expect(displaySlotsForItemKey('Ring')).toEqual(['Ring', 'Ring2'])
    expect(displaySlotsForItemKey('Helmet')).toEqual(['Helmet'])
    expect(displaySlotsForItemKey('CosmeticWeapon1')).toEqual(['Cosmetic Weapon'])
  })
})

describe.skipIf(!have)('gear slot naming against the real item catalogue', () => {
  const cat = loadAllCatalogues(DATA)

  const inSlot = (key: string) =>
    cat.allItems.filter(i => i.EquipmentSlot && key in (i.EquipmentSlot as object))

  it('every display slot the gear panel offers resolves to real items', () => {
    // Arrow is excluded: V2 has the slot but no item in the catalogue uses it.
    for (const slot of ['Helmet', 'Necklace', 'Trinket', 'Armor', 'Cloak',
      'Belt', 'Ring', 'Ring2', 'Gloves', 'Bracers', 'Boots', 'Goggles',
      'Main Hand', 'Off Hand', 'Quiver']) {
      expect(inSlot(itemSlotKey(slot)).length, `${slot} has no items`).toBeGreaterThan(0)
    }
  })

  it('the weapon slots are the ones the old naming missed', () => {
    // The regression: filtering on the display name found nothing at all.
    expect(inSlot('Main Hand')).toHaveLength(0)
    expect(inSlot('Off Hand')).toHaveLength(0)
    expect(inSlot(itemSlotKey('Main Hand')).length).toBeGreaterThan(1000)
    expect(inSlot(itemSlotKey('Off Hand')).length).toBeGreaterThan(1000)
  })
})

// ---------------------------------------------------------------------------
// Optimizer gear domain — shortlisting
// ---------------------------------------------------------------------------

const OBJECTIVE: ObjectiveSpec = {
  mode: 'priority',
  stats: [{ key: 'melee.power', label: 'Melee Power', weight: 1 }],
}

function testItem(name: string, level: number, buffs: unknown): Item {
  return {
    Name: name, MinLevel: level, EquipmentSlot: { Weapon1: '' }, Buff: buffs,
  } as unknown as Item
}

const mp = (v: number, bonus = 'Enhancement') =>
  ({ Type: 'MeleePower', Value1: v, BonusType: bonus })

describe('optimizer gear shortlisting', () => {
  it('scores an item by how much of the objective its buffs claim', () => {
    const keys = new Set(['melee.power'])
    expect(itemRelevance(testItem('Big', 20, mp(20)), keys)).toBe(20)
    expect(itemRelevance(testItem('Small', 20, mp(4)), keys)).toBe(4)
    // Touches nothing the objective asked for.
    expect(itemRelevance(
      testItem('Irrelevant', 20, { Type: 'Hitpoints', Value1: 50, BonusType: 'Enhancement' }),
      keys,
    )).toBe(0)
  })

  it('drops over-level items, drops irrelevant ones, and ranks by relevance', () => {
    const items = [
      testItem('Weak', 10, mp(3)),
      testItem('Strong', 10, mp(30)),
      testItem('Too High', 34, mp(100)),
      testItem('Unrelated', 10, { Type: 'Hitpoints', Value1: 100, BonusType: 'Enhancement' }),
    ]
    const kept = shortlistForSlot(items, OBJECTIVE, { maxLevel: 20 })
    expect(kept.map(i => i.Name)).toEqual(['Strong', 'Weak'])
  })

  it('caps the shortlist at perSlot, keeping the strongest', () => {
    const items = Array.from({ length: 50 }, (_, i) => testItem(`Item ${i}`, 1, mp(i + 1)))
    const kept = shortlistForSlot(items, OBJECTIVE, { maxLevel: 20, perSlot: 3 })
    expect(kept.map(i => i.Name)).toEqual(['Item 49', 'Item 48', 'Item 47'])
  })

  it('is deterministic when relevance ties', () => {
    const items = [
      testItem('Bravo', 5, mp(10)),
      testItem('Alpha', 5, mp(10)),
      testItem('Charlie', 12, mp(10)),
    ]
    // Higher MinLevel first, then alphabetical.
    expect(shortlistForSlot(items, OBJECTIVE, { maxLevel: 20 }).map(i => i.Name))
      .toEqual(['Charlie', 'Alpha', 'Bravo'])
  })
})

// ---------------------------------------------------------------------------
// Optimizer gear domain — moves
// ---------------------------------------------------------------------------

function ctxWith(build: CharacterBuild, candidates: Record<string, Item[]>): MoveContext {
  return {
    build, allClasses: [], allRaces: [], allFeats: [], allTrees: [],
    fatePoints: 0, destinyApBonus: 0, gearCandidates: candidates,
  }
}

describe('optimizer gear moves', () => {
  const sword = testItem('Test Sword', 1, mp(10))
  const axe = testItem('Test Axe', 1, mp(8))

  it('offers every candidate for an empty slot', () => {
    const moves = gearMoves(ctxWith(emptyBuild(), { 'Main Hand': [sword, axe] }))
    expect(moves.map(describeMove)).toEqual([
      'Equip Test Sword in Main Hand',
      'Equip Test Axe in Main Hand',
    ])
  })

  it('never touches a slot the user has already filled', () => {
    const build = { ...emptyBuild(), gear: { 'Main Hand': 'My Chosen Sword' } }
    expect(gearMoves(ctxWith(build, { 'Main Hand': [sword, axe] }))).toEqual([])
  })

  it('applies as an equip without disturbing other slots', () => {
    const build = { ...emptyBuild(), gear: { Helmet: 'My Hat' } }
    const next = applyMove(build, { kind: 'gear', slot: 'Main Hand', itemName: 'Test Sword' })
    expect(next.gear).toEqual({ Helmet: 'My Hat', 'Main Hand': 'Test Sword' })
    expect(build.gear).toEqual({ Helmet: 'My Hat' })      // input untouched
  })

  it('has a stable move id', () => {
    expect(moveId({ kind: 'gear', slot: 'Off Hand', itemName: 'Shield' }))
      .toBe('g|Off Hand|Shield')
  })
})

// ---------------------------------------------------------------------------
// Optimizer gear domain — end to end against real data
// ---------------------------------------------------------------------------

describe.skipIf(!have)('optimizer runs the gear domain end to end', () => {
  const cat = loadAllCatalogues(DATA)
  initBonusTypes(cat.allBonusTypes)

  // Hit points, not melee power: no trinket in the catalogue carries a
  // MeleePower buff, so a melee-power objective correctly shortlists nothing
  // for that slot — which is the filter working, not a run worth asserting on.
  const HP: ObjectiveSpec = {
    mode: 'priority',
    stats: [{ key: 'hp', label: 'Hit Points', weight: 1 }],
  }

  it('equips a hit-point item into an empty slot and reports the gain', async () => {
    const build: CharacterBuild = {
      ...emptyBuild(),
      race: 'Human',
      classes: [{ name: 'Fighter', levels: 20 }] as unknown as CharacterBuild['classes'],
      levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
      totalLevel: 20,
      gear: {},
    }
    const input = {
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs, gearItems: {} as Record<string, Item>,
    }

    const trinkets = cat.allItems.filter(
      i => i.EquipmentSlot && 'Trinket' in (i.EquipmentSlot as object),
    )
    const candidates = { Trinket: shortlistForSlot(trinkets, HP, { maxLevel: 20, perSlot: 8 }) }
    expect(candidates.Trinket.length).toBeGreaterThan(0)

    const res = await optimizeBuild({
      input, build, objective: HP,
      domains: { enhancements: false, destinies: false, feats: false, classLevels: false, gear: true },
      gearCandidates: candidates,
      maxEvals: 200,
    })

    const equips = res.applied.filter(a => a.move.kind === 'gear')
    expect(equips.length).toBeGreaterThan(0)
    expect(res.build.gear.Trinket).toBeTruthy()
    // The equipped item is one of the shortlisted candidates, and the run
    // actually moved the objective.
    expect(candidates.Trinket.some(i => i.Name === res.build.gear.Trinket)).toBe(true)
    expect(res.before[0].after).toBeGreaterThan(res.before[0].before)
  })

  it('leaves an already-equipped slot alone', async () => {
    const chosen = cat.allItems.find(
      i => i.EquipmentSlot && 'Trinket' in (i.EquipmentSlot as object),
    )!
    const build: CharacterBuild = {
      ...emptyBuild(),
      race: 'Human',
      classes: [{ name: 'Fighter', levels: 20 }] as unknown as CharacterBuild['classes'],
      levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
      totalLevel: 20,
      gear: { Trinket: chosen.Name },
    }
    const input = {
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs,
      gearItems: { Trinket: chosen } as Record<string, Item>,
    }
    const trinkets = cat.allItems.filter(
      i => i.EquipmentSlot && 'Trinket' in (i.EquipmentSlot as object),
    )
    const res = await optimizeBuild({
      input, build, objective: HP,
      domains: { enhancements: false, destinies: false, feats: false, classLevels: false, gear: true },
      gearCandidates: { Trinket: shortlistForSlot(trinkets, HP, { maxLevel: 20, perSlot: 8 }) },
      maxEvals: 200,
    })
    expect(res.build.gear.Trinket).toBe(chosen.Name)
    expect(res.applied.filter(a => a.move.kind === 'gear')).toEqual([])
  })
})
