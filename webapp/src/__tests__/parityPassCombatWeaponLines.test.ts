// `melee.toHit` and `melee.damage` are V2's whole weapon Attack Bonus and
// Damage Bonus lines: BAB, the best ability modifier (damage scaled by the
// damage-ability multiplier and truncated), enchantment and the penalties
// are already lines in them. The combat estimators still added BAB and the
// ability modifier on top, so the Maetrim Monk (v2calc weaponMain: attack
// 174, damage 128) swung at 174 + 20 + WIS and hit for 128 + WIS too much.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildAttackEntry } from '../lib/combat/attackEntry'
import { extractCore } from '../lib/combat/autoDamage'
import { expectedDamage } from '../lib/combat/expectedDamage'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const MONK = join(ROOT, 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')

describe('combat estimators use V2 weapon lines once (oracle-pinned)', () => {
  it.skipIf(!existsSync(MONK) || !existsSync(DATA))('Maetrim Monk: attack 174, damage 128', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(readFileSync(MONK, 'utf8'), cat)
    const w = stats.weapon!
    const wis = stats.total('ability.Wisdom')
    const bab = stats.total('bab')

    const entry = buildAttackEntry(stats, w, wis, bab, { foeAC: 100 })
    expect(entry.breakdown.attackBonus).toBe(174)
    expect(entry.breakdown.baseDamage - entry.breakdown.weaponDie).toBe(128)

    const core = extractCore(stats, w, wis, bab, { attacksPerMinute: 60 } as never)
    expect(core.atk).toBe(174)
    expect(core.deadly).toBe(128)

    const dmg = expectedDamage(k => stats.total(k), stats.keys(), w)
    expect(dmg.damageBonus).toBe(128)
  }, 120_000)
})
