// V2 creates the stance buttons (CStancesPane::UpdateActiveBuildChanged)
// before Build::BuildNowActive applies any effects, so the "Centered" auto
// stance is first evaluated without the weapon-group adds feats make (Zen
// Archery puts longbows in the Centered group). A persisted user stance that
// requires Centered, like Wind Stance, is disabled at that point
// (CStanceButton::Evaluate -> DisableStance) and stays off even after
// Centered turns on once the effects are applied. V3 checked it against the
// final Centered state and kept Wind Stance (+2 DEX, -2 CON).

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

describe('Wind Stance with a Zen Archery longbow (oracle-pinned)', () => {
  const ROOT = join(__dirname, '..', '..', '..')
  const SAVE = join(ROOT, 'Output', 'UserBuilds', 'collection', 'Raged DPS.DDOBuild')
  const DATA = join(ROOT, 'Output', 'DataFiles')
  // Life 6 build 1: Monk splash with Zen Archery, a longbow and Wind Stance
  // saved as active. v2calc: DEX 99, CON 41, doublestrike 27.
  it.skipIf(!existsSync(SAVE) || !existsSync(DATA))('Raged DPS life 6 drops Wind Stance like V2', () => {
    const xml = readFileSync(SAVE, 'utf8')
      .replace(/<ActiveLifeIndex>\d+/, '<ActiveLifeIndex>5')
      .replace(/<ActiveBuildIndex>\d+/, '<ActiveBuildIndex>0')
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.total('ability.Dexterity')).toBe(99)
    expect(stats.total('ability.Constitution')).toBe(41)
    expect(stats.total('melee.doublestrike')).toBe(27)
  }, 120_000)
})
