// @vitest-environment jsdom
//
// D8b: V2 Build::VerifyGear (Build.cpp:2648-2690) runs after race, class and
// level edits, unequipping any item whose MinLevel exceeds the character
// level or whose <Requirements> the edited build no longer meets. It never
// runs at load, so a loaded build keeps such gear (D8, PR #269).

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'
import { resetGearItemCacheForTests } from '../hooks/useGearItems'
import GearVerifier from '../components/builder/GearVerifier'
import { emptyBuild, type CharacterBuild } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const RACES = [{ Name: 'Dwarf' }, { Name: 'Human' }]
const CLASSES = [{ Name: 'Fighter' }]
const ITEMS: Record<string, unknown> = {
  'Dwarven Bracers': {
    Name: 'Dwarven Bracers', MinLevel: 1,
    Requirements: { Requirement: [{ Type: 'Race', Item: ['Dwarf'] }] },
  },
  'Level Five Ring': { Name: 'Level Five Ring', MinLevel: 5 },
  'Plain Cloak': { Name: 'Plain Cloak', MinLevel: 1 },
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  let body: unknown = []
  if (url.pathname.endsWith('/races')) body = RACES
  else if (url.pathname.endsWith('/classes')) body = CLASSES
  else if (url.pathname.endsWith('/item')) body = ITEMS[url.searchParams.get('name') ?? ''] ?? null
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

const LOADED: CharacterBuild = {
  ...emptyBuild(),
  race: 'Dwarf',
  classes: [{ name: 'Fighter', levels: 6 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
  levelClasses: Array.from({ length: 6 }, () => 'Fighter'),
  totalLevel: 6,
  epicLevels: 0,
  legendaryLevels: 0,
  gear: { Bracers: 'Dwarven Bracers', Ring1: 'Level Five Ring', Cloak: 'Plain Cloak' },
}

let api: ReturnType<typeof useCharacter> | null = null
function Grab() { api = useCharacter(); return null }

let mounted: Array<{ root: Root; container: HTMLElement }> = []
beforeEach(() => { resetStaticBundleForTests(); resetGearItemCacheForTests(); api = null })
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
}

async function mountWith(build: CharacterBuild) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(Grab),
            React.createElement(GearVerifier),
          ),
        ),
      ),
    )
  })
  mounted.push({ root, container })
  await act(async () => { api!.dispatch({ type: 'LOAD_BUILD', build }) })
  await settle()
}

describe('D8b: gear that stops meeting its requirements is unequipped on edit', () => {
  it('loading a build keeps gear it fails (V2 runs no VerifyGear at load)', async () => {
    await mountWith({ ...LOADED, race: 'Human' })
    expect(api!.build.gear.Bracers).toBe('Dwarven Bracers')
  })

  it('changing race unequips an item whose race requirement now fails', async () => {
    await mountWith(LOADED)
    await act(async () => { api!.dispatch({ type: 'SET_RACE', race: 'Human' }) })
    await settle()
    expect(api!.build.gear.Bracers).toBeUndefined()
    expect(api!.build.gear.Ring1).toBe('Level Five Ring')
    expect(api!.build.gear.Cloak).toBe('Plain Cloak')
  })

  it('lowering the level unequips an item above the new level', async () => {
    await mountWith(LOADED)
    await act(async () => { api!.dispatch({ type: 'SET_LEVEL_CLASSES', levels: ['Fighter', 'Fighter', 'Fighter'] }) })
    await settle()
    expect(api!.build.gear.Ring1).toBeUndefined()
    expect(api!.build.gear.Bracers).toBe('Dwarven Bracers')
    expect(api!.build.gear.Cloak).toBe('Plain Cloak')
  })
})
