// X21: the forum export's SelfAndPartyBuffs section must print the Buffs
// pane's list (V2 `Life::SelfAndPartyBuffs()`, V3 `build.selfBuffs`), not
// the stance toggles in `build.activeBuffs`.
//
// V2 ForumExportDlg.cpp:874-887 AddSelfAndPartyBuffs:
//   "Self and Party Buffs" / "[HR][/HR]" / one buff name per line.

import { describe, expect, it } from 'vitest'
import { emitForumExport, DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { OptionalBuff, Stance } from '../types/ddo'

const section = DEFAULT_SECTIONS.find(s => s.id === 'SelfAndPartyBuffs')!
const stances: Stance[] = [{ Name: 'Power Attack', Group: 'Combat' } as unknown as Stance]
const buffs: OptionalBuff[] = [
  { Name: 'Haste' } as unknown as OptionalBuff,
  { Name: 'Greater Heroism' } as unknown as OptionalBuff,
]

describe('X21 - SelfAndPartyBuffs reads build.selfBuffs', () => {
  it('emits every toggled self/party buff in V2 format', () => {
    const build = { ...emptyBuild(), selfBuffs: ['Haste', 'Greater Heroism'] }
    const lines = section.emit({ build, stats: null, allStances: stances, allSelfBuffs: buffs })
    expect(lines).toEqual(['Self and Party Buffs', '[HR][/HR]', 'Haste', 'Greater Heroism'])
  })

  it('does not print stance toggles as buffs', () => {
    const build = { ...emptyBuild(), activeBuffs: ['Power Attack'], selfBuffs: [] }
    const text = emitForumExport({ build, stats: null, allStances: stances, allSelfBuffs: buffs })
    expect(text).not.toMatch(/Self and Party Buffs/)
    expect(text).toMatch(/Active Stances/)
  })

  it('works without the buff catalogue loaded', () => {
    const build = { ...emptyBuild(), selfBuffs: ['Rage'] }
    const lines = section.emit({ build, stats: null })
    expect(lines).toEqual(['Self and Party Buffs', '[HR][/HR]', 'Rage'])
  })

  it('tolerates a build saved before selfBuffs existed', () => {
    const build = { ...emptyBuild(), selfBuffs: undefined as unknown as string[] }
    expect(section.emit({ build, stats: null })).toEqual([])
  })
})
