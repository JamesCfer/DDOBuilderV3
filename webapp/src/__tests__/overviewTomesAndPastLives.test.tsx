// @vitest-environment jsdom
//
// Character Overview hosts the Tomes and Past Lives editors as folded cards
// (`collapsible` prop), so both can be selected without leaving the page:
//   - collapsed by default, with a summary of the current state in the header
//   - the body is not mounted until the card is first opened (so Past Lives'
//     catalogue fetches stay dormant on an overview nobody expanded)
//   - once open, the real editor is there and its edits reach the build
//   - the un-collapsible rendering used by the Tomes / Past Lives tabs is
//     unchanged: always open, no disclosure button

import { describe, it, expect, afterEach } from 'vitest'
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
const HUMAN = { Name: 'Human' }

/** Every catalogue URL the panels ask for, so we can assert none was hit. */
const fetched: string[] = []
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  fetched.push(url.pathname)
  const data = url.pathname === '/api/classes' ? [FIGHTER]
    : url.pathname === '/api/races' ? [HUMAN]
    : []
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
  fetched.length = 0
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

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
}

function fighter20(overrides: Partial<CharacterBuild> = {}): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Fighter', levels: 20 }],
    levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
    totalLevel: 20,
    ...overrides,
  }
}

const disclosure = (c: HTMLElement) =>
  c.querySelector('button[aria-expanded]') as HTMLButtonElement | null

// ---------------------------------------------------------------------------

describe('Overview Tomes card', () => {
  it('starts collapsed and summarises how many tomes are set', async () => {
    const mod = await import('../components/builder/TomesPanel')
    const container = await mount(
      React.createElement(mod.default, { collapsible: true }),
      fighter20({
        abilityTomes: { Strength: 8, Constitution: 6 } as CharacterBuild['abilityTomes'],
        skillTomes: { Balance: 7 } as CharacterBuild['skillTomes'],
      }),
    )
    const btn = disclosure(container)!
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.textContent).toContain('2 ability · 1 skill')
    // Collapsed: the editor's selects are not in the document yet.
    expect(container.querySelectorAll('select').length).toBe(0)
  })

  it('summarises an untouched build as "none set"', async () => {
    const mod = await import('../components/builder/TomesPanel')
    const container = await mount(
      React.createElement(mod.default, { collapsible: true }), fighter20(),
    )
    expect(disclosure(container)!.textContent).toContain('none set')
  })

  it('opens to the real editor, and selecting a tome updates the build', async () => {
    const mod = await import('../components/builder/TomesPanel')
    const container = await mount(
      React.createElement(mod.default, { collapsible: true }), fighter20(),
    )
    await act(async () => { disclosure(container)!.click() })

    expect(disclosure(container)!.getAttribute('aria-expanded')).toBe('true')
    const selects = container.querySelectorAll('select')
    expect(selects.length).toBeGreaterThan(6)   // 6 abilities + every skill

    // First select is Strength's ability tome.
    const strength = selects[0] as HTMLSelectElement
    await act(async () => {
      strength.value = '5'
      strength.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(latestBuild!.abilityTomes.Strength).toBe(5)

    // The header summary tracks the edit.
    expect(disclosure(container)!.textContent).toContain('1 ability')
  })

  it('renders always-open with no disclosure button when not collapsible', async () => {
    const mod = await import('../components/builder/TomesPanel')
    const container = await mount(React.createElement(mod.default), fighter20())
    expect(disclosure(container)).toBeNull()
    expect(container.querySelectorAll('select').length).toBeGreaterThan(6)
  })
})

// ---------------------------------------------------------------------------

describe('Overview Past Lives card', () => {
  it('starts collapsed, summarises the total, and fetches nothing until opened', async () => {
    const mod = await import('../components/pastlives/PastLivesPanel')
    const container = await mount(
      React.createElement(mod.default, { collapsible: true }),
      fighter20({ pastLives: { Fighter: 3, Barbarian: 2 } }),
    )
    const btn = disclosure(container)!
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.textContent).toContain('5 total')
    // The body never mounted, so its catalogue effects never ran. (The
    // providers' own startup fetches are not the panel's — filter to the
    // catalogues PastLivesBody asks for.)
    const panelFetches = () =>
      fetched.filter(p => p === '/api/classes' || p === '/api/races' || p === '/api/feats')
    expect(panelFetches()).toEqual([])

    await act(async () => { btn.click() })
    await settle()
    expect(fetched).toContain('/api/classes')
    expect(container.textContent).toContain('Heroic Past Lives')
  })

  it('opens to the real editor, and incrementing a past life updates the build', async () => {
    const mod = await import('../components/pastlives/PastLivesPanel')
    const container = await mount(
      React.createElement(mod.default, { collapsible: true }), fighter20(),
    )
    expect(disclosure(container)!.textContent).toContain('none trained')

    await act(async () => { disclosure(container)!.click() })
    await settle()

    const plus = container.querySelector(
      'button[aria-label="Increase Fighter"]',
    ) as HTMLButtonElement
    expect(plus).toBeTruthy()
    await act(async () => { plus.click() })

    expect(latestBuild!.pastLives.Fighter).toBe(1)
    expect(disclosure(container)!.textContent).toContain('1 total')
  })

  it('renders always-open with no disclosure button when not collapsible', async () => {
    const mod = await import('../components/pastlives/PastLivesPanel')
    const container = await mount(React.createElement(mod.default), fighter20())
    await settle()
    expect(disclosure(container)).toBeNull()
    expect(container.textContent).toContain('Heroic Past Lives')
  })
})
