/**
 * Parity pass N6: WeaponProficiencyClass does NOT grant weapon proficiency.
 *
 * V2 source: BreakdownItemWeaponEffects.cpp:329 only uses
 *   Effect_WeaponProficiencyClass to decide whether an effect applies to a
 *   weapon (AffectsThisWeapon); it never adds anything to the "Proficiency"
 *   weapon group. Build.cpp changes groups only for AddGroupWeapon and
 *   MergeGroups, and BreakdownItemWeaponAttackBonus.cpp:71 applies the -4
 *   "Non proficient penalty" from IsWeaponInGroup("Proficiency", weapon).
 *
 * Real data examples:
 *   - HalfElf.race.xml "Half-Elf Dilettante: Ranger":
 *       <Type>WeaponProficiencyClass</Type> <Item>Ranged</Item>
 *   - Spells.xml "Master's Touch":
 *       <Type>WeaponProficiencyClass</Type> <Item>Simple</Item>
 *       <Type>WeaponProficiencyClass</Type> <Item>Martial</Item>
 *
 * V3 once merged these classes into "Proficiency", so a Half-Elf with the
 * Ranger dilettante skipped V2's -4 on an exotic Repeating Heavy Crossbow
 * (fuzz seed 14965: V2 22 to hit, V3 26).
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

// Mirrors HalfElf.race.xml "Half-Elf Dilettante: Ranger"
const halfElfDilettanteRanger: Feat = {
  Name: 'Half-Elf Dilettante: Ranger',
  Effect: { Type: 'WeaponProficiencyClass', Bonus: 'Feat', AType: 'NotNeeded', Item: 'Ranged' },
} as unknown as Feat

// Mirrors Spells.xml "Master's Touch" (grants Simple + Martial)
const mastersTouchSimple: Feat = {
  Name: "Master's Touch: Simple",
  Effect: { Type: 'WeaponProficiencyClass', Bonus: 'Spell', AType: 'NotNeeded', Item: 'Simple' },
} as unknown as Feat

const mastersTouchMartial: Feat = {
  Name: "Master's Touch: Martial",
  Effect: { Type: 'WeaponProficiencyClass', Bonus: 'Spell', AType: 'NotNeeded', Item: 'Martial' },
} as unknown as Feat

// Static weapon group definitions (Ranged / Simple / Martial)
const staticGroups: WeaponGroupSpec[] = [
  { Name: 'Ranged', Weapon: ['Longbow', 'Shortbow', 'Heavy Crossbow', 'Light Crossbow'] },
  { Name: 'Simple', Weapon: ['Club', 'Dagger', 'Quarterstaff'] },
  { Name: 'Martial', Weapon: ['Longsword', 'Falchion', 'Shortsword'] },
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

function buildWithFeat(featChoices: Record<string, string>, feats: Feat[]) {
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
// buildRuntimeGroupAdds: WeaponProficiencyClass emits no group merge (V2)
// ---------------------------------------------------------------------------

describe('buildRuntimeGroupAdds: WeaponProficiencyClass', () => {
  it('emits no Proficiency merge for Half-Elf Dilettante: Ranger', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Half-Elf Dilettante: Ranger' },
      [halfElfDilettanteRanger],
    )
    const { merges } = buildRuntimeGroupAdds(input([halfElfDilettanteRanger]), build)
    expect(merges.some(m => m.baseGroup === 'Proficiency')).toBe(false)
  })

  it("emits no Proficiency merge for Master's Touch", () => {
    const build = buildWithFeat({ 'Hero 1': "Master's Touch: Simple" }, [mastersTouchSimple])
    const { merges } = buildRuntimeGroupAdds(input([mastersTouchSimple]), build)
    expect(merges.some(m => m.baseGroup === 'Proficiency')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BuildStats.isWeaponProficient ignores WeaponProficiencyClass (V2)
// ---------------------------------------------------------------------------

describe('BuildStats.isWeaponProficient ignores WeaponProficiencyClass', () => {
  it('Half-Elf Dilettante: Ranger does not make a Longbow proficient', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Half-Elf Dilettante: Ranger' },
      [halfElfDilettanteRanger],
    )
    const stats = computeBuildStats(input([halfElfDilettanteRanger]), build)
    expect(stats.isWeaponProficient('Longbow')).toBe(false)
  })

  it("Master's Touch does not make Simple or Martial weapons proficient", () => {
    const build = buildWithFeat(
      { 'Hero 1': "Master's Touch: Simple", 'Hero 2': "Master's Touch: Martial" },
      [mastersTouchSimple, mastersTouchMartial],
    )
    const stats = computeBuildStats(input([mastersTouchSimple, mastersTouchMartial]), build)
    expect(stats.isWeaponProficient('Club')).toBe(false)
    expect(stats.isWeaponProficient('Longsword')).toBe(false)
  })
})
