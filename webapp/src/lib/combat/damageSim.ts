// Clock-based Monte Carlo encounter damage model.
//
// A faithful TypeScript port of the NicDamageCalc engine
// (https://bb-resources.web.app/NicDamageCalc/). Each trial runs a live
// encounter on a seconds clock: attacks resolve in sequence, special-attack
// cooldowns spend attack time, proc/DoT/buff/debuff stacks build and decay.
// The whole encounter repeats `trials` times to build a distribution.
//
// This module is pure -- no React, no DOM, no fs -- so it unit tests directly.
// UI lives in components/combat/DamageCalcPanel.tsx, and the build -> parameter
// extraction lives in autoDamage.ts.
//
// Parity note: the numeric behaviour here intentionally matches the original
// calculator swing for swing, including the choices that differ from V2's
// closed-form attackEntry.ts model (hit chance from an AB/AC ratio rather than
// a d20 target number, damage buckets accumulated pre-mitigation, and so on).

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/** What a proc / DoT / buff / debuff listens for. */
export type Trigger = 'hit' | 'crit' | 'natural 20' | 'when called'

export const TRIGGERS: Trigger[] = ['hit', 'crit', 'natural 20', 'when called']

/** Self-buff targets -- what stat a buff stack raises. */
export type BuffTarget = 'rp' | 'ds' | 'toHit' | 'critable'

/** Debuff targets -- what target stat a debuff stack degrades. */
export type DebuffTarget =
  | 'vulnerability' | 'PRR' | 'MRR' | 'fortification' | 'AC' | 'saves'

/** The live modifier image at one instant of the encounter. */
interface Mods {
  rp: number
  ds: number
  toHit: number
  critable: number
  vulnPct: number
  tgtPRR: number
  tgtMRR: number
  tgtFort: number
  tgtAC: number
  tgtSave: number
  /** Tag-specific vulnerability, keyed by normalised tag. */
  vTag: Record<string, number>
}

/** Debuff target -> internal modifier key. */
const DEBUFF_KEY: Record<DebuffTarget, keyof Mods> = {
  vulnerability: 'vulnPct',
  PRR: 'tgtPRR',
  MRR: 'tgtMRR',
  fortification: 'tgtFort',
  AC: 'tgtAC',
  saves: 'tgtSave',
}

/** Fields every list entry carries. */
interface Named {
  name: string
  /** Where this entry came from, for the "what was added" audit list. */
  source?: string
  /** How trustworthy the numbers are when auto-derived. */
  confidence?: 'exact' | 'estimated'
}

/** Fields shared by everything that rolls a chance on a trigger. */
interface Triggered extends Named {
  trigger: Trigger
  /** Percent chance to fire, 0-100. */
  chance: number
  /** Internal cooldown in seconds. */
  icd: number
  /**
   * Name of a buff or debuff that must have at least one stack for this to
   * fire at all. `'none'` or empty means ungated.
   */
  requires?: string
}

/** A direct-damage proc. Procs never crit. */
export interface ProcSpec extends Triggered {
  dice: number
  sides: number
  flat: number
  /** Percent of Ranged Power this proc scales with (100 = full RP scaling). */
  rpRate: number
  /** Whether Doubleshot multiplies it. */
  dsScale: boolean
  /** Damage tag, matched against tagged vulnerability debuffs. */
  tag: string
  /** Buffs / debuffs / procs fired when this proc lands. */
  rider?: string[]
}

/** A stacking damage-over-time effect. */
export interface DotSpec extends Triggered {
  /** Maximum stacks. */
  cap: number
  /** Flat damage per stack per tick. */
  perTick: number
  /** Extra dice per stack per tick. */
  dice: number
  sides: number
  /** Seconds between ticks. */
  tick: number
  /**
   * Stack duration in seconds, refreshed each time the DoT is re-applied.
   * Use a very large value for a DoT that should never fall off.
   */
  dur: number
  /**
   * True = the whole stack drops at once when the duration lapses; false =
   * one stack per expiry. DDO's Magma-like effects drop all five at once.
   */
  decayAll?: boolean
  rpRate: number
  tag: string
}

/** A timed self-buff. */
export interface BuffSpec extends Triggered {
  /** Seconds one stack lasts. */
  dur: number
  cap: number
  /** True = the whole stack falls off at once; false = one stack per expiry. */
  decayAll: boolean
  target: BuffTarget
  /** Value granted per stack. */
  value: number
}

/** A stacking target debuff. Values are positive to weaken the target. */
export interface DebuffSpec extends Triggered {
  /** Stacks applied per application. */
  stacks: number
  cap: number
  /** Seconds between stack decay. */
  decay: number
  decayAll: boolean
  target: DebuffTarget
  value: number
  /** Blank = generic; set = only boosts damage sources sharing this tag. */
  tag: string
}

/** A special attack on a cooldown. */
export interface SpecialSpec extends Named {
  /** Cooldown in seconds. */
  cd: number
  /** Number of normal attacks the animation displaces. */
  displaced: number
  /** Hits delivered per use. */
  hits: number
  /** Percent damage bonus applied to the critable bucket. */
  pct: number
  toHit: number
  dmg: number
  /** Widens the threat range by this many faces. */
  threatMod: number
  /** Added to the crit multiplier. */
  multMod: number
  rider?: string[]
}

/** A cooldown-driven self-buff (e.g. an action boost). */
export interface CdBuffSpec extends Named {
  cd: number
  dur: number
  displaced: number
  target: BuffTarget
  value: number
}

/** The full set of effect lists driving a simulation. */
export interface SimLists {
  procs: ProcSpec[]
  dots: DotSpec[]
  buffs: BuffSpec[]
  debuffs: DebuffSpec[]
  specials: SpecialSpec[]
  cdbuffs: CdBuffSpec[]
}

export const LIST_KEYS = ['procs', 'dots', 'buffs', 'debuffs', 'specials', 'cdbuffs'] as const
export type ListKey = typeof LIST_KEYS[number]

export function emptyLists(): SimLists {
  return { procs: [], dots: [], buffs: [], debuffs: [], specials: [], cdbuffs: [] }
}

/** Scalar inputs -- the character, the target, and the run settings. */
export interface CoreParams {
  // To-hit
  /** Total attack bonus. */
  atk: number
  /** Flat percentage added to hit chance from proficiency. */
  prof: number
  /** Flat percentage added to hit chance from precision-style effects. */
  prec: number
  /** Seeker, added to the confirmation roll only. */
  seeker: number
  /** Lowest d20 face that threatens, e.g. 17 = threatens on 17-20. */
  threat: number
  /** Base critical multiplier. */
  critMult: number
  /** Extra multiplier applied on natural 19-20 only. */
  crit19: number
  /** Whether precision counts toward the confirmation roll. */
  confPrec: boolean

  // Critable bucket
  /** [W] multiplier. Fractional values roll an extra scaled dice set. */
  wMult: number
  wCount: number
  wSides: number
  /** Flat damage inside the [W] brackets. */
  wFlat: number
  /** Deadly-style flat damage on a normal hit. */
  deadly: number
  /** Deadly-style flat damage on a crit. */
  deadlyCrit: number
  coreTag: string

  // Sneak attack
  /** Percent of attacks that qualify for sneak attack. */
  sneakPct: number
  /** Deception-style to-hit bonus while sneaking. */
  decHit: number
  /** Deception-style damage bonus while sneaking. */
  decDmg: number
  /** Number of d6 sneak dice. */
  sneakDice: number
  sneakTag: string

  // Imbue
  /** Bonus imbue dice -- the imbue rolls this many dice plus one. */
  imbBonus: number
  imbSides: number
  /** Imbue scaling rate as a percentage. */
  imbRate: number
  /** Whether the imbue scales with Ranged Power or Spell Power. */
  imbSrc: 'RP' | 'SP'
  imbSP: number
  /** Whether the imbue is mitigated by MRR rather than PRR. */
  imbMRR: boolean
  imbTag: string

  // Scaling
  /** Ranged Power (or Melee Power -- same maths). */
  rp: number
  /** Doubleshot (or Doublestrike) percentage. */
  ds: number
  /** Attacks per minute. */
  apm: number

  // Target
  ac: number
  /** Target fortification percentage. */
  fort: number
  /** Fortification bypass percentage. */
  bypass: number
  prr: number
  mrr: number

  // Simulation
  /** Encounter length in seconds. */
  dur: number
  trials: number
  seed: number
}

/** Which bucket a unit of raw damage came from. */
export interface DamageBuckets {
  critable: number
  sneak: number
  imbue: number
  proc: number
  dot: number
}

export interface HitDie {
  /** Probability to hit, rounded to 5% steps and clamped to [0.05, 0.95]. */
  p: number
  /** Number of low d20 faces that miss. */
  miss: number
}

export interface SimResult {
  params: CoreParams
  /** Per-trial encounter totals, ascending. */
  sorted: number[]
  mean: number
  /** Population standard deviation of the trial totals. */
  sd: number
  /** Raw (pre-mitigation) damage by source, summed across all trials. */
  buckets: DamageBuckets
  /** Hit die computed from the unbuffed attack bonus, for display. */
  baseHitDie: HitDie
  atk: number
  hits: number
  threats: number
  fortStop: number
  confFail: number
  crits: number
  nat20: number
  sneaks: number
  /** Time-averaged generic vulnerability percentage. */
  vulnAvg: number
  specialUses: number
  trials: number
  dur: number
}

// ---------------------------------------------------------------------------
// Core formulas
// ---------------------------------------------------------------------------

/** Deterministic PRNG so a seed reproduces a run exactly. */
export function mulberry32(a: number): () => number {
  let s = a | 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * PRR / MRR mitigation multiplier: 100 / (100 + value).
 *
 * Negative values amplify damage instead of reducing it. The value floors at
 * -80, so incoming damage caps at 5x and further reduction past that point is
 * wasted.
 */
export function mit(v: number): number {
  return 100 / (100 + Math.max(-80, v))
}

/**
 * Hit chance as (AB + 10.5) / (AC * 2) plus flat percentage sources, rounded
 * to the nearest 5% and clamped to 5-95% so a natural 1 always misses.
 *
 * Misses occupy the low d20 faces, so threat faces always land on faces that
 * already hit.
 */
export function hitDie(ab: number, ac: number, flatPct: number): HitDie {
  if (ac <= 0) return { p: 0.95, miss: 1 }
  let p = (ab + 10.5) / (ac * 2) + flatPct / 100
  p = Math.min(0.95, Math.max(0.05, Math.round(p * 20) / 20))
  return { p, miss: Math.round((1 - p) * 20) }
}

const norm = (tag: string | undefined): string => (tag ?? '').trim().toLowerCase()

/** Coerces a rider field that may be a string, an array, or 'none'. */
function riderNames(v: string[] | string | undefined): string[] {
  if (Array.isArray(v)) return v.filter(x => x && x !== 'none')
  if (v && v !== 'none') return [v]
  return []
}

// ---------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------

export function simulateDamage(params: CoreParams, lists: SimLists): SimResult {
  const P: CoreParams = { ...params }
  P.trials = Math.max(1, Math.min(20000, Math.floor(P.trials) || 1))

  const { procs, dots, buffs, debuffs, specials, cdbuffs } = lists

  const rng = mulberry32(P.seed || 1)
  const atkTime = 60 / Math.max(1, P.apm)
  const wFull = Math.floor(P.wMult)
  const wFrac = P.wMult - wFull
  const roll = (s: number): number => 1 + Math.floor(rng() * s)
  const wRoll = (): number => {
    let v = 0
    for (let d = 0; d < P.wCount; d++) v += roll(P.wSides)
    return v + P.wFlat
  }

  const totals = new Float64Array(P.trials)
  const buckets: DamageBuckets = { critable: 0, sneak: 0, imbue: 0, proc: 0, dot: 0 }
  let atk = 0, hits = 0, threats = 0, fortStop = 0, confFail = 0
  let crits = 0, nat20 = 0, sneaks = 0
  let vulnSum = 0, vulnN = 0, specialUses = 0

  for (let tr = 0; tr < P.trials; tr++) {
    let t = 0
    let total = 0

    // Per-effect live state for this encounter.
    const bTimer = buffs.map(() => ({ n: 0, exp: 0, icd: -1e9 }))
    const dTimer = dots.map(() => ({ n: 0, next: 0, icd: -1e9, exp: 0 }))
    const pIcd = procs.map(() => -1e9)
    const dbT = debuffs.map(() => ({ n: 0, exp: 0, icd: -1e9 }))
    const sNext = specials.map(() => 0)
    const cNext = cdbuffs.map(() => 0)
    const cUntil = cdbuffs.map(() => -1e9)

    const mods = (): Mods => {
      const m: Mods = {
        rp: 0, ds: 0, toHit: 0, critable: 0, vulnPct: 0,
        tgtPRR: 0, tgtMRR: 0, tgtFort: 0, tgtAC: 0, tgtSave: 0, vTag: {},
      }
      buffs.forEach((b, i) => {
        if (bTimer[i].n > 0) m[b.target] += b.value * bTimer[i].n
      })
      debuffs.forEach((b, i) => {
        if (dbT[i].n <= 0) return
        const v = b.value * dbT[i].n
        const tg = norm(b.tag)
        // A tagged vulnerability boosts only sources sharing the tag; an
        // untagged one is generic and boosts everything.
        if (b.target === 'vulnerability' && tg) m.vTag[tg] = (m.vTag[tg] ?? 0) + v
        else (m[DEBUFF_KEY[b.target]] as number) += v
      })
      cdbuffs.forEach((b, i) => {
        if (t < cUntil[i]) m[b.target] += b.value
      })
      return m
    }

    /** Vulnerability multiplier for a damage source carrying `tag`. */
    const vFor = (m: Mods, tag: string | undefined): number =>
      1 + (m.vulnPct + (m.vTag[norm(tag)] ?? 0)) / 100

    /** True when a required buff/debuff is not currently up. */
    const gated = (e: Triggered): boolean => {
      const nm = e.requires
      if (!nm || nm === 'none') return false
      let i = buffs.findIndex(x => x.name === nm)
      if (i >= 0) return bTimer[i].n <= 0
      i = debuffs.findIndex(x => x.name === nm)
      if (i >= 0) return dbT[i].n <= 0
      return false
    }

    const applyProc = (i: number): void => {
      const pr = procs[i]
      if (gated(pr)) return
      if (t - pIcd[i] < pr.icd) return
      if (rng() * 100 >= pr.chance) return
      pIcd[i] = t
      let d = pr.flat || 0
      for (let k = 0; k < pr.dice; k++) d += roll(pr.sides)
      d *= (1 + (pr.rpRate * P.rp) / 10000) * (pr.dsScale ? 1 + P.ds / 100 : 1)
      const m = mods()
      buckets.proc += d
      total += d * mit(P.mrr - m.tgtMRR) * vFor(m, pr.tag)
      applyRider(pr.rider)
    }

    const applyDot = (i: number): void => {
      const dt = dots[i]
      if (gated(dt)) return
      if (t - dTimer[i].icd < dt.icd) return
      if (rng() * 100 >= dt.chance) return
      dTimer[i].icd = t
      dTimer[i].n = Math.min(dt.cap, dTimer[i].n + 1)
      // Re-applying refreshes the whole stack's timer, as DDO does.
      dTimer[i].exp = t + dt.dur
    }

    const applyBuff = (i: number): void => {
      const b = buffs[i]
      if (gated(b)) return
      if (t - bTimer[i].icd < b.icd) return
      if (rng() * 100 >= b.chance) return
      bTimer[i].icd = t
      bTimer[i].n = Math.min(b.cap, bTimer[i].n + 1)
      bTimer[i].exp = t + b.dur
    }

    const applyDebuff = (i: number): void => {
      const b = debuffs[i]
      if (gated(b)) return
      if (t - dbT[i].icd < b.icd) return
      if (rng() * 100 >= b.chance) return
      dbT[i].icd = t
      dbT[i].n = Math.min(b.cap, dbT[i].n + b.stacks)
      dbT[i].exp = t + b.decay
    }

    /**
     * Fires a rider by name. Riders resolve against buffs, then debuffs, then
     * procs. A rider still rolls its own chance and respects its own ICD.
     */
    function applyRider(v: string[] | string | undefined): void {
      for (const nm of riderNames(v)) {
        let i = buffs.findIndex(x => x.name === nm)
        if (i >= 0) { applyBuff(i); continue }
        i = debuffs.findIndex(x => x.name === nm)
        if (i >= 0) { applyDebuff(i); continue }
        i = procs.findIndex(x => x.name === nm)
        if (i >= 0) { applyProc(i); continue }
      }
    }

    const fire = (trig: Trigger): void => {
      procs.forEach((pr, i) => { if (pr.trigger === trig) applyProc(i) })
      dots.forEach((dt, i) => { if (dt.trigger === trig) applyDot(i) })
      buffs.forEach((b, i) => { if (b.trigger === trig) applyBuff(i) })
      debuffs.forEach((b, i) => { if (b.trigger === trig) applyDebuff(i) })
    }

    /** Resolves one swing. `o` carries any special-attack bonuses. */
    const resolve = (o: Partial<SpecialSpec>): boolean => {
      const bonusHit = o.toHit ?? 0
      const bonusDmg = o.dmg ?? 0
      const pctBonus = o.pct ?? 0
      atk++
      const m = mods()
      const isSneak = P.sneakPct > 0 && rng() * 100 < P.sneakPct
      if (isSneak) sneaks++

      const ac = Math.max(1, P.ac - m.tgtAC)
      const ab = P.atk + m.toHit + bonusHit + (isSneak ? P.decHit : 0)
      const die = hitDie(ab, ac, P.prof + P.prec)
      const r = roll(20)
      if (r <= die.miss) return false
      hits++

      const threatLow = Math.max(2, Math.min(20, P.threat - (o.threatMod ?? 0)))
      let crit = false
      if (r >= threatLow) {
        threats++
        if (r === 20) {
          // Vorpal: a natural 20 crits outright, skipping both fortification
          // and the confirmation roll.
          crit = true
          nat20++
        } else {
          const eff = Math.max(0, (P.fort - m.tgtFort) - P.bypass)
          if (eff > 0 && roll(100) <= eff) fortStop++
          else {
            const cab = P.atk + m.toHit + bonusHit + P.seeker
            const cd = hitDie(cab, ac, P.prof + (P.confPrec ? P.prec : 0))
            if (roll(20) > cd.miss) crit = true
            else confFail++
          }
        }
      }
      if (crit) crits++
      const mult = crit
        ? (r >= 19 ? P.critMult + P.crit19 : P.critMult) + (o.multMod ?? 0)
        : 1

      // Fractional [W] rolls an extra independent dice set and scales only
      // that roll, so 5.8[1d2+3] is six rolls rather than one stretched roll.
      let dice = 0
      for (let k = 0; k < wFull; k++) dice += wRoll()
      if (wFrac > 0) dice += wRoll() * wFrac

      let core = dice + (crit ? P.deadlyCrit : P.deadly) +
        (isSneak ? P.decDmg : 0) + m.critable + bonusDmg
      core *= mult
      core *= (1 + (P.rp + m.rp) / 100) * (1 + (P.ds + m.ds) / 100) * (1 + pctBonus / 100)

      // Sneak dice scale at 150% of Ranged Power and never crit.
      let sneakDmg = 0
      if (isSneak && P.sneakDice > 0) {
        for (let k = 0; k < P.sneakDice; k++) sneakDmg += roll(6)
        sneakDmg *= (1 + (1.5 * (P.rp + m.rp)) / 100) * (1 + (P.ds + m.ds) / 100)
      }

      let imb = 0
      if (P.imbBonus + 1 > 0 && P.imbSides > 0) {
        for (let k = 0; k < P.imbBonus + 1; k++) imb += roll(P.imbSides)
        const src = P.imbSrc === 'SP' ? P.imbSP : P.rp + m.rp
        imb *= (1 + (P.imbRate * src) / 10000) * (1 + (P.ds + m.ds) / 100)
      }

      buckets.critable += core
      buckets.sneak += sneakDmg
      buckets.imbue += imb

      const prr = P.prr - m.tgtPRR
      const mrr = P.mrr - m.tgtMRR
      total += core * mit(prr) * vFor(m, P.coreTag)
      total += sneakDmg * mit(prr) * vFor(m, P.sneakTag)
      total += imb * (P.imbMRR ? mit(mrr) : mit(prr)) * vFor(m, P.imbTag)

      fire('hit')
      if (crit) fire('crit')
      if (r === 20) fire('natural 20')
      return true
    }

    while (t < P.dur) {
      // Stack expiry.
      buffs.forEach((b, i) => {
        if (bTimer[i].n > 0 && t >= bTimer[i].exp) {
          bTimer[i].n = b.decayAll ? 0 : bTimer[i].n - 1
          bTimer[i].exp = t + b.dur
        }
      })
      debuffs.forEach((b, i) => {
        if (dbT[i].n > 0 && t >= dbT[i].exp) {
          dbT[i].n = b.decayAll ? 0 : dbT[i].n - 1
          dbT[i].exp = t + b.decay
        }
      })
      // DoT stacks expire too. The original calculator left `dur` unused and
      // let stacks ride forever, which is harmless at its 9999s default but
      // badly overstates DDO's real DoTs -- the Magma-like family holds five
      // stacks for five seconds and then drops all of them at once.
      dots.forEach((dt, i) => {
        if (dTimer[i].n > 0 && t >= dTimer[i].exp) {
          dTimer[i].n = dt.decayAll ? 0 : dTimer[i].n - 1
          dTimer[i].exp = t + dt.dur
        }
      })

      // DoT ticks.
      const mNow = mods()
      dots.forEach((dt, i) => {
        if (dTimer[i].n > 0 && t >= dTimer[i].next) {
          let per = dt.perTick || 0
          for (let k = 0; k < (dt.dice || 0); k++) per += roll(dt.sides)
          const d = dTimer[i].n * per * (1 + (dt.rpRate * (P.rp + mNow.rp)) / 10000)
          buckets.dot += d
          total += d * mit(P.mrr - mNow.tgtMRR) * vFor(mNow, dt.tag)
          dTimer[i].next = t + dt.tick
        }
      })

      vulnSum += mNow.vulnPct
      vulnN++

      // One action per clock step: specials first, then cooldown buffs, then
      // a plain swing.
      let acted = false
      for (let i = 0; i < specials.length && !acted; i++) {
        const sp = specials[i]
        if (t >= sNext[i]) {
          sNext[i] = t + sp.cd
          specialUses++
          let landed = false
          for (let h = 0; h < sp.hits; h++) if (resolve(sp)) landed = true
          if (landed) applyRider(sp.rider)
          t += sp.displaced * atkTime
          acted = true
        }
      }
      for (let i = 0; i < cdbuffs.length && !acted; i++) {
        const cb = cdbuffs[i]
        if (t >= cNext[i]) {
          cNext[i] = t + cb.cd
          cUntil[i] = t + cb.dur
          t += cb.displaced * atkTime
          acted = true
        }
      }
      if (!acted) {
        resolve({})
        t += atkTime
      }
    }
    totals[tr] = Math.floor(total)
  }

  const sorted = Array.from(totals).sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const sd = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / sorted.length)

  return {
    params: P, sorted, mean, sd, buckets,
    baseHitDie: hitDie(P.atk, P.ac, P.prof + P.prec),
    atk, hits, threats, fortStop, confFail, crits, nat20, sneaks,
    vulnAvg: vulnN ? vulnSum / vulnN : 0,
    specialUses, trials: P.trials, dur: P.dur,
  }
}

/** Percentile helper over the ascending trial totals. */
export function quantile(sorted: number[], f: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]
}
