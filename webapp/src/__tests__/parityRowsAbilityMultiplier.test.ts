// V2's "Main Hand Ability Multiplier" and "Off Hand Ability Multiplier"
// (Breakdown_DamageAbilityMultiplier / ...Offhand) are BreakdownItemSimple
// pools of Effect_DamageAbilityMultiplier(Offhand). V3 pools them under
// melee.damageAbilityMult and offhand.damageAbilityMult. v2calc emits both
// (fractional, so compared x100); the referee now compares them.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

describe('referee compares the damage ability multiplier lines', () => {
  it('pairs main hand and off hand with their V3 pools', () => {
    const vals: Record<string, number> = { 'melee.damageAbilityMult': 1.5, 'offhand.damageAbilityMult': 0.5 }
    const stats = {
      resolve: (k: string) => ({ total: vals[k] ?? 0, bonuses: [] }),
      total: (k: string) => vals[k] ?? 0,
      keys: () => Object.keys(vals), weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const rows = buildParityRows({ abilityMultiplier: { main: 1.5, offhand: 0.5 } } as OracleJson, stats, build, {})
    expect(rows.find(r => r.stat === 'abilityMultiplier.main')).toMatchObject({ v2: 150, v3: 150 })
    expect(rows.find(r => r.stat === 'abilityMultiplier.offhand')).toMatchObject({ v2: 50, v3: 50 })
  })
})
