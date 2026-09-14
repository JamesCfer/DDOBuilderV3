// @vitest-environment jsdom
//
// "Stances & Buffs" — the window that keeps stances at the top and the buff
// panels directly below, so toggling one never means leaving the numbers you
// were reading. Plus the page model: four pages, and every panel reachable
// as a window rather than through a rail or a tab of its own.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { StancesAndBuffs, WINDOW_REGISTRY, windowsByGroup } from '../components/workspace/registry'
import { PAGES, defaultWorkspaces } from '../lib/workspace'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const STANCE = { Name: 'Test Stance', Description: 'A stance', Group: 'Test' }
const BUFF = { Name: 'Test Self Buff', Description: 'A buff' }
const GUILD = { Name: 'Test Guild Buff', Level: 1 }

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const body =
    url.pathname === '/api/stances' ? [STANCE]
    : url.pathname === '/api/selfbuffs' ? [BUFF]
    : url.pathname === '/api/guildbuffs' ? [GUILD]
    : []
  return new Response(JSON.stringify(body), {
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

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(StancesAndBuffs),
          ),
        ),
      ),
    )
  })
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
  mounted.push({ root, container })
  return container
}

const headings = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('.panel-header')).map(h => h.textContent ?? '')

describe('Stances & Buffs window', () => {
  it('shows stances first with the buff panels directly below', async () => {
    const container = await mount()
    const order = headings(container)
    const stances = order.findIndex(h => h.includes('Stances'))
    const selfBuffs = order.findIndex(h => h.includes('Self'))
    const guildBuffs = order.findIndex(h => h.includes('Guild Buffs'))

    expect(stances).toBeGreaterThanOrEqual(0)
    expect(selfBuffs).toBeGreaterThan(stances)
    expect(guildBuffs).toBeGreaterThan(selfBuffs)
  })

  it('is on the Overview tab by default and available to every tab', () => {
    const overview = defaultWorkspaces('Character')[0]
    expect(overview.windows.map(w => w.panel)).toContain('Stances & Buffs')
    expect(WINDOW_REGISTRY['Stances & Buffs']).toBeDefined()
  })
})

describe('page model', () => {
  it('has exactly the four pages', () => {
    expect([...PAGES]).toEqual(['Character', 'Crafting', 'Community', 'Plugins'])
  })

  it('offers every panel as a window, grouped for the menu', () => {
    const groups = windowsByGroup()
    const all = groups.flatMap(g => g.panels)
    for (const name of [
      'Character Info', 'Feats', 'Skills', 'Spells', 'Enhancements', 'Epic Destinies', 'Gear',
      'Combat', 'Damage Calc', 'Breakdowns', 'DCs', 'Bonuses', 'Compare',
      'Stances', 'Self Buffs', 'Guild Buffs', 'Optimizer', 'Notes', 'Forum Export',
      'Settings', 'Help & About', 'Crafting Systems', 'Browse Builds', 'Dungeon Help',
    ]) {
      expect(all, name).toContain(name)
    }
    // No duplicates: one place to open each panel.
    expect(new Set(all).size).toBe(all.length)
  })

  it('has no rails or fixed panes in the app shell — everything is a window', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const src = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8')
    expect(src).not.toMatch(/AnalysisDock|StanceBuffDock|Dashboard/)
    expect(src).toMatch(/<Workspace /)
  })
})
