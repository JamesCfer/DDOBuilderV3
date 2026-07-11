// Parity pass X7 — Forum export characterHeader "vitals block".
//
// V2 ForumExportDlg.cpp:312-392 (AddCharacterHeader) prints HP/Displacement
// then six ability rows each paired with a derived combat stat
// (Str+UnconsciousRange/Incorporeality, Dex+PRR/AC, Con+MRR/+HealingAmp,
// Int+Dodge/-HealingAmp, Wis+Fort/RepairAmp, Cha+SR/BAB), then trailing
// DR/Immunities lines. V3's characterHeader section previously only emitted
// Name/Race/Alignment/Classes/Total Level — the whole vitals block was
// missing.

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

describe('Forum export characterHeader vitals block (parity pass X7)', () => {
  const headerSection = DEFAULT_SECTIONS.find(s => s.id === 'CharacterHeader')!
  const build = { ...emptyBuild(), baseAbilities: { Strength: 16, Dexterity: 14, Constitution: 12, Intelligence: 8, Wisdom: 10, Charisma: 18 } }

  it('emits HP / Displacement', () => {
    const stats = mockStats({ hp: 184, displacement: 25 })
    const lines = headerSection.emit({ build, stats })
    expect(lines).toContain('[b]HP[/b]: 184  [b]Displacement[/b]: 25%')
  })

  it('pairs each ability with its V2 combat stat', () => {
    const stats = mockStats({
      'ability.Strength': 20, 'ability.Dexterity': 18, 'ability.Constitution': 16,
      'ability.Intelligence': 8, 'ability.Wisdom': 12, 'ability.Charisma': 22,
      unconsciousRange: 5, incorporeality: 10,
      prr: 45, ac: 62,
      mrr: 30, healAmp: 20,
      dodge: 20, dodgeCap: 25, negHealAmp: 5,
      fortification: 100, repairAmp: 15,
      spellResistance: 30, bab: 20,
    })
    const lines = headerSection.emit({ build, stats })
    expect(lines).toContain('STR: 16/+0/20  [b]Unc. Range[/b]: 5  [b]Incorporeality[/b]: 10%')
    expect(lines).toContain('DEX: 14/+0/18  [b]PRR[/b]: 45  [b]AC[/b]: 62')
    expect(lines).toContain('CON: 12/+0/16  [b]MRR[/b]: 30  [b]+Healing Amp[/b]: 20%')
    expect(lines).toContain('INT: 8/+0/8  [b]Dodge[/b]: 20/25%  [b]-Healing Amp[/b]: 5%')
    expect(lines).toContain('WIS: 10/+0/12  [b]Fort[/b]: 100%  [b]Repair Amp[/b]: 15%')
    expect(lines).toContain('CHA: 18/+0/22  [b]SR[/b]: 30  [b]BAB[/b]: 20')
  })

  it('shows MRR as value/cap when the cap is below the total', () => {
    const stats = mockStats({ mrr: 40, mrrCap: 30 })
    const lines = headerSection.emit({ build, stats })
    expect(lines.some(l => l.includes('[b]MRR[/b]: 40/30'))).toBe(true)
  })

  it('lists non-zero DR and Immunity keys, or "None"', () => {
    const withNone = headerSection.emit({ build, stats: mockStats({}) })
    expect(withNone).toContain('[b]DR[/b]: None')
    expect(withNone).toContain('[b]Immunities[/b]: None')

    const withData = headerSection.emit({ build, stats: mockStats({
      'dr.Bludgeoning': 10, 'dr.Silver': 5, 'immunity.Fear': 1, 'immunity.Poison': 1,
    }) })
    expect(withData.find(l => l.startsWith('[b]DR[/b]'))).toBe('[b]DR[/b]: 10/Bludgeoning, 5/Silver')
    expect(withData.find(l => l.startsWith('[b]Immunities[/b]'))).toBe('[b]Immunities[/b]: Fear, Poison')
  })

  it('still emits the pre-existing name/race/classes lines when stats is null', () => {
    const lines = headerSection.emit({ build, stats: null })
    expect(lines.some(l => l.startsWith('[b]Character Name[/b]'))).toBe(true)
    expect(lines.some(l => l.startsWith('[b]HP[/b]'))).toBe(false)
  })
})
