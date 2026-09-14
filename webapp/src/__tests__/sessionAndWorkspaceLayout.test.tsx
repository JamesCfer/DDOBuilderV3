// @vitest-environment jsdom
//
// 1. Session restore — the working document survives a reload.
// 2. Workspace layout — every page is a grid of windows; closing, adding and
//    tab management persist per account, and a closed window stays closed.
//
// The persistence bug the second half guards against was a stale closure:
// every mutation rebuilt the window list from the `wins` captured by the
// render that created the handler. A ResizeObserver callback arrives
// asynchronously, so one belonging to a window that had since been closed
// wrote its old array back — resurrecting the closed window and discarding
// anything done in between.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { saveSession, readSession, clearSession } from '../lib/sessionStore'
import { emptyDocument } from '../lib/multiLife'
import { emptyBuild } from '../types/ddo'
import type { CharacterDocument } from '../types/ddo'
import { defaultWorkspaces, LAYOUT_STORAGE_KEY, type LayoutState, type PageId } from '../lib/workspace'

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
// Workspace layout
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

/** Mounts a page's workspace inside the same provider stack the app gives it. */
async function mountWorkspace(page: PageId = 'Character', userId: string | null = null): Promise<HTMLElement> {
  const [ws, hook, auth, character, document_, settings, collab] = await Promise.all([
    import('../components/workspace/Workspace'),
    import('../hooks/useWorkspaceLayout'),
    import('../context/AuthContext'),
    import('../context/CharacterContext'),
    import('../context/DocumentContext'),
    import('../context/SettingsContext'),
    import('../context/CollabContext'),
  ])
  function Page() {
    const api = hook.useWorkspaceLayout(userId)
    return React.createElement(ws.default, { page, api })
  }
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
              React.createElement(collab.CollabProvider, null,
                React.createElement(Page)))))),
    )
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
  mounted.push({ root, container })
  return container
}

const stored = (key = LAYOUT_STORAGE_KEY): LayoutState | null => {
  const raw = localStorage.getItem(key)
  return raw ? (JSON.parse(raw) as { layout: LayoutState }).layout : null
}

const windowsOn = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-window]'))
const closeButtons = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('button[title="Close window"]'))
const tabButtons = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('nav[aria-label="Workspace tabs"] button')).filter(b => b.textContent !== '+')

const OVERVIEW_COUNT = defaultWorkspaces('Character')[0].windows.length

describe('Workspace layout', () => {
  it('opens the Character page on the Overview tab with its default windows', async () => {
    const c = await mountWorkspace()
    expect(tabButtons(c).map(b => b.textContent)).toContain('Overview')
    expect(windowsOn(c)).toHaveLength(OVERVIEW_COUNT)
    expect(windowsOn(c).map(w => w.getAttribute('data-window'))).toContain('Character')
  })

  it('draws every window on the grid', async () => {
    const c = await mountWorkspace()
    for (const w of windowsOn(c)) {
      const el = w as HTMLElement
      expect(parseInt(el.style.left, 10) % 24).toBe(0)
      expect(parseInt(el.style.top, 10) % 24).toBe(0)
    }
  })

  it('persists a close', async () => {
    const c = await mountWorkspace()
    await act(async () => { closeButtons(c)[0].click() })
    expect(windowsOn(c)).toHaveLength(OVERVIEW_COUNT - 1)
    expect(stored()!.Character[0].windows).toHaveLength(OVERVIEW_COUNT - 1)
  })

  it('a closed window does not come back when a late resize event fires', async () => {
    const c = await mountWorkspace()
    await act(async () => { closeButtons(c)[0].click() })
    const afterClose = stored()!.Character[0].windows.length
    // Let any queued ResizeObserver / layout callbacks flush.
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    }
    expect(stored()!.Character[0].windows.length).toBe(afterClose)
    expect(windowsOn(c)).toHaveLength(afterClose)
  })

  it('closing every window stays empty across a remount', async () => {
    const c = await mountWorkspace()
    for (const b of closeButtons(c)) {
      await act(async () => { b.click() })
    }
    expect(stored()!.Character[0].windows).toEqual([])
    expect(c.textContent).toContain('This tab is empty')

    // An empty tab is a real choice, not a reason to restore the defaults.
    const again = await mountWorkspace()
    expect(windowsOn(again)).toHaveLength(0)
  })

  it('adds a window from the menu at a free spot', async () => {
    const c = await mountWorkspace()
    const open = Array.from(c.querySelectorAll('button')).find(b => b.textContent?.includes('Add window'))!
    await act(async () => { open.click() })
    const item = Array.from(c.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find(b => b.textContent?.startsWith('Damage Calc'))!
    expect(item).toBeTruthy()
    await act(async () => { item.click() })
    const names = windowsOn(c).map(w => w.getAttribute('data-window'))
    expect(names).toContain('Damage Calc')
    expect(stored()!.Character[0].windows.map(w => w.panel)).toContain('Damage Calc')
  })

  it('switches tabs and remembers the choice', async () => {
    const c = await mountWorkspace()
    const gear = tabButtons(c).find(b => b.textContent === 'Gear')!
    await act(async () => { gear.click() })
    expect(windowsOn(c).map(w => w.getAttribute('data-window'))).toContain('Gear')
    expect(windowsOn(c).map(w => w.getAttribute('data-window'))).not.toContain('Character')

    const again = await mountWorkspace()
    expect(windowsOn(again).map(w => w.getAttribute('data-window'))).toContain('Gear')
  })

  it('keeps signed-out and per-account layouts apart', async () => {
    const c = await mountWorkspace()
    await act(async () => { closeButtons(c)[0].click() })
    expect(stored()!.Character[0].windows).toHaveLength(OVERVIEW_COUNT - 1)
    expect(localStorage.getItem(`${LAYOUT_STORAGE_KEY}:u1`)).toBeNull()

    // A signed-in account adopts the anonymous arrangement once, then writes
    // under its own key and leaves the other alone.
    const signedIn = await mountWorkspace('Character', 'u1')
    expect(windowsOn(signedIn)).toHaveLength(OVERVIEW_COUNT - 1)
    await act(async () => { closeButtons(signedIn)[0].click() })
    expect(stored(`${LAYOUT_STORAGE_KEY}:u1`)!.Character[0].windows).toHaveLength(OVERVIEW_COUNT - 2)
    expect(stored()!.Character[0].windows).toHaveLength(OVERVIEW_COUNT - 1)
  })

  it('gives every page a workspace', async () => {
    for (const page of ['Crafting', 'Community', 'Plugins'] as PageId[]) {
      const c = await mountWorkspace(page)
      expect(windowsOn(c).length).toBeGreaterThan(0)
      expect(c.querySelector('nav[aria-label="Workspace tabs"]')).toBeTruthy()
    }
  })
})
