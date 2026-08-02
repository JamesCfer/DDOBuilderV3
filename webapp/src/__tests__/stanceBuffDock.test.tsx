// @vitest-environment jsdom
//
// StanceBuffDock — the always-visible left rail. Stances sit at the top and
// the buff panels directly below, on every page, so toggling one no longer
// means navigating away from whatever numbers you were reading.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'

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
beforeEach(() => localStorage.removeItem('ddo-stance-dock-open'))
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

async function mountDock(): Promise<HTMLElement> {
  const mod = await import('../components/layout/StanceBuffDock')
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(mod.default),
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

describe('StanceBuffDock', () => {
  it('shows stances first with the buff panels directly below', async () => {
    const container = await mountDock()
    const order = headings(container)
    const stances = order.findIndex(h => h.includes('Stances'))
    const selfBuffs = order.findIndex(h => h.includes('Self'))
    const guildBuffs = order.findIndex(h => h.includes('Guild Buffs'))

    expect(stances).toBeGreaterThanOrEqual(0)
    expect(selfBuffs).toBeGreaterThan(stances)
    expect(guildBuffs).toBeGreaterThan(selfBuffs)
  })

  it('is open by default and collapses to a reopen button', async () => {
    const container = await mountDock()
    const collapse = container.querySelector('button[aria-expanded="true"]') as HTMLButtonElement
    expect(collapse).toBeTruthy()

    await act(async () => { collapse.click() })
    expect(container.querySelector('.panel-header')).toBeNull()
    const reopen = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement
    expect(reopen).toBeTruthy()

    await act(async () => { reopen.click() })
    for (let i = 0; i < 4; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
    expect(headings(container).some(h => h.includes('Stances'))).toBe(true)
  })

  it('remembers being collapsed across mounts', async () => {
    localStorage.setItem('ddo-stance-dock-open', '0')
    const container = await mountDock()
    expect(container.querySelector('button[aria-expanded="false"]')).toBeTruthy()
    expect(container.querySelector('.panel-header')).toBeNull()
  })
})

describe('page model', () => {
  // Guards against a rail and a duplicate tab both existing: two places to
  // toggle the same stance, or to read the same breakdown, is exactly the
  // confusion the rails remove.
  const appSource = async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    return readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8')
  }

  it('has no Stances or Buffs tab — the left rail owns them', async () => {
    const src = await appSource()
    expect(src).not.toMatch(/case 'Analysis\/Stances'/)
    expect(src).not.toMatch(/case '\w+\/Buffs'/)
  })

  it('has no Analysis page at all — the right rail owns it', async () => {
    const src = await appSource()
    const pages = src.match(/const PAGES: Page\[\] = \[(.*?)\]/s)?.[1] ?? ''
    expect(pages).not.toContain("'Analysis'")
    expect(pages).toContain("'Character'")
  })

  it('keeps equipment on a single page', async () => {
    const src = await appSource()
    const equipment = src.match(/Equipment:\s*\[(.*?)\]/s)?.[1] ?? ''
    expect(equipment.split(',').filter(x => x.trim()).length).toBe(1)
  })
})
