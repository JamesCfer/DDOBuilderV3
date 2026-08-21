// @vitest-environment jsdom
//
// Regression: raid 3-piece augment sets never showed in the Set Bonuses panel
// (Equipment/Gear and the dashboard window). The panel counted set pieces from
// the item-name-only /api/item-setbonuses endpoint, which sees no augments, so
// a set granted purely by slotted raid essences was invisible even though the
// stat map applied its effects. The panel now shares `computeSetBonusCounts`
// with the stat map (V2 Build::ApplyItem, Build.cpp:4905-4929).

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { loadItems, loadAugments, loadSetBonuses } from '../server/dataLoaders'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'
import { resetGearItemCacheForTests } from '../hooks/useGearItems'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'
import SetBonusesPanel from '../components/setbonuses/SetBonusesPanel'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

const RAID_AUGMENT = 'Imbued Infusion'
const RAID_SET = 'Imbued Infusion'
/** Real catalogue items with a Colorless augment slot and no set of their own. */
const HOSTS: Record<string, string> = {
  Goggles: 'Black Lace Blindfold',
  Helmet: 'Dragon Masque',
  Necklace: 'Dark Diversion',
}

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let cat: Record<string, unknown[]> = {}

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
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? React.createElement(React.Fragment, null, children) : null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []

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
            React.createElement(LoadBuild, { build }, React.createElement(SetBonusesPanel)),
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

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
  resetStaticBundleForTests()
  resetGearItemCacheForTests()
})

describe.runIf(haveData)('Set Bonuses panel — augment-granted sets', () => {
  beforeAll(() => {
    cat = {
      items: loadItems(DATA_DIR),
      augments: loadAugments(DATA_DIR),
      setbonuses: loadSetBonuses(DATA_DIR),
    }
    installFetchMock()
  })

  /** `slot:augmentType:index` for the item's first Colorless augment slot. */
  function colorlessKey(slot: string, itemName: string): string {
    const item = (cat.items as Array<Record<string, unknown>>).find(i => i.Name === itemName)
    expect(item, `catalogue item ${itemName}`).toBeDefined()
    const raw = item!.ItemAugment
    const slots = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<{ Type?: string }>
    const index = slots.findIndex(a => a?.Type === 'Colorless')
    expect(index, `${itemName} colorless slot`).toBeGreaterThanOrEqual(0)
    return `${slot}:Colorless:${index}`
  }

  it('shows a 3-piece raid essence set with all three pieces counted', async () => {
    const build = emptyBuild()
    for (const [slot, itemName] of Object.entries(HOSTS)) {
      build.gear[slot] = itemName
      build.augmentChoices[colorlessKey(slot, itemName)] = RAID_AUGMENT
    }
    const container = await renderPanel(build)
    const text = container.textContent ?? ''
    expect(text).toContain(RAID_SET)
    expect(text).toContain('3 pieces equipped')
    // the 3-piece tier renders as unlocked
    expect(text).toContain('3pc:')
    expect(text).not.toContain('need 1 more')
  })

  it('shows progress toward the set with only two pieces slotted', async () => {
    const build = emptyBuild()
    const slots = Object.entries(HOSTS).slice(0, 2)
    for (const [slot, itemName] of slots) {
      build.gear[slot] = itemName
      build.augmentChoices[colorlessKey(slot, itemName)] = RAID_AUGMENT
    }
    const container = await renderPanel(build)
    const text = container.textContent ?? ''
    expect(text).toContain(RAID_SET)
    expect(text).toContain('2 pieces equipped')
    expect(text).toContain('need 1 more')
  })
})
