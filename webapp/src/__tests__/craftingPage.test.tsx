// @vitest-environment jsdom
//
// The Crafting page: a top-level destination that stands apart from the
// builder (like Plugins), and whose panels render from the /api/crafting
// catalogue rather than from the open character.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { readFileSync } from 'fs'
import { join } from 'path'

import { resetApiCacheForTests } from '../api'
import { valueAtLevel, parseSlots, formatValue } from '../components/crafting/CannithPlanner'
import type { CraftingSystemSummary, CraftingSystemDetail, CraftingRecipe } from '../server/crafting'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ root: Root; container: HTMLElement }> = []

afterEach(async () => {
  await act(async () => { for (const m of mounted) m.root.unmount() })
  for (const m of mounted) m.container.remove()
  mounted.length = 0
  resetApiCacheForTests()
})

async function mount(element: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(element)
  })
  mounted.push({ root, container })
  return container
}

// ---------------------------------------------------------------------------
// Nav wiring
// ---------------------------------------------------------------------------

describe('Crafting in the nav', () => {
  const src = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8')

  it('is a top-level destination with its own tabs', () => {
    const pages = src.match(/const PAGES: Page\[\] = \[(.*?)\]/s)?.[1] ?? ''
    expect(pages).toContain("'Crafting'")
    expect(src).toMatch(/case 'Crafting\/Systems'/)
    expect(src).toMatch(/case 'Crafting\/Cannith Planner'/)
  })

  it('is standalone — no build rails, exactly like Plugins', () => {
    const standalone = src.match(/const STANDALONE_PAGES = new Set<Page>\(\[(.*?)\]\)/s)?.[1] ?? ''
    expect(standalone).toContain("'Crafting'")
    expect(standalone).toContain("'Plugins'")
    // Both rails must actually be gated on it, or the constant is decoration.
    expect(src).toMatch(/!standalone[\s\S]{0,120}StanceBuffDock/)
    expect(src).toMatch(/!standalone && <ErrorBoundary label="Analysis">/)
  })
})

// ---------------------------------------------------------------------------
// Cannith level tables
// ---------------------------------------------------------------------------

function recipe(over: Partial<CraftingRecipe> = {}): CraftingRecipe {
  return {
    name: 'Balance', description: 'Competence bonus to Balance', minLevel: 0,
    slots: ['Cannith Boots Prefix'], setBonuses: [], unlocks: [],
    levels: [], values: [], scalesWithLevel: false, ...over,
  }
}

describe('Cannith shard values', () => {
  it('reads the table by item level, as V2 does (LevelValue[level - 1])', () => {
    const shard = recipe({ values: [3, 4, 5, 6, 7], scalesWithLevel: true })
    expect(valueAtLevel(shard, 1)).toBe(3)
    expect(valueAtLevel(shard, 3)).toBe(5)
  })

  it('clamps past both ends of the table instead of falling off it', () => {
    const shard = recipe({ values: [3, 4, 5], scalesWithLevel: true })
    expect(valueAtLevel(shard, 0)).toBe(3)
    expect(valueAtLevel(shard, 99)).toBe(5)
  })

  it('takes the best tier at or below the level when the recipe names its levels', () => {
    // The gem-style recipes carry an explicit <Levels> table — there the
    // player picks a tier, so level 10 gets the level-8 tier, not the 12th
    // entry of a per-level table.
    const shard = recipe({ levels: [1, 4, 8, 12], values: [2, 4, 6, 8], scalesWithLevel: true })
    expect(valueAtLevel(shard, 10)).toBe(6)
    expect(valueAtLevel(shard, 12)).toBe(8)
    expect(valueAtLevel(shard, 40)).toBe(8)
  })

  it('has no value to report for a fixed-amount recipe', () => {
    expect(valueAtLevel(recipe(), 20)).toBeNull()
  })

  it('signs a negative value once, not "+-"', () => {
    // Diversion reduces threat: its table is negative all the way down.
    expect(formatValue(-21)).toBe('-21')
    expect(formatValue(20)).toBe('+20')
    expect(formatValue(0)).toBe('+0')
  })
})

// ---------------------------------------------------------------------------
// Cannith slot names → item pickers
// ---------------------------------------------------------------------------

function cannithDetail(types: string[]): CraftingSystemDetail {
  return {
    ...SUMMARY, key: 'cannith', name: 'Cannith Crafting',
    slots: types.map(type => ({ type, recipes: [recipe({ slots: [type] })] })),
  }
}

describe('Cannith slot parsing', () => {
  it('splits a shard slot into source, item and shard kind', () => {
    const [slot] = parseSlots(cannithDetail(['Cannith Boots Prefix']))
    expect(slot).toMatchObject({ source: 'Cannith', kind: 'Boots', part: 'Prefix' })
  })

  it('keeps two-word item names whole', () => {
    // "Rune Arm Prefix" must not be read as an item called "Rune".
    const parsed = parseSlots(cannithDetail(['Cannith Rune Arm Prefix', 'Cannith Rune Arm Extra']))
    expect(parsed.map(p => p.kind)).toEqual(['Rune Arm', 'Rune Arm'])
  })

  it('separates the random-loot tables from the craftable ones', () => {
    const parsed = parseSlots(cannithDetail(['Cannith Ring Prefix', 'Random Ring Prefix']))
    expect(parsed.map(p => p.source).sort()).toEqual(['Cannith', 'Random'])
  })

  it('files a property slot under its item rather than as an item of its own', () => {
    const parsed = parseSlots(cannithDetail([
      'Cannith Shield Prefix', 'Cannith Armor AC Bonus', 'Cannith Tower Shield Max Dex Bonus',
    ]))
    // Only the prefix slot names an item, so it alone defines the vocabulary;
    // "Armor AC Bonus" has no item to belong to and is dropped, while the
    // tower-shield property attaches to Shield with its name kept intact.
    const tower = parsed.find(p => p.type === 'Cannith Tower Shield Max Dex Bonus')
    expect(tower).toMatchObject({ kind: 'Shield', part: null })
    expect(tower!.label).toBe('Tower Shield Max Dex Bonus')
    expect(parsed.some(p => p.kind === 'Tower Shield Max Dex Bonus')).toBe(false)
    expect(parsed.some(p => p.type === 'Cannith Armor AC Bonus')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------

const SUMMARY: CraftingSystemSummary = {
  key: 'greensteel', name: 'Green Steel', category: 'Raid crafting',
  blurb: 'The Shroud.', detail: 'Three tiers per item.',
  where: 'The Shroud altars.', ingredients: 'Shroud ingredients.',
  source: 'The Shroud (Vale of Twilight).', wiki: 'https://ddowiki.com/page/Green_Steel_items',
  files: ['Greensteel_Heroic'], recipeCount: 154, slotCount: 9, minLevel: 11, maxLevel: 11,
}

const DETAIL: CraftingSystemDetail = {
  ...SUMMARY,
  slots: [{
    type: 'Weapon Aspect',
    recipes: [recipe({
      name: 'Dominion', description: 'A tier-three aspect.', minLevel: 11,
      slots: ['Weapon Aspect'], setBonuses: ['Dominion'],
      unlocks: ['Greensteel Weapon Tier 2'],
    })],
  }],
}

function stubFetch(routes: Record<string, unknown>) {
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input)
    const hit = Object.entries(routes).find(([path]) => url.includes(path))
    if (!hit) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response)
    return Promise.resolve({ ok: true, status: 200, json: async () => hit[1] } as Response)
  }) as typeof fetch
}

describe('Crafting hub', () => {
  beforeEach(() => {
    // Longest path first — /api/crafting is a prefix of /api/crafting/greensteel.
    stubFetch({ '/api/crafting/greensteel': DETAIL, '/api/crafting': [SUMMARY] })
  })

  it('lists the systems it was given, grouped by category', async () => {
    const { default: CraftingPanel } = await import('../components/crafting/CraftingPanel')
    const container = await mount(React.createElement(CraftingPanel))
    expect(container.textContent).toContain('Green Steel')
    expect(container.textContent).toContain('Raid crafting')
    expect(container.textContent).toContain('154 recipes')
    expect(container.textContent).toContain('ML 11')
  })

  it('says nothing rather than inventing systems when the feed is empty', async () => {
    stubFetch({ '/api/crafting': [] })
    const { default: CraftingPanel } = await import('../components/crafting/CraftingPanel')
    const container = await mount(React.createElement(CraftingPanel))
    expect(container.textContent).toContain('Crafting')
    expect(container.querySelectorAll('article')).toHaveLength(0)
  })

  it('opens a system onto its slots and the recipes in them', async () => {
    const { default: CraftingPanel } = await import('../components/crafting/CraftingPanel')
    const container = await mount(React.createElement(CraftingPanel))

    const open = [...container.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Green Steel'))!
    await act(async () => { open.click() })

    expect(container.textContent).toContain('Weapon Aspect')
    expect(container.textContent).toContain('The Shroud (Vale of Twilight).')

    // Slot sections start folded; opening one reveals its recipes and the
    // facts that make them plannable (the set bonus, the cascade).
    const slot = [...container.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Weapon Aspect'))!
    await act(async () => { slot.click() })
    expect(container.textContent).toContain('Dominion')
    expect(container.textContent).toContain('Set: Dominion')
    expect(container.textContent).toContain('Unlocks: Greensteel Weapon Tier 2')
  })

  it('searching a system opens every section that matches', async () => {
    const { default: CraftingPanel } = await import('../components/crafting/CraftingPanel')
    const container = await mount(React.createElement(CraftingPanel))
    const open = [...container.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Green Steel'))!
    await act(async () => { open.click() })

    const search = container.querySelector('input[type="search"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(search, 'dominion')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // No second click needed — the hit is on screen already.
    expect(container.textContent).toContain('A tier-three aspect.')
    expect(container.textContent).toContain('1 matching recipe')
  })
})
