// Item and filigree searches match description and set bonus, not only Name.
//
// A player looking for the goggles "attuned to the Shadowfell", or every piece
// of the "Angelic Wings" set, had to know each entry's own name — the pickers
// only ever matched Name.

import { describe, it, expect } from 'vitest'
import {
  itemMatchesSearch, filigreeMatchesSearch, searchTerms, matchesTerms,
} from '../lib/searchMatch'
import { findGearByEffect } from '../lib/findGear'
import type { Filigree, Item } from '../types/ddo'

const GOGGLES = {
  Name: 'Shadowsight',
  Description: 'Goggle attuned to the Shadowfell that makes hitting incorporeal creatures easier.',
  MinLevel: 14,
  EquipmentSlot: { Goggles: true },
} as unknown as Item

const CLOAK = {
  Name: "Nightsinger's Mantle",
  SetBonus: ['Shadowfell Conspirator'],
  MinLevel: 15,
  EquipmentSlot: { Cloak: true },
} as unknown as Item

const PLAIN_RING = { Name: 'Ring of Strength', MinLevel: 5, EquipmentSlot: { Ring: true } } as unknown as Item

const FILIGREE: Filigree = {
  Name: 'Angelic Wings: +10 Healing Amplification',
  Description: '+10 Healing Amplification\nRare: +2 MRR',
  SetBonus: 'Angelic Wings',
}

describe('itemMatchesSearch', () => {
  it('matches the name, as it always did', () => {
    expect(itemMatchesSearch(GOGGLES, 'shadowsight')).toBe(true)
    expect(itemMatchesSearch(PLAIN_RING, 'shadowsight')).toBe(false)
  })

  it('matches text from the description', () => {
    expect(itemMatchesSearch(GOGGLES, 'incorporeal')).toBe(true)
    expect(itemMatchesSearch(PLAIN_RING, 'incorporeal')).toBe(false)
  })

  it('matches a set bonus name', () => {
    expect(itemMatchesSearch(CLOAK, 'conspirator')).toBe(true)
    expect(itemMatchesSearch(PLAIN_RING, 'conspirator')).toBe(false)
  })

  it('requires every term, in any order and across fields', () => {
    expect(itemMatchesSearch(GOGGLES, 'shadowfell goggle')).toBe(true)
    expect(itemMatchesSearch(GOGGLES, 'shadowfell longsword')).toBe(false)
  })

  it('is case-insensitive and matches everything on an empty query', () => {
    expect(itemMatchesSearch(GOGGLES, 'SHADOWFELL')).toBe(true)
    expect(itemMatchesSearch(PLAIN_RING, '   ')).toBe(true)
    expect(itemMatchesSearch(PLAIN_RING, undefined)).toBe(true)
  })
})

describe('filigreeMatchesSearch', () => {
  it('matches name, description and set name', () => {
    expect(filigreeMatchesSearch(FILIGREE, 'angelic')).toBe(true)
    expect(filigreeMatchesSearch(FILIGREE, 'healing amplification')).toBe(true)
    expect(filigreeMatchesSearch(FILIGREE, 'mrr')).toBe(true)
    expect(filigreeMatchesSearch(FILIGREE, 'dodge')).toBe(false)
  })

  it('matches everything on an empty query', () => {
    expect(filigreeMatchesSearch(FILIGREE, '')).toBe(true)
  })
})

describe('searchTerms / matchesTerms', () => {
  it('splits on whitespace and lower-cases', () => {
    expect(searchTerms('  Angelic   Wings ')).toEqual(['angelic', 'wings'])
    expect(searchTerms('')).toEqual([])
    expect(matchesTerms('angelic wings', ['wings', 'angelic'])).toBe(true)
    expect(matchesTerms('angelic wings', ['angelic', 'boots'])).toBe(false)
  })
})

describe('findGearByEffect — the Find Gear dialog uses the same matching', () => {
  const items = [GOGGLES, CLOAK, PLAIN_RING]

  it('finds gear by description text', () => {
    const results = findGearByEffect(items, { nameSearch: 'incorporeal' })
    expect(results.map(r => r.item.Name)).toEqual(['Shadowsight'])
  })

  it('finds gear by set bonus', () => {
    const results = findGearByEffect(items, { nameSearch: 'Shadowfell Conspirator' })
    expect(results.map(r => r.item.Name)).toEqual(["Nightsinger's Mantle"])
  })

  it('still finds gear by name', () => {
    const results = findGearByEffect(items, { nameSearch: 'ring of strength' })
    expect(results.map(r => r.item.Name)).toEqual(['Ring of Strength'])
  })
})
