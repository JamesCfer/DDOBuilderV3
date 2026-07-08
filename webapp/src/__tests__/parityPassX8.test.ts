// Parity pass X8 — Forum export saves section: [TABLE] wrapping + no-fail-on-1
// marker/footnote.
//
// V2 ForumExportDlg.cpp:509-528 (AddSaves) wraps every save row in a
// [TABLE]/[TR][TD] block, and AddTableEntryBreakdown:548-564 appends a "*" to
// any row whose underlying BreakdownItemSave::HasNoFailOn1() is true (driven
// by Effect_SaveNoFailOn1), followed by a footnote line explaining the "*".
//
// V3's effectParser.ts already parses SaveNoFailOn1 into save.{Fort,Reflex,
// Will,All}.noFailOn1 stat keys (parityPass27/56 etc.), but nothing ever read
// them: sections.ts::saves emitted a plain indented list with no table and no
// marker, silently dropping the information.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'

function mockStats(overrides: Record<string, number>): BuildStats {
  return {
    total: (key: string) => overrides[key] ?? 0,
    resolve: (key: string) => ({ total: overrides[key] ?? 0, bonuses: [] }),
    keys: () => Object.keys(overrides),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

describe('Forum export saves section — [TABLE] + no-fail-on-1 (parity pass X8)', () => {
  const savesSection = DEFAULT_SECTIONS.find(s => s.id === 'Saves')!
  const build = emptyBuild()

  it('wraps the save rows in a BBCode [TABLE]', () => {
    const stats = mockStats({ 'save.Fort': 15, 'save.Reflex': 10, 'save.Will': 12 })
    const lines = savesSection.emit({ build, stats })
    expect(lines).toContain('[TABLE]')
    expect(lines).toContain('[/TABLE]')
    expect(lines).toContain('[TR][TD]Fortitude[/TD][TD][/TD][TD]15[/TD][/TR]')
    expect(lines).toContain('[TR][TD]Will[/TD][TD][/TD][TD]12[/TD][/TR]')
    expect(lines).toContain('[TR][TD]Reflex[/TD][TD][/TD][TD]10[/TD][/TR]')
  })

  it('marks a save with a no-fail-on-1 effect with a trailing "*" and adds the footnote', () => {
    const stats = mockStats({
      'save.Fort': 15,
      'save.Fort.noFailOn1': 1,
      'save.Reflex': 10,
      'save.Will': 12,
    })
    const lines = savesSection.emit({ build, stats })
    expect(lines).toContain('[TR][TD]Fortitude[/TD][TD][/TD][TD]15*[/TD][/TR]')
    expect(lines).toContain('[TR][TD]Reflex[/TD][TD][/TD][TD]10[/TD][/TR]')
    expect(lines).toContain('Marked with a* is no fail on a 1 if required DC met')
  })

  it('a universal (save.All) no-fail-on-1 effect marks every save', () => {
    const stats = mockStats({
      'save.Fort': 15,
      'save.Reflex': 10,
      'save.Will': 12,
      'save.All.noFailOn1': 1,
    })
    const lines = savesSection.emit({ build, stats })
    expect(lines).toContain('[TR][TD]Fortitude[/TD][TD][/TD][TD]15*[/TD][/TR]')
    expect(lines).toContain('[TR][TD]Will[/TD][TD][/TD][TD]12*[/TD][/TR]')
    expect(lines).toContain('[TR][TD]Reflex[/TD][TD][/TD][TD]10*[/TD][/TR]')
  })

  it('a base save\'s no-fail-on-1 marker propagates to its sub-save rows', () => {
    const stats = mockStats({
      'save.Fort': 15,
      'save.Fort.noFailOn1': 1,
      'save.sub.Poison': 4,
      'save.Reflex': 10,
      'save.Will': 12,
    })
    const lines = savesSection.emit({ build, stats })
    expect(lines).toContain('[TR][TD][/TD][TD]vs Poison[/TD][TD]19*[/TD][/TR]')
  })

  it('does not mark saves with no no-fail-on-1 effect', () => {
    const stats = mockStats({ 'save.Fort': 15, 'save.Reflex': 10, 'save.Will': 12 })
    const lines = savesSection.emit({ build, stats })
    expect(lines.filter(l => l.startsWith('[TR]')).some(l => l.includes('*'))).toBe(false)
  })
})
