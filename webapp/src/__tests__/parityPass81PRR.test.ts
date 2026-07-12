/**
 * Parity with upstream V2 2.0.0.81 — armor-PRR precedence fix.
 *
 * Pre-.81 V2 (and V3 until this pass) applied body-feat PRR and armor-
 * proficiency PRR through INDEPENDENT ifs, so a Warforged with Mithral Body
 * wearing light armor with Light Armor Proficiency received BAB×1 twice
 * (same for Adamantine Body + Heavy Armor at BAB×2 each).
 *
 * Upstream 2.0.0.81 (BreakdownItemPRR.cpp::CreateOtherEffects) made the body
 * feat take precedence via else-if:
 *   Mithral Body: BAB×1, ELSE Light Armor + proficiency: BAB×1
 *   Adamantine Body: BAB×2, ELSE Heavy Armor + proficiency: BAB×2
 *
 * Synthetic catalogues isolate the mechanism.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1',
  // 21-entry per-class-level BAB table (full martial progression)
  BAB: Array.from({ length: 21 }, (_, i) => i).join(' '),
} as unknown as DDOClass

const FEATS: Feat[] = [
  { Name: 'Mithral Body' }, { Name: 'Adamantine Body' },
  { Name: 'Light Armor Proficiency' }, { Name: 'Heavy Armor Proficiency' },
] as unknown as Feat[]

const lightArmor = { Name: 'Test Leather', Armor: 'Light', EquipmentSlot: { Armor: true } } as unknown as Item
const heavyArmor = { Name: 'Test Plate', Armor: 'Heavy', EquipmentSlot: { Armor: true } } as unknown as Item

function input(gearItems: Record<string, Item>): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [fighterClass],
    allFeats: FEATS,
    allTrees: [] as EnhancementTree[],
    gearItems,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

function fighter20(feats: string[]) {
  const build = emptyBuild()
  build.classes = [{ name: 'Fighter', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }]
  build.levelClasses = Array.from({ length: 20 }, () => 'Fighter')
  build.totalLevel = 20
  build.featChoices = Object.fromEntries(feats.map((f, i) => [`slot${i}`, f]))
  return build
}

function armorPrrSources(gear: Record<string, Item>, feats: string[]): Map<string, number> {
  const stats = computeBuildStats(input(gear), fighter20(feats))
  const out = new Map<string, number>()
  for (const b of stats.resolve('prr').bonuses) {
    if (b.source.includes('PRR (BAB')) out.set(b.source, b.value)
  }
  return out
}

describe('armor PRR precedence (upstream 2.0.0.81 parity)', () => {
  it('Mithral Body suppresses the Light Armor proficiency PRR (no double count)', () => {
    const src = armorPrrSources({ Armor: lightArmor }, ['Mithral Body', 'Light Armor Proficiency'])
    expect(src.get('Mithral Body PRR (BAB×1)')).toBe(20)
    expect(src.has('Light Armor PRR (BAB×1)')).toBe(false)
    expect([...src.values()].reduce((a, b) => a + b, 0)).toBe(20)
  })

  it('Light Armor proficiency PRR still applies without Mithral Body', () => {
    const src = armorPrrSources({ Armor: lightArmor }, ['Light Armor Proficiency'])
    expect(src.get('Light Armor PRR (BAB×1)')).toBe(20)
    expect(src.has('Mithral Body PRR (BAB×1)')).toBe(false)
  })

  it('Adamantine Body suppresses the Heavy Armor proficiency PRR (no double count)', () => {
    const src = armorPrrSources({ Armor: heavyArmor }, ['Adamantine Body', 'Heavy Armor Proficiency'])
    expect(src.get('Adamantine Body PRR (BAB×2)')).toBe(40)
    expect(src.has('Heavy Armor PRR (BAB×2)')).toBe(false)
    expect([...src.values()].reduce((a, b) => a + b, 0)).toBe(40)
  })

  it('Heavy Armor proficiency PRR still applies without Adamantine Body', () => {
    const src = armorPrrSources({ Armor: heavyArmor }, ['Heavy Armor Proficiency'])
    expect(src.get('Heavy Armor PRR (BAB×2)')).toBe(40)
  })
})
