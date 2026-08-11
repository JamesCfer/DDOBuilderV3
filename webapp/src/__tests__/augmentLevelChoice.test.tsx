// @vitest-environment jsdom
//
// Augment tier selection (V2 ItemAugment::SelectedLevelIndex): the gem
// augments carry a <Levels> table — "Sapphire of Defense" is +3 at item level
// 1 and +36 at 32 — and V2 shows a level combo for them
// (ItemSelectDialog::PopulateAugmentList, ItemSelectDialog.cpp:559-588).
// V3 stored the index (imported it, exported it, applied it in buildStats) but
// had no way to SET it. Also covers the augment picker's search box.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { loadItems, loadAugments } from '../server/dataLoaders'
import {
  augmentLevels, augmentLevelOptions, bestAugmentLevelIndex, hasSelectableLevels,
  augmentValueAtIndex,
} from '../lib/itemDisplay'
import { reducer } from '../context/CharacterContext'
import { emptyBuild, type Augment } from '../types/ddo'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'
import GearPanel from '../components/items/GearPanel'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Sapphire of Defense — the user-facing example: pick the augment, then pick
// the level (1 → +3, 4 → +8, 8 → +12, …).
const SAPPHIRE = {
  Name: 'Sapphire of Defense',
  Description: 'Physical and Magical Resistance Rating',
  Type: ['Blue', 'Purple', 'Green'],
  ChooseLevel: '',
  Levels: { '#text': '1 4 8 12 16 20 24 28 32', size: 9 },
  LevelValue: { '#text': '3 8 12 16 20 24 28 32 36', size: 9 },
} as unknown as Augment

describe('augment level tables', () => {
  it('parses the Levels table alongside LevelValue', () => {
    expect(augmentLevels(SAPPHIRE)).toEqual([1, 4, 8, 12, 16, 20, 24, 28, 32])
    expect(hasSelectableLevels(SAPPHIRE)).toBe(true)
  })

  it('only offers tiers the character can reach (V2 caps at build level)', () => {
    const options = augmentLevelOptions(SAPPHIRE, 8)
    expect(options).toEqual([
      { index: 0, level: 1, value: 3 },
      { index: 1, level: 4, value: 8 },
      { index: 2, level: 8, value: 12 },
    ])
  })

  it('defaults to the best tier available at the level', () => {
    expect(bestAugmentLevelIndex(SAPPHIRE, 8)).toBe(2)
    expect(bestAugmentLevelIndex(SAPPHIRE, 34)).toBe(8)
    // Nothing usable yet — fall back to the lowest tier rather than crashing.
    expect(bestAugmentLevelIndex(SAPPHIRE, 0)).toBe(0)
  })

  it('reads the value at a stored index, clamped', () => {
    expect(augmentValueAtIndex(SAPPHIRE, 2)).toBe(12)
    expect(augmentValueAtIndex(SAPPHIRE, 99)).toBe(36)
  })

  it('treats a Cannith-style table (no Levels) as not player-selectable', () => {
    expect(hasSelectableLevels({
      Name: 'x', Type: 'Colorless', LevelValue: '1 2 3',
    } as unknown as Augment)).toBe(false)
  })
})

describe('augment level reducer', () => {
  const KEY = 'Bracers:Blue:0'

  it('stores the selected tier', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_AUGMENT', key: KEY, augmentName: 'Sapphire of Defense', levelIndex: 2 })
    expect(b.augmentLevelChoices?.[KEY]).toBe(2)
    b = reducer(b, { type: 'SET_AUGMENT_LEVEL', key: KEY, levelIndex: 5 })
    expect(b.augmentLevelChoices?.[KEY]).toBe(5)
  })

  it('drops the tier when the augment is swapped or cleared', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_AUGMENT', key: KEY, augmentName: 'Sapphire of Defense', levelIndex: 5 })
    // A replacement with no tiers of its own must not inherit the old index.
    b = reducer(b, { type: 'SET_AUGMENT', key: KEY, augmentName: 'Topaz of Striding' })
    expect(b.augmentLevelChoices?.[KEY]).toBeUndefined()

    b = reducer(b, { type: 'SET_AUGMENT', key: KEY, augmentName: 'Sapphire of Defense', levelIndex: 5 })
    b = reducer(b, { type: 'CLEAR_AUGMENT', key: KEY })
    expect(b.augmentLevelChoices?.[KEY]).toBeUndefined()
  })

  it('drops the tier when the host item changes', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_AUGMENT', key: KEY, augmentName: 'Sapphire of Defense', levelIndex: 5 })
    b = reducer(b, { type: 'SET_GEAR', slot: 'Bracers', itemName: 'Something Else' })
    expect(b.augmentLevelChoices?.[KEY]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------

const ITEM = 'Legendary Bracers of Method and Magic'

function EquipBracers({ children }: { children: React.ReactNode }) {
  const { dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'SET_GEAR', slot: 'Bracers', itemName: ITEM })
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
  resetStaticBundleForTests()
})

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe.runIf(haveData)('augment picker search and level select', () => {
  beforeAll(() => {
    const cat = { items: loadItems(DATA_DIR), augments: loadAugments(DATA_DIR) }
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const key = url.pathname.replace(/^\/api\//, '')
      let data: unknown = []
      if (key === 'items') {
        const slot = url.searchParams.get('slot')
        data = slot
          ? (cat.items as Array<Record<string, unknown>>).filter(i => {
            const s = i.EquipmentSlot as Record<string, unknown> | undefined
            return s && slot in s
          })
          : cat.items
      } else if (key === 'item') {
        data = (cat.items as Array<Record<string, unknown>>)
          .find(i => i.Name === url.searchParams.get('name')) ?? null
      } else if (key === 'augments') {
        const type = url.searchParams.get('type')
        data = type
          ? (cat.augments as Array<Record<string, unknown>>).filter(a => {
            const t = a.Type
            return Array.isArray(t) ? t.includes(type) : t === type
          })
          : cat.augments
      }
      return new Response(JSON.stringify(data), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
  })

  async function renderGear() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(
        <CharacterProvider>
          <DocumentProvider>
            <SettingsProvider>
              <EquipBracers><GearPanel /></EquipBracers>
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

  /** Opens the bracers' Blue augment slot picker. */
  async function openBlueSlot(container: HTMLElement) {
    const rows = Array.from(container.querySelectorAll('[class*="augRow"]'))
    const blueRow = rows.find(r => r.querySelector('[class*="augType"]')?.textContent === 'Green')
      ?? rows[0]
    const btn = blueRow.querySelector('button[class*="augSelector"]') as HTMLButtonElement
    await act(async () => { btn.click() })
    for (let i = 0; i < 4; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
    return blueRow as HTMLElement
  }

  it('filters the augment list as you type', async () => {
    const container = await renderGear()
    const row = await openBlueSlot(container)

    const before = row.querySelectorAll('[role="option"]').length
    expect(before).toBeGreaterThan(5)

    const search = row.querySelector('input[class*="augSearch"]') as HTMLInputElement
    expect(search).toBeTruthy()
    await act(async () => { setInput(search, 'Sapphire of Defense') })

    const names = Array.from(row.querySelectorAll('[role="option"]')).map(o => o.textContent ?? '')
    expect(names.length).toBeLessThan(before)
    expect(names.some(n => n.includes('Sapphire of Defense'))).toBe(true)
  })

  it('offers a level select for a tiered augment and applies the pick', async () => {
    const container = await renderGear()
    const row = await openBlueSlot(container)

    const search = row.querySelector('input[class*="augSearch"]') as HTMLInputElement
    await act(async () => { setInput(search, 'Sapphire of Defense') })
    const option = Array.from(row.querySelectorAll('[role="option"]'))
      .find(o => o.textContent?.includes('Sapphire of Defense')) as HTMLButtonElement
    expect(option).toBeTruthy()
    await act(async () => { option.click() })

    const select = row.querySelector('select[class*="augLevelSelect"]') as HTMLSelectElement
    expect(select).toBeTruthy()
    // Defaults to the best tier the character's level allows, not the weakest.
    expect(Number(select.value)).toBeGreaterThan(0)
    expect(select.options[0].textContent).toBe('Lv 1 (+3)')
    expect(Array.from(select.options).some(o => o.textContent === 'Lv 8 (+12)')).toBe(true)

    // Pick level 8 explicitly.
    const lv8 = Array.from(select.options).findIndex(o => o.textContent === 'Lv 8 (+12)')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
      setter.call(select, String(select.options[lv8].value))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const after = row.querySelector('select[class*="augLevelSelect"]') as HTMLSelectElement
    expect(after.options[after.selectedIndex].textContent).toBe('Lv 8 (+12)')
  })
})
