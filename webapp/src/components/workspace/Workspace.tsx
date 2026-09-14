// A workspace: the tab strip for the page, a toolbar, and the snapping-grid
// canvas the windows live on.
//
// The canvas grows in both axes with the outermost window (a wide monitor is
// fully usable), and below a narrow breakpoint — or on request — it stacks
// the windows in reading order instead, so the same layout works on a phone.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addWindow, canvasExtent, patchWindow, removeWindow, stackOrder, tidyWindows, toggleMaximize,
  DEFAULT_GRID, GRID_SIZES, type GridSize, type PageId, type Rect, type Workspace as WorkspaceModel,
} from '../../lib/workspace'
import type { WorkspaceLayoutApi } from '../../hooks/useWorkspaceLayout'
import { WINDOW_REGISTRY, windowsByGroup } from './registry'
import WorkspaceWindow, { TITLE_H } from './WorkspaceWindow'
import styles from './Workspace.module.css'

const PREFS_KEY = 'ddo-builder-workspace-prefs'
/** Below this viewport width the canvas stacks its windows. */
export const STACK_BREAKPOINT = 720

interface Prefs {
  grid: GridSize
  snap: boolean
  stack: boolean
  showGrid: boolean
}

function readPrefs(): Prefs {
  const base: Prefs = { grid: DEFAULT_GRID, snap: true, stack: false, showGrid: true }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as Partial<Prefs>
    return {
      grid: (GRID_SIZES as readonly number[]).includes(p.grid as number) ? (p.grid as GridSize) : base.grid,
      snap: typeof p.snap === 'boolean' ? p.snap : base.snap,
      stack: typeof p.stack === 'boolean' ? p.stack : base.stack,
      showGrid: typeof p.showGrid === 'boolean' ? p.showGrid : base.showGrid,
    }
  } catch { return base }
}

function writePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < STACK_BREAKPOINT)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth > 0 && window.innerWidth < STACK_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return narrow
}

// ---------------------------------------------------------------------------
// Add-window menu
// ---------------------------------------------------------------------------

function AddWindowMenu({ onAdd, present }: { onAdd: (panel: string) => void; present: Set<string> }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const groups = useMemo(() => windowsByGroup(), [])
  const q = filter.trim().toLowerCase()

  return (
    <div className={styles.menu} ref={ref}>
      <button
        type="button"
        className={`${styles.toolBtn} ${styles.toolBtnPrimary}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        + Add window
      </button>
      {open && (
        <div className={styles.menuPanel} role="menu" aria-label="Add a window">
          <input
            className={styles.menuFilter}
            placeholder="Find a window…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            autoFocus
          />
          <div className={styles.menuScroll}>
            {groups.map(g => {
              const panels = g.panels.filter(p => !q || p.toLowerCase().includes(q))
              if (panels.length === 0) return null
              return (
                <div key={g.group} className={styles.menuGroup}>
                  <div className={styles.menuGroupTitle}>{g.group}</div>
                  {panels.map(p => (
                    <button
                      key={p}
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => { onAdd(p); setOpen(false); setFilter('') }}
                    >
                      <span>{p}</span>
                      {present.has(p) && <span className={styles.menuOpen} title="Already on this tab">open</span>}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

function TabStrip({
  tabs, active, onPick, onAdd, onRename, onRemove,
}: {
  tabs: WorkspaceModel[]
  active: string
  onPick: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function startEdit(t: WorkspaceModel) {
    setEditing(t.id)
    setDraft(t.name)
  }
  function finishEdit() {
    if (editing) onRename(editing, draft)
    setEditing(null)
  }

  return (
    <nav className={styles.tabs} aria-label="Workspace tabs">
      {tabs.map(t => (
        editing === t.id ? (
          <input
            key={t.id}
            className={styles.tabEdit}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') finishEdit()
              if (e.key === 'Escape') setEditing(null)
            }}
            aria-label="Tab name"
            autoFocus
          />
        ) : (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${active === t.id ? styles.tabActive : ''}`}
            onClick={() => onPick(t.id)}
            onDoubleClick={() => startEdit(t)}
            aria-current={active === t.id ? 'page' : undefined}
            title={t.builtin ? 'Double-click to rename' : 'Double-click to rename · custom tab'}
          >
            {t.name}
            {!t.builtin && active === t.id && (
              <span
                role="button"
                tabIndex={0}
                className={styles.tabClose}
                title="Remove this tab"
                aria-label={`Remove tab ${t.name}`}
                onClick={e => { e.stopPropagation(); onRemove(t.id) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onRemove(t.id) } }}
              >
                ×
              </span>
            )}
          </button>
        )
      ))}
      <button type="button" className={styles.tabAdd} onClick={onAdd} title="Add a blank tab" aria-label="Add tab">+</button>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const ACTIVE_TAB_KEY = 'ddo-builder-active-tab'

function readActiveTabs(): Partial<Record<PageId, string>> {
  try { return JSON.parse(localStorage.getItem(ACTIVE_TAB_KEY) ?? '{}') } catch { return {} }
}

interface Props {
  page: PageId
  api: WorkspaceLayoutApi
}

export default function Workspace({ page, api }: Props) {
  const tabs = api.layout[page]
  const [activeByPage, setActiveByPage] = useState<Partial<Record<PageId, string>>>(readActiveTabs)
  const activeId = tabs.some(t => t.id === activeByPage[page]) ? activeByPage[page]! : tabs[0]?.id
  const space = tabs.find(t => t.id === activeId)

  const pickTab = useCallback((id: string) => {
    setActiveByPage(prev => {
      const next = { ...prev, [page]: id }
      try { localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [page])

  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPrefs(p => { const next = { ...p, [k]: v }; writePrefs(next); return next })
  }
  const narrow = useNarrowViewport()
  const stacked = prefs.stack || narrow

  // Focus order (z-index) is per tab and not persisted.
  const [order, setOrder] = useState<string[]>([])
  const focus = useCallback((id: string) => {
    setOrder(o => (o[o.length - 1] === id ? o : [...o.filter(x => x !== id), id]))
  }, [])

  const viewportRef = useRef<HTMLDivElement>(null)

  const updateSpace = useCallback((fn: (prev: WorkspaceModel) => WorkspaceModel, commit = true) => {
    if (!activeId) return
    api.updateWorkspace(page, activeId, fn, commit)
  }, [api, page, activeId])

  function viewportRect(): Rect {
    const vp = viewportRef.current
    if (!vp) return { x: 0, y: 0, w: 1200, h: 800 }
    return { x: vp.scrollLeft + 4, y: vp.scrollTop + 4, w: vp.clientWidth - 12, h: vp.clientHeight - 12 }
  }

  function viewportWidth(): number {
    return viewportRef.current?.clientWidth ?? 1200
  }

  function handleAdd(panel: string) {
    const def = WINDOW_REGISTRY[panel]
    if (!def) return
    const id = { current: '' }
    updateSpace(prev => {
      const next = addWindow(prev, panel, def.size, prefs.grid, viewportWidth())
      id.current = next.windows[next.windows.length - 1].id
      return next
    })
    if (id.current) focus(id.current)
    // Bring the new window into view once it has laid out.
    requestAnimationFrame(() => {
      const all = viewportRef.current?.querySelectorAll<HTMLElement>('[data-window]') ?? []
      const el = Array.from(all).filter(e => e.dataset.window === panel).pop()
      el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    })
  }

  function handleAddTab() {
    const name = window.prompt('Name for the new tab', 'My tab')
    if (name === null) return
    const id = api.addTab(page, name)
    pickTab(id)
  }

  function handleRemoveTab(id: string) {
    const t = tabs.find(x => x.id === id)
    if (!t || t.builtin) return
    if (t.windows.length > 0 && !window.confirm(`Remove the "${t.name}" tab and its ${t.windows.length} window(s)?`)) return
    api.removeTab(page, id)
  }

  function handleReset() {
    if (!space) return
    if (!window.confirm(`Reset the "${space.name}" tab to its default layout?`)) return
    api.resetTab(page, space.id)
  }

  if (!space) return null

  const windows = stacked ? stackOrder(space.windows) : space.windows
  const extent = canvasExtent(space.windows)
  const present = new Set(space.windows.map(w => w.panel))

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <TabStrip
          tabs={tabs}
          active={space.id}
          onPick={pickTab}
          onAdd={handleAddTab}
          onRename={(id, name) => api.renameTab(page, id, name)}
          onRemove={handleRemoveTab}
        />
        <div className={styles.tools}>
          <AddWindowMenu onAdd={handleAdd} present={present} />
          <button
            type="button"
            className={styles.toolBtn}
            title="Pack the windows into rows on the grid, in reading order"
            onClick={() => updateSpace(prev => ({ ...prev, windows: tidyWindows(prev.windows, prefs.grid, viewportWidth()) }))}
            disabled={stacked}
          >
            Tidy
          </button>
          <button type="button" className={styles.toolBtn} title="Restore this tab's default layout" onClick={handleReset}>
            Reset
          </button>
          <label className={styles.toolLabel} title="Grid cell size">
            Grid
            <select
              className={styles.toolSelect}
              value={prefs.grid}
              onChange={e => setPref('grid', Number(e.target.value) as GridSize)}
              aria-label="Grid size"
            >
              {GRID_SIZES.map(g => <option key={g} value={g}>{g}px</option>)}
            </select>
          </label>
          <button
            type="button"
            className={`${styles.toolBtn} ${prefs.snap ? styles.toolBtnOn : ''}`}
            aria-pressed={prefs.snap}
            title="Snap windows to the grid while dragging and resizing"
            onClick={() => setPref('snap', !prefs.snap)}
          >
            Snap
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${prefs.showGrid ? styles.toolBtnOn : ''}`}
            aria-pressed={prefs.showGrid}
            title="Show the grid"
            onClick={() => setPref('showGrid', !prefs.showGrid)}
          >
            Dots
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${stacked ? styles.toolBtnOn : ''}`}
            aria-pressed={stacked}
            disabled={narrow}
            title={narrow
              ? 'Windows stack on a narrow screen'
              : 'Stack the windows in one column instead of the free canvas'}
            onClick={() => setPref('stack', !prefs.stack)}
          >
            Stack
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`${styles.viewport} ${stacked ? styles.viewportStacked : ''}`}
        style={{ '--grid': `${prefs.grid}px` } as React.CSSProperties}
      >
        <div
          className={[
            styles.canvas,
            prefs.showGrid && !stacked ? styles.canvasGrid : '',
            stacked ? styles.canvasStacked : '',
          ].join(' ')}
          style={stacked ? undefined : { minWidth: extent.width, minHeight: extent.height }}
        >
          {windows.length === 0 && (
            <div className={styles.empty}>
              <p>This tab is empty.</p>
              <p>Use <strong>+ Add window</strong> to place any panel here, then drag it by its title bar and resize it from any edge.</p>
            </div>
          )}
          {windows.map(w => (
            <WorkspaceWindow
              key={w.id}
              win={w}
              z={10 + Math.max(0, order.indexOf(w.id))}
              focused={order[order.length - 1] === w.id}
              grid={prefs.grid}
              snapping={prefs.snap}
              stacked={stacked}
              onGeometry={(rect, commit) => updateSpace(prev => patchWindow(prev, w.id, { ...rect, prev: undefined }), commit)}
              onZoom={zoom => updateSpace(prev => patchWindow(prev, w.id, { zoom }))}
              onCollapse={() => updateSpace(prev => patchWindow(prev, w.id, { collapsed: !w.collapsed || undefined }))}
              onMaximize={() => { updateSpace(prev => toggleMaximize(prev, w.id, viewportRect())); focus(w.id) }}
              onClose={() => { updateSpace(prev => removeWindow(prev, w.id)); setOrder(o => o.filter(x => x !== w.id)) }}
              onFocus={() => focus(w.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export { TITLE_H }
