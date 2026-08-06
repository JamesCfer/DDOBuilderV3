// Parity pass X3 — Energy absorbance in forum export
//
// V2 ForumExportDlg.cpp:1183-1200 exports both Resistance and Absorbance columns
// for each energy type.  V3 already computes absorb.* via EnergyAbsorbance in
// effectParser.ts and shows the percentage in BreakdownsPanel using multiplicative
// stacking (100 − Π((100−x)/100)·100).  The forum export energyResistances section
// only emitted resist.* — absorb.* was silently absent.
//
// Row format updated by parity pass X14 (ForumExportDlg.cpp:1167-1214): V2 always
// emits one [TR] per type inside a [TABLE], both Resistance and Absorbance columns
// present (0 when absent), integer-truncated — never a conditional "Type Absorption"
// line with a decimal percentage. Assertions below were rewritten to match.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'

function mockStats(
  totals: Record<string, number>,
  bonuses: Record<string, ResolvedBonus[]> = {},
): BuildStats {
  return {
    total: (key: string) => totals[key] ?? 0,
    resolve: (key: string) => ({
      total: totals[key] ?? 0,
      bonuses: bonuses[key] ?? [],
    }),
    keys: () => Object.keys(totals),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

function makeBonus(value: number, type = 'Enhancement', source = 'Test'): ResolvedBonus {
  return { value, type, source, active: true }
}

describe('Forum export energyResistances section — absorbance (parity pass X3)', () => {
  const section = DEFAULT_SECTIONS.find(s => s.id === 'EnergyResistances')!
  const build = emptyBuild()

  it('emits a Fire row with resistance and 0% absorbance when no absorbance exists', () => {
    const stats = mockStats({ 'resist.Fire': 30 })
    const lines = section.emit({ build, stats })
    expect(lines).toContain('[b]Energy Resistances[/b]:')
    expect(lines).toContain('[TR][TD]Fire:[/TD][TD]30[/TD][TD]0%[/TD][/TR]')
  })

  it('emits absorbance for a single absorb source (20%)', () => {
    const stats = mockStats(
      { 'absorb.Fire': 20 },
      { 'absorb.Fire': [makeBonus(20)] },
    )
    const lines = section.emit({ build, stats })
    expect(lines).toContain('[TR][TD]Fire:[/TD][TD]0[/TD][TD]20%[/TD][/TR]')
  })

  it('emits both resistance and absorbance in the same row when both are non-zero', () => {
    const stats = mockStats(
      { 'resist.Fire': 30, 'absorb.Fire': 20 },
      { 'absorb.Fire': [makeBonus(20)] },
    )
    const lines = section.emit({ build, stats })
    expect(lines).toContain('[TR][TD]Fire:[/TD][TD]30[/TD][TD]20%[/TD][/TR]')
  })

  it('uses multiplicative stacking for two absorb sources (36% = trunc(100 − 0.8×0.8×100))', () => {
    const stats = mockStats(
      { 'absorb.Cold': 40 },
      { 'absorb.Cold': [makeBonus(20), makeBonus(20)] },
    )
    const lines = section.emit({ build, stats })
    // 100 − (0.80 × 0.80) × 100 = 36.0, truncated to 36
    expect(lines).toContain('[TR][TD]Cold:[/TD][TD]0[/TD][TD]36%[/TD][/TR]')
  })

  it('skips suppressed (inactive) absorb bonuses in the computation', () => {
    const active: ResolvedBonus = { value: 25, type: 'Enhancement', source: 'A', active: true }
    const suppressed: ResolvedBonus = { value: 10, type: 'Enhancement', source: 'B', active: false }
    const stats = mockStats(
      { 'absorb.Acid': 25 },
      { 'absorb.Acid': [active, suppressed] },
    )
    const lines = section.emit({ build, stats })
    // Only the 25% active bonus contributes → 25%, not the combined 32.5%
    expect(lines).toContain('[TR][TD]Acid:[/TD][TD]0[/TD][TD]25%[/TD][/TR]')
    expect(lines.some(l => l.includes('32%') || l.includes('33%'))).toBe(false)
  })

  it('always emits the full 13-type table, even when all resistances/absorbances are zero', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats })
    expect(lines).toContain('[TR][TD]Fire:[/TD][TD]0[/TD][TD]0%[/TD][/TR]')
    expect(lines).toContain('[TABLE]')
    expect(lines).toContain('[/TABLE]')
  })

  it('section header only appears once even with multiple energy types', () => {
    const stats = mockStats(
      { 'resist.Fire': 30, 'resist.Cold': 20 },
    )
    const lines = section.emit({ build, stats })
    expect(lines.filter(l => l === '[b]Energy Resistances[/b]:').length).toBe(1)
  })
})
