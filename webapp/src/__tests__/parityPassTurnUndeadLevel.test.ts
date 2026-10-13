// V2 BreakdownItemTurnUndeadLevel / BreakdownItemTurnUndeadHitDice take the
// base level from the Cleric, Dark Apostate and Paladin CASTER LEVEL
// breakdowns (class levels plus every CasterLevel effect and Mixed Magics),
// not from raw class levels: max(Cleric CL, Dark Apostate CL) unless
// Paladin CL - 3 is higher. Hit dice also always add the Charisma modifier.
// V3 used class levels, so a Monk with Epic/Legendary Knowledge (+8 Cleric
// caster level) showed turn level 6 where V2 shows 14.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const MONK = join(ROOT, 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')
const CLERIC = join(ROOT, 'Output', 'UserBuilds', 'collection', '15 second burn.DDOBuild')

describe('Turn Undead level uses caster levels (oracle-pinned)', () => {
  it.skipIf(!existsSync(MONK) || !existsSync(DATA))('Monk with no Cleric levels: V2 14', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(readFileSync(MONK, 'utf8'), cat)
    expect(stats.total('turnUndead.levelBonus')).toBe(14)
  }, 120_000)

  it.skipIf(!existsSync(CLERIC) || !existsSync(DATA))('Cleric 18 with Cleric caster level 27: V2 27', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(readFileSync(CLERIC, 'utf8'), cat)
    expect(stats.total('turnUndead.levelBonus')).toBe(27)
  }, 120_000)
})
