/**
 * Parity pass 133 — full-analytics widening (oracle now emits and the referee
 * compares skills, tactical DCs, spell powers, resistances, ki, tumble
 * charges, …). Root causes fixed while widening, each oracle-verified on
 * YingsMonk:
 *  1. Snapshot* StackSources (e.g. Henshin Mystic "Clear Your Mind" Wis/2)
 *     read the PERSISTED gear-set ability snapshot (Build::
 *     SnapshotAbilityValue) when GearSetSnapshot names an existing set —
 *     not the live ability total.
 *  2. SpellFocusMastery's template is SpellDC Item=All → dc.All (it was
 *     mis-mapped to spell penetration).
 *  3. Buff::UpdatedEffects Value1/Value2 even/odd split across multi-effect
 *     item-buff templates (Deception "+12 to hit / +18 damage").
 *  4. V2's universal "Attack" feat carries the Tumble base charges (2).
 *  5. The auto-stance family filter only strips the BUILD's race stance —
 *     an iconic past-life stance sharing a race's name must survive.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { parseEffect, parseItemBuff } from '../lib/effectParser'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, Feat, Race } from '../types/ddo'
import type { Effect, ItemBuffTemplate } from '../types/ddo'

const fighter = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1 1',
} as unknown as DDOClass

function input(over: Partial<BuildStatsInput>): BuildStatsInput {
  return {
    allRaces: [], allClasses: [fighter], allFeats: [], allTrees: [],
    allSelfBuffs: [], allAugments: [], allSetBonuses: [],
    allFiligreeBonuses: [], allFiligrees: [], allWeaponGroups: [],
    gearItems: {},
    ...over,
  } as BuildStatsInput
}

function build(over: Partial<ReturnType<typeof makeEmptyBuild>>) {
  return {
    ...makeEmptyBuild(),
    totalLevel: 20,
    classes: [{ name: 'Fighter', levels: 20 }],
    ...over,
  }
}

// ---------------------------------------------------------------------------
// 1 — Snapshot* StackSources read the persisted gear-set snapshot
// ---------------------------------------------------------------------------

describe('SnapshotWisdom StackSource (V2 Build::SnapshotAbilityValue)', () => {
  const tranceFeat = {
    Name: 'Test Trance', Acquire: 'Automatic',
    Effect: {
      Type: 'AbilityBonus', Bonus: 'Insightful', Item: 'Strength',
      AType: 'HalfAbilityMod', StackSource: 'SnapshotWisdom',
    },
  } as unknown as Feat
  const cls = {
    ...fighter, AutomaticFeats: [{ Level: 1, Feats: 'Test Trance' }],
  } as unknown as DDOClass

  it('uses the persisted snapshot when GearSetSnapshot names an existing set', () => {
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [tranceFeat] }),
      build({
        gearSetSnapshot: 'Trance',
        namedGearSets: { Trance: {} },
        gearSetSnapshots: { Trance: { Wisdom: 113 } },
      }),
    )
    // (113-10)/2 = 51 → /2 truncated = 25 (YingsMonk oracle value)
    const b = stats.resolve('ability.Strength').bonuses
      .find(x => x.source.includes('Test Trance'))
    expect(b?.value).toBe(25)
  })

  it('falls back to the live ability total without a snapshot gear set', () => {
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [tranceFeat] }),
      build({ baseAbilities: { ...makeEmptyBuild().baseAbilities, Wisdom: 18 } }),
    )
    // live WIS 18 → mod 4 → half = 2
    const b = stats.resolve('ability.Strength').bonuses
      .find(x => x.source.includes('Test Trance'))
    expect(b?.value).toBe(2)
  })

  it('a snapshot set MISSING the ability reads 0 (V2 optional default)', () => {
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [tranceFeat] }),
      build({
        gearSetSnapshot: 'Trance',
        namedGearSets: { Trance: {} },
        gearSetSnapshots: { Trance: { Strength: 30 } },   // no Wisdom tag
        baseAbilities: { ...makeEmptyBuild().baseAbilities, Wisdom: 18 },
      }),
    )
    // snapshot Wisdom defaults 0 → mod -5 → trunc(-5/2) = -2, NOT live +2
    const b = stats.resolve('ability.Strength').bonuses
      .find(x => x.source.includes('Test Trance'))
    expect(b?.value).toBe(-2)
  })
})

// ---------------------------------------------------------------------------
// 2 — SpellFocusMastery is a SpellDC Item=All effect
// ---------------------------------------------------------------------------

describe('SpellFocusMastery (ItemBuffs.xml template: SpellDC All)', () => {
  it('maps to dc.All, not spell penetration', () => {
    const eff = {
      Type: 'SpellFocusMastery', Bonus: 'Equipment', AType: 'Simple', Amount: 5,
    } as unknown as Effect
    const parsed = parseEffect(eff, 1, 'Test Item', 20, 0)
    expect(parsed.map(p => p.statKey)).toContain('dc.All')
    expect(parsed.map(p => p.statKey)).not.toContain('spellPenetration')
  })
})

// ---------------------------------------------------------------------------
// 3 — ItemBuff Value1/Value2 even/odd split (Buff::UpdatedEffects)
// ---------------------------------------------------------------------------

describe('ItemBuff Value1/Value2 split across template effects', () => {
  const template = {
    Type: 'TestSplitBuff',
    Effect: [
      { Type: 'AbilityBonus', Bonus: 'Enhancement', AType: 'Simple', Item: 'Strength', Amount: 0 },
      { Type: 'AbilityBonus', Bonus: 'Enhancement', AType: 'Simple', Item: 'Dexterity', Amount: 0 },
    ],
  } as unknown as ItemBuffTemplate
  const catalogue = new Map([[template.Type, template]])

  it('effect[0] gets Value1, effect[1] gets Value2', () => {
    const parsed = parseItemBuff(
      { Type: 'TestSplitBuff', Value1: 12, Value2: 18 }, 'Test Item', catalogue)
    const str = parsed.find(p => p.statKey === 'ability.Strength')
    const dex = parsed.find(p => p.statKey === 'ability.Dexterity')
    expect(str?.value).toBe(12)
    expect(dex?.value).toBe(18)
  })

  it('with only Value1, every template effect gets it', () => {
    const parsed = parseItemBuff(
      { Type: 'TestSplitBuff', Value1: 12 }, 'Test Item', catalogue)
    expect(parsed.find(p => p.statKey === 'ability.Strength')?.value).toBe(12)
    expect(parsed.find(p => p.statKey === 'ability.Dexterity')?.value).toBe(12)
  })
})

// ---------------------------------------------------------------------------
// 4 — the universal "Attack" feat's Tumble base charges
// ---------------------------------------------------------------------------

describe('Tumble charges from the universal "Attack" feat', () => {
  it('base 2 charges apply to every build', () => {
    const attack = {
      Name: 'Attack', Acquire: 'Automatic',
      Effect: [
        { DisplayName: 'Tumble Base Charges', Type: 'TumbleCharge', Bonus: 'Feat', AType: 'Simple', Amount: 2 },
        {
          DisplayName: '10 Skill Ranks in Tumble', Type: 'TumbleCharge',
          Bonus: 'Enhancement', AType: 'Simple', Amount: 1,
          Requirements: { Requirement: [{ Type: 'Skill', Item: 'Tumble', Value: 10 }] },
        },
      ],
    } as unknown as Feat
    const stats = computeBuildStats(input({ allFeats: [attack] }), build({}))
    // no Tumble ranks → only the unconditional base 2
    expect(stats.total('tumbleCharge')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 5 — auto-stance family filter only strips the build's OWN race stance
// ---------------------------------------------------------------------------

describe('iconic past-life stance vs race-name collision', () => {
  it('a persisted stance sharing another race\'s name survives', () => {
    const sensor = {
      Name: 'Scourge Sensor', Acquire: 'Automatic',
      Effect: {
        Type: 'SaveBonus', Bonus: 'Enhancement', Item: 'All',
        AType: 'Simple', Amount: 3,
        Requirements: { Requirement: { Type: 'Stance', Item: 'Aasimar Scourge' } },
      },
    } as unknown as Feat
    const cls = {
      ...fighter, AutomaticFeats: [{ Level: 1, Feats: 'Scourge Sensor' }],
    } as unknown as DDOClass
    const stats = computeBuildStats(
      input({
        allClasses: [cls], allFeats: [sensor],
        // the catalogue contains a race with the SAME name as the stance —
        // the old filter swallowed the persisted stance for every race name
        allRaces: [{ Name: 'Aasimar Scourge' } as unknown as Race],
      }),
      build({ activeBuffs: ['Aasimar Scourge'] }),
    )
    expect(stats.resolve('save.Will').bonuses
      .some(b => b.source.includes('Scourge Sensor'))).toBe(true)
  })
})
