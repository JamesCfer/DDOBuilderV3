// @vitest-environment jsdom
//
// Floating feedback button: appears only when the server can deliver
// feedback, says "Feedback" in words, and posts the message on Enter.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import FeedbackWidget from '../components/layout/FeedbackWidget'
import { resetApiCacheForTests } from '../api'
import { formatBugReport, ReportRateLimiter } from '../server/bugReport'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

interface Posted { url: string; body: Record<string, unknown> }

let posted: Posted[] = []

function stubApi(opts: { enabled: boolean; postFails?: string }) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const href = String(url)
    if (href.includes('/api/bug-report/config')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ enabled: opts.enabled }) } as Response)
    }
    if (href.includes('/api/version')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '#221' }) } as Response)
    }
    if (href.includes('/api/bug-report')) {
      posted.push({ url: href, body: JSON.parse(String(init?.body ?? '{}')) })
      if (opts.postFails) {
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: opts.postFails }) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
  }))
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []

async function render(page = 'Equipment · Gear') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(FeedbackWidget, { page }))
  })
  mounted.push({ root, container })
  return container
}

beforeEach(() => {
  posted = []
  resetApiCacheForTests()
})

afterEach(() => {
  act(() => { for (const m of mounted) m.root.unmount() })
  mounted.length = 0
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('FeedbackWidget', () => {
  it('shows a button that says Feedback when reporting is configured', async () => {
    stubApi({ enabled: true })
    const c = await render()
    const fab = c.querySelector('button')
    expect(fab).not.toBeNull()
    // The word is on the button itself — the icon-only version was not
    // recognised as something to press.
    expect(c.textContent).toContain('Feedback')
    expect(fab?.getAttribute('aria-label')).toBe('Send feedback — report a bug or suggest an idea')
    expect(c.querySelector('svg')).not.toBeNull()
  })

  it('renders nothing when the server cannot deliver reports', async () => {
    stubApi({ enabled: false })
    const c = await render()
    expect(c.querySelector('button')).toBeNull()
  })

  it('opens a dialog with a description box when clicked', async () => {
    stubApi({ enabled: true })
    const c = await render()
    await act(async () => { (c.querySelector('button') as HTMLButtonElement).click() })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Send feedback')
    // Bugs, ideas and anything else all go through the same box.
    expect(dialog?.textContent).toContain('I have an idea')
    expect(document.querySelector('textarea')).not.toBeNull()
  })

  it('sends the report on Enter, with the page and version as context', async () => {
    stubApi({ enabled: true })
    const c = await render('Equipment · Gear')
    await act(async () => { (c.querySelector('button') as HTMLButtonElement).click() })

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Gear picker forgets my filigrees')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(posted).toHaveLength(1)
    expect(posted[0].body.text).toBe('Gear picker forgets my filigrees')
    expect(posted[0].body.page).toBe('Equipment · Gear')
    expect(posted[0].body.version).toBe('#221')
    expect(posted[0].body.kind).toBe('bug')
    expect(document.body.textContent).toContain('your feedback was sent')
  })

  it('does not send an empty report', async () => {
    stubApi({ enabled: true })
    const c = await render()
    await act(async () => { (c.querySelector('button') as HTMLButtonElement).click() })
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(posted).toHaveLength(0)
  })

  it('surfaces a delivery failure instead of claiming success', async () => {
    stubApi({ enabled: true, postFails: 'Could not deliver the report — please try again later' })
    const c = await render()
    await act(async () => { (c.querySelector('button') as HTMLButtonElement).click() })
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'something broke')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(document.body.textContent).toContain('Could not deliver the report')
    expect(document.body.textContent).not.toContain('your feedback was sent')
  })

  it('sends the chosen kind so an idea is not filed as a bug', async () => {
    stubApi({ enabled: true })
    const c = await render()
    await act(async () => { (c.querySelector('button') as HTMLButtonElement).click() })

    const idea = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('I have an idea')) as HTMLButtonElement
    await act(async () => { idea.click() })

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Let me pin a gear set')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(posted).toHaveLength(1)
    expect(posted[0].body.kind).toBe('idea')
  })
})

describe('ReportRateLimiter', () => {
  it('lets a reporting session through, then throttles a flood', () => {
    const limiter = new ReportRateLimiter(3, 1000)
    expect(limiter.limited('1.2.3.4', 0)).toBe(false)
    expect(limiter.limited('1.2.3.4', 10)).toBe(false)
    expect(limiter.limited('1.2.3.4', 20)).toBe(false)
    expect(limiter.limited('1.2.3.4', 30)).toBe(true)
    // A different reporter is unaffected...
    expect(limiter.limited('5.6.7.8', 30)).toBe(false)
    // ...and the window slides.
    expect(limiter.limited('1.2.3.4', 1100)).toBe(false)
  })
})

describe('formatBugReport', () => {
  it('labels each kind so ideas are not triaged as bugs', () => {
    expect(formatBugReport('nice to have', { kind: 'idea' })).toContain('💡 **Idea**')
    expect(formatBugReport('a question', { kind: 'other' })).toContain('💬 **Feedback**')
    expect(formatBugReport('broken', { kind: 'bug' })).toContain('🐞 **Bug report**')
  })

  it('fences the report so its text cannot break the message or ping anyone', () => {
    const msg = formatBugReport('```\n@everyone look\n```', { page: 'Equipment', version: '#221' })
    expect(msg).toContain('🐞 **Bug report** (page: Equipment, build: #221)')
    // The reporter's own fences are neutralised, leaving exactly one block.
    expect(msg.split('```')).toHaveLength(3)
    expect(msg).toContain("'''")
  })

  it('omits the context parentheses when there is no context', () => {
    expect(formatBugReport('plain')).toBe('🐞 **Bug report**\n```\nplain\n```')
  })
})
