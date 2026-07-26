/**
 * Regression: weapon/shield slot detection must use the app's canonical gear
 * slot names.
 *
 * GearPanel and v2Import both key equipped weapons under 'Main Hand' /
 * 'Off Hand' (v2Import.ts:189, GearPanel.tsx RIGHT_SLOTS), but the stat
 * layer's slot checks — extractWeaponInfo, extractOffhandWeaponInfo, the
 * shield-stance derivation, and buildStatMap's main/off weapon-type
 * detection — only looked for the legacy 'Weapon1'/'MainHand'/'Weapon2'/
 * 'OffHand' spellings. Result: for every real build (imported or equipped
 * through the UI) the Combat tab said "Equip a weapon to see combat stats"
 * and all weapon-type / fighting-style / Shield-gated effects silently never
 * fired. The legacy spellings stay accepted for older fixtures.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, extractWeaponInfo, extractOffhandWeaponInfo } from '../hooks/useBuildStats'
import type { BuildStatsInput } from '../lib/buildStats'
import { emptyBuild } from '../types/ddo'
import type { Item, Feat } from '../types/ddo'

const handwraps = {
  Name: 'Kinesis, the Hidden Force',
  Weapon: 'Handwraps',
  BaseDice: { Number: 1, Sides: 6 },
  AttackModifier: 'Strength',
  DamageModifier: 'Strength',
} as unknown as Item

const shortsword = {
  Name: 'Test Shortsword',
  Weapon: 'Short Sword',
  BaseDice: { Number: 1, Sides: 6 },
  AttackModifier: 'Strength',
  DamageModifier: 'Strength',
} as unknown as Item

const towerShield = {
  Name: 'Test Tower Shield',
  Armor: 'Tower Shield',
} as unknown as Item

// +7 PRR gated on the gear-derived "Shield" stance (V2 StancesPane parity).
const shieldGatedFeat = {
  Name: 'Shield Gated',
  Acquire: 'Train',
  Effect: {
    Type: 'PRR', Bonus: 'QuestShield', AType: 'Simple', Amount: '7',
    Requirements: { Requirement: { Type: 'Stance', Item: 'Shield' } },
  },
} as unknown as Feat

// +5 Melee Power gated on the gear-derived "Handwraps" weapon-type stance.
const handwrapsGatedFeat = {
  Name: 'Handwraps Gated',
  Acquire: 'Train',
  Effect: {
    Type: 'MeleePower', Bonus: 'QuestWraps', AType: 'Simple', Amount: '5',
    Requirements: { Requirement: { Type: 'Stance', Item: 'Handwraps' } },
  },
} as unknown as Feat

function input(gearItems: Record<string, Item>, feats: Feat[] = []): BuildStatsInput {
  return {
    allRaces: [], allClasses: [], allFeats: feats, allTrees: [],
    gearItems, allSelfBuffs: [], allAugments: [], allSetBonuses: [],
    allFiligreeBonuses: [], allFiligrees: [],
  }
}

function buildWithFeats(featNames: string[]) {
  const choices: Record<string, string> = {}
  featNames.forEach((f, i) => { choices[String(i + 1)] = f })
  return { ...emptyBuild(), featChoices: choices }
}

describe('canonical "Main Hand" / "Off Hand" slot names', () => {
  it('extractWeaponInfo finds the main-hand weapon under "Main Hand"', () => {
    const wi = extractWeaponInfo({ 'Main Hand': handwraps })
    expect(wi?.name).toBe('Kinesis, the Hidden Force')
  })

  it('extractOffhandWeaponInfo finds the off-hand weapon under "Off Hand"', () => {
    const wi = extractOffhandWeaponInfo({ 'Off Hand': shortsword })
    expect(wi?.name).toBe('Test Shortsword')
  })

  it('legacy Weapon1/Weapon2 spellings still work', () => {
    expect(extractWeaponInfo({ Weapon1: handwraps })?.name).toBe('Kinesis, the Hidden Force')
    expect(extractOffhandWeaponInfo({ Weapon2: shortsword })?.name).toBe('Test Shortsword')
  })

  it('a "Main Hand" weapon activates its weapon-type stance for gated effects', () => {
    const stats = computeBuildStats(
      input({ 'Main Hand': handwraps }, [handwrapsGatedFeat]),
      buildWithFeats(['Handwraps Gated']),
    )
    expect(stats.total('melee.power')).toBe(5)
  })

  it('an "Off Hand" tower shield activates the Shield stance for gated effects', () => {
    const withShield = computeBuildStats(
      input({ 'Off Hand': towerShield }, [shieldGatedFeat]),
      buildWithFeats(['Shield Gated']),
    )
    const withoutShield = computeBuildStats(
      input({}, [shieldGatedFeat]),
      buildWithFeats(['Shield Gated']),
    )
    expect(withoutShield.total('prr')).toBe(0)
    // 7 (shield-gated effect) + 15 (Attack feat "Equipped Tower Shield
    // PRR/MRR Bonus" base, pass 127) = 22.
    expect(withShield.total('prr')).toBe(22)
  })
})
