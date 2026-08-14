// @vitest-environment jsdom
//
// The item-type <select> shared by the gear slot picker and Find Gear dialog:
// options are grouped (Category / Weapon class / Weapon type / Shield type /
// Armor type) and carry per-option counts.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import ItemTypeSelect from '../components/items/ItemTypeSelect'
import { itemTypeOptions } from '../lib/itemFilters'
import type { Item } from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const GROUPS: WeaponGroupSpec[] = [
  { Name: 'Martial', Weapon: ['Longsword', 'Great Sword'] },
  { Name: 'Two Handed', Weapon: ['Great Sword'] },
]

const ITEMS = [
  { Name: 'Sword A', Weapon: 'Longsword' },
  { Name: 'Sword B', Weapon: 'Longsword' },
  { Name: 'Greatsword', Weapon: 'Great Sword' },
  { Name: 'Shield', Weapon: 'Small Shield', ShieldBonus: 6 },
  { Name: 'Scale', Armor: 'Medium' },
  { Name: 'Relic', Weapon: 'Longsword', MinorArtifact: '' },
] as Item[]

const mounted: Array<{ root: Root; container: HTMLElement }> = []

afterEach(() => {
  act(() => {
    for (const m of mounted) m.root.unmount()
  })
  mounted.length = 0
})

function render(value: string, onChange: (v: string) => void): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      React.createElement(ItemTypeSelect, {
        value,
        onChange,
        optionGroups: itemTypeOptions(ITEMS, GROUPS),
      }),
    )
  })
  mounted.push({ root, container })
  return container
}

describe('ItemTypeSelect', () => {
  it('groups options and shows how many items each one matches', () => {
    const container = render('', () => {})
    const optgroups = Array.from(container.querySelectorAll('optgroup')).map(g => g.label)
    expect(optgroups).toEqual([
      'Category', 'Weapon class', 'Weapon type', 'Shield type', 'Armor type',
    ])

    const options = Array.from(container.querySelectorAll('option')).map(o => o.textContent)
    expect(options[0]).toBe('Any type')
    expect(options).toContain('Longsword (3)')
    expect(options).toContain('Great Sword (1)')
    expect(options).toContain('Small Shield (1)')
    expect(options).toContain('Medium Armor (1)')
    expect(options).toContain('Minor Artifacts (1)')
  })

  it('reports the selected filter token', () => {
    let picked = ''
    const container = render('', v => { picked = v })
    const select = container.querySelector('select') as HTMLSelectElement
    act(() => {
      select.value = 'wt:Great Sword'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(picked).toBe('wt:Great Sword')
  })
})
