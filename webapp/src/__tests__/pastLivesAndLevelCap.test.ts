// Regression tests for three user-reported gaps:
//  1. Iconic past lives stack ×3 (race-file feats carry MaxTimesAcquire 3);
//     the panel used to cap them at 1.
//  2. Legendary levels were hard-clamped at 4 in the reducer (level 34);
//     the game cap is 36 and the data files define legendary levels to 40.
//  3. The U51 "destiny tree claimed" feats (Acquire=EpicDestinyTree) grant
//     +3 Fate Points each — every 3 Fate Points = +1 destiny point, so each
//     claimed destiny grows the destiny-point pool. The panel never offered
//     them.

import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { reducer } from '../context/CharacterContext'
import { emptyBuild } from '../types/ddo'
import { LEGENDARY_MAX_LEVELS } from '../lib/gamedata'
import { computeBuildStats } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import type { CharacterBuild } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA)

describe('legendary level cap', () => {
  it('the reducer accepts legendary levels past 4 (level 36 builds)', () => {
    const b = reducer(emptyBuild(), { type: 'SET_LEGENDARY_LEVELS', levels: 6 })
    expect(b.legendaryLevels).toBe(6)
  })

  it('still clamps to the data-defined maximum', () => {
    const b = reducer(emptyBuild(), { type: 'SET_LEGENDARY_LEVELS', levels: 99 })
    expect(b.legendaryLevels).toBe(LEGENDARY_MAX_LEVELS)
    expect(LEGENDARY_MAX_LEVELS).toBeGreaterThanOrEqual(6)
  })
})

describe.skipIf(!haveData)('past-life feats against the real catalogues', () => {
  const cat = loadAllCatalogues(DATA)
  initBonusTypes(cat.allBonusTypes)

  function stats(pastLives: Record<string, number>) {
    const build: CharacterBuild = { ...emptyBuild(), pastLives }
    return computeBuildStats({
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs, allStances: cat.allStances, gearItems: {},
    }, build)
  }

  it('iconic past lives apply per stack (Bladeforged ×3 → +15% fortification)', () => {
    const one = stats({ Bladeforged: 1 }).total('fortification')
    const three = stats({ Bladeforged: 3 }).total('fortification')
    expect(three - one).toBe(10) // +5 per stack beyond the first
  })

  it('each claimed destiny tree grants +3 fate points', () => {
    const none = stats({}).total('fatePoint')
    const two = stats({ 'Divine Crusader': 1, 'Shadowdancer': 1 }).total('fatePoint')
    expect(two - none).toBe(6)
  })

  it('all 13 destiny claim feats exist with Acquire=EpicDestinyTree', () => {
    const claims = cat.allFeats.filter(
      f => (f as { Acquire?: string }).Acquire === 'EpicDestinyTree')
    expect(claims.length).toBe(13)
  })
})
