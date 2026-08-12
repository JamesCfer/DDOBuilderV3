// Parity pass X4 — Forum export tacticalDCs section broken
//
// V2 ForumExportDlg.cpp:1735-1757 emits per-type tactical DC rows for all 13
// types defined in TacticalTypes.h. V3 sections.ts had a tacticalDCs section
// that called stats.total('tacticalDC') which is always 0 — parseEffect routes
// to 'tacticalDC.All' or 'tacticalDC.{Type}', never to bare 'tacticalDC'.
//
// Superseded by parity pass X16 (parityPassX16TacticalDCs.test.ts): V2's real
// AddTacticalDCs emits one table row per DC object currently granted by a
// trained feat/enhancement (CDCPane's active buttons), not a flat 13-entry
// TacticalType enumeration. These tests now exercise the section through
// that same active-DC-catalogue API; the fixed-enumeration assertions this
// file used to make no longer apply to V2's actual behaviour.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { Feat } from '../types/ddo'

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

const tripFeat: Feat = {
  Name: 'Trip',
  DC: { Name: 'Trip', DCVersus: 'Balance', Amount: 10, ModAbility: 'Strength', Tactical: 'Trip' },
}
const stunFeat: Feat = {
  Name: 'Stunning Blow',
  DC: { Name: 'Stunning Blow', DCVersus: 'Fortitude', Amount: 10, ModAbility: 'Strength', Tactical: 'Stun' },
}

describe('Forum export tacticalDCs section — parity pass X4 (superseded by X16)', () => {
  const tacticalSection = DEFAULT_SECTIONS.find(s => s.id === 'TacticalDCs')!
  const build = { ...emptyBuild(), featChoices: {} }

  it('returns empty array when no context catalogues are supplied', () => {
    const stats = mockStats({})
    expect(tacticalSection.emit({ build, stats })).toEqual([])
  })

  it('returns empty array when no feat/enhancement grants an active DC', () => {
    const stats = mockStats({})
    const lines = tacticalSection.emit({
      build, stats, allFeats: [tripFeat], allTrees: [], allClasses: [], allRaces: [],
    })
    expect(lines).toEqual([])
  })

  it('emits a table row for a trained feat carrying a DC (Trip)', () => {
    const stats = mockStats({ 'ability.Strength': 16 })
    const withTrip = { ...build, featChoices: { slot1: 'Trip' } }
    const lines = tacticalSection.emit({
      build: withTrip, stats, allFeats: [tripFeat], allTrees: [], allClasses: [], allRaces: [],
    })
    expect(lines[0]).toBe('[SIZE=3][TABLE]')
    expect(lines[1]).toBe('[TR][TD]Tactical DC[/TD][TD]Value[/TD][TD]Evaluation[/TD][/TR]')
    expect(lines.some(l => l.includes('[TD]Trip[/TD]'))).toBe(true)
    expect(lines[lines.length - 1]).toBe('[/TABLE][/SIZE]')
  })

  it('emits multiple rows for multiple trained DC-granting feats', () => {
    const stats = mockStats({ 'ability.Strength': 16 })
    const withBoth = { ...build, featChoices: { slot1: 'Trip', slot2: 'Stunning Blow' } }
    const lines = tacticalSection.emit({
      build: withBoth, stats, allFeats: [tripFeat, stunFeat], allTrees: [], allClasses: [], allRaces: [],
    })
    expect(lines.some(l => l.includes('[TD]Trip[/TD]'))).toBe(true)
    expect(lines.some(l => l.includes('[TD]Stunning Blow[/TD]'))).toBe(true)
  })
})
