// The Analysis rail's Melee / Ranged / Off Hand sections, built from real
// stats. Ranged used to print a hardcoded "20 / ×2" whatever was wielded, and
// there was no off-hand section at all.

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../lib/buildStats'
import { buildBreakdownSections } from '../components/breakdowns/breakdownSections'
import { optimizerStatsFromSections } from '../lib/optimizer/objective'
import { emptyBuild } from '../types/ddo'
import type { Item } from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

const GROUPS: WeaponGroupSpec[] = [
  { Name: 'Ranged', Weapon: ['Longbow', 'Light Crossbow'] },
  { Name: 'Melee', Weapon: ['Rapier', 'Dagger', 'Great Axe'] },
]

const item = (name: string, weaponType: string, slot: string, dice: [number, number],
  threat: number, mult: number): Item => ({
  Name: name, MinLevel: 20, Weapon: weaponType,
  EquipmentSlot: { [slot]: true },
  BaseDice: { Number: dice[0], Sides: dice[1] },
  CriticalThreatRange: threat, CriticalMultiplier: mult,
} as unknown as Item)

const BOW = item('Test Longbow', 'Longbow', 'Weapon1', [1, 8], 3, 3)
const RAPIER = item('Test Rapier', 'Rapier', 'Weapon1', [1, 6], 3, 2)
const DAGGER = item('Test Dagger', 'Dagger', 'Weapon2', [1, 4], 3, 2)

function sectionsFor(gearItems: Record<string, Item>) {
  const input = {
    allClasses: [], allRaces: [], allFeats: [], allTrees: [], allSelfBuffs: [],
    allAugments: [], allSetBonuses: [], allFiligreeBonuses: [], allFiligrees: [],
    allWeaponGroups: GROUPS, gearItems,
  } as unknown as BuildStatsInput
  const build = {
    ...emptyBuild(),
    gear: Object.fromEntries(Object.entries(gearItems).map(([slot, i]) => [slot, i.Name])),
  }
  const stats = computeBuildStats(input, build)
  return { stats, sections: buildBreakdownSections(stats, build, [], GROUPS) }
}

const rowsOf = (sections: ReturnType<typeof sectionsFor>['sections'], title: string) =>
  sections.find(s => s.title === title)?.rows ?? []
const row = (sections: ReturnType<typeof sectionsFor>['sections'], title: string, label: string) =>
  rowsOf(sections, title).find(r => r.label === label)

describe('Ranged section', () => {
  it('shows the wielded bow’s real crit profile, not a hardcoded 20/×2', () => {
    const { sections } = sectionsFor({ 'Main Hand': BOW })
    expect(row(sections, 'Ranged', 'Threat Range')?.display).toBe('18–20')
    expect(row(sections, 'Ranged', 'Crit Multiplier')?.display).toBe('×3')
    expect(row(sections, 'Ranged', 'Crit Chance')?.display).toBe('15%')
    expect(row(sections, 'Ranged', 'Threat Range')?.dim).toBe(false)
  })

  it('dims the rows when a melee weapon is wielded', () => {
    const { sections } = sectionsFor({ 'Main Hand': RAPIER })
    expect(row(sections, 'Ranged', 'Threat Range')?.dim).toBe(true)
    expect(row(sections, 'Ranged', 'Damage per Shot')?.dim).toBe(true)
  })
})

describe('Off Hand section', () => {
  it('reports the off-hand weapon’s own dice and crit profile', () => {
    const { sections } = sectionsFor({ 'Main Hand': RAPIER, 'Off Hand': DAGGER })
    expect(row(sections, 'Off Hand', 'Weapon')?.display).toBe('Test Dagger')
    expect(row(sections, 'Off Hand', 'W Dice')?.display).toBe('1d4')
    expect(row(sections, 'Off Hand', 'Threat Range')?.display).toBe('18–20')
    expect(row(sections, 'Off Hand', 'Crit Multiplier')?.display).toBe('×2')
    expect(Number(row(sections, 'Off Hand', 'Damage per Swing')?.total)).toBeGreaterThan(0)
  })

  it('dims the weapon rows when the off hand is empty', () => {
    const { sections } = sectionsFor({ 'Main Hand': RAPIER })
    const offhand = rowsOf(sections, 'Off Hand')
    expect(offhand.length).toBeGreaterThan(0)
    // The weapon-derived rows have nothing to describe; the character-wide
    // off-hand rows (Attack Chance, Doublestrike) keep their own totals.
    for (const label of ['Weapon', 'W Dice', 'Threat Range', 'Crit Chance',
      'Crit Multiplier', 'Damage per Swing']) {
      expect(row(sections, 'Off Hand', label)?.dim, `${label} should be dimmed`).toBe(true)
    }
    expect(row(sections, 'Off Hand', 'Weapon')?.display).toBe('—')
    expect(row(sections, 'Off Hand', 'W Dice')?.display).toBe('—')
  })

  it('reports an off-hand damage number only when something is held there', () => {
    const armed = sectionsFor({ 'Main Hand': RAPIER, 'Off Hand': DAGGER })
    const empty = sectionsFor({ 'Main Hand': RAPIER })
    expect(armed.stats.total('damage.offhand.perSwing')).toBeGreaterThan(0)
    expect(empty.stats.total('damage.offhand.perSwing')).toBe(0)
  })
})

describe('optimizer objectives', () => {
  it('offers every new hand-specific stat as something to maximise', () => {
    const { sections } = sectionsFor({ 'Main Hand': BOW, 'Off Hand': DAGGER })
    const keys = optimizerStatsFromSections(sections).map(s => s.key)
    for (const key of [
      'damage.perSwing', 'damage.perShot', 'damage.offhand.perSwing',
      'crit.multiplier', 'crit.multiplier19to20', 'crit.threatFaces', 'crit.chance',
      'crit.offhand.multiplier', 'crit.offhand.threatFaces', 'crit.offhand.chance',
    ]) {
      expect(keys, `${key} should be an optimizer objective`).toContain(key)
    }
  })
})
