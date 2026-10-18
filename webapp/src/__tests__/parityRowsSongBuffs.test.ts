// V2's "Song Breakdowns" lines (Breakdown_SongACBonus .. Breakdown_SongRepairAmp)
// and "Total AC % Bonus" (Breakdown_TotalACPercent) are BreakdownItemSimple
// pools of their matching effects. V3 pools them under song.* and ac.percent.
// v2calc emits them; the referee now compares them.

import { describe, it, expect } from 'vitest'
import { buildParityRows, type OracleJson } from '../lib/oracleParityRows'
import type { BuildStats } from '../lib/buildStats'
import type { CharacterBuild } from '../types/ddo'

const PAIRS: Record<string, string> = {
  totalACPercent: 'ac.percent', songAC: 'song.ac', songAttack: 'song.attack', songDamage: 'song.damage',
  songDoublestrike: 'song.doublestrike', songDoubleshot: 'song.doubleshot', songSpellPower: 'song.sp',
  songSpellPen: 'song.spellPen', songCasterLevel: 'song.cl', songSkill: 'song.skill', songPRR: 'song.prr',
  songMRR: 'song.mrr', songHealAmp: 'song.healAmp', songNegHealAmp: 'song.negHealAmp', songRepairAmp: 'song.repairAmp',
}

describe('referee compares the song buff lines and Total AC %', () => {
  it('pairs each V2 line with its V3 pool', () => {
    const vals: Record<string, number> = {}
    Object.values(PAIRS).forEach((k, i) => { vals[k] = i + 3 })
    const stats = {
      resolve: (k: string) => ({ total: vals[k] ?? 0, bonuses: [] }),
      total: (k: string) => vals[k] ?? 0,
      keys: () => Object.keys(vals), weapon: null, armorMaxDex: null,
    } as unknown as BuildStats
    const build = { classes: [], totalLevel: 20, epicLevels: 0, legendaryLevels: 0 } as unknown as CharacterBuild
    const breakdowns: Record<string, number> = {}
    for (const [ok, v3k] of Object.entries(PAIRS)) breakdowns[ok] = vals[v3k]
    const rows = buildParityRows({ breakdowns } as OracleJson, stats, build, {})
    for (const [ok, v3k] of Object.entries(PAIRS)) {
      expect(rows.find(r => r.stat === ok), ok).toMatchObject({ v2: vals[v3k], v3: vals[v3k] })
    }
  })
})
