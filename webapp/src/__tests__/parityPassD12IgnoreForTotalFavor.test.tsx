// @vitest-environment jsdom
/**
 * Parity pass — D12: `Quest.IgnoreForTotalFavor` flag (PARITY_TODO
 * "Medium-priority remaining › Data-file edge cases").
 *
 * V2 `Quest.h:62` (`DL_FLAG(_, IgnoreForTotalFavor)`) + `DDOBuilder.cpp:1136-1144`
 * (`CDDOBuilderApp::LoadQuests`) excludes flagged duplicate quest entries from
 * both the per-patron and grand "Total Favor" MAX-favor tallies, so a quest
 * that appears more than once (`Quests.xml`'s "Devil Assault (Normal)" and
 * "Devil Assault (Hard)", each `Favor=5`, both flagged — only "Devil Assault
 * (Elite)" counts) isn't double-counted in the favor denominator.
 *
 * `<IgnoreForTotalFavor/>` is a presence-only XML flag — the parser delivers
 * it as `""`, which is falsy — so `loadQuests` must promote it to an explicit
 * `true`, the same pattern already applied to `DoNotShow`/`NoPastLife`/etc.
 * (D11). Without that normalisation AND without `FavorPanel.tsx` reading it,
 * every quest's `Favor` is summed unconditionally into the "available"
 * denominator, overstating The Coin Lords' (and the grand total's) max favor
 * by the full value of every flagged duplicate.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import {
  loadClasses, loadRaces, loadFeats, loadPatrons, loadQuests, loadChallenges,
} from '../server/dataLoaders'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'
import FavorPanel from '../components/favor/FavorPanel'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe.skipIf(!haveData)('D12 — Quest.IgnoreForTotalFavor normalisation', () => {
  it('normalises <IgnoreForTotalFavor/> to boolean true on the flagged Devil Assault duplicates', () => {
    const quests = loadQuests(DATA_DIR)
    const normal = quests.find(q => q.Name === 'Devil Assault (Normal)')
    const hard = quests.find(q => q.Name === 'Devil Assault (Hard)')
    const elite = quests.find(q => q.Name === 'Devil Assault (Elite)')
    expect(normal?.IgnoreForTotalFavor).toBe(true)
    expect(hard?.IgnoreForTotalFavor).toBe(true)
    expect(elite?.IgnoreForTotalFavor).toBeUndefined()
  })

  it('leaves ordinary quests without the flag', () => {
    const quests = loadQuests(DATA_DIR)
    const flagged = quests.filter(q => q.IgnoreForTotalFavor)
    // V2's Quests.xml carries exactly 2 <IgnoreForTotalFavor/> entries.
    expect(flagged.length).toBe(2)
  })
})

let cat: Record<string, unknown[]> = {}

function installFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const key = url.pathname.replace(/^\/api\//, '')
    let data = cat[key] ?? []
    const acquire = url.searchParams.get('acquire')
    if (key === 'feats' && acquire) {
      data = (cat.feats as Array<Record<string, unknown>>).filter(f => f.Acquire === acquire)
    }
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

function LoadBuild({ build, children }: { build: CharacterBuild; children: React.ReactNode }) {
  const { dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? React.createElement(React.Fragment, null, children) : null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []

async function renderPanel(element: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const build: CharacterBuild = {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Rogue', levels: 5 }],
    levelClasses: Array.from({ length: 5 }, () => 'Rogue'),
    totalLevel: 5,
  }
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, { build }, element),
          ),
        ),
      ),
    )
  })
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
  mounted.push({ root, container })
  return container
}

function patronHeader(container: HTMLElement, name: string): Element {
  const header = Array.from(container.querySelectorAll('[class*=patronHeader]'))
    .find(d => (d.textContent ?? '').includes(name))
  if (!header) throw new Error(`no patron card for ${name}`)
  return header
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

describe.runIf(haveData)('Favor panel — IgnoreForTotalFavor duplicate exclusion', () => {
  beforeAll(() => {
    cat = {
      classes: loadClasses(DATA_DIR),
      races: loadRaces(DATA_DIR),
      feats: loadFeats(DATA_DIR),
      patrons: loadPatrons(DATA_DIR),
      quests: loadQuests(DATA_DIR),
      challenges: loadChallenges(DATA_DIR),
    }
    installFetchMock()
  })

  it('excludes flagged Devil Assault duplicates from The Coin Lords’ max-favor denominator', async () => {
    const quests = loadQuests(DATA_DIR)
    const coinLordsQuests = quests.filter(q => q.Patron === 'The Coin Lords')
    const naiveTotal = coinLordsQuests.reduce((sum, q) => sum + (q.Favor ?? 0), 0)
    const v2Total = coinLordsQuests
      .filter(q => !q.IgnoreForTotalFavor)
      .reduce((sum, q) => sum + (q.Favor ?? 0), 0)
    // Sanity: the two flagged Devil Assault entries (Favor 5 each) really do
    // change the total, so this test would fail loudly if data drifted.
    expect(naiveTotal - v2Total).toBe(10)

    const container = await renderPanel(React.createElement(FavorPanel))
    const header = patronHeader(container, 'The Coin Lords')
    const shown = /(\d+) \/ (\d+) favor/.exec(header.textContent ?? '')
    expect(shown).not.toBeNull()
    expect(Number(shown![2])).toBe(v2Total)
    expect(Number(shown![2])).not.toBe(naiveTotal)
  })
})
