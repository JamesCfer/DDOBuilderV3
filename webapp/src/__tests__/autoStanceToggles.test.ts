/**
 * Auto stances: derived from the build, overridable by hand.
 *
 * V2's stance pane creates a button for every Stances.xml entry (plus
 * generated ones per weapon type and race) and CStanceButton::Evaluate
 * switches the `Group=Auto` ones on as soon as their ActiveRequirements hold
 * — wielding a one-handed weapon with nothing in the off hand puts you in
 * Single Weapon Fighting, wearing light armour puts you in Light Armor, and
 * so on. V3 derived most of that set internally but never surfaced it: the
 * Stances panel listed the auto stances as inert text, so there was no way to
 * see which were live, and no way to try one on that the build did not
 * already qualify for.
 *
 * This pass covers three things:
 *   1. `BuildStats.activeStances` publishes the settled set the engine gates
 *      every stance-dependent effect on.
 *   2. The gear-driven half of the Stances.xml catalogue ("Staff", "Sword and
 *      Board", "Axe", "Thrown Weapon", "Unarmed") now evaluates honestly —
 *      GroupMember/GroupMember2/ItemTypeInSlot requirements read the wielded
 *      weapons' group membership and per-slot item types instead of being
 *      skipped as unmodelled.
 *   3. `build.stanceOverrides` forces an auto stance on or off (a V3-only
 *      testing affordance; V2's Auto buttons are read-only), including
 *      feeding the stances derived FROM the overridden one.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../lib/buildStats'
import { emptyBuild } from '../types/ddo'
import { reducer } from '../context/CharacterContext'
import type { CharacterBuild, Item, Stance, WeaponGroupSpec } from '../types/ddo'

// ---------------------------------------------------------------------------
// Fixtures: a trimmed Stances.xml (verbatim requirements from the real file)
// and the weapon groups the fighting-style derivation reads.
// ---------------------------------------------------------------------------

const STANCES: Stance[] = [
  {
    Name: 'Single Weapon Fighting',
    Description: 'You are fighting with a single weapon',
    Group: ['Auto'] as unknown as string,
    AutoControlled: true,
    Requirements: {
      RequiresOneOf: [
        { Requirement: [{ Type: 'GroupMember', Item: 'Single Weapon' }] },
        {
          Requirement: [
            { Type: 'ItemTypeInSlot', Item: ['Weapon2', 'Empty'] },
            { Type: 'ItemTypeInSlot', Item: ['Weapon2', 'Orb'] },
          ],
        },
      ],
    } as never,
  },
  {
    Name: 'Staff',
    Description: 'You are fighting with a staff',
    Group: ['Auto'] as unknown as string,
    AutoControlled: true,
    Requirements: {
      Requirement: [{ Type: 'ItemTypeInSlot', Item: ['Weapon1', 'Quarterstaff'] }],
    } as never,
  },
  {
    Name: 'Sword and Board',
    Description: 'You are fighting with a weapon and shield',
    Group: ['Auto'] as unknown as string,
    AutoControlled: true,
    Requirements: {
      Requirement: [{ Type: 'Stance', Item: 'Shield' }],
      RequiresNoneOf: [
        { Requirement: [{ Type: 'ItemTypeInSlot', Item: ['Weapon1', 'Empty'] }] },
      ],
    } as never,
  },
  {
    Name: 'Axe',
    Description: 'You are fighting with an Axe',
    Group: ['Auto'] as unknown as string,
    AutoControlled: true,
    Requirements: { Requirement: [{ Type: 'GroupMember', Item: 'Axe' }] } as never,
  },
]

const WEAPON_GROUPS: WeaponGroupSpec[] = [
  { Name: 'One Handed', Weapon: ['Longsword', 'Battle Axe', 'Dagger'] },
  { Name: 'Single Weapon', Weapon: ['Longsword', 'Battle Axe', 'Dagger'] },
  { Name: 'Two Handed', Weapon: ['Quarterstaff', 'Greataxe'] },
  { Name: 'Axe', Weapon: ['Battle Axe', 'Greataxe'] },
  { Name: 'Centered', Weapon: ['Quarterstaff', 'Handwraps', 'Kama'] },
] as unknown as WeaponGroupSpec[]

const ITEMS: Record<string, Item> = {
  longsword: { Name: 'Longsword', Weapon: 'Longsword' } as Item,
  battleAxe: { Name: 'Battle Axe', Weapon: 'Battle Axe' } as Item,
  quarterstaff: { Name: 'Quarterstaff', Weapon: 'Quarterstaff' } as Item,
  largeShield: { Name: 'Large Shield', Weapon: 'Large Shield' } as Item,
  lightArmor: { Name: 'Leather Armor', Armor: 'Light' } as Item,
  heavyArmor: { Name: 'Full Plate', Armor: 'Heavy' } as Item,
}

function input(gearItems: Record<string, Item>): BuildStatsInput {
  return {
    allClasses: [], allRaces: [], allFeats: [], allTrees: [],
    allSelfBuffs: [], allAugments: [], allSetBonuses: [],
    allFiligreeBonuses: [], allFiligrees: [],
    allWeaponGroups: WEAPON_GROUPS,
    allStances: STANCES,
    gearItems,
  }
}

function buildWith(patch: Partial<CharacterBuild> = {}): CharacterBuild {
  return { ...emptyBuild(), race: '', alignment: '', ...patch }
}

function stancesFor(
  gearItems: Record<string, Item>,
  patch: Partial<CharacterBuild> = {},
): Set<string> {
  return new Set(computeBuildStats(input(gearItems), buildWith(patch)).activeStances)
}

// ---------------------------------------------------------------------------
// 1 — the derived set is published
// ---------------------------------------------------------------------------

describe('BuildStats.activeStances', () => {
  it('a one-handed weapon with an empty off hand is Single Weapon Fighting', () => {
    const active = stancesFor({ 'Main Hand': ITEMS.longsword })
    expect(active).toContain('Single Weapon Fighting')
    // …and the weapon's own auto stance rides along (V2 generates a
    // "You are wielding a <type>" button per weapon type).
    expect(active).toContain('Longsword')
    expect(active).not.toContain('Two Weapon Fighting')
  })

  it('a filled off hand ends Single Weapon Fighting and starts Two Weapon Fighting', () => {
    const active = stancesFor({
      'Main Hand': ITEMS.longsword,
      'Off Hand': ITEMS.longsword,
    })
    expect(active).toContain('Two Weapon Fighting')
    expect(active).not.toContain('Single Weapon Fighting')
  })

  it('worn armour picks exactly one armour stance', () => {
    expect(stancesFor({ Armor: ITEMS.lightArmor })).toContain('Light Armor')
    expect(stancesFor({ Armor: ITEMS.lightArmor })).not.toContain('Cloth Armor')
    expect(stancesFor({ Armor: ITEMS.heavyArmor })).toContain('Heavy Armor')
    // Nothing equipped is Cloth Armor, not "no armour stance" (V2 Stances.xml
    // matches an empty armour slot).
    expect(stancesFor({})).toContain('Cloth Armor')
  })

  it('a shield brings its type stance, the umbrella Shield stance and Sword and Board', () => {
    const active = stancesFor({
      'Main Hand': ITEMS.longsword,
      'Off Hand': ITEMS.largeShield,
    })
    expect(active).toContain('Large Shield')
    expect(active).toContain('Shield')
    expect(active).toContain('Sword and Board')
    expect(active).not.toContain('Single Weapon Fighting')
  })
})

// ---------------------------------------------------------------------------
// 2 — the gear-gated half of the catalogue evaluates instead of being skipped
// ---------------------------------------------------------------------------

describe('Stances.xml auto stances with wielded-weapon requirements', () => {
  it('ItemTypeInSlot: a quarterstaff is the Staff stance (and two-handed fighting)', () => {
    const active = stancesFor({ 'Main Hand': ITEMS.quarterstaff })
    expect(active).toContain('Staff')
    expect(active).toContain('Two Handed Fighting')
  })

  it('GroupMember: an axe in the main hand is the Axe stance, a longsword is not', () => {
    expect(stancesFor({ 'Main Hand': ITEMS.battleAxe })).toContain('Axe')
    expect(stancesFor({ 'Main Hand': ITEMS.longsword })).not.toContain('Axe')
  })

  it('a stance whose requirements fail stays off', () => {
    const active = stancesFor({ 'Off Hand': ITEMS.largeShield })
    // Shield is up, but the main hand is empty — Sword and Board's
    // RequiresNoneOf ItemTypeInSlot Weapon1/Empty blocks it.
    expect(active).toContain('Shield')
    expect(active).not.toContain('Sword and Board')
  })
})

// ---------------------------------------------------------------------------
// 3 — manual overrides
// ---------------------------------------------------------------------------

describe('build.stanceOverrides', () => {
  it('forces an auto stance off even though the build derives it', () => {
    const gear = { 'Main Hand': ITEMS.longsword }
    expect(stancesFor(gear)).toContain('Single Weapon Fighting')
    const forced = stancesFor(gear, {
      stanceOverrides: { 'Single Weapon Fighting': false },
    })
    expect(forced).not.toContain('Single Weapon Fighting')
    // Only the named stance is affected.
    expect(forced).toContain('Longsword')
  })

  it('forces an auto stance on that the build does not qualify for', () => {
    expect(stancesFor({})).not.toContain('Axe')
    expect(stancesFor({}, { stanceOverrides: { Axe: true } })).toContain('Axe')
  })

  it('a forced stance feeds the stances derived from it', () => {
    // Centered needs Cloth Armor plus a centering weapon; full plate rules it
    // out. Forcing Cloth Armor on (pass 1 of the override application) lets
    // Centered derive, which is the whole point of being able to force one.
    const gear = { Armor: ITEMS.heavyArmor, 'Main Hand': ITEMS.quarterstaff }
    expect(stancesFor(gear)).not.toContain('Centered')
    const forced = stancesFor(gear, { stanceOverrides: { 'Cloth Armor': true } })
    expect(forced).toContain('Cloth Armor')
    expect(forced).toContain('Centered')
  })

  it('an empty override map leaves the derivation untouched', () => {
    const gear = { 'Main Hand': ITEMS.longsword }
    expect([...stancesFor(gear, { stanceOverrides: {} })].sort())
      .toEqual([...stancesFor(gear)].sort())
  })
})

describe('stance override reducer', () => {
  const base = buildWith()

  it('SET_STANCE_OVERRIDE stores a forced value and undefined clears it', () => {
    const off = reducer(base, {
      type: 'SET_STANCE_OVERRIDE', stanceName: 'Light Armor', on: false,
    })
    expect(off.stanceOverrides).toEqual({ 'Light Armor': false })

    const on = reducer(off, {
      type: 'SET_STANCE_OVERRIDE', stanceName: 'Axe', on: true,
    })
    expect(on.stanceOverrides).toEqual({ 'Light Armor': false, Axe: true })

    const cleared = reducer(on, {
      type: 'SET_STANCE_OVERRIDE', stanceName: 'Light Armor', on: undefined,
    })
    expect(cleared.stanceOverrides).toEqual({ Axe: true })
  })

  it('CLEAR_STANCE_OVERRIDES drops every override', () => {
    const withTwo = reducer(
      reducer(base, { type: 'SET_STANCE_OVERRIDE', stanceName: 'Axe', on: true }),
      { type: 'SET_STANCE_OVERRIDE', stanceName: 'Staff', on: false },
    )
    expect(reducer(withTwo, { type: 'CLEAR_STANCE_OVERRIDES' }).stanceOverrides).toEqual({})
  })

  it('overrides are separate from the player-toggled stance list', () => {
    const next = reducer(base, {
      type: 'SET_STANCE_OVERRIDE', stanceName: 'Light Armor', on: true,
    })
    expect(next.activeBuffs).toEqual(base.activeBuffs)
  })
})
