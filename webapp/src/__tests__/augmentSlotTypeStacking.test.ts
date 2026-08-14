// Augment effects are named "<host item> : <augment slot type> : <augment
// name>" by V2 (Build::ApplyAugment, Build.cpp:4933-36), and that name is what
// the identical-effect stack-merge keys on. V3 built the name from the host
// slot alone, so a multi-colour augment (Topaz fits Green/Orange/Yellow) merged
// with itself across one item's Green and Yellow slots and reported DOUBLE the
// value for a bonus type that cannot stack.
//
// The optimizer scores candidates through this engine, so the phantom gain
// taught it to fill every slot on an item with the same augment — which is how
// a generated build ends up wearing the same augment over and over.

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { optimizeBuild } from '../lib/optimizer/optimizer'
import { emptyBuild } from '../types/ddo'
import type { Augment, Item } from '../types/ddo'
import type { ObjectiveSpec } from '../lib/optimizer/objective'

const HP: ObjectiveSpec = {
  mode: 'priority',
  stats: [{ key: 'hp', label: 'Hit Points', weight: 1 }],
}

/** Topaz-style: one augment that fits several colours. */
const multiColour = (name: string, amount: number, bonus = 'Enhancement') => ({
  Name: name, MinLevel: 1, Type: ['Green', 'Yellow'],
  Effect: { Type: 'Hitpoints', Bonus: bonus, AType: 'Simple', Amount: String(amount) },
} as unknown as Augment)

const itemWith = (name: string, slot: string, types: string[]) => ({
  Name: name, MinLevel: 20, EquipmentSlot: { [slot]: true },
  ItemAugment: types.map(Type => ({ Type })),
} as unknown as Item)

function hp(
  gearItems: Record<string, Item>,
  gear: Record<string, string>,
  augmentChoices: Record<string, string>,
  allAugments: Augment[],
): number {
  const input = {
    allClasses: [], allRaces: [], allFeats: [], allTrees: [], allSelfBuffs: [],
    allAugments, allSetBonuses: [], allFiligreeBonuses: [], allFiligrees: [], gearItems,
  } as unknown as BuildStatsInput
  return computeBuildStats(input, { ...emptyBuild(), gear, augmentChoices }).total('hp')
}

describe('same augment in two differently-coloured slots of one item', () => {
  const topaz = multiColour('Topaz of Hit Points', 40)
  const gearItems = { Belt: itemWith('Slotted Belt', 'Belt', ['Green', 'Yellow']) }
  const gear = { Belt: 'Slotted Belt' }

  it('does not stack with itself — the bonus type can only apply once', () => {
    const one = hp(gearItems, gear, { 'Belt:Green:0': 'Topaz of Hit Points' }, [topaz])
    const two = hp(gearItems, gear, {
      'Belt:Green:0': 'Topaz of Hit Points',
      'Belt:Yellow:1': 'Topaz of Hit Points',
    }, [topaz])
    expect(two).toBe(one)
  })

  it('still competes Highest-Only across separate items', () => {
    const items = {
      Belt: itemWith('A', 'Belt', ['Green']),
      Boots: itemWith('B', 'Boots', ['Green']),
    }
    const one = hp(items, { Belt: 'A' }, { 'Belt:Green:0': 'Topaz of Hit Points' }, [topaz])
    const two = hp(items, { Belt: 'A', Boots: 'B' }, {
      'Belt:Green:0': 'Topaz of Hit Points',
      'Boots:Green:0': 'Topaz of Hit Points',
    }, [topaz])
    expect(two).toBe(one)
  })

  it('a bigger augment of the same type replaces the smaller, never adds to it', () => {
    const small = multiColour('Small', 10)
    const big = multiColour('Big', 40)
    const only = hp(gearItems, gear, { 'Belt:Green:0': 'Big' }, [small, big])
    const both = hp(gearItems, gear, { 'Belt:Green:0': 'Big', 'Belt:Yellow:1': 'Small' }, [small, big])
    expect(both).toBe(only)
  })

  it('different bonus types on the same stat DO stack', () => {
    const enh = multiColour('Enhancement 40', 40, 'Enhancement')
    const insight = multiColour('Insight 20', 20, 'Insightful')
    const one = hp(gearItems, gear, { 'Belt:Green:0': 'Enhancement 40' }, [enh, insight])
    const both = hp(gearItems, gear, {
      'Belt:Green:0': 'Enhancement 40',
      'Belt:Yellow:1': 'Insight 20',
    }, [enh, insight])
    expect(both).toBe(one + 20)
  })
})

describe('the optimizer no longer fills an item with copies of one augment', () => {
  it('spends the second slot on a bonus type that actually stacks', async () => {
    const augments = [
      multiColour('HP Enhancement 40', 40, 'Enhancement'),
      multiColour('HP Enhancement 30', 30, 'Enhancement'),
      multiColour('HP Insight 20', 20, 'Insightful'),
    ]
    const gearItems = { Belt: itemWith('Slotted Belt', 'Belt', ['Green', 'Yellow']) }
    const input = {
      allClasses: [], allRaces: [], allFeats: [], allTrees: [], allSelfBuffs: [],
      allAugments: augments, allSetBonuses: [], allFiligreeBonuses: [], allFiligrees: [],
      gearItems,
    } as unknown as BuildStatsInput

    const res = await optimizeBuild({
      input,
      build: { ...emptyBuild(), gear: { Belt: 'Slotted Belt' } },
      objective: HP,
      domains: { augments: true },
      augmentCandidates: { Green: augments, Yellow: augments },
      maxEvals: 2000,
    } as never)

    const chosen = Object.values(res.build.augmentChoices ?? {}).filter(Boolean)
    expect(chosen).toHaveLength(2)
    // The two slots must not hold the same augment...
    expect(new Set(chosen).size).toBe(2)
    // ...and specifically not two Enhancement bonuses, only one of which counts.
    expect(chosen).toContain('HP Enhancement 40')
    expect(chosen).toContain('HP Insight 20')
  })
})
