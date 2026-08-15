// @vitest-environment jsdom
//
// Colour themes: the registry, how a choice is applied and persisted, and the
// picker in the top bar.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import {
  THEMES, DEFAULT_THEME, applyTheme, readStoredTheme, storeTheme, themeDef, isThemeId,
} from '../lib/theme'
import ThemeMenu from '../components/layout/ThemeMenu'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const CSS = join(__dirname, '..', 'styles', 'themes.css')

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
})

describe('theme registry', () => {
  it('offers both dark and light themes, each with a unique id', () => {
    const ids = THEMES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(THEMES.some(t => t.mode === 'dark')).toBe(true)
    expect(THEMES.some(t => t.mode === 'light')).toBe(true)
    expect(THEMES.length).toBeGreaterThanOrEqual(6)
  })

  it('describes every theme with a label, a hint and three swatch colours', () => {
    for (const t of THEMES) {
      expect(t.label, t.id).toBeTruthy()
      expect(t.hint, t.id).toBeTruthy()
      expect(t.swatch, t.id).toHaveLength(3)
      for (const colour of t.swatch) expect(colour).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('includes a night mode and a high-contrast option', () => {
    expect(THEMES.find(t => t.id === 'midnight')?.hint).toMatch(/night/i)
    expect(THEMES.find(t => t.id === 'contrast')).toBeDefined()
  })

  it('recognises its own ids and nothing else', () => {
    expect(isThemeId('midnight')).toBe(true)
    expect(isThemeId('chartreuse')).toBe(false)
    expect(isThemeId(null)).toBe(false)
  })

  it('falls back to the first theme for an unknown id', () => {
    expect(themeDef('nope' as never).id).toBe(THEMES[0].id)
  })
})

describe('applying a theme', () => {
  it('stamps the id on <html> and matches the browser colour scheme', () => {
    applyTheme('emerald')
    expect(document.documentElement.getAttribute('data-theme')).toBe('emerald')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    applyTheme('daylight')
    expect(document.documentElement.getAttribute('data-theme')).toBe('daylight')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('carries no attribute for the default, so :root applies unchanged', () => {
    applyTheme('emerald')
    applyTheme(DEFAULT_THEME)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('round-trips through storage, and ignores a stored id it does not know', () => {
    storeTheme('crimson')
    expect(readStoredTheme()).toBe('crimson')
    window.localStorage.setItem('ddo-builder-theme', 'chartreuse')
    expect(readStoredTheme()).toBe(DEFAULT_THEME)
  })

  it('survives storage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => storeTheme('ashen')).not.toThrow()
    spy.mockRestore()
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredTheme()).toBe(DEFAULT_THEME)
    getSpy.mockRestore()
  })
})

describe('themes.css', () => {
  const css = existsSync(CSS) ? readFileSync(CSS, 'utf-8') : ''

  it('defines a palette block for every non-default theme', () => {
    for (const t of THEMES) {
      if (t.id === DEFAULT_THEME) continue
      expect(css, `${t.id} needs a [data-theme] block`).toContain(`[data-theme='${t.id}']`)
    }
  })

  it('gives every palette the surfaces and text tokens the app reads', () => {
    const blocks = css.split(/\[data-theme='/).slice(1)
    for (const block of blocks) {
      const id = block.slice(0, block.indexOf("'"))
      for (const token of [
        '--color-bg-primary', '--color-bg-panel', '--color-text-primary',
        '--color-border', '--color-gold',
      ]) {
        expect(block, `${id} is missing ${token}`).toContain(token)
      }
    }
  })

  it('uses only valid hex colours', () => {
    for (const hex of css.match(/#[0-9a-fA-F]+/g) ?? []) {
      expect([4, 7, 9], `${hex} is not a valid hex colour`).toContain(hex.length)
    }
  })

  it('softens shadows for light themes — the dark defaults read as smudges', () => {
    for (const t of THEMES.filter(x => x.mode === 'light')) {
      const block = css.split(`[data-theme='${t.id}']`)[1]?.split('}')[0] ?? ''
      expect(block, `${t.id} should override --shadow-panel`).toContain('--shadow-panel')
    }
  })
})

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

const mounted: Array<{ root: Root; container: HTMLElement }> = []

function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(React.createElement(ThemeMenu)) })
  mounted.push({ root, container })
  return container
}

afterEach(() => {
  act(() => { for (const m of mounted) m.root.unmount() })
  mounted.length = 0
})

describe('ThemeMenu', () => {
  it('opens to list every theme, grouped dark and light', () => {
    const c = render()
    act(() => { (c.querySelector('button') as HTMLButtonElement).click() })
    const menu = document.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    for (const t of THEMES) expect(menu?.textContent).toContain(t.label)
    expect(menu?.textContent).toContain('Dark')
    expect(menu?.textContent).toContain('Light')
  })

  it('applies and stores the theme that is clicked', () => {
    const c = render()
    act(() => { (c.querySelector('button') as HTMLButtonElement).click() })
    const emerald = [...document.querySelectorAll('[role="menu"] button')]
      .find(b => b.textContent?.includes('Emerald')) as HTMLButtonElement
    act(() => { emerald.click() })
    expect(document.documentElement.getAttribute('data-theme')).toBe('emerald')
    expect(window.localStorage.getItem('ddo-builder-theme')).toBe('emerald')
    expect(emerald.getAttribute('aria-pressed')).toBe('true')
  })

  it('opens with the stored theme already marked', () => {
    storeTheme('arcane')
    const c = render()
    act(() => { (c.querySelector('button') as HTMLButtonElement).click() })
    const pressed = [...document.querySelectorAll('[role="menu"] button')]
      .filter(b => b.getAttribute('aria-pressed') === 'true')
      .map(b => b.textContent)
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toContain('Arcane')
  })

  it('closes on Escape', () => {
    const c = render()
    act(() => { (c.querySelector('button') as HTMLButtonElement).click() })
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })
})
