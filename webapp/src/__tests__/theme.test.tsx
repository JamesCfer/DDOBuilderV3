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
  THEMES, DEFAULT_THEME, CUSTOM_TOKENS, CUSTOM_THEME_ID,
  applyTheme, applyChoice, isCustomChoice, readStoredCustom, readStoredTheme,
  readStoredChoice, sanitizeCustom, storeCustom, storeTheme, themeDef, isThemeId,
} from '../lib/theme'
import ThemeMenu from '../components/layout/ThemeMenu'
import { AuthProvider } from '../context/AuthContext'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const CSS = join(__dirname, '..', 'styles', 'themes.css')

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
  for (const { token } of CUSTOM_TOKENS) document.documentElement.style.removeProperty(token)
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
  // ThemeMenu reads the signed-in account to decide where to save; with no
  // stored token the provider settles synchronously as signed-out.
  act(() => {
    root.render(React.createElement(AuthProvider, null, React.createElement(ThemeMenu)))
  })
  mounted.push({ root, container })
  return container
}

/**
 * Set a controlled <input> the way a user would. React tracks the last value it
 * wrote, so assigning `.value` directly is swallowed as "no change" — going
 * through the prototype setter is what makes onChange fire.
 */
function pick(input: HTMLInputElement, colour: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, colour)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Open the menu and step into the custom-colour editor. */
function openEditor(c: HTMLElement) {
  act(() => { (c.querySelector('button') as HTMLButtonElement).click() })
  const custom = [...document.querySelectorAll('[role="menu"] button')]
    .find(b => b.textContent?.includes('Custom')) as HTMLButtonElement
  act(() => { custom.click() })
  return [...document.querySelectorAll('[role="menu"] input[type="color"]')] as HTMLInputElement[]
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

// ---------------------------------------------------------------------------
// Custom palettes
// ---------------------------------------------------------------------------

describe('sanitizeCustom', () => {
  it('keeps known tokens carrying a hex colour', () => {
    expect(sanitizeCustom({ '--color-gold': '#44ff88' })).toEqual({ '--color-gold': '#44ff88' })
    expect(sanitizeCustom({ '--color-gold': ' #fff ' })).toEqual({ '--color-gold': '#fff' })
  })

  it('drops tokens the editor does not expose, and anything that is not a colour', () => {
    expect(sanitizeCustom({
      '--color-gold': '#44ff88',
      '--not-a-token': '#000000',
      '--color-border': 'url(evil.css)',
      '--color-bg-panel': 42,
    })).toEqual({ '--color-gold': '#44ff88' })
  })

  it('returns undefined when nothing survives, or the input is not an object', () => {
    expect(sanitizeCustom({ '--color-gold': 'red' })).toBeUndefined()
    expect(sanitizeCustom({})).toBeUndefined()
    expect(sanitizeCustom(null)).toBeUndefined()
    expect(sanitizeCustom('#fff')).toBeUndefined()
  })
})

describe('applyChoice', () => {
  const root = () => document.documentElement

  it('applies a preset with no inline overrides left behind', () => {
    applyChoice({ id: 'emerald' })
    expect(root().getAttribute('data-theme')).toBe('emerald')
    expect(root().style.getPropertyValue('--color-gold')).toBe('')
  })

  it('layers custom colours on top of the base preset', () => {
    applyChoice({ id: CUSTOM_THEME_ID, base: 'crimson', custom: { '--color-gold': '#44ff88' } })
    expect(root().getAttribute('data-theme')).toBe('crimson')
    expect(root().style.getPropertyValue('--color-gold')).toBe('#44ff88')
  })

  it('clears the previous overrides when switching back to a preset', () => {
    applyChoice({ id: CUSTOM_THEME_ID, base: 'crimson', custom: { '--color-gold': '#44ff88' } })
    applyChoice({ id: 'ashen' })
    expect(root().style.getPropertyValue('--color-gold')).toBe('')
    expect(root().getAttribute('data-theme')).toBe('ashen')
  })

  it('treats an empty custom palette as its base preset', () => {
    expect(isCustomChoice({ id: CUSTOM_THEME_ID, base: 'ashen', custom: {} })).toBe(false)
    applyChoice({ id: CUSTOM_THEME_ID, base: 'ashen', custom: {} })
    expect(root().getAttribute('data-theme')).toBe('ashen')
  })

  it('falls back to the default when the base is unknown', () => {
    applyChoice({ id: CUSTOM_THEME_ID, base: 'chartreuse' as never, custom: { '--color-gold': '#fff' } })
    expect(root().hasAttribute('data-theme')).toBe(false)   // default carries none
    expect(root().style.getPropertyValue('--color-gold')).toBe('#fff')
  })

  it('round-trips a custom palette through storage, sanitising on the way back', () => {
    storeCustom({ '--color-gold': '#44ff88' })
    expect(readStoredCustom()).toEqual({ '--color-gold': '#44ff88' })
    storeCustom(undefined)
    expect(readStoredCustom()).toBeUndefined()
    window.localStorage.setItem('ddo-builder-theme-custom', '{ not json')
    expect(readStoredCustom()).toBeUndefined()
    window.localStorage.setItem('ddo-builder-theme-custom', JSON.stringify({ '--evil': '#000' }))
    expect(readStoredCustom()).toBeUndefined()
  })
})

describe('readStoredChoice — what a page reload restores', () => {
  it('gives back the preset when no custom palette is saved', () => {
    storeTheme('emerald')
    expect(readStoredChoice()).toEqual({ id: 'emerald' })
  })

  it('gives back the custom palette over the preset it was mixed on', () => {
    storeTheme('emerald')
    storeCustom({ '--color-gold': '#44ff88' })
    expect(readStoredChoice()).toEqual({
      id: CUSTOM_THEME_ID, base: 'emerald', custom: { '--color-gold': '#44ff88' },
    })
    // The bootstrap path: applying it must put the overrides back on <html>.
    applyChoice(readStoredChoice())
    expect(document.documentElement.style.getPropertyValue('--color-gold')).toBe('#44ff88')
    expect(document.documentElement.getAttribute('data-theme')).toBe('emerald')
  })
})

describe('ThemeMenu custom editor', () => {
  it('offers a colour picker for every exposed token', () => {
    const inputs = openEditor(render())
    expect(inputs).toHaveLength(CUSTOM_TOKENS.length)
    const menu = document.querySelector('[role="menu"]')
    for (const t of CUSTOM_TOKENS) expect(menu?.textContent).toContain(t.label)
  })

  it('applies and stores a colour the moment it is picked', () => {
    const inputs = openEditor(render())
    expect(CUSTOM_TOKENS[0].token).toBe('--color-bg-primary')
    pick(inputs[0], '#123456')
    expect(document.documentElement.style.getPropertyValue('--color-bg-primary')).toBe('#123456')
    expect(readStoredCustom()).toEqual({ '--color-bg-primary': '#123456' })
  })

  it('mixes on top of the preset that was selected, and keeps it stored', () => {
    storeTheme('emerald')
    const inputs = openEditor(render())
    pick(inputs[0], '#123456')
    expect(document.documentElement.getAttribute('data-theme')).toBe('emerald')
    expect(window.localStorage.getItem('ddo-builder-theme')).toBe('emerald')
  })

  it('resets back to the base preset, dropping the overrides', () => {
    storeTheme('emerald')
    const c = render()
    const inputs = openEditor(c)
    pick(inputs[0], '#123456')
    const reset = [...document.querySelectorAll('[role="menu"] button')]
      .find(b => b.textContent?.startsWith('Reset to')) as HTMLButtonElement
    expect(reset.textContent).toContain('emerald')
    act(() => { reset.click() })
    expect(document.documentElement.style.getPropertyValue('--color-bg-primary')).toBe('')
    expect(readStoredCustom()).toBeUndefined()
    expect(document.documentElement.getAttribute('data-theme')).toBe('emerald')
  })

  it('reopens with the stored custom palette in place', () => {
    storeTheme('arcane')
    storeCustom({ '--color-gold': '#44ff88' })
    const c = render()
    act(() => { (c.querySelector('button') as HTMLButtonElement).click() })
    const custom = [...document.querySelectorAll('[role="menu"] button')]
      .find(b => b.textContent?.includes('Custom')) as HTMLButtonElement
    expect(custom.getAttribute('aria-pressed')).toBe('true')
    // No preset is marked while a custom palette is in use.
    const pressedPresets = [...document.querySelectorAll('[role="menu"] button')]
      .filter(b => b.getAttribute('aria-pressed') === 'true')
    expect(pressedPresets).toHaveLength(1)
  })

  it('tells a signed-out user the palette is only kept in this browser', () => {
    openEditor(render())
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('sign in')
  })
})
