// @vitest-environment jsdom
//
// One panel throwing must not take the app down with it. Before this existed,
// a spell whose effect Type was a list threw a TypeError and React unmounted
// everything — the user was left looking at the page background.

import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import ErrorBoundary from '../components/common/ErrorBoundary'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Root[] = []

function render(node: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  // React logs the caught error; the test asserts on the rendered fallback.
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  act(() => { root.render(node) })
  quiet.mockRestore()
  mounted.push(root)
  return container
}

afterEach(() => {
  act(() => { for (const r of mounted) r.unmount() })
  mounted.length = 0
})

function Boom(): React.ReactElement {
  throw new TypeError('type.replace is not a function')
}

describe('ErrorBoundary', () => {
  it('renders its children untouched when nothing throws', () => {
    const c = render(
      React.createElement(ErrorBoundary, { label: 'Spells' },
        React.createElement('p', null, 'the panel')),
    )
    expect(c.textContent).toContain('the panel')
    expect(c.textContent).not.toContain('error')
  })

  it('shows which panel broke, and what broke, instead of a blank page', () => {
    const c = render(
      React.createElement(ErrorBoundary, { label: 'Spells' },
        React.createElement(Boom)),
    )
    expect(c.textContent).toContain('The Spells panel hit an error')
    expect(c.textContent).toContain('type.replace is not a function')
    expect(c.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('keeps the rest of the app mounted', () => {
    const c = render(
      React.createElement('div', null,
        React.createElement('nav', null, 'top bar'),
        React.createElement(ErrorBoundary, null, React.createElement(Boom)),
      ),
    )
    // The sibling survives — that is the whole point.
    expect(c.querySelector('nav')?.textContent).toBe('top bar')
    expect(c.textContent).toContain('This panel hit an error')
  })

  it('offers a retry that re-renders rather than forcing a reload', () => {
    let broken = true
    function Flaky() {
      if (broken) throw new Error('not yet')
      return React.createElement('p', null, 'recovered')
    }
    const c = render(
      React.createElement(ErrorBoundary, null, React.createElement(Flaky)),
    )
    expect(c.textContent).toContain('not yet')
    broken = false
    act(() => { (c.querySelector('button') as HTMLButtonElement).click() })
    expect(c.textContent).toContain('recovered')
  })
})
