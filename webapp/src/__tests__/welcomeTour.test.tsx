// @vitest-environment jsdom
//
// First-run tutorial: steps through, remembers that it was seen, and does not
// come back on the next visit.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import WelcomeTour, { shouldShowTour, markTourSeen } from '../components/layout/WelcomeTour'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ root: Root; container: HTMLElement }> = []
let closed = 0

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WelcomeTour, { onClose: () => { closed += 1 } }))
  })
  mounted.push({ root, container })
  return container
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === text)
  if (!found) throw new Error(`no button labelled "${text}"`)
  return found as HTMLButtonElement
}

beforeEach(() => {
  closed = 0
  localStorage.clear()
})

afterEach(() => {
  act(() => { for (const m of mounted) m.root.unmount() })
  mounted.length = 0
})

describe('shouldShowTour', () => {
  it('shows on a first visit and not once it has been seen', () => {
    expect(shouldShowTour()).toBe(true)
    markTourSeen()
    expect(shouldShowTour()).toBe(false)
  })
})

describe('WelcomeTour', () => {
  it('opens on the welcome step and explains what the site is', async () => {
    const c = await render()
    expect(c.textContent).toContain('Welcome to DDO Builder')
    expect(c.textContent).toContain('Dungeons & Dragons Online')
    expect(c.textContent).toContain('Step 1 of')
  })

  it('steps forward and back through the tour', async () => {
    const c = await render()
    await act(async () => { button('Next').click() })
    expect(c.textContent).toContain('Step 2 of')
    await act(async () => { button('Back').click() })
    expect(c.textContent).toContain('Step 1 of')
    // Nothing to go back to on the first step.
    expect(button('Back').disabled).toBe(true)
  })

  it('points at the feedback button on the last step', async () => {
    const c = await render()
    // Walk to the end.
    for (let i = 0; i < 10 && !c.textContent?.includes('Start building'); i++) {
      await act(async () => { button('Next').click() })
    }
    expect(c.textContent).toContain('Feedback')
    expect(c.textContent).toContain('bottom-right')
  })

  it('remembers a finished tour so it does not reappear', async () => {
    const c = await render()
    for (let i = 0; i < 10 && !c.textContent?.includes('Start building'); i++) {
      await act(async () => { button('Next').click() })
    }
    await act(async () => { button('Start building').click() })
    expect(closed).toBe(1)
    expect(shouldShowTour()).toBe(false)
  })

  it('remembers a skipped tour too — dismissing it is an answer', async () => {
    await render()
    await act(async () => { button('Skip tour').click() })
    expect(closed).toBe(1)
    expect(shouldShowTour()).toBe(false)
  })
})
