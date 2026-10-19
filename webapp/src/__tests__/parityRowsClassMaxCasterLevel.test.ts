// V2's "Bonus Max <Class> Caster level" lines (Breakdown_MaxCasterLevel_First
// + class index, BreakdownItemClassCasterLevel on Effect_MaxCasterLevel) pool
// MaxCasterLevel effects whose Item is that class or "All". V3 keeps those in
// maxCl.<item>, so the referee compares the class pool plus the All pool.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

describe('referee compares the per-class bonus max caster level lines', () => {
  it('pairs each class with maxCl.<class> + maxCl.All', () => {
    const vals: Record<string, number> = { 'maxCl.All': 2, 'maxCl.Wizard': 3 }
    const stats = {
      resolve: (k: string) => ({ total: vals[k] ?? 0, bonuses: [] }),
      total: (k: string) => vals[k] ?? 0,
      keys: () => Object.keys(vals), weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const rows = buildParityRows({ maxCasterLevel: { Wizard: 5, Sorcerer: 2 } } as OracleJson, stats, build, {})
    expect(rows.find(r => r.stat === 'maxCl.Wizard')).toMatchObject({ v2: 5, v3: 5 })
    expect(rows.find(r => r.stat === 'maxCl.Sorcerer')).toMatchObject({ v2: 2, v3: 2 })
  })
})
