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
import { absorptionTotal } from '../lib/bonus'
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

// ---------------------------------------------------------------------------
// 6 — Skill requirements gate on TRAINED ranks (+tome), not resolved totals
// ---------------------------------------------------------------------------

describe('Skill requirement (V2 Requirement::EvaluateSkill = ranks + tome)', () => {
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
  // +30 Tumble from a feat — inflates the TOTAL, not the ranks
  const tumbleItemFeat = {
    Name: 'Tumble Booster', Acquire: 'Automatic',
    Effect: { Type: 'SkillBonus', Bonus: 'Enhancement', Item: 'Tumble', AType: 'Simple', Amount: 30 },
  } as unknown as Feat
  const cls = {
    ...fighter, AutomaticFeats: [{ Level: 1, Feats: 'Tumble Booster' }],
  } as unknown as DDOClass

  it('a big skill-total bonus does NOT satisfy a rank requirement (Maetrim)', () => {
    const stats = computeBuildStats(
      input({ allClasses: [cls], allFeats: [attack, tumbleItemFeat] }),
      build({}),
    )
    expect(stats.total('tumbleCharge')).toBe(2)
  })

  it('actual trained ranks DO satisfy it', () => {
    const clsWithTumble = {
      ...fighter, ClassSkill: ['Tumble'],
      AutomaticFeats: [{ Level: 1, Feats: 'Tumble Booster' }],
    } as unknown as DDOClass
    const stats = computeBuildStats(
      input({ allClasses: [clsWithTumble], allFeats: [attack, tumbleItemFeat] }),
      build({ skillRanks: { Tumble: 10 } }),
    )
    expect(stats.total('tumbleCharge')).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// 7 — skill tomes: level cap (V2 Character::SkillTomeValue)
// ---------------------------------------------------------------------------

describe('skill tome level cap', () => {
  it('a +5 tome applies only +2 at character level 1', () => {
    const stats = computeBuildStats(
      input({}),
      build({ totalLevel: 1, epicLevels: 0, legendaryLevels: 0, classes: [{ name: 'Fighter', levels: 1 }], skillTomes: { Jump: 5 } }),
    )
    const tome = stats.resolve('skill.Jump').bonuses.find(b => b.type === 'Tome')
    expect(tome?.value).toBe(2)
  })

  it('the full +5 applies at level 20', () => {
    const stats = computeBuildStats(
      input({}),
      build({ skillTomes: { Jump: 5 } }),
    )
    const tome = stats.resolve('skill.Jump').bonuses.find(b => b.type === 'Tome')
    expect(tome?.value).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// 8 — absorption: multiplicative with V2's identical-effect merge
// ---------------------------------------------------------------------------

describe('absorptionTotal (V2 BreakdownItemEnergyAbsorption::Total)', () => {
  const mk = (value: number, v2Name?: string) => ({
    value, type: 'Feat', source: 'test', active: true,
    ...(v2Name !== undefined ? { v2Name } : {}),
  })

  it('same-name same-value effects merge into ONE factor', () => {
    // five ×3% past-life passives → single (1-0.15), NOT (1-0.03)^5
    const bonuses = Array.from({ length: 5 }, () => mk(3, 'EPL: Energy Absorbance'))
    expect(absorptionTotal(bonuses as never)).toBeCloseTo(15, 5)
  })

  it('same-name DIFFERENT-value effects stay separate factors', () => {
    // passives 15% + Block Energy 30% → 100-100*(0.85*0.70) = 40.5
    const bonuses = [mk(15, 'EPL: Energy Absorbance'), mk(30, 'EPL: Energy Absorbance')]
    expect(absorptionTotal(bonuses as never)).toBeCloseTo(40.5, 5)
  })

  it('anonymous bonuses each multiply separately', () => {
    const bonuses = [mk(20), mk(20)]
    expect(absorptionTotal(bonuses as never)).toBeCloseTo(36, 5)
  })

  it('inactive bonuses are ignored', () => {
    const bonuses = [mk(20), { ...mk(50), active: false }]
    expect(absorptionTotal(bonuses as never)).toBeCloseTo(20, 5)
  })
})
