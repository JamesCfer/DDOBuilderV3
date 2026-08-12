// Parity pass X16 — forum-export "Tactical DCs" section rewritten to match
// V2's real per-DC table.
//
// V2 (ForumExportDlg.cpp:1734-1756 AddTacticalDCs) wraps a [SIZE=3][TABLE]
// with 3 columns (Tactical DC / Value / Evaluation) and emits ONE ROW PER
// DC OBJECT currently granted by a trained feat or enhancement (CDCPane's
// active button list, built from DC.h/DC.cpp — Trip, Sunder, Stunning
// Blow, Intimidate/Diplomacy/Bluff from the universal "Attack" feat,
// Silver Flame Exorcism, and ~140 tree-granted tactical DCs). Each row's
// Value/Evaluation text is DC::CalculateDC / DC::DCBreakdown, verbatim.
//
// V3's old `tacticalDCs` section (closed by pass X4) emitted flat
// "  Label: +N" lines for a fixed 13-entry TacticalType enumeration — an
// entirely different (and V2-inaccurate) shape, since V2 has no such
// umbrella listing at all; DCs are per-object, not per-TacticalType.
//
// This pass adds `lib/dcBreakdown.ts` (active-DC collection + the
// CalculateDC/DCBreakdown formulas) and rewrites the section to use it.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { collectActiveDCs, calculateDCValue, dcVersusText, dcEvaluationText } from '../lib/dcBreakdown'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { CharacterBuild, DDOClass, EnhancementTree, Feat } from '../types/ddo'

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

const build0 = (): CharacterBuild => ({ ...emptyBuild(), featChoices: {} })

describe('parity pass X16 — tacticalDCs forum-export section', () => {
  const tacticalSection = DEFAULT_SECTIONS.find(s => s.id === 'TacticalDCs')!

  it('emits [SIZE=3][TABLE] with the Tactical DC/Value/Evaluation header', () => {
    const tripFeat: Feat = {
      Name: 'Trip',
      DC: { Name: 'Trip', DCVersus: 'Balance', Amount: 10, ModAbility: 'Strength', Tactical: 'Trip' },
    }
    const build = { ...build0(), featChoices: { slot: 'Trip' } }
    const stats = mockStats({ 'ability.Strength': 16 })
    const lines = tacticalSection.emit({
      build, stats, allFeats: [tripFeat], allTrees: [], allClasses: [], allRaces: [],
    })
    expect(lines[0]).toBe('[SIZE=3][TABLE]')
    expect(lines[1]).toBe('[TR][TD]Tactical DC[/TD][TD]Value[/TD][TD]Evaluation[/TD][/TR]')
    expect(lines[lines.length - 1]).toBe('[/TABLE][/SIZE]')
  })

  it('reproduces DC::DCBreakdown\'s exact Value/Evaluation text for a ModAbility+Tactical DC', () => {
    // V2 Feats.xml "Trip": DCVersus=Balance, Amount=10, ModAbility=Strength, Tactical=Trip.
    const dc = { Name: 'Trip', DCVersus: 'Balance', Amount: 10, ModAbility: 'Strength' as const, Tactical: 'Trip' }
    const stats = mockStats({ 'ability.Strength': 16, 'tacticalDC.All': 1, 'tacticalDC.Trip': 2 })
    const ctx = { build: build0(), stats, allClasses: [] }
    // Str 16 -> mod +3; tacticalDC = All(1) + Trip(2) = 3; total = 10 + 3 + 3 = 16.
    expect(calculateDCValue(dc, 1, ctx)).toBe(16)
    expect(dcVersusText(dc, 1, ctx)).toBe('Balance vs 16')
    expect(dcEvaluationText(dc, 1, ctx)).toBe('10 + Str Mod(3) + Trip(3)')
  })

  it('includes the literal Other text in both the Value and Evaluation columns (Intimidate)', () => {
    // V2 Feats.xml "Attack" feat's Intimidate DC: DCVersus is flavour text, Other="d20".
    const dc = { Name: 'Intimidate', DCVersus: '10+HD+Wis Mod', Other: 'd20', Skill: 'Intimidate' }
    const stats = mockStats({ 'skill.Intimidate': 12 })
    const ctx = { build: build0(), stats, allClasses: [] }
    expect(calculateDCValue(dc, 1, ctx)).toBe(12)
    expect(dcVersusText(dc, 1, ctx)).toBe('10+HD+Wis Mod vs d20 + 12')
    expect(dcEvaluationText(dc, 1, ctx)).toBe('d20 + Intimidate(12)')
  })

  it('resolves ClassLevel-scaled DCs against trained class levels (Silver Flame Exorcism)', () => {
    const dc = { Name: 'Silver Flame Exorcism', DCVersus: 'Will', Amount: 10, ModAbility: 'Charisma' as const, ClassLevel: 'Cleric' }
    const build: CharacterBuild = {
      ...build0(),
      classes: [{ name: 'Cleric', levels: 5 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 5 }, () => 'Cleric'),
      totalLevel: 5, epicLevels: 0, legendaryLevels: 0,
    }
    const stats = mockStats({ 'ability.Charisma': 14 })
    const ctx = { build, stats, allClasses: [{ Name: 'Cleric' } as DDOClass] }
    // Cha 14 -> mod +2; class levels = 5. Total = 10 + 2 + 5 = 17.
    expect(calculateDCValue(dc, 1, ctx)).toBe(17)
    expect(dcEvaluationText(dc, 1, ctx)).toBe('10 + Cha Mod(2) + Cleric(5)')
  })

  it('reproduces the V2 quirk where a multi-FullAbility Max(...) block leaves no separator before the next component', () => {
    // DC.cpp DCBreakdown's `size() > 1` FullAbility branch never clears `first`.
    const dc = { Name: 'Kata of Ice', DCVersus: 'Will', FullAbility: ['Strength', 'Wisdom'] as const, Skill: 'Balance' }
    const stats = mockStats({ 'ability.Strength': 10, 'ability.Wisdom': 18, 'skill.Balance': 6 })
    const ctx = { build: build0(), stats, allClasses: [] }
    expect(dcEvaluationText(dc, 1, ctx)).toBe('Max(Str(10), Wis(18))Balance(6)')
  })

  it('picks the highest of multiple ModAbility values (Max Mod)', () => {
    const dc = { Name: 'Two-Stat DC', DCVersus: 'Fortitude', ModAbility: ['Strength', 'Wisdom'] as const }
    const stats = mockStats({ 'ability.Strength': 12, 'ability.Wisdom': 18 })
    const ctx = { build: build0(), stats, allClasses: [] }
    // Str mod +1, Wis mod +4 -> picks +4.
    expect(calculateDCValue(dc, 1, ctx)).toBe(4)
  })

  it('indexes Amount by stack count and stacks DCs granted by two distinct sources', () => {
    const dcTemplate = { Name: 'Shared DC', Icon: 'shared', DCVersus: 'Fortitude', Amount: '10 20' }
    const featA: Feat = { Name: 'Source A', DC: { ...dcTemplate } }
    const featB: Feat = { Name: 'Source B', DC: { ...dcTemplate } }
    const build = { ...build0(), featChoices: { s1: 'Source A', s2: 'Source B' } }
    const active = collectActiveDCs(build, [featA, featB], [], [], [], [])
    expect(active).toHaveLength(1)
    expect(active[0].stacks).toBe(2)
    const stats = mockStats({})
    const ctx = { build, stats, allClasses: [] }
    // stacks=2 -> Amount[1] = 20 (V2 0-based m_stacks-1 indexing).
    expect(calculateDCValue(active[0].dc, active[0].stacks, ctx)).toBe(20)
  })

  it('collects DCs from a trained enhancement tree item, honouring its selection', () => {
    const tree: EnhancementTree = {
      Name: 'Rogue: Assassin',
      EnhancementTreeItem: [{
        Name: 'Heartseeker Poison',
        Selector: [{
          EnhancementSelection: [
            { Name: 'Heartseeker Poison', DC: { Name: 'Assassin: Heartseeker Poison', DCVersus: 'Fortitude', Amount: 10, ModAbility: 'Intelligence' } },
            { Name: 'Ice Chill Poison', DC: { Name: 'Assassin: Ice Chill Poison', DCVersus: 'Fortitude', Amount: 10, ModAbility: 'Intelligence' } },
          ],
        }],
      }],
    }
    const build = {
      ...build0(),
      enhancementChoices: { 'Rogue: Assassin': { 'Heartseeker Poison': 1 } },
      enhancementSelections: { 'Rogue: Assassin': { 'Heartseeker Poison': 'Ice Chill Poison' } },
    }
    const active = collectActiveDCs(build, [], [tree], [], [], [])
    expect(active).toHaveLength(1)
    expect(active[0].dc.Name).toBe('Assassin: Ice Chill Poison')
  })

  it('returns no rows when no feat or enhancement currently grants a DC', () => {
    const lines = tacticalSection.emit({
      build: build0(), stats: mockStats({}), allFeats: [], allTrees: [], allClasses: [], allRaces: [],
    })
    expect(lines).toEqual([])
  })

  it('returns no rows when required catalogues are missing from the context', () => {
    const lines = tacticalSection.emit({ build: build0(), stats: mockStats({}) })
    expect(lines).toEqual([])
  })
})
