// @vitest-environment jsdom
//
// Enhancements panel — AP stranded in a tree the build can no longer reach.
//
// V2's pane refunds those points as soon as it re-determines the tree list
// (EnhancementsPane.cpp:340-374). V3 pruned only the pinned list, so the panel
// header counted points that no visible tree owned: "6 / 80 AP" with every
// tree on screen empty.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React, { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { BuildLogProvider } from '../context/BuildLogContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const TREES = [
  {
    Name: 'Assassin',
    Requirements: { Requirement: [{ Type: 'Class', Item: ['Rogue'] }] },
    EnhancementTreeItem: [
      { Name: 'Assassin Core', InternalName: 'AssCore1', Ranks: 1, CostPerRank: '2', YPosition: 1, XPosition: 1 },
      { Name: 'Venomed Blades', InternalName: 'AssVenomedBlades', Ranks: 3, YPosition: 2, XPosition: 1 },
    ],
  },
  {
    Name: 'Ninja Spy',
    Requirements: { Requirement: [{ Type: 'Class', Item: ['Monk'] }] },
    EnhancementTreeItem: [
      { Name: 'Ninja Core', InternalName: 'NinCore1', Ranks: 1, YPosition: 1, XPosition: 1 },
    ],
  },
]
const CLASSES = [{ Name: 'Rogue' }, { Name: 'Monk' }]

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const body =
    url.pathname === '/api/enhancements' ? TREES
    : url.pathname === '/api/classes' ? CLASSES
    : []
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

/** A Monk build still carrying the Rogue-tree spend from a previous rebuild. */
function orphanedBuild(): CharacterBuild {
  return {
    ...emptyBuild(),
    race: '',
    classes: [{ name: 'Monk', levels: 20 }],
    levelClasses: Array(20).fill('Monk'),
    totalLevel: 20,
    enhancementChoices: { Assassin: { AssCore1: 1, AssVenomedBlades: 3 } },
    enhancementPinned: ['Assassin'],
  }
}

function SeedBuild({ build }: { build: CharacterBuild }) {
  const { dispatch } = useCharacter()
  useEffect(() => { dispatch({ type: 'LOAD_BUILD', build }) }, [dispatch, build])
  return null
}

/** Surfaces the live build so assertions can read the state, not just pixels. */
let latest: CharacterBuild | null = null
function Probe() {
  const { build } = useCharacter()
  latest = build
  return null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []
beforeEach(() => { latest = null })
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

async function mountPanel(build: CharacterBuild): Promise<HTMLElement> {
  const mod = await import('../components/enhancements/EnhancementTreePanel')
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(BuildLogProvider, null,
        React.createElement(CharacterProvider, null,
          React.createElement(DocumentProvider, null,
            React.createElement(SettingsProvider, null,
              React.createElement(SeedBuild, { build }),
              React.createElement(Probe),
              React.createElement(mod.default),
            ),
          ),
        ),
      ),
    )
  })
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
  mounted.push({ root, container })
  return container
}

describe('EnhancementTreePanel — stranded AP', () => {
  it('refunds points spent in a tree the build can no longer reach', async () => {
    const container = await mountPanel(orphanedBuild())
    expect(latest!.enhancementChoices.Assassin).toBeUndefined()
    expect(container.textContent).toContain('0 / 80 AP')
  })

  it('leaves the spend alone while the build still qualifies', async () => {
    const build = orphanedBuild()
    build.classes = [{ name: 'Rogue', levels: 20 }]
    build.levelClasses = Array(20).fill('Rogue')
    const container = await mountPanel(build)
    expect(latest!.enhancementChoices.Assassin).toEqual({ AssCore1: 1, AssVenomedBlades: 3 })
    expect(container.textContent).toContain('5 / 80 AP')
  })
})
