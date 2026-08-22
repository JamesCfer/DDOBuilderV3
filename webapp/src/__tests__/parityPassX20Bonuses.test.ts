// Parity pass X20 — AddBonuses had different semantics from V3's bonusesDump
//
// V2 ForumExportDlg.cpp:1093-1165 (AddBonuses) emits a [TABLE] with a fixed
// 10-column header (Statistic | Enhancement | Insightful | Artifact |
// Quality | Profane | Equipment | Competence | Exceptional | Festive |
// Fortune), one row per name in `Life::MonitoredBonuses()` (a small,
// user-curated watch list) that resolves to a known breakdown
// (BreakdownTypes.h:338-464 breakdownNameMap), each cell holding that
// breakdown's GEAR-sourced contribution of that bonus type
// (`GetEffectValue(type, /*bItemEffectsOnly*/true)`), blank when 0.
//
// V3's old `bonusesDump` instead dumped every non-zero accumulated stat key
// with its total — an unrelated, V3-invented debug listing.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import { importV2Document } from '../lib/v2Import'
import type { BuildStats } from '../hooks/useBuildStats'
import type { RawBonus, ResolvedBonus } from '../lib/bonus'

function mockStats(byKey: Record<string, RawBonus[]>): BuildStats {
  return {
    total: () => 0,
    resolve: (key: string) => ({
      total: 0,
      bonuses: (byKey[key] ?? []).map(b => ({ ...b, active: true })) as ResolvedBonus[],
    }),
    keys: () => Object.keys(byKey),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

const section = DEFAULT_SECTIONS.find(s => s.id === 'Bonuses')!
const build = emptyBuild()

describe('Forum export Bonuses section — V2 monitored-bonus table (parity pass X20)', () => {
  it('section exists', () => {
    expect(section).toBeDefined()
  })

  it('emits nothing when there is no monitored-bonus list', () => {
    const stats = mockStats({})
    expect(section.emit({ build, stats })).toEqual([])
    expect(section.emit({ build, stats, monitoredBonuses: [] })).toEqual([])
  })

  it('emits a [TABLE] with the 10 V2 bonus-type columns', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats, monitoredBonuses: ['Strength'] })
    expect(lines[0]).toBe('[TABLE]')
    expect(lines[1]).toBe(
      '[TR][TD]Statistic[/TD][TD]Enhancement[/TD][TD]Insightful[/TD][TD]Artifact[/TD]' +
      '[TD]Quality[/TD][TD]Profane[/TD][TD]Equipment[/TD][TD]Competence[/TD]' +
      '[TD]Exceptional[/TD][TD]Festive[/TD][TD]Fortune[/TD][/TR]',
    )
    expect(lines[lines.length - 1]).toBe('[/TABLE]')
  })

  it('reads the gear-sourced (fromGear) contribution per bonus type', () => {
    const stats = mockStats({
      'ability.Strength': [
        { value: 6, type: 'Enhancement', source: 'Item of Strength', fromGear: true },
        { value: 2, type: 'Quality', source: 'Quality item', fromGear: true },
      ],
    })
    const lines = section.emit({ build, stats, monitoredBonuses: ['Strength'] })
    const row = lines.find(l => l.startsWith('[TR][TD]Strength[/TD]'))!
    expect(row).toBe(
      '[TR][TD]Strength[/TD][TD]+6[/TD][TD][/TD][TD][/TD][TD]+2[/TD][TD][/TD]' +
      '[TD][/TD][TD][/TD][TD][/TD][TD][/TD][TD][/TD][/TR]',
    )
  })

  it('excludes feat/enhancement-sourced bonuses (V2 GetEffectValue bItemEffectsOnly=true)', () => {
    const stats = mockStats({
      'ability.Strength': [
        { value: 6, type: 'Enhancement', source: 'Item of Strength', fromGear: true },
        { value: 4, type: 'Enhancement', source: 'Tome of Strength', fromGear: false },
      ],
    })
    const lines = section.emit({ build, stats, monitoredBonuses: ['Strength'] })
    const row = lines.find(l => l.startsWith('[TR][TD]Strength[/TD]'))!
    expect(row).toContain('[TD]+6[/TD]')
    expect(row).not.toContain('+10')
  })

  it('skips a monitored-bonus name that does not resolve to a known breakdown', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats, monitoredBonuses: ['Not A Real Breakdown'] })
    expect(lines).toEqual([])
  })

  it('"Dodge Cap" aliases the Dodge breakdown (V2 quirk: no separate tracked breakdown)', () => {
    const stats = mockStats({
      dodge: [{ value: 5, type: 'Insightful', source: 'Boots', fromGear: true }],
    })
    const lines = section.emit({ build, stats, monitoredBonuses: ['Dodge', 'Dodge Cap'] })
    const dodgeRow = lines.find(l => l.startsWith('[TR][TD]Dodge[/TD]'))!
    const capRow = lines.find(l => l.startsWith('[TR][TD]Dodge Cap[/TD]'))!
    expect(dodgeRow.replace('Dodge', '')).toBe(capRow.replace('Dodge Cap', ''))
  })

  it("maps V2's 'Spell Craft' display name to the V3 'Spellcraft' skill key", () => {
    const stats = mockStats({
      'skill.Spellcraft': [{ value: 3, type: 'Competence', source: 'Item', fromGear: true }],
    })
    const lines = section.emit({ build, stats, monitoredBonuses: ['Spell Craft'] })
    const row = lines.find(l => l.startsWith('[TR][TD]Spell Craft[/TD]'))!
    expect(row).toContain('[TD]+3[/TD]')
  })
})

describe('V2 import — Life::MonitoredBonuses (parity pass X20)', () => {
  const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
  const xml = readFileSync(join(FIXTURE_DIR, 'Maetrim_EndGameHandwrapsMonk.DDOBuild'), 'utf-8')

  it("parses the active Life's <MonitoredBonuses> watch list", () => {
    const { document } = importV2Document(xml)
    const life = document.lives.find(l => l.id === document.activeLifeId) ?? document.lives[0]
    expect(life.monitoredBonuses).toContain('Strength')
    expect(life.monitoredBonuses).toContain('PRR')
    expect(life.monitoredBonuses).toContain('MRR Cap')
    expect(life.monitoredBonuses).toContain('Sneak Attack Damage')
    expect(life.monitoredBonuses.length).toBe(23)
  })
})
