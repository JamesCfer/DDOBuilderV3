// @vitest-environment jsdom
//
// Empty enhancement-tree catalogue diagnostic.
//
// When the server's data directory has no EnhancementTrees folder,
// loadEnhancementTrees silently returns [] and /api/enhancements answers
// 200 with an empty list. The Enhancements panel used to render that state
// as a misleading "No trees selected. Click 'Add Tree'..." (with the build's
// 7 pins intact and 0 AP shown) — indistinguishable from a healthy app with
// nothing pinned. The panel must instead surface an explicit diagnostic and
// must NOT prune the build's pinned trees while the catalogue is empty.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function installEmptyFetchMock() {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
}

const PINNED = [
  'Kensei', 'Inquisitive', 'Harper Agent', 'Dhampir',
  'Horizon Walker', 'Vanguard', 'Stalwart Defender',
]

function fighterWithPins(): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Dhampir',
    classes: [{ name: 'Fighter', levels: 20 }],
    levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
    totalLevel: 20,
    enhancementPinned: [...PINNED],
  }
}

let capturedBuild: CharacterBuild | null = null

function LoadBuild({ build, children }: { build: CharacterBuild; children: React.ReactNode }) {
  const { build: current, dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  capturedBuild = current
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

describe('Enhancements panel with an empty tree catalogue', () => {
  beforeAll(() => installEmptyFetchMock())

  it('shows the data-directory diagnostic instead of "No trees selected" and keeps pins', async () => {
    const mod = await import('../components/enhancements/EnhancementTreePanel')
    const Panel = mod.default
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(
        React.createElement(CharacterProvider, null,
          React.createElement(DocumentProvider, null,
            React.createElement(SettingsProvider, null,
              React.createElement(LoadBuild, { build: fighterWithPins() },
                React.createElement(Panel)),
            ),
          ),
        ),
      )
    })
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
    mounted.push({ root, container })

    const text = container.textContent ?? ''
    expect(text).toContain('The server returned no enhancement trees')
    expect(text).not.toContain('No trees selected')
    // The prune effect must not fire while the catalogue is empty.
    expect(capturedBuild?.enhancementPinned).toEqual(PINNED)
  }, 30_000)
})
