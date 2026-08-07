// Parity pass X15 — AddSpellPowers missing Critical Multiplier column + table wrap
//
// V2 ForumExportDlg.cpp:1453-1520 (AddSpellPowers/AddSpellPowerToTable) always
// wraps the 16 spell-power rows in a [SIZE=3][TABLE] with a 4-column header
// (Spell Power / Base / Critical Chance / Critical Multiplier) and emits every
// row unconditionally, even when every column is 0 — there is no per-row
// omission. Two verbatim V2 quirks: there is NO "Lawful" row at all (the
// BreakdownsPane tracks a Lawful spell power breakdown, but the export table
// never reads it), and the "Force/Untyped" label reads the Force breakdown
// (not a Force+Untyped merge) while a separate "Untyped" row reads the real
// Untyped breakdown. Universal spell power/crit/crit-multiplier are not their
// own row (V2 has no such row) — they fold additively into every concrete
// type's total instead (BreakdownItemSpellPower::CreateOtherEffects).
//
// V3's `spellPowers` section (sections.ts) only printed non-zero "Label:
// power / crit X%" free-text lines with no table, no Critical Multiplier
// column, and (pass X6) a "Universal" row of its own instead of folding it
// into every type.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'

function mockStats(totals: Record<string, number>): BuildStats {
  return {
    total: (key: string) => totals[key] ?? 0,
    resolve: (key: string) => ({ total: totals[key] ?? 0, bonuses: [] as ResolvedBonus[] }),
    keys: () => Object.keys(totals),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

const section = DEFAULT_SECTIONS.find(s => s.id === 'SpellPowers')!
const build = emptyBuild()

describe('Forum export spellPowers section — table + Critical Multiplier column (parity pass X15)', () => {
  it('section exists', () => {
    expect(section).toBeDefined()
  })

  it('always emits all 16 V2 rows, even when every stat is 0', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats })
    for (const t of ['Acid', 'Light/Alignment', 'Chaos', 'Cold', 'Electric', 'Evil',
      'Fire', 'Force/Untyped', 'Negative', 'Physical', 'Poison', 'Positive',
      'Repair', 'Rust', 'Sonic', 'Untyped']) {
      expect(lines.some(l => l.includes(t))).toBe(true)
    }
  })

  it('never emits a Lawful row (V2 export table omits it)', () => {
    const stats = mockStats({ 'sp.Lawful': 999 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Lawful'))).toBe(false)
  })

  it('wraps rows in [SIZE=3][TABLE] with the 4-column header', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats })
    expect(lines[0]).toBe('[SIZE=3][TABLE]')
    expect(lines[lines.length - 1]).toBe('[/TABLE][/SIZE]')
    expect(lines).toContain(
      '[TR][TD][COLOR=rgb(65, 168, 95)]Spell Power[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Base[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Critical Chance[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Critical Multiplier[/COLOR][/TD][/COLOR][/TR]')
  })

  it('formats a row as [TR][TD]Label(15ch)[/TD][TD]power[/TD][TD]crit%[/TD][TD]mult[/TD][/TR]', () => {
    const stats = mockStats({ 'sp.Fire': 100, 'spCrit.Fire': 15 })
    const lines = section.emit({ build, stats })
    const fireLine = lines.find(l => l.includes('Fire') && !l.includes('Force'))!
    expect(fireLine).toBe('[TR][TD]Fire           [/TD][TD]100[/TD][TD]15%[/TD][TD]0[/TD][/TR]')
  })

  it('Force/Untyped row reads the Force breakdown, not Untyped', () => {
    const stats = mockStats({ 'sp.Force': 50, 'sp.Untyped': 999 })
    const lines = section.emit({ build, stats })
    const forceLine = lines.find(l => l.includes('Force/Untyped'))!
    expect(forceLine).toBe('[TR][TD]Force/Untyped  [/TD][TD]50[/TD][TD]0%[/TD][TD]0[/TD][/TR]')
  })

  it('folds sp.Universal / spCrit.Universal into every row instead of its own row', () => {
    const stats = mockStats({ 'sp.Universal': 20, 'spCrit.Universal': 5 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Universal'))).toBe(false)
    const acidLine = lines.find(l => l.includes('Acid'))!
    expect(acidLine).toBe('[TR][TD]Acid           [/TD][TD]20[/TD][TD]5%[/TD][TD]0[/TD][/TR]')
  })

  it('Critical Multiplier column reads spCritDmg.<type> + spCritDmg.Universal + spCritDmg.All, truncated', () => {
    const stats = mockStats({
      'spCritDmg.Fire': 0.75, 'spCritDmg.Universal': 0.25, 'spCritDmg.All': 0.5,
    })
    const lines = section.emit({ build, stats })
    const fireLine = lines.find(l => l.includes('Fire') && !l.includes('Force'))!
    // 0.75 + 0.25 + 0.5 = 1.5, truncated to 1 (V2 casts the multiplier to int)
    expect(fireLine).toBe('[TR][TD]Fire           [/TD][TD]0[/TD][TD]0%[/TD][TD]1[/TD][/TR]')
  })
})
