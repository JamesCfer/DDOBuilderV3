// Theme picker for the top bar, between the File menu and the account button.
//
// Presets apply on click with no confirm step: the whole page recolours
// instantly, so the preview IS the app. "Custom" opens colour pickers for the
// handful of tokens worth exposing, mixed on top of whichever preset is
// selected.
//
// Where the choice is saved depends on who is asking. Signed in, it goes to the
// account so the colours follow the user to another browser; signed out (or if
// the save fails) localStorage keeps it for this browser. The local copy is
// always written, so a sign-out never loses the palette.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { communityApi } from '../../lib/community/api'
import {
  THEMES, CUSTOM_TOKENS, CUSTOM_THEME_ID, DEFAULT_THEME,
  applyChoice, currentTokenValue, isThemeId, readStoredChoice,
  sanitizeCustom, storeCustom, storeTheme,
  type ThemeChoice, type ThemeId,
} from '../../lib/theme'
import styles from './ThemeMenu.module.css'

export default function ThemeMenu() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [choice, setChoice] = useState<ThemeChoice>(readStoredChoice)
  const ref = useRef<HTMLDivElement>(null)

  // A signed-in account's saved appearance wins over this browser's copy.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    communityApi.myTheme()
      .then(({ theme }) => {
        if (cancelled || !theme) return
        const custom = sanitizeCustom(theme.custom)
        const base = isThemeId(theme.base) ? theme.base : DEFAULT_THEME
        const next: ThemeChoice = custom
          ? { id: CUSTOM_THEME_ID, base, custom }
          : { id: isThemeId(theme.id) ? theme.id : DEFAULT_THEME }
        setChoice(next)
        applyChoice(next)
        persistLocally(next)
      })
      .catch(() => { /* offline or signed out — the local copy stands */ })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setEditing(false) }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setEditing(false) }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function persistLocally(next: ThemeChoice) {
    storeTheme((next.id === CUSTOM_THEME_ID ? next.base : next.id as ThemeId) ?? DEFAULT_THEME)
    storeCustom(next.id === CUSTOM_THEME_ID ? next.custom : undefined)
  }

  function commit(next: ThemeChoice) {
    setChoice(next)
    applyChoice(next)
    persistLocally(next)
    if (user) {
      communityApi.saveMyTheme({ id: next.id, base: next.base, custom: next.custom })
        .catch(() => { /* saved locally regardless */ })
    }
  }

  function choosePreset(id: ThemeId) {
    commit({ id })
    setEditing(false)
  }

  function editColour(token: string, colour: string) {
    const base = (choice.id === CUSTOM_THEME_ID ? choice.base : choice.id as ThemeId) ?? DEFAULT_THEME
    commit({
      id: CUSTOM_THEME_ID,
      base,
      custom: { ...(choice.custom ?? {}), [token]: colour },
    })
  }

  const isCustom = choice.id === CUSTOM_THEME_ID
  const baseId = (isCustom ? choice.base : choice.id as ThemeId) ?? DEFAULT_THEME

  const presets = (label: string, mode: 'dark' | 'light') => (
    <div className={styles.group} key={label}>
      <div className={styles.groupLabel}>{label}</div>
      {THEMES.filter(t => t.mode === mode).map(t => (
        <button
          key={t.id}
          type="button"
          className={`${styles.option} ${!isCustom && t.id === choice.id ? styles.optionActive : ''}`}
          onClick={() => choosePreset(t.id)}
          aria-pressed={!isCustom && t.id === choice.id}
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
          {!isCustom && t.id === choice.id && <span className={styles.check} aria-hidden="true">✓</span>}
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

          {!editing && (
            <>
              {presets('Dark', 'dark')}
              {presets('Light', 'light')}
              <div className={styles.group}>
                <button
                  type="button"
                  className={`${styles.option} ${isCustom ? styles.optionActive : ''}`}
                  onClick={() => setEditing(true)}
                  aria-pressed={isCustom}
                >
                  <span className={styles.swatch} aria-hidden="true">
                    {CUSTOM_TOKENS.slice(0, 3).map(t => (
                      <span
                        key={t.token}
                        className={styles.swatchDot}
                        style={{ background: choice.custom?.[t.token] ?? currentTokenValue(t.token) }}
                      />
                    ))}
                  </span>
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>Custom…</span>
                    <span className={styles.optionHint}>
                      {isCustom ? 'Your own palette' : `Mix your own on ${baseId}`}
                    </span>
                  </span>
                  {isCustom && <span className={styles.check} aria-hidden="true">✓</span>}
                </button>
              </div>
            </>
          )}

          {editing && (
            <div className={styles.editor}>
              <div className={styles.editorNote}>
                {user
                  ? `Saved to ${user.username}`
                  : 'Saved in this browser — sign in to keep it across devices'}
              </div>
              {CUSTOM_TOKENS.map(t => {
                const value = choice.custom?.[t.token] ?? currentTokenValue(t.token)
                return (
                  <label key={t.token} className={styles.colourRow}>
                    <input
                      type="color"
                      className={styles.colourInput}
                      value={value.length === 7 ? value : '#888888'}
                      onChange={e => editColour(t.token, e.target.value)}
                      aria-label={t.label}
                    />
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>{t.label}</span>
                      <span className={styles.optionHint}>{t.hint}</span>
                    </span>
                    <span className={styles.colourValue}>{value}</span>
                  </label>
                )
              })}
              <div className={styles.editorActions}>
                <button
                  type="button"
                  className={styles.editorBtn}
                  onClick={() => setEditing(false)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={styles.editorBtn}
                  onClick={() => { commit({ id: baseId }); setEditing(false) }}
                  disabled={!isCustom}
                >
                  Reset to {baseId}
                </button>
              </div>
            </div>
          )}
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
