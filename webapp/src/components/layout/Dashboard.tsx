// Custom › Windows (V2 main-frame docking-panes parity): the user adds any
// panel as a floating window, drags it by its title bar, resizes it from the
// corner (native CSS resize), and the layout persists.
//
// Windows default to AUTO-FIT content scaling: the panel is scaled down (never
// up past 100%) so its natural width fits the window. Pressing −/+ switches to
// a manual zoom; clicking the % readout returns to auto. Each window also has
// maximize/restore, and the canvas grows in BOTH axes as windows are dragged
// outward, so a wide monitor is fully usable ("Reset Layout" matches V2's
// View → Reset Screen Layout).

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import styles from './Dashboard.module.css'

// Lazy panel registry — same components the nav routes render.
const REGISTRY: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'Character Info': lazy(() => import('../builder/CharacterInfo')),
  'Race': lazy(() => import('../builder/RaceSelector')),
  'Classes': lazy(() => import('../builder/ClassSelector')),
  'Ability Scores': lazy(() => import('../builder/AbilityScores')),
  'Ability Level Ups': lazy(() => import('../builder/AbilityLevelUps')),
  'Stats': lazy(() => import('../builder/StatsPanel')),
  'Feats': lazy(() => import('../builder/FeatSlots')),
  'Automatic Feats': lazy(() => import('../builder/AutomaticFeats')),
  'Skills': lazy(() => import('../builder/Skills')),
  'Level Training': lazy(() => import('../builder/LevelTrainingPanel')),
  'Spells': lazy(() => import('../builder/SpellsPanel')),
  'Tomes': lazy(() => import('../builder/TomesPanel')),
  'Enhancements': lazy(() => import('../enhancements/EnhancementTreePanel')),
  'Epic Destinies': lazy(() => import('../epicdestinies/EpicDestiniesPanel')),
  'Reaper': lazy(() => import('../reaper/ReaperPanel')),
  'Gear': lazy(() => import('../items/GearPanel')),
  'Clickies': lazy(() => import('../items/ClickiesPanel')),
  'Breakdowns': lazy(() => import('../breakdowns/BreakdownsPanel')),
  'Combat': lazy(() => import('../combat/CombatPanel')),
  'DCs': lazy(() => import('../dc/DCPanel')),
  'Stances': lazy(() => import('../stances/StancesPanel')),
  'Self Buffs': lazy(() => import('../buffs/SelfBuffsPanel')),
  'Guild Buffs': lazy(() => import('../guildbuffs/GuildBuffsPanel')),
  'Past Lives': lazy(() => import('../pastlives/PastLivesPanel')),
  'Favor': lazy(() => import('../favor/FavorPanel')),
  'Filigrees': lazy(() => import('../filigree/FiligreePanel')),
  'Set Bonuses': lazy(() => import('../setbonuses/SetBonusesPanel')),
  'Bonuses': lazy(() => import('../bonuses/BonusesPanel')),
  'Notes': lazy(() => import('../notes/NotesPanel')),
  'Forum Export': lazy(() => import('../export/ForumExportPanel')),
  'Build Log': lazy(() => import('./BuildHistoryPanel')),
}

interface Win {
  id: string
  panel: string
  x: number
  y: number
  w: number
  h: number
  /** Content zoom: 'auto' scales to fit the window width (≤100%); a number
   *  is a user-chosen manual factor. */
  zoom: number | 'auto'
  /** Pre-maximize rect, present while the window is maximized. */
  prev?: { x: number; y: number; w: number; h: number }
}

// Layouts are per-account: signing in on a shared browser should not inherit
// (or overwrite) somebody else's arrangement. Signed-out work stays under the
// bare key, and a freshly signed-in account inherits it once as its starting
// point rather than being dropped onto the default layout.
const LAYOUT_KEY = 'ddo-builder-dashboard'

function layoutKey(userId: string | null): string {
  return userId ? `${LAYOUT_KEY}:${userId}` : LAYOUT_KEY
}

const DEFAULT_LAYOUT: Win[] = [
  { id: 'w1', panel: 'Character Info', x: 8, y: 8, w: 340, h: 260, zoom: 'auto' },
  { id: 'w2', panel: 'Classes', x: 8, y: 276, w: 340, h: 300, zoom: 'auto' },
  { id: 'w3', panel: 'Stats', x: 8, y: 584, w: 340, h: 320, zoom: 'auto' },
  { id: 'w4', panel: 'Feats', x: 356, y: 8, w: 560, h: 440, zoom: 'auto' },
  { id: 'w5', panel: 'Enhancements', x: 356, y: 456, w: 860, h: 520, zoom: 'auto' },
  { id: 'w6', panel: 'Breakdowns', x: 924, y: 8, w: 420, h: 440, zoom: 'auto' },
]

function parseLayout(raw: string | null): Win[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    // An empty array is a REAL layout — the user closed every window. Treat it
    // as such instead of falling through to the default, which is how closing
    // the last window used to bring six of them back.
    if (Array.isArray(parsed) && parsed.every(w => w && typeof w.panel === 'string')) {
      return (parsed as Win[]).map(w => ({ ...w, zoom: w.zoom ?? 'auto' }))
    }
  } catch { /* not usable */ }
  return null
}

function readLayout(userId: string | null): Win[] {
  const own = parseLayout(localStorage.getItem(layoutKey(userId)))
  if (own) return own
  // First run for this account: adopt whatever was arranged while signed out.
  if (userId) {
    const anon = parseLayout(localStorage.getItem(LAYOUT_KEY))
    if (anon) return anon
  }
  return DEFAULT_LAYOUT
}

function writeLayout(userId: string | null, wins: Win[]) {
  try { localStorage.setItem(layoutKey(userId), JSON.stringify(wins)) } catch { /* ignore */ }
}

let nextId = Date.now()

const ZOOM_MIN = 0.4
const ZOOM_MAX = 2

function DashboardWindow({
  win, focused, onMove, onResize, onZoom, onMaximize, onClose, onFocus, z,
}: {
  win: Win
  z: number
  focused: boolean
  onMove: (x: number, y: number) => void
  onResize: (w: number, h: number) => void
  onZoom: (zoom: number | 'auto') => void
  onMaximize: () => void
  onClose: () => void
  onFocus: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  // Effective factor while in auto mode (fit-to-width, never above 100%).
  const [autoZoom, setAutoZoom] = useState(1)

  // Persist native CSS resizes.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (Math.abs(r.width - win.w) > 2 || Math.abs(r.height - win.h) > 2) {
        onResize(Math.round(r.width), Math.round(r.height))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.w, win.h])

  // Auto-fit: scale the content down until its natural width fits the body.
  // The inner div carries CSS `zoom`, so its scrollWidth stays in the panel's
  // own (unscaled) units — fit = bodyWidth / naturalWidth, clamped ≤ 1.
  useEffect(() => {
    if (win.zoom !== 'auto') return
    const body = bodyRef.current
    const inner = innerRef.current
    if (!body || !inner || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const natural = inner.scrollWidth
        if (natural <= 0) return
        const fit = Math.min(1, Math.max(ZOOM_MIN, (body.clientWidth - 2) / natural))
        // Quantize to 2% steps so measurement jitter can't oscillate.
        const q = Math.round(fit * 50) / 50
        setAutoZoom(prev => (Math.abs(prev - q) >= 0.02 ? q : prev))
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(body)
    ro.observe(inner)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [win.zoom, win.w, win.h, win.panel])

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: win.x, baseY: win.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    onMove(Math.max(0, drag.current.baseX + dx), Math.max(0, drag.current.baseY + dy))
  }
  function onPointerUp() { drag.current = null }

  const Component = REGISTRY[win.panel]
  const isAuto = win.zoom === 'auto'
  const effectiveZoom = isAuto ? autoZoom : (win.zoom as number)
  const step = (dir: 1 | -1) => {
    const next = Math.round((effectiveZoom + dir * 0.1) * 10) / 10
    onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)))
  }

  return (
    <div
      ref={ref}
      onMouseDown={onFocus}
      className={`${styles.window} ${focused ? styles.windowFocused : ''}`}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: z }}
    >
      <div
        className={styles.titleBar}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className={styles.titleText}>{win.panel}</span>
        <button type="button" className={styles.titleBtn} title="Smaller content"
          onClick={() => step(-1)}>−</button>
        <button
          type="button"
          className={`${styles.titleBtn} ${styles.zoomBtn} ${isAuto ? styles.zoomAuto : ''}`}
          title={isAuto
            ? 'Auto-fit: content scales to the window width. Click to lock the current zoom.'
            : 'Manual zoom. Click to return to auto-fit.'}
          onClick={() => onZoom(isAuto ? effectiveZoom : 'auto')}
        >
          {isAuto ? `fit ${Math.round(effectiveZoom * 100)}%` : `${Math.round(effectiveZoom * 100)}%`}
        </button>
        <button type="button" className={styles.titleBtn} title="Larger content"
          onClick={() => step(1)}>+</button>
        <button type="button" className={styles.titleBtn}
          title={win.prev ? 'Restore window size' : 'Maximize window to the visible work area'}
          onClick={onMaximize}>{win.prev ? '❐' : '▢'}</button>
        <button type="button" className={styles.titleBtn} title="Close window" onClick={onClose}>×</button>
      </div>
      <div ref={bodyRef} className={styles.body}>
        <div ref={innerRef} style={{ zoom: effectiveZoom } as React.CSSProperties}>
          {Component ? (
            <Suspense fallback={<p style={{ padding: '8px' }}>Loading…</p>}>
              <Component />
            </Suspense>
          ) : (
            <p style={{ padding: '8px' }}>Unknown panel "{win.panel}"</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [wins, setWins] = useState<Win[]>(() => readLayout(userId))
  const [order, setOrder] = useState<string[]>(() => readLayout(userId).map(w => w.id))
  const [adding, setAdding] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)

  // Every mutation goes through a FUNCTIONAL update. The handlers passed to a
  // window (drag, resize, zoom) are created during a render and can fire after
  // that render is stale — a ResizeObserver callback in particular arrives
  // asynchronously, and one from a window that has since been closed used to
  // write its whole captured `wins` array back, resurrecting the closed
  // window and undoing anything else since. Reading `prev` makes that
  // impossible.
  const update = useCallback((fn: (prev: Win[]) => Win[]) => {
    setWins(prev => {
      const next = fn(prev)
      writeLayout(userId, next)
      return next
    })
  }, [userId])

  // Signing in or out swaps which layout is in play.
  const loadedFor = useRef(userId)
  useEffect(() => {
    if (loadedFor.current === userId) return
    loadedFor.current = userId
    const next = readLayout(userId)
    setWins(next)
    setOrder(next.map(w => w.id))
  }, [userId])

  const patch = useCallback((id: string, p: Partial<Win>) => {
    update(prev => {
      // A patch for a window that no longer exists is a late event from a
      // closed one — drop it rather than re-adding the window.
      if (!prev.some(w => w.id === id)) return prev
      return prev.map(w => (w.id === id ? { ...w, ...p } : w))
    })
  }, [update])

  function addWindow(panel: string) {
    if (!panel) return
    const id = `w${nextId++}`
    update(prev => [...prev, {
      id, panel,
      x: 40 + (prev.length % 5) * 30, y: 40 + (prev.length % 5) * 30,
      w: 480, h: 380, zoom: 'auto',
    }])
    setOrder(o => [...o, id])
  }

  function toggleMaximize(id: string) {
    const vp = viewportRef.current
    update(prev => prev.map(x => {
      if (x.id !== id) return x
      if (x.prev) return { ...x, ...x.prev, prev: undefined }
      if (!vp) return x
      return {
        ...x,
        prev: { x: x.x, y: x.y, w: x.w, h: x.h },
        x: vp.scrollLeft + 4,
        y: vp.scrollTop + 4,
        w: vp.clientWidth - 12,
        h: vp.clientHeight - 12,
      }
    }))
    setOrder(o => [...o.filter(x => x !== id), id])
  }

  function focus(id: string) {
    setOrder(o => (o[o.length - 1] === id ? o : [...o.filter(x => x !== id), id]))
  }

  // The canvas grows in BOTH axes with the outermost window so anything can
  // be dragged to the sides of a wide monitor (plus a margin to keep growing).
  const maxY = Math.max(800, ...wins.map(w => w.y + w.h + 60))
  const maxX = Math.max(0, ...wins.map(w => w.x + w.w + 60))

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Custom Layout</span>
        <select value={adding} onChange={e => { addWindow(e.target.value); setAdding('') }}>
          <option value="">+ Add window…</option>
          {Object.keys(REGISTRY).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button
          type="button"
          title="Restore the default window layout (V2 View → Reset Screen Layout)"
          onClick={() => { update(() => DEFAULT_LAYOUT); setOrder(DEFAULT_LAYOUT.map(w => w.id)) }}
        >
          Reset Layout
        </button>
        <span className={styles.hint}>
          Drag windows by their title bar · resize from the corner · content auto-fits at "fit"
          (−/+ for manual zoom, click the % to re-enable auto) · ▢ maximizes.
        </span>
      </div>
      <div ref={viewportRef} className={styles.viewport}>
        <div className={styles.canvas} style={{ minHeight: maxY, minWidth: Math.max(maxX, 1), width: '100%' }}>
          {wins.map(w => (
            <DashboardWindow
              key={w.id}
              win={w}
              z={10 + order.indexOf(w.id)}
              focused={order[order.length - 1] === w.id}
              onMove={(x, y) => patch(w.id, { x, y })}
              onResize={(wd, h) => patch(w.id, { w: wd, h })}
              onZoom={zoom => patch(w.id, { zoom })}
              onMaximize={() => toggleMaximize(w.id)}
              onClose={() => {
                update(prev => prev.filter(x => x.id !== w.id))
                setOrder(o => o.filter(x => x !== w.id))
              }}
              onFocus={() => focus(w.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
