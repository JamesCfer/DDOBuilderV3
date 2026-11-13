// @vitest-environment jsdom
//
// Tester report (build #342): archetype casters (Stormsinger, Wild Mage,
// Blight Caster) showed "No spellcasting classes selected." in the DCs
// window. Class XML rows carry a size attribute (`<Level8 size="6">`), so
// they arrive as `{ '#text', size }`; the panel only read plain strings and
// fell back to a base-class name list.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React, { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const row = (t: string) => ({ '#text': t, size: '6' })
const STORMSINGER = {
  Name: 'Stormsinger',
  BaseClass: 'Bard',
  CastingStat: 'Charisma',
  Level1: row('1 0 0 0 0 0'),
  Level7: row('4 4 2 0 0 0'),
  Level8: row('4 4 3 0 0 0'),
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const body = url.pathname === '/api/classes' ? [STORMSINGER] : []
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

function SeedClass() {
  const { dispatch } = useCharacter()
  useEffect(() => {
    dispatch({ type: 'SET_CLASS', index: 0, name: 'Stormsinger' })
    dispatch({ type: 'SET_CLASS_LEVELS', index: 0, levels: 8 })
  }, [dispatch])
  return null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []
beforeEach(() => resetStaticBundleForTests())
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

describe('DCPanel archetype casters', () => {
  it('shows spell DCs for a Stormsinger', async () => {
    const mod = await import('../components/dc/DCPanel')
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(
        React.createElement(CharacterProvider, null,
          React.createElement(DocumentProvider, null,
            React.createElement(SettingsProvider, null,
              React.createElement(SeedClass),
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

    expect(container.textContent).not.toContain('No spellcasting classes selected.')
    expect(container.textContent).toContain('Charisma')
    const heads = Array.from(container.querySelectorAll('th')).map(t => t.textContent)
    expect(heads).toEqual(['School', 'Lv 1', 'Lv 2', 'Lv 3'])
  })
})
