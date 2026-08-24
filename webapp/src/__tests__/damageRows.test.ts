import { describe, expect, it } from 'vitest'
import {
  hitDamageRows, critDamageRows, mainDprRows, totalDprRows, dpsRows,
  offhandDprRows, sourceShareRows, bucketSourceRows, type TipRow,
} from '../lib/combat/damageRows'
import type { AttackEntryResult } from '../lib/combat/attackEntry'
import { simulateDamage, emptyLists, type CoreParams } from '../lib/combat/damageSim'
import {
  fmtDamage, fmtSigned, fmtFactor, fmtPercent, fmtPercentValue, fmtCount,
} from '../lib/combat/format'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('fmtDamage', () => {
  it('keeps a decimal below 1000 and drops it once meaningless', () => {
    expect(fmtDamage(12.34)).toBe('12.3')
    expect(fmtDamage(859.24)).toBe('859.2')
    expect(fmtDamage(3602.14)).toBe('3,602')
    expect(fmtDamage(1249842)).toBe('1,249,842')
  })

  it('renders a whole number without a trailing zero', () => {
    expect(fmtDamage(0)).toBe('0')
    expect(fmtDamage(42)).toBe('42')
  })

  it('separates thousands so long numbers stay readable', () => {
    expect(fmtDamage(1000)).toBe('1,000')
    expect(fmtDamage(999.9)).toBe('999.9')
  })

  it('survives non-finite input rather than printing NaN', () => {
    expect(fmtDamage(NaN)).toBe('—')
    expect(fmtDamage(Infinity)).toBe('—')
  })
})

describe('fmtSigned', () => {
  it('always shows the direction of the contribution', () => {
    expect(fmtSigned(42)).toBe('+42')
    expect(fmtSigned(12.5)).toBe('+12.5')
    // A true minus sign, not a hyphen.
    expect(fmtSigned(-4)).toBe('−4')
    expect(fmtSigned(0)).toBe('+0')
  })
})

describe('fmtFactor', () => {
  it('uses a multiplication sign so it cannot be read as a label', () => {
    expect(fmtFactor(2.5)).toBe('×2.5')
    expect(fmtFactor(1)).toBe('×1')
    expect(fmtFactor(1.35)).toBe('×1.35')
  })
})

describe('percent and count helpers', () => {
  it('formats fractions and already-scaled percentages alike', () => {
    expect(fmtPercent(0.95)).toBe('95.0%')
    expect(fmtPercentValue(23.75)).toBe('23.8%')
    expect(fmtCount(12.34)).toBe('12.3')
    expect(fmtCount(1234)).toBe('1,234')
  })
})

// ---------------------------------------------------------------------------
// Combat overview rows
// ---------------------------------------------------------------------------

/** An AttackEntryResult with a breakdown whose numbers are easy to follow. */
function entry(over: Partial<AttackEntryResult['breakdown']> = {}): AttackEntryResult {
  const breakdown: AttackEntryResult['breakdown'] = {
    weaponDie: 10, bonusW: 0, diceNum: 2, diceSides: 6,
    meleeDamage: 40, abilityMod: 15, damageAbilMult: 1, abilityDamage: 15,
    sneakDice: 0, sneakBonus: 0,
    meleePower: 100, meleePowerMult: 2,
    baseDamage: 65, critOnlyDamage: 0,
    stdMult: 3, mult19to20: 3, threatFaces: 4, faces19to20: 2, facesStandard: 2,
    critDmgStd: 390, critDmg19to20: 390,
    expectedRaw: 200, doublestrike: 0.35, strikethrough: 0, twoHanded: false,
    helplessDmg: 0.5, helplessFactor: 1,
    fortFraction: 0.5, effectiveCritChance: 0.12,
    foePRR: 50, prrMult: 100 / 150,
    attacksPerRound: 5,
    ...over,
  }
  return {
    mainDPR: 270, offhandDPR: 0, totalDPR: 180, dps: 150,
    hitChance: 0.95, critChance: 0.24,
    hitDamage: 130, critDamage: 390,
    breakdown,
  }
}

/** Replays the rows the way BreakdownTip does, to check they reach the total. */
function evaluate(rows: TipRow[]): number {
  let v = 0
  for (const r of rows) {
    if (r.kind === 'add') v += r.value
    else if (r.kind === 'mult') v *= r.factor
  }
  return v
}

describe('hitDamageRows', () => {
  it('adds dice and bonuses, then multiplies by Melee Power', () => {
    const rows = hitDamageRows(entry())
    // (10 weapon + 40 damage + 15 ability) x 2 = 130, the reported hitDamage.
    expect(evaluate(rows)).toBeCloseTo(130, 6)
  })

  it('reaches the same number the calculation reported', () => {
    const r = entry()
    expect(evaluate(hitDamageRows(r))).toBeCloseTo(r.hitDamage, 6)
  })

  it('names the weapon dice, including bonus [W]', () => {
    const plain = hitDamageRows(entry())
    expect(plain[0].label).toBe('Weapon dice 2d6')
    const bonus = hitDamageRows(entry({ bonusW: 1 }))
    expect(bonus[0].label).toBe('Weapon dice 2d6 +1[W]')
  })

  it('omits contributions that are zero', () => {
    const rows = hitDamageRows(entry({ sneakBonus: 0 }))
    expect(rows.some(r => r.label === 'Sneak attack dice')).toBe(false)
    const withSneak = hitDamageRows(entry({ sneakBonus: 24.5, sneakDice: 7 }))
    expect(withSneak.some(r => r.label === 'Sneak attack dice')).toBe(true)
  })
})

describe('critDamageRows', () => {
  it('multiplies the base by the crit multiplier before Melee Power', () => {
    // (10 + 40 + 15) x 3 x 2 = 390
    expect(evaluate(critDamageRows(entry()))).toBeCloseTo(390, 6)
  })

  it('explains the average when two crit multipliers are in play', () => {
    const rows = critDamageRows(entry({ mult19to20: 5, stdMult: 3, facesStandard: 2 }))
    const note = rows.find(r => r.kind === 'note')
    expect(note?.label).toMatch(/Averaged across 4 threat faces/)
  })

  it('says nothing about averaging when one multiplier covers every face', () => {
    const rows = critDamageRows(entry({ facesStandard: 0, faces19to20: 2, threatFaces: 2 }))
    expect(rows.some(r => r.kind === 'note')).toBe(false)
  })
})

describe('DPR and DPS rows', () => {
  it('builds main DPR from the per-swing expectation', () => {
    // 200 expected x 1.35 doublestrike = 270
    expect(evaluate(mainDprRows(entry()))).toBeCloseTo(270, 6)
  })

  it('applies strikethrough only for a two-handed weapon', () => {
    const oneHand = mainDprRows(entry({ strikethrough: 0.5 }))
    expect(oneHand.some(r => r.label === 'Strikethrough')).toBe(false)
    const twoHand = mainDprRows(entry({ strikethrough: 0.5, twoHanded: true }))
    expect(twoHand.some(r => r.label === 'Strikethrough')).toBe(true)
  })

  it('sums the hands then mitigates by PRR', () => {
    // (270 + 0) x 100/150 = 180
    expect(evaluate(totalDprRows(entry()))).toBeCloseTo(180, 6)
  })

  it('turns damage per round into damage per second', () => {
    // 180 x (5/6) = 150
    expect(evaluate(dpsRows(entry()))).toBeCloseTo(150, 6)
  })

  it('says so plainly when the off-hand is empty', () => {
    const rows = offhandDprRows(entry())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'note' })
  })

  it('breaks the off-hand down when one is equipped', () => {
    const rows = offhandDprRows(entry({
      offhand: { chance: 0.8, die: 4.5, raw: 100, hitChance: 0.9 },
    }))
    expect(rows.some(r => r.label === 'Off-hand swing chance')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Damage Calc source shares
// ---------------------------------------------------------------------------

function simParams(over: Partial<CoreParams> = {}): CoreParams {
  return {
    atk: 110, prof: 20, prec: 0, seeker: 0, threat: 17,
    critMult: 3, crit19: 0, confPrec: true,
    wMult: 1, wCount: 2, wSides: 6, wFlat: 0,
    deadly: 60, deadlyCrit: 60, coreTag: 'physical',
    sneakPct: 0, decHit: 0, decDmg: 0, sneakDice: 0, sneakTag: 'physical',
    imbBonus: 0, imbSides: 8, imbRate: 100, imbSrc: 'RP', imbSP: 0,
    imbMRR: true, imbTag: 'untyped',
    rp: 100, ds: 30, apm: 100,
    ac: 80, fort: 50, bypass: 0, prr: 0, mrr: 0,
    dur: 60, trials: 50, seed: 3,
    ...over,
  }
}

const magma = {
  name: 'Dripping with Magma', trigger: 'hit' as const, chance: 100, icd: 1,
  cap: 5, perTick: 0, dice: 10, sides: 20, tick: 4, dur: 5,
  decayAll: true, rpRate: 0, tag: 'fire',
}
const burst = {
  name: 'Incineration', trigger: 'hit' as const, chance: 100, icd: 0,
  dice: 8, sides: 20, flat: 200, rpRate: 0, dsScale: false, tag: 'fire',
}

describe('simulation source attribution', () => {
  it('attributes damage to the named effect that produced it', () => {
    const r = simulateDamage(simParams(), { ...emptyLists(), dots: [magma], procs: [burst] })
    expect(r.bySource['Dripping with Magma']).toBeGreaterThan(0)
    expect(r.bySource['Incineration']).toBeGreaterThan(0)
    expect(r.sourceKind['Dripping with Magma']).toBe('dot')
    expect(r.sourceKind['Incineration']).toBe('proc')
  })

  it('has the per-source totals add up to their category buckets', () => {
    const r = simulateDamage(simParams(), { ...emptyLists(), dots: [magma], procs: [burst] })
    expect(r.bySource['Dripping with Magma']).toBeCloseTo(r.buckets.dot, 6)
    expect(r.bySource['Incineration']).toBeCloseTo(r.buckets.proc, 6)
  })

  it('records a zero for an effect that never fired', () => {
    const never = { ...burst, name: 'Never fires', chance: 0 }
    const r = simulateDamage(simParams(), { ...emptyLists(), procs: [never] })
    expect(r.bySource['Never fires']).toBe(0)
  })
})

describe('sourceShareRows', () => {
  it('lists weapon damage alongside each named effect, largest first', () => {
    const r = simulateDamage(simParams(), { ...emptyLists(), dots: [magma], procs: [burst] })
    const rows = sourceShareRows(r)
    const labels = rows.map(x => x.label)
    expect(labels).toContain('Weapon damage')
    expect(labels).toContain('Dripping with Magma')
    expect(labels).toContain('Incineration')

    // Every contribution is ranked by size, built-in buckets included.
    const values = rows
      .filter(x => x.kind === 'share')
      .map(x => (x as { value: number }).value)
    expect(values).toEqual([...values].sort((a, b) => b - a))
  })

  it('omits sources that contributed nothing', () => {
    const never = { ...burst, name: 'Never fires', chance: 0 }
    const rows = sourceShareRows(
      simulateDamage(simParams(), { ...emptyLists(), procs: [never] }),
    )
    expect(rows.some(x => x.label === 'Never fires')).toBe(false)
  })

  it('says so when there is no damage at all', () => {
    const rows = sourceShareRows(simulateDamage(simParams({ dur: 0 }), emptyLists()))
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('note')
  })
})

describe('bucketSourceRows', () => {
  it('shows only the effects belonging to the requested category', () => {
    const r = simulateDamage(simParams(), { ...emptyLists(), dots: [magma], procs: [burst] })
    expect(bucketSourceRows(r, 'dot').map(x => x.label)).toEqual(['Dripping with Magma'])
    expect(bucketSourceRows(r, 'proc').map(x => x.label)).toEqual(['Incineration'])
  })

  it('explains an empty category instead of showing a blank list', () => {
    const r = simulateDamage(simParams(), emptyLists())
    const rows = bucketSourceRows(r, 'proc')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'note' })
    expect(rows[0].label).toMatch(/No on-hit procs/)
  })
})
