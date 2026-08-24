/**
 * Parity pass — X19: forum-export `AddGear`/`AddSimpleGear`
 * (`ForumExportDlg.cpp:1758-1943 ExportGear`, shared by `bSimple=false`/
 * `bSimple=true`) had no real V3 equivalent — only a bare "  slot: item"
 * list (PARITY_TODO "Low-priority remaining › Forum export gaps").
 *
 * V2 always emits a colored "Equipped Gear Set: <name>" header, wraps a
 * `[SIZE=3][TABLE]`, and per canonical inventory slot: a red "Restricted by
 * another item" row when another equipped item's `RestrictedSlots` disables
 * it, else a colored slot/item-name row with a "Drops in:" cell. `bSimple=
 * false` (the main Gear section) additionally lists each buff's description,
 * augment-slot lines (with a yellow "Empty augment slot" warning on an
 * unfilled slot whose type names both "Mythic" and "Reaper"), set-bonus
 * lines (struck through + "(Suppressed)" when a slotted augment suppresses
 * them), and — main-hand/Minor-Artifact items only — filigree lines
 * (sentient weapon personality first).
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { Item, Augment, FiligreeSlot } from '../types/ddo'

const gearSection = DEFAULT_SECTIONS.find(s => s.id === 'Gear')!
const simpleGearSection = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!

function emptyFiligreeSlots(n: number): FiligreeSlot[] {
  return Array.from({ length: n }, () => ({ name: '', rare: false }))
}

describe('Forum export Gear section (parity pass X19)', () => {
  it('emits nothing when no gearItems context is supplied (nothing resolved yet)', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Plain Robe' } }
    expect(gearSection.emit({ build, stats: null })).toEqual([])
  })

  it('emits nothing when gear is empty', () => {
    const build = emptyBuild()
    expect(gearSection.emit({ build, stats: null, gearItems: {} })).toEqual([])
  })

  it('emits the colored gear-set header and table wrap', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Plain Robe' }, activeGearSetName: 'Raiding' }
    const armor: Item = { Name: 'Plain Robe' }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Armor: armor } })
    expect(lines[0]).toBe('[COLOR=rgb(184, 49, 47)][SIZE=6]Equipped Gear Set: Raiding[/SIZE][/COLOR]')
    expect(lines[1]).toBe('[SIZE=3][TABLE]')
    expect(lines[lines.length - 1]).toBe('[/TABLE][/SIZE]')
  })

  it('falls back to "Standard" as the gear-set name when none is set', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Plain Robe' } }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Armor: { Name: 'Plain Robe' } } })
    expect(lines[0]).toContain('Equipped Gear Set: Standard')
  })

  it('an item row shows the colored slot/name cells and a "Drops in:" cell', () => {
    const build = { ...emptyBuild(), gear: { Helmet: 'Helm of Knowledge' } }
    const item: Item = { Name: 'Helm of Knowledge', DropLocation: 'The Shroud' }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Helmet: item } })
    expect(lines).toContain(
      '[TR][TD][COLOR=rgb(65,168,95)]Helmet[/COLOR][/TD][TD][COLOR=rgb(250, 197, 28)]Helm of Knowledge[/COLOR][/TD][TD]Drops in: The Shroud[/TD][/TR]',
    )
  })

  it('a slot restricted by another equipped item gets the red warning row instead of its own item', () => {
    const build = {
      ...emptyBuild(),
      gear: { 'Main Hand': 'Shining Crescents', 'Off Hand': 'Stale Off Hand' },
    }
    const mainHand: Item = { Name: 'Shining Crescents', RestrictedSlots: { Weapon2: true } }
    const lines = gearSection.emit({ build, stats: null, gearItems: { 'Main Hand': mainHand } })
    expect(lines).toContain(
      '[TR][TD]Off Hand[/TD][TD][COLOR=rgb(184, 49, 47)]Restricted by another item in this gear set[/COLOR][/TD][TD][/TD][/TR]',
    )
    expect(lines.some(l => l.includes('Stale Off Hand'))).toBe(false)
  })

  it('lists a buff description line per item Buff (AddGear only)', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Robe of Con' } }
    const item: Item = { Name: 'Robe of Con', Buff: [{ Type: 'AbilityBonus', Item: 'Constitution', Value1: 5 }] }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Armor: item } })
    expect(lines).toContain('[TR][TD][/TD][TD]Constitution[/TD][TD][/TD][/TR]')
  })

  it('SimpleGear omits buff description lines (bSimple=true)', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Robe of Con' } }
    const item: Item = { Name: 'Robe of Con', Buff: [{ Type: 'AbilityBonus', Item: 'Constitution', Value1: 5 }] }
    const lines = simpleGearSection.emit({ build, stats: null, gearItems: { Armor: item } })
    expect(lines.some(l => l.includes('Constitution'))).toBe(false)
  })

  it('an unfilled slot whose type names both Mythic and Reaper gets the yellow warning', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Mythic Item' } }
    const item: Item = { Name: 'Mythic Item', ItemAugment: [{ Type: 'Mythic Reaper' }] }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Armor: item } })
    expect(lines).toContain(
      '[TR][TD][/TD][TD]Mythic Reaper: [COLOR=rgb(250, 197, 28)]Empty augment slot[/COLOR][/TD][TD][/TD][/TR]',
    )
  })

  it('a plain unfilled augment slot (not Mythic+Reaper) is silent', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Colorless Item' } }
    const item: Item = { Name: 'Colorless Item', ItemAugment: [{ Type: 'Colorless' }] }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Armor: item } })
    expect(lines.some(l => l.includes('Empty augment slot'))).toBe(false)
  })

  it('a chosen augment prints its slot type + name plus its stored-tier value suffix', () => {
    const build = {
      ...emptyBuild(),
      gear: { Ring: 'Ring of the Stalker' },
      augmentChoices: { 'Ring:Yellow:0': 'Topaz of Con' },
      augmentLevelChoices: { 'Ring:Yellow:0': 1 },
    }
    const item: Item = { Name: 'Ring of the Stalker', ItemAugment: [{ Type: 'Yellow' }] }
    const augment: Augment = { Name: 'Topaz of Con', Type: 'Yellow', Levels: '1 5', LevelValue: '2 5' }
    const lines = gearSection.emit({
      build, stats: null, gearItems: { Ring: item }, allAugments: [augment],
    })
    expect(lines).toContain('[TR][TD][/TD][TD]Yellow: Topaz of Con +5[/TD][TD][/TD][/TR]')
  })

  it('a chosen selectable-level augment with no stored tier defaults to index 0', () => {
    const build = {
      ...emptyBuild(),
      gear: { Ring: 'Ring of the Stalker' },
      augmentChoices: { 'Ring:Yellow:0': 'Topaz of Con' },
    }
    const item: Item = { Name: 'Ring of the Stalker', ItemAugment: [{ Type: 'Yellow' }] }
    const augment: Augment = { Name: 'Topaz of Con', Type: 'Yellow', Levels: '1 5', LevelValue: '2 5' }
    const lines = gearSection.emit({
      build, stats: null, gearItems: { Ring: item }, allAugments: [augment],
    })
    expect(lines).toContain('[TR][TD][/TD][TD]Yellow: Topaz of Con +2[/TD][TD][/TD][/TR]')
  })

  it('an augment that suppresses set bonuses strikes through and marks the item set-bonus line', () => {
    const build = {
      ...emptyBuild(),
      gear: { Armor: 'Set Item' },
      augmentChoices: { 'Armor:Yellow:0': 'Suppressing Augment' },
    }
    const item: Item = { Name: 'Set Item', ItemAugment: [{ Type: 'Yellow' }], SetBonus: ['Test Set'] }
    const augment: Augment = { Name: 'Suppressing Augment', Type: 'Yellow', SuppressSetBonus: true }
    const lines = gearSection.emit({
      build, stats: null, gearItems: { Armor: item }, allAugments: [augment],
    })
    expect(lines).toContain('[TR][TD][/TD][TD][COLOR=rgb(65,168,95)][S]Test Set[/S] (Suppressed)[/COLOR][/TD][TD][/TD][/TR]')
  })

  it('a set-bonus item with no suppressing augment prints the plain set-bonus line', () => {
    const build = { ...emptyBuild(), gear: { Armor: 'Set Item' } }
    const item: Item = { Name: 'Set Item', SetBonus: 'Test Set' }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Armor: item } })
    expect(lines).toContain('[TR][TD][/TD][TD][COLOR=rgb(65,168,95)]Test Set[/COLOR][/TD][TD][/TD][/TR]')
  })

  it('artifact filigrees list under a Minor Artifact item', () => {
    const build = {
      ...emptyBuild(),
      gear: { Trinket: 'The Minor Artifact' },
      artifactFiligreeSlots: [{ name: 'Test Filigree', rare: true }, ...emptyFiligreeSlots(9)],
    }
    const item: Item = { Name: 'The Minor Artifact', MinorArtifact: '' }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Trinket: item } })
    expect(lines).toContain('[TR][TD][/TD][TD]Filigree 1: Test Filigree(Rare)[/TD][TD][/TD][/TR]')
  })

  it('a non-artifact item does not list artifact filigrees even if some are slotted', () => {
    const build = {
      ...emptyBuild(),
      gear: { Trinket: 'Plain Trinket' },
      artifactFiligreeSlots: [{ name: 'Test Filigree', rare: false }, ...emptyFiligreeSlots(9)],
    }
    const item: Item = { Name: 'Plain Trinket' }
    const lines = gearSection.emit({ build, stats: null, gearItems: { Trinket: item } })
    expect(lines.some(l => l.includes('Test Filigree'))).toBe(false)
  })

  it('weapon filigrees list under the Main Hand item, sentient personality first', () => {
    const build = {
      ...emptyBuild(),
      gear: { 'Main Hand': 'Sentient Weapon' },
      filigreeSlots: [{ name: 'Test Filigree', rare: false }, ...emptyFiligreeSlots(5)],
      sentientGem: { name: 'Gem', personality: 'Test Personality', majorAugment: '', minorAugment: '' },
    }
    const item: Item = { Name: 'Sentient Weapon' }
    const lines = gearSection.emit({ build, stats: null, gearItems: { 'Main Hand': item } })
    const gemIdx = lines.findIndex(l => l.includes('Sentient Weapon Personality: Test Personality'))
    const filigreeIdx = lines.findIndex(l => l.includes('Filigree 1: Test Filigree'))
    expect(gemIdx).toBeGreaterThan(-1)
    expect(filigreeIdx).toBeGreaterThan(gemIdx)
  })

  it('no personality line when the weapon has filigrees but no sentient personality set', () => {
    const build = {
      ...emptyBuild(),
      gear: { 'Main Hand': 'Non-Sentient Weapon' },
      filigreeSlots: [{ name: 'Test Filigree', rare: false }, ...emptyFiligreeSlots(5)],
    }
    const item: Item = { Name: 'Non-Sentient Weapon' }
    const lines = gearSection.emit({ build, stats: null, gearItems: { 'Main Hand': item } })
    expect(lines.some(l => l.includes('Sentient Weapon Personality'))).toBe(false)
    expect(lines.some(l => l.includes('Filigree 1: Test Filigree'))).toBe(true)
  })
})
