// V2's "Armor AC % Bonus" (Breakdown_BonusArmorAC) and "Shield % Bonus"
// (Breakdown_BonusShieldAC) are BreakdownItemSimple pools of Effect_ArmorACBonus
// and Effect_ACBonusShield. V3 pools them under armorACPercent and
// shieldACPercent. v2calc emits both; the referee now compares them.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

describe('referee compares the armor and shield AC % lines', () => {
  it('pairs each with its V3 pool', () => {
    const vals: Record<string, number> = { armorACPercent: 10, shieldACPercent: 25 }
    const stats = {
      resolve: (k: string) => ({ total: vals[k] ?? 0, bonuses: [] }),
      total: (k: string) => vals[k] ?? 0,
      keys: () => Object.keys(vals), weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const rows = buildParityRows({ breakdowns: { armorACPercent: 10, shieldACPercent: 25 } } as OracleJson, stats, build, {})
    expect(rows.find(r => r.stat === 'armorACPercent')).toMatchObject({ v2: 10, v3: 10 })
    expect(rows.find(r => r.stat === 'shieldACPercent')).toMatchObject({ v2: 25, v3: 25 })
  })
})
