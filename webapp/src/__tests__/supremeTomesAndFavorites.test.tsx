// @vitest-environment jsdom
//
// 1. Tomes panel: "Supreme +8 all" quick button sets every ability tome to +8.
// 2. Breakdowns panel: star buttons pin stat rows to a "★ Favorites" section
//    at the top; the choice persists in localStorage.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const FIGHTER = { Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1', Will: 'Type1', BAB: '1' }

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const data = url.pathname === '/api/classes' ? [FIGHTER] : []
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

let latestBuild: CharacterBuild | null = null

function LoadBuild({ build, children }: { build: CharacterBuild; children: React.ReactNode }) {
  const { build: current, dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  latestBuild = current
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

async function mount(component: React.ReactElement, build: CharacterBuild): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, { build }, component),
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

// ---------------------------------------------------------------------------

describe('Tomes panel — Supreme +8 all button', () => {
  it('sets every ability tome to +8', async () => {
    const mod = await import('../components/builder/TomesPanel')
    const container = await mount(React.createElement(mod.default), fighter20())
    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Supreme +8 all') as HTMLButtonElement
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })
    for (const ab of ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const) {
      expect(latestBuild!.abilityTomes[ab]).toBe(8)
    }
  })
})

// ---------------------------------------------------------------------------

describe('Breakdowns panel — favorite stars', () => {
  beforeEach(() => localStorage.removeItem('ddo-breakdown-favorites'))

  it('starring a row pins it to a ★ Favorites section at the top and persists', async () => {
    const mod = await import('../components/breakdowns/BreakdownsPanel')
    const container = await mount(React.createElement(mod.default), fighter20())

    // No favorites yet
    expect(container.textContent).not.toContain('★ Favorites')

    // Star the Defense "Hit Points" row via its aria-label
    const star = container.querySelector('button[aria-label="Pin Hit Points"]') as HTMLButtonElement
    expect(star).toBeTruthy()
    await act(async () => { star.click() })

    expect(container.textContent).toContain('★ Favorites')
    expect(container.textContent).toContain('Hit Points · Defense')
    expect(JSON.parse(localStorage.getItem('ddo-breakdown-favorites')!)).toEqual(['Defense/Hit Points'])

    // Unstar from the favorites section removes it again
    const unstar = Array.from(container.querySelectorAll('button[aria-label^="Unpin"]'))[0] as HTMLButtonElement
    await act(async () => { unstar.click() })
    expect(container.textContent).not.toContain('★ Favorites')
    expect(JSON.parse(localStorage.getItem('ddo-breakdown-favorites')!)).toEqual([])
  })
})
