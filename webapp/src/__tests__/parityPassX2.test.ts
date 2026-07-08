// Parity pass X2 — Save sub-saves in forum export
//
// V2 ForumExportDlg.cpp:514-524 exports 9 sub-save rows below the three main
// saves: Fort→vs Poison, vs Disease; Will→vs Enchantment, vs Illusion, vs
// Fear, vs Curse; Reflex→vs Traps, vs Spell, vs Magic.
//
// V3 BreakdownsPanel already shows these via subSave(baseKey, subKey) which
// computes total = stats.total(baseKey) + stats.total(subKey). The forum
// export sections.ts::saves only emitted the three base saves — sub-saves
// were silently absent.

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

describe('Forum export saves section — sub-saves (parity pass X2)', () => {
  const savesSection = DEFAULT_SECTIONS.find(s => s.id === 'Saves')!
  const build = emptyBuild()

  it('emits Fortitude vs Poison and vs Disease rows when non-zero', () => {
    const stats = mockStats({
      'save.Fort': 15,
      'save.sub.Poison': 4,
      'save.sub.Disease': 2,
      'save.Reflex': 10,
      'save.Will': 12,
    })
    const lines = savesSection.emit({ build, stats })
    // sub-save total = base + sub bonus
    expect(lines).toContain('[TR][TD][/TD][TD]vs Poison[/TD][TD]19[/TD][/TR]')
    expect(lines).toContain('[TR][TD][/TD][TD]vs Disease[/TD][TD]17[/TD][/TR]')
  })

  it('emits Will sub-saves (Enchantment, Illusion, Fear, Curse) when non-zero', () => {
    const stats = mockStats({
      'save.Fort': 10,
      'save.Reflex': 10,
      'save.Will': 14,
      'save.sub.Enchantment': 3,
      'save.sub.Illusion': 1,
      'save.sub.Fear': 5,
      'save.sub.Curse': 2,
    })
    const lines = savesSection.emit({ build, stats })
    expect(lines).toContain('[TR][TD][/TD][TD]vs Enchantment[/TD][TD]17[/TD][/TR]')
    expect(lines).toContain('[TR][TD][/TD][TD]vs Illusion[/TD][TD]15[/TD][/TR]')
    expect(lines).toContain('[TR][TD][/TD][TD]vs Fear[/TD][TD]19[/TD][/TR]')
    expect(lines).toContain('[TR][TD][/TD][TD]vs Curse[/TD][TD]16[/TD][/TR]')
  })

  it('emits Reflex sub-saves (Traps, Spell, Magic) when non-zero', () => {
    const stats = mockStats({
      'save.Fort': 10,
      'save.Reflex': 8,
      'save.Will': 10,
      'save.sub.Traps': 6,
      'save.sub.Spell': 3,
      'save.sub.Magic': 2,
    })
    const lines = savesSection.emit({ build, stats })
    expect(lines).toContain('[TR][TD][/TD][TD]vs Traps[/TD][TD]14[/TD][/TR]')
    expect(lines).toContain('[TR][TD][/TD][TD]vs Spell[/TD][TD]11[/TD][/TR]')
    expect(lines).toContain('[TR][TD][/TD][TD]vs Magic[/TD][TD]10[/TD][/TR]')
  })

  it('omits sub-save rows when the sub-bonus is zero', () => {
    const stats = mockStats({
      'save.Fort': 15,
      'save.Reflex': 10,
      'save.Will': 12,
      // no sub-saves set → all 0
    })
    const lines = savesSection.emit({ build, stats })
    expect(lines).not.toContain(expect.stringMatching(/vs Poison/))
    expect(lines).not.toContain(expect.stringMatching(/vs Disease/))
    expect(lines).not.toContain(expect.stringMatching(/vs Enchantment/))
    expect(lines).not.toContain(expect.stringMatching(/vs Traps/))
  })

  it('main save lines appear before their sub-saves', () => {
    const stats = mockStats({
      'save.Fort': 15,
      'save.Reflex': 10,
      'save.Will': 12,
      'save.sub.Poison': 2,
      'save.sub.Traps': 3,
    })
    const lines = savesSection.emit({ build, stats })
    const fortIdx = lines.findIndex(l => l.includes('[TD]Fortitude[/TD]'))
    const poisonIdx = lines.findIndex(l => l.includes('vs Poison'))
    const reflexIdx = lines.findIndex(l => l.includes('[TD]Reflex[/TD]'))
    const trapsIdx = lines.findIndex(l => l.includes('vs Traps'))
    expect(fortIdx).toBeGreaterThanOrEqual(0)
    expect(poisonIdx).toBeGreaterThan(fortIdx)
    expect(reflexIdx).toBeGreaterThan(poisonIdx)
    expect(trapsIdx).toBeGreaterThan(reflexIdx)
  })
})
