// Parity pass X12 — forum-export "Consolidated Feats" had different
// semantics from V2, not just formatting.
//
// V2 (ForumExportDlg.cpp:735-844 AddConsolidatedFeats) renders a per-level
// [TABLE] (Level | Class | Feats): each feat-type slot is color-coded
// ("[COLOR=rgb(65, 168, 95)]FeatType: [/COLOR][COLOR=rgb(184, 49, 47)]FeatName
// [/COLOR]", plus a yellow "Alternate: " annotation when set), each
// character-level ability bump gets its own yellow row, and level 1 carries a
// red warning when the build's starting class differs from the race's Iconic
// class. V3's old `consolidatedFeats` just tallied how many times each
// distinct feat choice appeared build-wide across the whole build — entirely
// different content. This rewrites the section to emit V2's per-level table.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { DDOClass, Race } from '../types/ddo'

const FIGHTER: DDOClass = { Name: 'Fighter', SkillPoints: 2 }
const RACE_NO_ICONIC: Race = { Name: 'Human' }

const section = DEFAULT_SECTIONS.find(s => s.id === 'ConsolidatedFeats')!

describe('Forum export Consolidated Feats section (parity pass X12)', () => {
  it('section exists and emits V2s exact table header', () => {
    expect(section).toBeDefined()
    const build = { ...emptyBuild(), totalLevel: 1, classes: [{ name: 'Fighter', levels: 1 }] }
    const lines = section.emit({ build, stats: null, allClasses: [FIGHTER], allRaces: [RACE_NO_ICONIC] })
    expect(lines[0]).toBe('Class and Feat Selection (Consolidated)')
    expect(lines[1]).toBe('[TABLE]')
    expect(lines[2]).toBe('[TR][TD]Level[/TD][TD]Class[/TD][TD]Feats[/TD][/TR]')
    expect(lines[lines.length - 1]).toBe('[/TABLE]')
  })

  it('color-codes a trained feat-type slot and shows "Empty Feat Slot" when untrained', () => {
    const build = {
      ...emptyBuild(),
      totalLevel: 1,
      classes: [{ name: 'Fighter', levels: 1 }],
      featChoices: { 'heroic-1': 'Toughness' },
    }
    const lines = section.emit({ build, stats: null, allClasses: [FIGHTER], allRaces: [RACE_NO_ICONIC] })
    expect(lines.some(l =>
      l.includes('[COLOR=rgb(65, 168, 95)]Heroic: [/COLOR][COLOR=rgb(184, 49, 47)]Toughness[/COLOR]'),
    )).toBe(true)

    const emptyBuild2 = { ...build, featChoices: {} }
    const lines2 = section.emit({ build: emptyBuild2, stats: null, allClasses: [FIGHTER], allRaces: [RACE_NO_ICONIC] })
    expect(lines2.some(l =>
      l.includes('[COLOR=rgb(184, 49, 47)]Empty Feat Slot[/COLOR]'),
    )).toBe(true)
  })

  it('adds a yellow "Alternate:" annotation when the slot has an alternate feat', () => {
    const build = {
      ...emptyBuild(),
      totalLevel: 1,
      classes: [{ name: 'Fighter', levels: 1 }],
      featChoices: { 'heroic-1': 'Toughness' },
      alternateFeats: { 'heroic-1': 'Power Attack' },
    }
    const lines = section.emit({ build, stats: null, allClasses: [FIGHTER], allRaces: [RACE_NO_ICONIC] })
    expect(lines.some(l =>
      l.includes('[COLOR=rgb(250, 197, 28)] Alternate: [/COLOR][COLOR=rgb(184, 49, 47)]Power Attack[/COLOR]'),
    )).toBe(true)
  })

  it('emits a yellow ability level-up row at the correct character level', () => {
    const build = {
      ...emptyBuild(),
      totalLevel: 4,
      classes: [{ name: 'Fighter', levels: 4 }],
      abilityLevelUps: { 4: 'Strength' },
    }
    const lines = section.emit({ build, stats: null, allClasses: [FIGHTER], allRaces: [RACE_NO_ICONIC] })
    expect(lines.some(l => l.endsWith('Strength[TD][COLOR=rgb(250, 197, 28)]Strength: +1 Level up[/COLOR][/TD][/TR]'))).toBe(true)
  })

  it('warns at level 1 when the race has an Iconic class the build did not start as', () => {
    const iconicRace: Race = { Name: 'Bladeforged', IconicClass: 'Artificer' }
    const build = {
      ...emptyBuild(), race: 'Bladeforged', totalLevel: 1, classes: [{ name: 'Fighter', levels: 1 }],
    }
    const lines = section.emit({ build, stats: null, allClasses: [FIGHTER], allRaces: [iconicRace] })
    expect(lines.some(l =>
      l.includes('Requires a +1 Heart of Wood to switch out of Iconic Class'),
    )).toBe(true)
  })

  it('shows the Lesser Reincarnation message when the level-1 class is an archetype of the Iconic class', () => {
    const iconicRace: Race = { Name: 'Bladeforged', IconicClass: 'Artificer' }
    const artificerArchetype: DDOClass = { Name: 'Battle Engineer', BaseClass: 'Artificer' }
    const build = {
      ...emptyBuild(),
      race: 'Bladeforged',
      totalLevel: 1,
      classes: [{ name: 'Battle Engineer', levels: 1 }],
      levelClasses: ['Battle Engineer'],
    }
    const lines = section.emit({
      build, stats: null, allClasses: [artificerArchetype], allRaces: [iconicRace],
    })
    expect(lines.some(l =>
      l.includes('Requires a Lesser Reincarnation to switch from Iconic class to Archetype class'),
    )).toBe(true)
  })

  it('no warning when the level-1 class already matches the race Iconic class', () => {
    const iconicRace: Race = { Name: 'Bladeforged', IconicClass: 'Fighter' }
    const build = {
      ...emptyBuild(), race: 'Bladeforged', totalLevel: 1, classes: [{ name: 'Fighter', levels: 1 }],
    }
    const lines = section.emit({ build, stats: null, allClasses: [FIGHTER], allRaces: [iconicRace] })
    expect(lines.some(l => l.includes('Heart of Wood') || l.includes('Lesser Reincarnation'))).toBe(false)
  })
})
