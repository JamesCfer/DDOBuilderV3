// Colour theme registry, applied as a `data-theme` attribute on <html>.
//
// Every palette lives in styles/themes.css as a [data-theme] block overriding
// the token set from theme.css. Nothing here knows any colours except the
// three swatches each entry shows in the picker, so adding a theme is a CSS
// block plus one entry in THEMES.

export type ThemeId =
  | 'twilight' | 'midnight' | 'ashen' | 'emerald' | 'crimson' | 'arcane'
  | 'parchment' | 'daylight' | 'contrast'

export interface ThemeDef {
  id: ThemeId
  label: string
  /** One line in the picker: when you would want this one. */
  hint: string
  /** Dark themes are grouped apart from light ones in the menu. */
  mode: 'dark' | 'light'
  /** background, panel, accent — drawn as the preview dot in the menu. */
  swatch: [string, string, string]
}

export const THEMES: readonly ThemeDef[] = [
  {
    id: 'twilight', label: 'Twilight', mode: 'dark',
    hint: 'Navy and gold — the original',
    swatch: ['#07080f', '#111628', '#d4982a'],
  },
  {
    id: 'midnight', label: 'Midnight', mode: 'dark',
    hint: 'True black, dimmed accents — night mode',
    swatch: ['#000000', '#0b0b10', '#b8862a'],
  },
  {
    id: 'ashen', label: 'Ashen', mode: 'dark',
    hint: 'Neutral graphite and steel',
    swatch: ['#0d0d0f', '#1a1a1e', '#7fa8d4'],
  },
  {
    id: 'emerald', label: 'Emerald', mode: 'dark',
    hint: 'Deep forest and jade',
    swatch: ['#060c09', '#0f1d17', '#4fbd8a'],
  },
  {
    id: 'crimson', label: 'Crimson', mode: 'dark',
    hint: 'Dark maroon and ember',
    swatch: ['#0d0607', '#1e1013', '#e06a4a'],
  },
  {
    id: 'arcane', label: 'Arcane', mode: 'dark',
    hint: 'Indigo depth and amethyst',
    swatch: ['#08060f', '#150f28', '#a878f0'],
  },
  {
    id: 'parchment', label: 'Parchment', mode: 'light',
    hint: 'Aged paper and ink',
    swatch: ['#ece3d0', '#faf4e6', '#8a6412'],
  },
  {
    id: 'daylight', label: 'Daylight', mode: 'light',
    hint: 'Clean and bright',
    swatch: ['#e8eaef', '#ffffff', '#1f5fa8'],
  },
  {
    id: 'contrast', label: 'High Contrast', mode: 'dark',
    hint: 'Maximum separation for low vision',
    swatch: ['#000000', '#0a0a0a', '#ffd400'],
  },
]

export const DEFAULT_THEME: ThemeId = 'twilight'

const STORAGE_KEY = 'ddo-builder-theme'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some(t => t.id === value)
}

export function themeDef(id: ThemeId): ThemeDef {
  return THEMES.find(t => t.id === id) ?? THEMES[0]
}

/** The saved theme, or the default when nothing is stored or it is unknown. */
export function readStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemeId(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME          // private mode / storage disabled
  }
}

/**
 * Put the theme on <html>. The default carries no attribute, so :root's own
 * tokens apply and there is one less thing to keep in sync.
 */
export function applyTheme(id: ThemeId): void {
  const root = document.documentElement
  if (id === DEFAULT_THEME) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', id)
  // Lets the browser theme form controls and scrollbars to match.
  root.style.colorScheme = themeDef(id).mode
}

export function storeTheme(id: ThemeId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* not persisting is survivable — the choice still applies this session */
  }
}

// ---------------------------------------------------------------------------
// Custom palettes
// ---------------------------------------------------------------------------
// A custom theme is the preset it started from plus overrides for the handful
// of tokens worth exposing. The overrides are applied as inline custom
// properties on <html>, so they win over any [data-theme] block without
// generating a stylesheet.

/** The tokens the editor exposes, in the order it shows them. */
export const CUSTOM_TOKENS: ReadonlyArray<{ token: string; label: string; hint: string }> = [
  { token: '--color-bg-primary', label: 'Page', hint: 'Behind everything' },
  { token: '--color-bg-panel', label: 'Panel', hint: 'Cards and dialogs' },
  { token: '--color-bg-secondary', label: 'Panel header', hint: 'Headers and toolbars' },
  { token: '--color-bg-input', label: 'Input', hint: 'Fields and pickers' },
  { token: '--color-text-primary', label: 'Text', hint: 'Main reading colour' },
  { token: '--color-text-secondary', label: 'Muted text', hint: 'Labels and hints' },
  { token: '--color-gold', label: 'Accent', hint: 'Highlights and actions' },
  { token: '--color-border', label: 'Border', hint: 'Panel edges and rules' },
]

export const CUSTOM_THEME_ID = 'custom'

export interface ThemeChoice {
  /** Preset id, or 'custom'. */
  id: string
  /** Which preset a custom palette was mixed on top of — tokens the user did
   *  not touch still come from a coherent palette. */
  base?: ThemeId
  /** Token → colour, only when id is 'custom'. */
  custom?: Record<string, string>
}

const CUSTOM_KEY = 'ddo-builder-theme-custom'

/** A custom palette is only meaningful with at least one override. */
export function isCustomChoice(choice: ThemeChoice): boolean {
  return choice.id === CUSTOM_THEME_ID && !!choice.custom && Object.keys(choice.custom).length > 0
}

export function readStoredCustom(): Record<string, string> | undefined {
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    return sanitizeCustom(parsed)
  } catch {
    return undefined
  }
}

export function storeCustom(custom: Record<string, string> | undefined): void {
  try {
    if (custom && Object.keys(custom).length > 0) {
      window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom))
    } else {
      window.localStorage.removeItem(CUSTOM_KEY)
    }
  } catch {
    /* not persisting is survivable */
  }
}

/** Keep only known tokens carrying a hex colour — the same rule the server applies. */
export function sanitizeCustom(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const allowed = new Set(CUSTOM_TOKENS.map(t => t.token))
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(value.trim())) continue
    out[key] = value.trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Apply a full choice: the preset's palette, then any custom overrides on top.
 * Overrides from a previous choice are always cleared first, so switching back
 * to a preset really does drop them.
 */
export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement
  for (const { token } of CUSTOM_TOKENS) root.style.removeProperty(token)

  if (isCustomChoice(choice)) {
    // Custom starts from the base it was mixed on, so untouched tokens still
    // come from a coherent palette rather than the default.
    applyTheme(isThemeId(choice.base) ? choice.base : DEFAULT_THEME)
    for (const [token, colour] of Object.entries(choice.custom ?? {})) {
      root.style.setProperty(token, colour)
    }
    return
  }
  // A 'custom' choice with nothing overridden is just its base preset — falling
  // back to the app default here would silently discard the palette behind it.
  if (choice.id === CUSTOM_THEME_ID) {
    applyTheme(isThemeId(choice.base) ? choice.base : DEFAULT_THEME)
    return
  }
  applyTheme(isThemeId(choice.id) ? choice.id : DEFAULT_THEME)
}

/** This browser's saved choice — preset, or custom palette over its base. */
export function readStoredChoice(): ThemeChoice {
  const id = readStoredTheme()
  const custom = readStoredCustom()
  return custom ? { id: CUSTOM_THEME_ID, base: id, custom } : { id }
}

/** The colour a token currently resolves to, for seeding the editor. */
export function currentTokenValue(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#888888'
}
