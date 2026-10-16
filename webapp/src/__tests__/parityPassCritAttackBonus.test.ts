// V2 BreakdownItemWeaponAttackBonus in critical-effects mode (the Critical
// Attack Bonus line) takes the standard attack bonus as its base and adds
// Weapon_AttackCritical and Weapon_AttackAndDamageCritical effects (.cpp
// 262-269). V3 routed Weapon_AttackAndDamageCritical (Seeker, Treachery
// "+2 Critical Attack and Damage") only to crit damage, so the critical
// attack line missed them: YingsMonk 205 vs V2 228.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const B = (n: string) => join(ROOT, 'Output', 'Example Builds', n)

describe('Critical Attack Bonus (oracle-pinned, v2calc weaponMain.critAttackBonus)', () => {
  for (const [file, v2] of [['Maetrim_EndGameHandwrapsMonk.DDOBuild', 178], ['YingsMonk.DDOBuild', 228]] as const) {
    it.skipIf(!existsSync(B(file)) || !existsSync(DATA))(`${file}: ${v2}`, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats } = computeV3ForXml(readFileSync(B(file), 'utf8'), cat)
      expect(stats.total('melee.toHit') + stats.total('melee.crit.toHit')).toBe(v2)
    }, 120_000)
  }
})
