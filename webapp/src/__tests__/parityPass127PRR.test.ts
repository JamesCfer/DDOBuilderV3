/**
 * Parity pass 127 — four PRR/MRR root causes (round-2 agent, verified by
 * line-item diff against V2's real AllActiveEffects() dump):
 *
 * A. Attack feat "Equipped {Buckler|Small|Large|Tower} Shield PRR/MRR
 *    Bonus" (0/5/10/15 to both PRR and MRR) was never modeled.
 * B. EffectContext.featCounts was declared but never populated — every
 *    AType=FeatCount effect (Religious/Wilderness Lore tables) collapsed
 *    to its 0-or-1 row. Counts come from trained/past-life/favor/special
 *    feats PLUS class AutomaticFeats grants (Bard grants Religious Lore
 *    ×9), capped at MaxTimesAcquire.
 * C. A <Weapon>-tagged shield in the off-hand (bashing bucklers) wrongly
 *    auto-activated "Two Weapon Fighting" — V2 treats Sword-and-Board as
 *    not dual-wielding (James Dodge v8's Tempest TWF-gated +2 PRR/MRR).
 * D. A missing <AType> deserializes to V2's Amount_Unknown and contributes
 *    0 (TotalAmount() has no case for it) — V3 defaulted it to 'Stacks'
 *    (Shadowstrike Rare filigree's authoring oversight gave +4 phantom PRR).
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

const largeShield: Item = { Name: 'Test Aegis', Weapon: 'Large Shield' } as unknown as Item
const smallShield: Item = { Name: 'Test Targe', Weapon: 'Small Shield' } as unknown as Item
const buckler: Item = { Name: 'Test Buckler', Weapon: 'Buckler' } as unknown as Item
const kukri: Item = { Name: 'Test Kukri', Weapon: 'Kukri' } as unknown as Item

// ---------------------------------------------------------------------------
// A — Attack feat shield PRR/MRR base
// ---------------------------------------------------------------------------

describe('A — Attack feat per-shield-size PRR/MRR base (Feats.xml 0/5/10/15)', () => {
  it('Large Shield grants +10 PRR and +10 MRR', () => {
    const stats = computeBuildStats({
      ...emptyInput(), gearItems: { 'Off Hand': largeShield },
    } as BuildStatsInput, { ...makeEmptyBuild(), totalLevel: 20 })
    const prr = stats.resolve('prr').bonuses.find(b => b.source.includes('equipped shield'))
    const mrr = stats.resolve('mrr').bonuses.find(b => b.source.includes('equipped shield'))
    expect(prr?.value).toBe(10)
    expect(mrr?.value).toBe(10)
  })

  it('Small Shield grants +5; a Buckler grants nothing', () => {
    const small = computeBuildStats({
      ...emptyInput(), gearItems: { 'Off Hand': smallShield },
    } as BuildStatsInput, { ...makeEmptyBuild(), totalLevel: 20 })
    expect(small.resolve('prr').bonuses.find(b => b.source.includes('equipped shield'))?.value).toBe(5)
    const buck = computeBuildStats({
      ...emptyInput(), gearItems: { 'Off Hand': buckler },
    } as BuildStatsInput, { ...makeEmptyBuild(), totalLevel: 20 })
    expect(buck.resolve('prr').bonuses.some(b => b.source.includes('equipped shield'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// B — FeatCount reads real trained counts incl. class auto-feat grants
// ---------------------------------------------------------------------------

const religiousLore: Feat = {
  Name: 'Religious Lore', Acquire: 'Automatic', MaxTimesAcquire: 20,
} as unknown as Feat

// FeatCount table: Amount[i] = i, so the resolved value IS the count read.
const COUNT_TABLE = Array.from({ length: 21 }, (_, i) => i).join(' ')
const temperanceFeat: Feat = {
  Name: 'Temperance Carrier',
  Effect: {
    Type: 'MRR', Bonus: 'Quality', AType: 'FeatCount',
    StackSource: 'Religious Lore', Amount: COUNT_TABLE,
  },
} as unknown as Feat

const bardish: DDOClass = {
  Name: 'Bardish', HitPoints: 6,
  AutomaticFeats: Array.from({ length: 9 }, (_, i) => ({ Level: i + 1, Feats: 'Religious Lore' })),
} as unknown as DDOClass

describe('B — AType=FeatCount counts class AutomaticFeats grants (V2 TrainedCount)', () => {
  it('9 class grants of Religious Lore → FeatCount table row 9', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      classes: [{ name: 'Bardish', levels: 20 }],
      featChoices: { 'Standard-1': 'Temperance Carrier' },
    }
    const stats = computeBuildStats({
      ...emptyInput(), allClasses: [bardish], allFeats: [religiousLore, temperanceFeat],
    } as BuildStatsInput, build)
    const row = stats.resolve('mrr').bonuses.find(b => b.source.includes('Temperance Carrier'))
    expect(row?.value).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// C — off-hand shield never activates Two Weapon Fighting
// ---------------------------------------------------------------------------

const twfGated: Feat = {
  Name: 'TWF Gated Bonus',
  Acquire: 'Automatic',
  Effect: {
    Type: 'PRR', Bonus: 'Shield', AType: 'Simple', Amount: 2,
    Requirements: { Requirement: { Type: 'Stance', Item: 'Two Weapon Fighting' } },
  },
} as unknown as Feat

const fighterC: DDOClass = {
  Name: 'FighterC', HitPoints: 10,
  AutomaticFeats: [{ Level: 1, Feats: 'TWF Gated Bonus' }],
} as unknown as DDOClass

describe('C — Sword-and-Board is not Two Weapon Fighting (V2 stance parity)', () => {
  function swordBoard(off: Item) {
    return computeBuildStats({
      ...emptyInput(), allClasses: [fighterC], allFeats: [twfGated],
      // V2's TWF auto stance requires GroupMember "One Handed" on BOTH
      // hands (Stances.xml), resolved through WeaponGroupings.xml.
      allWeaponGroups: [{ Name: 'One Handed', Weapon: ['Kukri'] }],
      gearItems: { 'Main Hand': kukri, 'Off Hand': off },
    } as BuildStatsInput, {
      ...makeEmptyBuild(), totalLevel: 20,
      classes: [{ name: 'FighterC', levels: 20 }],
    })
  }

  it('kukri + weapon-tagged buckler does NOT fire TWF-gated effects', () => {
    const stats = swordBoard(buckler)
    expect(stats.resolve('prr').bonuses.some(b => b.source.includes('TWF Gated'))).toBe(false)
  })

  it('kukri + kukri (real dual wield) DOES fire them', () => {
    const stats = swordBoard({ Name: 'Test Kukri 2', Weapon: 'Kukri' } as unknown as Item)
    expect(stats.resolve('prr').bonuses.some(b => b.source.includes('TWF Gated'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// D — missing AType contributes 0 (V2 Amount_Unknown)
// ---------------------------------------------------------------------------

describe('D — missing <AType> is V2 Amount_Unknown: silent zero, not Stacks', () => {
  it('an effect with no AType parses to no numeric bonuses', () => {
    const eff = { Type: 'PRR', Bonus: 'Stacking', Amount: 2 } as unknown as Effect
    expect(parseEffect(eff, 1, 'Shadowstrike Rare', 0, 0, baseCtx())).toHaveLength(0)
  })

  it('the same effect with an explicit AType still contributes', () => {
    const eff = { Type: 'PRR', Bonus: 'Stacking', AType: 'Simple', Amount: 2 } as unknown as Effect
    const out = parseEffect(eff, 1, 'Test', 0, 0, baseCtx())
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe(2)
  })
})
