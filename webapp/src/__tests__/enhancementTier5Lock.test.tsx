// @vitest-environment jsdom
//
// Tester report (build #326): the builder let you take Tier 5 in several
// enhancement trees at once, e.g. the top line of Eldritch Knight and Air
// Savant. V2 (Build::Enhancement_TrainEnhancement) records a single Tier5Tree
// and only that tree may train Tier-5 items until its last one is revoked.

import { describe, it, expect, afterEach } from 'vitest'
import React, { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { BuildLogProvider } from '../context/BuildLogContext'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const TREES = [
  {
    Name: 'Eldritch Knight',
    Requirements: { Requirement: [{ Type: 'Class', Item: ['Sorcerer'] }] },
    EnhancementTreeItem: [
      { Name: 'EK Tier 5', InternalName: 'EKTier5', Ranks: 1, CostPerRank: '1', YPosition: 5, XPosition: 1, Tier5: true },
    ],
  },
  {
    Name: 'Air Savant',
    Requirements: { Requirement: [{ Type: 'Class', Item: ['Sorcerer'] }] },
    EnhancementTreeItem: [
      { Name: 'AS Tier 5', InternalName: 'ASTier5', Ranks: 1, CostPerRank: '1', YPosition: 5, XPosition: 1, Tier5: true },
      { Name: 'AS Tier 5 Other', InternalName: 'ASTier5b', Ranks: 1, CostPerRank: '1', YPosition: 5, XPosition: 2, Tier5: true },
    ],
  },
]
const CLASSES = [{ Name: 'Sorcerer' }]

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const body =
    url.pathname === '/api/enhancements' ? TREES
    : url.pathname === '/api/classes' ? CLASSES
    : []
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

function sorcBuild(choices: CharacterBuild['enhancementChoices']): CharacterBuild {
  return {
    ...emptyBuild(),
    race: '',
    classes: [{ name: 'Sorcerer', levels: 20 }],
    levelClasses: Array(20).fill('Sorcerer'),
    totalLevel: 20,
    enhancementChoices: choices,
    enhancementPinned: ['Eldritch Knight', 'Air Savant'],
  }
}

function SeedBuild({ build }: { build: CharacterBuild }) {
  const { dispatch } = useCharacter()
  useEffect(() => { dispatch({ type: 'LOAD_BUILD', build }) }, [dispatch, build])
  return null
}

let latest: CharacterBuild | null = null
function Probe() {
  const { build } = useCharacter()
  latest = build
  return null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
  latest = null
})

async function mountPanel(build: CharacterBuild): Promise<HTMLElement> {
  const mod = await import('../components/enhancements/EnhancementTreePanel')
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(BuildLogProvider, null,
        React.createElement(CharacterProvider, null,
          React.createElement(DocumentProvider, null,
            React.createElement(SettingsProvider, null,
              React.createElement(SeedBuild, { build }),
              React.createElement(Probe),
              React.createElement(mod.default),
            ),
          ),
        ),
      ),
    )
  })
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
  mounted.push({ root, container })
  return container
}

function cell(container: HTMLElement, name: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[aria-label="${name}"]`)
  if (!el) throw new Error(`cell ${name} not rendered`)
  return el
}

describe('enhancement Tier 5 is limited to one tree', () => {
  it('blocks Tier 5 in a second tree once another tree has one', async () => {
    const c = await mountPanel(sorcBuild({ 'Eldritch Knight': { EKTier5: 1 } }))
    const other = cell(c, 'AS Tier 5')
    expect(other.getAttribute('data-tip')).toContain('Tier 5 is locked to another tree')
    await act(async () => { other.click() })
    expect(latest?.enhancementChoices['Air Savant']?.ASTier5 ?? 0).toBe(0)
  })

  it('still allows more Tier 5 items in the tree that holds Tier 5', async () => {
    const c = await mountPanel(sorcBuild({ 'Air Savant': { ASTier5: 1 } }))
    const same = cell(c, 'AS Tier 5 Other')
    expect(same.getAttribute('data-tip') ?? '').not.toContain('Tier 5 is locked')
    await act(async () => { same.click() })
    expect(latest?.enhancementChoices['Air Savant']?.ASTier5b).toBe(1)
    expect(cell(c, 'EK Tier 5').getAttribute('data-tip')).toContain('Tier 5 is locked to another tree')
  })

  it('leaves every tree open when no Tier 5 is trained', async () => {
    const c = await mountPanel(sorcBuild({}))
    await act(async () => { cell(c, 'EK Tier 5').click() })
    expect(latest?.enhancementChoices['Eldritch Knight']?.EKTier5).toBe(1)
    expect(cell(c, 'AS Tier 5').getAttribute('data-tip')).toContain('Tier 5 is locked to another tree')
  })
})
