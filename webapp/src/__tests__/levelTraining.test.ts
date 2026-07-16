// U7 — Per-level training UI
// V2 parity: V2's LevelTrainingPane groups all training choices (class, feats,
// skills) by character level. V3 had no unified per-level summary.
//
// V2 sources: Build.cpp::m_Levels (LevelTraining array), LevelTraining.h/cpp.

import { describe, expect, it } from 'vitest'
import { buildSlots, getLevelTrainingEntries } from '../lib/levelTraining'
import { emptyBuild } from '../types/ddo'
import { aggregateLevelClasses } from '../lib/levelProgression'
import type { CharacterBuild, DDOClass, Race } from '../types/ddo'

// ---------------------------------------------------------------------------
// Minimal mock data
// ---------------------------------------------------------------------------

const mockFighter: DDOClass = {
  Name: 'Fighter',
  SkillPoints: 2,
  HitPoints: 10,
  FeatSlot: [
    { Level: 1, FeatType: 'Fighter Bonus Feat' },
    { Level: 2, FeatType: 'Fighter Bonus Feat' },
    { Level: 4, FeatType: 'Fighter Bonus Feat' },
  ],
}

const mockWizard: DDOClass = {
  Name: 'Wizard',
  SkillPoints: 2,
  HitPoints: 4,
  FeatSlot: [
    { Level: 1, FeatType: 'Wizard Bonus Feat' },
    { Level: 5, FeatType: 'Wizard Bonus Feat' },
  ],
}

const mockEpic: DDOClass = {
  Name: 'Epic',
  FeatSlot: [
    { Level: 1, FeatType: 'Epic Feat' },
    { Level: 3, FeatType: 'Epic Feat' },
  ],
}

const mockHuman: Race = {
  Name: 'Human',
  FeatSlot: [{ Level: 1, FeatType: 'Standard' }],
}

const allClasses = [mockFighter, mockWizard, mockEpic]

function makeBuild(levels: string[], epicLevels = 0): CharacterBuild {
  const b = emptyBuild()
  b.levelClasses = levels
  b.classes = aggregateLevelClasses(levels)
  b.totalLevel = levels.filter(Boolean).length
  b.epicLevels = epicLevels
  b.legendaryLevels = 0
  return b
}

// ---------------------------------------------------------------------------
// buildSlots tests
// ---------------------------------------------------------------------------

describe('buildSlots (U7 — level training)', () => {
  it('places the Human race feat slot at character level 1', () => {
    const build = makeBuild(['Fighter', 'Fighter'])
    const slots = buildSlots(build, allClasses, [mockHuman])
    const raceSlot = slots.find(s => s.key.startsWith('race-'))
    expect(raceSlot).toBeDefined()
    expect(raceSlot!.level).toBe(1)
    expect(raceSlot!.featType).toBe('Standard')
    expect(raceSlot!.className).toBe('Human')
  })

  it('places heroic universal slots at levels 1, 3, 6, 9, 12, 15, 18', () => {
    const build = makeBuild(Array(20).fill('Fighter'))
    const slots = buildSlots(build, allClasses, [mockHuman])
    const heroicLevels = slots
      .filter(s => s.key.startsWith('heroic-'))
      .map(s => s.level)
      .sort((a, b) => a - b)
    expect(heroicLevels).toEqual([1, 3, 6, 9, 12, 15, 18])
  })

  it('places Fighter bonus feats at the correct character levels', () => {
    // Pure Fighter: class level N === character level N
    const build = makeBuild(Array(5).fill('Fighter'))
    const slots = buildSlots(build, allClasses, [mockHuman])
    const fighterSlots = slots.filter(s => s.className === 'Fighter')
    expect(fighterSlots.some(s => s.level === 1 && s.featType === 'Fighter Bonus Feat')).toBe(true)
    expect(fighterSlots.some(s => s.level === 2 && s.featType === 'Fighter Bonus Feat')).toBe(true)
    expect(fighterSlots.some(s => s.level === 4 && s.featType === 'Fighter Bonus Feat')).toBe(true)
  })

  it('shifts class feat slots for a multiclass build', () => {
    // Wizard/Fighter: L1=Wizard, L2=Wizard, L3=Fighter, L4=Fighter
    // Fighter bonus feat at class level 1 → char level 3
    // Fighter bonus feat at class level 2 → char level 4
    const build = makeBuild(['Wizard', 'Wizard', 'Fighter', 'Fighter'])
    const slots = buildSlots(build, allClasses, [mockHuman])
    const fighterSlots = slots.filter(s => s.className === 'Fighter')
    expect(fighterSlots.some(s => s.level === 3 && s.featType === 'Fighter Bonus Feat')).toBe(true)
    expect(fighterSlots.some(s => s.level === 4 && s.featType === 'Fighter Bonus Feat')).toBe(true)
  })

  it('does not include class feat slots beyond the class levels taken', () => {
    // Only 2 Fighter levels: class level 4 bonus feat is NOT granted
    const build = makeBuild(['Fighter', 'Fighter'])
    const slots = buildSlots(build, allClasses, [mockHuman])
    const fighterSlots = slots.filter(s => s.className === 'Fighter')
    expect(fighterSlots.every(s => s.level <= 2)).toBe(true)
  })

  it('places epic feat slots at char levels 21+', () => {
    const build = makeBuild(Array(20).fill('Fighter'), 3)
    const slots = buildSlots(build, allClasses, [mockHuman])
    const epicSlots = slots.filter(s => s.className === 'Epic')
    expect(epicSlots.every(s => s.level > 20)).toBe(true)
    // Epic class has feat slots at class levels 1 and 3
    const epicLevels = epicSlots.map(s => s.level).sort((a, b) => a - b)
    expect(epicLevels).toEqual([21, 23])
  })

  it('places a universal "Alter Dark Gift" slot at character level 4 for every build', () => {
    // V2 Build::TrainableFeatTypeAtLevel (Build.cpp:1091) grants this slot
    // unconditionally at level==3 (0-based) = character level 4, regardless
    // of race or class — not backed by any race/class FeatSlot XML data.
    const build = makeBuild(Array(5).fill('Fighter'))
    const slots = buildSlots(build, allClasses, [mockHuman])
    const slot = slots.find(s => s.key === 'alterDarkGift-4')
    expect(slot).toBeDefined()
    expect(slot!.level).toBe(4)
    expect(slot!.featType).toBe('Alter Dark Gift')
  })

  it('returns slots sorted by level', () => {
    const build = makeBuild(['Fighter', 'Fighter', 'Fighter'])
    const slots = buildSlots(build, allClasses, [mockHuman])
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].level).toBeGreaterThanOrEqual(slots[i - 1].level)
    }
  })
})

// ---------------------------------------------------------------------------
// getLevelTrainingEntries tests
// ---------------------------------------------------------------------------

describe('getLevelTrainingEntries (U7 — level training)', () => {
  it('returns one entry per heroic level', () => {
    const build = makeBuild(['Fighter', 'Fighter', 'Fighter'])
    const entries = getLevelTrainingEntries(build, allClasses, [mockHuman])
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.charLevel)).toEqual([1, 2, 3])
  })

  it('associates the correct class name with each level', () => {
    const build = makeBuild(['Wizard', 'Fighter', 'Wizard'])
    const entries = getLevelTrainingEntries(build, allClasses, [mockHuman])
    expect(entries[0].className).toBe('Wizard')
    expect(entries[1].className).toBe('Fighter')
    expect(entries[2].className).toBe('Wizard')
  })

  it('groups all feat slot keys belonging to a character level', () => {
    // Level 1 for a Human Fighter should have: race slot + heroic-1 + Fighter bonus feat
    const build = makeBuild(['Fighter', 'Fighter'])
    const entries = getLevelTrainingEntries(build, allClasses, [mockHuman])
    const lvl1 = entries.find(e => e.charLevel === 1)!
    expect(lvl1.featSlotKeys.length).toBeGreaterThanOrEqual(3) // race + heroic + Fighter BF
    expect(lvl1.featSlotKeys.some(k => k.startsWith('race-'))).toBe(true)
    expect(lvl1.featSlotKeys.some(k => k === 'heroic-1')).toBe(true)
    // Level 2 has only Fighter bonus feat (no universal heroic at level 2)
    const lvl2 = entries.find(e => e.charLevel === 2)!
    expect(lvl2.featSlotKeys.some(k => k.includes('Fighter'))).toBe(true)
    expect(lvl2.featSlotKeys.some(k => k.startsWith('heroic-'))).toBe(false)
  })

  it('computes skill points available (×4 multiplier at L1, base - INT mod)', () => {
    // Fighter has 2 base sp, INT 8 base → INT mod -1 → max(1, 2-1)=1 × 4 = 4 at L1
    const build = makeBuild(['Fighter'])
    build.baseAbilities.Intelligence = 8
    const entries = getLevelTrainingEntries(build, allClasses, [mockHuman])
    expect(entries[0].skillPointsAvailable).toBe(4) // 1 × 4 = 4
  })

  it('records per-level skill rank allocation from skillRanksByLevel', () => {
    const build = makeBuild(['Fighter', 'Fighter', 'Fighter'])
    build.skillRanksByLevel = {
      1: { Spot: 2, Listen: 1 },
      3: { Concentration: 2 },
    }
    const entries = getLevelTrainingEntries(build, allClasses, [mockHuman])
    expect(entries[0].skillRanks).toEqual({ Spot: 2, Listen: 1 })
    expect(entries[1].skillRanks).toEqual({})
    expect(entries[2].skillRanks).toEqual({ Concentration: 2 })
  })

  it('sums skillPointsSpent from all skills at that level', () => {
    const build = makeBuild(['Fighter', 'Fighter'])
    build.skillRanksByLevel = {
      1: { Spot: 3, Listen: 1 },
    }
    const entries = getLevelTrainingEntries(build, allClasses, [mockHuman])
    expect(entries[0].skillPointsSpent).toBe(4)
    expect(entries[1].skillPointsSpent).toBe(0)
  })

  it('feat choices subset contains only the chosen feats for that level', () => {
    const build = makeBuild(['Fighter', 'Fighter'])
    build.featChoices = {
      'heroic-1': 'Toughness',
      'heroic-3': 'Power Attack',
    }
    const entries = getLevelTrainingEntries(build, allClasses, [mockHuman])
    const lvl1 = entries.find(e => e.charLevel === 1)!
    expect(lvl1.featChoices['heroic-1']).toBe('Toughness')
    expect('heroic-3' in lvl1.featChoices).toBe(false)
  })
})
