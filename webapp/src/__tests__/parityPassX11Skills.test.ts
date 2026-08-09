// Parity pass X11 — AddSkills has no V3 equivalent.
//
// V2 (ForumExportDlg.cpp:889-1027) emits a `[code]` monospace grid: a "Skill
// Points" row (points available per character level), a level-number header,
// one row per skill showing ranks trained AT EACH heroic level (cross-class
// spends displayed in ½-rank multiples of the raw per-level spend —
// `skillRanks[skill]/2`, V2's literal 0xBD "½" byte), Ranks/Tome/Buffed
// totals (at the build's final level), and a trailing "Available Points"
// row. V3's `skills` section (sections.ts) only printed whole-build totals
// ("skill: N ranks (+M)") with no per-level breakdown at all.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import { aggregateLevelClasses } from '../lib/levelProgression'
import type { CharacterBuild, DDOClass, Race } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'

const mockFighter: DDOClass = {
  Name: 'Fighter',
  SkillPoints: 2,
  ClassSkill: ['Jump', 'Intimidate'],
}

const allClasses: DDOClass[] = [mockFighter]
const allRaces: Race[] = [{ Name: 'Human' }]

function mockStats(
  skillData: Record<string, { ranks?: number; tome?: number; total?: number }>,
): BuildStats {
  return {
    total: (key: string) => {
      const m = key.match(/^skill\.(.+)$/)
      if (!m) return 0
      return skillData[m[1]]?.total ?? 0
    },
    resolve: (key: string) => {
      const m = key.match(/^skill\.(.+)$/)
      const d = m ? skillData[m[1]] : undefined
      if (!d) return { total: 0, bonuses: [] as ResolvedBonus[] }
      const bonuses: ResolvedBonus[] = []
      if (d.ranks) bonuses.push({ value: d.ranks, type: 'Ranks', source: 'Skill ranks', active: true })
      if (d.tome) bonuses.push({ value: d.tome, type: 'Tome', source: 'tome', active: true })
      return { total: d.total ?? 0, bonuses }
    },
    keys: () => [],
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

function makeBuild(): CharacterBuild {
  const b = emptyBuild()
  const levels = ['Fighter', 'Fighter']
  b.levelClasses = levels
  b.classes = aggregateLevelClasses(levels)
  b.totalLevel = 2
  b.baseAbilities = { ...b.baseAbilities, Intelligence: 10 }
  b.skillRanksByLevel = {
    1: { Jump: 2, Balance: 1 },
    2: {},
  }
  return b
}

const section = DEFAULT_SECTIONS.find(s => s.id === 'Skills')!

describe('Forum export skills section — per-level grid (parity pass X11)', () => {
  it('section exists', () => {
    expect(section).toBeDefined()
  })

  it('returns nothing when the class/race catalogues are unavailable', () => {
    const build = makeBuild()
    const lines = section.emit({ build, stats: mockStats({}) })
    expect(lines).toEqual([])
  })

  it('wraps the grid in [code]/[/code]', () => {
    const build = makeBuild()
    const lines = section.emit({ build, stats: mockStats({}), allClasses, allRaces })
    expect(lines[0]).toBe('[code]')
    expect(lines[lines.length - 1]).toBe('[/code]')
  })

  it('the border row is 35 dashes plus 3 per heroic level', () => {
    const build = makeBuild()
    const lines = section.emit({ build, stats: mockStats({}), allClasses, allRaces })
    expect(lines[1]).toBe('-'.repeat(35) + '---'.repeat(2))
  })

  it('Skill Points row shows the ×4 first-level multiplier', () => {
    const build = makeBuild()
    const lines = section.emit({ build, stats: mockStats({}), allClasses, allRaces })
    // Fighter base 2 SkillPoints, INT 10 (mod 0) -> 2/level, ×4 at level 1
    expect(lines[2]).toBe('Skill Points    ' + '  8' + '  2')
  })

  it('Skill Name header row lists 2-digit zero-padded level numbers', () => {
    const build = makeBuild()
    const lines = section.emit({ build, stats: mockStats({}), allClasses, allRaces })
    expect(lines[3]).toBe('Skill Name       ' + '01 ' + '02 ' + ' Ranks Tome Buffed')
  })

  it('a class-skill row shows the raw per-level trained count', () => {
    const build = makeBuild()
    const lines = section.emit({
      build,
      stats: mockStats({ Jump: { ranks: 2, tome: 1, total: 5 } }),
      allClasses,
      allRaces,
    })
    const jumpLine = lines.find(l => l.startsWith('Jump'))!
    expect(jumpLine).toBe('Jump            ' + '  2' + '   ' + '    2.0' + '    1' + '    5.0')
  })

  it('a cross-class row shows the ½-rank multiple of the raw spend', () => {
    const build = makeBuild()
    const lines = section.emit({
      build,
      stats: mockStats({ Balance: { ranks: 0.5, total: 0.5 } }),
      allClasses,
      allRaces,
    })
    const balanceLine = lines.find(l => l.startsWith('Balance'))!
    // 1 point spent on a cross-class skill at level 1 -> "½", blank at level 2
    expect(balanceLine).toBe('Balance         ' + '  ½' + '   ' + '    0.5' + '    0' + '    0.5')
  })

  it('an untrained skill row is entirely blank cells with zero totals', () => {
    const build = makeBuild()
    const lines = section.emit({ build, stats: mockStats({}), allClasses, allRaces })
    const swimLine = lines.find(l => l.startsWith('Swim'))!
    expect(swimLine).toBe('Swim            ' + '   ' + '   ' + '    0.0' + '    0' + '    0.0')
  })

  it('lists all 21 V2 skills in V2 enum order', () => {
    const build = makeBuild()
    const lines = section.emit({ build, stats: mockStats({}), allClasses, allRaces })
    const skillLines = lines.slice(5, 5 + 21)
    expect(skillLines[0].startsWith('Balance')).toBe(true)
    expect(skillLines[20].startsWith('Use Magic Device')).toBe(true)
  })

  it('Available Points row is available minus spent, per level', () => {
    const build = makeBuild()
    const lines = section.emit({
      build,
      stats: mockStats({ Jump: { ranks: 2 }, Balance: { ranks: 0.5 } }),
      allClasses,
      allRaces,
    })
    const availLine = lines.find(l => l.startsWith('Available Points'))!
    // level 1: 8 available - 3 spent (2 Jump + 1 Balance point) = 5; level 2: 2 - 0 = 2
    expect(availLine).toBe('Available Points' + '  5' + '  2')
  })
})
