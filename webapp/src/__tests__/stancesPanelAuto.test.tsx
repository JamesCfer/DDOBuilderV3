// @vitest-environment jsdom
//
// Stances panel — the Automatic section.
//
// `<AutoControlled/>` is an XML flag that parses to the empty string, so the
// panel's `s.AutoControlled` filter matched nothing: every one of Stances.xml's
// 30 auto stances was rendered as a hand-toggle that showed as OFF even when
// the build was plainly in it, and clicking one wrote a name into activeBuffs
// that the engine's auto-stance families then ignored. The section now shows
// the engine's live derivation, and a click forces the stance the other way so
// its effects can be tested.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Verbatim shape of a parsed Stances.xml entry: Group is an array (the loader
// always-array list) and AutoControlled is the empty-string flag.
const CLOTH_ARMOR = {
  Name: 'Cloth Armor',
  Description: 'You are wearing cloth or no armor.',
  Group: ['Auto'],
  AutoControlled: '',
}
const USER_STANCE = {
  Name: 'Reaper',
  Description: 'You are in a Reaper difficulty quest',
  Group: ['User'],
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  const body = url.pathname === '/api/stances' ? [CLOTH_ARMOR, USER_STANCE] : []
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

let mounted: Array<{ root: Root; container: HTMLElement }> = []
beforeEach(() => resetStaticBundleForTests())
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

async function mountPanel(): Promise<HTMLElement> {
  const mod = await import('../components/stances/StancesPanel')
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(mod.default),
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

const buttonFor = (c: HTMLElement, name: string): HTMLButtonElement | undefined =>
  Array.from(c.querySelectorAll('button'))
    .find(b => (b.textContent ?? '').includes(name)) as HTMLButtonElement | undefined

const click = async (b: HTMLButtonElement) => {
  await act(async () => {
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('StancesPanel — automatic stances', () => {
  it('shows an auto stance the build qualifies for as active', async () => {
    const container = await mountPanel()
    expect(container.textContent).toContain('Automatic')
    // A fresh build wears no armour, so V2's Cloth Armor stance is on.
    const btn = buttonFor(container, 'Cloth Armor')
    expect(btn).toBeDefined()
    expect(btn!.textContent).toContain('✓')
    expect(btn!.title).toContain('Automatic: active')
  })

  it('one click forces it off, the next hands it back to the build', async () => {
    const container = await mountPanel()
    await click(buttonFor(container, 'Cloth Armor')!)

    const forced = buttonFor(container, 'Cloth Armor')!
    expect(forced.textContent).not.toContain('✓')
    expect(forced.title).toContain('Manually forced off')
    // The reset affordance appears while any override is held.
    expect(container.textContent).toContain('reset 1 override')

    await click(buttonFor(container, 'Cloth Armor')!)
    const restored = buttonFor(container, 'Cloth Armor')!
    expect(restored.textContent).toContain('✓')
    expect(restored.title).toContain('Automatic: active')
    expect(container.textContent).not.toContain('reset 1 override')
  })

  it('resets every override at once', async () => {
    const container = await mountPanel()
    await click(buttonFor(container, 'Cloth Armor')!)
    expect(container.textContent).toContain('reset 1 override')

    const reset = Array.from(container.querySelectorAll('button'))
      .find(b => (b.textContent ?? '').startsWith('reset')) as HTMLButtonElement
    await click(reset)

    expect(container.textContent).not.toContain('reset ')
    expect(buttonFor(container, 'Cloth Armor')!.textContent).toContain('✓')
  })

  it('keeps hand-toggled stances in their own section', async () => {
    const container = await mountPanel()
    expect(container.textContent).toContain('Toggleable')
    const btn = buttonFor(container, 'Reaper')!
    expect(btn.textContent).not.toContain('✓')
    await click(btn)
    expect(buttonFor(container, 'Reaper')!.textContent).toContain('✓')
  })
})
