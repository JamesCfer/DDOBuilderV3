// v2calc now emits 25 more V2 breakdown totals (charges, sneak attack range,
// turn undead hit dice, eldritch blast dice, rune arm, wild surge, missile
// deflection bypass, secondary shield bash, HP percent, universal spell
// crit, metamagic costs). The referee compares each one with V3's key.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

const pairs: Record<string, string> = {
  layOnHands: 'lohExtra', lohRegen: 'lohRegen', rages: 'rageExtra', sneakAttackRange: 'melee.sneakRange',
  turnUndeadHitDice: 'turnUndead.diceBonus', eldritchBlastD6: 'eldritchBlast.d6', eldritchBlastD8: 'eldritchBlast.d8',
  runeArmChargeRate: 'runeArm.chargeRate', runeArmStableCharge: 'runeArm.stableCharge', wildsurge: 'wildsurgeChance',
  secondaryShieldBash: 'secondaryShieldBash', missileDeflectionBypass: 'missileDeflectionBypass',
  spellCritUniversal: 'spCrit.Universal', hitpointsPercent: 'hp.percent',
  mmAccelerate: 'metamagic.cost.Accelerate', mmEmbolden: 'metamagic.cost.Embolden', mmEmpower: 'metamagic.cost.Empower',
  mmEmpowerHealing: 'metamagic.cost.EmpowerHealing', mmEnlarge: 'metamagic.cost.Enlarge', mmEschew: 'metamagic.cost.EschewMaterials',
  mmExtend: 'metamagic.cost.Extend', mmHeighten: 'metamagic.cost.Heighten', mmIntensify: 'metamagic.cost.Intensify',
  mmMaximize: 'metamagic.cost.Maximize', mmQuicken: 'metamagic.cost.Quicken',
}

describe('referee compares the newly emitted V2 breakdowns', () => {
  it('pairs each with its V3 key', () => {
    const v2 = Object.fromEntries(Object.keys(pairs).map((k, i) => [k, i + 1]))
    const v3 = Object.fromEntries(Object.entries(pairs).map(([k, key]) => [key, v2[k]]))
    const stats = {
      resolve: (k: string) => ({ total: v3[k] ?? 0, bonuses: [] }),
      total: (k: string) => v3[k] ?? 0,
      keys: () => Object.keys(v3), weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const rows = buildParityRows({ breakdowns: v2 } as OracleJson, stats, build, {})
    for (const k of Object.keys(pairs)) {
      expect(rows.find(r => r.stat === k), k).toMatchObject({ v2: v2[k], v3: v2[k] })
    }
  })
})
