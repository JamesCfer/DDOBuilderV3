// V2 → V3 parity: AutomaticAcquisition-derived feats (Sunder / Trip /
// Defensive Fighting / Attack / Sneak / Heroic Durability / Improved Heroic
// Durability) are trained via V2's per-feat <AutomaticAcquisition> mechanism
// (Build.cpp:2510-2552) rather than a class AutomaticFeats list or race
// GrantedFeat entry. `buildStats.ts` already applies their stat effects, but
// neither the Automatic Feats panel nor the forum export's AutomaticFeats
// section (both driven by `buildAutomaticFeatGroups`) ever surfaced them —
// V2's own forum export (`AddAutomaticFeats`, ForumExportDlg.cpp:691-729)
// lists every `LevelTraining::AutomaticFeats()` entry, which includes these.
//
// V2 sources cited:
//   Build.cpp:2510-2552        Build::AutomaticFeats (per-feat AutomaticAcquisition scan)
//   Class.cpp:383-404          Class::ImprovedHeroicDurabilityFeats
//   ForumExportDlg.cpp:691-729 AddAutomaticFeats

import { describe, expect, it } from 'vitest'
import { automaticAcquisitionFeatGroup } from '../lib/automaticFeats'
import { emitForumExport } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { DDOClass, Feat } from '../types/ddo'

const fighter: DDOClass = { Name: 'Fighter' } as unknown as DDOClass

const autoAcquisitionFeats: Feat[] = [
  {
    Name: 'Attack', Acquire: 'Automatic',
    AutomaticAcquisition: { Requirement: { Type: 'Level', Value: 1 } },
  },
  {
    Name: 'Sneak', Acquire: 'Automatic',
    AutomaticAcquisition: { Requirement: { Type: 'SpecificLevel', Value: 1 } },
  },
  {
    Name: 'Heroic Durability', Acquire: 'Automatic',
    AutomaticAcquisition: { Requirement: { Type: 'SpecificLevel', Value: 1 } },
  },
  {
    Name: 'Sunder', Acquire: 'Automatic',
    AutomaticAcquisition: { Requirement: { Type: 'BAB', Value: 1 } },
  },
  {
    Name: 'Trip', Acquire: 'Automatic',
    AutomaticAcquisition: { Requirement: { Type: 'BAB', Value: 1 } },
  },
  {
    Name: 'Defensive Fighting', Acquire: 'Automatic',
    AutomaticAcquisition: { Requirement: { Type: 'BAB', Value: 1 } },
  },
  // V2's real Completionist/Racial Completionist gating comes from past-life
  // counts, not this XML placeholder — must stay excluded here.
  {
    Name: 'Completionist', Acquire: 'Automatic',
    AutomaticAcquisition: { Requirement: { Type: 'Level', Value: 3 } },
  },
  // A Train-acquired feat with an AutomaticAcquisition block (e.g. a racial
  // weapon-proficiency grant) must not appear — only Acquire="Automatic".
  {
    Name: 'Exotic Weapon Proficiency (Dwarven Axe)', Acquire: 'Train',
    AutomaticAcquisition: { Requirement: { Type: 'Level', Value: 1 } },
  },
]

describe('automaticAcquisitionFeatGroup', () => {
  it('returns null for a build with no levels trained', () => {
    const build = {
      ...emptyBuild(),
      classes: [{ name: '', levels: 0 }, { name: '', levels: 0 }, { name: '', levels: 0 }] as
        [{ name: string; levels: number }, { name: string; levels: number }, { name: string; levels: number }],
      levelClasses: [],
      totalLevel: 0,
      epicLevels: 0,
      legendaryLevels: 0,
    }
    expect(automaticAcquisitionFeatGroup(build, autoAcquisitionFeats, [fighter])).toBeNull()
  })

  it('lists all level/BAB-gated AutomaticAcquisition feats for a trained build', () => {
    const build = {
      ...emptyBuild(),
      classes: [{ name: 'Fighter', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }] as
        [{ name: string; levels: number }, { name: string; levels: number }, { name: string; levels: number }],
      levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
      totalLevel: 20,
      epicLevels: 0,
      legendaryLevels: 0,
    }
    const group = automaticAcquisitionFeatGroup(build, autoAcquisitionFeats, [fighter])
    expect(group).not.toBeNull()
    expect(group?.feats).toEqual(expect.arrayContaining([
      'Attack', 'Sneak', 'Heroic Durability', 'Sunder', 'Trip', 'Defensive Fighting',
    ]))
    // Excluded: Completionist (handled elsewhere) and a Train-acquired feat.
    expect(group?.feats).not.toContain('Completionist')
    expect(group?.feats).not.toContain('Exotic Weapon Proficiency (Dwarven Axe)')
    // V2 Class::ImprovedHeroicDurabilityFeats: one synthesized entry per
    // milestone class level (5/10/15) reached by a heroic class.
    expect(group?.feats).toEqual(expect.arrayContaining([
      'Improved Heroic Durability (Fighter 5)',
      'Improved Heroic Durability (Fighter 10)',
      'Improved Heroic Durability (Fighter 15)',
    ]))
  })

  it('omits BAB-gated feats before BAB 1 is reached', () => {
    const cls: DDOClass = { Name: 'Wizard', BAB: '0 0 0 1 1' } as unknown as DDOClass
    const build = {
      ...emptyBuild(),
      classes: [{ name: 'Wizard', levels: 2 }, { name: '', levels: 0 }, { name: '', levels: 0 }] as
        [{ name: string; levels: number }, { name: string; levels: number }, { name: string; levels: number }],
      levelClasses: ['Wizard', 'Wizard'],
      totalLevel: 2,
      epicLevels: 0,
      legendaryLevels: 0,
    }
    const group = automaticAcquisitionFeatGroup(build, autoAcquisitionFeats, [cls])
    // Level/SpecificLevel-gated feats are still granted...
    expect(group?.feats).toEqual(expect.arrayContaining(['Attack', 'Sneak', 'Heroic Durability']))
    // ...but BAB-gated ones aren't, since this class's BAB table is 0 at level 2.
    expect(group?.feats).not.toContain('Sunder')
    expect(group?.feats).not.toContain('Trip')
    expect(group?.feats).not.toContain('Defensive Fighting')
  })
})

describe('forum export AutomaticFeats section includes AutomaticAcquisition feats', () => {
  it('emits the "Automatically Acquired" group when allFeats is supplied', () => {
    const build = {
      ...emptyBuild(),
      race: '',
      classes: [{ name: 'Fighter', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }] as
        [{ name: string; levels: number }, { name: string; levels: number }, { name: string; levels: number }],
      levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
      totalLevel: 20,
      epicLevels: 0,
      legendaryLevels: 0,
    }
    const text = emitForumExport({
      build, stats: null, allClasses: [fighter], allRaces: [], allFeats: autoAcquisitionFeats,
    })
    expect(text).toMatch(/Automatically Acquired.*Attack.*Sneak.*Sunder/)
  })

  it('omits the group when allFeats is not supplied (legacy callers)', () => {
    const build = { ...emptyBuild(), race: '' }
    const text = emitForumExport({ build, stats: null, allClasses: [fighter], allRaces: [] })
    expect(text).not.toMatch(/Automatically Acquired/)
  })
})
