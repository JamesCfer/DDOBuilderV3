// @vitest-environment jsdom
//
// Tester reports:
//  - Kensei Weapon Group Specialization offered every weapon group, not just
//    the one picked in Kensei Focus. V2's selection dialog only enables the
//    options whose own requirements are met (CSelectionSelectDialog), so the
//    tree follows your chosen group.
//  - Enhancements with no image lost their hover tooltip: the placeholder
//    carried its own title (the icon key), which won over the cell's.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import TreeGrid from '../components/enhancements/TreeGrid'
import DdoIcon from '../components/DdoIcon'
import { TipLayer } from '../components/common/HoverTip'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { EnhancementSelection, EnhancementTree } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const focus = (group: string, gated: boolean): EnhancementSelection => ({
  Name: `Kensei Focus: ${group}`,
  Icon: `KenseiFocus${group}`,
  ...(gated ? {
    Requirements: { Requirement: { Type: 'Enhancement', Item: ['KenseiCore1', `Kensei Focus: ${group}`] } },
  } : {}),
} as EnhancementSelection)

const tree = {
  Name: 'Kensei',
  EnhancementTreeItem: [
    { Name: 'Kensei: Kensei Focus', InternalName: 'KenseiCore1', XPosition: 0, YPosition: 0, CostPerRank: '1', Ranks: 1,
      Selector: [{ EnhancementSelection: [focus('Axes', false), focus('Archery', false)] }] },
    { Name: 'Kensei: Weapon Group Specialization I', InternalName: 'KenseiWGS1', XPosition: 1, YPosition: 1, CostPerRank: '1', Ranks: 1,
      Selector: [{ EnhancementSelection: [focus('Axes', true), focus('Archery', true)] }] },
  ],
} as unknown as EnhancementTree

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

function render(el: React.ReactElement) {
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<SettingsProvider>{el}<TipLayer /></SettingsProvider>))
  return host
}

describe('enhancement selector gating', () => {
  it('only enables the Weapon Group Specialization matching the Kensei Focus', () => {
    const build = {
      ...emptyBuild(),
      enhancementChoices: { Kensei: { KenseiCore1: 1 } },
      enhancementSelections: { Kensei: { KenseiCore1: 'Kensei Focus: Axes' } },
    }
    const el = render(
      <TreeGrid
        tree={tree}
        choices={{ KenseiCore1: 1 }}
        selections={{ KenseiCore1: 'Kensei Focus: Axes' }}
        totalSpentAllTrees={1}
        totalAP={80}
        onChoicesChange={() => {}}
        onSelectionsChange={() => {}}
        build={build}
        allClasses={[]}
      />,
    )
    const cell = el.querySelector('[data-tip^="Kensei: Weapon Group Specialization I"]') as HTMLElement
    act(() => cell.click())
    const buttons = [...el.querySelectorAll('button')].filter(b => b.textContent?.startsWith('Kensei Focus'))
    const state = Object.fromEntries(buttons.map(b => [b.textContent, b.getAttribute('aria-disabled') === 'true']))
    expect(state).toEqual({ 'Kensei Focus: Axes': false, 'Kensei Focus: Archery': true })
  })
})

describe('tree cell tooltip', () => {
  it('shows the item tooltip as soon as the pointer enters', () => {
    const el = render(
      <TreeGrid
        tree={tree}
        choices={{}}
        selections={{}}
        totalSpentAllTrees={0}
        onChoicesChange={() => {}}
        onSelectionsChange={() => {}}
      />,
    )
    const cell = el.querySelector('[data-tip^="Kensei: Kensei Focus"]') as HTMLElement
    act(() => { cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 10, clientY: 10 })) })
    const box = document.body.querySelector('[role="tooltip"]')
    expect(box?.textContent).toContain('Kensei: Kensei Focus')
    expect(box?.textContent).toContain('1 AP')
    act(() => { cell.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
  })
})

describe('DdoIcon placeholder', () => {
  it('leaves the hover tooltip to its container', () => {
    const el = render(<div title="Duergar: Shape I"><DdoIcon category="EnhancementImages" name="DuergarShapeI" /></div>)
    const img = el.querySelector('img')!
    act(() => { img.dispatchEvent(new Event('error')) })
    const placeholder = el.querySelector('span[aria-label="DuergarShapeI"]')!
    expect(placeholder).not.toBeNull()
    expect(placeholder.hasAttribute('title')).toBe(false)
  })
})
