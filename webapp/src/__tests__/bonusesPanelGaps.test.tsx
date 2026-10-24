// @vitest-environment jsdom
//
// The Bonuses pane (V2 BonusesPane.cpp) shows, per watched stat, which bonus
// types the build has a source for, so a missing Quality Intelligence or
// Insightful weapon damage stands out. Empty cells open Find Gear with the
// matching effect search.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { loadItems, loadItemBuffs } from '../server/dataLoaders'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider, useDocument } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'
import { resetGearItemCacheForTests } from '../hooks/useGearItems'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, CharacterDocument } from '../types/ddo'
import { emptyDocument, findActiveLife, setMonitoredBonuses } from '../lib/multiLife'
import {
  BONUSES_PANE_COLUMNS, DEFAULT_BONUS_WATCH_LIST, MONITORED_BONUS_KEYS,
  bonusTypeCell, gearSearchPhrase,
} from '../lib/bonusesTable'
import type { BuildStats } from '../lib/buildStats'
import BonusesPanel from '../components/bonuses/BonusesPanel'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('bonusTypeCell', () => {
  const stats = {
    resolve: () => ({
      total: 0,
      bonuses: [
        { value: 3, type: 'Quality', source: 'Gloves', fromGear: true, active: true },
        { value: 2, type: 'Quality', source: 'Some Feat', active: true },
        { value: 1, type: 'Insightful', source: 'Weaker Ring', fromGear: true, active: false },
        { value: 5, type: 'Competence ', source: 'Marksmanship', active: true },
      ],
    }),
  } as unknown as BuildStats

  it('sums every active source by default', () => {
    expect(bonusTypeCell(stats, 'x', 'Quality', false).value).toBe(5)
    expect(bonusTypeCell(stats, 'x', 'Quality', false).sources.map(s => s.source)).toEqual(['Gloves', 'Some Feat'])
  })

  it('counts items only in gear-only mode (V2 GetEffectValue(type, true))', () => {
    expect(bonusTypeCell(stats, 'x', 'Quality', true).value).toBe(3)
  })

  it('ignores suppressed bonuses and folds "Competence " into Competence', () => {
    expect(bonusTypeCell(stats, 'x', 'Insightful', false).value).toBe(0)
    expect(bonusTypeCell(stats, 'x', 'Competence', false).value).toBe(5)
  })
})

describe('Bonuses pane data', () => {
  it('has Legendary as an extra pane column, like V2', () => {
    expect(BONUSES_PANE_COLUMNS).toHaveLength(11)
    expect(BONUSES_PANE_COLUMNS[10]).toBe('Legendary')
  })

  it('every default row maps to a stat', () => {
    for (const name of DEFAULT_BONUS_WATCH_LIST) expect(MONITORED_BONUS_KEYS[name]).toBeTruthy()
    expect(MONITORED_BONUS_KEYS['Weapon Damage']).toBe('melee.damage')
  })

  it('builds Find Gear searches with the item effect names', () => {
    expect(gearSearchPhrase('Weapon Damage', 'Insightful')).toBe('insightful deadly')
    expect(gearSearchPhrase('Intelligence', 'Profane')).toBe('profane intelligence')
    expect(gearSearchPhrase('Fire Spell Power', 'Quality')).toBe('quality combustion')
  })

  it('setMonitoredBonuses writes the active life only', () => {
    const doc = emptyDocument()
    const next = setMonitoredBonuses(doc, ['Strength', 'PRR'])
    expect(findActiveLife(next)?.monitoredBonuses).toEqual(['Strength', 'PRR'])
    expect(findActiveLife(doc)?.monitoredBonuses).toEqual([])
  })
})

let cat: Record<string, unknown[]> = {}
let docRef: CharacterDocument | null = null

function installFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const key = url.pathname.replace(/^\/api\//, '')
    const data = key === 'item'
      ? (cat.items as Array<Record<string, unknown>>).find(i => i.Name === url.searchParams.get('name')) ?? null
      : cat[key] ?? []
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

function LoadBuild({ build, children }: { build: CharacterBuild; children: React.ReactNode }) {
  const { dispatch } = useCharacter()
  const { doc } = useDocument()
  docRef = doc
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? React.createElement(React.Fragment, null, children) : null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
}

async function renderPanel(build: CharacterBuild): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, { build }, React.createElement(BonusesPanel)),
          ),
        ),
      ),
    )
  })
  await settle()
  mounted.push({ root, container })
  return container
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
  docRef = null
  document.body.innerHTML = ''
  resetStaticBundleForTests()
  resetGearItemCacheForTests()
})

function rowCells(container: HTMLElement, stat: string): Record<string, HTMLTableCellElement> {
  const row = Array.from(container.querySelectorAll('tbody tr'))
    .find(tr => tr.querySelector('th')?.textContent === stat)
  if (!row) throw new Error(`no row ${stat}`)
  const tds = Array.from(row.querySelectorAll('td')).slice(0, BONUSES_PANE_COLUMNS.length)
  return Object.fromEntries(BONUSES_PANE_COLUMNS.map((t, i) => [t, tds[i]]))
}

describe.runIf(haveData)('Bonuses pane', () => {
  beforeAll(() => {
    cat = { items: loadItems(DATA_DIR), 'item-buffs': loadItemBuffs(DATA_DIR) }
    installFetchMock()
  })

  it('shows the Quality Intelligence a worn item gives and flags Profane as a gap', async () => {
    const build = { ...emptyBuild(), gear: { Gloves: 'Intricate Magegloves' } } as CharacterBuild
    const container = await renderPanel(build)

    const int = rowCells(container, 'Intelligence')
    expect(int.Quality.textContent).toBe('+1')
    expect(int.Quality.title).toContain('Intricate Magegloves')
    expect(int.Profane.querySelector('button')).not.toBeNull()

    // A gap opens Find Gear with the matching effect search.
    await act(async () => { int.Profane.querySelector('button')!.click() })
    await settle()
    const inputs = Array.from(document.body.querySelectorAll('input')) as HTMLInputElement[]
    expect(inputs.some(i => i.value === 'profane intelligence')).toBe(true)
  })

  it('shows weapon damage bonus types (Deadly) and flags a missing Insightful one', async () => {
    const build = { ...emptyBuild(), gear: { Cloak: "Architect's Cloak" } } as CharacterBuild
    const container = await renderPanel(build)
    const dmg = rowCells(container, 'Weapon Damage')
    expect(dmg.Quality.textContent).toBe('+2')
    expect(dmg.Competence.textContent).toBe('+7')
    expect(dmg.Insightful.querySelector('button')).not.toBeNull()
  })

  it('adds a watched stat to the life', async () => {
    const container = await renderPanel(emptyBuild())
    const select = container.querySelector('select[aria-label="Add a stat"]') as HTMLSelectElement
    await act(async () => {
      select.value = 'Fire Spell Power'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(findActiveLife(docRef!)?.monitoredBonuses).toEqual([...DEFAULT_BONUS_WATCH_LIST, 'Fire Spell Power'])
    expect(rowCells(container, 'Fire Spell Power').Quality.querySelector('button')).not.toBeNull()
  })
})
