// V2's "Tower Shield MDB" (Breakdown_MaxDexBonusShields) and "Dodge Cap
// (Tower Shield)" (Breakdown_DodgeCapTowerShield) are both BreakdownItemSimple
// pools of Effect_MaxDexBonusTowerShield, which V3 pools under mdbShields.
// v2calc emits both; the referee now compares them.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

describe('referee compares the tower shield max Dex lines', () => {
  it('pairs both with mdbShields', () => {
    const stats = {
      resolve: (k: string) => ({ total: k === 'mdbShields' ? 6 : 0, bonuses: [] }),
      total: (k: string) => (k === 'mdbShields' ? 6 : 0),
      keys: () => ['mdbShields'], weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const rows = buildParityRows({ breakdowns: { maxDexBonusShields: 6, dodgeCapTowerShield: 6 } } as OracleJson, stats, build, {})
    expect(rows.find(r => r.stat === 'maxDexBonusShields')).toMatchObject({ v2: 6, v3: 6 })
    expect(rows.find(r => r.stat === 'dodgeCapTowerShield')).toMatchObject({ v2: 6, v3: 6 })
  })
})
