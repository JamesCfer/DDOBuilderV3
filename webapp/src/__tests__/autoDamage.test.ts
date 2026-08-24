import { describe, expect, it } from 'vitest'
import { extractCore, extractLists, isRangedWeapon } from '../lib/combat/autoDamage'
import type { BuildStats, WeaponInfo } from '../hooks/useBuildStats'
import type { Item } from '../types/ddo'
import type { ItemBuffSpec } from '../server/dataLoaders'

/** Minimal BuildStats backed by a plain key -> total map. */
function fakeStats(totals: Record<string, number>, proficient = true): BuildStats {
  return {
    resolve: (k: string) => ({ total: totals[k] ?? 0, bonuses: [] }) as never,
    total: (k: string) => totals[k] ?? 0,
    keys: () => Object.keys(totals),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => proficient,
  }
}

const weapon: WeaponInfo = {
  name: 'Test Falchion',
  slot: 'Weapon1',
  diceNum: 2,
  diceSides: 4,
  critThreatRange: 4,   // threatens on 17-20
  critMultiplier: 3,
  attackModifier: 'Strength',
  weaponType: 'Falchion',
}

describe('isRangedWeapon', () => {
  it('separates ranged weapon types from melee ones', () => {
    expect(isRangedWeapon('Longbow')).toBe(true)
    expect(isRangedWeapon('Great Crossbow')).toBe(true)
    expect(isRangedWeapon('Shuriken')).toBe(true)
    expect(isRangedWeapon('Falchion')).toBe(false)
    expect(isRangedWeapon(undefined)).toBe(false)
  })
})

describe('extractCore', () => {
  const totals = {
    'melee.toHit': 20,
    'melee.attack': 5,
    'melee.damage': 40,
    'melee.power': 150,
    'melee.doublestrike': 35,
    'melee.crit.range': 0,
    'melee.crit.multiplier': 1,
    'melee.crit.damage': 30,
    'melee.sneakDice': 7,
    'weapon.bonusW': 1,
    'weapon.critMultiplier19to20': 2,
    fortBypass: 75,
    imbueDice: 4,
    'ranged.power': 999,
    'ranged.doubleshot': 999,
  }

  const core = extractCore(fakeStats(totals), weapon, 40, 21, { attacksPerMinute: 120 })

  it('sums the attack bonus from BAB, to-hit sources, and the ability modifier', () => {
    // 21 BAB + (20 + 5) to-hit + 15 from a 40 Strength
    expect(core.atk).toBe(21 + 25 + 15)
  })

  it('converts threat faces into the lowest threatening d20 face', () => {
    expect(core.threat).toBe(17)
  })

  it('stacks the crit multiplier and its 19-20 extra', () => {
    expect(core.critMult).toBe(4)   // 3 base + 1 bonus
    expect(core.crit19).toBe(2)
  })

  it('folds bonus [W] dice into the weapon dice count', () => {
    expect(core.wCount).toBe(3)     // 2 base + 1 bonusW
    expect(core.wSides).toBe(4)
    expect(core.wMult).toBe(1)
  })

  it('puts flat damage in the critable bucket and crit-only damage on top', () => {
    expect(core.deadly).toBe(55)       // 40 melee.damage + 15 ability mod
    expect(core.deadlyCrit).toBe(85)   // + 30 crit-only
  })

  it('reads melee scaling for a melee weapon', () => {
    expect(core.rp).toBe(150)
    expect(core.ds).toBe(35)
  })

  it('reads ranged scaling when told the build is ranged', () => {
    const ranged = extractCore(fakeStats(totals), weapon, 40, 21, {
      attacksPerMinute: 100, ranged: true,
    })
    expect(ranged.rp).toBe(999)
    expect(ranged.ds).toBe(999)
  })

  it('carries fortification bypass, sneak dice, and imbue dice across', () => {
    expect(core.bypass).toBe(75)
    expect(core.sneakDice).toBe(7)
    expect(core.imbBonus).toBe(4)
  })

  it('seeds proficiency at 20% only when the build is proficient', () => {
    expect(core.prof).toBe(20)
    expect(extractCore(fakeStats(totals, false), weapon, 40, 21, { attacksPerMinute: 120 }).prof)
      .toBe(0)
  })

  it('lets the caller override the target and encounter settings', () => {
    const c = extractCore(fakeStats(totals), weapon, 40, 21, {
      attacksPerMinute: 120, ac: 120, prr: 200, dur: 30, trials: 500, seed: 9,
    })
    expect(c).toMatchObject({ ac: 120, prr: 200, dur: 30, trials: 500, seed: 9 })
  })
})

describe('extractLists', () => {
  const templates: ItemBuffSpec[] = [
    {
      Type: 'Dripping with Magma',
      DisplayText: 'Dripping with Magma: This Obsidian weapon drips with magma on every swing. ' +
        'Your attacks have a high chance to deal very strong fire damage over time.',
    },
    {
      Type: 'AcidVulnerability',
      DisplayText: 'Acid Vulnerability: On Hit: Applies a stack of Vulnerable (1% more damage ' +
        'for 3 seconds. This effect stacks up to 20 times, and loses one stack on expiry.)',
    },
    {
      Type: 'Acid Guard VIII',
      DisplayText: 'Acid Guard VIII: When Hit in Melee: Deals 8 to 32 Acid damage to your attacker.',
    },
    {
      // A template carrying real stat effects -- useBuildStats already applied
      // it, so the calculator must not count it a second time.
      Type: 'Seeker',
      DisplayText: 'Seeker: +10 to confirm critical hits.',
      Effect: { Type: 'Seeker', Amount: 10 } as never,
    },
  ]

  const gear = (types: string[]): Record<string, Item> => ({
    Weapon1: {
      Name: 'The Magmatic Cleaver',
      Buff: types.map(Type => ({ Type })),
    } as Item,
  })

  it('turns a numberless item effect into a DoT via the catalogue', () => {
    const { lists, audit } = extractLists(gear(['Dripping with Magma']), templates)
    expect(lists.dots).toHaveLength(1)
    // The item text states nothing, so these come from DDO wiki: 10d20 per
    // stack, 5 stacks, 5s, 1s cooldown, whole stack drops on expiry.
    expect(lists.dots[0]).toMatchObject({
      name: 'Dripping with Magma', tag: 'fire',
      dice: 10, sides: 20, cap: 5, dur: 5, icd: 1, decayAll: true,
    })
    expect(lists.dots[0].source).toBe('The Magmatic Cleaver (Weapon1)')
    // Documented numbers, so this counts as exact rather than a guess.
    expect(audit[0]).toMatchObject({ kind: 'dot', confidence: 'exact' })
    expect(audit[0].note).toMatch(/DDO wiki/)
  })

  it('turns a stated Vulnerable clause into a debuff marked exact', () => {
    const { lists, audit } = extractLists(gear(['AcidVulnerability']), templates)
    expect(lists.debuffs).toHaveLength(1)
    expect(lists.debuffs[0]).toMatchObject({ target: 'vulnerability', value: 1, cap: 20 })
    expect(audit[0].confidence).toBe('exact')
  })

  it('skips guards entirely', () => {
    const { lists, audit } = extractLists(gear(['Acid Guard VIII']), templates)
    expect(lists.procs).toHaveLength(0)
    expect(lists.dots).toHaveLength(0)
    expect(audit).toHaveLength(0)
  })

  it('skips templates that carry stat effects, to avoid double-counting', () => {
    const { lists, audit } = extractLists(gear(['Seeker']), templates)
    expect(audit).toHaveLength(0)
    expect(lists.procs).toHaveLength(0)
  })

  it('reads every equipped item, not just the weapon', () => {
    const { lists } = extractLists({
      Weapon1: { Name: 'Cleaver', Buff: [{ Type: 'Dripping with Magma' }] } as Item,
      Ring1: { Name: 'Band', Buff: [{ Type: 'AcidVulnerability' }] } as Item,
    }, templates)
    expect(lists.dots).toHaveLength(1)
    expect(lists.debuffs).toHaveLength(1)
  })

  it('keeps generated names unique so rider links stay unambiguous', () => {
    const { lists } = extractLists({
      Weapon1: { Name: 'A', Buff: [{ Type: 'Dripping with Magma' }] } as Item,
      Weapon2: { Name: 'B', Buff: [{ Type: 'Dripping with Magma' }] } as Item,
    }, templates)
    expect(lists.dots).toHaveLength(2)
    expect(lists.dots[0].name).not.toBe(lists.dots[1].name)
  })

  it('produces nothing for gear with no buffs', () => {
    const { lists, audit, unmodelled } = extractLists({
      Ring1: { Name: 'Plain Band' } as Item,
    }, templates)
    expect(audit).toHaveLength(0)
    expect(unmodelled).toHaveLength(0)
    expect(lists.procs).toHaveLength(0)
  })

  it('reports an effect that clearly does damage but states nothing readable', () => {
    const odd: ItemBuffSpec[] = [{
      Type: 'Mystery Sting',
      DisplayText: 'Mystery Sting: This weapon deals damage in a way nobody wrote down.',
    }]
    const { unmodelled } = extractLists(gear(['Mystery Sting']), odd)
    expect(unmodelled.join()).toMatch(/Mystery Sting/)
  })
})
