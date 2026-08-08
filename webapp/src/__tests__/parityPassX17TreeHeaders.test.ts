// Parity pass X17 — Enhancement/Destiny/Reaper tree export sections missing
// headers + tier labels.
//
// V2 (ForumExportDlg.cpp:1216-1451) wraps each of the three top-level
// sections in a colored "[COLOR=rgb(184, 49, 47)][SIZE=6]" header — an AP
// total for Enhancements ("Enhancements: 80 APs, Racial N, Universal N"),
// a Destiny Point total for Epic Destinies — then per-tree
// "[COLOR=rgb(65, 168, 95)][SIZE=5]TreeName - Points spent: N[/SIZE][/COLOR]"
// blocks separated by "[HR][/HR]", and prefixes each enhancement with its
// tier ("Core1 ".."Core6 " / "Tier1 ".."Tier6 ") plus a " - N Ranks" suffix
// for multi-rank items. V3's `enhancements`/`epicDestinies`/`reaperTrees`
// sections (sections.ts) used plain "[b]...[/b]:" headers with no AP totals,
// tier labels, coloring, or Points-spent line.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { EnhancementTree } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'

function mockStats(totals: Record<string, number>): BuildStats {
  return {
    total: (key: string) => totals[key] ?? 0,
    resolve: (key: string) => ({ total: totals[key] ?? 0, bonuses: [] as ResolvedBonus[] }),
    keys: () => Object.keys(totals),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

const TREE: EnhancementTree = {
  Name: 'Test Tree',
  EnhancementTreeItem: [
    { Name: 'Core Ability', InternalName: 'CoreAbility', XPosition: 2, YPosition: 0, Ranks: 1, CostPerRank: '1' },
    { Name: 'Ranked Boon', InternalName: 'RankedBoon', XPosition: 0, YPosition: 1, Ranks: 3, CostPerRank: '1 1 1' },
    {
      Name: 'Choice Boon', InternalName: 'ChoiceBoon', XPosition: 0, YPosition: 2, Ranks: 1, CostPerRank: '2',
      Selector: [{ EnhancementSelection: [{ Name: 'Option A' }, { Name: 'Option B' }] }],
    },
  ],
}

const enhSection = DEFAULT_SECTIONS.find(s => s.id === 'Enhancements')!
const destinySection = DEFAULT_SECTIONS.find(s => s.id === 'EpicDestinyTree')!
const reaperSection = DEFAULT_SECTIONS.find(s => s.id === 'ReaperTrees')!

describe('Forum export enhancement/destiny/reaper tree headers (parity pass X17)', () => {
  it('sections exist', () => {
    expect(enhSection).toBeDefined()
    expect(destinySection).toBeDefined()
    expect(reaperSection).toBeDefined()
  })

  it('Enhancements header is the colored "80 APs" line, no bonuses', () => {
    const build = {
      ...emptyBuild(),
      enhancementChoices: { 'Test Tree': { CoreAbility: 1 } },
    }
    const lines = enhSection.emit({ build, stats: mockStats({}), allTrees: [TREE] })
    expect(lines[0]).toBe('[COLOR=rgb(184, 49, 47)][SIZE=6]Enhancements: 80 APs[/SIZE][/COLOR]')
    expect(lines[1]).toBe('[HR][/HR]')
  })

  it('per-tree block: colored header with Points spent, tier prefixes, Ranks suffix, trailing [HR]', () => {
    const build = {
      ...emptyBuild(),
      enhancementChoices: { 'Test Tree': { CoreAbility: 1, RankedBoon: 2, ChoiceBoon: 1 } },
      enhancementSelections: { 'Test Tree': { ChoiceBoon: 'Option B' } },
    }
    const lines = enhSection.emit({ build, stats: mockStats({}), allTrees: [TREE] })
    // Points spent: Core(1) + Ranked rank2(1+1=2) + Choice(2) = 5
    expect(lines).toContain('[COLOR=rgb(65, 168, 95)][SIZE=5]Test Tree - Points spent: 5[/SIZE][/COLOR]')
    expect(lines).toContain('Core3 Core Ability')
    expect(lines).toContain('Tier1 Ranked Boon - 2 Ranks')
    expect(lines).toContain('Tier2 Option B')
    expect(lines[lines.length - 1]).toBe('[HR][/HR]')
  })

  it('unranked single-rank items get no Ranks suffix', () => {
    const build = {
      ...emptyBuild(),
      enhancementChoices: { 'Test Tree': { CoreAbility: 1 } },
    }
    const lines = enhSection.emit({ build, stats: mockStats({}), allTrees: [TREE] })
    expect(lines.some(l => l.includes('Core Ability') && l.includes('Ranks'))).toBe(false)
  })

  it('Enhancements header adds Racial/Universal bonus APs when present', () => {
    const build = {
      ...emptyBuild(),
      enhancementChoices: { 'Test Tree': { CoreAbility: 1 } },
    }
    const feat = {
      Name: 'Past Life: Test Race',
      Effect: [{ Type: 'RAPBonus', Amount: '1' }],
    }
    const lines = enhSection.emit({
      build: { ...build, pastLives: { 'Test Race': 1 } },
      stats: mockStats({}),
      allTrees: [TREE],
      allFeats: [feat as never],
    })
    expect(lines[0]).toBe('[COLOR=rgb(184, 49, 47)][SIZE=6]Enhancements: 80 APs, Racial 1[/SIZE][/COLOR]')
  })

  it('Epic Destinies header shows the Destiny Point total', () => {
    const build = {
      ...emptyBuild(),
      totalLevel: 20,
      epicLevels: 0,
      legendaryLevels: 0,
      destinyChoices: { 'Test Tree': { CoreAbility: 1 } },
    }
    const lines = destinySection.emit({ build, stats: mockStats({}), allTrees: [TREE] })
    expect(lines[0]).toMatch(/^\[COLOR=rgb\(184, 49, 47\)\]\[SIZE=6\]Epic Destinies: \d+ Destiny Points\[\/SIZE\]\[\/COLOR\]$/)
    expect(lines[1]).toBe('[HR][/HR]')
    expect(lines).toContain('[COLOR=rgb(65, 168, 95)][SIZE=5]Test Tree - Points spent: 1[/SIZE][/COLOR]')
  })

  it('Reaper trees header has no AP total; Ranks suffix uses the item MAX ranks (V2 quirk)', () => {
    const build = {
      ...emptyBuild(),
      reaperChoices: { 'Test Tree': { RankedBoon: 1 } },
    }
    const lines = reaperSection.emit({ build, stats: mockStats({}), allTrees: [TREE] })
    expect(lines[0]).toBe('[COLOR=rgb(184, 49, 47)][SIZE=6]Reaper trees:[/SIZE][/COLOR]')
    // rank trained is 1, but V2's reaper-tree emitter prints the ITEM's max
    // Ranks (3), not the trained rank — a verbatim V2 bug.
    expect(lines).toContain('Tier1 Ranked Boon - 3 Ranks')
  })
})
