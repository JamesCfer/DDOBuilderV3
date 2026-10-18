// V2's per-school "<School> Caster Level" and "<School> Max Caster Level"
// lines (BreakdownItemSchoolCasterLevel) pool CasterLevel / MaxCasterLevel
// effects whose Item is that school or "All" (Effect::HasSpellSchool with
// bSpecificDCOnly=false). V3 keeps those in cl.<item> / maxCl.<item>, so the
// referee compares V2's line against the school pool plus the All pool.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

describe('referee compares the per-school caster level lines', () => {
  it('pairs each with the school pool plus the All pool', () => {
    const vals: Record<string, number> = { 'cl.All': 1, 'cl.Evocation': 2, 'maxCl.All': 3, 'maxCl.Necromancy': 4 }
    const stats = {
      resolve: (k: string) => ({ total: vals[k] ?? 0, bonuses: [] }),
      total: (k: string) => vals[k] ?? 0,
      keys: () => Object.keys(vals), weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const breakdowns = { clSchoolEvocation: 3, clSchoolAbjuration: 1, maxClSchoolNecromancy: 7, maxClSchoolIllusion: 3 }
    const rows = buildParityRows({ breakdowns } as OracleJson, stats, build, {})
    expect(rows.find(r => r.stat === 'clSchoolEvocation')).toMatchObject({ v2: 3, v3: 3 })
    expect(rows.find(r => r.stat === 'clSchoolAbjuration')).toMatchObject({ v2: 1, v3: 1 })
    expect(rows.find(r => r.stat === 'maxClSchoolNecromancy')).toMatchObject({ v2: 7, v3: 7 })
    expect(rows.find(r => r.stat === 'maxClSchoolIllusion')).toMatchObject({ v2: 3, v3: 3 })
  })
})
