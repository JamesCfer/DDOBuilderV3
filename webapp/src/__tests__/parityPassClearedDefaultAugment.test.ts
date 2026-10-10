// V2 Build::GetLatestVersionOfItem (Build.cpp:4443-4521) swaps in the
// catalogue item at load but then CopyUserSetValues (Item.cpp:248-255) puts
// back the SAVED augment list. A pre-slotted catalogue augment ("Sealed in
// Mist" on Acera) that the player cleared is saved as an <ItemAugment> with
// no <SelectedAugment>, and stays cleared in V2. V3's import skipped such
// entries, so mergeAugmentChoices re-applied the catalogue default.
import { describe, it, expect } from 'vitest'
import { importV2Build } from '../lib/v2Import'
import { mergeAugmentChoices } from '../lib/buildStats'
import type { Item } from '../types/ddo'

const ACERA = {
  Name: 'Acera, the Dissolution of All',
  ItemAugment: [
    { Type: 'Sealed in Mist', SelectedAugment: 'Sealed in Mist' },
    { Type: 'Orange' },
    { Type: 'Purple' },
  ],
} as unknown as Item

const xml = (sealed: string) => `<?xml version="1.0" encoding="utf-8"?>
<DDOBuilderCharacterData>
  <Character>
    <Life>
      <Race>Human</Race>
      <Build version="1">
        <Level>20</Level>
        <EquippedGear>
          <Name>Standard</Name>
          <MainHand>
            <Name>Acera, the Dissolution of All</Name>
            <ItemAugment>
              <Type>Sealed in Mist</Type>${sealed}
            </ItemAugment>
            <ItemAugment>
              <Type>Orange</Type>
            </ItemAugment>
            <ItemAugment>
              <Type>Purple</Type>
              <SelectedAugment>Diamond of Strength +1</SelectedAugment>
            </ItemAugment>
          </MainHand>
        </EquippedGear>
        <ActiveGear>Standard</ActiveGear>
      </Build>
    </Life>
    <ActiveLifeIndex>0</ActiveLifeIndex>
    <ActiveBuildIndex>0</ActiveBuildIndex>
  </Character>
</DDOBuilderCharacterData>`

describe('a cleared pre-slotted augment stays cleared on V2 import', () => {
  it('does not re-apply the catalogue default the save cleared', () => {
    const { build } = importV2Build(xml(''))
    const merged = mergeAugmentChoices(build, { 'Main Hand': ACERA })
    expect(merged['Main Hand:Sealed in Mist:0'] ?? '').toBe('')
    expect(merged['Main Hand:Purple:2']).toBe('Diamond of Strength +1')
  })

  it('keeps the default when the save has it selected', () => {
    const { build } = importV2Build(xml('\n              <SelectedAugment>Sealed in Mist</SelectedAugment>'))
    const merged = mergeAugmentChoices(build, { 'Main Hand': ACERA })
    expect(merged['Main Hand:Sealed in Mist:0']).toBe('Sealed in Mist')
  })
})
