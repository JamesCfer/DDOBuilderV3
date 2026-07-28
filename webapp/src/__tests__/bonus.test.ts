import { describe, expect, it, afterEach } from 'vitest'
import { resolveBonus, emptyResolvedStat, buildExclusiveSet, initBonusTypes, resetBonusTypes, type RawBonus } from '../lib/bonus'

// fromGear: true → item-sourced; subject to "Highest Only" for exclusive types
// fromGear: false / omitted → feat/enhancement-sourced; always stacks (V2 m_effects)
const mk = (value: number, type: string, source = 'src', fromGear = true): RawBonus =>
  ({ value, type, source, fromGear })

describe('resolveBonus', () => {
  it('returns empty stat for empty input', () => {
    expect(resolveBonus([])).toEqual(emptyResolvedStat())
  })

  it('gear exclusive types pick only the highest positive', () => {
    const r = resolveBonus([
      mk(2, 'Enhancement', 'A'),
      mk(5, 'Enhancement', 'B'),
      mk(3, 'Enhancement', 'C'),
    ])
    expect(r.total).toBe(5)
    expect(r.bonuses.find(b => b.source === 'B')?.active).toBe(true)
    expect(r.bonuses.find(b => b.source === 'A')?.active).toBe(false)
    expect(r.bonuses.find(b => b.source === 'C')?.active).toBe(false)
  })

  it('gear exclusive types keep ONE winner by absolute value (V2 RemoveNonStacking)', () => {
    // V2 BreakdownItem::RemoveNonStacking compares fabs(TotalAmount): every
    // same-bonus-type gear effect except the largest-magnitude one is
    // removed — a −3 penalty is a "lesser version" of a +5 bonus and is
    // dropped, NOT applied alongside it (oracle-verified: Thaarak Fang's
    // −2 Resistance WillSave vs Drow Sage's Cowl +7 → +7, fuzz-5050).
    const r = resolveBonus([
      mk(5, 'Enhancement', 'good'),
      mk(-1, 'Enhancement', 'small-bad'),
      mk(-3, 'Enhancement', 'big-bad'),
    ])
    expect(r.total).toBe(5)
    expect(r.bonuses.find(b => b.source === 'good')?.active).toBe(true)
    expect(r.bonuses.find(b => b.source === 'small-bad')?.active).toBe(false)
    expect(r.bonuses.find(b => b.source === 'big-bad')?.active).toBe(false)
  })

  it('stacking types accumulate every contribution', () => {
    const r = resolveBonus([
      mk(2, 'Stacking', 'a'),
      mk(3, 'Stacking', 'b'),
      mk(4, 'Stacking', 'c'),
    ])
    expect(r.total).toBe(9)
    expect(r.bonuses.every(b => b.active)).toBe(true)
  })

  it('mixed gear exclusive + stacking sums correctly', () => {
    const r = resolveBonus([
      mk(3, 'Enhancement', 'enh-low'),
      mk(7, 'Enhancement', 'enh-high'),
      mk(2, 'Stacking', 'a'),
      mk(2, 'Stacking', 'b'),
    ])
    // 7 (best Enhancement) + 2 + 2 = 11
    expect(r.total).toBe(11)
  })

  it('Penalty type stacks (V2 rule: stacks_always)', () => {
    const r = resolveBonus([
      mk(-1, 'Penalty', 'a'),
      mk(-1, 'Penalty', 'b'),
    ])
    // 'Penalty' is NOT in the EXCLUSIVE set, so it stacks.
    expect(r.total).toBe(-2)
  })

  // V2 parity: feat/enhancement effects (m_effects) bypass RemoveNonStacking —
  // they always stack even when the bonus type is an exclusive (Highest Only) type.
  it('non-gear (feat) contributions always stack even for exclusive types', () => {
    const r = resolveBonus([
      { value: 1, type: 'Feat', source: 'feat-a', fromGear: false },
      { value: 1, type: 'Feat', source: 'feat-b', fromGear: false },
      { value: 1, type: 'Feat', source: 'feat-c', fromGear: false },
    ])
    // All three are non-gear → all stack regardless of 'Feat' being exclusive
    expect(r.total).toBe(3)
    expect(r.bonuses.every(b => b.active)).toBe(true)
  })

  it('gear exclusive + non-gear sum independently', () => {
    // Gear: Enhancement +4 from item A beats +2 from item B (Highest Only within gear)
    // Non-gear: feat gives Enhancement +2, always stacks on top
    const r = resolveBonus([
      { value: 4, type: 'Enhancement', source: 'item-A', fromGear: true },
      { value: 2, type: 'Enhancement', source: 'item-B', fromGear: true },
      { value: 2, type: 'Enhancement', source: 'feat', fromGear: false },
    ])
    // V2 parity: best gear (4) + feat (2) = 6
    expect(r.total).toBe(6)
    expect(r.bonuses.find(b => b.source === 'item-A')?.active).toBe(true)
    expect(r.bonuses.find(b => b.source === 'item-B')?.active).toBe(false)
    expect(r.bonuses.find(b => b.source === 'feat')?.active).toBe(true)
  })
})

describe('buildExclusiveSet', () => {
  it('marks Highest Only entries as exclusive', () => {
    const set = buildExclusiveSet([
      { Name: 'Enhancement', Stacking: 'Highest Only' },
      { Name: 'Stacking', Stacking: 'Always' },
      { Name: 'Untyped', Stacking: 'Always' },
    ])
    expect(set.has('Enhancement')).toBe(true)
    expect(set.has('Stacking')).toBe(false)
    expect(set.has('Untyped')).toBe(false)
  })

  it('trims trailing spaces from names (XML artifact)', () => {
    const set = buildExclusiveSet([
      { Name: 'Competence ', Stacking: 'Highest Only' },
    ])
    expect(set.has('Competence')).toBe(true)
    expect(set.has('Competence ')).toBe(false)
  })

  it('defaults to Highest Only when Stacking field is absent', () => {
    const set = buildExclusiveSet([{ Name: 'Mystery' }])
    expect(set.has('Mystery')).toBe(true)
  })
})

describe('initBonusTypes', () => {
  // Restore the hard-coded fallback after each test so sibling describe blocks
  // are unaffected by runtime mutation of the module-level exclusive set.
  afterEach(() => { resetBonusTypes() })

  it('switches a previously stacking type to exclusive', () => {
    // Pretend a new XML marks 'CustomBonus' as Highest Only.
    initBonusTypes([
      { Name: 'CustomBonus', Stacking: 'Highest Only' },
    ])
    // fromGear: true → gear context → exclusive filter applies
    const r = resolveBonus([
      mk(3, 'CustomBonus', 'a', true),
      mk(7, 'CustomBonus', 'b', true),
    ])
    expect(r.total).toBe(7)
    expect(r.bonuses.find(b => b.source === 'a')?.active).toBe(false)
  })

  it('switches a previously exclusive type to stacking', () => {
    // Enhancement is exclusive by default; override to Always.
    initBonusTypes([
      { Name: 'Enhancement', Stacking: 'Always' },
    ])
    const r = resolveBonus([
      mk(3, 'Enhancement', 'a'),
      mk(7, 'Enhancement', 'b'),
    ])
    expect(r.total).toBe(10)
    expect(r.bonuses.every(b => b.active)).toBe(true)
  })
})
