// @vitest-environment jsdom
//
// Render smoke test: every V3 panel is mounted with REAL catalogue data (the
// same loaders the server uses) and a real imported V2 build, inside the full
// provider stack. This catches the class of breakage unit tests miss — real
// XML data shapes (fast-xml-parser arrays, {'#text'} wrappers) crashing
// component render (e.g. the FiligreePanel SetBonus-array crash that blanked
// the whole page once any filigree was slotted).

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import {
  loadRaces, loadClasses, loadFeats, loadEnhancementTrees, loadItems,
  loadAugments, loadSetBonuses, loadGuildBuffs, loadStances, loadSpells,
  loadWeaponGroups, loadFiligreeSets, loadFiligreeBonuses,
  loadSelfAndPartyBuffs, loadPatrons, loadQuests, loadSentientGems,
  loadAttackRates, loadBonusTypes, loadChallenges, loadIgnoredList,
  loadAdventurePacks, loadItemBuffs, loadItemClickies,
} from '../server/dataLoaders'
import { importV2Build } from '../lib/v2Import'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import type { CharacterBuild } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')
const haveData = existsSync(DATA_DIR) && existsSync(FIXTURE)

// React 18 act() support flag.
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// fetch mock backed by the real loaders (mirrors server.ts routing)
// ---------------------------------------------------------------------------
type Cat = Record<string, unknown[]>
let cat: Cat = {}

function buildCatalogues(): Cat {
  return {
    races: loadRaces(DATA_DIR),
    classes: loadClasses(DATA_DIR),
    feats: loadFeats(DATA_DIR),
    enhancements: loadEnhancementTrees(DATA_DIR),
    items: loadItems(DATA_DIR),
    augments: loadAugments(DATA_DIR),
    setbonuses: loadSetBonuses(DATA_DIR),
    guildbuffs: loadGuildBuffs(DATA_DIR),
    stances: loadStances(DATA_DIR),
    spells: loadSpells(DATA_DIR),
    weapongroups: loadWeaponGroups(DATA_DIR) as unknown as unknown[],
    filigree: loadFiligreeSets(DATA_DIR),
    'filigree-bonuses': loadFiligreeBonuses(DATA_DIR),
    selfbuffs: loadSelfAndPartyBuffs(DATA_DIR),
    patrons: loadPatrons(DATA_DIR),
    quests: loadQuests(DATA_DIR),
    gems: loadSentientGems(DATA_DIR),
    'attack-rates': loadAttackRates(DATA_DIR),
    'bonus-types': loadBonusTypes(DATA_DIR),
    challenges: loadChallenges(DATA_DIR),
    'ignored-list': loadIgnoredList(DATA_DIR) as unknown as unknown[],
    'adventure-packs': loadAdventurePacks(DATA_DIR) as unknown as unknown[],
    'item-buffs': loadItemBuffs(DATA_DIR),
    'item-clickies': loadItemClickies(DATA_DIR),
  }
}

function routeApi(pathname: string, params: URLSearchParams): unknown {
  const key = pathname.replace(/^\/api\//, '')
  switch (key) {
    case 'health': return { status: 'ok', dataDir: DATA_DIR }
    case 'version': return { version: 'test' }
    case 'feats': {
      let result = cat.feats as Array<Record<string, unknown>>
      const group = params.get('group'); const acquire = params.get('acquire')
      if (group) result = result.filter(f => Array.isArray(f.Group) ? (f.Group as unknown[]).includes(group) : f.Group === group)
      if (acquire) result = result.filter(f => f.Acquire === acquire)
      return result
    }
    case 'items': {
      let result = cat.items as Array<Record<string, unknown>>
      const slot = params.get('slot')
      if (slot) result = result.filter(i => {
        const s = i.EquipmentSlot as Record<string, unknown> | undefined
        return s && slot in s
      })
      return result
    }
    case 'item': return (cat.items as Array<Record<string, unknown>>).find(i => i.Name === params.get('name')) ?? null
    case 'augments': {
      const type = params.get('type')
      const all = cat.augments as Array<Record<string, unknown>>
      return type ? all.filter(a => a.Type === type) : all
    }
    case 'item-setbonuses': {
      const names = (params.get('names') ?? '').split(',').map(n => n.trim()).filter(Boolean)
      const counts = new Map<string, number>()
      for (const name of names) {
        const item = (cat.items as Array<Record<string, unknown>>).find(i => i.Name === name)
        const sb = item?.SetBonus
        for (const t of Array.isArray(sb) ? sb : sb ? [sb] : []) {
          if (typeof t === 'string') counts.set(t, (counts.get(t) ?? 0) + 1)
        }
      }
      return Array.from(counts.entries()).map(([type, count]) => ({ type, count }))
    }
    default:
      if (key in cat) return cat[key]
      return []
  }
}

function installFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const data = routeApi(url.pathname, url.searchParams)
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

// ---------------------------------------------------------------------------
// Render harness
// ---------------------------------------------------------------------------
let importedBuild: CharacterBuild

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

async function renderPanel(element: React.ReactElement): Promise<{ root: Root; container: HTMLElement; errors: unknown[] }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const errors: unknown[] = []
  const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); e.preventDefault() }
  const onRejection = (e: PromiseRejectionEvent) => { errors.push(e.reason) }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  let root!: Root
  try {
    await act(async () => {
      root = createRoot(container)
      root.render(
        React.createElement(CharacterProvider, null,
          React.createElement(DocumentProvider, null,
            React.createElement(SettingsProvider, null,
              React.createElement(LoadBuild, { build: importedBuild }, element),
            ),
          ),
        ),
      )
    })
    // Flush data-loading effects (several rounds: load → setState → render →
    // follow-up loads).
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
  } finally {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
  return { root, container, errors }
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

// ---------------------------------------------------------------------------
// The panels
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
const PANELS: Array<[string, () => Promise<{ default: React.ComponentType<any> }>]> = [
  ['CharacterInfo', () => import('../components/builder/CharacterInfo')],
  ['RaceSelector', () => import('../components/builder/RaceSelector')],
  ['ClassSelector', () => import('../components/builder/ClassSelector')],
  ['AbilityScores', () => import('../components/builder/AbilityScores')],
  ['AbilityLevelUps', () => import('../components/builder/AbilityLevelUps')],
  ['StatsPanel', () => import('../components/builder/StatsPanel')],
  ['FeatSlots', () => import('../components/builder/FeatSlots')],
  ['Skills', () => import('../components/builder/Skills')],
  ['LevelTrainingPanel', () => import('../components/builder/LevelTrainingPanel')],
  ['AutomaticFeats', () => import('../components/builder/AutomaticFeats')],
  ['SpellsPanel', () => import('../components/builder/SpellsPanel')],
  ['TomesPanel', () => import('../components/builder/TomesPanel')],
  ['EnhancementTreePanel', () => import('../components/enhancements/EnhancementTreePanel')],
  ['EpicDestiniesPanel', () => import('../components/epicdestinies/EpicDestiniesPanel')],
  ['ReaperPanel', () => import('../components/reaper/ReaperPanel')],
  ['GearPanel', () => import('../components/items/GearPanel')],
  ['ClickiesPanel', () => import('../components/items/ClickiesPanel')],
  ['BreakdownsPanel', () => import('../components/breakdowns/BreakdownsPanel')],
  ['CombatPanel', () => import('../components/combat/CombatPanel')],
  ['BuildCompare', () => import('../components/layout/BuildCompare')],
  ['PastLivesPanel', () => import('../components/pastlives/PastLivesPanel')],
  ['GuildBuffsPanel', () => import('../components/guildbuffs/GuildBuffsPanel')],
  ['SetBonusesPanel', () => import('../components/setbonuses/SetBonusesPanel')],
  ['StancesPanel', () => import('../components/stances/StancesPanel')],
  ['FiligreePanel', () => import('../components/filigree/FiligreePanel')],
  ['DCPanel', () => import('../components/dc/DCPanel')],
  ['SelfBuffsPanel', () => import('../components/buffs/SelfBuffsPanel')],
  ['BonusesPanel', () => import('../components/bonuses/BonusesPanel')],
  ['FavorPanel', () => import('../components/favor/FavorPanel')],
  ['NotesPanel', () => import('../components/notes/NotesPanel')],
  ['ForumExportPanel', () => import('../components/export/ForumExportPanel')],
  ['SettingsPanel', () => import('../components/layout/SettingsPanel')],
  ['ContentPanel', () => import('../components/layout/ContentPanel')],
  ['HelpPanel', () => import('../components/layout/HelpPanel')],
  ['LifeBuildBar', () => import('../components/layout/LifeBuildBar')],
  // Dashboard keys its window layout by account, so it needs AuthProvider —
  // the same wrapper the app always renders it inside.
  ['Dashboard', () => Promise.all([
    import('../components/layout/Dashboard'),
    import('../context/AuthContext'),
  ]).then(([m, auth]) => ({
    default: () => React.createElement(auth.AuthProvider, null,
      React.createElement(m.default)),
  }))],
  // Community panels need AuthProvider and an onLoad prop — shim them in.
  ['CommunityPanel', () => Promise.all([
    import('../components/community/CommunityPanel'),
    import('../context/AuthContext'),
  ]).then(([m, auth]) => ({
    default: () => React.createElement(auth.AuthProvider, null,
      React.createElement(m.default, { onLoad: () => {} })),
  }))],
  ['AccountPanel', () => Promise.all([
    import('../components/community/AccountPanel'),
    import('../context/AuthContext'),
  ]).then(([m, auth]) => ({
    default: () => React.createElement(auth.AuthProvider, null,
      React.createElement(m.default, { onLoad: () => {} })),
  }))],
]

describe.skipIf(!haveData)('panel render smoke (real data + real build)', () => {
  beforeAll(() => {
    cat = buildCatalogues()
    installFetchMock()
    const { build } = importV2Build(readFileSync(FIXTURE, 'utf-8'))
    // Slot weapon filigrees too (the fixture only has artifact filigrees) so
    // the weapon set-bonus paths execute.
    const filigrees = cat.filigree as Array<{ Name: string }>
    build.filigreeSlots = [
      { name: filigrees[0]?.Name ?? '', rare: false },
      { name: filigrees[1]?.Name ?? '', rare: true },
      { name: filigrees[0]?.Name ?? '', rare: false },
      { name: '', rare: false }, { name: '', rare: false }, { name: '', rare: false },
    ]
    importedBuild = build
  }, 120_000)

  it.each(PANELS.map(([name]) => name))('%s renders without crashing', async (name) => {
    const loader = PANELS.find(([n]) => n === name)![1]
    const mod = await loader()
    const Component = mod.default
    const { root, container, errors } = await renderPanel(React.createElement(Component))
    mounted.push({ root, container })
    expect(errors, `window errors while rendering ${name}: ${errors.map(String).join('; ')}`).toEqual([])
    expect(container.innerHTML.length).toBeGreaterThan(0)
  }, 60_000)
})
