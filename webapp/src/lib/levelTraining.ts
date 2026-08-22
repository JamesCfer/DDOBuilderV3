// V2 parity: per-character-level training summary.
//
// V2 stores Build::m_Levels as an array of LevelTraining objects, one per
// character level. Each entry holds the class chosen, feats trained, and
// skills allocated at that specific level. LevelTrainingPane displays them
// grouped by character level.
//
// V3 carries `build.levelClasses` (class per level), `build.featChoices`
// (keyed by slot-key that encodes character level), and
// `build.skillRanksByLevel` (level → skill → ranks). This module provides
// helpers that assemble those disparate data sources into the per-level
// `LevelTrainingEntry` view V2's LevelTrainingPane renders.
//
// V2 sources: LevelTraining.h/cpp, Build.cpp::m_Levels, FeatSlot helpers.

import type { CharacterBuild, DDOClass, Race } from '../types/ddo'
import { getLevelClasses } from './levelProgression'
import { buildAutomaticFeatGroups } from './automaticFeats'

// ---------------------------------------------------------------------------
// Slot entries (shared type used by FeatSlots.tsx and LevelTrainingPanel.tsx)
// ---------------------------------------------------------------------------

export interface SlotEntry {
  key: string
  /**
   * Character level at which this slot is awarded (V2 parity). For race /
   * universal slots this equals the slot's own level; for class slots it is
   * the character level at which the Nth class level is reached.
   */
  level: number
  /**
   * Class-internal level at which the slot is granted (differs from `level`
   * in multiclass builds).
   */
  classLevel: number
  featType: string
  className: string
  featUpdateList?: string[]
}

// ---------------------------------------------------------------------------
// Per-level training entry
// ---------------------------------------------------------------------------

export interface LevelTrainingEntry {
  charLevel: number
  /** Class taken at this character level. */
  className: string
  /** Keys of feat slots awarded at this character level. */
  featSlotKeys: string[]
  /**
   * Subset of `build.featChoices` for feat slots at this level — convenient
   * so consumers don't need to scan all choices.
   */
  featChoices: Record<string, string>
  /** Skill points available at this level (×4 at level 1). */
  skillPointsAvailable: number
  /** Skill points spent at this level (sum of ranks allocated). */
  skillPointsSpent: number
  /** Skills trained at this level (`build.skillRanksByLevel[charLevel]`). */
  skillRanks: Record<string, number>
  /**
   * Feats auto-granted at this character level — the race's GrantedFeats at
   * level 1 and each class's <AutomaticFeats> for the class level reached
   * here (V2 `Build::AutomaticFeats`, Build.cpp:2502-2581, shown per level by
   * `CAutomaticFeatsPane::SetAutofeats`). Alphabetical, as V2 sorts them.
   */
  automaticFeats: string[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/** V2 parity: character level at which the Nth level of `className` is reached. */
function characterLevelForClassLevel(
  build: Pick<CharacterBuild, 'classes' | 'levelClasses' | 'totalLevel'>,
  className: string,
  classLevel: number,
): number {
  if (classLevel <= 0) return 0
  const lc = getLevelClasses(build)
  let n = 0
  for (let i = 0; i < lc.length; i++) {
    if (lc[i] === className) {
      n++
      if (n === classLevel) return i + 1
    }
  }
  return 0
}

/** Skill points available at a single character level (V2 parity). */
function skillPointsAtLevel(
  build: Pick<CharacterBuild, 'classes' | 'levelClasses' | 'totalLevel' | 'baseAbilities' | 'abilityLevelUps'>,
  allClasses: DDOClass[],
  raceIntBonus: number,
  raceSkillBonus: number,
  charLvl: number,
): number {
  const lc = getLevelClasses(build)
  const i = charLvl - 1
  if (i < 0 || i >= lc.length || i >= 20) return 0
  const name = lc[i]
  if (!name) return 0
  const cls = allClasses.find(c => c.Name === name)
  const basePoints = cls?.SkillPoints ?? 2
  const intScore = (build.baseAbilities.Intelligence ?? 8) + raceIntBonus +
    Object.entries(build.abilityLevelUps)
      .filter(([lvl, ab]) => ab === 'Intelligence' && Number(lvl) <= charLvl)
      .length
  const intMod = Math.floor((intScore - 10) / 2)
  const pts = Math.max(1, basePoints + raceSkillBonus + intMod)
  return i === 0 ? pts * 4 : pts
}

// ---------------------------------------------------------------------------
// buildSlots — extracted from FeatSlots.tsx so tests + LevelTrainingPanel can
// consume the same slot-construction logic without importing the component.
// ---------------------------------------------------------------------------

/**
 * Builds the full list of feat slot entries for a character, sorted by
 * character level. Mirrors V2 Build::FeatSlot iteration logic.
 */
export function buildSlots(
  build: CharacterBuild,
  allClasses: DDOClass[],
  allRaces: Race[],
): SlotEntry[] {
  const slots: SlotEntry[] = []
  const epicLevels = build.epicLevels ?? 0
  const legendaryLevels = build.legendaryLevels ?? 0

  // 1. Race feat slots
  const race = allRaces.find(r => r.Name === build.race)
  const raceFeatTypeCount: Record<string, number> = {}
  toArray(race?.FeatSlot).forEach(fs => {
    const counterKey = `${fs.Level}-${fs.FeatType}`
    const localIdx = raceFeatTypeCount[counterKey] ?? 0
    raceFeatTypeCount[counterKey] = localIdx + 1
    const featUpdateList = fs.FeatUpdateList
      ? toArray(fs.FeatUpdateList).filter(Boolean)
      : undefined
    slots.push({
      key: `race-${fs.Level}-${fs.FeatType}-${localIdx}`,
      level: fs.Level,
      classLevel: fs.Level,
      featType: fs.FeatType,
      className: build.race,
      featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
    })
  })

  // 2. Universal standard heroic feat slots (levels 1, 3, 6, 9, 12, 15, 18)
  const universalLevels = [1, 3, 6, 9, 12, 15, 18]
  universalLevels.forEach(lvl => {
    slots.push({ key: `heroic-${lvl}`, level: lvl, classLevel: lvl, featType: 'Heroic', className: 'Universal' })
  })

  // 2b. Universal "Alter Dark Gift" feat slot at character level 4 — granted
  // unconditionally to every build regardless of race/class (V2
  // Build::TrainableFeatTypeAtLevel, Build.cpp:1091), not backed by any
  // race/class FeatSlot XML data.
  slots.push({
    key: 'alterDarkGift-4', level: 4, classLevel: 4, featType: 'Alter Dark Gift', className: 'Universal',
  })

  // 3. Class-specific heroic feat slots — positioned at the character level
  //    where the Nth class level is reached (V2 parity).
  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.FeatSlot) continue
    const classFeatTypeCount: Record<string, number> = {}
    toArray(cls.FeatSlot).forEach(fs => {
      if (fs.Level > bc.levels) return
      const charLevel = characterLevelForClassLevel(build, bc.name, fs.Level)
      if (!charLevel) return
      const counterKey = `${fs.Level}-${fs.FeatType}`
      const localIdx = classFeatTypeCount[counterKey] ?? 0
      classFeatTypeCount[counterKey] = localIdx + 1
      const featUpdateList = fs.FeatUpdateList
        ? toArray(fs.FeatUpdateList).filter(Boolean)
        : undefined
      slots.push({
        key: `${bc.name}-${fs.Level}-${fs.FeatType}-${localIdx}`,
        level: charLevel,
        classLevel: fs.Level,
        featType: fs.FeatType,
        className: bc.name,
        featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
      })
    })
  }

  // 4. Epic feat slots — Epic.class.xml; epic class level N → character level 20+N
  if (epicLevels > 0) {
    const epicClass = allClasses.find(c => c.Name === 'Epic')
    const epicFeatTypeCount: Record<string, number> = {}
    toArray(epicClass?.FeatSlot).forEach(fs => {
      if (fs.Level <= epicLevels) {
        const counterKey = `${fs.Level}-${fs.FeatType}`
        const localIdx = epicFeatTypeCount[counterKey] ?? 0
        epicFeatTypeCount[counterKey] = localIdx + 1
        const featUpdateList = fs.FeatUpdateList
          ? toArray(fs.FeatUpdateList).filter(Boolean)
          : undefined
        slots.push({
          key: `epic-${fs.Level}-${fs.FeatType}-${localIdx}`,
          level: 20 + fs.Level,
          classLevel: fs.Level,
          featType: fs.FeatType,
          className: 'Epic',
          featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
        })
      }
    })
  }

  // 5. Legendary feat slots — Legendary.class.xml; legendary class level N → character level 30+N
  if (legendaryLevels > 0) {
    const legendaryClass = allClasses.find(c => c.Name === 'Legendary')
    const legendaryFeatTypeCount: Record<string, number> = {}
    toArray(legendaryClass?.FeatSlot).forEach(fs => {
      if (fs.Level <= legendaryLevels) {
        const counterKey = `${fs.Level}-${fs.FeatType}`
        const localIdx = legendaryFeatTypeCount[counterKey] ?? 0
        legendaryFeatTypeCount[counterKey] = localIdx + 1
        const featUpdateList = fs.FeatUpdateList
          ? toArray(fs.FeatUpdateList).filter(Boolean)
          : undefined
        slots.push({
          key: `legendary-${fs.Level}-${fs.FeatType}-${localIdx}`,
          level: 30 + fs.Level,
          classLevel: fs.Level,
          featType: fs.FeatType,
          className: 'Legendary',
          featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
        })
      }
    })
  }

  slots.sort((a, b) => a.level - b.level || a.className.localeCompare(b.className))
  return slots
}

// ---------------------------------------------------------------------------
// getLevelTrainingEntries — per-level summary for the Level Training panel
// ---------------------------------------------------------------------------

/**
 * Returns one `LevelTrainingEntry` per heroic character level (1–totalLevel,
 * capped at 20), each containing:
 * - the class taken at that level
 * - keys of feat slots awarded at that level
 * - feat choices for those slots (subset of `build.featChoices`)
 * - skill points available and spent
 * - skill ranks allocated at that level
 *
 * Matches V2 `LevelTrainingPane` data: `Build::m_Levels[i].Class`,
 * `m_Levels[i].TrainedFeats`, `m_Levels[i].TrainedSkills`.
 */
export function getLevelTrainingEntries(
  build: CharacterBuild,
  allClasses: DDOClass[],
  allRaces: Race[],
): LevelTrainingEntry[] {
  const lc = getLevelClasses(build)
  const race = allRaces.find(r => r.Name === build.race)
  const raceSkillBonus = (race as unknown as { SkillPoints?: number } | undefined)?.SkillPoints ?? 0
  const raceIntBonus = Number((race as unknown as { Intelligence?: number } | undefined)?.Intelligence ?? 0) || 0

  const heroicLevel = Math.min(20, build.totalLevel)
  const slots = buildSlots(build, allClasses, allRaces)

  // Auto-granted feats keyed by the character level that grants them. The
  // shared helper already resolves each class grant to its character level
  // (race grants carry charLevel 0 = level 1, as V2 hands them to level 1's
  // LevelTraining). Completionist / Racial Completionist are life-wide, not
  // level grants, so they stay in the Automatic Feats panel only.
  const automaticByLevel = new Map<number, string[]>()
  for (const g of buildAutomaticFeatGroups(build, allClasses, allRaces)) {
    if (g.source === 'Completionist' || g.source === 'Racial Completionist') continue
    const lvl = g.charLevel || 1
    const list = automaticByLevel.get(lvl) ?? []
    list.push(...g.feats)
    automaticByLevel.set(lvl, list)
  }
  for (const [lvl, list] of automaticByLevel) {
    automaticByLevel.set(lvl, list.slice().sort((a, b) => a.localeCompare(b)))
  }

  const entries: LevelTrainingEntry[] = []
  for (let charLevel = 1; charLevel <= heroicLevel; charLevel++) {
    const className = lc[charLevel - 1] ?? ''

    // Feat slots awarded at this character level (heroic only)
    const levelSlots = slots.filter(s => s.level === charLevel)
    const featSlotKeys = levelSlots.map(s => s.key)

    // Subset of build.featChoices for this level's slots
    const featChoices: Record<string, string> = {}
    for (const key of featSlotKeys) {
      const chosen = build.featChoices[key]
      if (chosen) featChoices[key] = chosen
    }

    // Skill data for this level
    const skillRanks = build.skillRanksByLevel?.[charLevel] ?? {}
    const skillPointsSpent = Object.values(skillRanks).reduce((a, b) => a + b, 0)
    const skillPointsAvailable = skillPointsAtLevel(
      build, allClasses, raceIntBonus, raceSkillBonus, charLevel,
    )

    entries.push({
      charLevel,
      className,
      featSlotKeys,
      featChoices,
      skillPointsAvailable,
      skillPointsSpent,
      skillRanks,
      automaticFeats: automaticByLevel.get(charLevel) ?? [],
    })
  }

  return entries
}
