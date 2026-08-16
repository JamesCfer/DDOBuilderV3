// @vitest-environment jsdom
//
// Stances panel — the Iconic Past Lives section. V2 surfaces one toggle per
// iconic past life the build has taken, in the single-selection "Iconic"
// group: lighting one puts the others out.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React, { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// As the loader delivers them: the trailing space is already restored.
const ICONIC_FEATS = [
  {
    Name: 'Past Life: Aasimar Scourge',
    Acquire: 'IconicPastLife',
    Stance: [{ Name: 'Aasimar Scourge ', Group: ['Iconic'], Description: '+[2/4/6]% Doublestrike' }],
  },
  {
    Name: 'Past Life: Bladeforged',
    Acquire: 'IconicPastLife',
    Stance: [{ Name: 'Bladeforged ', Group: ['Iconic'], Description: '+[10/20/30] Repair spell power' }],
  },
]

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const body = url.pathname === '/api/feats' ? ICONIC_FEATS : []
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

/** Seeds the past lives the panel's toggles are derived from. */
function SeedPastLives() {
  const { dispatch } = useCharacter()
  useEffect(() => {
    dispatch({ type: 'SET_PAST_LIFE', source: 'Aasimar Scourge', count: 3 })
    dispatch({ type: 'SET_PAST_LIFE', source: 'Bladeforged', count: 1 })
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

async function mountPanel(): Promise<HTMLElement> {
  const mod = await import('../components/stances/StancesPanel')
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(SeedPastLives),
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

const buttonFor = (c: HTMLElement, name: string): HTMLButtonElement =>
  Array.from(c.querySelectorAll('button'))
    .find(b => (b.textContent ?? '').includes(name)) as HTMLButtonElement

const click = async (b: HTMLButtonElement) => {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('StancesPanel — iconic past lives', () => {
  it('offers one toggle per iconic past life, in a single-selection section', async () => {
    const container = await mountPanel()
    expect(container.textContent).toContain('Iconic Past Lives (one active)')
    expect(buttonFor(container, 'Aasimar Scourge')).toBeDefined()
    expect(buttonFor(container, 'Bladeforged')).toBeDefined()
    // The stance name's trailing space is V2 data, not something to show.
    expect(buttonFor(container, 'Bladeforged').textContent).toBe('Bladeforged')
    expect(buttonFor(container, 'Bladeforged').title).toContain('Iconic past life: Bladeforged')
    expect(buttonFor(container, 'Aasimar Scourge').title).toContain('Aasimar Scourge ×3')
  })

  it('lighting a second iconic stance puts the first out', async () => {
    const container = await mountPanel()
    await click(buttonFor(container, 'Aasimar Scourge'))
    expect(buttonFor(container, 'Aasimar Scourge').textContent).toContain('✓')

    await click(buttonFor(container, 'Bladeforged'))
    expect(buttonFor(container, 'Bladeforged').textContent).toContain('✓')
    expect(buttonFor(container, 'Aasimar Scourge').textContent).not.toContain('✓')
  })

  it('a lit iconic stance can be switched back off', async () => {
    const container = await mountPanel()
    await click(buttonFor(container, 'Bladeforged'))
    expect(buttonFor(container, 'Bladeforged').textContent).toContain('✓')
    await click(buttonFor(container, 'Bladeforged'))
    expect(buttonFor(container, 'Bladeforged').textContent).not.toContain('✓')
  })
})
