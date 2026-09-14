// The pure half of the windowed interface: snapping, canvas extent, free-spot
// search, tidy, the default layouts and the storage format.

import { describe, it, expect } from 'vitest'
import {
  snap, snapRect, canvasExtent, findFreeSpot, stackOrder, tidyWindows,
  addWindow, removeWindow, patchWindow, toggleMaximize,
  defaultLayout, defaultWorkspaces, parseLayout, serializeLayout,
  PAGES, MIN_WINDOW_W, MIN_WINDOW_H,
  type WindowState, type Workspace,
} from '../lib/workspace'
import { WINDOW_REGISTRY } from '../components/workspace/registry'

const win = (id: string, x: number, y: number, w = 240, h = 160): WindowState =>
  ({ id, panel: 'Stats', x, y, w, h, zoom: 'auto' })

describe('snapping', () => {
  it('rounds to the nearest grid line', () => {
    expect(snap(0, 24)).toBe(0)
    expect(snap(11, 24)).toBe(0)
    expect(snap(13, 24)).toBe(24)
    expect(snap(100, 24)).toBe(96)
    expect(snap(37, 1)).toBe(37)
  })

  it('snaps a rectangle and keeps it on the canvas above the minimum size', () => {
    const r = snapRect({ x: -10, y: 13, w: 50, h: 20 }, 24)
    expect(r.x).toBe(0)
    expect(r.y).toBe(24)
    expect(r.w).toBe(MIN_WINDOW_W)
    expect(r.h).toBe(MIN_WINDOW_H)
    expect(snapRect({ x: 30, y: 30, w: 500, h: 300 }, 24)).toEqual({ x: 24, y: 24, w: 504, h: 312 })
  })
})

describe('canvas', () => {
  it('grows in both axes past the outermost window', () => {
    const e = canvasExtent([win('a', 0, 0), win('b', 3000, 10), win('c', 10, 2000)], 100)
    expect(e.width).toBe(3000 + 240 + 100)
    expect(e.height).toBe(2000 + 160 + 100)
  })

  it('counts a rolled-up window as its title bar', () => {
    const e = canvasExtent([{ ...win('a', 0, 0, 240, 900), collapsed: true }], 0)
    expect(e.height).toBe(32)
  })

  it('stacks in reading order: top to bottom, then left to right', () => {
    const order = stackOrder([win('right', 300, 0), win('lower', 0, 200), win('left', 0, 0)])
    expect(order.map(w => w.id)).toEqual(['left', 'right', 'lower'])
  })

  it('finds the first free grid-aligned spot', () => {
    const existing = [win('a', 0, 0, 240, 160)]
    expect(findFreeSpot(existing, { w: 240, h: 160 }, 24, 1000)).toEqual({ x: 240, y: 0 })
    // Nothing fits beside it on a canvas one window wide: go below.
    expect(findFreeSpot(existing, { w: 240, h: 160 }, 24, 300)).toEqual({ x: 0, y: 168 })
    expect(findFreeSpot([], { w: 240, h: 160 }, 24, 300)).toEqual({ x: 0, y: 0 })
  })

  it('tidy packs windows into rows that fit the viewport', () => {
    const tidy = tidyWindows([win('c', 900, 900), win('a', 500, 0), win('b', 0, 0)], 24, 500)
    expect(tidy.map(w => w.id)).toEqual(['b', 'a', 'c'])
    expect(tidy[0]).toMatchObject({ x: 0, y: 0 })
    expect(tidy[1]).toMatchObject({ x: 240, y: 0 })
    expect(tidy[2]).toMatchObject({ x: 0, y: 160 })
  })
})

describe('workspace operations', () => {
  const space: Workspace = { id: 't', name: 'Test', windows: [win('a', 0, 0)] }

  it('adds a window at a free spot and removes it again', () => {
    const added = addWindow(space, 'Feats', { w: 300, h: 200 }, 24, 1200)
    expect(added.windows).toHaveLength(2)
    expect(added.windows[1]).toMatchObject({ panel: 'Feats', x: 240, y: 0, w: 300, h: 200, zoom: 'auto' })
    expect(removeWindow(added, added.windows[1].id).windows).toHaveLength(1)
  })

  it('drops a patch for a window that has been closed', () => {
    // A late ResizeObserver callback from a closed window must not bring it back.
    const closed = removeWindow(space, 'a')
    expect(patchWindow(closed, 'a', { x: 100 })).toBe(closed)
    expect(patchWindow(space, 'a', { x: 100 }).windows[0].x).toBe(100)
  })

  it('maximizes to the viewport and restores', () => {
    const vp = { x: 10, y: 20, w: 1000, h: 700 }
    const max = toggleMaximize(space, 'a', vp)
    expect(max.windows[0]).toMatchObject({ ...vp, prev: { x: 0, y: 0, w: 240, h: 160 } })
    const back = toggleMaximize(max, 'a', vp)
    expect(back.windows[0]).toMatchObject({ x: 0, y: 0, w: 240, h: 160 })
    expect(back.windows[0].prev).toBeUndefined()
  })
})

describe('default layouts', () => {
  it('cover the four pages', () => {
    expect(PAGES).toEqual(['Character', 'Crafting', 'Community', 'Plugins'])
    const layout = defaultLayout()
    for (const page of PAGES) expect(layout[page].length).toBeGreaterThan(0)
  })

  it('give Character its build tabs, gear and combat included', () => {
    const names = defaultWorkspaces('Character').map(w => w.name)
    for (const n of ['Overview', 'Skills', 'Feats', 'Spells', 'Enhancements', 'Gear', 'Combat']) {
      expect(names).toContain(n)
    }
  })

  it('only place windows the registry knows, on the grid, and never overlapping', () => {
    for (const page of PAGES) {
      for (const space of defaultWorkspaces(page)) {
        expect(space.builtin).toBe(true)
        for (const w of space.windows) {
          expect(WINDOW_REGISTRY[w.panel], `${page}/${space.name}: ${w.panel}`).toBeDefined()
          for (const v of [w.x, w.y, w.w, w.h]) expect(v % 24).toBe(0)
        }
        for (const a of space.windows) {
          for (const b of space.windows) {
            if (a === b) continue
            const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
            expect(overlap, `${space.name}: ${a.panel} overlaps ${b.panel}`).toBe(false)
          }
        }
      }
    }
  })

  it('are copies — mutating one does not touch the next', () => {
    const a = defaultWorkspaces('Character')
    a[0].windows.length = 0
    expect(defaultWorkspaces('Character')[0].windows.length).toBeGreaterThan(0)
  })
})

describe('storage format', () => {
  it('round-trips', () => {
    const layout = defaultLayout()
    layout.Character[0].windows[0].x = 480
    layout.Crafting.push({ id: 'custom', name: 'Mine', windows: [win('z', 24, 24)] })
    const back = parseLayout(serializeLayout(layout))
    expect(back).toEqual(layout)
  })

  it('rejects garbage and the wrong version', () => {
    expect(parseLayout(null)).toBeNull()
    expect(parseLayout('{nope')).toBeNull()
    expect(parseLayout(JSON.stringify({ v: 0, layout: {} }))).toBeNull()
    expect(parseLayout(JSON.stringify({ v: 1 }))).toBeNull()
  })

  it('keeps a tab the user emptied, and appends built-in tabs a newer version adds', () => {
    const layout = defaultLayout()
    layout.Character = [{ ...layout.Character[0], windows: [] }]
    const back = parseLayout(serializeLayout(layout))!
    expect(back.Character[0].windows).toEqual([])
    // Every other built-in tab came back, after the one that was stored.
    expect(back.Character.map(t => t.id)).toEqual(defaultWorkspaces('Character').map(t => t.id))
  })

  it('drops malformed windows and falls back per page', () => {
    const raw = JSON.stringify({ v: 1, layout: {
      Crafting: [{ id: 'crafting', name: 'Crafting', windows: [{ panel: 'Notes', x: 0, y: 0, w: 300, h: 200 }, { nope: true }] }],
      Plugins: 'not a list',
    } })
    const back = parseLayout(raw)!
    expect(back.Crafting[0].windows).toHaveLength(1)
    expect(back.Crafting[0].windows[0]).toMatchObject({ panel: 'Notes', zoom: 'auto' })
    expect(back.Plugins).toEqual(defaultWorkspaces('Plugins'))
  })
})
