import { describe, expect, it } from 'vitest'
import { emitForumExport, DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { Item } from '../types/ddo'

// V2 parity: Parity pass 29 — SimpleGear slot order + augments
// V2 ForumExportDlg.cpp ExportGear iterates Inventory_Arrows..Inventory_Count
// (enum order: Arrow, Armor, Belt, Boots, Bracers, Cloak, Gloves, Goggles,
//  Helmet, Necklace, Quiver, Ring, Ring2, Trinket, Main Hand, Off Hand).
// V3's prior implementation sorted alphabetically instead.
// V2 also emits augment choices per item slot.
//
// Superseded by X19 (see parityPassX19Gear.test.ts): the section's whole
// output format changed from a flat "  slot: item" list to V2's real
// [TABLE]-wrapped ExportGear rows, which requires the resolved gear Item
// catalogue (`gearItems`) in context. These tests keep checking the same
// V2-parity claims (canonical slot order, per-item augment lines) against
// the new row shape.

describe('SimpleGear export (parity pass 29)', () => {
  it('sorts slots in V2 canonical inventory order, not alphabetically', () => {
    const build = {
      ...emptyBuild(),
      gear: {
        Helmet: 'Helm of Knowledge',
        Armor: 'Flawless Blue Dragonscale Robe',
        Belt: 'Belt of Braided Ivy',
      },
    }
    const gearItems: Record<string, Item> = {
      Helmet: { Name: 'Helm of Knowledge' },
      Armor: { Name: 'Flawless Blue Dragonscale Robe' },
      Belt: { Name: 'Belt of Braided Ivy' },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null, gearItems })
    const slotLines = lines.filter(l => l.startsWith('[TR][TD][COLOR'))
    const slots = slotLines.map(l => l.match(/^\[TR\]\[TD\]\[COLOR=[^\]]*\]([^[]*)\[/)![1])
    // V2 order: Armor (index 2) before Belt (index 3) before Helmet (index 9)
    // Alphabetical order would put Armor, Belt, Helmet in the same order by
    // coincidence, so use a slot pair that differs: Helmet vs Armor
    expect(slots.indexOf('Armor')).toBeLessThan(slots.indexOf('Helmet'))
  })

  it('places Weapon slots (Main Hand, Off Hand) after Ring2 and Trinket', () => {
    const build = {
      ...emptyBuild(),
      gear: {
        'Main Hand': 'Falchion of the Claw',
        Helmet: 'Helm of Knowledge',
        Ring: 'Ring of the Stalker',
        Trinket: 'Mysterious Bauble',
      },
    }
    const gearItems: Record<string, Item> = {
      'Main Hand': { Name: 'Falchion of the Claw' },
      Helmet: { Name: 'Helm of Knowledge' },
      Ring: { Name: 'Ring of the Stalker' },
      Trinket: { Name: 'Mysterious Bauble' },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null, gearItems })
    const slotLines = lines.filter(l => l.startsWith('[TR][TD][COLOR'))
    const slots = slotLines.map(l => l.match(/^\[TR\]\[TD\]\[COLOR=[^\]]*\]([^[]*)\[/)![1])
    // V2: Ring before Trinket before Main Hand
    expect(slots.indexOf('Ring')).toBeLessThan(slots.indexOf('Trinket'))
    expect(slots.indexOf('Trinket')).toBeLessThan(slots.indexOf('Main Hand'))
  })

  it('emits an augment line for each chosen augment on an item', () => {
    const build = {
      ...emptyBuild(),
      gear: { Ring: 'Ring of the Stalker' },
      augmentChoices: {
        'Ring:Yellow:0': 'Topaz of Greater Acid Spell Lore',
        'Ring:Green:1': 'Emerald of Constitution +8',
      },
    }
    const gearItems: Record<string, Item> = {
      Ring: {
        Name: 'Ring of the Stalker',
        ItemAugment: [{ Type: 'Yellow' }, { Type: 'Green' }],
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null, gearItems })
    const augmentLines = lines.filter(l => l.startsWith('[TR][TD][/TD][TD]'))
    expect(augmentLines).toContain('[TR][TD][/TD][TD]Yellow: Topaz of Greater Acid Spell Lore[/TD][TD][/TD][/TR]')
    expect(augmentLines).toContain('[TR][TD][/TD][TD]Green: Emerald of Constitution +8[/TD][TD][/TD][/TR]')
  })

  it('does not emit augment lines when the item has no augment slots', () => {
    const build = {
      ...emptyBuild(),
      gear: { Armor: 'Plain Robe' },
      augmentChoices: {},
    }
    const gearItems: Record<string, Item> = { Armor: { Name: 'Plain Robe' } }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null, gearItems })
    const augmentLines = lines.filter(l => l.startsWith('[TR][TD][/TD][TD]'))
    expect(augmentLines.length).toBe(0)
  })
})

// V2 parity: Parity pass 33 — AlternateGearLayouts slot order + augments
// V2 AddAlternateGear calls ExportGear for each non-active gear setup, which
// iterates slots in Inventory_Arrows..Inventory_Count enum order and emits
// augment choices per item (ForumExportDlg.cpp:1779-1857).
// V3 sorted slots alphabetically and had no augment data per named gear set.
describe('AlternateGearLayouts export (parity pass 33)', () => {
  it('sorts slots in V2 canonical inventory order, not alphabetically', () => {
    const build = {
      ...emptyBuild(),
      namedGearSets: {
        Raiding: {
          'Main Hand': 'Falchion of the Claw',
          Necklace: 'Necklace of Mystic Eidolons',
        },
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'AlternateGearLayouts')!
    const lines = section.emit({ build, stats: null })
    const itemLines = lines.filter(l => l.startsWith('    ') && !l.startsWith('      '))
    const slots = itemLines.map(l => l.trim().split(':')[0].trim())
    // Alphabetical order puts "Main Hand" (M) before "Necklace" (N).
    // V2 canonical order: Necklace (index 9) before Main Hand (index 14).
    expect(slots.indexOf('Necklace')).toBeLessThan(slots.indexOf('Main Hand'))
  })

  it('emits augment choices per item slot for each named gear set', () => {
    const build = {
      ...emptyBuild(),
      namedGearSets: {
        Raiding: { Ring: 'Ring of the Stalker' },
      },
      namedGearAugments: {
        Raiding: {
          'Ring:Yellow:0': 'Topaz of Greater Acid Spell Lore',
          'Ring:Green:0': 'Emerald of Constitution +8',
        },
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'AlternateGearLayouts')!
    const lines = section.emit({ build, stats: null })
    const augLines = lines.filter(l => l.startsWith('      '))
    expect(augLines.length).toBe(2)
    expect(augLines).toContain('      Yellow: Topaz of Greater Acid Spell Lore')
    expect(augLines).toContain('      Green: Emerald of Constitution +8')
  })

  it('does not emit augment lines when no augments stored for the set', () => {
    const build = {
      ...emptyBuild(),
      namedGearSets: { Raiding: { Armor: 'Plain Robe' } },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'AlternateGearLayouts')!
    const lines = section.emit({ build, stats: null })
    const augLines = lines.filter(l => l.startsWith('      '))
    expect(augLines.length).toBe(0)
  })
})

describe('emitForumExport', () => {
  it('wraps output in BBCode courier font tags (V2 ForumExportDlg.cpp:195)', () => {
    const text = emitForumExport({ build: emptyBuild(), stats: null })
    expect(text.startsWith('[font=courier]')).toBe(true)
    expect(text.endsWith('[/font]')).toBe(true)
  })

  it('includes character header by default', () => {
    const build = { ...emptyBuild(), name: 'Test Hero', race: 'Dwarf' }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Character Name.*Test Hero/)
    expect(text).toMatch(/Race.*Dwarf/)
  })

  it('lists past lives when present', () => {
    const build = { ...emptyBuild(), pastLives: { Fighter: 3, Wizard: 1 } }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Past Lives/)
    expect(text).toMatch(/Fighter x3/)
  })

  it('omits empty sections', () => {
    const build = emptyBuild()
    const text = emitForumExport({ build, stats: null })
    // Default empty build has no past lives, no notes, no spells
    expect(text).not.toMatch(/\[b\]Past Lives\[\/b\]/)
    expect(text).not.toMatch(/\[b\]Notes\[\/b\]/)
  })

  it('user can disable a section by filtering DEFAULT_SECTIONS', () => {
    const build = { ...emptyBuild(), name: 'Hero', notes: 'My build' }
    const noNotes = DEFAULT_SECTIONS.filter(s => s.id !== 'Notes')
    const text = emitForumExport({ build, stats: null }, noNotes)
    expect(text).not.toMatch(/My build/)
  })

  it('includes trained spells when populated', () => {
    const build = {
      ...emptyBuild(),
      trainedSpells: { Wizard: { 3: ['Fireball'] } },
    }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Spells/)
    expect(text).toMatch(/Fireball/)
  })
})
