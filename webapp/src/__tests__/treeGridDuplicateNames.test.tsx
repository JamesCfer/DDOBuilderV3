// @vitest-environment jsdom
//
// Tester report (Character page, build #343): "Feydark Illusionist: Ability 1
// is broken". The tree has two items named "Feydark Illusionist: Ability I"
// (core FeydarkCore2 and tier-3 FeydarkAbilityI), and likewise "Ability II".
// TreeGrid tracked the open selector and the picked option by display name,
// so choosing a stat on the tier-3 Ability I trained the core instead. V2
// keys tree items by InternalName.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import TreeGrid from '../components/enhancements/TreeGrid'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { EnhancementSelection, EnhancementTree } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const stats: EnhancementSelection[] = ['Intelligence', 'Wisdom', 'Charisma']
  .map(n => ({ Name: n, Icon: n, CostPerRank: '2' } as unknown as EnhancementSelection))

const tree = {
  Name: 'Feydark Illusionist',
  EnhancementTreeItem: [
    { Name: 'Feydark Illusionist: Find Familiar', InternalName: 'FeydarkCore1', XPosition: 0, YPosition: 0, CostPerRank: '1', Ranks: 1 },
    { Name: 'Feydark Illusionist: Ability I', InternalName: 'FeydarkCore2', XPosition: 1, YPosition: 0, CostPerRank: '2', Ranks: 1, MinSpent: 5,
      Selector: [{ EnhancementSelection: stats }] },
    { Name: 'Feydark Illusionist: Explorer', InternalName: 'FeydarkExplorer', XPosition: 0, YPosition: 1, CostPerRank: '1', Ranks: 3 },
    { Name: 'Feydark Illusionist: Ability I', InternalName: 'FeydarkAbilityI', XPosition: 4, YPosition: 3, CostPerRank: '2', Ranks: 1,
      Selector: [{ EnhancementSelection: stats }] },
  ],
} as unknown as EnhancementTree

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

describe('tree items sharing a display name', () => {
  it('trains the tier-3 Ability I, not the core with the same name', () => {
    const choices = { FeydarkCore1: 1, FeydarkExplorer: 3 }
    const log: Array<[string, Record<string, unknown>]> = []
    host = document.createElement('div'); document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(
      <SettingsProvider>
        <TreeGrid
          tree={tree}
          choices={choices}
          selections={{}}
          totalSpentAllTrees={4}
          totalAP={80}
          onChoicesChange={c => log.push(['c', c])}
          onSelectionsChange={s => log.push(['s', s])}
          build={{ ...emptyBuild(), enhancementChoices: { 'Feydark Illusionist': choices } }}
          allClasses={[]}
        />
      </SettingsProvider>,
    ))
    const cells = [...host.querySelectorAll('[data-tip^="Feydark Illusionist: Ability I"]')] as HTMLElement[]
    expect(cells).toHaveLength(2)
    // The core needs 5 AP in the tree (only 4 spent), so it is locked; the
    // tier-3 cell is the one that opens a picker.
    const tier = cells.find(c => !c.className.includes('locked'))!
    act(() => tier.click())
    const wis = [...document.body.querySelectorAll('button')].find(b => b.textContent === 'Wisdom')!
    act(() => wis.click())
    expect(log).toEqual([
      ['s', { FeydarkAbilityI: 'Wisdom' }],
      ['c', { FeydarkCore1: 1, FeydarkExplorer: 3, FeydarkAbilityI: 1 }],
    ])
  })
})
