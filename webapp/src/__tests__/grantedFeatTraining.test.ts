// Feats a CLASS grants are feats the character has.
//
// Dark Hunter (and Ranger) are granted Two Weapon Fighting at class level 2
// and Improved Two Weapon Fighting at 6. V3 read `build.featChoices` — the
// trained slots — in two places that should have read the whole feat set
// (V2 Build::CurrentFeats), so the picker went on offering Two Weapon
// Fighting as if it had never been granted, and the combat panel computed a
// TWF tier of 0 for a character the game gives two off-hand tiers to.

import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { buildSlots } from '../lib/levelTraining'
import { featOptionsForSlot } from '../lib/featEligibility'
import { acquiredFeatNames } from '../lib/automaticFeats'
import { twoWeaponFightingTier } from '../lib/combat/attackRate'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

function darkHunter(levels: number): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Dark Hunter', levels }, { name: '', levels: 0 }, { name: '', levels: 0 }],
    levelClasses: Array.from({ length: levels }, () => 'Dark Hunter'),
    totalLevel: levels,
    epicLevels: 0,
    legendaryLevels: 0,
  }
}

describe.skipIf(!have)('class-granted feats (Dark Hunter)', () => {
  const cat = loadAllCatalogues(DATA)
  const { allClasses, allRaces, allFeats } = cat
  const race = allRaces.find(r => r.Name === 'Human')

  it('counts the granted Two Weapon Fighting chain as acquired', () => {
    const names = acquiredFeatNames(darkHunter(6), allClasses, allRaces)
    expect(names.has('Two Weapon Fighting')).toBe(true)
    expect(names.has('Improved Two Weapon Fighting')).toBe(true)
    // Granted at class level 11 — not yet at 6.
    expect(names.has('Greater Two Weapon Fighting')).toBe(false)
  })

  it('drives the combat TWF tier from granted feats', () => {
    expect(twoWeaponFightingTier(acquiredFeatNames(darkHunter(1), allClasses, allRaces))).toBe(0)
    expect(twoWeaponFightingTier(acquiredFeatNames(darkHunter(2), allClasses, allRaces))).toBe(1)
    expect(twoWeaponFightingTier(acquiredFeatNames(darkHunter(6), allClasses, allRaces))).toBe(2)
  })

  /** Feat names the picker offers for the character-level `level` slots. */
  function offeredAtLevel(build: CharacterBuild, level: number): Set<string> {
    const slots = buildSlots(build, allClasses, allRaces)
    const names = new Set<string>()
    for (const slot of slots.filter(s => s.level === level)) {
      for (const o of featOptionsForSlot(slot, slots, allFeats, build, allClasses, race)) {
        names.add(o.feat.Name)
      }
    }
    return names
  }

  it('stops offering a feat the class already granted', () => {
    const offered = offeredAtLevel(darkHunter(6), 6)
    expect(offered.has('Two Weapon Fighting')).toBe(false)
    expect(offered.has('Improved Two Weapon Fighting')).toBe(false)
  })

  it('still offers a feat granted only at a LATER level (V2 CurrentFeats(level))', () => {
    // Improved Two Weapon Fighting arrives at class level 6, so a level-3 slot
    // has not been given it yet.
    const offered = offeredAtLevel(darkHunter(6), 3)
    expect(offered.has('Two Weapon Fighting')).toBe(false)   // granted at 2
    expect(offered.has('Improved Two Weapon Fighting')).toBe(true)
  })

  it('keeps a slot\'s own trained choice listed after a later grant', () => {
    // Trained at level 1, before the class grant at 2 — V2's includeThisFeat
    // keeps it in that slot's list so it can still be seen and changed.
    const build = darkHunter(6)
    const slots = buildSlots(build, allClasses, allRaces)
    const slot = slots.find(s => s.level === 1 && s.featType === 'Heroic')
    expect(slot).toBeDefined()
    build.featChoices = { [slot!.key]: 'Two Weapon Fighting' }
    const offered = featOptionsForSlot(slot!, slots, allFeats, build, allClasses, race)
    expect(offered.some(o => o.feat.Name === 'Two Weapon Fighting')).toBe(true)
  })
})
