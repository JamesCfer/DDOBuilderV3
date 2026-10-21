// @vitest-environment jsdom
//
// A tester's tab, opened before the live server rebuilt itself, failed every
// window on the Character page ("Everything is failing to load"): each panel
// is a lazily loaded file named by a content hash, and the rebuild had
// replaced them. A failed panel load must reload into the new build once, and
// never loop.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isChunkLoadError, reloadForNewVersion } from '../lib/staleBundle'

describe('stale bundle recovery', () => {
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
  })

  it('recognises the browsers\' failed lazy load errors', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Skills-pj4waipe.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  it('reloads once, then stops so a missing file cannot loop', () => {
    expect(reloadForNewVersion()).toBe(true)
    expect(reloadForNewVersion()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
