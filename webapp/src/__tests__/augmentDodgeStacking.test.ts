// Tester report (build #347): Sapphire of Dodge (Enhancement bonus to Dodge,
// Sapphire.Augments.xml) must not stack with Legendary Ethereal Ring's
// Enhancement Dodge. V2 puts augment effects in the item pool, where the
// same bonus type is highest-only.
import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { computeBuildStats } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import { emptyBuild, type Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

describe.skipIf(!existsSync(DATA))('augment Dodge stacks highest-only with gear Dodge', () => {
  const cat = loadAllCatalogues(DATA)
  initBonusTypes(cat.allBonusTypes)
  const ring = cat.allItems.find(i => i.Name === 'Legendary Ethereal Ring') as Item
  const belt = cat.allItems.find(i => i.Name === 'Belt of Blind Devotion') as Item
  function stats(withRing: boolean, augLevel: number) {
    const build = emptyBuild()
    build.gear = { Belt: belt.Name, ...(withRing ? { Ring1: ring.Name } : {}) } as never
    build.augmentChoices = { 'Belt:Blue:0': 'Sapphire of Dodge' }
    build.augmentLevelChoices = { 'Belt:Blue:0': augLevel }
    const gearItems: Record<string, Item> = { Belt: belt, ...(withRing ? { Ring1: ring } : {}) }
    return computeBuildStats({
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs, gearItems,
    }, build)
  }
  it('Sapphire of Dodge keeps its Enhancement type from the augment data', () => {
    const b = stats(false, 3).resolve('dodge').bonuses.find(x => x.source.includes('Sapphire of Dodge'))
    expect(b?.type).toBe('Enhancement')
    expect(b?.value).toBe(6)
  })
  it('only the higher Enhancement Dodge counts (ring 13 vs sapphire 6)', () => {
    expect(stats(true, 3).total('dodge')).toBe(13)
  })
  it('a stronger sapphire wins instead of stacking (sapphire 16 vs ring 13)', () => {
    expect(stats(true, 9).total('dodge')).toBe(16)
  })
})
