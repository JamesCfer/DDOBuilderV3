// X23: the forum export's ActiveStances section must label each selected
// stance with its stance group, one per line, as V2 does.
//
// V2 ForumExportDlg.cpp:846-872 AddActiveStances:
//   "Active Stances" / "[HR][/HR]" / "GroupName: StanceName" ... / "[HR][/HR]"
// Group order follows CStancesPane: "User" (no <Group>) first, then groups in
// first-appearance order through Stances.xml, "Auto" last.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { Stance } from '../types/ddo'

const section = DEFAULT_SECTIONS.find(s => s.id === 'ActiveStances')!
const st = (Name: string, Group?: string) => ({ Name, Group }) as unknown as Stance
const catalogue: Stance[] = [
  st('Sword and Board', 'Auto'),
  st('Power Attack', 'Combat'),
  st('Reaper', 'Difficulty'),
  st('Combat Expertise', 'Combat'),
  st('Manyshot'),
]

describe('X23 - ActiveStances prints V2 group labels', () => {
  it('emits one "Group: Stance" line per selected stance in V2 group order', () => {
    const build = {
      ...emptyBuild(),
      activeBuffs: ['Reaper', 'Combat Expertise', 'Sword and Board', 'Manyshot', 'Power Attack'],
    }
    expect(section.emit({ build, stats: null, allStances: catalogue })).toEqual([
      'Active Stances',
      '[HR][/HR]',
      'User: Manyshot',
      'Combat: Power Attack',
      'Combat: Combat Expertise',
      'Difficulty: Reaper',
      'Auto: Sword and Board',
      '[HR][/HR]',
    ])
  })

  it('skips toggles that are not catalogued stances', () => {
    const build = { ...emptyBuild(), activeBuffs: ['Not A Stance'] }
    expect(section.emit({ build, stats: null, allStances: catalogue })).toEqual([])
  })

  it('lists toggles without group labels when no catalogue is loaded', () => {
    const build = { ...emptyBuild(), activeBuffs: ['Power Attack'] }
    expect(section.emit({ build, stats: null })).toEqual(
      ['Active Stances', '[HR][/HR]', 'Power Attack', '[HR][/HR]'])
  })
})
