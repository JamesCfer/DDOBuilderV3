// V2 Build::ApplyWeaponEffects (Build.cpp:5638-5650) turns a tower shield's
// own <MaximumDexterityBonus> into an Effect_MaxDexBonusTowerShield, which
// BreakdownItemAC (BreakdownItemAC.cpp:71-82) and BreakdownItemDodge use to
// cap Dex while the "Tower Shield" stance is active. V2 keys it on the item's
// Weapon type (Weapon_ShieldTower); V3 checked the item's Armor type, which
// no tower shield has, so the shield's own MDB was never counted.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const SAVE = join(ROOT, 'Output', 'UserBuilds', 'collection', 'James.DDOBuild')
const DATA = join(ROOT, 'Output', 'DataFiles')

describe('tower shield MDB comes from the shield itself', () => {
  // Life 5 of James.DDOBuild: Paladin with Levik's Defender (tower shield,
  // MDB 4) plus Sacred Shield Mastery (+3). v2calc: tower MDB 7 does not
  // bind, armor MDB 5 does, AC 63.
  it.skipIf(!existsSync(SAVE) || !existsSync(DATA))('James life 5 matches the V2 oracle', () => {
    const xml = readFileSync(SAVE, 'utf8')
      .replace(/<ActiveLifeIndex>\d+/, '<ActiveLifeIndex>4')
      .replace(/<ActiveBuildIndex>\d+/, '<ActiveBuildIndex>0')
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(xml, cat)
    expect(stats.resolve('mdbShields').bonuses.some(b => /Levik/.test(b.source ?? '') && b.value === 4)).toBe(true)
    expect(stats.total('ac')).toBe(63)
  }, 120_000)
})
