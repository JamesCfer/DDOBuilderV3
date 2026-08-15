// Candidate shortlisting for derived objectives.
//
// The optimizer decides which gear, augments and filigrees are worth
// evaluating by parsing each one's effects and asking whether any resulting
// stat key is one the objective names. Derived stats — Damage per Swing, Crit
// Multiplier — have no effects of their own: nothing in the data parses to
// `damage.perSwing`. So picking one as the objective matched NOTHING, and the
// search ran with an empty candidate pool: no filigrees (melee power, weapon
// damage, crit damage), no augments, no gear.

import { describe, it, expect } from 'vitest'
import {
  shortlistFiligrees, shortlistForSlot, shortlistAugments, objectiveKeys,
} from '../lib/optimizer/gearCandidates'
import { optimizeBuild } from '../lib/optimizer/optimizer'
import { emptyBuild } from '../types/ddo'
import type { Augment, Filigree, Item } from '../types/ddo'
import type { ObjectiveSpec } from '../lib/optimizer/objective'
import type { BuildStatsInput } from '../lib/buildStats'

const objective = (key: string, label = key): ObjectiveSpec =>
  ({ mode: 'priority', stats: [{ key, label, weight: 1 }] })

const fil = (name: string, type: string, amount: number): Filigree => ({
  Name: name, Effect: { Type: type, Bonus: 'Stacking', AType: 'Simple', Amount: String(amount) },
} as unknown as Filigree)

const FILIGREES = [
  fil('Melee Power Filigree', 'MeleePower', 3),
  fil('Weapon Damage Filigree', 'Weapon_Damage', 2),
  fil('Crit Damage Filigree', 'Weapon_DamageCritical', 4),
  fil('Crit Multiplier Filigree', 'Weapon_CriticalMultiplier', 1),
  fil('Swim Filigree', 'Swim', 5),
]

const BELT = {
  Name: 'Melee Power Belt', MinLevel: 20, EquipmentSlot: { Belt: true },
  Buff: { Type: 'MeleePower', Value1: 20, BonusType: 'Enhancement' },
} as unknown as Item

const AUGMENTS = [
  { Name: 'Topaz of Melee Power', MinLevel: 1, Type: 'Green',
    Effect: { Type: 'MeleePower', Bonus: 'Enhancement', AType: 'Simple', Amount: '8' } },
  { Name: 'Sapphire of Swim', MinLevel: 1, Type: 'Green',
    Effect: { Type: 'Swim', Bonus: 'Enhancement', AType: 'Simple', Amount: '8' } },
] as unknown as Augment[]

describe('objectiveKeys', () => {
  it('expands a damage objective into everything that moves damage', () => {
    const keys = objectiveKeys(objective('damage.perSwing', 'Damage per Swing'))
    for (const key of [
      'melee.damage', 'melee.power', 'melee.crit.damage', 'melee.crit.multiplier',
      'weapon.threatRange', 'melee.crit.range', 'weapon.bonusW', 'ability.Strength',
    ]) {
      expect(keys, `damage should be fed by ${key}`).toContain(key)
    }
  })

  it('expands a crit objective to just the crit keys', () => {
    const keys = objectiveKeys(objective('crit.multiplier', 'Crit Multiplier'))
    expect(keys).toContain('melee.crit.multiplier')
    expect(keys).not.toContain('melee.power')
  })

  it('scales a ranged damage objective by Ranged Power, not Melee Power', () => {
    const keys = objectiveKeys(objective('damage.perShot', 'Damage per Shot'))
    expect(keys).toContain('ranged.power')
    expect(keys).not.toContain('melee.power')
  })

  it('leaves a raw objective untouched', () => {
    expect([...objectiveKeys(objective('melee.power'))]).toEqual(['melee.power'])
  })
})

describe('shortlisting for a Damage per Swing objective', () => {
  const dmg = objective('damage.perSwing', 'Damage per Swing')

  it('offers the filigrees that raise damage, and skips the ones that do not', () => {
    const names = shortlistFiligrees(FILIGREES, dmg).map(f => f.Name)
    expect(names).toContain('Melee Power Filigree')
    expect(names).toContain('Weapon Damage Filigree')
    expect(names).toContain('Crit Damage Filigree')
    expect(names).toContain('Crit Multiplier Filigree')
    expect(names).not.toContain('Swim Filigree')
  })

  it('offers relevant gear and augments too', () => {
    expect(shortlistForSlot([BELT], dmg, { maxLevel: 30 }).map(i => i.Name))
      .toEqual(['Melee Power Belt'])
    expect(shortlistAugments(AUGMENTS, dmg, { maxLevel: 30 }).Green?.map(a => a.Name))
      .toEqual(['Topaz of Melee Power'])
  })

  it('keeps only crit-multiplier sources for a Crit Multiplier objective', () => {
    const names = shortlistFiligrees(FILIGREES, objective('crit.multiplier', 'Crit Multiplier'))
      .map(f => f.Name)
    expect(names).toEqual(['Crit Multiplier Filigree'])
  })
})

describe('an optimizer run against Damage per Swing', () => {
  it('equips filigrees that raise the damage number', async () => {
    const weapon = {
      Name: 'Test Rapier', MinLevel: 1, Weapon: 'Rapier', EquipmentSlot: { Weapon1: true },
      BaseDice: { Number: 1, Sides: 6 }, CriticalThreatRange: 3, CriticalMultiplier: 2,
    } as unknown as Item
    const input = {
      allClasses: [], allRaces: [], allFeats: [], allTrees: [], allSelfBuffs: [],
      allAugments: [], allSetBonuses: [], allFiligreeBonuses: [], allFiligrees: FILIGREES,
      gearItems: { 'Main Hand': weapon },
    } as unknown as BuildStatsInput
    const build = { ...emptyBuild(), gear: { 'Main Hand': 'Test Rapier' } }
    const before = build.filigreeSlots.filter(s => s.name).length
    expect(before).toBe(0)

    const res = await optimizeBuild({
      input, build,
      objective: objective('damage.perSwing', 'Damage per Swing'),
      domains: { filigrees: true },
      filigreeCandidates: shortlistFiligrees(FILIGREES, objective('damage.perSwing')),
      maxEvals: 2000,
    } as never)

    const chosen = res.build.filigreeSlots.filter(s => s.name).map(s => s.name)
    expect(chosen.length).toBeGreaterThan(0)
    expect(chosen).not.toContain('Swim Filigree')
  })
})
