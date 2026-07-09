// X9 — forum export FeatSelections/FeatSelectionsNoSkills should be a
// per-level [TABLE] (Level | Class(classLevel) | Feats), not a flat sorted
// list of build.featChoices.
//
// V2 sources: ForumExportDlg.cpp:622-660 (AddFeatSelections),
// ForumExportDlg.cpp:1992+ (GetLevelEntries).

import { describe, expect, it } from 'vitest'
import { emitForumExport, DEFAULT_SECTIONS } from '../lib/export/sections'
import { aggregateLevelClasses } from '../lib/levelProgression'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'

const mockFighter: DDOClass = {
  Name: 'Fighter',
  SkillPoints: 2,
  HitPoints: 10,
  ClassSkill: ['Intimidate', 'Jump'],
  FeatSlot: [{ Level: 2, FeatType: 'Fighter Bonus Feat' }],
}

function fakeStats(): BuildStats {
  return {
    resolve: () => ({ total: 0, bonuses: [] }),
    total: () => 0,
    keys: () => [],
    weapon: null,
    armorMaxDex: null,
  } as unknown as BuildStats
}

function makeBuild(levels: string[]): CharacterBuild {
  const b = emptyBuild()
  b.levelClasses = levels
  b.classes = aggregateLevelClasses(levels)
  b.totalLevel = levels.filter(Boolean).length
  return b
}

describe('X9 — feat selections forum export as a per-level table', () => {
  it('emits one [TR] per character level with Level | Class(classLevel) | Feats', () => {
    const build = makeBuild(Array(3).fill('Fighter'))
    // Universal heroic slot at level 1 (buildSlots key: heroic-1)
    build.featChoices['heroic-1'] = 'Toughness'
    // Fighter Bonus Feat slot at class level 2 -> character level 2
    build.featChoices['Fighter-2-Fighter Bonus Feat-0'] = 'Power Attack'

    const out = emitForumExport(
      { build, stats: fakeStats(), allClasses: [mockFighter], allRaces: [] },
      DEFAULT_SECTIONS,
    )

    expect(out).toContain('[b]Class and Feat Selection[/b]:')
    expect(out).toContain('[TR][TD]Level[/TD][TD]Class[/TD][TD]Feats[/TD][/TR]')
    // Level 1 row: Fighter is at class-level 1 here.
    expect(out).toContain('[TR][TD]1[/TD][TD]Fighter(1)[/TD][TD]Heroic: Toughness[/TD][/TR]')
    // Level 2 row: Fighter is at class-level 2, carries the bonus feat.
    expect(out).toContain('[TR][TD]2[/TD][TD]Fighter(2)[/TD][TD]Fighter Bonus Feat: Power Attack[/TD][/TR]')
    // Level 3 has an untrained universal heroic slot -> "Empty Feat Slot".
    expect(out).toContain('[TR][TD]3[/TD][TD]Fighter(3)[/TD][TD]Heroic: Empty Feat Slot[/TD][/TR]')
  })

  it('lists class and cross-class skill ranks trained at each level', () => {
    const build = makeBuild(['Fighter'])
    build.skillRanksByLevel = { 1: { Intimidate: 4, Spot: 2 } }

    const out = emitForumExport(
      { build, stats: fakeStats(), allClasses: [mockFighter], allRaces: [] },
      DEFAULT_SECTIONS,
    )
    const section = out.split('[b]Class and Feat Selection[/b]:')[1]?.split('\n\n')[0] ?? ''
    expect(section).toContain('Class Skills: Intimidate(4)')
    expect(section).toContain('Cross Class Skills: Spot(2)')
  })

  it('FeatSelectionsNoSkills omits the skill-rank rows but keeps feat rows', () => {
    const build = makeBuild(['Fighter'])
    build.featChoices['heroic-1'] = 'Toughness'
    build.skillRanksByLevel = { 1: { Intimidate: 4 } }

    const out = emitForumExport(
      { build, stats: fakeStats(), allClasses: [mockFighter], allRaces: [] },
      DEFAULT_SECTIONS,
    )
    const section = out.split('[b]Class and Feat Selection (no skills)[/b]:')[1]?.split('\n\n')[0] ?? ''
    expect(section).toContain('Heroic: Toughness')
    expect(section).not.toContain('Class Skills:')
  })
})
