// The Analysis rail's Melee "To-Hit Bonus" row added the BAB breakdown on top
// of `melee.toHit`, but `melee.toHit` already carries BAB as a Base line (V2
// BreakdownItemWeaponAttackBonus adds BAB into the attack pool, so percent
// effects scale over it). The row showed BAB twice: 192 for the Maetrim Monk
// whose V2 weapon Attack Bonus is 172 (v2calc weaponMain.attackBonus).

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildBreakdownSections } from '../components/breakdowns/breakdownSections'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const MONK = join(ROOT, 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')

describe('Melee To-Hit Bonus row (oracle-pinned)', () => {
  it.skipIf(!existsSync(MONK) || !existsSync(DATA))('shows V2 attack bonus 172, BAB counted once', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats, build } = computeV3ForXml(readFileSync(MONK, 'utf8'), cat)
    const sections = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
    const row = sections.find(s => s.title === 'Melee')?.rows.find(r => r.label === 'To-Hit Bonus')
    expect(row?.total).toBe(172)
    expect(row?.display).toBe('+172')
    expect(row?.bonuses.filter(b => /Base Attack Bonus|Monk \(20 lv\)/.test(b.source))).toHaveLength(1)
  }, 120_000)
})
