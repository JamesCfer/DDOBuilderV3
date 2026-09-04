import { describe, it, expect } from 'vitest'
import { findGearByEffect } from '../lib/findGear'
import type { Item } from '../types/ddo'

// Minimal mock items for unit testing
const MOCK_ITEMS: Item[] = [
  {
    Name: 'Ring of Strength',
    MinLevel: 5,
    EquipmentSlot: { Ring: true },
    Buff: [
      { Type: 'Strength', Value1: 6, BonusType: 'Enhancement' },
      { Type: 'Physical Resistance Rating', Value1: 10 },
    ],
  } as unknown as Item,
  {
    Name: 'Boots of Strength',
    MinLevel: 10,
    EquipmentSlot: { Boots: true },
    Buff: { Type: 'Strength', Value1: 8, BonusType: 'Insight' },
  } as unknown as Item,
  {
    Name: 'Cloak of Protection',
    MinLevel: 3,
    EquipmentSlot: { Cloak: true },
    Buff: { Type: 'Saving Throws', Value1: 3 },
  } as unknown as Item,
  {
    Name: 'High Level Helm',
    MinLevel: 25,
    EquipmentSlot: { Helmet: true },
    Buff: { Type: 'Strength', Value1: 12, BonusType: 'Quality' },
  } as unknown as Item,
  {
    Name: 'Versatile Necklace',
    MinLevel: 8,
    EquipmentSlot: { Necklace: true },
    // no Buff — item without effects
  } as unknown as Item,
]

describe('findGearByEffect — V2 FindGearDialog parity', () => {
  it('returns all items when no filters are applied', () => {
    const results = findGearByEffect(MOCK_ITEMS, {})
    expect(results).toHaveLength(5)
  })

  it('finds items by exact buff type', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength' })
    expect(results).toHaveLength(3)
    const names = results.map(r => r.item.Name)
    expect(names).toContain('Ring of Strength')
    expect(names).toContain('Boots of Strength')
    expect(names).toContain('High Level Helm')
    expect(names).not.toContain('Cloak of Protection')
  })

  it('excludes items that lack the requested buff type', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Saving Throws' })
    expect(results).toHaveLength(1)
    expect(results[0].item.Name).toBe('Cloak of Protection')
  })

  it('handles items with a single Buff (not an array)', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Saving Throws' })
    expect(results[0].item.Name).toBe('Cloak of Protection')
  })

  it('partial case-insensitive buff type search (buffSearch)', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffSearch: 'str' })
    expect(results).toHaveLength(3)
    const names = results.map(r => r.item.Name)
    expect(names).not.toContain('Cloak of Protection')
    expect(names).not.toContain('Versatile Necklace')
  })

  it('filters by maxLevel (inclusive)', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength', maxLevel: 12 })
    const names = results.map(r => r.item.Name)
    expect(names).toContain('Ring of Strength')    // MinLevel 5
    expect(names).toContain('Boots of Strength')   // MinLevel 10
    expect(names).not.toContain('High Level Helm') // MinLevel 25
  })

  it('filters by minLevel (inclusive)', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength', minLevel: 8 })
    const names = results.map(r => r.item.Name)
    expect(names).not.toContain('Ring of Strength')  // MinLevel 5
    expect(names).toContain('Boots of Strength')     // MinLevel 10
    expect(names).toContain('High Level Helm')       // MinLevel 25
  })

  it('filters by minimum buff value', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength', minValue: 8 })
    const names = results.map(r => r.item.Name)
    expect(names).not.toContain('Ring of Strength')  // Value1: 6 < 8
    expect(names).toContain('Boots of Strength')     // Value1: 8 == 8
    expect(names).toContain('High Level Helm')       // Value1: 12 > 8
  })

  it('filters by item text search (case-insensitive)', () => {
    // The item-text box searches the effect descriptions too, so the helm
    // whose only mention of Strength is its buff comes back as well.
    const results = findGearByEffect(MOCK_ITEMS, { nameSearch: 'strength' })
    expect(results).toHaveLength(3)
    const names = results.map(r => r.item.Name)
    expect(names).toContain('Ring of Strength')
    expect(names).toContain('Boots of Strength')
    expect(names).toContain('High Level Helm')
    expect(names).not.toContain('Cloak of Protection')
  })

  it('exposes matchedBuffs containing only the matching buff(s)', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength' })
    const ring = results.find(r => r.item.Name === 'Ring of Strength')!
    // Ring has Strength + PRR; only Strength should be in matchedBuffs
    expect(ring.matchedBuffs).toHaveLength(1)
    expect(ring.matchedBuffs[0].Type).toBe('Strength')
    expect(ring.matchedBuffs[0].Value1).toBe(6)
  })

  it('exposes all buffs as matchedBuffs when no buff filter is given', () => {
    const results = findGearByEffect(MOCK_ITEMS, { nameSearch: 'Ring of Strength' })
    const ring = results[0]
    // Both Strength and PRR buffs present
    expect(ring.matchedBuffs).toHaveLength(2)
  })

  it('exposes the equippable slots for each result', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength' })
    const ring = results.find(r => r.item.Name === 'Ring of Strength')!
    expect(ring.slots).toContain('Ring')
  })

  it('sorts results by MinLevel ascending then by name', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength' })
    const levels = results.map(r => r.item.MinLevel ?? 0)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1])
    }
  })

  it('combined filters: buffType + maxLevel + minValue', () => {
    const results = findGearByEffect(MOCK_ITEMS, { buffType: 'Strength', maxLevel: 20, minValue: 7 })
    expect(results).toHaveLength(1)
    expect(results[0].item.Name).toBe('Boots of Strength') // Lv10, Value 8
  })
})
