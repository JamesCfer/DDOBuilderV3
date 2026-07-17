/**
 * N12 + N13 + the empty-element flag bug that hid both.
 *
 * Real catalogue XML writes boolean effect flags as self-closing elements —
 * `<Percent />`, `<ApplyAsItemEffect />` — which fast-xml-parser surfaces as
 * empty strings (`Percent: ""`), NOT `true`. effectParser checked
 * `effect.Percent === true`, so with REAL data (as opposed to unit-test
 * fixtures that wrote `Percent: true`) every percent-tagged effect was
 * applied as a FLAT amount. The same applies to `<ApplyAsItemEffect />`.
 *
 * N12 — V2 `EnhancementTreeItem::GetEffects` (EnhancementTreeItem.cpp:509-510)
 * includes a `<Rank>`-tagged effect only when applying that specific rank
 * (`Build::ApplyAllCurrentEffects` loops rank 1..R), so the effect fires
 * exactly once, at/after that rank, with a single stack — never scaled by
 * trained ranks. V3 passed the trained rank straight into resolveValue for
 * every effect, so e.g. Dwarf "Child of the Mountain" (rank-3-only +5% HP)
 * computed +5/+10/+15% at ranks 1/2/3 instead of 0/0/+5%.
 *
 * N13 — V2 `BreakdownItem` routes effects tagged `<ApplyAsItemEffect/>` into
 * m_itemEffects, whose bonus types obey "Highest Only" stacking against gear
 * (BreakdownItem.cpp:623-698, :205-221). V3 stacked them with everything.
 *
 * Test subject: Dwarf "Child of the Mountain" — 3 ranks, second effect is
 * `Hitpoints / Quality / <Percent/> / <Rank>3</Rank> / Amount 5 /
 * <ApplyAsItemEffect/>` (Dwarf.tree.xml:357-372). All three bugs meet in
 * this one real enhancement.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadEnhancementTrees, loadClasses } from '../server/dataLoaders'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild } from '../types/ddo'
import type { Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

describe.skipIf(!have)('N12/N13 — Rank gate, percent flag, and item-effect pool with REAL data', () => {
  const allTrees = loadEnhancementTrees(DATA)
  const allClasses = loadClasses(DATA)

  function input(gearItems: Record<string, Item> = {}): BuildStatsInput {
    return {
      allRaces: [], allClasses, allFeats: [], allTrees,
      gearItems, allSelfBuffs: [], allAugments: [], allSetBonuses: [],
      allFiligreeBonuses: [], allFiligrees: [],
    }
  }

  function dwarfBuild(ranks: number) {
    return {
      ...emptyBuild(),
      race: 'Dwarf',
      classes: [{ name: 'Fighter', levels: 10 }],
      levelClasses: Array.from({ length: 10 }, () => 'Fighter'),
      totalLevel: 10,
      baseAbilities: {
        Strength: 10, Dexterity: 10, Constitution: 10,
        Intelligence: 10, Wisdom: 10, Charisma: 10,
      },
      selectedTrees: ['Dwarf'],
      enhancementChoices: { Dwarf: { 'Dwarf: Child of the Mountain': ranks } },
    }
  }

  const hpAt = (ranks: number, gearItems: Record<string, Item> = {}) =>
    computeBuildStats(input(gearItems), dwarfBuild(ranks)).total('hp')

  const baseHp = hpAt(0)

  it('rank 1 gives NO HP bonus (effect is <Rank>3</Rank>-gated)', () => {
    // Bug (pre-fix): flat +5 at rank 1 (percent flag unread + no Rank gate).
    expect(hpAt(1)).toBe(baseHp)
  })

  it('rank 2 gives NO HP bonus', () => {
    expect(hpAt(2)).toBe(baseHp)
  })

  it('rank 3 gives +5% of base HP, once (not x3, not flat)', () => {
    // Bug (pre-fix): +15 flat (5 x 3 ranks). Correct: trunc(baseHp * 5%).
    expect(hpAt(3)).toBe(baseHp + Math.trunc(baseHp * 5 / 100))
  })

  it('ApplyAsItemEffect: a same-bonus-type gear item suppresses the smaller (Highest Only)', () => {
    // A gear item granting a larger Quality % HP bonus: V2 puts both in the
    // item-effect pool where Quality is Highest-Only — only the larger fires.
    const qualityHpItem = {
      Name: 'Test Quality HP Item',
      EquipmentSlot: { Trinket: '' },
      Buff: { Type: 'Hitpoints', BonusType: 'Quality', Value1: 10, Percent: '' },
    } as unknown as Item
    const withBoth = hpAt(3, { Trinket: qualityHpItem })
    // Highest Only within the item pool: 10% wins, 5% suppressed.
    // Per-effect truncation (N10): contribution = trunc(baseHp * 10%).
    expect(withBoth).toBe(baseHp + Math.trunc(baseHp * 10 / 100))
  })
})
