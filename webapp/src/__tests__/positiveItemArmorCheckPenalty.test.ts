// V2's Build::ApplyArmorEffects adds an armor's <ArmorCheckPenalty> to the
// Armor Check Penalty breakdown whatever its sign (HasArmorCheckPenalty), and
// BreakdownItemWeaponAttackBonus subtracts max(0, total) from attack. A few
// items print a positive value (Scales of Demogorgon 5, Baphomet's Brutality
// 1); V3 used to drop anything that was not negative, so those builds hit
// 5 and 1 points too high (fuzz seeds 8405 and 8469).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

const ROOT = join(__dirname, '..', '..', '..')
const cat = loadAllCatalogues(join(ROOT, 'Output', 'DataFiles'))
const stats = (seed: number) => computeV3ForXml(
  readFileSync(join(ROOT, 'Output', 'FuzzBuilds', `fuzz-${seed}.DDOBuild`), 'utf8'), cat).stats

describe('positive item armor check penalty', () => {
  it('fuzz-8405: Scales of Demogorgon ACP 5 lowers attack by 5 (V2 22)', () => {
    const s = stats(8405)
    expect(s.total('armorCheckPenalty')).toBe(5)
    expect(s.total('melee.toHit')).toBe(22)
  })
  it('fuzz-8469: Baphomet\'s Brutality ACP 1 adds to the enhancement penalties (V2 33)', () => {
    expect(stats(8469).total('melee.toHit')).toBe(33)
  })
})
