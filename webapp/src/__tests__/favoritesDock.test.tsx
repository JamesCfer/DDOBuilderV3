// @vitest-environment jsdom
//
// FavoritesDock — the app-wide right-hand rail that mirrors the Breakdowns
// panel's starred rows on every page:
// 1. renders nothing with no favorites, appears when a row is starred
// 2. stays in sync with stars toggled in the Breakdowns panel (shared store)
// 3. collapses to a slim reopen tab and remembers the choice
// 4. unpinning from the dock clears the shared list

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'
import { getFavorites, toggleFavorite } from '../lib/favoritesStore'
import FavoritesDock from '../components/breakdowns/FavoritesDock'
import BreakdownsPanel from '../components/breakdowns/BreakdownsPanel'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const FIGHTER = { Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1', Will: 'Type1', BAB: '1' }

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const data = url.pathname === '/api/classes' ? [FIGHTER] : []
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

let mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

async function mount(component: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, null, component),
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

function fighter20(): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Fighter', levels: 20 }],
    levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
    totalLevel: 20,
  }
}

import { useCharacter } from '../context/CharacterContext'
function LoadBuild({ children }: { children: React.ReactNode }) {
  const { dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build: fighter20() })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? React.createElement(React.Fragment, null, children) : null
}

/** Empty the shared store (module cache + localStorage) between tests. */
async function clearFavorites() {
  for (const key of [...getFavorites()]) {
    await act(async () => toggleFavorite(key))
  }
  localStorage.removeItem('ddo-favorites-dock-open')
}

// ---------------------------------------------------------------------------

describe('FavoritesDock', () => {
  beforeEach(clearFavorites)

  it('renders nothing without favorites, shows starred rows when one is added', async () => {
    const container = await mount(React.createElement(FavoritesDock))
    expect(container.querySelector('aside')).toBeNull()

    await act(async () => toggleFavorite('Defense/Hit Points'))
    const dock = container.querySelector('aside')
    expect(dock).toBeTruthy()
    expect(dock!.textContent).toContain('★ Favorites')
    expect(dock!.textContent).toContain('Hit Points · Defense')
  })

  it('mirrors stars toggled in the Breakdowns panel', async () => {
    const container = await mount(
      React.createElement(React.Fragment, null,
        React.createElement(BreakdownsPanel),
        React.createElement(FavoritesDock),
      ),
    )
    expect(container.querySelector('aside')).toBeNull()

    const star = container.querySelector('button[aria-label="Pin Hit Points"]') as HTMLButtonElement
    expect(star).toBeTruthy()
    await act(async () => { star.click() })

    const dock = container.querySelector('aside')
    expect(dock).toBeTruthy()
    expect(dock!.textContent).toContain('Hit Points · Defense')
  })

  it('collapses to a reopen tab and persists the collapsed state', async () => {
    await act(async () => toggleFavorite('Defense/Hit Points'))
    const container = await mount(React.createElement(FavoritesDock))

    const collapse = container.querySelector('button[aria-label="Hide favorite stats"]') as HTMLButtonElement
    expect(collapse).toBeTruthy()
    await act(async () => { collapse.click() })

    expect(container.querySelector('aside')).toBeNull()
    expect(container.querySelector('button[aria-label="Show favorite stats"]')).toBeTruthy()
    expect(localStorage.getItem('ddo-favorites-dock-open')).toBe('0')

    const reopen = container.querySelector('button[aria-label="Show favorite stats"]') as HTMLButtonElement
    await act(async () => { reopen.click() })
    expect(container.querySelector('aside')).toBeTruthy()
    expect(localStorage.getItem('ddo-favorites-dock-open')).toBe('1')
  })

  it('unpinning from the dock clears the shared list and hides the dock', async () => {
    await act(async () => toggleFavorite('Defense/Hit Points'))
    const container = await mount(React.createElement(FavoritesDock))

    const unpin = container.querySelector('button[aria-label^="Unpin"]') as HTMLButtonElement
    expect(unpin).toBeTruthy()
    await act(async () => { unpin.click() })

    expect(container.querySelector('aside')).toBeNull()
    expect(getFavorites()).toEqual([])
  })
})
