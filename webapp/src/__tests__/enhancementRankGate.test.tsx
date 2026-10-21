// @vitest-environment jsdom
//
// Tester report: Air Savant Pierce Electric Resistance could go to rank 3 with
// only 1 rank of One with the Storm. V2 (Requirement::MetEnhancements) makes
// each rank of a dependant need the same rank of a multi-rank prerequisite,
// and (SpendInTree::HasTrainedDependants) stops the prerequisite dropping
// below the dependant.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import TreeGrid, { type TreeChoices } from '../components/enhancements/TreeGrid'
import { TipLayer } from '../components/common/HoverTip'
import { SettingsProvider } from '../context/SettingsContext'
import { loadEnhancementTrees } from '../server/dataLoaders'
import { enhancementRanksAllowNext } from '../lib/enhancementRankGate'
import type { EnhancementTree } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

describe('rank-for-rank prerequisites (Air Savant data)', () => {
  it.skipIf(!existsSync(DATA))('Pierce Electric Resistance needs matching One with the Storm ranks', () => {
    const tree = loadEnhancementTrees(DATA).find(t => t.Name === 'Air Savant')!
    const items = tree.EnhancementTreeItem!
    const pierce = items.find(i => i.InternalName === 'ASPierceElectricResistance')!
    const maxRanksOf = (n: string) => items.find(i => i.InternalName === n)?.Ranks
    const allow = (storm: number, pierceRanks: number) => enhancementRanksAllowNext(
      pierce.Requirements, pierceRanks, n => (n === 'ASOneWithTheStorm' ? storm : 0), maxRanksOf)

    expect(allow(0, 0)).toBe(false)
    expect(allow(1, 0)).toBe(true)
    expect(allow(1, 1)).toBe(false)
    expect(allow(2, 1)).toBe(true)
    expect(allow(2, 2)).toBe(false)
    expect(allow(3, 2)).toBe(true)
  })

  it('an explicit Value or a single-rank prerequisite only needs to be trained', () => {
    const maxRanksOf = (n: string) => (n === 'Multi' ? 3 : 1)
    const ranksOf = () => 1
    expect(enhancementRanksAllowNext(
      { Requirement: { Type: 'Enhancement', Item: 'Multi', Value: 1 } }, 2, ranksOf, maxRanksOf)).toBe(true)
    expect(enhancementRanksAllowNext(
      { Requirement: { Type: 'Enhancement', Item: 'Single' } }, 2, ranksOf, maxRanksOf)).toBe(true)
  })
})

const tree = {
  Name: 'Air Savant',
  EnhancementTreeItem: [
    { Name: 'Air Savant: One with the Storm', InternalName: 'ASOneWithTheStorm', XPosition: 2, YPosition: 1, CostPerRank: '1', Ranks: 3 },
    { Name: 'Air Savant: Pierce Electric Resistance', InternalName: 'ASPierceElectricResistance', XPosition: 2, YPosition: 2, CostPerRank: '1', Ranks: 3,
      Requirements: { Requirement: { Type: 'Enhancement', Item: 'ASOneWithTheStorm' } } },
  ],
} as unknown as EnhancementTree

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

function renderGrid(choices: TreeChoices, onChange: (c: TreeChoices) => void) {
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(
    <SettingsProvider>
      <TreeGrid tree={tree} choices={choices} selections={{}} totalSpentAllTrees={2} totalAP={80}
        onChoicesChange={onChange} onSelectionsChange={() => {}} />
      <TipLayer />
    </SettingsProvider>,
  ))
  return host
}

const cell = (el: HTMLElement, name: string) => el.querySelector(`[data-tip^="${name}"]`) as HTMLElement

describe('TreeGrid rank-for-rank gating', () => {
  it('blocks Pierce rank 2 with only 1 rank of One with the Storm', () => {
    let changed: TreeChoices | null = null
    const el = renderGrid({ ASOneWithTheStorm: 1, ASPierceElectricResistance: 1 }, c => { changed = c })
    act(() => cell(el, 'Air Savant: Pierce Electric Resistance').click())
    expect(changed).toBeNull()
  })

  it('allows Pierce rank 2 once One with the Storm has 2 ranks', () => {
    let changed: TreeChoices | null = null
    const el = renderGrid({ ASOneWithTheStorm: 2, ASPierceElectricResistance: 1 }, c => { changed = c })
    act(() => cell(el, 'Air Savant: Pierce Electric Resistance').click())
    expect(changed).toEqual({ ASOneWithTheStorm: 2, ASPierceElectricResistance: 2 })
  })

  it('stops One with the Storm dropping below Pierce', () => {
    let changed: TreeChoices | null = null
    const el = renderGrid({ ASOneWithTheStorm: 1, ASPierceElectricResistance: 1 }, c => { changed = c })
    act(() => { cell(el, 'Air Savant: One with the Storm').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })) })
    expect(changed).toBeNull()
  })
})
