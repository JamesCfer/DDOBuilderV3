/**
 * Parity pass 121 — two PRR/MRR/MRRCap root causes from the parallel-agent
 * per-effect reconciliation (Maetrim mrrCap −10 exact, Odd tank mrrCap
 * 56→6 / PRR 24→82, Melee Sorcerer mrrCap 50→100 — all reconciled):
 *
 * A. An EnhancementTreeItem's OWN unconditional <Effect> list was dropped
 *    whenever a Selector option was chosen — V2 EnhancementTreeItem::
 *    GetEffects (EnhancementTreeItem.cpp:486-522) ALWAYS appends m_Effects
 *    after the selection's effects ("even if it had a sub-selection it may
 *    still have effects that always apply regardless of the sub-selection").
 *    70 tree items in the data carry both a Selector and own effects (e.g.
 *    GoF "Disciple of Philosophy" core: +10 MRRCap whatever the choice).
 *
 * B. Armor-derived stances were recomputed purely from equipped gear,
 *    ignoring the build's recorded <ActiveStances> — V2 Build::IsStanceActive
 *    reads the TRACKED stance state, which legitimately diverges from gear
 *    (heavy armor equipped without proficiency stays "Cloth Armor"). This
 *    flipped armor-gated PRR/MRRCap baselines on real corpus builds.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
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

// ---------------------------------------------------------------------------
// A — selector items keep their own unconditional effects
// ---------------------------------------------------------------------------

const selectorTree: EnhancementTree = {
  Name: 'Test Destiny',
  EnhancementTreeItem: [{
    Name: 'Disciple Core', InternalName: 'DiscipleCore', Ranks: 1,
    // Own effect: always applies, whichever option is picked.
    Effect: { Type: 'MRRCap', Bonus: 'Destiny', AType: 'Simple', Amount: 10 },
    Selector: [{
      EnhancementSelection: [
        { Name: 'Path of Light', Effect: { Type: 'MRR', Bonus: 'Destiny', AType: 'Simple', Amount: 5 } },
        { Name: 'Path of Dark',  Effect: { Type: 'PRR', Bonus: 'Destiny', AType: 'Simple', Amount: 5 } },
      ],
    }],
  }],
} as unknown as EnhancementTree

describe('A — selector item own effects always apply (V2 EnhancementTreeItem::GetEffects)', () => {
  it('own MRRCap effect AND the chosen option effect both fire', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      enhancementChoices: { 'Test Destiny': { DiscipleCore: 1 } },
      enhancementSelections: { 'Test Destiny': { DiscipleCore: 'Path of Light' } },
    }
    const stats = computeBuildStats({ ...emptyInput(), allTrees: [selectorTree] } as BuildStatsInput, build)
    // Own effect no longer dropped (rides on top of the cloth-armor cap base)
    const own = stats.resolve('mrrCap').bonuses.find(b => b.source === 'Test Destiny: Disciple Core')
    expect(own?.value).toBe(10)
    expect(stats.total('mrr')).toBe(5)      // selected option still applies
    expect(stats.total('prr')).toBe(0)      // unchosen option does not
  })

  it('own effect also applies with no option selected', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      enhancementChoices: { 'Test Destiny': { DiscipleCore: 1 } },
    }
    const stats = computeBuildStats({ ...emptyInput(), allTrees: [selectorTree] } as BuildStatsInput, build)
    const own = stats.resolve('mrrCap').bonuses.find(b => b.source === 'Test Destiny: Disciple Core')
    expect(own?.value).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// B — recorded armor stance overrides gear derivation
// ---------------------------------------------------------------------------

const heavyArmor: Item = {
  Name: 'Test Heavy Plate', Armor: 'Heavy',
} as unknown as Item

describe('B — recorded ActiveStances armor stance wins over gear derivation (V2 Build::IsStanceActive)', () => {
  it('heavy armor + recorded "Cloth Armor" stance → cloth MRR cap (50), no heavy-armor PRR', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      activeBuffs: ['Cloth Armor'],
    }
    const stats = computeBuildStats({
      ...emptyInput(), gearItems: { Armor: heavyArmor },
    } as BuildStatsInput, build)
    expect(stats.total('mrrCap')).toBe(50)
    expect(stats.resolve('prr').bonuses.some(b => b.source.includes('Heavy Armor'))).toBe(false)
  })

  it('heavy armor with NO recorded stance still derives Heavy Armor from gear', () => {
    const build = { ...makeEmptyBuild(), totalLevel: 20 }
    const stats = computeBuildStats({
      ...emptyInput(), gearItems: { Armor: heavyArmor },
    } as BuildStatsInput, build)
    // Heavy armor: no MRR cap baseline (uncapped), unlike cloth's 50.
    expect(stats.total('mrrCap')).not.toBe(50)
  })
})
