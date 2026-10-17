// V2 BreakdownItemWeaponEffects::AffectsUs routes every GhostTouch and
// TrueSeeing effect to both weapons, so v2calc's weaponOffhand ghostTouch /
// trueSeeing lines equal the build's totals. The referee never compared them.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

function makeStats(map: Record<string, number>): BuildStats {
  return {
    resolve: (k: string) => ({ total: map[k] ?? 0, bonuses: [] }),
    total: (k: string) => map[k] ?? 0,
    keys: () => Object.keys(map),
    weapon: null,
    offhandWeapon: { slot: 'Weapon2', weaponType: 'Kama' },
    armorMaxDex: null,
  } as unknown as BuildStats
}

const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild

describe('off-hand ghost touch and true seeing referee rows', () => {
  it('compares both lines against the build totals', () => {
    const oracle: OracleJson = { weaponOffhand: { ghostTouch: 1, trueSeeing: 0 } } as OracleJson
    const rows = buildParityRows(oracle, makeStats({ ghostTouch: 1, trueSeeing: 0 }), build, {})
    expect(rows.find(r => r.stat === 'weaponOffhand.ghostTouch')).toMatchObject({ v2: 1, v3: 1 })
    expect(rows.find(r => r.stat === 'weaponOffhand.trueSeeing')).toMatchObject({ v2: 0, v3: 0 })
  })
})
