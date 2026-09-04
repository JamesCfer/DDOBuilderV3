// What an item effect DOES, in the pickers and in search.
//
// The gap this closes: an item's <Buff> is often nothing but a <Type>. Lucid
// Dreams carries `<Buff><Type>Mind Drain</Type></Buff>` and no values at all —
// the sentence a player wants ("reduces your maximum spell points by 5% while
// equipped") lives in ItemBuffs.xml against that Type. Showing and searching
// the item's own fields therefore showed the two words "Mind Drain" and found
// nothing for "spell points".

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  buffDescription, itemEffectsSummary, itemEffectsText, itemEffectDetails,
  setBuffTemplates, resetBuffTemplatesForTests,
} from '../lib/itemDisplay'
import { itemMatchesSearch } from '../lib/searchMatch'
import { loadItemBuffs, loadItems } from '../server/dataLoaders'
import type { Item } from '../types/ddo'

const TEMPLATES = [
  {
    Type: 'Mind Drain',
    DisplayText: 'Mind Drain: This item reduces your maximum spell points by 5% while equipped.',
  },
  {
    Type: 'AbilityBonus',
    DisplayText: '%b1 %i1 %v1: Passive: %v1 %b1 bonus to %i1.',
  },
  {
    Type: 'WillSave',
    DisplayText: '%b1 Will Save %v1: Passive: %v1 %b1 bonus to Will saving throws.',
  },
  { Type: 'Deception', DisplayText: 'Deception: On Vorpal: The target is knocked down.' },
]

/** Lucid Dreams, as the shipped .item file has it: a Mind Drain buff with no
 *  fields of its own, next to buffs that do carry values. */
const RUNE_ARM = {
  Name: 'Lucid Dreams',
  MinLevel: 19,
  EquipmentSlot: { Weapon2: true },
  Buff: [
    { Type: 'Mind Drain' },
    { Type: 'WillSave', Value1: -2, BonusType: 'Resistance' },
    { Type: 'AbilityBonus', Value1: 15, BonusType: 'Enhancement', Item: 'Intelligence' },
  ],
} as unknown as Item

describe('effect descriptions', () => {
  beforeEach(() => { setBuffTemplates(TEMPLATES) })
  afterEach(() => { resetBuffTemplatesForTests() })

  it('resolves a buff that carries nothing but its type', () => {
    expect(buffDescription({ Type: 'Mind Drain' }))
      .toBe('This item reduces your maximum spell points by 5% while equipped.')
  })

  it('substitutes the item’s own value, bonus type and target', () => {
    // The template's own "%b1 %i1 %v1:" label is built from the same parts the
    // panel already shows beside the sentence, so it goes.
    expect(buffDescription({
      Type: 'AbilityBonus', Value1: 15, BonusType: 'Enhancement', Item: 'Intelligence',
    })).toBe('Passive: +15 Enhancement bonus to Intelligence.')
  })

  it('keeps the sign on a penalty', () => {
    expect(buffDescription({ Type: 'WillSave', Value1: -2, BonusType: 'Resistance' }))
      .toBe('Passive: -2 Resistance bonus to Will saving throws.')
  })

  it('keeps a prefix that is prose rather than the effect’s own label', () => {
    setBuffTemplates([
      ...TEMPLATES,
      { Type: 'Guard', DisplayText: 'Guard: When hit in melee: the attacker takes damage.' },
    ])
    // "When hit in melee:" is a condition, not a restatement of the label.
    expect(buffDescription({ Type: 'Guard' }))
      .toBe('When hit in melee: the attacker takes damage.')
  })

  it('prefers Description1 over Item for the substituted target', () => {
    expect(buffDescription({
      Type: 'AbilityBonus', Value1: 4, BonusType: 'Insightful',
      Description1: 'Constitution', Item: 'All',
    })).toContain('bonus to Constitution.')
  })

  it('drops the repeated effect name but keeps the trigger clause', () => {
    // "Deception:" is the label already shown beside the sentence; "On Vorpal:"
    // is what the effect needs to happen, and must survive.
    expect(buffDescription({ Type: 'Deception' }))
      .toBe('On Vorpal: The target is knocked down.')
  })

  it('has no description for a buff the catalogue does not name', () => {
    expect(buffDescription({ Type: 'NotInTheCatalogue', Value1: 5 })).toBeUndefined()
    expect(buffDescription({ Type: '' })).toBeUndefined()
  })

  it('gives every effect on an item its label and its sentence', () => {
    const details = itemEffectDetails(RUNE_ARM)
    expect(details.map(d => d.label)).toEqual(['Mind Drain', 'Will Save', 'Intelligence'])
    expect(details[0].description).toMatch(/maximum spell points/)
  })

  it('keeps the compact summary to labels and the full text to sentences', () => {
    expect(itemEffectsSummary(RUNE_ARM))
      .toBe('Mind Drain, -2 Will Save (Resistance), +15 Intelligence (Enhancement)')
    expect(itemEffectsText(RUNE_ARM)).toContain('Mind Drain: This item reduces your maximum spell points')
  })

  it('finds the item by what the effect does, not only by its name', () => {
    expect(itemMatchesSearch(RUNE_ARM, 'spell points')).toBe(true)
    expect(itemMatchesSearch(RUNE_ARM, 'mind drain')).toBe(true)
    expect(itemMatchesSearch(RUNE_ARM, 'reduces maximum')).toBe(true)
    expect(itemMatchesSearch(RUNE_ARM, 'healing amplification')).toBe(false)
  })

  it('re-searches an item cached before the catalogue arrived', () => {
    resetBuffTemplatesForTests()
    // The pickers render before ItemBuffs.xml has loaded, so the first search
    // text is built without any descriptions; registering must invalidate it.
    expect(itemMatchesSearch(RUNE_ARM, 'spell points')).toBe(false)
    setBuffTemplates(TEMPLATES)
    expect(itemMatchesSearch(RUNE_ARM, 'spell points')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Against the shipped data files
// ---------------------------------------------------------------------------

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(join(DATA_DIR, 'Items'))

describe.skipIf(!haveData)('against the shipped catalogue', () => {
  it('describes Mind Drain on the rune arm that actually carries it', () => {
    setBuffTemplates(loadItemBuffs(DATA_DIR))
    try {
      const lucidDreams = loadItems(DATA_DIR).find(i => i.Name === 'Lucid Dreams')
      expect(lucidDreams, 'Lucid Dreams is in the shipped items').toBeTruthy()

      expect(itemEffectsText(lucidDreams!)).toMatch(/maximum spell points/i)
      expect(itemMatchesSearch(lucidDreams!, 'maximum spell points')).toBe(true)
    } finally {
      resetBuffTemplatesForTests()
    }
  })
})
