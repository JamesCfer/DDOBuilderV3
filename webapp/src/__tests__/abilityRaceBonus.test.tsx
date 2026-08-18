// @vitest-environment jsdom
//
// The Ability Scores panel folded the racial modifier into the "= total"
// column with nothing naming it, so a Dwarf's +2 CON and −2 CHA were
// invisible — the panel showed a base score, a tome chip and a total that did
// not add up from what was on screen. Each contribution now has its own chip:
// race (+2R / −2R), level-ups (+NL) and tome (+NT).
//
// Also covers the 3-letter class tags the reworked class window drags around.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'
import { classShortName } from '../lib/gamedata'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const RACES = [
  { Name: 'Human', BuildPoints: '28 30 32 34' },
  { Name: 'Dwarf', BuildPoints: '28 30 32 34', Constitution: 2, Charisma: -2 },
]

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const data = url.pathname === '/api/races' ? RACES : []
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

let mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

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

async function mount(component: React.ReactElement, build: CharacterBuild): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(LoadBuild, { build }, component),
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

/** The panel row whose abbreviation cell is `abbrev` (STR, CON, …). */
function abilityRow(container: HTMLElement, abbrev: string): HTMLElement {
  const rows = Array.from(container.querySelectorAll('[class*="row"]')) as HTMLElement[]
  const row = rows.find(r => r.querySelector('[class*="abbrev"]')?.textContent === abbrev)
  if (!row) throw new Error(`ability row "${abbrev}" not found`)
  return row
}

describe('AbilityScores shows the racial modifier', () => {
  function dwarf(): CharacterBuild {
    return { ...emptyBuild(), race: 'Dwarf' }
  }

  it('renders a +NR chip for a positive racial bonus', async () => {
    const mod = await import('../components/builder/AbilityScores')
    const container = await mount(React.createElement(mod.default), dwarf())
    const con = abilityRow(container, 'CON')
    expect(con.querySelector('[class*="racePos"]')?.textContent).toBe('+2R')
    // …and the total still adds up: 8 base + 2 race
    expect(con.querySelector('[class*="total"]')?.textContent).toContain('10')
  })

  it('renders a −NR chip for a racial penalty', async () => {
    const mod = await import('../components/builder/AbilityScores')
    const container = await mount(React.createElement(mod.default), dwarf())
    const cha = abilityRow(container, 'CHA')
    expect(cha.querySelector('[class*="raceNeg"]')?.textContent).toBe('-2R')
    expect(cha.querySelector('[class*="total"]')?.textContent).toContain('6')
  })

  it('shows no race chip where the race grants nothing', async () => {
    const mod = await import('../components/builder/AbilityScores')
    const container = await mount(React.createElement(mod.default), dwarf())
    const str = abilityRow(container, 'STR')
    expect(str.querySelector('[class*="racePos"]')).toBeNull()
    expect(str.querySelector('[class*="raceNeg"]')).toBeNull()
  })

  it('names every contribution in the total tooltip', async () => {
    const mod = await import('../components/builder/AbilityScores')
    const build = dwarf()
    build.abilityLevelUps = { 4: 'Constitution', 8: 'Constitution' }
    build.abilityTomes = { Constitution: 3 }
    const container = await mount(React.createElement(mod.default), build)
    const con = abilityRow(container, 'CON')
    const title = con.querySelector('[class*="total"]')?.getAttribute('title') ?? ''
    expect(title).toContain('8 base')
    expect(title).toContain('2 race')
    expect(title).toContain('2 level-ups')
    expect(title).toContain('3 tome')
    expect(con.querySelector('[class*="levelUp"]')?.textContent).toBe('+2L')
    expect(con.querySelector('[class*="tome"]')?.textContent).toBe('+3T')
  })
})

describe('classShortName', () => {
  it('uses the community 3-letter tags', () => {
    expect(classShortName('Favored Soul')).toBe('FVS')
    expect(classShortName('Fighter')).toBe('FTR')
    expect(classShortName('Barbarian')).toBe('BRB')
    expect(classShortName('Sacred Fist')).toBe('SCF')
    expect(classShortName('Epic')).toBe('EPI')
    expect(classShortName('Legendary')).toBe('LEG')
  })

  it('derives a tag for a class the table has not heard of', () => {
    expect(classShortName('Shadow Dancer')).toBe('SHD')
    expect(classShortName('Warden')).toBe('WAR')
    expect(classShortName('')).toBe('')
  })
})
