/**
 * Parity gap — non-gear "item pool" sources bypass Highest-Only stacking.
 *
 * V2 source: Build::NotifyItemEffect (Build.cpp:672-708) always calls
 * BreakdownItem::ItemEffectApplied, which adds the effect to m_itemEffects
 * (BreakdownItem.cpp:1086-1095) — the pool that RemoveNonStacking's "Highest
 * Only" bonus-type rule applies to (BreakdownItem.cpp:730-789). V2 routes
 * ALL of the following through NotifyItemEffect, so they join that same
 * gear pool and stack against gear/each other per bonus type, NOT
 * unconditionally:
 *   - Build::ApplySetBonus       (Build.cpp:5267-5276)
 *   - Build::ApplyFiligree       (Build.cpp:5225-5262, both normal + rare)
 *   - Build::NotifyOptionalBuff  (Build.cpp:6065-6074, self/party buffs)
 *   - Build::ApplyGuildBuffs     (Build.cpp:5967-6062)
 *
 * V3's buildStats.ts called addParsed() for these four sources without the
 * fromGear=true flag, so they landed in the "always stacks" bucket
 * (resolveBonus in bonus.ts) instead of the gear Highest-Only bucket. Net
 * effect: any Highest-Only bonus type (Enhancement/Insightful/Legendary/
 * Artifact/etc.) granted by a set bonus, filigree, self-buff, or guild buff
 * incorrectly stacks on top of a gear/augment bonus of the same type instead
 * of the higher one winning — a systematic over-count (matches the reported
 * cc1-gearset Fortification Bypass 84-vs-71 diff in PARITY_TODO.md).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment, GuildBuff,
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

// A gear item granting +10 Enhancement Fortification Bypass directly
// (native item Buff — parsed via parseItemBuff, V2 Item::UpdatedEffects).
const gearItem: Item = {
  Name: 'Boots of Bypass',
  Buff: { Type: 'FortificationBypass', Value1: 10, BonusType: 'Enhancement' },
} as unknown as Item

describe('non-gear item-pool sources obey Highest-Only stacking (V2 NotifyItemEffect parity)', () => {
  it('a set bonus of the same Highest-Only type as gear does NOT stack on top of it', () => {
    const fortSet: SetBonus = {
      Type: 'Test Fortification Set',
      Buff: [
        { EquippedCount: 1, Effect: { Type: 'FortificationBypass', Bonus: 'Enhancement', AType: 'Simple', Amount: 15 } },
      ],
    } as unknown as SetBonus

    const build = {
      ...makeEmptyBuild(),
      gear: { Boots: 'Boots of Bypass', Ring1: 'Set Ring' } as Record<string, string>,
      augmentChoices: { 'Ring1:Set Bonus Slot:0': 'Grants Fort Set' },
    }
    const setAugment: Augment = {
      Name: 'Grants Fort Set',
      Type: 'Set Bonus Slot',
      SetBonus: 'Test Fortification Set',
    }

    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Boots: gearItem, Ring1: { Name: 'Set Ring' } as Item },
      allAugments: [setAugment],
      allSetBonuses: [fortSet],
    }, build)

    // V2: Enhancement is Highest-Only — only the larger of {10, 15} counts.
    expect(stats.total('fortBypass')).toBe(15)
  })

  it('a guild buff of the same Highest-Only type as gear does NOT stack on top of it', () => {
    const guildBuff: GuildBuff = {
      Name: 'Test Guild Fortification',
      Level: 1,
      Effect: { Type: 'FortificationBypass', Bonus: 'Enhancement', AType: 'Simple', Amount: 5 },
    } as unknown as GuildBuff

    const build = {
      ...makeEmptyBuild(),
      gear: { Boots: 'Boots of Bypass' } as Record<string, string>,
      guildLevel: 10,
      applyGuildBuffs: true,
    }

    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Boots: gearItem },
      allGuildBuffs: [guildBuff],
    } as BuildStatsInput, build)

    // V2: gear's +10 Enhancement beats the guild buff's +5 Enhancement — no stacking.
    expect(stats.total('fortBypass')).toBe(10)
  })
})
