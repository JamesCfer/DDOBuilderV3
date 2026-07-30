// V2-canonical formulas extracted as pure functions so the parity-tests can
// hit them without standing up the full useBuildStats hook. Each function
// cites the V2 source it mirrors.

/**
 * V2 BreakdownItemHitpoints.cpp:88-105 — fate-point HP bonus (level 20+).
 * +2 HP per fate point at character level 20 or higher; 0 otherwise.
 */
export function fatePointHpBonus(charLevel: number, fatePoints: number): number {
  if (charLevel < 20 || fatePoints <= 0) return 0
  return 2 * fatePoints
}

/**
 * V2 BreakdownItemHitpoints.cpp:107-122 — negative-level HP penalty.
 * −5 HP per negative level (always non-positive).
 */
export function negativeLevelHpPenalty(negLevels: number): number {
  if (negLevels <= 0) return 0
  return -5 * negLevels
}

/**
 * V2 BreakdownItemSpellPoints.cpp:55-72 — fate-point SP bonus.
 * +1 SP per fate point at character level 20+; 0 otherwise.
 */
export function fatePointSpBonus(charLevel: number, fatePoints: number): number {
  if (charLevel < 20 || fatePoints <= 0) return 0
  return fatePoints
}

/**
 * V2 BreakdownItemSave.cpp:117-131 + BreakdownItemSkill.cpp:152-166 — saves
 * and skills both lose 1 per negative level. Returns the absolute penalty
 * (caller subtracts it).
 */
export function negativeLevelSavePenalty(negLevels: number): number {
  return Math.max(0, negLevels)
}


/**
 * V2 BreakdownItemHitpoints.cpp:174-181 — reaper HP cap by character level.
 * Returns the cap (Infinity above level 25).
 */
export function reaperHpCap(level: number): number {
  if (level <= 5) return 50
  if (level <= 10) return 100
  if (level <= 15) return 200
  if (level <= 20) return 400
  if (level <= 25) return 800
  return Infinity
}

/**
 * V2 BreakdownItemHitpoints.cpp:139-152 — fighting-style HP bonus.
 * `0.25 × min(4, styleFeats) × non-epic-class-HD`, floor.
 *
 * `nonEpicHD` is sum across heroic/iconic class levels of (level × HitDie),
 * with Epic and Legendary classes contributing half-HD per :74-83.
 */
export function styleBonusHp(styleFeats: number, nonEpicHD: number): number {
  if (styleFeats <= 0 || nonEpicHD <= 0) return 0
  return Math.floor(0.25 * Math.min(4, styleFeats) * nonEpicHD)
}

/**
 * V2 BreakdownItemDodge.cpp:31-65 — effective dodge cap. Returns the lowest
 * applicable cap among dodgeCap, MDB-when-not-cloth, MDBShields-when-tower.
 * Caller compares the cap against the resolved dodge total to decide whether
 * to clamp.
 */
export function effectiveDodgeCap(args: {
  dodgeCap: number
  hasDodgeCap: boolean
  mdb: number
  hasMdb: boolean
  mdbShields: number
  isClothArmor: boolean
  isTowerShield: boolean
}): number {
  let cap = args.hasDodgeCap ? args.dodgeCap : Infinity
  if (!args.isClothArmor && args.hasMdb) {
    cap = Math.min(cap, args.mdb)
  }
  if (args.isTowerShield) {
    cap = Math.min(cap, args.mdbShields)
  }
  return cap
}

/**
 * V2 BreakdownItemSave.cpp:484-510 — Divine Grace cap.
 * `max(2 + 3 × Paladin levels, 2 + 3 × Sacred Fist levels)`, requires
 * level ≥ 2 in the relevant class.
 */
export function divineGraceCap(palLevels: number, sfLevels: number): number {
  const palCap = palLevels >= 2 ? 2 + 3 * palLevels : 0
  const sfCap = sfLevels >= 2 ? 2 + 3 * sfLevels : 0
  return Math.max(palCap, sfCap)
}

/**
 * V2 BreakdownItemSave.cpp:520-549 — Half-Elf Lesser Divine Grace cap.
 * Base 2, +1 per "Improved Dilettante: Paladin" selection trained across
 * the three Half-Elf "Improved Dilettante I/II/III" enhancements.
 */
export function halfElfLesserDivineGraceCap(improvedDilettantePaladinCount: number): number {
  return 2 + Math.max(0, improvedDilettantePaladinCount)
}

/**
 * V2 ReaperEnhancementsPane.cpp:248-255 — Reaper XP required for n RAPs.
 *
 * V2 computes: reaperXp += (i * 2 + 1) for i in 0..n-1.
 * Closed form: sum of first n odd numbers = n².
 *
 * Returns the value in thousands (k), matching V2's "Requires Nk Reaper XP"
 * display. So reaperXpRequired(10) = 100 means 100,000 Reaper XP.
 */
export function reaperXpRequired(totalRAPs: number): number {
  if (totalRAPs <= 0) return 0
  return totalRAPs * totalRAPs
}

// V2 level constants (DDOBuilder/stdafx.h)
const MAX_CLASS_LEVEL = 20   // heroic levels 1-20
const MAX_EPIC_LEVEL = 10    // epic levels 21-30
// Upstream V2 master raised this from 34 to 36 when the game's level cap
// moved (verified against Maetrim/DDOBuilderV2 stdafx.h and V2's live
// Destiny APs output for a level-36 build: 40 epic + 24 legendary).
const BUILD_START_LEVEL = 36

/**
 * V2 BreakdownItemDestinyAps.cpp:48-92 — total Destiny (Epic Destiny) points.
 *
 * Epic Destiny points are a SINGLE shared pool spent across all selected
 * destiny trees — there is no per-tree "24" cap. The pool is:
 *   - 4 per epic level (character levels 20-30, capped at 10 levels → 40)
 *   - 4 per legendary level (character levels 30-40, capped at 10 → 40)
 *   - floor(fatePoints / 3) inherent bonus
 *
 * `charLevel` is the 1-based character level (V2 Build::Level()). Mirrors the
 * V2 control flow exactly, including the BUILD_START_LEVEL special case.
 */
export function destinyPointPool(charLevel: number, fatePoints = 0): number {
  let pool = Math.floor(Math.max(0, fatePoints) / 3)
  let level = charLevel
  if (level >= MAX_CLASS_LEVEL) {
    level -= MAX_CLASS_LEVEL
    const epicLevels = Math.min(level + 1, 10)
    pool += epicLevels * 4
    if (level >= MAX_EPIC_LEVEL) {
      level -= MAX_EPIC_LEVEL
      let legendaryLevels = Math.min(level + 1, 10)
      if (charLevel === BUILD_START_LEVEL) {
        legendaryLevels = BUILD_START_LEVEL - MAX_CLASS_LEVEL - MAX_EPIC_LEVEL
      }
      pool += legendaryLevels * 4
    }
  }
  return pool
}
