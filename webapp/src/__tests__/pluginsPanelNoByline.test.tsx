// @vitest-environment jsdom
//
// The plugins page presents the downloads as the site's own. The release
// catalogue carries an `author` per plugin (a GitHub account name) and the
// page used to print it as "by <name>" under the hub download and on every
// plugin card — that credit is not wanted on the page.

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

const RELEASES = [
  {
    key: 'ddohub', name: 'Plugin Hub', author: 'SomeAccount',
    description: 'Installs and updates the rest.', manifest: '',
    version: '1.2.3', notes: 'First release', zipUrl: 'https://example.test/ddohub.zip',
    isManager: true,
  },
  {
    key: 'questtracker', name: 'Quest Tracker', author: 'SomeAccount',
    description: 'Tracks quests.', manifest: '',
    version: '0.9.0', notes: null, zipUrl: 'https://example.test/qt.zip',
    isManager: false,
  },
]

vi.mock('../api', () => ({
  api: { plugins: () => Promise.resolve({ plugins: RELEASES }) },
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

describe('PluginsPanel', () => {
  it('lists the releases without crediting an author', async () => {
    const mod = await import('../components/plugins/PluginsPanel')
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(React.createElement(mod.default))
    })
    mounted.push({ root, container })

    // The releases themselves still render.
    expect(container.textContent).toContain('Plugin Hub')
    expect(container.textContent).toContain('Quest Tracker')
    expect(container.textContent).toContain('ddohub-1.2.3.zip')

    // …but nothing on the page names who wrote them.
    expect(container.textContent).not.toContain('SomeAccount')
    expect(container.textContent).not.toMatch(/\bby\s+\S/)
  })
})
