/**
 * Parity pass — attack-chain combat simulator.
 *
 * V2 sources:
 *   - AttackChain.{h,cpp}   — chain = Name + ordered Attacks string list,
 *     AddAttack / RemoveAttackAt mutation (AttackChain.cpp:62-81)
 *   - Attack.{h,cpp}        — Cooldown vector indexed by Stacks()-1,
 *     optional ExecutionTime, ThisAttack / FollowOn AttackBonus blocks
 *   - AttackBonus.h:22-34   — bonus block fields (BonusW, BonusDamagePercent…)
 *   - AttackBuff.cpp:18-22  — buff Expired() uses strict start+duration < t
 *   - DPSPane.cpp           — timeline (577-634), Basic Attack cooldown
 *     60/APM with APM hardcoded 100 (671-686), available-attack stacking
 *     (380-419), FindAttack "Not Found" dud (636-647), stance → AttackType
 *     mapping (922-949), per-style evaluators that are all stubs returning 0
 *     (990-1060).
 *
 * Attack definitions come from the same data files V2 walks
 * (DPSPane.cpp:253-326): Feats.xml Feat::Attacks plus enhancement-tree item /
 * selection Attacks.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadFeats, loadEnhancementTrees } from '../server/dataLoaders'
import { importV2Build } from '../lib/v2Import'
import { exportV2Build } from '../lib/v2Export'
import {
  parseAttackDef, collectAvailableAttacks, findAttack, NOT_FOUND_ATTACK,
  basicAttackCooldown, buildChainTimeline, buffExpired, dropTimedOutBuffs,
  pickAttackChainStyle, evaluateAttackV2, computeChainDPS,
  estimateAttackSwing, estimateChainDamage,
  chainWithAttackAdded, chainWithAttackRemoved, chainWithAttackMoved,
  type AvailableAttack, type SwingBaseline, type AttackBonusSpec,
} from '../lib/combat/attackChain'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')

const allFeats = loadFeats(DATA_DIR)
const allTrees = loadEnhancementTrees(DATA_DIR)

function emptyBonus(over: Partial<AttackBonusSpec> = {}): AttackBonusSpec {
  return {
    duration: [], bonusW: [], bonusAttackBonus: [], bonusDamage: [],
    bonusThreatRange: [], bonusCriticalMultiplier: [], bonusDamagePercent: [],
    bonusAlacrity: [], bonusMeleePower: [], bonusRangedPower: [],
    fortificationLoss: [], allowSneakAttack: false,
    ...over,
  }
}

function avail(defs: Array<{ name: string; cooldown?: number[]; executionTime?: number; thisAttack?: AttackBonusSpec; followOn?: AttackBonusSpec; stacks?: number }>): AvailableAttack[] {
  return defs.map(d => ({
    def: { name: d.name, description: '', icon: '', cooldown: d.cooldown, executionTime: d.executionTime, thisAttack: d.thisAttack, followOn: d.followOn },
    stacks: d.stacks ?? 1,
  }))
}

// ---------------------------------------------------------------------------
// Data-file parsing
// ---------------------------------------------------------------------------

describe('parseAttackDef from real V2 data files', () => {
  it('parses the Cleave feat attack (Feats.xml:904-916)', () => {
    const cleaveFeat = allFeats.find(f => f.Name === 'Cleave') as unknown as { Attack?: unknown }
    expect(cleaveFeat).toBeDefined()
    const def = parseAttackDef(cleaveFeat!.Attack)
    expect(def).not.toBeNull()
    expect(def!.name).toBe('Cleave')
    expect(def!.cooldown).toEqual([5])
    expect(def!.thisAttack?.bonusDamagePercent).toEqual([20])
    expect(def!.thisAttack?.bonusThreatRange).toEqual([1])
    expect(def!.thisAttack?.bonusCriticalMultiplier).toEqual([1])
    expect(def!.followOn).toBeUndefined()
  })

  it('parses Basic Attack with an empty ThisAttack block (Feats.xml:453-461)', () => {
    const attackFeat = allFeats.find(f => f.Name === 'Attack') as unknown as { Attack?: unknown }
    const def = parseAttackDef(attackFeat!.Attack)
    expect(def!.name).toBe('Basic Attack')
    expect(def!.cooldown).toEqual([0])
    // <ThisAttack> contains only a comment but V2 treats it as present
    expect(def!.thisAttack).toBeDefined()
    expect(def!.thisAttack!.bonusDamagePercent).toEqual([])
  })

  it('parses Improved Feint FollowOn AllowSneakAttack flag', () => {
    const feat = allFeats.find(f => f.Name === 'Improved Feint') as unknown as { Attack?: unknown }
    const def = parseAttackDef(feat!.Attack)
    expect(def!.followOn?.allowSneakAttack).toBe(true)
    expect(def!.followOn?.duration).toEqual([4])
    expect(def!.thisAttack?.bonusDamagePercent).toEqual([20])
  })

  it('parses per-rank vectors from Kensei Reed In The Wind (Fighter_Kensei.tree.xml)', () => {
    const kensei = allTrees.find(t => t.Name === 'Kensei')
    const reed = kensei?.EnhancementTreeItem?.find(i => i.Name === 'Kensei: Reed In The Wind') as unknown as { Attack?: unknown }
    expect(reed).toBeDefined()
    const def = parseAttackDef(reed!.Attack)
    // Single-rank since V2 2.0.0.85 (Update 81 Kensei pass)
    expect(def!.cooldown).toEqual([8])
    expect(def!.thisAttack?.bonusDamagePercent).toEqual([60])
  })
})

// ---------------------------------------------------------------------------
// Available-attack collection (stacks)
// ---------------------------------------------------------------------------

describe('collectAvailableAttacks', () => {
  it('always grants Basic Attack via the automatic "Attack" feat (Feats.xml:441-461)', () => {
    const attacks = collectAvailableAttacks({
      allFeats, allTrees,
      trainedFeatNames: [],
      enhancementChoices: {},
      enhancementSelections: {},
    })
    const basic = attacks.find(a => a.def.name === 'Basic Attack')
    expect(basic).toBeDefined()
    expect(basic!.stacks).toBe(1)
  })

  it('adds attacks from trained feats and stacks repeats (DPSPane.cpp:380-399)', () => {
    const attacks = collectAvailableAttacks({
      allFeats, allTrees,
      trainedFeatNames: ['Cleave', 'Great Cleave', 'Cleave'],
      enhancementChoices: {},
      enhancementSelections: {},
    })
    expect(attacks.find(a => a.def.name === 'Cleave')?.stacks).toBe(2)
    expect(attacks.find(a => a.def.name === 'Great Cleave')?.stacks).toBe(1)
    expect(attacks.find(a => a.def.name === 'Improved Feint')).toBeUndefined()
  })

  it('adds enhancement attacks with stacks = ranks trained', () => {
    const attacks = collectAvailableAttacks({
      allFeats, allTrees,
      trainedFeatNames: [],
      enhancementChoices: { Kensei: { 'Kensei: Reed In The Wind': 3 } },
      enhancementSelections: {},
    })
    const reed = attacks.find(a => a.def.name === 'Kensei: Reed In The Wind')
    expect(reed?.stacks).toBe(3)
  })

  it('adds attacks from the chosen enhancement sub-selection only (DPSPane.cpp:299-324)', () => {
    const kensei = allTrees.find(t => t.Name === 'Kensei')!
    // Find the item whose selections include "Haste Boost"
    const item = kensei.EnhancementTreeItem!.find(i =>
      (i.Selector ?? []).some(s =>
        (Array.isArray(s.EnhancementSelection) ? s.EnhancementSelection : [])
          .some(es => es.Name === 'Haste Boost')))
    expect(item).toBeDefined()
    const withSel = collectAvailableAttacks({
      allFeats, allTrees,
      trainedFeatNames: [],
      enhancementChoices: { Kensei: { [item!.Name]: 3 } },
      enhancementSelections: { Kensei: { [item!.Name]: 'Haste Boost' } },
    })
    const haste = withSel.find(a => a.def.name === 'Kensei: Haste Boost')
    expect(haste).toBeDefined()
    expect(haste!.stacks).toBe(3)
    expect(haste!.def.followOn?.bonusAlacrity).toEqual([30])
    // Without a selection no sub-selection attack is granted
    const withoutSel = collectAvailableAttacks({
      allFeats, allTrees,
      trainedFeatNames: [],
      enhancementChoices: { Kensei: { [item!.Name]: 3 } },
      enhancementSelections: {},
    })
    expect(withoutSel.find(a => a.def.name === 'Kensei: Haste Boost')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// FindAttack dud + Basic Attack cooldown
// ---------------------------------------------------------------------------

describe('findAttack / basicAttackCooldown', () => {
  it('returns the V2 "Not Found" dud for unknown names (DPSPane.cpp:636-647)', () => {
    const found = findAttack('No Such Attack', avail([{ name: 'Cleave' }]))
    expect(found).toBe(NOT_FOUND_ATTACK)
    expect(found.def.name).toBe('Not Found')
    expect(found.def.description).toBe('This Attack was not found')
    expect(found.def.icon).toBe('Unknown')
  })

  it('Basic Attack cooldown = 60 / APM, V2 hardcodes APM 100 (DPSPane.cpp:671-686)', () => {
    expect(basicAttackCooldown()).toBeCloseTo(0.6, 10)
    expect(basicAttackCooldown(120)).toBeCloseTo(0.5, 10)
  })
})

// ---------------------------------------------------------------------------
// Timeline (DPSPane::PopulateAttackChain, 577-634)
// ---------------------------------------------------------------------------

describe('buildChainTimeline', () => {
  const available = avail([
    { name: 'Basic Attack', cooldown: [0] },
    { name: 'Cleave', cooldown: [5] },
    { name: 'Special', cooldown: [10, 12, 14], executionTime: 2.5, stacks: 2 },
  ])

  it('advances by ExecutionTime when present, else the Basic Attack swing time', () => {
    const t = buildChainTimeline(['Basic Attack', 'Special', 'Cleave'], available)
    expect(t.entries.map(e => e.timePoint)).toEqual([0, 0.6, 3.1])
    expect(t.totalDuration).toBeCloseTo(3.7, 10)
  })

  it('reads cooldown at index stacks-1 (DPSPane.cpp:604-608)', () => {
    const t = buildChainTimeline(['Special', 'Cleave'], available)
    expect(t.entries[0].cooldown).toBe(12) // stacks 2 → Cooldown()[1]
    expect(t.entries[1].cooldown).toBe(5)
  })

  it('uses the dud (no cooldown) for unknown attacks and still advances time', () => {
    const t = buildChainTimeline(['Mystery'], available)
    expect(t.entries[0].attack.def.name).toBe('Not Found')
    expect(t.entries[0].cooldown).toBeUndefined()
    expect(t.totalDuration).toBeCloseTo(0.6, 10)
  })

  it('an empty chain has zero duration', () => {
    const t = buildChainTimeline([], available)
    expect(t.entries).toEqual([])
    expect(t.totalDuration).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Buffs (AttackBuff.cpp) + style mapping + V2 evaluator stubs
// ---------------------------------------------------------------------------

describe('chain buffs and V2 evaluation parity', () => {
  it('buffExpired uses strict start+duration < t (AttackBuff.cpp:18-22)', () => {
    const b = { sourceAttack: 'x', bonus: emptyBonus(), stacks: 1, startTime: 1, duration: 4 }
    expect(buffExpired(b, 5)).toBe(false) // 1+4 < 5 is false → still active at exactly t=5
    expect(buffExpired(b, 5.01)).toBe(true)
    expect(dropTimedOutBuffs([b], 5)).toHaveLength(1)
    expect(dropTimedOutBuffs([b], 6)).toHaveLength(0)
  })

  it('maps V2 stance names to attack styles in V2 priority order (DPSPane.cpp:926-949)', () => {
    expect(pickAttackChainStyle(['Two Weapon Fighting', 'Two Handed Fighting'])).toBe('TWF')
    expect(pickAttackChainStyle(['Two Handed Fighting'])).toBe('THF')
    expect(pickAttackChainStyle(['Single Weapon Fighting'])).toBe('SWF')
    expect(pickAttackChainStyle(['Ranged Combat'])).toBe('Ranged')
    expect(pickAttackChainStyle(['Unarmed'])).toBe('Handwraps')
    expect(pickAttackChainStyle(['Sword and Board'])).toBe('SwordAndBoard')
    expect(pickAttackChainStyle(['Reaper'])).toBe('Unknown')
  })

  it('V2 per-style evaluators are stubs returning 0 (DPSPane.cpp:990-1060)', () => {
    const attack = avail([{ name: 'Cleave' }])[0]
    for (const style of ['Unknown', 'TWF', 'THF', 'SWF', 'Ranged', 'Handwraps', 'SwordAndBoard'] as const) {
      expect(evaluateAttackV2(style, attack, [], 0)).toBe(0)
    }
  })

  it('computeChainDPS with the V2 evaluator scores every attack 0 (faithful parity)', () => {
    const available = avail([
      { name: 'Basic Attack', cooldown: [0] },
      { name: 'Boost', cooldown: [30], followOn: emptyBonus({ duration: [20], bonusDamage: [4] }) },
    ])
    const r = computeChainDPS(['Boost', 'Basic Attack', 'Basic Attack'], available, 'THF')
    expect(r.entries.map(e => e.dpsScore)).toEqual([0, 0, 0])
    expect(r.totalDPS).toBe(0)
    expect(r.totalDuration).toBeCloseTo(1.8, 10)
  })

  it('computeChainDPS hands active FollowOn buffs to later evaluations', () => {
    const available = avail([
      { name: 'Basic Attack', cooldown: [0] },
      { name: 'Boost', cooldown: [30], followOn: emptyBonus({ duration: [20], bonusDamage: [4] }) },
    ])
    const seen: number[] = []
    computeChainDPS(['Boost', 'Basic Attack'], available, 'THF', 100, (_s, _a, buffs) => {
      seen.push(buffs.length)
      return 0
    })
    expect(seen).toEqual([0, 1]) // Basic Attack swings under the Boost buff
  })
})

// ---------------------------------------------------------------------------
// V3 extension: per-swing estimation
// ---------------------------------------------------------------------------

const baseline: SwingBaseline = {
  hitChance: 0.9,
  hitDamage: 100,
  critDamage: 250,
  weaponDieAvg: 5, // e.g. 2d4 → 5
  threatFaces: 2, // 19-20
  critMultiplier: 2,
}

describe('estimateAttackSwing (V3 extension over V2 stub evaluators)', () => {
  it('a plain basic attack reproduces the baseline expected damage', () => {
    const basic = avail([{ name: 'Basic Attack', thisAttack: emptyBonus() }])[0]
    const critC = (2 / 20) * 0.9
    const expected = (0.9 - critC) * 100 + critC * 250
    expect(estimateAttackSwing(baseline, basic, [])).toBeCloseTo(expected, 10)
  })

  it('applies Cleave-style ThisAttack bonuses (+20% dmg, +1 threat, +1 crit mult)', () => {
    const cleave = avail([{
      name: 'Cleave',
      thisAttack: emptyBonus({ bonusDamagePercent: [20], bonusThreatRange: [1], bonusCriticalMultiplier: [1] }),
    }])[0]
    const critC = (3 / 20) * 0.9 // +1 threat face
    const critDmg = 250 + 100 * 1 // +1 multiplier ≈ +1× base hit damage
    const expected = ((0.9 - critC) * 100 + critC * critDmg) * 1.2
    expect(estimateAttackSwing(baseline, cleave, [])).toBeCloseTo(expected, 10)
  })

  it('indexes per-rank vectors at stacks-1', () => {
    const reed = avail([{
      name: 'Reed', stacks: 3,
      thisAttack: emptyBonus({ bonusDamagePercent: [20, 40, 60] }),
    }])[0]
    const critC = (2 / 20) * 0.9
    const expected = ((0.9 - critC) * 100 + critC * 250) * 1.6
    expect(estimateAttackSwing(baseline, reed, [])).toBeCloseTo(expected, 10)
  })

  it('adds +W weapon dice to hit and (multiplied) crit damage', () => {
    const wAttack = avail([{ name: 'W', thisAttack: emptyBonus({ bonusW: [2] }) }])[0]
    const critC = (2 / 20) * 0.9
    const expected = (0.9 - critC) * (100 + 10) + critC * (250 + 10 * 2)
    expect(estimateAttackSwing(baseline, wAttack, [])).toBeCloseTo(expected, 10)
  })

  it('applies active buff attack/damage/melee-power bonuses', () => {
    const basic = avail([{ name: 'Basic Attack' }])[0]
    const buff = {
      sourceAttack: 'Boost',
      bonus: emptyBonus({ duration: [20], bonusAttackBonus: [4], bonusDamage: [4], bonusMeleePower: [20] }),
      stacks: 1, startTime: 0, duration: 20,
    }
    const hitC = Math.min(0.95, 0.9 + 4 / 20)
    const critC = (2 / 20) * hitC
    const expected = ((hitC - critC) * 104 + critC * 254) * 1.2
    expect(estimateAttackSwing(baseline, basic, [buff])).toBeCloseTo(expected, 10)
  })
})

describe('estimateChainDamage (V3 extension)', () => {
  const hasteBoost = {
    name: 'Haste Boost',
    cooldown: [30],
    executionTime: 0,
    followOn: emptyBonus({ duration: [20], bonusAlacrity: [30] }),
  }
  const available = avail([{ name: 'Basic Attack', cooldown: [0] }, hasteBoost])

  it('alacrity buffs shorten subsequent basic swings', () => {
    const r = estimateChainDamage(['Haste Boost', 'Basic Attack', 'Basic Attack'], available, baseline)
    // Haste Boost itself takes 0s; basics swing at 0.6 / 1.3 each
    expect(r.totalDuration).toBeCloseTo(2 * 0.6 / 1.3, 10)
    expect(r.entries[1].timePoint).toBe(0)
    expect(r.entries[2].timePoint).toBeCloseTo(0.6 / 1.3, 10)
  })

  it('chain DPS = total expected damage / chain duration', () => {
    const r = estimateChainDamage(['Basic Attack', 'Basic Attack'], available, baseline)
    const critC = (2 / 20) * 0.9
    const perSwing = (0.9 - critC) * 100 + critC * 250
    expect(r.totalDuration).toBeCloseTo(1.2, 10)
    expect(r.totalDPS).toBeCloseTo((2 * perSwing) / 1.2, 8)
    expect(r.entries.map(e => e.dpsScore)).toEqual([perSwing, perSwing])
  })

  it('an empty chain produces zero DPS without dividing by zero', () => {
    const r = estimateChainDamage([], available, baseline)
    expect(r.totalDPS).toBe(0)
    expect(r.totalDuration).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Chain mutation helpers (AttackChain.cpp:62-81)
// ---------------------------------------------------------------------------

describe('chain mutation helpers', () => {
  it('AddAttack inserts at the given location, clamped', () => {
    expect(chainWithAttackAdded(['A', 'B'], 'X', 1)).toEqual(['A', 'X', 'B'])
    expect(chainWithAttackAdded(['A', 'B'], 'X', 99)).toEqual(['A', 'B', 'X'])
    expect(chainWithAttackAdded([], 'X', 0)).toEqual(['X'])
  })

  it('RemoveAttackAt removes by index and ignores out-of-range', () => {
    expect(chainWithAttackRemoved(['A', 'B', 'C'], 1)).toEqual(['A', 'C'])
    expect(chainWithAttackRemoved(['A'], 5)).toEqual(['A'])
  })

  it('move up/down swaps adjacent entries and clamps at the ends', () => {
    expect(chainWithAttackMoved(['A', 'B', 'C'], 2, -1)).toEqual(['A', 'C', 'B'])
    expect(chainWithAttackMoved(['A', 'B', 'C'], 0, 1)).toEqual(['B', 'A', 'C'])
    expect(chainWithAttackMoved(['A', 'B', 'C'], 0, -1)).toEqual(['A', 'B', 'C'])
    expect(chainWithAttackMoved(['A', 'B', 'C'], 2, 1)).toEqual(['A', 'B', 'C'])
  })
})

// ---------------------------------------------------------------------------
// V2 .DDOBuild round-trip (do not break the existing import/export contract)
// ---------------------------------------------------------------------------

describe('attack chains round-trip through V2 .DDOBuild', () => {
  it('YingsMonk.DDOBuild imports with no chains and empty active chain', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'), 'utf-8')
    const build = importV2Build(xml).build
    expect(build.attackChains).toEqual({})
    expect(build.activeAttackChain ?? '').toBe('')
  })

  it('chains added in V3 survive export → re-import', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'), 'utf-8')
    const build = importV2Build(xml).build
    build.attackChains = {
      Boss: ['Basic Attack', 'Cleave', 'Basic Attack'],
      Trash: ['Great Cleave'],
    }
    build.activeAttackChain = 'Boss'
    const reimported = importV2Build(exportV2Build(build)).build
    expect(reimported.attackChains).toEqual(build.attackChains)
    expect(reimported.activeAttackChain).toBe('Boss')
  })
})
