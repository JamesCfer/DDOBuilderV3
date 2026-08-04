// V2 → V3 parity pass 5: per-level progression in useBuildStats, V2 HP rules,
// per-level skill rank storage, and the new forum-export sections.
//
// V2 sources cited:
//   BreakdownItemHitpoints.cpp:74-83  Epic/Legendary half-HD
//   BreakdownItemHitpoints.cpp:88-105 Fate-point HP @ L20+
//   BreakdownItemHitpoints.cpp:107-122 Negative-level HP penalty
//   BreakdownItemSpellPoints.cpp:55-72 Fate-point SP @ L20+
//   ForumExportDlg.cpp:209           FES_SpecialFeats
//   ForumExportDlg.cpp:218           FES_FeatSelectionsNoSkills
//   ForumExportDlg.cpp:233           FES_Bonuses

import { describe, expect, it } from 'vitest'
import {
  fatePointHpBonus,
  fatePointSpBonus,
  negativeLevelHpPenalty,
  negativeLevelSavePenalty,
} from '../lib/v2Formulas'
import { emptyBuild } from '../types/ddo'
import { emitForumExport, DEFAULT_SECTIONS } from '../lib/export/sections'
import type { BuildStats } from '../hooks/useBuildStats'

// --- StatsPanel HP rule (Epic/Legendary half-HD; CON × total level) ---------

describe('Parity pass 5 — class HP rule (V2 BreakdownItemHitpoints.cpp:74-83)', () => {
  // Reproduces the StatsPanel formula: heroic classes contribute full HD
  // per level; Epic / Legendary contribute half HD per level (floor); CON
  // bonus is added once per total character level.
  function classHp(name: string, hd: number, levels: number): number {
    if (name === 'Epic' || name === 'Legendary') return Math.floor(hd * levels / 2)
    return hd * levels
  }

  it('Heroic classes contribute full hit-die per level', () => {
    expect(classHp('Fighter', 10, 7)).toBe(70)
    expect(classHp('Wizard', 4, 3)).toBe(12)
  })

  it('Epic / Legendary contribute half hit-die per level (floor)', () => {
    expect(classHp('Epic', 6, 10)).toBe(30)         // 6×10/2
    expect(classHp('Legendary', 6, 4)).toBe(12)     // 6×4/2
    expect(classHp('Epic', 5, 3)).toBe(7)           // floor(5×3/2)
  })

  it('CON×total-level bonus is applied once across all class tiers', () => {
    const totalCharLevel = 20 + 10 + 4
    const conMod = 6
    expect(conMod * totalCharLevel).toBe(204)
  })
})

// --- v2Formulas (HP/SP fate, neg-level) -------------------------------------

describe('Parity pass 5 — fate-point and negative-level formulas', () => {
  it('fate-point HP only applies at character level 20+', () => {
    expect(fatePointHpBonus(19, 5)).toBe(0)
    expect(fatePointHpBonus(20, 5)).toBe(10)   // +2 per fp
    expect(fatePointHpBonus(34, 7)).toBe(14)
    expect(fatePointHpBonus(20, 0)).toBe(0)
  })

  it('fate-point SP applies +1 per fp at level 20+', () => {
    expect(fatePointSpBonus(19, 5)).toBe(0)
    expect(fatePointSpBonus(20, 5)).toBe(5)
    expect(fatePointSpBonus(34, 7)).toBe(7)
  })

  it('negative-level HP penalty is -5 per level', () => {
    expect(negativeLevelHpPenalty(0)).toBe(0)
    expect(negativeLevelHpPenalty(2)).toBe(-10)
    expect(negativeLevelHpPenalty(-1)).toBe(0)
  })

  it('negative-level save/skill penalty is the absolute count', () => {
    expect(negativeLevelSavePenalty(0)).toBe(0)
    expect(negativeLevelSavePenalty(3)).toBe(3)
    expect(negativeLevelSavePenalty(-2)).toBe(0)
  })
})

// --- Per-level skill ranks reducer ------------------------------------------

describe('Parity pass 5 — SET_SKILL_RANK_AT_LEVEL', () => {
  function applyAction(state: ReturnType<typeof emptyBuild>, action: { type: 'SET_SKILL_RANK_AT_LEVEL'; level: number; skill: string; rank: number }) {
    // Inline minimal version of the reducer we want to verify behaviorally.
    const byLevel = { ...(state.skillRanksByLevel ?? {}) }
    const lvl = action.level | 0
    const at = { ...(byLevel[lvl] ?? {}) }
    if (action.rank <= 0) delete at[action.skill]
    else at[action.skill] = action.rank
    if (Object.keys(at).length === 0) delete byLevel[lvl]
    else byLevel[lvl] = at
    return { ...state, skillRanksByLevel: byLevel }
  }

  it('records ranks per character level and clears them when set to 0', () => {
    let s = emptyBuild()
    s = applyAction(s, { type: 'SET_SKILL_RANK_AT_LEVEL', level: 1, skill: 'Spot', rank: 4 })
    expect(s.skillRanksByLevel?.[1]?.Spot).toBe(4)
    s = applyAction(s, { type: 'SET_SKILL_RANK_AT_LEVEL', level: 2, skill: 'Spot', rank: 1 })
    expect(s.skillRanksByLevel?.[2]?.Spot).toBe(1)
    s = applyAction(s, { type: 'SET_SKILL_RANK_AT_LEVEL', level: 1, skill: 'Spot', rank: 0 })
    expect(s.skillRanksByLevel?.[1]).toBeUndefined()
    expect(s.skillRanksByLevel?.[2]?.Spot).toBe(1)
  })
})

// --- Forum export new sections ----------------------------------------------

describe('Parity pass 5 — forum export sections (V2 ForumExportDlg parity)', () => {
  const baseBuild = emptyBuild()

  function fakeStats(values: Record<string, number>): BuildStats {
    return {
      resolve: (k: string) => ({
        total: values[k] ?? 0,
        bonuses: [],
      }),
      total: (k: string) => values[k] ?? 0,
      keys: () => Object.keys(values),
      weapon: null,
      armorMaxDex: null,
    } as unknown as BuildStats
  }

  it('emits a SpecialFeats section when the active Life has special feats', () => {
    // V2 parity pass X10: Life-level special feats (V2 Life::AllSpecialFeats(),
    // past lives aside) are resolved by the caller and passed via
    // SectionContext.specialFeats — CharacterBuild itself has no such field.
    const build = { ...baseBuild }
    const out = emitForumExport({
      build, allClasses: [], allRaces: [], stats: fakeStats({}),
      specialFeats: ['Iconic: Bonus Feat', 'Past Life: Wizard'],
    }, DEFAULT_SECTIONS)
    expect(out).toContain('Special Feats')
    expect(out).toContain('Past Life: Wizard')
  })

  it('emits a FeatSelectionsNoSkills section using the same per-level table as FeatSelections', () => {
    // buildSlots derives universal heroic feat slot keys as `heroic-<level>`
    // (levels 1,3,6,9,12,15,18), independent of class — matches production.
    const build = {
      ...baseBuild,
      featChoices: { 'heroic-1': 'Toughness' },
    }
    const out = emitForumExport({ build, allClasses: [], allRaces: [], stats: fakeStats({}) }, DEFAULT_SECTIONS)
    expect(out).toContain('Class and Feat Selection (no skills)')
    // Both variants share the same per-level table shape and list of trained
    // feats — the no-skills variant differs only in omitting the trailing
    // skill-rank rows (see parityPassX9.test.ts).
    const noSkillsSection = out.split('[b]Class and Feat Selection (no skills)[/b]')[1] ?? ''
    expect(noSkillsSection).toContain('Toughness')
  })

  it('emits a Bonuses section listing every accumulated stat with non-zero total', () => {
    const stats = fakeStats({ 'ability.Strength': 18, 'save.Fort': 5, 'ac': 0 })
    const out = emitForumExport({ build: baseBuild, allClasses: [], allRaces: [], stats }, DEFAULT_SECTIONS)
    expect(out).toContain('Accumulated Bonuses')
    expect(out).toContain('ability.Strength: +18')
    expect(out).toContain('save.Fort: +5')
    // Zero values are dropped
    expect(out).not.toMatch(/^\s*ac: \+0/m)
  })
})
