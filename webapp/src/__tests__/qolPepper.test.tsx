// @vitest-environment jsdom
//
// Quality-of-life features from user (Pepper) feedback:
//  1. Class grid: per-class "Clear" chips + "Clear all" (previously the only
//     way to remove a class was to change every level dropdown one by one).
//  2. Reaper trees render side by side like Epic Destinies (all 3 at once).
//  3. Past Lives: "+1 all" completionist buttons per group — clicking a
//     3-max group's button three times trains full completionist — plus a
//     per-group Clear.

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

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

const CLASSES = [
  { Name: 'Fighter', HitPoints: 10 },
  { Name: 'Rogue', HitPoints: 6 },
  { Name: 'Dragon Lord', HitPoints: 10 },
  { Name: 'Wizard', HitPoints: 4 },
]
const RACES = [
  { Name: 'Human' },
  { Name: 'Elf' },
  { Name: 'Morninglord', IsIconic: true },
]

function reaperTree(name: string) {
  return {
    Name: name,
    IsReaperTree: true,
    EnhancementTreeItem: [
      { Name: `${name} Core`, InternalName: `${name} Core`, Ranks: 1, CostPerRank: '1', XPosition: 0, YPosition: 0 },
    ],
  }
}
const REAPER_TREES = [reaperTree('Dread Adversary'), reaperTree('Dire Thaumaturge'), reaperTree('Grim Barricade')]

function installFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    let data: unknown = []
    if (url.pathname === '/api/classes') data = CLASSES
    if (url.pathname === '/api/races') data = RACES
    if (url.pathname === '/api/enhancements') data = REAPER_TREES
    if (url.pathname === '/api/feats') data = []
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}
installFetchMock()

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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

function findButton(container: HTMLElement, label: string, title?: string): HTMLButtonElement {
  const btns = Array.from(container.querySelectorAll('button'))
  const btn = btns.find(b =>
    b.textContent?.trim() === label && (title === undefined || (b.title ?? '').includes(title)))
  if (!btn) throw new Error(`button "${label}" not found`)
  return btn as HTMLButtonElement
}

// ---------------------------------------------------------------------------
// 1. ClassSelector clear buttons
// ---------------------------------------------------------------------------

describe('ClassSelector clear buttons', () => {
  function pepperBuild(): CharacterBuild {
    const levels = Array.from({ length: 20 }, () => 'Fighter')
    levels[0] = 'Dragon Lord'
    levels[4] = 'Rogue'
    return {
      ...emptyBuild(),
      race: 'Human',
      levelClasses: levels,
      classes: [
        { name: 'Dragon Lord', levels: 1 },
        { name: 'Fighter', levels: 18 },
        { name: 'Rogue', levels: 1 },
      ],
      totalLevel: 20,
    }
  }

  it('per-class clear removes only that class from the heroic grid', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), pepperBuild())
    // New vertical class list: each selected row has a ✕ remove button.
    const clearFighter = findButton(container, '✕', 'Remove Fighter')
    await act(async () => { clearFighter.click() })
    const lc = latestBuild!.levelClasses
    expect(lc.filter(c => c === 'Fighter')).toHaveLength(0)
    expect(lc[0]).toBe('Dragon Lord')
    expect(lc[4]).toBe('Rogue')
  })

  it('Clear all empties every heroic level', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), pepperBuild())
    const clearAll = findButton(container, 'Clear all', 'Clear all 20 heroic level assignments')
    await act(async () => { clearAll.click() })
    expect(latestBuild!.levelClasses.filter(Boolean)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Reaper trees side by side
// ---------------------------------------------------------------------------

describe('ReaperPanel renders all trees side by side', () => {
  it('mounts all 3 reaper trees simultaneously (no tabs)', async () => {
    const mod = await import('../components/reaper/ReaperPanel')
    const build = { ...emptyBuild(), totalLevel: 20, reaperAP: 30 }
    const container = await mount(React.createElement(mod.default), build)
    const titles = Array.from(container.querySelectorAll('[class*="treeTitle"]'))
      .map(el => el.textContent ?? '')
    expect(titles.some(t => t.includes('Dread Adversary'))).toBe(true)
    expect(titles.some(t => t.includes('Dire Thaumaturge'))).toBe(true)
    expect(titles.some(t => t.includes('Grim Barricade'))).toBe(true)
    expect(container.querySelectorAll('[class*="treeColumn"]').length).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// 3. Past-life completionist bulk buttons
// ---------------------------------------------------------------------------

describe('PastLivesPanel "+1 all" completionist buttons', () => {
  it('three clicks on the heroic group trains every heroic class to 3', async () => {
    const mod = await import('../components/pastlives/PastLivesPanel')
    const container = await mount(React.createElement(mod.default), { ...emptyBuild() })
    const heroicSection = Array.from(container.querySelectorAll('section'))
      .find(s => s.textContent?.includes('Heroic Past Lives'))!
    const plusAll = Array.from(heroicSection.querySelectorAll('button'))
      .find(b => b.textContent === '+1 all') as HTMLButtonElement
    for (let i = 0; i < 3; i++) {
      await act(async () => { plusAll.click() })
    }
    for (const cls of CLASSES) {
      expect(latestBuild!.pastLives[cls.Name]).toBe(3)
    }
  })

  it('iconic group caps at 3 and Clear resets the group', async () => {
    // Iconic past lives stack ×3 like heroic/racial ones (race-file feats
    // carry MaxTimesAcquire 3 — e.g. "Past Life: Morninglord").
    const mod = await import('../components/pastlives/PastLivesPanel')
    const container = await mount(React.createElement(mod.default), { ...emptyBuild() })
    const iconicSection = Array.from(container.querySelectorAll('section'))
      .find(s => s.textContent?.includes('Iconic Past Lives'))!
    const plusAll = Array.from(iconicSection.querySelectorAll('button'))
      .find(b => b.textContent === '+1 all') as HTMLButtonElement
    for (let i = 0; i < 4; i++) {
      await act(async () => { plusAll.click() })
    }
    expect(latestBuild!.pastLives['Morninglord']).toBe(3)
    const clear = Array.from(iconicSection.querySelectorAll('button'))
      .find(b => b.textContent === 'Clear') as HTMLButtonElement
    await act(async () => { clear.click() })
    expect(latestBuild!.pastLives['Morninglord'] ?? 0).toBe(0)
  })
})
