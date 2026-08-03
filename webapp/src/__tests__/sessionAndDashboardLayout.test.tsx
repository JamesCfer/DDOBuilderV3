// @vitest-environment jsdom
//
// 1. Session restore — the working document survives a reload.
// 2. Custom › Windows layout — per-account, and closed windows stay closed.
//
// The layout bug was a stale closure: every mutation rebuilt the window list
// from the `wins` captured by the render that created the handler. A
// ResizeObserver callback arrives asynchronously, so one belonging to a window
// that had since been closed wrote its old array back — resurrecting the
// closed window and discarding anything done in between.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { saveSession, readSession, clearSession } from '../lib/sessionStore'
import { emptyDocument } from '../lib/multiLife'
import { emptyBuild } from '../types/ddo'
import type { CharacterDocument } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

globalThis.fetch = (async () =>
  new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
) as typeof fetch

// ---------------------------------------------------------------------------
// Session restore
// ---------------------------------------------------------------------------

describe('session restore', () => {
  beforeEach(() => clearSession())

  function docNamed(name: string): CharacterDocument {
    const build = { ...emptyBuild(), name, race: 'Dwarf', totalLevel: 12 }
    return emptyDocument(build)
  }

  it('round-trips the working document', () => {
    saveSession(docNamed('Yesterday'))
    const restored = readSession()
    expect(restored).toBeDefined()
    expect(restored!.lives[0].builds[0].name).toBe('Yesterday')
    expect(restored!.lives[0].builds[0].race).toBe('Dwarf')
  })

  it('returns nothing when there is no snapshot', () => {
    expect(readSession()).toBeUndefined()
  })

  it('discards a corrupt snapshot instead of throwing', () => {
    localStorage.setItem('ddo-builder-session', '{not json')
    expect(readSession()).toBeUndefined()
  })

  it('discards a structurally empty snapshot', () => {
    localStorage.setItem('ddo-builder-session', JSON.stringify({ lives: [] }))
    expect(readSession()).toBeUndefined()
    localStorage.setItem('ddo-builder-session', JSON.stringify({ lives: [{ builds: [] }] }))
    expect(readSession()).toBeUndefined()
  })

  it('clearSession forgets it (starting a new character)', () => {
    saveSession(docNamed('Gone'))
    clearSession()
    expect(readSession()).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Dashboard layout
// ---------------------------------------------------------------------------

let mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
  localStorage.clear()
})

async function mountDashboard(): Promise<HTMLElement> {
  // The windows host real panels, so the Dashboard needs the same provider
  // stack the app gives it.
  const [mod, auth, character, document_, settings] = await Promise.all([
    import('../components/layout/Dashboard'),
    import('../context/AuthContext'),
    import('../context/CharacterContext'),
    import('../context/DocumentContext'),
    import('../context/SettingsContext'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(character.CharacterProvider, null,
        React.createElement(document_.DocumentProvider, null,
          React.createElement(settings.SettingsProvider, null,
            React.createElement(auth.AuthProvider, null,
              React.createElement(mod.default))))),
    )
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
  mounted.push({ root, container })
  return container
}

const stored = (key = 'ddo-builder-dashboard') =>
  JSON.parse(localStorage.getItem(key) ?? 'null') as Array<{ id: string; panel: string }> | null

const closeButtons = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).filter(b => b.getAttribute('title')?.match(/close/i))

describe('Dashboard layout persistence', () => {
  it('starts from the default layout and persists a close', async () => {
    const container = await mountDashboard()
    const before = container.querySelectorAll('[class*=window]').length
    expect(before).toBeGreaterThan(0)

    const close = closeButtons(container)[0]
    expect(close).toBeTruthy()
    await act(async () => { close.click() })

    const layout = stored()
    expect(layout).toBeTruthy()
    expect(layout!.length).toBe(6 - 1)
  })

  it('a closed window does not come back when a late resize event fires', async () => {
    // The regression, reproduced at the store level: a stale handler writing
    // its captured array back after a close. With functional updates the
    // close wins; with the old code the six-window array returned.
    const container = await mountDashboard()
    const closes = closeButtons(container)
    await act(async () => { closes[0].click() })
    const afterClose = stored()!.length

    // Let any queued ResizeObserver / layout callbacks flush.
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    }
    expect(stored()!.length).toBe(afterClose)
  })

  it('closing every window stays empty across a remount', async () => {
    const container = await mountDashboard()
    for (const b of closeButtons(container)) {
      await act(async () => { b.click() })
    }
    expect(stored()).toEqual([])

    // An empty layout is a real choice, not a reason to restore the defaults.
    const again = await mountDashboard()
    expect(closeButtons(again)).toHaveLength(0)
    expect(stored()).toEqual([])
  })

  it('keeps signed-out and per-account layouts apart', async () => {
    // Signed out: close one window, leaving five under the bare key.
    const container = await mountDashboard()
    await act(async () => { closeButtons(container)[0].click() })
    expect(stored()).toHaveLength(5)
    expect(localStorage.getItem('ddo-builder-dashboard:u1')).toBeNull()

    // A signed-in account writes under its own key and leaves the other alone.
    localStorage.setItem('ddo-builder-dashboard:u1', JSON.stringify([
      { id: 'a', panel: 'Stats', x: 0, y: 0, w: 300, h: 200, zoom: 'auto' },
    ]))
    expect(stored('ddo-builder-dashboard:u1')).toHaveLength(1)
    expect(stored()).toHaveLength(5)
  })
})
