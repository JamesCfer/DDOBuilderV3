// V2 parity: per-character-level class progression helpers.
//
// V2 stores Build::m_Levels as a list of LevelTraining objects, one per
// character level, each holding the class chosen. Many calculations
// (prerequisite checks, BAB, saves, automatic feats) ask "what was true
// when I was at character level N" or "how many levels of class X did I
// have by level N". Those questions cannot be answered from totals alone.
//
// V3 carries `build.levelClasses: string[]` as the authoritative array.
// Older saves omit it; in that case we deterministically flatten the
// totals in declaration order so existing data still works.
import type { Ability, BuildClass, CharacterBuild, DDOClass } from '../types/ddo'

export const HEROIC_CAP = 20
export const EPIC_CAP = 10
export const LEGENDARY_CAP = 4

/**
 * Returns the per-heroic-level class array for a build. If the build has
 * an explicit `levelClasses`, that's authoritative (and padded/trimmed to
 * the correct length). Otherwise the array is derived by flattening the
 * `classes` totals in declaration order.
 */
export function getLevelClasses(build: Pick<CharacterBuild, 'classes' | 'levelClasses' | 'totalLevel'>): string[] {
  const cap = Math.min(build.totalLevel ?? 0, HEROIC_CAP)
  if (build.levelClasses && build.levelClasses.length > 0) {
    const out = build.levelClasses.slice(0, HEROIC_CAP)
    while (out.length < cap) out.push('')
    return out
  }
  const out: string[] = []
  for (const bc of build.classes) {
    if (!bc.name) continue
    for (let i = 0; i < bc.levels; i++) out.push(bc.name)
  }
  while (out.length < cap) out.push('')
  return out
}

/**
 * Re-aggregates a per-level array back into the legacy `classes` triple.
 * Order is "first-seen" so the chip colours and totals match what the
 * user sees in the level grid.
 */
export function aggregateLevelClasses(levels: string[]): [BuildClass, BuildClass, BuildClass] {
  const counts: Record<string, number> = {}
  const seen: string[] = []
  for (const c of levels) {
    if (!c) continue
    counts[c] = (counts[c] ?? 0) + 1
    if (!seen.includes(c)) seen.push(c)
  }
  return [
    { name: seen[0] ?? '', levels: counts[seen[0]] ?? 0 },
    { name: seen[1] ?? '', levels: counts[seen[1]] ?? 0 },
    { name: seen[2] ?? '', levels: counts[seen[2]] ?? 0 },
  ]
}

/**
 * V2 parity: counts the levels of class `target` (or any class whose
 * BaseClass matches `target`) across the first `upToCharLevel` heroic
 * levels. `upToCharLevel` is 1-indexed and inclusive.
 */
export function classLevelsAtLevel(
  build: Pick<CharacterBuild, 'classes' | 'levelClasses' | 'totalLevel'>,
  target: string,
  upToCharLevel: number,
  allClasses: DDOClass[],
  countBaseClass: boolean = false,
): number {
  const lc = getLevelClasses(build)
  const cap = Math.min(upToCharLevel, lc.length)
  let n = 0
  for (let i = 0; i < cap; i++) {
    const c = lc[i]
    if (!c) continue
    if (c === target) { n++; continue }
    if (countBaseClass) {
      const cls = allClasses.find(cc => cc.Name === c)
      if (cls?.BaseClass === target) n++
    }
  }
  return n
}

/**
 * V2 parity: returns the character level (1-indexed) at which the Nth
 * level of `className` is gained, or 0 if not gained yet within the
 * heroic progression.
 */
export function characterLevelForClassLevel(
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

/**
 * V2 parity: builds a snapshot of `build` as it looked just before the
 * character was about to gain feat/level features at character level
 * `charLevel`. classes triple is recomputed from levelClasses[0..charLevel-1].
 *
 * `excludeClassLevels` lets a class-specific slot pin its owning class
 * to exactly its class-level rather than counting it (e.g. the Fighter
 * Bonus Feat at class level 4 is granted "after gaining the 4th Fighter
 * level", but for the *prerequisite* of feats requiring Fighter 4 it
 * counts as exactly 4).
 */
export function buildSnapshotAtCharacterLevel(
  build: CharacterBuild,
  charLevel: number,
): CharacterBuild {
  const lc = getLevelClasses(build).slice(0, Math.max(0, charLevel))
  const classes = aggregateLevelClasses(lc)
  return {
    ...build,
    levelClasses: lc,
    classes,
    totalLevel: lc.filter(Boolean).length,
    // Epic/legendary levels only count once the snapshot level reaches them
    // (V2 evaluates requirements "at level": a level-15 snapshot has no epic
    // levels even if the full build is level 34).
    epicLevels: Math.max(0, Math.min(build.epicLevels ?? 0, charLevel - 20)),
    legendaryLevels: Math.max(0, Math.min(build.legendaryLevels ?? 0, charLevel - 30)),
  }
}

const ABILITIES: readonly Ability[] = [
  'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
] as const

/**
 * V2 parity: Build::AbilityAtLevel — ability score at character level N,
 * counting only level-up bonuses awarded at multiples of 4 ≤ N. Tomes are
 * applied subject to the V2 tome-cap-at-level rule (caller should use
 * `tomeCapAtLevel` before passing in `tomeBonus`). Race bonus is folded in.
 */
export function abilityAtLevel(
  build: Pick<CharacterBuild, 'baseAbilities' | 'abilityLevelUps'>,
  ability: Ability,
  charLevel: number,
  raceBonus: number = 0,
  tomeBonus: number = 0,
): number {
  const base = build.baseAbilities[ability] ?? 8
  const lvlUps = Object.entries(build.abilityLevelUps)
    .filter(([lvl, ab]) => ab === ability && Number(lvl) <= charLevel)
    .length
  return base + raceBonus + lvlUps + tomeBonus
}

/**
 * V2 parity: Life::TomeAtLevel — tome cap by character level.
 * 2 @ ≤2, 3 @ 3-6, 4 @ 7-10, 5 @ 11-14, 6 @ 15-18, 7 @ 19-21, no cap above.
 */
export function tomeCapAtLevel(charLevel: number): number {
  if (charLevel <= 2) return 2
  if (charLevel <= 6) return 3
  if (charLevel <= 10) return 4
  if (charLevel <= 14) return 5
  if (charLevel <= 18) return 6
  if (charLevel <= 21) return 7
  return 999
}

/** Returns each ability's score at the given character level (V2 parity). */
export function allAbilitiesAtLevel(
  build: Pick<CharacterBuild, 'baseAbilities' | 'abilityLevelUps' | 'abilityTomes'>,
  charLevel: number,
  race?: { Strength?: number; Dexterity?: number; Constitution?: number; Intelligence?: number; Wisdom?: number; Charisma?: number },
): Record<Ability, number> {
  const out = {} as Record<Ability, number>
  const tomeCap = tomeCapAtLevel(charLevel)
  for (const ab of ABILITIES) {
    const racialRaw = race ? Number(race[ab] ?? 0) || 0 : 0
    const tomeRaw = build.abilityTomes?.[ab] ?? 0
    const tome = Math.min(tomeRaw, tomeCap)
    out[ab] = abilityAtLevel(build, ab, charLevel, racialRaw, tome)
  }
  return out
}
