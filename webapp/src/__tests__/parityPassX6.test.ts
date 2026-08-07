// Parity pass X6 — Missing alignment/physical spell power types in forum export
//
// V2 BreakdownsPane.cpp:1764-1780 tracks 17 distinct spell power types:
// Acid, LightAlignment, Chaos, Cold, Electric, Evil, Fire, Force, Lawful,
// Negative, Physical, Poison, Positive, Repair, Rust, Sonic, Untyped.
//
// sections.ts:spellPowers previously hardcoded 13 types, omitting:
//   Chaos, Evil, Lawful, Physical, Poison, Untyped
// and used "Light"/"Alignment" as two separate entries instead of "LightAlignment".
// It also used the wrong stat key "sp.crit.*" instead of "spCrit.*".
//
// Enhancement data confirms: Cleric Divine Disciple grants sp.Chaos/sp.Evil/sp.Lawful;
// Warlock Tainted Scholar grants sp.Chaos/sp.Evil.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'

function mockStats(totals: Record<string, number>): BuildStats {
  return {
    total: (key: string) => totals[key] ?? 0,
    resolve: (key: string) => ({
      total: totals[key] ?? 0,
      bonuses: [] as ResolvedBonus[],
    }),
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

describe('Forum export spellPowers section — alignment/physical types (parity pass X6)', () => {
  it('section exists', () => {
    expect(section).toBeDefined()
  })

  it('always emits the full table, even when all spell powers are zero (pass X15)', () => {
    // V2 ForumExportDlg.cpp:1453-1520 unconditionally emits all 16 rows.
    const stats = mockStats({})
    expect(section.emit({ build, stats }).length).toBeGreaterThan(0)
  })

  it('emits Chaos spell power row when non-zero', () => {
    const stats = mockStats({ 'sp.Chaos': 100 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Chaos') && l.includes('100'))).toBe(true)
  })

  it('emits Evil spell power row when non-zero', () => {
    const stats = mockStats({ 'sp.Evil': 50 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Evil') && l.includes('50'))).toBe(true)
  })

  it('never emits a Lawful row (V2 export table omits it — pass X15)', () => {
    // V2's AddSpellPowers table has no Lawful row even though the
    // BreakdownsPane tracks a Lawful spell power breakdown internally.
    const stats = mockStats({ 'sp.Lawful': 75 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Lawful'))).toBe(false)
  })

  it('emits Physical spell power row when non-zero', () => {
    const stats = mockStats({ 'sp.Physical': 40 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Physical') && l.includes('40'))).toBe(true)
  })

  it('emits Poison spell power row when non-zero', () => {
    const stats = mockStats({ 'sp.Poison': 60 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Poison') && l.includes('60'))).toBe(true)
  })

  it('emits Untyped spell power row when non-zero', () => {
    const stats = mockStats({ 'sp.Untyped': 30 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Untyped') && l.includes('30'))).toBe(true)
  })

  it('reads LightAlignment from sp.LightAlignment key (not sp.Light or sp.Alignment)', () => {
    // effectParser.normalizeSpellElement maps Light/Alignment → LightAlignment
    // so the stat is always keyed as sp.LightAlignment, never sp.Light or sp.Alignment
    const stats = mockStats({ 'sp.LightAlignment': 80 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('80'))).toBe(true)
    // sp.Light and sp.Alignment are zero — old broken code would emit nothing for value 80
    const statsOldKeys = mockStats({ 'sp.Light': 80, 'sp.Alignment': 80 })
    const linesOldKeys = section.emit({ build, stats: statsOldKeys })
    // New code ignores the old broken keys; row only shows when sp.LightAlignment is set
    expect(linesOldKeys.some(l => l.includes('80'))).toBe(false)
  })

  it('reads crit chance from spCrit.{type} key (not sp.crit.{type})', () => {
    // effectParser emits spCrit.Fire (not sp.crit.Fire), so the section must use
    // the spCrit. prefix to pick up crit contributions from enhancements/gear.
    const stats = mockStats({ 'sp.Fire': 100, 'spCrit.Fire': 15 })
    const lines = section.emit({ build, stats })
    const fireLine = lines.find(l => l.includes('Fire'))
    expect(fireLine).toBeDefined()
    expect(fireLine!.includes('15')).toBe(true)
  })

  it('still emits a row for a type whose power and crit are both zero (pass X15: V2 has no omission)', () => {
    const stats = mockStats({ 'sp.Fire': 100 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Cold'))).toBe(true)
    expect(lines.some(l => l.includes('Acid'))).toBe(true)
  })

  it('emits a header row containing "Spell Power" (pass X15: table-wrapped)', () => {
    const stats = mockStats({ 'sp.Fire': 100 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Spell Power'))).toBe(true)
  })

  it('folds sp.Universal into every row instead of its own row (pass X15)', () => {
    // V2 has no "Universal" row — BreakdownItemSpellPower::CreateOtherEffects
    // adds the universal spell power breakdown into every concrete type.
    const stats = mockStats({ 'sp.Universal': 20 })
    const lines = section.emit({ build, stats })
    expect(lines.some(l => l.includes('Universal'))).toBe(false)
    expect(lines.some(l => l.includes('Acid') && l.includes('20'))).toBe(true)
  })
})
