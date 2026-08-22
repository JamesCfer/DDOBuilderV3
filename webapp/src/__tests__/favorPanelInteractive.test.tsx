// @vitest-environment jsdom
//
// The Favor page owns favor now.
//
//  1. Every patron card showed "0/0 quests" and expanded to an empty list, so
//     there was nothing on the page to click. `<Patron>` is on the XML
//     parser's isArray list (Patrons.xml's root is a list of them), so each
//     quest's single patron arrived as a ONE-ELEMENT ARRAY; the panel keyed
//     its grouping map by that array, and an array key matches no patron
//     name. The loaders now flatten it to the string the field means.
//  2. The patron reward feats (V2 SpecialFeatsPane "Favor" group,
//     FeatAcquisition_Favor) were edited on the Past Lives panel, three tabs
//     from the favor that earns them. They live on the Favor page now, one
//     stepper per patron, next to that patron's tiers.

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
import PastLivesPanel from '../components/pastlives/PastLivesPanel'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

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

/** The clickable header row of one patron's card. */
function patronHeader(container: HTMLElement, name: string): Element {
  const header = Array.from(container.querySelectorAll('[class*=patronHeader]'))
    .find(d => (d.textContent ?? '').includes(name))
  if (!header) throw new Error(`no patron card for ${name}`)
  return header
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

describe.runIf(haveData)('quest patron loading', () => {
  it('gives each quest a plain patron name, not a one-element array', () => {
    const quests = loadQuests(DATA_DIR)
    expect(quests.length).toBeGreaterThan(0)
    for (const q of quests) {
      expect(Array.isArray(q.Patron), `${q.Name} patron`).toBe(false)
    }
    const patronNames = new Set(loadPatrons(DATA_DIR).map(p => p.Name))
    // The great majority of quests belong to a patron the panel can group under
    // ("None" covers the rest).
    const grouped = quests.filter(q => q.Patron && patronNames.has(q.Patron))
    expect(grouped.length).toBeGreaterThan(400)
  })

  it('flattens challenge patrons the same way', () => {
    for (const c of loadChallenges(DATA_DIR)) {
      expect(Array.isArray(c.Patron), `${c.Name} patron`).toBe(false)
    }
  })
})

describe.runIf(haveData)('Favor panel', () => {
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

  it('lists each patron’s quests instead of an empty card', async () => {
    const container = await renderPanel(React.createElement(FavorPanel))
    const text = container.textContent ?? ''
    expect(text).toContain('The Coin Lords')
    // no patron card is left with an empty quest list
    expect(text).not.toContain('0/0 quests')
    // expanding a patron reveals tickable quests
    const header = patronHeader(container, 'The Coin Lords')
    await click(header)
    expect(container.querySelectorAll('input[type=checkbox]').length).toBeGreaterThan(0)
  })

  it('counts a ticked quest toward that patron’s favor and the total', async () => {
    const container = await renderPanel(React.createElement(FavorPanel))
    await click(patronHeader(container, 'The Coin Lords'))
    const boxes = Array.from(container.querySelectorAll('input[type=checkbox]'))
    const before = container.textContent ?? ''
    expect(before).toMatch(/Total Favor0 \//)
    await click(boxes[0])
    const after = container.textContent ?? ''
    expect(after).not.toMatch(/Total Favor0 \//)
  })

  it('claims and un-claims a patron’s reward ranks', async () => {
    const container = await renderPanel(React.createElement(FavorPanel))
    const plus = container.querySelector('button[aria-label^="Claim a The Coin Lords"]')!
    const minus = container.querySelector('button[aria-label^="Remove a The Coin Lords"]')!
    expect((minus as HTMLButtonElement).disabled).toBe(true)   // nothing claimed yet
    await click(plus)
    expect(container.textContent).toContain('1/3')
    expect((minus as HTMLButtonElement).disabled).toBe(false)
    await click(minus)
    expect((container.querySelector('button[aria-label^="Remove a The Coin Lords"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('drives the "Total Favor" pseudo-patron off the build’s whole favor sum', async () => {
    const container = await renderPanel(React.createElement(FavorPanel))
    const totalRow = patronHeader(container, 'Total Favor')
    // it owns no quests of its own, so it shows no quest counter to expand
    expect(totalRow.textContent).not.toContain('quests')
    const shown = /Total Favor Rewards(\d+) \/ (\d+) favor/.exec(totalRow.textContent ?? '')
    expect(shown).not.toBeNull()
    const summed = /Total Favor(\d+) \/ (\d+)/.exec(container.textContent ?? '')!
    expect(shown![2]).toBe(summed[2])   // available favor matches the page total
  })

  it('stops claiming at the feat’s MaxTimesAcquire', async () => {
    const container = await renderPanel(React.createElement(FavorPanel))
    // House Cannith Favor Rewards: MaxTimesAcquire 2
    for (let i = 0; i < 4; i++) {
      const plus = container.querySelector('button[aria-label^="Claim a House Cannith"]') as HTMLButtonElement
      if (plus.disabled) break
      await click(plus)
    }
    expect(container.textContent).toContain('2/2')
    expect((container.querySelector('button[aria-label^="Claim a House Cannith"]') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe.runIf(haveData)('Past Lives panel', () => {
  beforeAll(() => {
    cat = {
      classes: loadClasses(DATA_DIR),
      races: loadRaces(DATA_DIR),
      feats: loadFeats(DATA_DIR),
    }
    installFetchMock()
  })

  it('no longer hosts the favor feats', async () => {
    const container = await renderPanel(React.createElement(PastLivesPanel))
    const text = container.textContent ?? ''
    expect(text).not.toContain('Favor Feats')
    expect(text).not.toContain('Favor Rewards')
    // the panel still shows what it owns
    expect(text).toContain('Heroic Past Lives')
  })
})
