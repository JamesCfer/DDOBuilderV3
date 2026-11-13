// @vitest-environment jsdom
//
// Tester report (build #330): "I am not able to sign in on mobile". The header
// Sign in button only switched to the Community page, whose stacked phone
// layout puts Browse Builds first and the sign-in box a full screen below it.
// The button now opens the account window over the page; signed out, that
// window is titled "Sign in".

import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import ToolWindow from '../components/workspace/ToolWindow'
import { WINDOW_REGISTRY } from '../components/workspace/registry'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function render(el: React.ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(el))
  return host
}

describe('sign-in window', () => {
  it('the account panel the header button opens is a registered window', () => {
    expect(WINDOW_REGISTRY['My Builds']).toBeDefined()
  })

  it('shows the title override in the title bar and dialog label', () => {
    const el = render(<ToolWindow panel="Nope" title="Sign in" onClose={() => {}} />)
    const dialog = el.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toBe('Sign in')
    expect(dialog.textContent).toContain('Sign in')
  })

  it('falls back to the panel name without a title', () => {
    const el = render(<ToolWindow panel="Nope" onClose={() => {}} />)
    expect(el.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('Nope')
  })
})
