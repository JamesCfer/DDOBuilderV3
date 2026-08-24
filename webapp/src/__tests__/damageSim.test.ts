import { describe, expect, it } from 'vitest'
import {
  simulateDamage, mit, hitDie, mulberry32, emptyLists, quantile,
  type CoreParams, type SimLists,
} from '../lib/combat/damageSim'

/** A plain melee swinger with no procs, used as the baseline for most cases. */
function baseParams(over: Partial<CoreParams> = {}): CoreParams {
  return {
    atk: 110, prof: 20, prec: 5, seeker: 10, threat: 17,
    critMult: 3, crit19: 2, confPrec: true,
    wMult: 5.8, wCount: 1, wSides: 2, wFlat: 3,
    deadly: 124, deadlyCrit: 156, coreTag: 'physical',
    sneakPct: 0, decHit: 0, decDmg: 0, sneakDice: 0, sneakTag: 'physical',
    imbBonus: 0, imbSides: 8, imbRate: 100, imbSrc: 'RP', imbSP: 0,
    imbMRR: true, imbTag: 'poison',
    rp: 150, ds: 100, apm: 120,
    ac: 80, fort: 100, bypass: 75, prr: 0, mrr: 0,
    dur: 60, trials: 200, seed: 1,
    ...over,
  }
}

describe('mit', () => {
  it('is 100/(100+v) and floors the input at -80', () => {
    expect(mit(0)).toBe(1)
    expect(mit(100)).toBe(0.5)
    // Negative values amplify, capped at 5x.
    expect(mit(-80)).toBeCloseTo(5, 10)
    expect(mit(-500)).toBeCloseTo(5, 10)
  })
})

describe('hitDie', () => {
  it('rounds to 5% steps and clamps to 5-95%', () => {
    expect(hitDie(1000, 80, 0).p).toBe(0.95)
    expect(hitDie(-1000, 80, 0).p).toBe(0.05)
    // A natural 1 always misses, so the miss count never reaches 0.
    expect(hitDie(1000, 80, 0).miss).toBe(1)
  })

  it('derives miss faces from the hit probability', () => {
    const d = hitDie(70, 80, 0) // (70 + 10.5) / 160 = 0.503 -> 0.50
    expect(d.p).toBe(0.5)
    expect(d.miss).toBe(10)
  })

  it('treats a non-positive AC as an automatic near-hit', () => {
    expect(hitDie(0, 0, 0)).toEqual({ p: 0.95, miss: 1 })
  })
})

describe('mulberry32', () => {
  it('is deterministic for a seed and stays in [0,1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 50; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('simulateDamage', () => {
  it('reproduces a run exactly for the same seed', () => {
    const p = baseParams()
    const a = simulateDamage(p, emptyLists())
    const b = simulateDamage(p, emptyLists())
    expect(a.mean).toBe(b.mean)
    expect(a.sorted).toEqual(b.sorted)
  })

  it('produces a different run for a different seed', () => {
    const a = simulateDamage(baseParams({ seed: 1 }), emptyLists())
    const b = simulateDamage(baseParams({ seed: 2 }), emptyLists())
    expect(a.mean).not.toBe(b.mean)
  })

  it('returns trial totals sorted ascending', () => {
    const r = simulateDamage(baseParams(), emptyLists())
    expect(r.sorted).toHaveLength(200)
    for (let i = 1; i < r.sorted.length; i++) {
      expect(r.sorted[i]).toBeGreaterThanOrEqual(r.sorted[i - 1])
    }
  })

  it('clamps the trial count into [1, 20000]', () => {
    expect(simulateDamage(baseParams({ trials: 0, dur: 6 }), emptyLists()).trials).toBe(1)
    expect(simulateDamage(baseParams({ trials: -5, dur: 6 }), emptyLists()).trials).toBe(1)
  })

  it('resolves more attacks when attacks per minute rises', () => {
    const slow = simulateDamage(baseParams({ apm: 60 }), emptyLists())
    const fast = simulateDamage(baseParams({ apm: 120 }), emptyLists())
    expect(fast.atk).toBeGreaterThan(slow.atk)
  })

  it('clamps the threat face to 20, so a 21 threatens on natural 20 only', () => {
    const r = simulateDamage(baseParams({ threat: 21 }), emptyLists())
    // Every threat is a natural 20, and every natural 20 crits via vorpal.
    expect(r.threats).toBe(r.nat20)
    expect(r.crits).toBe(r.nat20)
    // Widening to 17-20 threatens far more often.
    const wide = simulateDamage(baseParams({ threat: 17 }), emptyLists())
    expect(wide.threats).toBeGreaterThan(r.threats * 2)
  })

  it('crits every natural 20 regardless of fortification', () => {
    // Fortification 100 with no bypass demotes every non-20 threat, so the
    // only surviving crits are vorpal ones.
    const r = simulateDamage(
      baseParams({ fort: 100, bypass: 0, seeker: -1000 }),
      emptyLists(),
    )
    expect(r.crits).toBe(r.nat20)
    expect(r.crits).toBeGreaterThan(0)
  })

  it('scales damage with Melee/Ranged Power', () => {
    const low = simulateDamage(baseParams({ rp: 0 }), emptyLists())
    const high = simulateDamage(baseParams({ rp: 300 }), emptyLists())
    expect(high.mean).toBeGreaterThan(low.mean * 2)
  })

  it('mitigates the critable bucket with PRR', () => {
    const raw = simulateDamage(baseParams({ prr: 0 }), emptyLists())
    const armoured = simulateDamage(baseParams({ prr: 100 }), emptyLists())
    // 100 PRR halves incoming damage; the dice are identical for one seed.
    expect(armoured.mean / raw.mean).toBeCloseTo(0.5, 1)
  })
})

describe('procs', () => {
  const proc = (over: Partial<SimLists['procs'][0]> = {}) => ({
    name: 'Test proc', trigger: 'hit' as const, chance: 100, icd: 0,
    dice: 1, sides: 6, flat: 0, rpRate: 0, dsScale: false, tag: 'fire',
    ...over,
  })

  it('adds a proc bucket only when a proc is present', () => {
    const none = simulateDamage(baseParams(), emptyLists())
    expect(none.buckets.proc).toBe(0)

    const withProc = simulateDamage(baseParams(), { ...emptyLists(), procs: [proc()] })
    expect(withProc.buckets.proc).toBeGreaterThan(0)
  })

  it('respects the internal cooldown', () => {
    const hot = simulateDamage(baseParams(), { ...emptyLists(), procs: [proc({ icd: 0 })] })
    const cold = simulateDamage(baseParams(), { ...emptyLists(), procs: [proc({ icd: 30 })] })
    expect(cold.buckets.proc).toBeLessThan(hot.buckets.proc)
  })

  it('never fires a "when called" proc without a rider', () => {
    const r = simulateDamage(baseParams(), {
      ...emptyLists(),
      procs: [proc({ trigger: 'when called' })],
    })
    expect(r.buckets.proc).toBe(0)
  })

  it('fires a "when called" proc through a special attack rider', () => {
    const r = simulateDamage(baseParams(), {
      ...emptyLists(),
      procs: [proc({ name: 'Called', trigger: 'when called' })],
      specials: [{
        name: 'Cleave', cd: 6, displaced: 1, hits: 1, pct: 0,
        toHit: 0, dmg: 0, threatMod: 0, multMod: 0, rider: ['Called'],
      }],
    })
    expect(r.specialUses).toBeGreaterThan(0)
    expect(r.buckets.proc).toBeGreaterThan(0)
  })
})

describe('debuffs and vulnerability', () => {
  const vuln = (tag: string) => ({
    name: `Vuln ${tag || 'generic'}`, trigger: 'hit' as const, chance: 100, icd: 1,
    stacks: 1, cap: 20, decay: 5, decayAll: false,
    target: 'vulnerability' as const, value: 1, tag,
  })

  // Every list entry draws from the same PRNG stream, so a run with one more
  // debuff rolls different dice than a run without it. Comparisons therefore
  // use a value-0 control that keeps the stream identical and isolates the
  // effect under test.
  const control = (tag: string) => ({ ...vuln(tag), value: 0 })

  it('raises total damage without touching the raw buckets', () => {
    const off = simulateDamage(baseParams(), { ...emptyLists(), debuffs: [control('')] })
    const on = simulateDamage(baseParams(), { ...emptyLists(), debuffs: [vuln('')] })
    // Buckets are pre-mitigation and pre-vulnerability, so they are unchanged.
    expect(on.buckets.critable).toBeCloseTo(off.buckets.critable, 5)
    expect(on.mean).toBeGreaterThan(off.mean)
    expect(on.vulnAvg).toBeGreaterThan(0)
  })

  it('applies a tagged vulnerability only to matching damage', () => {
    // The build's core damage is tagged 'physical'.
    const matching = simulateDamage(baseParams(), { ...emptyLists(), debuffs: [vuln('physical')] })
    const matchOff = simulateDamage(baseParams(), { ...emptyLists(), debuffs: [control('physical')] })
    const other = simulateDamage(baseParams(), { ...emptyLists(), debuffs: [vuln('fire')] })
    const otherOff = simulateDamage(baseParams(), { ...emptyLists(), debuffs: [control('fire')] })

    expect(matching.mean).toBeGreaterThan(matchOff.mean)
    // Nothing in this build deals fire damage, so a fire-tagged vulnerability
    // changes nothing at all.
    expect(other.mean).toBe(otherOff.mean)
    // A tagged vulnerability is not generic, so it never shows in vulnAvg.
    expect(matching.vulnAvg).toBe(0)
  })

  it('lowers effective PRR when a PRR debuff is up', () => {
    const armoured = simulateDamage(baseParams({ prr: 100 }), emptyLists())
    const stripped = simulateDamage(baseParams({ prr: 100 }), {
      ...emptyLists(),
      debuffs: [{
        name: 'Sunder', trigger: 'hit', chance: 100, icd: 0, stacks: 100,
        cap: 100, decay: 9999, decayAll: false, target: 'PRR', value: 1, tag: '',
      }],
    })
    expect(stripped.mean).toBeGreaterThan(armoured.mean)
  })
})

describe('damage over time', () => {
  const dot = (over: Partial<SimLists['dots'][0]> = {}) => ({
    name: 'Burn', trigger: 'hit' as const, chance: 100, icd: 0,
    cap: 1, perTick: 10, dice: 0, sides: 6, tick: 2, dur: 9999,
    rpRate: 0, tag: 'fire', ...over,
  })

  it('accumulates a dot bucket that grows with the stack cap', () => {
    const small = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ cap: 1 })] })
    const big = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ cap: 10 })] })
    expect(small.buckets.dot).toBeGreaterThan(0)
    expect(big.buckets.dot).toBeGreaterThan(small.buckets.dot)
  })

  it('expires stacks once the duration lapses', () => {
    // A DoT that never falls off out-damages one that lasts two seconds.
    const forever = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ cap: 5, dur: 9999, icd: 5 })] })
    const brief = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ cap: 5, dur: 2, icd: 5 })] })
    expect(brief.buckets.dot).toBeGreaterThan(0)
    expect(brief.buckets.dot).toBeLessThan(forever.buckets.dot)
  })

  it('drops the whole stack at once when decayAll is set', () => {
    // Re-application refreshes the timer, so decayAll only bites when gaps
    // open up between applications -- hence the low proc chance here. Under
    // continuous attack a Magma-like DoT is refreshed long before its 5s
    // duration lapses, and decayAll makes no difference at all.
    const rare = { cap: 5, dur: 5, chance: 6 }
    const oneAtATime = simulateDamage(baseParams(), {
      ...emptyLists(), dots: [dot({ ...rare, decayAll: false })],
    })
    const allAtOnce = simulateDamage(baseParams(), {
      ...emptyLists(), dots: [dot({ ...rare, decayAll: true })],
    })
    expect(allAtOnce.buckets.dot).toBeLessThan(oneAtATime.buckets.dot)
  })

  it('is unaffected by decayAll while the stack keeps being refreshed', () => {
    // The Magma-like case: 1s cooldown, 5s duration, attacking throughout.
    const sustained = { cap: 5, dur: 5, icd: 1, chance: 100 }
    const a = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ ...sustained, decayAll: false })] })
    const b = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ ...sustained, decayAll: true })] })
    expect(a.buckets.dot).toBe(b.buckets.dot)
  })

  it('leaves a very long duration effectively permanent', () => {
    // Backwards compatibility with the original calculator, whose DoT stacks
    // never expired and whose duration field defaulted to 9999.
    const a = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ dur: 9999 })] })
    const b = simulateDamage(baseParams(), { ...emptyLists(), dots: [dot({ dur: 1e9 })] })
    expect(a.buckets.dot).toBe(b.buckets.dot)
  })
})

describe('buffs', () => {
  it('raises damage while stacks are up', () => {
    const plain = simulateDamage(baseParams(), emptyLists())
    const buffed = simulateDamage(baseParams(), {
      ...emptyLists(),
      buffs: [{
        name: 'Power surge', trigger: 'hit', chance: 100, icd: 0,
        dur: 9999, cap: 10, decayAll: false, target: 'rp', value: 50,
      }],
    })
    expect(buffed.mean).toBeGreaterThan(plain.mean)
  })

  it('gates an effect behind a required buff', () => {
    const lists: SimLists = {
      ...emptyLists(),
      // The buff never fires, so anything requiring it stays dormant.
      buffs: [{
        name: 'Never', trigger: 'hit', chance: 0, icd: 0,
        dur: 10, cap: 1, decayAll: false, target: 'rp', value: 50,
      }],
      procs: [{
        name: 'Gated', trigger: 'hit', chance: 100, icd: 0, dice: 1, sides: 6,
        flat: 0, rpRate: 0, dsScale: false, tag: 'fire', requires: 'Never',
      }],
    }
    expect(simulateDamage(baseParams(), lists).buckets.proc).toBe(0)
  })
})

describe('quantile', () => {
  it('indexes the sorted array and handles the empty case', () => {
    expect(quantile([], 0.5)).toBe(0)
    expect(quantile([1, 2, 3, 4], 0)).toBe(1)
    expect(quantile([1, 2, 3, 4], 0.99)).toBe(4)
  })
})
