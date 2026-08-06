// Parity pass X14 — AddEnergyResistances wrong type list + no [TABLE]
//
// V2 ForumExportDlg.cpp:1167-1214 (AddEnergyResistances) always emits a
// [TABLE] with one row per type — Acid, Chaos, Cold, Electric, Evil, Fire,
// Force, Good, Lawful, Light, Negative, Poison, Sonic (in that order;
// Positive/Repair/Rust are deliberately commented out in V2) — showing both
// Resistance and Absorbance columns for every type, even when both are 0.
//
// V3's `energyResistances` section (sections.ts) used a different 11-type
// list (missing Chaos/Evil/Good/Lawful, wrongly including Positive/Repair),
// only printed a row when non-zero, and had no [TABLE] wrapping.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'

function mockStats(totals: Record<string, number>): BuildStats {
  return {
    total: (key: string) => totals[key] ?? 0,
    resolve: () => ({ total: 0, bonuses: [] as ResolvedBonus[] }),
    keys: () => Object.keys(totals),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

const section = DEFAULT_SECTIONS.find(s => s.id === 'EnergyResistances')!
const build = emptyBuild()

describe('Forum export energyResistances section — V2 type list + [TABLE] (parity pass X14)', () => {
  it('section exists', () => {
    expect(section).toBeDefined()
  })

  it('always emits all 13 V2 types, even when every value is 0', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats })
    for (const t of ['Acid', 'Chaos', 'Cold', 'Electric', 'Evil', 'Fire', 'Force',
      'Good', 'Lawful', 'Light', 'Negative', 'Poison', 'Sonic']) {
      expect(lines.some(l => l.includes(t))).toBe(true)
    }
  })

  it('never emits Positive or Repair rows (V2 has them commented out)', () => {
    const stats = mockStats({ 'resist.Positive': 25, 'resist.Repair': 25 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Positive'))).toBe(false)
    expect(lines.some(l => l.includes('Repair'))).toBe(false)
  })

  it('wraps rows in [TABLE]/[TR]/[TD] with a header row', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats })
    expect(lines).toContain('[TABLE]')
    expect(lines).toContain('[/TABLE]')
    expect(lines.some(l => l.includes('[TR][TD]Energy[/TD][TD]Resistance[/TD][TD]Absorbance[/TD][/TR]'))).toBe(true)
  })

  it('emits Chaos/Evil/Good/Lawful resistance values', () => {
    const stats = mockStats({
      'resist.Chaos': 5, 'resist.Evil': 10, 'resist.Good': 15, 'resist.Lawful': 20,
    })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Chaos') && l.includes('5'))).toBe(true)
    expect(lines.some(l => l.includes('Evil') && l.includes('10'))).toBe(true)
    expect(lines.some(l => l.includes('Good') && l.includes('15'))).toBe(true)
    expect(lines.some(l => l.includes('Lawful') && l.includes('20'))).toBe(true)
  })

  it('formats each row as [TR][TD]Type:[TD]Resistance[TD]Absorbance%', () => {
    const stats = mockStats({ 'resist.Fire': 30 })
    const lines = section.emit({ build, stats })
    const fireLine = lines.find(l => l.includes('Fire'))!
    expect(fireLine).toBe('[TR][TD]Fire:[/TD][TD]30[/TD][TD]0%[/TD][/TR]')
  })
})
