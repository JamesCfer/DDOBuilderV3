import { describe, it, expect } from 'vitest'
import { destinyPointPool } from '../lib/v2Formulas'

// Mirrors V2 BreakdownItemDestinyAps.cpp:48-92.
// Destiny points are a single shared pool (4 per epic level + 4 per legendary
// level, capped at 10 each, plus floor(fatePoints/3)) — NOT a per-tree "24".
describe('destinyPointPool (V2 BreakdownItemDestinyAps parity)', () => {
  it('is 0 below epic levels', () => {
    expect(destinyPointPool(1)).toBe(0)
    expect(destinyPointPool(19)).toBe(0)
  })

  it('grants 4 per epic level from level 20, capping at 40', () => {
    expect(destinyPointPool(20)).toBe(4)    // (20-20)+1 = 1 epic level
    expect(destinyPointPool(21)).toBe(8)
    expect(destinyPointPool(25)).toBe(24)   // would-be 24 cap is just a coincidence at L25
    expect(destinyPointPool(29)).toBe(40)   // 10 epic levels → capped
    expect(destinyPointPool(30)).toBe(44)   // epic capped 40 + first legendary 4
  })

  it('adds 4 per legendary level from level 30, total capping at 80', () => {
    expect(destinyPointPool(31)).toBe(48)   // 40 + 8
    expect(destinyPointPool(39)).toBe(80)   // 40 + 40
    expect(destinyPointPool(40)).toBe(80)   // both capped
  })

  it('honours the BUILD_START_LEVEL (36) special case', () => {
    // L34 is no longer the cap: 40 epic + min(34-30+1,10)=5 legendary*4 = 60.
    expect(destinyPointPool(34)).toBe(60)
    // At the cap the special case drops the in-progress level: normally L36 →
    // 40 + min(36-30+1,10)=7*4 = 68; forced to 36-20-10 = 6 → 40 + 24 = 64.
    expect(destinyPointPool(36)).toBe(64)
  })

  it('adds floor(fatePoints / 3) as an inherent bonus', () => {
    expect(destinyPointPool(20, 3)).toBe(5)   // 4 + floor(3/3)=1
    expect(destinyPointPool(20, 8)).toBe(6)   // 4 + floor(8/3)=2
    expect(destinyPointPool(40, 30)).toBe(90) // 80 + 10
  })
})
