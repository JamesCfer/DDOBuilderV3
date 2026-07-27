/**
 * Parity pass 129 — `ctxBAB` (the resolved-BAB value fed to `AType=BAB`
 * effect resolution, e.g. Rapid Shot / Multitude of Missiles' "N x your BAB"
 * Ranged Power) had two independent bugs that happened to partially cancel
 * on some builds and compound on others:
 *
 * (A) Epic/Legendary class levels were double-counted. `ctxClassLevels`
 * already carries 'Epic'/'Legendary' entries (set unconditionally from
 * `build.epicLevels`/`build.legendaryLevels` a few lines above), so the main
 * per-class loop already covers them once — two redundant follow-up `if`
 * blocks added `classBAB(epicCls, …)`/`classBAB(legCls, …)` a SECOND time.
 *
 * (B) `ctxBAB` never included an active `OverrideBAB` boost (e.g. Tenser's
 * Transformation, which raises BAB to character level). V2's
 * `Effect::TotalAmount` `Amount_BAB` case (`Effect.cpp:1121-1145`) reads the
 * LIVE, fully-resolved `Breakdown_BAB.Total()` — which already folds in any
 * active override — not just the raw per-class sum. V3 computed `ctxBAB`
 * once, up front, purely from class BAB tables.
 *
 * Real-corpus symptom (oracleDiff.ts vs the compiled v2calc oracle):
 * "Max imbue.DDOBuild" (Wizard/Dragon Disciple/Rogue L34, trains "Tenser's
 * Transformation" AND "Multitude of Missiles") has real V2 BAB 25 (the
 * override boosts it from 15), so Multitude of Missiles' `RangedPower
 * AType=BAB Amount=2` effect resolves to `2 x 25 = 50`. V3's buggy `ctxBAB`
 * — 15 (class sum) + 5 (Epic double-count) + 0 (Legendary double-count) = 20
 * — gave `2 x 20 = 40`, ten short, purely by coincidence: bug (A) partially
 * masked bug (B) on this particular build. Fixing only (A) (an earlier,
 * incomplete version of this pass) made `ctxBAB` drop to 15 with the
 * override still missing entirely — `2 x 15 = 30`, twenty short — and
 * newly exposed the same missing-override gap on "Nerfer.DDOBuild", which
 * had been accidentally masked by the double-count too.
 *
 * Fix: removed the double-count (A), AND threaded the fully-resolved `bab`
 * stat total (which already folds in any override boost, computed once
 * `babOverride` is known) back into `ctxBAB` via the SAME fixed-point
 * iteration `buildStatMap` already uses for ability totals/skills/caster
 * levels (Done item "Fixed-point ability resolution", #93) — iteration 1
 * falls back to the raw class-table sum (no override known yet), iteration
 * 2+ uses the previous iteration's resolved `bab` (which already includes
 * the override boost, itself independent of `ctxBAB`), converging
 * immediately since `bab` doesn't depend on `ctxBAB`.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../lib/buildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, Feat, Race, Item, OptionalBuff, SetBonus, Augment, FiligreeSetBonus, Filigree } from '../types/ddo'

// Deliberately small, uncapped-BAB tables (real Fighter/Epic/Legendary
// progressions are proportionally identical but hit MAX_BAB=25 too fast to
// isolate the double-count from the cap).
const fighterClass: DDOClass = {
  Name: 'Fighter', HitPoints: 12, Fortitude: 'Type1', Reflex: 'Type2', Will: 'Type2',
  BAB: '0 1 2 3 4 5 6',
} as unknown as DDOClass

const epicClass: DDOClass = {
  Name: 'Epic', HitPoints: 10, Fortitude: 'Type1', Reflex: 'Type1', Will: 'Type1',
  BAB: '0 1 1',
} as unknown as DDOClass

const legendaryClass: DDOClass = {
  Name: 'Legendary', HitPoints: 10, Fortitude: 'Type1', Reflex: 'Type1', Will: 'Type1',
  BAB: '0 0 0',
} as unknown as DDOClass

// Mirrors Rapid Shot / Multitude of Missiles: "N x your BAB" Ranged Power,
// always active (no Stance gate) so the test isolates the ctxBAB value.
const babRangedPowerFeat: Feat = {
  Name: 'Test BAB Ranged Power',
  Effect: {
    Type: 'RangedPower',
    Bonus: 'Feat',
    AType: 'BAB',
    Amount: 2,
  },
} as unknown as Feat

// Mirrors Tenser's Transformation (SelfAndPartyBuffs.xml): boosts BAB to
// character level while active.
const overrideBabBuff: OptionalBuff = {
  Name: 'Test BAB Override Buff',
  Effect: {
    Type: 'OverrideBAB',
    Bonus: 'Enhancement',
    AType: 'Simple',
    Amount: 1,
  },
} as unknown as OptionalBuff

function baseInput(): BuildStatsInput {
  return {
    allRaces: [] as Race[],
    allClasses: [fighterClass, epicClass, legendaryClass],
    allFeats: [babRangedPowerFeat],
    allTrees: [],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [overrideBabBuff],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

function testBuild(overrideActive: boolean) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 6 }],
    levelClasses: Array.from({ length: 6 }, () => 'Fighter'),
    totalLevel: 6,
    epicLevels: 2,
    legendaryLevels: 2,
    featChoices: { slot1: 'Test BAB Ranged Power' },
    selfBuffs: overrideActive ? ['Test BAB Override Buff'] : [],
  }
}

describe('ctxBAB double-count + missing override fixes (pass 129)', () => {
  it('resolves BAB as Fighter(6)+Epic(2)+Legendary(2) counted ONCE each, not twice', () => {
    const stats = computeBuildStats(baseInput(), testBuild(false))
    // classBAB: Fighter[6]=6, Epic[2]=1, Legendary[2]=0 -> bab = 7
    expect(stats.total('bab')).toBe(7)
    // "N x BAB" feat effect: 2 x 7 = 14, NOT 2 x (7 + epic-dup 1 + legendary-dup 0) = 16
    expect(stats.total('ranged.power')).toBe(14)
  })

  it('feeds an active OverrideBAB boost back into AType=BAB effect resolution', () => {
    const stats = computeBuildStats(baseInput(), testBuild(true))
    // charLevel = 6 + 2 + 2 = 10; override boosts bab to min(MAX_BAB, 10) = 10.
    expect(stats.total('bab')).toBe(10)
    // "N x BAB" feat effect must see the OVERRIDDEN bab (10), not the raw
    // class-table sum (7): 2 x 10 = 20, not 2 x 7 = 14.
    expect(stats.total('ranged.power')).toBe(20)
  })
})
