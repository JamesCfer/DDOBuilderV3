/**
 * Iconic past-life stances.
 *
 * Every iconic race file carries an `Acquire=IconicPastLife` feat hosting a
 * `Group="Iconic"` stance whose toggle is what actually applies that past
 * life's bonus (+2/4/6% Doublestrike for Aasimar Scourge, +10/20/30 spell
 * power for Bladeforged, …) — the effects are gated on
 * `Requirement Type="Stance"`. V3 recorded the past lives but never offered
 * the toggle, so those bonuses could not be applied at all.
 *
 * The stances are named "<Race> " WITH A TRAILING SPACE in V2's data, which is
 * how V2 keeps them distinct from the auto-stance it generates for the race
 * itself. fast-xml-parser trims values, collapsing the two names onto one — so
 * being a Bladeforged silently granted the Bladeforged past-life bonus with no
 * past life and no toggle. `restoreIconicStanceNames` puts the space back on
 * both the stance and the requirements that gate on it.
 *
 * V2's "Iconic" group is single-selection (StanceGroup.cpp:16-19), so only one
 * iconic stance can be active at a time.
 */

import { describe, it, expect } from 'vitest'
import { restoreIconicStanceNames } from '../server/dataLoaders'
import { collectDynamicStances, isSingleSelectionGroup } from '../lib/stances/dynamicStances'
import { computeBuildStats, type BuildStatsInput } from '../lib/buildStats'
import { reducer } from '../context/CharacterContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, Feat, Race } from '../types/ddo'

// A trimmed copy of AasimarScourge.race.xml's past-life feat, exactly as
// fast-xml-parser delivers it (trailing spaces already gone).
function scourgeFeat(): Feat {
  return {
    Name: 'Past Life: Aasimar Scourge',
    Description: 'Iconic Past Life Stance: +1% Doublestrike per stack.',
    Acquire: 'IconicPastLife',
    MaxTimesAcquire: 3,
    Stance: [{
      Name: 'Aasimar Scourge',
      Description: 'Iconic Past Life Stance: +[2/4/6]% Doublestrike.',
      Group: ['Iconic'],
    }],
    Effect: [
      {
        Type: 'Doublestrike', Bonus: 'Feat', AType: 'Simple', Amount: 2,
        Requirements: { Requirement: [{ Type: 'Stance', Item: ['Aasimar Scourge'] }] },
      },
      // Ungated companion effect — the passive half of the past life.
      { Type: 'SaveBonus', Bonus: 'Feat', AType: 'Simple', Amount: 1, Item: ['Fortitude'] },
    ],
  } as unknown as Feat
}

function bladeforgedFeat(): Feat {
  return {
    Name: 'Past Life: Bladeforged',
    Acquire: 'IconicPastLife',
    MaxTimesAcquire: 3,
    Stance: [{ Name: 'Bladeforged', Group: ['Iconic'] }],
    Effect: [{
      Type: 'SpellPower', Bonus: 'Feat', AType: 'Simple', Amount: 10, Item: ['Repair'],
      Requirements: { Requirement: [{ Type: 'Stance', Item: ['Bladeforged'] }] },
    }],
  } as unknown as Feat
}

function input(allFeats: Feat[], allRaces: Race[] = []): BuildStatsInput {
  return {
    allClasses: [], allRaces, allFeats, allTrees: [],
    allSelfBuffs: [], allAugments: [], allSetBonuses: [],
    allFiligreeBonuses: [], allFiligrees: [], gearItems: {},
  }
}

function buildWith(patch: Partial<CharacterBuild> = {}): CharacterBuild {
  return { ...emptyBuild(), race: '', alignment: '', ...patch }
}

// ---------------------------------------------------------------------------
// The trailing space
// ---------------------------------------------------------------------------

describe('restoreIconicStanceNames', () => {
  it('renames the stance and the requirements that gate on it, together', () => {
    const [feat] = restoreIconicStanceNames([scourgeFeat()]) as Array<Record<string, never>>
    const f = feat as unknown as {
      Stance: Array<{ Name: string }>
      Effect: Array<{ Requirements?: { Requirement: Array<{ Item: string[] }> } }>
    }
    expect(f.Stance[0].Name).toBe('Aasimar Scourge ')
    expect(f.Effect[0].Requirements!.Requirement[0].Item).toEqual(['Aasimar Scourge '])
    // The ungated effect is untouched.
    expect(f.Effect[1].Requirements).toBeUndefined()
  })

  it('is idempotent and ignores feats that are not iconic past lives', () => {
    const once = restoreIconicStanceNames([scourgeFeat()])
    const twice = restoreIconicStanceNames(once)
    expect((twice[0] as unknown as { Stance: Array<{ Name: string }> }).Stance[0].Name)
      .toBe('Aasimar Scourge ')

    const plain = {
      Name: 'Past Life: Fighter', Acquire: 'HeroicPastLife',
      Stance: [{ Name: 'Fighter', Group: ['Iconic'] }],
    } as unknown as Feat
    restoreIconicStanceNames([plain])
    expect((plain as unknown as { Stance: Array<{ Name: string }> }).Stance[0].Name).toBe('Fighter')
  })
})

// ---------------------------------------------------------------------------
// The toggle
// ---------------------------------------------------------------------------

describe('collectDynamicStances — iconic past lives', () => {
  const feats = restoreIconicStanceNames([scourgeFeat(), bladeforgedFeat()])
  const collect = (build: CharacterBuild) => collectDynamicStances(build, {
    allTrees: [], allFeats: feats, allSpells: [], gearItems: {},
  })

  it('offers a toggle for each iconic past life the build has taken', () => {
    const stances = collect(buildWith({ pastLives: { 'Aasimar Scourge': 3 } }))
    expect(stances).toHaveLength(1)
    expect(stances[0].name).toBe('Aasimar Scourge ')
    expect(stances[0].group).toBe('Iconic')
    expect(stances[0].source).toBe('Iconic past life: Aasimar Scourge ×3')
    expect(stances[0].autoControlled).toBe(false)
  })

  it('offers nothing for a past life the build has not taken', () => {
    expect(collect(buildWith({ pastLives: {} }))).toHaveLength(0)
    expect(collect(buildWith({ pastLives: { 'Aasimar Scourge': 0 } }))).toHaveLength(0)
  })

  it('accepts both pastLives key conventions (panel writes the race, the V2 importer the feat)', () => {
    const viaFeatName = collect(buildWith({ pastLives: { 'Past Life: Bladeforged': 2 } }))
    expect(viaFeatName.map(s => s.name)).toEqual(['Bladeforged '])
    expect(viaFeatName[0].source).toBe('Iconic past life: Bladeforged ×2')
  })

  it('the Iconic group is single-selection — only one can be lit', () => {
    expect(isSingleSelectionGroup('Iconic')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// What the toggle does
// ---------------------------------------------------------------------------

describe('iconic past-life bonuses', () => {
  const feats = restoreIconicStanceNames([scourgeFeat(), bladeforgedFeat()])
  const doublestrike = (build: CharacterBuild, allRaces: Race[] = []) =>
    computeBuildStats(input(feats, allRaces), build).total('melee.doublestrike')

  it('applies only while the stance is toggled on', () => {
    const pastLives = { 'Aasimar Scourge': 3 }
    expect(doublestrike(buildWith({ pastLives }))).toBe(0)
    expect(doublestrike(buildWith({ pastLives, activeBuffs: ['Aasimar Scourge '] }))).toBe(6)
  })

  it('scales with the number of past lives', () => {
    const on = (n: number) => doublestrike(buildWith({
      pastLives: { 'Aasimar Scourge': n }, activeBuffs: ['Aasimar Scourge '],
    }))
    expect([on(1), on(2), on(3)]).toEqual([2, 4, 6])
  })

  it('being the iconic race does not grant that race\'s past-life bonus', () => {
    // The race auto-stance is "Aasimar Scourge"; the past-life stance is
    // "Aasimar Scourge " — V2 keeps them apart, and so must V3.
    const races = [{ Name: 'Aasimar Scourge' } as unknown as Race]
    const build = buildWith({ race: 'Aasimar Scourge', pastLives: { 'Aasimar Scourge': 3 } })
    const stats = computeBuildStats(input(feats, races), build)
    expect(stats.activeStances).toContain('Aasimar Scourge')     // race stance
    expect(stats.activeStances).not.toContain('Aasimar Scourge ') // past-life stance
    expect(stats.total('melee.doublestrike')).toBe(0)
  })

  it('a stance name persisted before the trailing space existed still applies', () => {
    // V2 saves and older V3 saves carry the trimmed name; the engine maps it
    // onto the iconic stance so an imported build keeps its bonus.
    const build = buildWith({
      pastLives: { 'Aasimar Scourge': 3 }, activeBuffs: ['Aasimar Scourge'],
    })
    expect(computeBuildStats(input(feats), build).total('melee.doublestrike')).toBe(6)
  })

  it('the ungated half of the past life applies with no toggle at all', () => {
    const stats = computeBuildStats(input(feats), buildWith({ pastLives: { 'Aasimar Scourge': 3 } }))
    const fromPastLife = stats.resolve('save.Fort').bonuses
      .filter(b => b.source.includes('Past life: Aasimar Scourge'))
    expect(fromPastLife.map(b => b.value)).toEqual([3])   // +1 per stack, no stance needed
  })
})

// ---------------------------------------------------------------------------
// One at a time
// ---------------------------------------------------------------------------

describe('only one iconic stance at a time', () => {
  it('lighting a second one puts the first out', () => {
    // The panel passes the group's other members as `incompatible` for any
    // single-selection group; this is the reducer half of that contract.
    const first = reducer(buildWith(), {
      type: 'TOGGLE_STANCE', stanceName: 'Aasimar Scourge ', incompatible: ['Bladeforged '],
    })
    expect(first.activeBuffs).toEqual(['Aasimar Scourge '])

    const second = reducer(first, {
      type: 'TOGGLE_STANCE', stanceName: 'Bladeforged ', incompatible: ['Aasimar Scourge '],
    })
    expect(second.activeBuffs).toEqual(['Bladeforged '])
  })
})
