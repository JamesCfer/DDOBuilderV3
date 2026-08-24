// @vitest-environment jsdom
//
// Mounts the Damage Calc panel with real catalogue data and a build that
// actually wields "The Magmatic Cleaver", then presses Run and checks the
// numbers come out. This covers the wiring the pure unit tests cannot: data
// loading, the auto-derivation effect, the audit list, and the run button.

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
  loadSelfAndPartyBuffs, loadAttackRates, loadItemBuffs,
} from '../server/dataLoaders'
import { importV2Build } from '../lib/v2Import'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import DamageCalcPanel from '../components/combat/DamageCalcPanel'
import type { CharacterBuild } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(
  __dirname, '..', '..', '..', 'Output', 'Example Builds',
  'Maetrim_EndGameHandwrapsMonk.DDOBuild',
)
const haveData = existsSync(DATA_DIR) && existsSync(FIXTURE)
const WEAPON = 'The Magmatic Cleaver'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let cat: Record<string, unknown[]> = {}

function routeApi(pathname: string, params: URLSearchParams): unknown {
  const key = pathname.replace(/^\/api\//, '')
  if (key === 'item') {
    return (cat.items as Array<Record<string, unknown>>)
      .find(i => i.Name === params.get('name')) ?? null
  }
  if (key === 'items') {
    const slot = params.get('slot')
    const all = cat.items as Array<Record<string, unknown>>
    if (!slot) return all
    return all.filter(i => {
      const s = i.EquipmentSlot as Record<string, unknown> | undefined
      return s && slot in s
    })
  }
  if (key === 'item-setbonuses') return []
  return key in cat ? cat[key] : []
}

beforeAll(() => {
  if (!haveData) return
  cat = {
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
    'attack-rates': loadAttackRates(DATA_DIR),
    'item-buffs': loadItemBuffs(DATA_DIR),
  }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    return new Response(JSON.stringify(routeApi(url.pathname, url.searchParams)), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}, 120_000)

/**
 * The shipped example build, re-armed with the Magmatic Cleaver. Hand-rolling
 * a CharacterBuild here is not viable -- buildStats reads dozens of fields the
 * V2 importer fills in.
 */
let magmaBuildCache: CharacterBuild | null = null

function magmaBuild(): CharacterBuild {
  if (!magmaBuildCache) {
    const { build } = importV2Build(readFileSync(FIXTURE, 'utf8'))
    build.gear = { ...build.gear, Weapon1: WEAPON }
    magmaBuildCache = build
  }
  // Fresh copy per mount so no test mutates another's state.
  return JSON.parse(JSON.stringify(magmaBuildCache)) as CharacterBuild
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

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

async function mountPanel(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, { build: magmaBuild() },
              React.createElement(DamageCalcPanel)),
          ),
        ),
      ),
    )
  })
  // Flush the data-loading effect chain: catalogues -> gear items -> stats.
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
  }
  mounted.push({ root, container })
  return container
}

describe.runIf(haveData)('DamageCalcPanel', () => {
  it('derives inputs from the equipped weapon instead of asking for them', async () => {
    const c = await mountPanel()
    const text = c.textContent ?? ''
    expect(text).not.toContain('Equip a weapon')

    // The attack-bonus field should carry a real derived number, not zero.
    const atk = c.querySelector<HTMLInputElement>('input[type="number"]')
    expect(atk).not.toBeNull()
    expect(Number(atk!.value)).toBeGreaterThan(0)
  }, 120_000)

  it('lists Dripping with Magma in the audit, flagged as estimated', async () => {
    const c = await mountPanel()
    const text = c.textContent ?? ''
    expect(text).toContain('Dripping with Magma')
    expect(text).toContain('estimated')
    expect(text).toContain(WEAPON)
  }, 120_000)

  it('produces damage numbers when the simulation is run', async () => {
    const c = await mountPanel()
    expect(c.textContent).toContain('Run simulation')

    const run = Array.from(c.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Run simulation'))
    expect(run).toBeDefined()

    await act(async () => { run!.click() })
    // The panel defers the simulation by a tick so the status can paint.
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    }

    const text = c.textContent ?? ''
    expect(text).toContain('Mean damage')
    expect(text).toContain('DPS')
    expect(text).toMatch(/trials/)
    // A histogram was drawn.
    expect(c.querySelector('svg')).not.toBeNull()
    // And the damage-over-time bucket picked up the Magma DoT.
    expect(text).toContain('Damage over time')
  }, 120_000)
})
