/**
 * Parity pass 45 — gear-derived weapon / fighting-style stances.
 *
 * V2's StancesPane auto-activates weapon-type and fighting-style stances from
 * the equipped weapons (they default ON when wielded). Effects gated on
 * "Two Handed Fighting" / "Two Weapon Fighting" / "Single Weapon Fighting", the
 * weapon type itself, or "Shield" never fired in V3, where stances were purely
 * player-toggled (43 THF / 29 TWF / 19 SWF + weapon-type-gated effects live).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1 1',
} as unknown as DDOClass

const weaponGroups: WeaponGroupSpec[] = [
  { Name: 'Two Handed', Weapon: ['Greatsword'] },
  { Name: 'One Handed', Weapon: ['Longsword'] },
  // V2's SWF auto stance requires GroupMember "Single Weapon" (Stances.xml)
  // — a distinct group from "One Handed" in WeaponGroupings.xml.
  { Name: 'Single Weapon', Weapon: ['Longsword'] },
]

// PRR gated on a given stance — a clean sensor for "is this stance active?".
function stanceFeat(name: string, stance: string): Feat {
  return {
    Name: name, Acquire: 'Train',
    Effect: {
      Type: 'PRR', Bonus: 'Stance', AType: 'Simple', Amount: '7',
      Requirements: { Requirement: { Type: 'Stance', Item: stance } },
    },
  } as unknown as Feat
}

function input(feats: Feat[], gearItems: Record<string, Item>): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [fighterClass],
    allFeats: feats,
    allTrees: [] as EnhancementTree[],
    gearItems,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
    allWeaponGroups: weaponGroups,
  }
}

function build(featName: string) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 2 }],
    levelClasses: ['Fighter', 'Fighter'],
    totalLevel: 2,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    featChoices: { '1': featName },
  }
}

const greatsword = { Name: 'GS', Weapon: 'Greatsword', BaseDice: { Number: 2, Sides: 6 } } as unknown as Item
const longsword = { Name: 'LS', Weapon: 'Longsword', BaseDice: { Number: 1, Sides: 8 } } as unknown as Item

describe('gear-derived fighting-style stances', () => {
  it('two-handed weapon activates "Two Handed Fighting"', () => {
    const stats = computeBuildStats(
      input([stanceFeat('THF Sensor', 'Two Handed Fighting')], { Weapon1: greatsword }),
      build('THF Sensor'),
    )
    expect(stats.total('prr')).toBe(7)
  })

  it('two one-handed weapons activate "Two Weapon Fighting" (not THF/SWF)', () => {
    const inp = input([
      stanceFeat('TWF Sensor', 'Two Weapon Fighting'),
    ], { Weapon1: longsword, Weapon2: longsword })
    const stats = computeBuildStats(inp, build('TWF Sensor'))
    expect(stats.total('prr')).toBe(7)
  })

  it('single one-handed weapon (no offhand/shield) activates "Single Weapon Fighting"', () => {
    const stats = computeBuildStats(
      input([stanceFeat('SWF Sensor', 'Single Weapon Fighting')], { Weapon1: longsword }),
      build('SWF Sensor'),
    )
    expect(stats.total('prr')).toBe(7)
  })

  it('the equipped weapon type itself is a stance', () => {
    const stats = computeBuildStats(
      input([stanceFeat('Type Sensor', 'Greatsword')], { Weapon1: greatsword }),
      build('Type Sensor'),
    )
    expect(stats.total('prr')).toBe(7)
  })

  it('a stance that does not match the gear stays inactive', () => {
    const stats = computeBuildStats(
      input([stanceFeat('THF Sensor', 'Two Handed Fighting')], { Weapon1: longsword }),
      build('THF Sensor'),
    )
    expect(stats.total('prr')).toBe(0)
  })
})
