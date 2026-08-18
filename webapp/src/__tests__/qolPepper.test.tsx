// @vitest-environment jsdom
//
// Quality-of-life features from user (Pepper) feedback:
//  1. Class window: one box per level with a drag-and-drop class palette
//     (drag a class onto a box, drag boxes to swap), plus "Clear all"; epic
//     and legendary levels are always present, defaulting to level 36.
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
  { Name: 'Dragon Lord', HitPoints: 10, BaseClass: 'Fighter' },
  // Hypothetical second Fighter archetype — exercises the same-base-pair rule.
  { Name: 'Iron Vanguard', HitPoints: 10, BaseClass: 'Fighter' },
  { Name: 'Sacred Fist', HitPoints: 8, BaseClass: 'Paladin' },
  { Name: 'Paladin', HitPoints: 10, Alignment: 'Lawful Good' },
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
// 1. ClassSelector level boxes (drag-and-drop rework)
// ---------------------------------------------------------------------------

/** Dispatch a drag event React's synthetic system will pick up. */
async function fireDrag(el: Element, type: 'dragstart' | 'dragover' | 'drop' | 'dragend') {
  await act(async () => {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  })
}

/** The 20 heroic level boxes, in level order. */
function levelBoxes(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-level]')) as HTMLElement[]
}

/** A palette tile by full class name (the tile shows only the 3-letter tag). */
function paletteTile(container: HTMLElement, name: string): HTMLButtonElement {
  const tiles = Array.from(container.querySelectorAll('button[class*="classTile"]'))
  const tile = tiles.find(t => t.querySelector('span[class*="classRowName"]')?.textContent === name)
  if (!tile) throw new Error(`palette tile "${name}" not found`)
  return tile as HTMLButtonElement
}

describe('ClassSelector level boxes', () => {
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

  it('renders one box per heroic level, tagged with the class short name', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), pepperBuild())
    const boxes = levelBoxes(container)
    expect(boxes).toHaveLength(20)
    expect(boxes[0].textContent).toContain('DRL')   // Dragon Lord
    expect(boxes[1].textContent).toContain('FTR')   // Fighter
    expect(boxes[4].textContent).toContain('ROG')   // Rogue
  })

  it('dragging a palette class onto a box assigns that level', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const build = pepperBuild()
    build.levelClasses = Array.from({ length: 20 }, (_, i) => (i < 4 ? 'Fighter' : ''))
    build.classes = [{ name: 'Fighter', levels: 4 }, { name: '', levels: 0 }, { name: '', levels: 0 }]
    build.totalLevel = 4
    const container = await mount(React.createElement(mod.default), build)
    await fireDrag(paletteTile(container, 'Rogue'), 'dragstart')
    await fireDrag(levelBoxes(container)[7], 'drop')
    expect(latestBuild!.levelClasses[7]).toBe('Rogue')
  })

  it('dragging one box onto another swaps the two levels', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), pepperBuild())
    const boxes = levelBoxes(container)
    await fireDrag(boxes[0], 'dragstart')     // Dragon Lord at level 1
    await fireDrag(boxes[4], 'drop')          // Rogue at level 5
    expect(latestBuild!.levelClasses[0]).toBe('Rogue')
    expect(latestBuild!.levelClasses[4]).toBe('Dragon Lord')
  })

  it('click-arms a palette class and places it on the next clicked box', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const build = pepperBuild()
    build.levelClasses = Array.from({ length: 20 }, (_, i) => (i < 4 ? 'Fighter' : ''))
    build.classes = [{ name: 'Fighter', levels: 4 }, { name: '', levels: 0 }, { name: '', levels: 0 }]
    build.totalLevel = 4
    const container = await mount(React.createElement(mod.default), build)
    await act(async () => { paletteTile(container, 'Wizard').click() })
    await act(async () => { levelBoxes(container)[10].click() })
    expect(latestBuild!.levelClasses[10]).toBe('Wizard')
  })

  it('the eraser tile clears the box it is dropped on', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), pepperBuild())
    const eraser = Array.from(container.querySelectorAll('button[class*="eraserTile"]'))[0]
    await fireDrag(eraser, 'dragstart')
    await fireDrag(levelBoxes(container)[4], 'drop')   // Rogue at level 5
    expect(latestBuild!.levelClasses[4]).toBe('')
  })

  it('Clear all empties every heroic level', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), pepperBuild())
    const clearAll = findButton(container, 'Clear all', 'Clear all 20 heroic level assignments')
    await act(async () => { clearAll.click() })
    expect(latestBuild!.levelClasses.filter(Boolean)).toHaveLength(0)
  })

  it('shows epic and legendary levels automatically, defaulting to level 36', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), pepperBuild())
    expect(container.querySelectorAll('[data-epic]')).toHaveLength(10)
    expect(container.querySelectorAll('[data-legendary]')).toHaveLength(10)
    // emptyBuild() → 20 heroic + 10 epic + 6 legendary
    expect(latestBuild!.epicLevels).toBe(10)
    expect(latestBuild!.legendaryLevels).toBe(6)
    expect(container.querySelector('[class*="levelTotal"]')?.textContent).toBe('Lv 36')
  })
})

// ---------------------------------------------------------------------------
// 1b. Archetype exclusion — an archetype and its base class can't combine
// ---------------------------------------------------------------------------

describe('ClassSelector archetype exclusion', () => {
  function fighterBuild(): CharacterBuild {
    return {
      ...emptyBuild(),
      race: 'Human',
      alignment: 'Lawful Good',
      levelClasses: Array.from({ length: 20 }, (_, i) => (i < 4 ? 'Fighter' : '')),
      classes: [
        { name: 'Fighter', levels: 4 },
        { name: '', levels: 0 },
        { name: '', levels: 0 },
      ],
      totalLevel: 4,
    }
  }

  it('greys the archetype in the palette when its base class is taken', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const container = await mount(React.createElement(mod.default), fighterBuild())
    const dragonLord = paletteTile(container, 'Dragon Lord')
    expect(dragonLord.disabled).toBe(true)
    expect(dragonLord.title).toContain('archetype of Fighter')
    // An unrelated archetype (Sacred Fist / Paladin) stays available.
    expect(paletteTile(container, 'Sacred Fist').disabled).toBe(false)
  })

  it('greys the base class when its archetype is taken, and refuses it on a box', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const build = fighterBuild()
    build.levelClasses = Array.from({ length: 20 }, (_, i) => (i < 4 ? 'Dragon Lord' : ''))
    build.classes = [
      { name: 'Dragon Lord', levels: 4 },
      { name: '', levels: 0 },
      { name: '', levels: 0 },
    ]
    const container = await mount(React.createElement(mod.default), build)
    const fighter = paletteTile(container, 'Fighter')
    expect(fighter.disabled).toBe(true)
    expect(fighter.title).toContain('Dragon Lord is an archetype of Fighter')

    // Even if the drag starts anyway, the box must refuse the blocked class.
    await fireDrag(fighter, 'dragstart')
    await fireDrag(levelBoxes(container)[5], 'drop')
    expect(latestBuild!.levelClasses[5]).toBe('')
    // Its own class still drops fine.
    await fireDrag(paletteTile(container, 'Dragon Lord'), 'dragstart')
    await fireDrag(levelBoxes(container)[5], 'drop')
    expect(latestBuild!.levelClasses[5]).toBe('Dragon Lord')
  })

  it('allows multiple archetypes of different base classes', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const build = fighterBuild()
    build.levelClasses = Array.from({ length: 20 }, (_, i) => (i < 4 ? 'Sacred Fist' : ''))
    build.classes = [
      { name: 'Sacred Fist', levels: 4 },
      { name: '', levels: 0 },
      { name: '', levels: 0 },
    ]
    const container = await mount(React.createElement(mod.default), build)
    // Dragon Lord (Fighter archetype) can join a Sacred Fist (Paladin
    // archetype) build — each counts as one of the 3 classes.
    expect(paletteTile(container, 'Dragon Lord').disabled).toBe(false)
    // Paladin (Sacred Fist's base) is blocked with the pair reason.
    const paladin = paletteTile(container, 'Paladin')
    expect(paladin.disabled).toBe(true)
    expect(paladin.title).toContain('Sacred Fist is an archetype of Paladin')
  })

  it('blocks a second archetype of the same base class', async () => {
    const mod = await import('../components/builder/ClassSelector')
    const build = fighterBuild()
    build.levelClasses = Array.from({ length: 20 }, (_, i) => (i < 4 ? 'Dragon Lord' : ''))
    build.classes = [
      { name: 'Dragon Lord', levels: 4 },
      { name: '', levels: 0 },
      { name: '', levels: 0 },
    ]
    const container = await mount(React.createElement(mod.default), build)
    const ironVanguard = paletteTile(container, 'Iron Vanguard')
    expect(ironVanguard.disabled).toBe(true)
    expect(ironVanguard.title).toContain('Dragon Lord is also a Fighter archetype')
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
