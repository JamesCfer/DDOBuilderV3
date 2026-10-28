// @vitest-environment jsdom
//
// Build point tiers on the Ability Scores panel (V2 DDOBuilderView radio
// buttons): 28 or 32 is a free choice with no past lives, 34 / 36 follow past
// lives. Before this, V3 had no way to pick 32 and nothing showed the tiers.

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const RACES = [
  { Name: 'Human', BuildPoints: '28 32 34 36' },
  { Name: 'Dwarf', BuildPoints: '28 32 34 36', Constitution: 2, Charisma: -2 },
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

function options(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('[role="radiogroup"] button')) as HTMLButtonElement[]
}
function header(container: HTMLElement): string {
  return container.querySelector('[class*="pointsRemaining"]')?.textContent ?? ''
}

describe('buildPointTier (V2 Build::DetermineBuildPoints)', () => {
  it('maps past lives and the Champion flag to a tier', async () => {
    const { buildPointTier } = await import('../components/builder/AbilityScores')
    expect(buildPointTier(0, false)).toBe(0)
    expect(buildPointTier(0, true)).toBe(1)
    expect(buildPointTier(1, false)).toBe(2)
    expect(buildPointTier(1, true)).toBe(2)
    expect(buildPointTier(5, false)).toBe(3)
  })
})

describe('Ability Scores build point selector', () => {
  it('shows all four tiers and lets a fresh build switch 28 to 32', async () => {
    const mod = await import('../components/builder/AbilityScores')
    const container = await mount(React.createElement(mod.default), emptyBuild())
    const opts = options(container)
    expect(opts.map(b => b.textContent)).toEqual(['28', '32', '34', '36'])
    expect(opts.map(b => b.disabled)).toEqual([false, false, true, true])
    expect(header(container)).toContain('/ 28 pts')
    await act(async () => { opts[1].click() })
    expect(header(container)).toContain('32 / 32 pts')
    expect(options(container)[1].getAttribute('aria-checked')).toBe('true')
    await act(async () => { options(container)[0].click() })
    expect(header(container)).toContain('28 / 28 pts')
  })

  it('locks the selector to the past-life tier', async () => {
    const mod = await import('../components/builder/AbilityScores')
    const one = await mount(React.createElement(mod.default), { ...emptyBuild(), pastLives: { Fighter: 1 } })
    expect(header(one)).toContain('/ 34 pts')
    expect(options(one).every(b => b.disabled)).toBe(true)
    expect(options(one)[2].getAttribute('aria-checked')).toBe('true')
    const many = await mount(React.createElement(mod.default), { ...emptyBuild(), pastLives: { Fighter: 3 }, championBuildPoints: true })
    expect(header(many)).toContain('/ 36 pts')
  })
})

describe('V2 Champion flag round trip', () => {
  it('exports <Champion/> and imports it back', async () => {
    const { exportV2Build } = await import('../lib/v2Export')
    const { importV2Build } = await import('../lib/v2Import')
    const xml = exportV2Build({ ...emptyBuild(), championBuildPoints: true })
    expect(xml).toContain('<Champion')
    const back = importV2Build(xml)
    expect(back.build.championBuildPoints).toBe(true)
    const plain = importV2Build(exportV2Build(emptyBuild())).build
    expect(plain.championBuildPoints).toBeFalsy()
  })
})
