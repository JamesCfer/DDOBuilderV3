// V2 BreakdownItemWeaponAttackBonus builds a separate attack line for the
// off-hand weapon: BAB, proficiency, negative levels, armor check penalty, the
// off-hand enhancement line, the best ability among the off-hand item's own
// candidates, the off-hand TWF penalty (-10 without the feat), and only the
// Weapon_Attack effects that name the off-hand weapon. V3 had no off-hand
// line. Values pinned to v2calc weaponOffhand.attackBonus.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildBreakdownSections } from '../components/breakdowns/breakdownSections'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const COLL = join(ROOT, 'Output', 'UserBuilds', 'collection')
const cases = [
  ['Melee Sorcerer.DDOBuild', 24],   // rune arm: no ability line, non-proficient (main 54)
  ['Dodge v7.DDOBuild', 56],         // buckler: Dex, its own +15 (main 57)
  ['Odd tank.DDOBuild', 47],         // tower shield with no main-hand weapon
] as const

describe('off-hand attack line (oracle-pinned)', () => {
  for (const [name, total] of cases) {
    const file = join(COLL, name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const rows = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups)
        .find(s => s.title === 'Off Hand')?.rows ?? []
      expect(rows.find(r => r.label === 'To-Hit')?.total).toBe(total)
    }, 120_000)
  }
})
