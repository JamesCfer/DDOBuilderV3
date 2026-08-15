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
