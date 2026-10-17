// "All" is not a V2 tactical type (TacticalTypes.h), so Effect::HasTacticalType
// never matches a TacticalDC effect whose Item is "All" (or that has no Item)
// and DC::CalculateDC adds only the DC's own tactical breakdowns. V3 added
// tacticalDC.All to every tactical DC on top.

import { describe, it, expect } from 'vitest'
import { calculateDCValue, dcEvaluationText } from '../lib/dcBreakdown'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../lib/buildStats'

const vals: Record<string, number> = { 'tacticalDC.All': 1, 'tacticalDC.Trip': 2 }
const stats = { total: (k: string) => vals[k] ?? 0 } as unknown as BuildStats
const ctx = { build: { ...emptyBuild(), featChoices: {} }, stats, allClasses: [] }
const dc = { Name: 'Trip', DCVersus: 'Balance', Amount: 10, Tactical: 'Trip', Tactical2: 'Trap' }

describe('tacticalDC.All does not reach DCs (V2 DC::CalculateDC)', () => {
  it('value counts only the named tacticals', () => {
    expect(calculateDCValue(dc, 1, ctx)).toBe(12)
  })
  it('evaluation text shows only the named tacticals', () => {
    expect(dcEvaluationText(dc, 1, ctx)).toBe('10 + Trip(2) + Trap(0)')
  })
})
