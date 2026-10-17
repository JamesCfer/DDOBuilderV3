// The Tactical DC rows for Stunning Shield, Innate Attack, Breath Weapon and
// Rune Arm read keys without the space ("tacticalDC.BreathWeapon"), but
// effects land under V2's tactical names ("tacticalDC.Breath Weapon",
// TacticalTypes.h), so those rows never showed a bonus. Values pinned to
// v2calc tacticalDC.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'
import { buildBreakdownSections } from '../components/breakdowns/breakdownSections'

const ROOT = join(__dirname, '..', '..', '..')
const DATA = join(ROOT, 'Output', 'DataFiles')
const cases = [
  [join(ROOT, 'Output', 'UserBuilds', 'collection', 'dragon breath.DDOBuild'), 'Breath Weapon', 9],
  [join(ROOT, 'Output', 'Example Builds', 'YingsMonk.DDOBuild'), 'Rune Arm', 3],
  [join(ROOT, 'Output', 'UserBuilds', 'collection', 'Captain Australia.DDOBuild'), 'Stunning Shield', 2],
] as const

describe('tactical DC rows use V2 tactical names (oracle-pinned)', () => {
  for (const [file, label, total] of cases) {
    it.skipIf(!existsSync(file) || !existsSync(DATA))(label, () => {
      const cat = loadAllCatalogues(DATA)
      const { stats, build } = computeV3ForXml(readFileSync(file, 'utf8'), cat)
      const rows = buildBreakdownSections(stats, build, cat.allClasses, cat.allWeaponGroups).flatMap(s => s.rows)
      expect(rows.find(r => r.label === `  vs ${label}`)?.total).toBe(total)
    }, 120_000)
  }
})

describe('a DC with a spaced tactical name gets its tactical bonus', () => {
  it('Breath Weapon (V2 DC::CalculateDC adds the Breath Weapon breakdown)', async () => {
    const { calculateDCValue } = await import('../lib/dcBreakdown')
    const { emptyBuild } = await import('../types/ddo')
    const stats = {
      total: (k: string) => ({ 'tacticalDC.Breath Weapon': 9 } as Record<string, number>)[k] ?? 0,
    } as unknown as Parameters<typeof calculateDCValue>[2]['stats']
    const ctx = { build: { ...emptyBuild(), featChoices: {} }, stats, allClasses: [] }
    expect(calculateDCValue({ Name: 'Dragon Breath', DCVersus: 'Reflex', Amount: 10, Tactical: 'Breath Weapon' }, 1, ctx)).toBe(19)
  })
})
