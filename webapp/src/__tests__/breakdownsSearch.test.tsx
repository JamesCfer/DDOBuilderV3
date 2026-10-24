// @vitest-environment jsdom
//
// Breakdowns panel search: filters rows by stat name, section, or the bonus
// types and sources behind each row.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'
import { filterBreakdownSections, type BreakdownSection } from '../components/breakdowns/breakdownSections'
import type { StatRowData } from '../components/breakdowns/statRows'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const FIGHTER = { Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1', Will: 'Type1', BAB: '1' }

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const data = url.pathname === '/api/classes' ? [FIGHTER] : []
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

let latestBuild: CharacterBuild | null = null

function LoadBuild({ build, children }: { build: CharacterBuild; children: React.ReactNode }) {
  const { build: current, dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_BUILD', build })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  latestBuild = current
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

function fighter20(): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Fighter', levels: 20 }],
    levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
    totalLevel: 20,
  }
}

describe('filterBreakdownSections', () => {
  const row = (label: string, bonuses: Array<{ type: string; source: string }> = []): StatRowData => ({
    label, total: 1, bonuses: bonuses.map(b => ({ ...b, value: 1, active: true })),
  })
  const sections: BreakdownSection[] = [
    { title: 'Defense', defaultOpen: true, hideWhenEmpty: false, rows: [
      row('Hit Points'), row('PRR', [{ type: 'Insightful', source: 'Helm of Workplace Safety' }]),
    ] },
    { title: 'Saves', defaultOpen: true, hideWhenEmpty: false, rows: [row('Fortitude'), row('Reflex')] },
  ]

  it('returns everything for a blank query', () => {
    expect(filterBreakdownSections(sections, '  ')).toBe(sections)
  })

  it('matches row labels and drops empty sections', () => {
    const out = filterBreakdownSections(sections, 'hit')
    expect(out.map(s => s.title)).toEqual(['Defense'])
    expect(out[0].rows.map(r => r.label)).toEqual(['Hit Points'])
  })

  it('matches a section title, keeping all its rows', () => {
    expect(filterBreakdownSections(sections, 'saves')[0].rows).toHaveLength(2)
  })

  it('matches bonus types and sources, every term required', () => {
    expect(filterBreakdownSections(sections, 'insightful')[0].rows.map(r => r.label)).toEqual(['PRR'])
    expect(filterBreakdownSections(sections, 'workplace prr')[0].rows.map(r => r.label)).toEqual(['PRR'])
    expect(filterBreakdownSections(sections, 'workplace fortitude')).toEqual([])
  })
})

async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Breakdowns panel search box', () => {
  it('narrows the rows and says when nothing matches', async () => {
    const mod = await import('../components/breakdowns/BreakdownsPanel')
    const container = await mount(React.createElement(mod.default), fighter20())
    const input = container.querySelector('input[aria-label="Search breakdowns"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(container.textContent).toContain('Fortitude')

    await typeInto(input, 'hit points')
    expect(container.textContent).toContain('Hit Points')
    expect(container.textContent).not.toContain('Fortitude')
    expect(container.textContent).not.toContain('Ability Scores')

    await typeInto(input, 'strength')
    expect(container.textContent).toContain('Ability Scores')

    await typeInto(input, 'qqqzzz')
    expect(container.textContent).toContain('Nothing matches')

    const clear = container.querySelector('button[aria-label="Clear search"]') as HTMLButtonElement
    await act(async () => { clear.click() })
    expect(container.textContent).toContain('Fortitude')
  })
})
