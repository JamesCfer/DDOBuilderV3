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
import { itemEffectsSummary } from '../lib/itemDisplay'
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

// ---------------------------------------------------------------------------
// Effect descriptions
// ---------------------------------------------------------------------------
// What an item DOES lives in its <Buff> entries, and almost none of that text
// appears in the Name or the Description: the stat is in <Item>/<Description1>
// and the stacking category in <BonusType>. Searching "insightful
// constitution" or "acid resistance" therefore used to return nothing.

const BRACERS = {
  Name: 'Bracers of the Sun Soul',
  MinLevel: 20,
  EquipmentSlot: { Wrist: true },
  Buff: [
    { Type: 'AbilityBonus', Item: 'Constitution', BonusType: 'Insightful', Value1: 4 },
    { Type: 'EnergyResistance', Item: 'Acid', Value1: 30 },
  ],
} as unknown as Item

describe('effect descriptions are searchable', () => {
  it('matches the stat a buff targets, which appears in no other field', () => {
    expect(itemMatchesSearch(BRACERS, 'constitution')).toBe(true)
    expect(itemMatchesSearch(BRACERS, 'acid resistance')).toBe(true)
    expect(itemMatchesSearch(BRACERS, 'dodge')).toBe(false)
  })

  it('matches the stacking category', () => {
    expect(itemMatchesSearch(BRACERS, 'insightful constitution')).toBe(true)
    expect(itemMatchesSearch(BRACERS, 'quality constitution')).toBe(false)
  })

  it('still matches the raw buff type names', () => {
    expect(itemMatchesSearch(BRACERS, 'abilitybonus')).toBe(true)
  })

  it('renders the same lines the picker shows', () => {
    expect(itemEffectsSummary(BRACERS))
      .toBe('+4 Constitution (Insightful), +30 Acid Resistance')
    expect(itemEffectsSummary(PLAIN_RING)).toBe('')
  })
})

describe('findGearByEffect effect search', () => {
  const items = [BRACERS, PLAIN_RING]

  it('matches the effect description, not just the raw <Type>', () => {
    expect(findGearByEffect(items, { buffSearch: 'Insightful Constitution' })
      .map(r => r.item.Name)).toEqual(['Bracers of the Sun Soul'])
    expect(findGearByEffect(items, { buffSearch: 'acid' })
      .flatMap(r => r.matchedBuffs.map(b => b.Type))).toEqual(['EnergyResistance'])
  })

  it('keeps returning only the buffs that matched', () => {
    const [result] = findGearByEffect(items, { buffSearch: 'constitution' })
    expect(result.matchedBuffs).toHaveLength(1)
    expect(result.matchedBuffs[0].Item).toBe('Constitution')
  })

  it('finds gear by effect through the item-text box too', () => {
    expect(findGearByEffect(items, { nameSearch: 'acid resistance' })
      .map(r => r.item.Name)).toEqual(['Bracers of the Sun Soul'])
  })
})
