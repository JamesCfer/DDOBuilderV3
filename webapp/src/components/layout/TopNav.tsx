// Top navigation: brand • the four pages (Character, Crafting, Community,
// Plugins) • File / theme / account, with a collapsible Lives & Builds strip.
// The per-page tabs live in the workspace bar below the header, next to the
// window tools they belong with.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import ThemeMenu from './ThemeMenu'
import styles from './TopNav.module.css'
import { useCharacter } from '../../context/CharacterContext'
import { api } from '../../api'
import ParityBadge from './ParityBadge'

// ---------------------------------------------------------------------------
// Update button
// ---------------------------------------------------------------------------

interface UpdateInfo {
  upToDate: boolean
  commits: string[]
  error?: string
}

function UpdateButton() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'behind' | 'upToDate' | 'updating' | 'error'>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  const checkUpdate = useCallback(async () => {
    setStatus('checking')
    try {
      const res = await fetch('/api/update/check')
      const data: UpdateInfo = await res.json()
      setInfo(data)
      setStatus(data.upToDate ? 'upToDate' : 'behind')
    } catch {
      setStatus('error')
      setInfo({ upToDate: false, commits: [], error: 'Network error' })
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    setStatus('updating')
    try {
      await fetch('/api/update/apply', { method: 'POST' })
      const poll = setInterval(async () => {
        try {
          const r = await fetch('/api/health')
          if (r.ok) { clearInterval(poll); window.location.reload() }
        } catch { /* still restarting */ }
      }, 2000)
    } catch {
      setStatus('error')
    }
  }, [])

  return (
    <div className={styles.updateWrap}>
      <button
        type="button"
        className={styles.menuItem}
        onClick={status === 'behind' ? applyUpdate : checkUpdate}
        disabled={status === 'checking' || status === 'updating'}
      >
        {status === 'checking' && '⟳ Checking…'}
        {status === 'updating' && '⟳ Updating…'}
        {status === 'idle' && '↑ Check for Update'}
        {status === 'upToDate' && '✓ Up to date'}
        {status === 'behind' && `↑ Apply ${info?.commits.length} update${info?.commits.length !== 1 ? 's' : ''}`}
        {status === 'error' && '⚠ Check failed'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dropdown helper — closes on outside click / Escape
// ---------------------------------------------------------------------------

export function Dropdown({ label, children, alignRight, title }: {
  label: React.ReactNode
  children: React.ReactNode
  alignRight?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.dropdownBtn} ${open ? styles.dropdownBtnOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={title}
      >
        {label} <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div
          className={`${styles.dropdownPanel} ${alignRight ? styles.dropdownRight : ''}`}
          onClick={e => { if ((e.target as HTMLElement).closest('[data-closes-menu]')) setOpen(false) }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TopNav
// ---------------------------------------------------------------------------

const LIVES_OPEN_KEY = 'ddo-builder-lives-open'

export interface TopNavProps {
  pages: readonly string[]
  activePage: string
  onNavigate: (page: string) => void
  /** Contents of the File ▾ menu (SaveLoadBar). */
  fileMenu: React.ReactNode
  /** Contents of the Tools ▾ menu (settings, content, help…). */
  toolsMenu?: React.ReactNode
  /** Account button / menu node (built by App from auth state). */
  account: React.ReactNode
  /** The Lives & Builds switcher strip (LifeBuildBar). */
  livesBar: React.ReactNode
}

export default function TopNav({
  pages, activePage, onNavigate,
  fileMenu, toolsMenu, account, livesBar,
}: TopNavProps) {
  const { build } = useCharacter()
  // Never display the literal 'unknown' sentinel — hide the badge instead.
  const [version, setVersion] = useState<string>(
    typeof __BUILDER_VERSION__ !== 'undefined' && __BUILDER_VERSION__ !== 'unknown'
      ? __BUILDER_VERSION__ : ''
  )
  const [livesOpen, setLivesOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(LIVES_OPEN_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    let cancelled = false
    api.version()
      .then(v => {
        if (!cancelled && v?.version && v.version !== 'unknown') setVersion(v.version)
      })
      .catch(() => { /* keep build-time version */ })
    return () => { cancelled = true }
  }, [])

  function toggleLives() {
    setLivesOpen(o => {
      try { localStorage.setItem(LIVES_OPEN_KEY, o ? '0' : '1') } catch { /* ignore */ }
      return !o
    })
  }

  return (
    <header className={styles.header}>
      <div className={styles.topRow}>
        <div className={styles.brand}>
          <span className={styles.brandName}>DDO Builder</span>
          <span className={styles.brandBadge}>v3</span>
          {version && <span className={styles.brandVersion}>{version}</span>}
        </div>

        <nav className={styles.pageTabs} aria-label="Main pages">
          {pages.map(p => (
            <button
              key={p}
              type="button"
              className={`${styles.pageTab} ${activePage === p ? styles.pageTabActive : ''}`}
              onClick={() => onNavigate(p)}
              aria-current={activePage === p ? 'page' : undefined}
            >
              {p}
            </button>
          ))}
        </nav>

        <div className={styles.rightCluster}>
          {build.name && <span className={styles.charName} title="Current character">{build.name}</span>}
          <button
            type="button"
            className={`${styles.livesToggle} ${livesOpen ? styles.livesToggleOpen : ''}`}
            onClick={toggleLives}
            title="Show / hide the Lives & Builds switcher"
            aria-expanded={livesOpen}
          >
            Lives &amp; Builds {livesOpen ? '▴' : '▾'}
          </button>
          <ParityBadge />
          <Dropdown label="File">
            <div className={styles.fileMenu}>
              {fileMenu}
              <UpdateButton />
            </div>
          </Dropdown>
          {toolsMenu && (
            <Dropdown label="Tools" alignRight title="Settings, content, help">
              <div className={styles.fileMenu}>{toolsMenu}</div>
            </Dropdown>
          )}
          <ThemeMenu />
          {account}
        </div>
      </div>

      {livesOpen && (
        <div className={styles.livesStrip}>
          {livesBar}
        </div>
      )}
    </header>
  )
}
