// V2 BreakdownItem::AddEffect merges identical item effects into one entry
// with a stack count. "Barbarian DR" (Class, ApplyAsItemEffect, 1/%) comes
// from the Barbarian feat taken N times, Epic Barbarian Damage Reduction and
// Occult Slayer: every copy is the same effect, so V2 stacks them all
// (4 + 4 = 8). V3 folded a feat taken N times into one N-valued bonus, which
// no longer matched the 1-valued copies, so Class Highest-Only kept one group.
// Values pinned to v2calc breakdowns.dr.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const COLL = join(ROOT, 'Output', 'UserBuilds', 'collection')
const cases = [
  ['Highest DPS Melee.DDOBuild', 8],
  ['duergar leveling life.DDOBuild', 7],
  ['selfhealing tank.DDOBuild', 14],
  ['Two weaon Simi.DDOBuild', 3],
] as const

describe('Barbarian DR copies stack as one V2 effect (oracle-pinned)', () => {
  for (const [name, total] of cases) {
    const file = join(COLL, name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      expect(stats.total('dr.%')).toBe(total)
    }, 120_000)
  }
})
