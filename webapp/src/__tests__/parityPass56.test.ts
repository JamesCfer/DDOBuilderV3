/**
 * Parity pass 56 — Weapon proficiency detection (N2 remaining).
 *
 * V2 source: BreakdownItemWeaponAttackBonus.cpp:70-79
 *   if (!m_pCharacter->ActiveBuild()->IsWeaponInGroup("Proficiency", m_weapon))
 *       AddOtherEffect(nonProficient);  // −4 to-hit
 *
 * V2 builds the "Proficiency" weapon group dynamically from AddGroupWeapon
 * effects on trained feats (e.g. "Simple Weapon Proficiency: Club" adds Club to
 * the group) and enhancements (e.g. "Assassin: Poison Master" adds Kukri).
 * V3 silently dropped AddGroupWeapon effects in effectParser, so no dynamic
 * "Proficiency" group was ever built, and CombatPanel always assumed proficiency.
 *
 * Fix: buildRuntimeGroupAdds() collects AddGroupWeapon / MergeGroups effects
 * from all trained feats and enhancements; BuildStats.isWeaponProficient()
 * checks the resulting group; buildStats puts the −4 in the melee.toHit attack line.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, buildRuntimeGroupAdds, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const fighterClass: DDOClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1',
} as unknown as DDOClass

const simpleProfClub: Feat = {
  Name: 'Simple Weapon Proficiency: Club',
  Effect: { Type: 'AddGroupWeapon', Bonus: 'Feat', AType: 'NotNeeded', Item: ['Proficiency', 'Club'] },
} as unknown as Feat

const simpleProfDagger: Feat = {
  Name: 'Simple Weapon Proficiency: Dagger',
  Effect: { Type: 'AddGroupWeapon', Bonus: 'Feat', AType: 'NotNeeded', Item: ['Proficiency', 'Dagger'] },
} as unknown as Feat

const martialProfLongsword: Feat = {
  Name: 'Martial Weapon Proficiency: Longsword',
  Effect: { Type: 'AddGroupWeapon', Bonus: 'Feat', AType: 'NotNeeded', Item: ['Proficiency', 'Longsword'] },
} as unknown as Feat

// Enhancement that adds Kukri to Proficiency (mirrors Rogue Assassin data)
const kukuriEnhancement: EnhancementTree = {
  Name: 'Rogue_Assassin',
  EnhancementTreeItem: [{
    Name: 'Assassin: Poison Master',
    Effect: { Type: 'AddGroupWeapon', Bonus: 'Enhancement', AType: 'NotNeeded', Item: ['Proficiency', 'Kukri'] },
  }],
} as unknown as EnhancementTree

// Static weapon groups (not "Proficiency" — that's built from feat effects)
const staticGroups: WeaponGroupSpec[] = [
  { Name: 'Simple', Weapon: ['Club', 'Dagger'] },
  { Name: 'Martial', Weapon: ['Longsword', 'Falchion'] },
  { Name: 'Exotic', Weapon: ['Khopesh', 'Kukri'] },
]

function input(feats: Feat[], trees: EnhancementTree[] = []): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [fighterClass],
    allFeats: feats,
    allTrees: trees,
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
    allWeaponGroups: staticGroups,
  }
}

function buildWithFeat(featChoices: Record<string, string>, feats: Feat[], trees: EnhancementTree[] = []) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 4 }],
    totalLevel: 4,
    featChoices,
    enhancementChoices: {},
    enhancementSelections: {},
  }
}

// ---------------------------------------------------------------------------
// buildRuntimeGroupAdds — unit tests for the group-add collector
// ---------------------------------------------------------------------------

describe('buildRuntimeGroupAdds — feat-based proficiency groups', () => {
  it('returns Proficiency: Club when Simple Weapon Proficiency: Club is trained', () => {
    const build = buildWithFeat({ 'Hero 1': 'Simple Weapon Proficiency: Club' }, [simpleProfClub])
    const inp = input([simpleProfClub])
    const { adds } = buildRuntimeGroupAdds(inp, build)
    expect(adds.some(a => a.group === 'Proficiency' && a.weaponType === 'Club')).toBe(true)
  })

  it('does NOT return Longsword in Proficiency when only simple-weapon feat is trained', () => {
    const build = buildWithFeat({ 'Hero 1': 'Simple Weapon Proficiency: Club' }, [simpleProfClub])
    const inp = input([simpleProfClub])
    const { adds } = buildRuntimeGroupAdds(inp, build)
    expect(adds.some(a => a.group === 'Proficiency' && a.weaponType === 'Longsword')).toBe(false)
  })

  it('collects multiple proficiency feats', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Simple Weapon Proficiency: Dagger', 'Hero 2': 'Martial Weapon Proficiency: Longsword' },
      [simpleProfDagger, martialProfLongsword],
    )
    const inp = input([simpleProfDagger, martialProfLongsword])
    const { adds } = buildRuntimeGroupAdds(inp, build)
    expect(adds.some(a => a.group === 'Proficiency' && a.weaponType === 'Dagger')).toBe(true)
    expect(adds.some(a => a.group === 'Proficiency' && a.weaponType === 'Longsword')).toBe(true)
  })
})

describe('buildRuntimeGroupAdds — enhancement-based proficiency', () => {
  it('collects Kukri proficiency from a trained enhancement', () => {
    const build = {
      ...makeEmptyBuild(),
      classes: [{ name: 'Fighter', levels: 4 }],
      totalLevel: 4,
      featChoices: {},
      enhancementChoices: { 'Rogue_Assassin': { 'Assassin: Poison Master': 1 } },
      enhancementSelections: {},
      destinyChoices: {},
      reaperChoices: {},
    }
    const inp = input([], [kukuriEnhancement])
    const { adds } = buildRuntimeGroupAdds(inp, build)
    expect(adds.some(a => a.group === 'Proficiency' && a.weaponType === 'Kukri')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BuildStats.isWeaponProficient — integration tests
// ---------------------------------------------------------------------------

describe('BuildStats.isWeaponProficient', () => {
  it('returns true for a weapon the character has proficiency in', () => {
    const build = buildWithFeat({ 'Hero 1': 'Simple Weapon Proficiency: Club' }, [simpleProfClub])
    const stats = computeBuildStats(input([simpleProfClub]), build)
    expect(stats.isWeaponProficient('Club')).toBe(true)
  })

  it('returns false for a weapon with no proficiency feat trained', () => {
    const build = buildWithFeat({ 'Hero 1': 'Simple Weapon Proficiency: Club' }, [simpleProfClub])
    const stats = computeBuildStats(input([simpleProfClub]), build)
    expect(stats.isWeaponProficient('Longsword')).toBe(false)
  })

  it('returns false when no proficiency feats are trained at all', () => {
    const build = buildWithFeat({}, [])
    const stats = computeBuildStats(input([]), build)
    expect(stats.isWeaponProficient('Club')).toBe(false)
  })

  it('returns true for multiple weapons when both feats are trained', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Simple Weapon Proficiency: Dagger', 'Hero 2': 'Martial Weapon Proficiency: Longsword' },
      [simpleProfDagger, martialProfLongsword],
    )
    const stats = computeBuildStats(input([simpleProfDagger, martialProfLongsword]), build)
    expect(stats.isWeaponProficient('Dagger')).toBe(true)
    expect(stats.isWeaponProficient('Longsword')).toBe(true)
    expect(stats.isWeaponProficient('Khopesh')).toBe(false)
  })
})
