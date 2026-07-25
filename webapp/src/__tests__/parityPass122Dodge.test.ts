/**
 * Parity pass 122 — dodge root causes (plus one oracle-side fix):
 *
 * A. Effect_DodgeBonusTowerShield is a DEAD effect type in V2 — no
 *    breakdown registers it (BreakdownItemDodge registers only
 *    Effect_DodgeBonus; the tower-shield cap is fed exclusively by
 *    Effect_MaxDexBonusTowerShield → Breakdown_MaxDexBonusShields).
 *    V3 routed it into 'dodge', double-counting Mobility's combined
 *    DodgeBonusTowerShield/MaxDexBonusTowerShield block (+2 dodge on
 *    every Mobility build).
 *
 * B. Automatic feats were granted once per CLASS that lists them —
 *    V2 Build::AutomaticFeats (Build.cpp:2493-2564) keeps a running
 *    cross-class count capped at Feat::MaxTimesAcquire, whose default
 *    is 1 (Feat.h:65). "Flurry of Blows" listed by both Sacred Fist
 *    and Dragon Disciple applied twice in V3.
 *
 * (Oracle-side, no V3 test: v2calc's headless slider fallback used
 * m_stacks=1; a real untouched slider is position 0 — fixed in the
 * V2CALC_LINUX branch of Effect.cpp.)
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment, Effect,
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

function baseCtx(): EffectContext {
  return {
    race: 'Human',
    alignment: 'True Neutral',
    classLevels: {},
    baseClassLevels: {},
    totalLevel: 20,
    feats: new Set(),
    enhancements: new Set(),
    abilityTotals: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    stances: new Set(),
    bab: 0,
    weaponTypes: new Set(),
  }
}

// ---------------------------------------------------------------------------
// A — DodgeBonusTowerShield no longer feeds dodge
// ---------------------------------------------------------------------------

describe('A — DodgeBonusTowerShield is dead in V2 and contributes nothing', () => {
  it('parses to no bonuses', () => {
    const eff: Effect = {
      Type: 'DodgeBonusTowerShield', Bonus: 'Feat', AType: 'Simple', Amount: 2,
    } as unknown as Effect
    expect(parseEffect(eff, 1, 'Feat: Mobility', 0, 0, baseCtx())).toHaveLength(0)
  })

  it('a Mobility-style multi-Type block yields exactly one dodge entry (from DodgeBonus) plus mdbShields', () => {
    const mobility: Feat = {
      Name: 'Mobility',
      Effect: [
        { Type: 'DodgeBonus', Bonus: 'Feat', AType: 'Simple', Amount: 2 },
        { Type: 'MaxDexBonus', Bonus: 'Feat', AType: 'Simple', Amount: 2 },
        // V2 data packs both tower-shield types into ONE Effect block.
        { Type: ['DodgeBonusTowerShield', 'MaxDexBonusTowerShield'], Bonus: 'Feat', AType: 'Simple', Amount: 2 },
      ],
    } as unknown as Feat
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      featChoices: { 'Standard-1': 'Mobility' },
    }
    const stats = computeBuildStats({ ...emptyInput(), allFeats: [mobility] } as BuildStatsInput, build)
    const dodgeRows = stats.resolve('dodge').bonuses.filter(b => b.source.includes('Mobility'))
    expect(dodgeRows).toHaveLength(1)
    expect(dodgeRows[0].value).toBe(2)
    // The MaxDex sibling still feeds the shields cap key.
    expect(stats.resolve('mdbShields').bonuses.some(b => b.source.includes('Mobility'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// B — cross-class automatic-feat dedup
// ---------------------------------------------------------------------------

const flurry: Feat = {
  Name: 'Test Flurry',
  Acquire: 'Automatic',
  // No MaxTimesAcquire → V2 default 1.
  Effect: { Type: 'DodgeBonus', Bonus: 'Feat', AType: 'Simple', Amount: 6 },
} as unknown as Feat

const repeatable: Feat = {
  Name: 'Test Power',
  Acquire: 'Automatic',
  MaxTimesAcquire: 10,
  Effect: { Type: 'MeleePower', Bonus: 'Feat', AType: 'Simple', Amount: 6 },
} as unknown as Feat

const classA: DDOClass = {
  Name: 'ClassA', HitPoints: 8,
  AutomaticFeats: [{ Level: 1, Feats: 'Test Flurry' }],
} as unknown as DDOClass

const classB: DDOClass = {
  Name: 'ClassB', HitPoints: 8,
  AutomaticFeats: [{ Level: 1, Feats: 'Test Flurry' }],
} as unknown as DDOClass

const classC: DDOClass = {
  Name: 'ClassC', HitPoints: 8,
  AutomaticFeats: [
    { Level: 1, Feats: 'Test Power' },
    { Level: 2, Feats: 'Test Power' },
    { Level: 3, Feats: 'Test Power' },
  ],
} as unknown as DDOClass

describe('B — automatic feats dedup across classes at MaxTimesAcquire (default 1)', () => {
  it('a feat granted by two classes applies once', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      classes: [{ name: 'ClassA', levels: 10 }, { name: 'ClassB', levels: 10 }],
    }
    const stats = computeBuildStats({
      ...emptyInput(), allClasses: [classA, classB], allFeats: [flurry],
    } as BuildStatsInput, build)
    const rows = stats.resolve('dodge').bonuses.filter(b => b.source.includes('Test Flurry'))
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe(6)
  })

  it('explicit MaxTimesAcquire still allows repeat grants within a class', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      classes: [{ name: 'ClassC', levels: 10 }],
    }
    const stats = computeBuildStats({
      ...emptyInput(), allClasses: [classC], allFeats: [repeatable],
    } as BuildStatsInput, build)
    const row = stats.resolve('melee.power').bonuses.find(b => b.source.includes('Test Power'))
    expect(row?.value).toBe(18)  // 6 × 3 grants, under the cap of 10
  })
})
