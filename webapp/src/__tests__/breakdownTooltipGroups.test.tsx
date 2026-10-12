// @vitest-environment jsdom
//
// Analysis breakdown tooltip: renders outside the workspace window (so the
// window's containment cannot hide it), groups bonuses by type with a colour
// swatch, and says which gear bonus overrode a suppressed one.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Tooltip, groupBonusesByType } from '../components/breakdowns/statRows'
import { resolveBonus, resetBonusTypes } from '../lib/bonus'
import { bonusTypeColor, bonusTypeSlot } from '../lib/bonusTypeColors'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

resetBonusTypes()
const resolved = resolveBonus([
  { value: 10, type: 'Enhancement', source: 'Belt of Might', fromGear: true },
  { value: 7, type: 'Enhancement', source: 'Old Gloves', fromGear: true },
  { value: 3, type: 'Insightful', source: 'Ring of Insight', fromGear: true },
  { value: 2, type: 'Stacking', source: 'Past Life', fromGear: false },
  { value: 1, type: 'Stacking', source: 'Tome', fromGear: false },
])

let mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

async function render() {
  // A stand-in for a workspace window: the tooltip must not render inside it.
  const container = document.createElement('div')
  container.style.contain = 'layout'
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(React.createElement(Tooltip, {
      tip: { label: 'Strength', display: '26', bonuses: resolved.bonuses, x: 100, y: 100 },
      onHide: () => {},
    }))
  })
  mounted.push({ root, container })
  return { container, tip: document.body.querySelector('[role="tooltip"]') as HTMLElement }
}

describe('breakdown tooltip', () => {
  it('portals out of the window it was hovered in', async () => {
    const { container, tip } = await render()
    expect(tip).not.toBeNull()
    expect(container.contains(tip)).toBe(false)
  })

  it('groups bonuses by type, biggest contribution first', () => {
    const groups = groupBonusesByType(resolved.bonuses)
    expect(groups.map(g => [g.type, g.subtotal])).toEqual([
      ['Enhancement', 10], ['Insightful', 3], ['Stacking', 3],
    ])
    expect(groups[0].highestOnly).toBe(true)
    expect(groups[2].highestOnly).toBe(false)
  })

  it('names the bonus that overrode a suppressed one', async () => {
    const { tip } = await render()
    expect(tip.textContent).toContain('overridden by Belt of Might')
    expect(tip.textContent).toContain('5 sources, 1 overridden')
    expect(tip.textContent).toContain('highest only')
  })

  it('gives the highlighted types fixed slots and folds the rest', () => {
    expect(bonusTypeSlot('Insightful')).toBe(1)
    expect(bonusTypeColor('Enhancement')).toBe('var(--bonus-4)')
    expect(bonusTypeColor('Stacking')).toBe('var(--bonus-other)')
  })
})
