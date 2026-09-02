// @vitest-environment jsdom
//
// 1. Optimizer objectives come from the Analysis breakdowns, so anything you
//    can read there is something you can optimize for.
// 2. The breakdown hover tooltip stays on screen — it used to be pinned at
//    cursor + 14px with no regard for the viewport, which puts it off the
//    right edge for every row in the Analysis rail.
// 3. The Plugins page exists in the nav.

import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { OPTIMIZER_STATS, optimizerStatsFromSections } from '../lib/optimizer/objective'
import { Tooltip } from '../components/breakdowns/statRows'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// Objectives from the breakdown sections
// ---------------------------------------------------------------------------

describe('optimizer objectives from Analysis', () => {
  const sections = [
    {
      title: 'Defense',
      rows: [
        { label: 'Hit Points', statKey: 'hp' },
        { label: 'Ghost Touch', statKey: 'ghostTouch' },      // not in the curated list
        { label: 'vs Poison' },                               // composite — no single key
      ],
    },
    {
      title: 'Energy Resistance & DR',
      rows: [
        { label: 'Fire Absorption', statKey: 'absorption.Fire' },
        { label: 'Cold Resistance', statKey: 'resist.Cold' },
      ],
    },
  ]

  const stats = optimizerStatsFromSections(sections)
  const keys = new Set(stats.map(s => s.key))

  it('adds every keyed breakdown row', () => {
    expect(keys.has('ghostTouch')).toBe(true)
    expect(keys.has('absorption.Fire')).toBe(true)
    expect(keys.has('resist.Cold')).toBe(true)
  })

  it('labels and groups new stats from the section they came from', () => {
    const fire = stats.find(s => s.key === 'absorption.Fire')!
    expect(fire.label).toBe('Fire Absorption')
    expect(fire.group).toBe('Energy Resistance & DR')
  })

  it('skips rows with no single stat behind them', () => {
    expect(stats.some(s => s.label === 'vs Poison')).toBe(false)
  })

  it('keeps the curated entries, and their curated group, over section ones', () => {
    for (const curated of OPTIMIZER_STATS) expect(keys.has(curated.key)).toBe(true)
    // 'hp' is curated as Defense/"Hit Points" — not redefined by the section.
    const hp = stats.filter(s => s.key === 'hp')
    expect(hp).toHaveLength(1)
    expect(hp[0].label).toBe('Hit Points')
  })

  it('is a superset of the curated list', () => {
    expect(stats.length).toBeGreaterThan(OPTIMIZER_STATS.length)
  })
})

// ---------------------------------------------------------------------------
// Tooltip placement
// ---------------------------------------------------------------------------

let mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

/** jsdom gives every element a zero rect; fake a real tooltip size. */
function withSize(w: number, h: number) {
  Object.defineProperty(HTMLDivElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() { return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON() {} } },
  })
}

async function renderTip(x: number, y: number, openLeft = false) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(React.createElement(Tooltip, {
      tip: { label: 'Hit Points', display: '351', bonuses: [], x, y },
      onHide: () => {},
      openLeft,
    }))
  })
  mounted.push({ root, container })
  return container.firstElementChild as HTMLElement
}

describe('breakdown tooltip placement', () => {
  const VW = 1200
  const VH = 800

  beforeAll(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: VW })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VH })
    withSize(340, 300)
  })

  it('opens to the right of the cursor when there is room', async () => {
    const el = await renderTip(200, 100)
    expect(parseFloat(el.style.left)).toBe(214)
  })

  it('flips to the left instead of running off the right edge', async () => {
    // A row in the right-hand Analysis rail: 340px of tooltip will not fit.
    const el = await renderTip(VW - 40, 100)
    const left = parseFloat(el.style.left)
    expect(left).toBeLessThan(VW - 40)
    expect(left + 340).toBeLessThanOrEqual(VW)
  })

  it('never places the box off the left edge either', async () => {
    const el = await renderTip(10, 100, true)
    expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(0)
  })

  it('slides up so a tall tooltip stays on screen', async () => {
    const el = await renderTip(200, VH - 20)
    const top = parseFloat(el.style.top)
    expect(top + 300).toBeLessThanOrEqual(VH)
    expect(top).toBeGreaterThanOrEqual(0)
  })

  it('caps its height to the viewport so a long list scrolls', async () => {
    withSize(340, 5000)
    const el = await renderTip(200, 100)
    expect(parseFloat(el.style.maxHeight)).toBeLessThanOrEqual(VH)
    withSize(340, 300)
  })
})

// ---------------------------------------------------------------------------
// Plugins page
// ---------------------------------------------------------------------------

describe('Plugins page', () => {
  it('is a top-level destination', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const src = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8')
    const pages = src.match(/const PAGES: Page\[\] = \[(.*?)\]/s)?.[1] ?? ''
    expect(pages).toContain("'Plugins'")
    expect(src).toMatch(/case 'Plugins\//)
  })

  it('renders its empty state without inventing plugins', async () => {
    const mod = await import('../components/plugins/PluginsPanel')
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(React.createElement(mod.default))
    })
    mounted.push({ root, container })
    expect(container.textContent).toContain('DDO Plugins')
    // Nothing is fetched in this environment, so no plugin card, download link
    // or version is invented — only the DungeonHelper explainer link stands.
    expect(container.textContent).toContain('Loading the plugin catalogue')
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelectorAll('a')[0].getAttribute('href'))
      .toBe('https://www.dungeonhelper.com/')
    // The page never credits a plugin to an individual account name.
    expect(container.textContent).not.toMatch(/\bby [A-Z]/)
  })
})
