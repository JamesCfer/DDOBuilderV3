// V2 Build::GetLatestVersionOfItem (Build.cpp:4443-4521) swaps in the
// catalogue item at load, then Item::CopyUserSetValues (Item.cpp:248-255)
// replaces its augment list with the SAVED one. A pre-slotted catalogue
// augment the save does not carry (an item saved before the data gained the
// default, or a save written with no <ItemAugment> list at all, like
// fuzz-5092's Cannith Crafted Heavy Armor) is therefore absent in V2.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { mergeAugmentChoices } from '../lib/buildStats'
import { effectiveAugmentChoice } from '../lib/gearSlotUpgrades'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import type { Item, ItemAugment } from '../types/ddo'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const FUZZ = join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-5092.DDOBuild')

const ARMOR = {
  Name: 'Cannith Crafted Heavy Armor',
  ItemAugment: [
    { Type: 'Cannith Armor Enhancement', SelectedAugment: 'Cannith Armor Enhancement' },
    { Type: 'Cannith Armor AC Bonus', SelectedAugment: 'Armor AC Bonus' },
  ],
} as unknown as Item

const xml = (augments: string) => `<?xml version="1.0" encoding="utf-8"?>
<DDOBuilderCharacterData>
  <Character>
    <Life>
      <Race>Human</Race>
      <Build version="1">
        <Level>20</Level>
        <EquippedGear>
          <Name>Standard</Name>
          <Armor>
            <Name>Cannith Crafted Heavy Armor</Name>${augments}
          </Armor>
        </EquippedGear>
        <ActiveGear>Standard</ActiveGear>
      </Build>
    </Life>
    <ActiveLifeIndex>0</ActiveLifeIndex>
    <ActiveBuildIndex>0</ActiveBuildIndex>
  </Character>
</DDOBuilderCharacterData>`

describe('an imported item keeps only the augments its save carries', () => {
  it('applies no catalogue default when the saved item has no augment list', () => {
    const { build } = importV2Build(xml(''))
    const merged = mergeAugmentChoices(build, { Armor: ARMOR })
    expect(Object.values(merged).filter(Boolean)).toEqual([])
    const first = (ARMOR.ItemAugment as ItemAugment[])[0]
    expect(effectiveAugmentChoice(build.augmentChoices, 'Armor:Cannith Armor Enhancement:0', first)).toBe('')
  })

  it('keeps the saved selections', () => {
    const { build } = importV2Build(xml(`
            <ItemAugment>
              <Type>Cannith Armor Enhancement</Type>
              <SelectedAugment>Cannith Armor Enhancement</SelectedAugment>
            </ItemAugment>`))
    const merged = mergeAugmentChoices(build, { Armor: ARMOR })
    expect(merged['Armor:Cannith Armor Enhancement:0']).toBe('Cannith Armor Enhancement')
    expect(merged['Armor:Cannith Armor AC Bonus:1'] ?? '').toBe('')
  })

  it('a newly equipped item still gets its catalogue defaults', () => {
    const merged = mergeAugmentChoices({ augmentChoices: {} } as never, { Armor: ARMOR })
    expect(merged['Armor:Cannith Armor AC Bonus:1']).toBe('Armor AC Bonus')
  })

  // Oracle-pinned: v2calc reports AC 18 for this save.
  it.skipIf(!existsSync(FUZZ) || !existsSync(DATA))('fuzz-5092 AC matches V2 (18)', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(readFileSync(FUZZ, 'utf8'), cat)
    expect(stats.total('ac')).toBe(18)
  }, 120_000)
})
