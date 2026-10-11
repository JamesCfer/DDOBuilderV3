// V2 Gear menu Copy/Paste parity: the clipboard payload is the <EquippedGear>
// XML fragment EquippedGear::Write produces (EquipmentPane::OnGearCopy /
// OnGearPaste). Round-trip: export a set → re-import → identical gear +
// augment keys.

import { describe, expect, it } from 'vitest'
import { exportGearSetXml } from '../lib/v2Export'
import { importGearSetXml } from '../lib/v2Import'

describe('gear-set clipboard XML round-trip', () => {
  it('round-trips slots and augments', () => {
    const gear = { 'Main Hand': 'Handwraps of the Hound', Armor: 'Legendary Tourney Armor', Ring: 'Circle of Malevolence' }
    const augments = { 'Main Hand:Red:0': 'Diamond of Intimidate', 'Armor:Blue:1': 'Sapphire of Defense +11' }
    const xml = exportGearSetXml('My Set', gear, augments)
    const parsed = importGearSetXml(xml)
    expect(parsed).not.toBeNull()
    expect(parsed!.name).toBe('My Set')
    expect(parsed!.gear).toEqual(gear)
    // Each pasted slot also carries the `<slot>:*` marker: like a loaded
    // save, its augments are exactly the ones the XML lists (V2
    // Item::CopyUserSetValues), with no catalogue defaults added.
    expect(parsed!.augmentChoices).toEqual({
      ...augments, 'Main Hand:*': '', 'Armor:*': '', 'Ring:*': '',
    })
  })

  it('returns null for non-gear-set text', () => {
    expect(importGearSetXml('hello world')).toBeNull()
    expect(importGearSetXml('<SomethingElse/>')).toBeNull()
  })
})
