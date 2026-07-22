/**
 * Parity pass — Epic/Legendary hit-point bugs found by diffing V3 against the
 * `v2calc` oracle's per-effect `AllActiveEffects()` dump for real builds
 * (YingsMonk.DDOBuild oracle HP 4198 vs V3's 2851; exampledps.DDOBuild
 * oracle HP 2797, matching the user-supplied real V2 forum export exactly).
 *
 * V2 `BreakdownItemHitpoints.cpp:59-85` (`CreateOtherEffects`):
 *   for each class level entry:
 *     AddOtherEffect("<Class> <N> Levels", classLevels * c.HitPoints())  // ALWAYS full
 *     if (class == Epic || class == Legendary)
 *       classHitpoints += c.HitPoints() * classLevels / 2   // HALVED, but only
 *     else                                                  // this *separate*
 *       classHitpoints += c.HitPoints() * classLevels        // accumulator —
 *                                                             // used solely by
 *                                                             // the Combat Style
 *                                                             // % bonus below.
 *
 * V3 (`accumulateClass` in `buildStats.ts`) collapsed both meanings into one:
 * it halved the class's own HP effect for Epic/Legendary (should never be
 * halved) while ALSO double-counting Epic/Legendary HD in the separate
 * Combat-Style accumulator (once at full weight via the per-class loop, once
 * again at half weight from the explicit epic/legendary top-up).
 *
 * Two more HP bugs live in the same neighbourhood, both instances of "scope
 * width doesn't match V2's total character level":
 *  - The CON-mod HP delta correction (gear/enhancement CON bonuses invisible
 *    to the early "quick resolve" pass) scaled by heroic `build.totalLevel`
 *    instead of heroic+epic+legendary, matching the *base* CON HP formula's
 *    own scope (`BreakdownItemHitpoints.cpp:124-136`, `pBuild->Level()`).
 *  - `HitpointsReaper` (V2's APCount-scaled `Breakdown_ReaperHitpoints`,
 *    level-capped at `BreakdownItemHitpoints.cpp:168-194`) was merged into
 *    the same `hp` bucket as plain `Hitpoints`-typed effects tagged
 *    Bonus="Reaper" (V2's flat, uncapped "Reaper's Defense I/II/IV"), so the
 *    cap over-applied to effects V2 never caps, and the cap threshold itself
 *    used heroic level instead of `pBuild->Level() + 1`.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1', Will: 'Type1', BAB: '1',
} as unknown as DDOClass
const epicClass = { Name: 'Epic', HitPoints: 10 } as unknown as DDOClass

function baseBuild(epicLevels: number) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 20 }],
    levelClasses: Array(20).fill('Fighter'),
    totalLevel: 20,
    epicLevels,
    // emptyBuild() defaults epicLevels/legendaryLevels to 10/4 (a "typical
    // end-game" placeholder) — pin legendaryLevels to 0 explicitly so this
    // test's expected totals aren't silently thrown off by that default.
    legendaryLevels: 0,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
  }
}

describe('Epic/Legendary class HP is never halved (BreakdownItemHitpoints.cpp:68-73)', () => {
  it('Fighter 20 + Epic 5: 200 + 50 (full, not 25 halved)', () => {
    const input = { ...emptyInput(), allClasses: [fighterClass, epicClass] }
    const stats = computeBuildStats(input, baseBuild(5))
    expect(stats.total('hp')).toBe(250)
  })
})

describe('Combat Style HD accumulator does not double-count Epic/Legendary HD', () => {
  const styleFeat = {
    Name: 'Style Feat', Acquire: 'Train',
    Effect: { Type: 'HitpointsStyleBonus', Bonus: 'Feat', AType: 'Simple', Amount: '4' },
  } as unknown as Feat

  it('nonEpicHD = 200 (Fighter, full) + 25 (Epic, halved) = 225 → +225 HP at 4 style feats', () => {
    const input = { ...emptyInput(), allClasses: [fighterClass, epicClass], allFeats: [styleFeat] }
    const b = { ...baseBuild(5), featChoices: { '1': 'Style Feat' } }
    // Bug (V3 before fix): the per-class loop summed Epic at FULL weight (50)
    // in addition to the explicit halved top-up (25), so nonEpicHD = 275 and
    // the style bonus overcounted by 50.
    expect(computeBuildStats(input, b).total('hp')).toBe(250 + 225)
  })
})

describe('CON-mod HP delta correction scales by total character level, not heroic-only', () => {
  // AbilityBonus effects from trained feats land in the map AFTER the "quick"
  // pre-gear CON resolve (Phase 1.5) and BEFORE the fully-resolved Phase 2
  // read, so this feat reproduces the same quick/full CON split a gear item
  // would (see buildStats.ts's `quickResolve`/`conModFull`).
  const conBoostFeat = {
    Name: 'Con Boost', Acquire: 'Train',
    Effect: { Type: 'AbilityBonus', Bonus: 'Enhancement', AType: 'Simple', Amount: '6', Item: 'Constitution' },
  } as unknown as Feat

  it('CON 10→16 (mod 0→3) at heroic 20 + epic 5 = +75 HP (3 × 25), not +60 (3 × 20)', () => {
    const input = { ...emptyInput(), allClasses: [fighterClass, epicClass], allFeats: [conBoostFeat] }
    const b = { ...baseBuild(5), featChoices: { '1': 'Con Boost' } }
    // Base class HP (250, from the fix above) + CON delta (3 mod × 25 total
    // character levels = 75). Bug (V3 before fix): delta scaled by heroic
    // `build.totalLevel` (20) → +60, undercounting by 15.
    expect(computeBuildStats(input, b).total('hp')).toBe(250 + 75)
  })
})

describe('HitpointsReaper (APCount-style) is capped separately from flat Reaper Hitpoints effects', () => {
  const reaperFlat = {
    Name: 'Reaper Defense (flat)', Acquire: 'Train',
    Effect: {
      Type: 'Hitpoints', Bonus: 'Reaper', AType: 'Simple', Amount: '130',
      Requirements: { Requirement: { Type: 'Stance', Item: 'Reaper' } },
    },
  } as unknown as Feat
  const reaperApCount = {
    Name: 'Reaper AP Bonus', Acquire: 'Train',
    Effect: { Type: 'HitpointsReaper', Bonus: 'Reaper', AType: 'Simple', Amount: '500' },
  } as unknown as Feat

  it('level 5 (cap 100): flat +130 always applies uncapped, AP-style clips to the cap (100), not the combined 630', () => {
    const input = {
      ...emptyInput(), allClasses: [fighterClass],
      allFeats: [reaperFlat, reaperApCount],
    }
    const b = {
      ...makeEmptyBuild(),
      classes: [{ name: 'Fighter', levels: 5 }],
      levelClasses: Array(5).fill('Fighter'),
      totalLevel: 5,
      // emptyBuild() defaults epicLevels/legendaryLevels to 10/4 — zero both
      // so total character level is exactly the heroic 5 this test assumes.
      epicLevels: 0,
      legendaryLevels: 0,
      baseAbilities: {
        Strength: 10, Dexterity: 10, Constitution: 10,
        Intelligence: 10, Wisdom: 10, Charisma: 10,
      },
      activeBuffs: ['Reaper'],
      featChoices: { '1': 'Reaper Defense (flat)', '2': 'Reaper AP Bonus' },
    }
    // Fighter 5 × d10 = 50 base HP. Reaper: flat 130 (never capped) + AP-style
    // capped at reaperHpCap(level 6) = 100. Total reaper = 230.
    // Bug (V3 before fix): both effects shared one 'hp'-Reaper bucket, so the
    // cap (using heroic level only, same value here) applied to their COMBINED
    // 630, clipping the whole thing down to 100 — losing the flat 130 too.
    expect(computeBuildStats(input, b).total('hp')).toBe(50 + 230)
  })

  it('level 20 + epic 5 (total char level 25, cap level 26 → uncapped): both apply in full', () => {
    const input = { ...emptyInput(), allClasses: [fighterClass, epicClass], allFeats: [reaperFlat, reaperApCount] }
    const b = { ...baseBuild(5), activeBuffs: ['Reaper'], featChoices: { '1': 'Reaper Defense (flat)', '2': 'Reaper AP Bonus' } }
    // Base class HP 250 (from the fix above) + reaper 130 + 500 (no cap
    // above level 25). Bug (V3 before fix): cap used heroic totalLevel (20)
    // → reaperHpCap(20) = 400, clipping the combined 630 down to 400.
    expect(computeBuildStats(input, b).total('hp')).toBe(250 + 630)
  })
})
