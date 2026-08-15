// Theme picker for the top bar, between the File menu and the account button.
//
// Applies on click with no confirm step: the whole page recolours instantly, so
// the preview IS the app. The choice persists in localStorage and is re-applied
// before first paint (see main.tsx), so a reload never flashes the old palette.

import { useEffect, useRef, useState } from 'react'
import {
  THEMES, applyTheme, readStoredTheme, storeTheme, type ThemeId,
} from '../../lib/theme'
import styles from './ThemeMenu.module.css'

export default function ThemeMenu() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeId>(() => readStoredTheme())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(id: ThemeId) {
    applyTheme(id)
    storeTheme(id)
    setTheme(id)
  }

  const dark = THEMES.filter(t => t.mode === 'dark')
  const light = THEMES.filter(t => t.mode === 'light')

  const group = (label: string, list: typeof THEMES) => (
    <div className={styles.group} key={label}>
      <div className={styles.groupLabel}>{label}</div>
      {list.map(t => (
        <button
          key={t.id}
          type="button"
          className={`${styles.option} ${t.id === theme ? styles.optionActive : ''}`}
          onClick={() => choose(t.id)}
          aria-pressed={t.id === theme}
        >
          <span className={styles.swatch} aria-hidden="true">
            {t.swatch.map((c, i) => (
              <span key={i} className={styles.swatchDot} style={{ background: c }} />
            ))}
          </span>
          <span className={styles.optionText}>
            <span className={styles.optionLabel}>{t.label}</span>
            <span className={styles.optionHint}>{t.hint}</span>
          </span>
          {t.id === theme && <span className={styles.check} aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  )

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Appearance"
      >
        <GearIcon />
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={styles.panel} role="menu" aria-label="Colour theme">
          <div className={styles.title}>Appearance</div>
          {group('Dark', dark)}
          {group('Light', light)}
        </div>
      )}
    </div>
  )
}

function GearIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
      </g>
    </svg>
  )
}
