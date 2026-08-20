/**
 * Parity pass — D10: augment `Effect_AddGroupWeapon`'s `ReplacedDynamically`
 * placeholder was never substituted for augment-granted effects.
 *
 * V2 source: `Build.cpp:5024-5031` (`ApplyAugment`) / `5210-5217`
 * (`RevokeAugment`) — when an augment's `AddGroupWeapon` effect's trailing
 * `<Item>` is the literal string `"ReplacedDynamically"`, V2 substitutes it
 * with the HOST ITEM's own weapon type before applying the effect. The one
 * shipped use is `DeckOfManyCurses.Augments.xml`'s "Curse of Divine Fortune"
 * ("If this item is a weapon, it is considered a Favored Weapon"): its
 * `AddGroupWeapon` effect is `Item=["Favored Weapon", "ReplacedDynamically"]`,
 * so slotting it into e.g. a Longsword adds Longsword to the "Favored
 * Weapon" group — which several effects gate on via `GroupMember`/
 * `GroupMember2` requirements (Divine Crusader implement bonus, etc.).
 *
 * V3's `buildRuntimeGroupAdds` (webapp/src/lib/buildStats.ts) only scanned
 * trained feats and enhancements for `AddGroupWeapon` effects — augment
 * effects were never scanned at all, so this augment silently did nothing.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, buildRuntimeGroupAdds, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, Race, Item, OptionalBuff, SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

// Mirrors DeckOfManyCurses.Augments.xml "Curse of Divine Fortune".
const curseOfDivineFortune: Augment = {
  Name: 'Curse of Divine Fortune',
  Type: 'Deck Curse',
  Effect: [
    { Type: 'PRR', Bonus: 'Fortune', AType: 'Simple', Amount: 4 },
    {
      Type: 'AddGroupWeapon', Bonus: 'Fortune', AType: 'NotNeeded',
      Item: ['Favored Weapon', 'ReplacedDynamically'],
    },
  ],
} as unknown as Augment

const longswordItem: Item = { Name: 'Test Longsword', Weapon: 'Longsword' } as unknown as Item

// A feat whose bonus is gated on wielding a Favored Weapon in the main hand —
// exercises the group in the same way the Divine Crusader implement bonus does.
const favoredWeaponFeat: Feat = {
  Name: 'Test Favored Weapon Bonus',
  Effect: {
    Type: 'MeleePower', Bonus: 'Insightful', AType: 'Simple', Amount: 10,
    Requirements: { Requirement: [{ Type: 'GroupMember', Item: 'Favored Weapon' }] },
  },
} as unknown as Feat

function baseInput(overrides: Partial<BuildStatsInput> = {}): BuildStatsInput {
  return {
    allRaces: [] as Race[],
    allClasses: [] as DDOClass[],
    allFeats: [favoredWeaponFeat],
    allTrees: [],
    gearItems: { 'Main Hand': longswordItem },
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [curseOfDivineFortune],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
    ...overrides,
  }
}

describe('buildRuntimeGroupAdds — augment AddGroupWeapon ReplacedDynamically (D10)', () => {
  it('adds the host weapon type to the group, substituting ReplacedDynamically', () => {
    const build = {
      ...makeEmptyBuild(),
      gearSlots: {},
      augmentChoices: { 'Main Hand:Fortune:0': 'Curse of Divine Fortune' },
    }
    const { adds } = buildRuntimeGroupAdds(baseInput(), build)
    expect(adds.some(a => a.group === 'Favored Weapon' && a.weaponType === 'Longsword')).toBe(true)
  })

  it('does not add anything when no such augment is slotted', () => {
    const build = { ...makeEmptyBuild(), gearSlots: {}, augmentChoices: {} }
    const { adds } = buildRuntimeGroupAdds(baseInput(), build)
    expect(adds.some(a => a.group === 'Favored Weapon')).toBe(false)
  })
})

describe('Curse of Divine Fortune — end-to-end effect gating (D10)', () => {
  it('a GroupMember="Favored Weapon" effect fires once the augment is slotted in the main hand', () => {
    const build = {
      ...makeEmptyBuild(),
      featChoices: { 'Hero 1': 'Test Favored Weapon Bonus' },
      augmentChoices: { 'Main Hand:Fortune:0': 'Curse of Divine Fortune' },
    }
    const stats = computeBuildStats(baseInput(), build)
    expect(stats.total('melee.power')).toBeGreaterThanOrEqual(10)
  })

  it('the GroupMember effect does NOT fire when the augment is not slotted', () => {
    const build = {
      ...makeEmptyBuild(),
      featChoices: { 'Hero 1': 'Test Favored Weapon Bonus' },
      augmentChoices: {},
    }
    const stats = computeBuildStats(baseInput(), build)
    expect(stats.total('melee.power')).toBe(0)
  })
})
