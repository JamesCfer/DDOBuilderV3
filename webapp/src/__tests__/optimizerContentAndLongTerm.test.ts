// The optimizer's content domains (augments, gear slot upgrades, filigrees)
// and its second search strategy (long-term, multi-branch) plus the runner
// that scores both against each other.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  augmentMoves, slotUpgradeMoves, filigreeMoves, generateMoves, applyMove,
  moveId, describeMove, type MoveContext,
} from '../lib/optimizer/moves'
import {
  shortlistAugments, shortlistFiligrees, effectRelevance,
} from '../lib/optimizer/gearCandidates'
import { optimizeBuildLongTerm } from '../lib/optimizer/longTerm'
import { planBuild } from '../lib/optimizer/plan'
import { optimizeBuild } from '../lib/optimizer/optimizer'
import { emptyBuild } from '../types/ddo'
import type { Augment, CharacterBuild, Filigree, Item } from '../types/ddo'
import type { ObjectiveSpec } from '../lib/optimizer/objective'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

const HP: ObjectiveSpec = {
  mode: 'priority',
  stats: [{ key: 'hp', label: 'Hit Points', weight: 1 }],
}

const hpEffect = (amount: number, bonus = 'Enhancement') => ({
  Type: 'Hitpoints', Bonus: bonus, AType: 'Simple', Amount: String(amount),
})

function ctxWith(build: CharacterBuild, extra: Partial<MoveContext> = {}): MoveContext {
  return {
    build, allClasses: [], allRaces: [], allFeats: [], allTrees: [],
    fatePoints: 0, destinyApBonus: 0, ...extra,
  }
}

// ---------------------------------------------------------------------------
// Augments
// ---------------------------------------------------------------------------

const blueAugment = (name: string, amount: number, minLevel = 1): Augment =>
  ({ Name: name, MinLevel: minLevel, Type: 'Blue', Effect: hpEffect(amount) } as unknown as Augment)

const itemWithSlots = (name: string, level: number, slots: Array<Record<string, unknown>>): Item =>
  ({ Name: name, MinLevel: level, EquipmentSlot: { Trinket: '' }, ItemAugment: slots } as unknown as Item)

describe('optimizer augment moves', () => {
  const gearItems = { Trinket: itemWithSlots('Slotted Trinket', 20, [{ Type: 'Blue' }]) }
  const pool = { Blue: [blueAugment('Big HP', 40), blueAugment('Small HP', 10)] }

  it('offers each candidate augment for an empty slot on an equipped item', () => {
    const moves = augmentMoves(ctxWith(emptyBuild(), { gearItems, augmentCandidates: pool }))
    expect(moves.map(describeMove)).toEqual([
      'Slot augment Big HP in the Blue slot on Trinket',
      'Slot augment Small HP in the Blue slot on Trinket',
    ])
  })

  it('skips a slot the user has already filled', () => {
    const build = { ...emptyBuild(), augmentChoices: { 'Trinket:Blue:0': 'Chosen' } }
    expect(augmentMoves(ctxWith(build, { gearItems, augmentCandidates: pool }))).toEqual([])
  })

  it('skips slots whose augment is fixed by the item', () => {
    const fixed = {
      Trinket: itemWithSlots('Fixed', 20, [{ Type: 'Blue', Augment: { Name: 'Built In' } }]),
    }
    expect(augmentMoves(ctxWith(emptyBuild(), { gearItems: fixed, augmentCandidates: pool }))).toEqual([])
  })

  it('will not slot an augment above the host item\'s level', () => {
    const lowLevel = { Trinket: itemWithSlots('Low', 5, [{ Type: 'Blue' }]) }
    const moves = augmentMoves(ctxWith(emptyBuild(), {
      gearItems: lowLevel,
      augmentCandidates: { Blue: [blueAugment('High', 40, 29), blueAugment('Low', 5, 1)] },
    }))
    expect(moves.map(m => m.kind === 'augment' && m.augmentName)).toEqual(['Low'])
  })

  it('applies onto augmentChoices under the UI\'s own key', () => {
    const next = applyMove(emptyBuild(), {
      kind: 'augment', slot: 'Trinket', augType: 'Blue', index: 0, augmentName: 'Big HP',
    })
    expect(next.augmentChoices['Trinket:Blue:0']).toBe('Big HP')
    expect(moveId({ kind: 'augment', slot: 'Trinket', augType: 'Blue', index: 0, augmentName: 'Big HP' }))
      .toBe('a|Trinket|Blue|0|Big HP')
  })

  it('shortlists augments per colour, dropping the irrelevant and over-level', () => {
    const augments = [
      blueAugment('Strong HP', 40),
      blueAugment('Weak HP', 5),
      blueAugment('Too High', 100, 30),
      { Name: 'Unrelated', MinLevel: 1, Type: 'Blue', Effect: { Type: 'MeleePower', Bonus: 'Enhancement', AType: 'Simple', Amount: '10' } } as unknown as Augment,
      { Name: 'Red HP', MinLevel: 1, Type: 'Red', Effect: hpEffect(20) } as unknown as Augment,
    ]
    const pools = shortlistAugments(augments, HP, { maxLevel: 20 })
    expect(pools.Blue.map(a => a.Name)).toEqual(['Strong HP', 'Weak HP'])
    expect(pools.Red.map(a => a.Name)).toEqual(['Red HP'])
  })

  it('lists a multi-colour augment under every colour it fits', () => {
    const multi = { Name: 'Any', MinLevel: 1, Type: ['Blue', 'Green'], Effect: hpEffect(15) } as unknown as Augment
    const pools = shortlistAugments([multi], HP, { maxLevel: 20 })
    expect(Object.keys(pools).sort()).toEqual(['Blue', 'Green'])
  })
})

// ---------------------------------------------------------------------------
// Gear slot upgrades
// ---------------------------------------------------------------------------

describe('optimizer gear-upgrade moves', () => {
  const upgradable = {
    Trinket: {
      Name: 'Upgradable', MinLevel: 20, EquipmentSlot: { Trinket: '' },
      SlotUpgrade: [{ Type: 'Slot', UpgradeType: ['Blue', 'Red'] }],
    } as unknown as Item,
  }

  it('offers each colour the item\'s upgrade allows', () => {
    const moves = slotUpgradeMoves(ctxWith(emptyBuild(), { gearItems: upgradable }))
    expect(moves.map(describeMove)).toEqual([
      "Upgrade Trinket's Slot slot to Blue",
      "Upgrade Trinket's Slot slot to Red",
    ])
  })

  it('stops offering the upgrade once a colour is chosen', () => {
    const build = { ...emptyBuild(), slotUpgradeChoices: { 'Trinket:Slot:0': 'Blue' } }
    expect(slotUpgradeMoves(ctxWith(build, { gearItems: upgradable }))).toEqual([])
  })

  it('opens a new augment slot that the augment domain can then fill', () => {
    const upgraded = applyMove(emptyBuild(), {
      kind: 'slotUpgrade', slot: 'Trinket', upgradeType: 'Slot', index: 0, color: 'Blue',
    })
    expect(upgraded.slotUpgradeChoices['Trinket:Slot:0']).toBe('Blue')
    const moves = augmentMoves(ctxWith(upgraded, {
      gearItems: upgradable,
      augmentCandidates: { Blue: [blueAugment('Big HP', 40)] },
    }))
    expect(moves.map(describeMove)).toEqual([
      'Slot augment Big HP in the Blue slot on Trinket',
    ])
  })
})

// ---------------------------------------------------------------------------
// Filigrees
// ---------------------------------------------------------------------------

const fil = (name: string, amount: number): Filigree =>
  ({ Name: name, Effect: hpEffect(amount) } as unknown as Filigree)

describe('optimizer filigree moves', () => {
  const candidates = [fil('Alpha', 20), fil('Beta', 10)]
  const twoSlots = () => ({
    ...emptyBuild(),
    filigreeSlots: [{ name: '', rare: false }, { name: '', rare: false }],
    artifactFiligreeSlots: [{ name: '', rare: false }],
  })

  it('offers every candidate for every empty weapon slot', () => {
    const moves = filigreeMoves(ctxWith(twoSlots(), { filigreeCandidates: candidates }))
    expect(moves).toHaveLength(4)               // 2 slots x 2 filigrees
    expect(moves.every(m => m.kind === 'filigree' && !m.artifact)).toBe(true)
  })

  it('does not offer artifact slots without a Minor Artifact equipped', () => {
    const withArtifact = ctxWith(twoSlots(), {
      filigreeCandidates: candidates,
      gearItems: { Helmet: { Name: 'Arty', MinorArtifact: '' } as unknown as Item },
    })
    const moves = filigreeMoves(withArtifact)
    expect(moves.filter(m => m.kind === 'filigree' && m.artifact)).toHaveLength(2)
    // …and without one, only the weapon slots are offered (previous test).
  })

  it('never offers a filigree that is already slotted elsewhere', () => {
    const build = { ...twoSlots(), filigreeSlots: [{ name: 'Alpha', rare: false }, { name: '', rare: false }] }
    const moves = filigreeMoves(ctxWith(build, { filigreeCandidates: candidates }))
    expect(moves.map(m => m.kind === 'filigree' && m.filigreeName)).toEqual(['Beta'])
  })

  it('applies into the right slot array without touching the others', () => {
    const next = applyMove(twoSlots(), {
      kind: 'filigree', artifact: false, slotIndex: 1, filigreeName: 'Alpha',
    })
    expect(next.filigreeSlots.map(s => s.name)).toEqual(['', 'Alpha'])
    expect(next.artifactFiligreeSlots.map(s => s.name)).toEqual([''])
  })

  it('shortlists filigrees by relevance and drops the irrelevant', () => {
    const all = [
      fil('Strong', 30), fil('Weak', 5),
      { Name: 'Unrelated', Effect: { Type: 'MeleePower', Bonus: 'Enhancement', AType: 'Simple', Amount: '10' } } as unknown as Filigree,
    ]
    expect(shortlistFiligrees(all, HP).map(f => f.Name)).toEqual(['Strong', 'Weak'])
  })

  it('scores effects the same way item buffs are scored', () => {
    expect(effectRelevance(hpEffect(25), 'x', new Set(['hp']))).toBe(25)
    expect(effectRelevance(hpEffect(25), 'x', new Set(['melee.power']))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Domain wiring
// ---------------------------------------------------------------------------

describe('generateMoves honours the new domain flags', () => {
  const ctx = ctxWith(
    {
      ...emptyBuild(),
      filigreeSlots: [{ name: '', rare: false }],
    },
    {
      gearItems: {
        Trinket: {
          Name: 'Both', MinLevel: 20, EquipmentSlot: { Trinket: '' },
          ItemAugment: [{ Type: 'Blue' }],
          SlotUpgrade: [{ Type: 'Slot', UpgradeType: ['Red'] }],
        } as unknown as Item,
      },
      augmentCandidates: { Blue: [blueAugment('Aug', 20)] },
      filigreeCandidates: [fil('Fil', 20)],
    },
  )
  const off = { enhancements: false, destinies: false, feats: false, classLevels: false }

  it('produces nothing when the content domains are off', () => {
    expect(generateMoves(ctx, off)).toEqual([])
  })

  it('produces only the enabled kinds', () => {
    expect(generateMoves(ctx, { ...off, augments: true }).map(m => m.kind)).toEqual(['augment'])
    expect(generateMoves(ctx, { ...off, slotUpgrades: true }).map(m => m.kind)).toEqual(['slotUpgrade'])
    expect(generateMoves(ctx, { ...off, filigrees: true }).map(m => m.kind)).toEqual(['filigree'])
  })
})

// ---------------------------------------------------------------------------
// Long-term search + comparison, against real data
// ---------------------------------------------------------------------------

describe.skipIf(!have)('long-term search and the greedy/long-term comparison', () => {
  const cat = loadAllCatalogues(DATA)
  initBonusTypes(cat.allBonusTypes)

  const input = {
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs, gearItems: {} as Record<string, Item>,
  }

  const fighter20 = (): CharacterBuild => ({
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Fighter', levels: 20 }] as unknown as CharacterBuild['classes'],
    levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
    totalLevel: 20,
  })

  const TREES = { enhancements: true, destinies: false, feats: false, classLevels: false }

  // No single enhancement on a fresh Fighter raises hit points, so this
  // build/objective pair is precisely the case greedy cannot solve: every
  // first step scores zero. It is the reason the long-term search exists.
  it('finds gated goals, branches, and reaches a gain greedy cannot', async () => {
    const res = await optimizeBuildLongTerm({
      input, build: fighter20(), objective: HP, domains: TREES,
      maxEvals: 3000, beamWidth: 3, expandPerState: 5, patience: 12,
    })
    expect(res.goals.length).toBeGreaterThan(0)
    expect(res.branches).toBeGreaterThan(1)
    expect(res.applied.length).toBeGreaterThan(0)
    expect(res.before[0].after).toBeGreaterThan(res.before[0].before)
    expect(res.evals).toBeLessThanOrEqual(3000)

    // Its plan contains steps that paid nothing at the time — the whole point.
    expect(res.applied.some(a => a.bridge)).toBe(true)
    // …and steps that did pay, i.e. it actually cashed the goals in.
    expect(res.applied.some(a => !a.bridge)).toBe(true)
  }, 180_000)

  it('every goal it reports names a tree and a positive payoff', async () => {
    const res = await optimizeBuildLongTerm({
      input, build: fighter20(), objective: HP, domains: TREES,
      maxEvals: 1200, beamWidth: 2, expandPerState: 4, patience: 6,
    })
    for (const goal of res.goals) {
      expect(goal.tree).toBeTruthy()
      expect(goal.description).toBeTruthy()
      expect(goal.gain).toBeGreaterThan(0)
    }
    // Sorted best-first.
    const gains = res.goals.map(g => g.gain)
    expect([...gains].sort((a, b) => b - a)).toEqual(gains)
  }, 120_000)

  it('honours cancellation', async () => {
    let calls = 0
    const res = await optimizeBuildLongTerm({
      input, build: fighter20(), objective: HP, domains: TREES,
      maxEvals: 5000, shouldCancel: () => ++calls > 20,
    })
    expect(res.stopped).toBe('cancelled')
  }, 60_000)

  it('runs both strategies, splits the budget, and names a winner', async () => {
    const res = await planBuild({
      input, build: fighter20(), objective: HP, domains: TREES, maxEvals: 500,
    })
    expect(['greedy', 'longTerm', 'tie']).toContain(res.winner)
    expect(res.greedy.evals + res.longTerm.evals).toBeLessThanOrEqual(600)

    // The comparison table lines up with what each plan actually reached.
    expect(res.comparison).toHaveLength(1)
    const row = res.comparison[0]
    expect(row.key).toBe('hp')
    expect(row.greedy).toBe(res.greedy.before[0].after)
    expect(row.longTerm).toBe(res.longTerm.before[0].after)
    expect(row.before).toBe(res.greedy.before[0].before)

    // Whichever won must be at least as good as the other on the objective.
    const best = res.winner === 'longTerm' ? row.longTerm : row.greedy
    expect(best).toBeGreaterThanOrEqual(Math.min(row.greedy, row.longTerm))
  }, 120_000)

  it('scores an unchanged build identically under both strategies', async () => {
    // No enabled domain has anything to offer -> both must agree on "nothing".
    const nothing = { enhancements: false, destinies: false, feats: false, classLevels: false }
    const res = await planBuild({
      input, build: fighter20(), objective: HP, domains: nothing, maxEvals: 200,
    })
    expect(res.greedy.unchanged).toBe(true)
    expect(res.longTerm.unchanged).toBe(true)
    expect(res.winner).toBe('tie')
    expect(res.comparison[0].greedy).toBe(res.comparison[0].longTerm)
  }, 60_000)

  it('greedy still runs on the shared engine and never regresses the objective', async () => {
    const res = await optimizeBuild({
      input, build: fighter20(), objective: HP, domains: TREES, maxEvals: 300,
    })
    expect(res.applied.length).toBeGreaterThan(0)
    expect(res.before[0].after).toBeGreaterThanOrEqual(res.before[0].before)
    expect(res.evals).toBeLessThanOrEqual(300)
  }, 60_000)
})
