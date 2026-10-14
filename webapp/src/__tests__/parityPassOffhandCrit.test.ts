// V2 BreakdownItemWeaponEffects gives the off-hand weapon its OWN critical
// threat range, multiplier and 19-20 multiplier lines: each weapon effect
// lands on a hand only when its Item names that hand's weapon type or group
// (AffectsThisWeapon), the base lines come from the off-hand item itself
// (Build::ApplyWeaponEffects, none for a rune arm), and an ApplyToWeaponOnly
// item buff stays on the hand that wields it. V3 reused the main hand's
// pools, so e.g. Improved Critical: Slashing on a hand axe also raised an
// off-hand rune arm. Values pinned to v2calc weaponOffhand.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { critProfile } from '../lib/combat/critProfile'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const COLL = join(ROOT, 'Output', 'UserBuilds', 'collection')
// [file, threat range, multiplier, 19-20 multiplier]
const cases = [
  ['Dodge v7.DDOBuild', 2, 3, 3],      // buckler: Swashbuckling stays on the kukri
  ['Melee levler.DDOBuild', 0, 2, 2],  // rune arm: no base lines, no slashing crit
  ['wizurd.DDOBuild', 4, 3, 4],        // kama gets its own Improved Critical
  ['Bardbox.DDOBuild', 1, 1, 2],       // rune arm: only the "All" Warchanter boosts
  ['Warlocks.DDOBuild', 2, 3, 3],      // large shield: just its base lines
] as const

describe('off-hand critical lines (oracle-pinned)', () => {
  for (const [name, range, mult, mult1920] of cases) {
    const file = join(COLL, name)
    it.skipIf(!existsSync(file) || !existsSync(DATA))(name, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const cp = critProfile(k => stats.total(k), stats.offhandWeapon ?? null, { offhand: true })
      expect(cp.baseThreatFaces + cp.bonusThreatFaces).toBe(range)
      expect(cp.multiplier).toBe(mult)
      expect(cp.multiplier19to20).toBe(mult1920)
    }, 120_000)
  }
})
