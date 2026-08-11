// @vitest-environment jsdom
//
// Filigree set-bonus preview: the panel only ever showed a set's bonuses once
// pieces were already slotted. Hovering any filigree — slotted or merely
// offered in the picker — must show the whole ladder in advance, marking what
// is already active and what slotting THIS piece would unlock.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { loadFiligreeSets, loadFiligreeBonuses, loadSentientGems } from '../server/dataLoaders'
import { splitDescription } from '../components/filigree/FiligreeHoverCard'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import FiligreePanel from '../components/filigree/FiligreePanel'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('filigree description split', () => {
  it('separates the rare-variant line from the base effect', () => {
    expect(splitDescription('+1 Charisma\nRare: +2 MRR')).toEqual({
      base: ['+1 Charisma'], rare: ['+2 MRR'],
    })
  })

  it('tolerates a missing description', () => {
    expect(splitDescription(undefined)).toEqual({ base: [], rare: [] })
  })
})

// ---------------------------------------------------------------------------

const SET = 'Angelic Wings'
const PIECE = 'Angelic Wings: +1 Charisma'

function SlotOne({ children }: { children: React.ReactNode }) {
  const { dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    // One piece already slotted, so the card can distinguish "active" from
    // "this would unlock".
    dispatch({ type: 'SET_FILIGREE', slotIndex: 0, name: PIECE })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? <>{children}</> : null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

function hover(el: Element) {
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
}

describe.runIf(haveData)('FiligreePanel hover cards', () => {
  beforeAll(() => {
    const cat: Record<string, unknown> = {
      filigree: loadFiligreeSets(DATA_DIR),
      'filigree-bonuses': loadFiligreeBonuses(DATA_DIR),
      gems: loadSentientGems(DATA_DIR),
    }
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const key = url.pathname.replace(/^\/api\//, '')
      return new Response(JSON.stringify(cat[key] ?? []), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
  })

  async function renderPanel() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(
        <CharacterProvider>
          <DocumentProvider>
            <SettingsProvider>
              <SlotOne><FiligreePanel /></SlotOne>
            </SettingsProvider>
          </DocumentProvider>
        </CharacterProvider>,
      )
    })
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
    mounted.push({ root, container })
    return container
  }

  it('shows the whole set ladder when hovering a slotted filigree', async () => {
    const container = await renderPanel()
    const slotBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes(PIECE))
    expect(slotBtn).toBeTruthy()
    await act(async () => { hover(slotBtn!) })

    const card = document.querySelector('[role="tooltip"]')
    expect(card).toBeTruthy()
    const text = card!.textContent ?? ''
    expect(text).toContain(PIECE)
    expect(text).toContain(SET)
    // Every tier, not just the ones already unlocked.
    expect(text).toContain('2pc')
    expect(text).toContain('5pc')
    expect(text).toContain('+200 Maximum Spell points')
  })

  it('marks the tier a picker entry would unlock', async () => {
    const container = await renderPanel()
    // Open the second weapon slot's picker and search for the same set, so a
    // second piece of it is on offer.
    const buttons = Array.from(container.querySelectorAll('button'))
    const emptyBtn = buttons.filter(b => b.textContent?.includes('— Empty —'))[0]
    expect(emptyBtn).toBeTruthy()
    await act(async () => { emptyBtn.click() })

    const search = container.querySelector('input[type=text], input:not([type])') as HTMLInputElement
    expect(search).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(search, SET)
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const options = Array.from(container.querySelectorAll('[role="option"]'))
      .filter(o => o.textContent?.startsWith(SET))
    expect(options.length).toBeGreaterThan(0)
    await act(async () => { hover(options[0]) })

    const card = document.querySelector('[role="tooltip"]')
    expect(card).toBeTruthy()
    const text = card!.textContent ?? ''
    // One piece is slotted already; this would be the second, unlocking 2pc.
    expect(text).toContain('1 slotted → 2 with this')
    expect(text).toContain('unlocks')
  })
})
