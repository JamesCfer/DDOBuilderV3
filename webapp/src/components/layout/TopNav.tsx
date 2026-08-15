// HeroForge-style top navigation: brand • five page tabs • File/Account
// clusters, with a second row of per-page sub-tabs and a collapsible
// Lives & Builds strip. Replaces the old 30-item left sidebar.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import ThemeMenu from './ThemeMenu'
import styles from './TopNav.module.css'
import { useCharacter } from '../../context/CharacterContext'
import { api } from '../../api'
import ParityBadge from './ParityBadge'

// ---------------------------------------------------------------------------
// Update button (moved from the old Sidebar)
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

function Dropdown({ label, children, alignRight }: {
  label: React.ReactNode
  children: React.ReactNode
  alignRight?: boolean
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
      >
        {label} <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={`${styles.dropdownPanel} ${alignRight ? styles.dropdownRight : ''}`}>
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
  pages: string[]
  activePage: string
  onNavigate: (page: string) => void
  subTabs: string[]
  activeSubTab: string
  onSubTab: (tab: string) => void
  /** Contents of the File ▾ menu (SaveLoadBar). */
  fileMenu: React.ReactNode
  /** Account button / menu node (built by App from auth state). */
  account: React.ReactNode
  /** The Lives & Builds switcher strip (LifeBuildBar). */
  livesBar: React.ReactNode
}

export default function TopNav({
  pages, activePage, onNavigate,
  subTabs, activeSubTab, onSubTab,
  fileMenu, account, livesBar,
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
      {/* Row 1 — brand, pages, file/account */}
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
            >
              {p}
            </button>
          ))}
        </nav>

        <div className={styles.rightCluster}>
          <ParityBadge />
          <Dropdown label="File">
            <div className={styles.fileMenu}>
              {fileMenu}
              <UpdateButton />
            </div>
          </Dropdown>
          <ThemeMenu />
          {account}
        </div>
      </div>

      {/* Row 2 — sub-tabs + character name + lives toggle */}
      <div className={styles.subRow}>
        {/* A page with a single section has nothing to switch between —
            showing one lone tab just adds a row of chrome. */}
        <nav className={styles.subTabs} aria-label="Page sections">
          {(subTabs.length > 1 ? subTabs : []).map(t => (
            <button
              key={t}
              type="button"
              className={`${styles.subTab} ${activeSubTab === t ? styles.subTabActive : ''}`}
              onClick={() => onSubTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className={styles.subRight}>
          {build.name && <span className={styles.charName} title="Current character">{build.name}</span>}
          <button
            type="button"
            className={`${styles.livesToggle} ${livesOpen ? styles.livesToggleOpen : ''}`}
            onClick={toggleLives}
            title="Show / hide the Lives & Builds switcher"
          >
            Lives &amp; Builds {livesOpen ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {/* Row 3 — collapsible Lives & Builds strip */}
      {livesOpen && (
        <div className={styles.livesStrip}>
          {livesBar}
        </div>
      )}
    </header>
  )
}
