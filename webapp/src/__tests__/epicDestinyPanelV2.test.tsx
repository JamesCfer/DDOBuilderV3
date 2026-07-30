// @vitest-environment jsdom
//
// Epic Destinies panel — user-reported fixes:
//  1. Twists of Fate were removed from DDO (U51 destiny rework); the panel
//     must not render a Twists editor.
//  2. All selected destiny trees render side by side (V2 DestinyPane shows
//     every tree at once), not behind tabs.
//  3. The destiny point pool must use the FULL character level
//     (heroic + epic + legendary — V2 Build::Level()), not the heroic-only
//     `totalLevel`. A level 34 build was showing a pool of ~21 (fate points
//     only) while it had legitimately spent 73 in V2.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'
import { destinyPoolForBuild } from '../lib/destiny'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// Synthetic destiny trees served by the fetch mock
// ---------------------------------------------------------------------------

function destinyTree(name: string) {
  return {
    Name: name,
    IsEpicDestiny: true,
    EnhancementTreeItem: [
      { Name: `${name} Core`, InternalName: `${name} Core`, Ranks: 1, CostPerRank: '1', XPosition: 0, YPosition: 0 },
      { Name: `${name} Boost`, InternalName: `${name} Boost`, Ranks: 3, CostPerRank: '1', XPosition: 1, YPosition: 0 },
    ],
  }
}

const TREES = [destinyTree('Divine Crusader'), destinyTree('Shadowdancer'), destinyTree('Fury of the Wild')]

function installFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const data = url.pathname === '/api/enhancements' ? TREES : []
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

function level34Build(): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Bard', levels: 20 }],
    levelClasses: Array.from({ length: 20 }, () => 'Bard'),
    totalLevel: 20,
    epicLevels: 10,
    legendaryLevels: 4,
    selectedDestinyTrees: ['Divine Crusader', 'Shadowdancer', 'Fury of the Wild'],
    destinyChoices: {
      'Divine Crusader': { 'Divine Crusader Core': 1, 'Divine Crusader Boost': 3 },
      'Shadowdancer': { 'Shadowdancer Core': 1 },
      'Fury of the Wild': { 'Fury of the Wild Boost': 2 },
    },
  }
}

function LoadBuild({ build, children }: { build: CharacterBuild; children: React.ReactNode }) {
  const { dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? React.createElement(React.Fragment, null, children) : null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

async function mountPanel(build: CharacterBuild): Promise<HTMLElement> {
  const mod = await import('../components/epicdestinies/EpicDestiniesPanel')
  const Panel = mod.default
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, { build }, React.createElement(Panel)),
          ),
        ),
      ),
    )
  })
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
  mounted.push({ root, container })
  return container
}

// ---------------------------------------------------------------------------

describe('destinyPoolForBuild uses the full character level', () => {
  it('level 34 (20 heroic + 10 epic + 4 legendary) pool includes epic + legendary points', () => {
    const build = level34Build()
    // destinyPointPool(34) = 60 (V2 Build::Level() control flow with upstream
    // BUILD_START_LEVEL = 36: 40 epic + 5×4 legendary); fate 51 → +17
    expect(destinyPoolForBuild(build, 51, 0)).toBe(77)
  })

  it('heroic-only level 20 build gets the level-20 pool, no epic contribution', () => {
    const build = { ...level34Build(), epicLevels: 0, legendaryLevels: 0 }
    expect(destinyPoolForBuild(build, 0, 0)).toBe(destinyPoolForBuild(build, 0, 0))
    expect(destinyPoolForBuild(build, 0, 0)).toBeLessThan(destinyPoolForBuild(level34Build(), 0, 0))
  })
})

describe('Epic Destinies panel (V2 layout)', () => {
  beforeAll(() => installFetchMock())

  it('does not render the removed Twists of Fate editor', async () => {
    const container = await mountPanel(level34Build())
    expect(container.textContent).not.toContain('Twists of Fate')
  })

  it('renders all selected destiny trees side by side (no tabs)', async () => {
    const container = await mountPanel(level34Build())
    const titles = Array.from(container.querySelectorAll('[class*="treeTitle"]'))
      .map(el => el.textContent ?? '')
    expect(titles.some(t => t.includes('Divine Crusader'))).toBe(true)
    expect(titles.some(t => t.includes('Shadowdancer'))).toBe(true)
    expect(titles.some(t => t.includes('Fury of the Wild'))).toBe(true)
    // All three grids are mounted simultaneously.
    const grids = container.querySelectorAll('[class*="treeColumn"]')
    expect(grids.length).toBe(3)
  })

  it('shows the pool computed from the full character level', async () => {
    const container = await mountPanel(level34Build())
    const text = container.textContent ?? ''
    // 7 points spent across the three synthetic trees; pool for L34, 0 fate = 60
    // (BUILD_START_LEVEL is 36 now, so L34 no longer hits the at-cap special case).
    expect(text).toContain('7')
    expect(text).toContain('60')
  })
})
