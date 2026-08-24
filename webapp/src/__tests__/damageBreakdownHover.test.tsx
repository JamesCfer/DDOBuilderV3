// @vitest-environment jsdom
//
// Hovering a damage number must show where it came from. This mounts the two
// panels with real catalogue data and a build wielding a weapon that carries
// a named damage effect, then hovers the numbers and reads the tooltip.

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
  loadSelfAndPartyBuffs, loadAttackRates, loadItemBuffs, loadBonusTypes,
} from '../server/dataLoaders'
import { importV2Build } from '../lib/v2Import'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import CombatPanel from '../components/combat/CombatPanel'
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
    'bonus-types': loadBonusTypes(DATA_DIR),
  }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    return new Response(JSON.stringify(routeApi(url.pathname, url.searchParams)), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}, 120_000)

let cached: CharacterBuild | null = null

function armedBuild(): CharacterBuild {
  if (!cached) {
    const { build } = importV2Build(readFileSync(FIXTURE, 'utf8'))
    build.gear = { ...build.gear, Weapon1: WEAPON }
    cached = build
  }
  return JSON.parse(JSON.stringify(cached)) as CharacterBuild
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

async function mount(Component: React.ComponentType): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, { build: armedBuild() },
              React.createElement(Component)),
          ),
        ),
      ),
    )
  })
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
  }
  mounted.push({ root, container })
  return container
}

/** Fires a real mouseenter so React's onMouseEnter runs. */
async function hover(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
  })
}

function tipText(): string {
  const tip = document.querySelector('[role="tooltip"]')
  return tip?.textContent ?? ''
}

describe.runIf(haveData)('Combat overview hover breakdowns', () => {
  it('formats damage numbers with separators rather than a bare decimal', async () => {
    const c = await mount(CombatPanel)
    const text = c.textContent ?? ''
    expect(text).toContain('Hit damage')
    // Nothing should render as a raw toFixed(1) value in the thousands.
    expect(text).not.toMatch(/\b\d{4,}\.\d\b/)
  }, 120_000)

  it('explains hit damage as dice, bonuses, then Melee Power', async () => {
    const c = await mount(CombatPanel)
    const cells = [...c.querySelectorAll('td')]
    const target = cells.find(td => td.previousElementSibling?.textContent === 'Hit damage')
    expect(target, 'a Hit damage cell should exist').toBeTruthy()

    await hover(target!)
    const tip = tipText()
    expect(tip).toContain('Hit damage')
    expect(tip).toMatch(/Weapon dice/)
    expect(tip).toMatch(/Melee\/Ranged Power/)
  }, 120_000)

  it('shows the crit multiplier in the crit damage breakdown', async () => {
    const c = await mount(CombatPanel)
    const cells = [...c.querySelectorAll('td')]
    const target = cells.find(td => td.previousElementSibling?.textContent === 'Crit damage')
    await hover(target!)
    expect(tipText()).toMatch(/Critical multiplier/)
  }, 120_000)

  it('breaks the off-hand down by swing chance and hit chance', async () => {
    // The fixture is a handwraps monk, so it does swing an off-hand. The
    // empty-off-hand wording is covered by the damageRows unit test.
    const c = await mount(CombatPanel)
    const cells = [...c.querySelectorAll('td')]
    const target = cells.find(td => td.previousElementSibling?.textContent === 'Off-hand DPR')
    await hover(target!)
    const tip = tipText()
    expect(tip).toMatch(/Off-hand swing damage/)
    expect(tip).toMatch(/Off-hand swing chance/)
  }, 120_000)

  it('leaves hit chance without a breakdown, since it has none to give', async () => {
    const c = await mount(CombatPanel)
    const cells = [...c.querySelectorAll('td')]
    const target = cells.find(td => td.previousElementSibling?.textContent === 'Hit chance')
    await hover(target!)
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  }, 120_000)
})

describe.runIf(haveData)('Damage Calc hover breakdowns', () => {
  async function runSim(c: HTMLElement): Promise<void> {
    const run = [...c.querySelectorAll('button')].find(b => b.textContent?.includes('Run simulation'))
    await act(async () => { run!.click() })
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    }
  }

  it('names the item behind a damage-over-time share', async () => {
    const c = await mount(DamageCalcPanel)
    await runSim(c)

    const rows = [...c.querySelectorAll('tr')]
    const dotRow = rows.find(r => r.textContent?.startsWith('Damage over time'))
    expect(dotRow, 'a Damage over time row should exist').toBeTruthy()

    await hover(dotRow!)
    // The equipped weapon carries Dripping with Magma, so the share should be
    // attributed to it by name rather than only to its category.
    expect(tipText()).toContain('Dripping with Magma')
  }, 120_000)

  it('breaks the mean down into its contributing sources', async () => {
    const c = await mount(DamageCalcPanel)
    await runSim(c)

    const tile = [...c.querySelectorAll('div')]
      .find(d => d.firstElementChild?.textContent === 'Mean damage')
    expect(tile, 'a Mean damage tile should exist').toBeTruthy()

    await hover(tile!)
    const tip = tipText()
    expect(tip).toContain('Mean damage')
    expect(tip).toContain('Weapon damage')
    expect(tip).toMatch(/%/)
  }, 120_000)

  it('explains an empty proc category instead of showing a blank tooltip', async () => {
    const c = await mount(DamageCalcPanel)
    await runSim(c)
    const rows = [...c.querySelectorAll('tr')]
    const procRow = rows.find(r => r.textContent?.startsWith('Procs'))
    await hover(procRow!)
    const tip = tipText()
    // Either it names real procs, or it says there are none — never blank.
    expect(tip.length).toBeGreaterThan(10)
  }, 120_000)
})
