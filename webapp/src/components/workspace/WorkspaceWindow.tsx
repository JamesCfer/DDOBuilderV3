// One window on a workspace canvas: title bar (drag), edge and corner grips
// (resize), zoom, roll-up, maximize and close. Geometry is owned by the
// parent workspace; the window reports raw pointer deltas already snapped to
// the grid, and says when a gesture ends so the parent can persist once.
//
// Content zoom: 'auto' scales the panel down (never up past 100%) until its
// natural width fits the window, so a wide table stays readable in a narrow
// window without a horizontal scrollbar. −/+ switch to a manual factor and
// clicking the readout returns to auto.

import React, { Suspense, useEffect, useRef, useState } from 'react'
import { snapRect, type Rect, type WindowState } from '../../lib/workspace'
import { WINDOW_REGISTRY } from './registry'
import ErrorBoundary from '../common/ErrorBoundary'
import styles from './Workspace.module.css'

export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2
/** Height of the title bar, used for the rolled-up state. */
export const TITLE_H = 32

type Grip = 'e' | 's' | 'se' | 'w' | 'n' | 'ne' | 'nw' | 'sw'

interface Props {
  win: WindowState
  z: number
  focused: boolean
  grid: number
  snapping: boolean
  /** Stacked (small-screen) mode: no absolute geometry, no drag or resize. */
  stacked: boolean
  onGeometry: (rect: Rect, commit: boolean) => void
  onZoom: (zoom: number | 'auto') => void
  onCollapse: () => void
  onMaximize: () => void
  onClose: () => void
  onFocus: () => void
}

interface Gesture {
  kind: 'move' | Grip
  startX: number
  startY: number
  base: Rect
}

export default function WorkspaceWindow({
  win, z, focused, grid, snapping, stacked,
  onGeometry, onZoom, onCollapse, onMaximize, onClose, onFocus,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [dragging, setDragging] = useState(false)
  const [autoZoom, setAutoZoom] = useState(1)

  const def = WINDOW_REGISTRY[win.panel]
  const isAuto = win.zoom === 'auto'
  const effectiveZoom = isAuto ? autoZoom : (win.zoom as number)

  // Auto-fit: the inner div carries CSS `zoom`, so its scrollWidth stays in
  // the panel's own (unscaled) units — fit = bodyWidth / naturalWidth, ≤ 1.
  useEffect(() => {
    if (!isAuto || win.collapsed) return
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
        // Quantize to 2% steps so measurement jitter cannot oscillate.
        const q = Math.round(fit * 50) / 50
        setAutoZoom(prev => (Math.abs(prev - q) >= 0.02 ? q : prev))
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(body)
    ro.observe(inner)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [isAuto, win.collapsed, win.w, win.h, win.panel, stacked])

  // ── Gestures ───────────────────────────────────────────────────────────

  function begin(kind: Gesture['kind'], e: React.PointerEvent) {
    if (stacked) return
    // Buttons in the title bar are not drag handles.
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    onFocus()
    gesture.current = { kind, startX: e.clientX, startY: e.clientY, base: { x: win.x, y: win.y, w: win.w, h: win.h } }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
  }

  function apply(e: React.PointerEvent, commit: boolean) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    let r: Rect = { ...g.base }
    if (g.kind === 'move') {
      r = { ...r, x: g.base.x + dx, y: g.base.y + dy }
    } else {
      if (g.kind.includes('e')) r.w = g.base.w + dx
      if (g.kind.includes('s')) r.h = g.base.h + dy
      if (g.kind.includes('w')) { r.x = g.base.x + dx; r.w = g.base.w - dx }
      if (g.kind.includes('n')) { r.y = g.base.y + dy; r.h = g.base.h - dy }
    }
    // Snap to the grid when snapping is on; otherwise just keep it on the
    // canvas and above the minimum size. Snapping the far edge (not the
    // size) keeps a window's right/bottom on a grid line when its origin is.
    if (snapping) {
      const snapped = snapRect(r, grid)
      if (g.kind === 'move') r = { ...snapped, w: r.w, h: r.h }
      else r = snapped
    }
    r.x = Math.max(0, r.x)
    r.y = Math.max(0, r.y)
    r.w = Math.max(200, r.w)
    r.h = Math.max(96, r.h)
    onGeometry(r, commit)
  }

  function move(e: React.PointerEvent) { if (gesture.current) apply(e, false) }
  function end(e: React.PointerEvent) {
    if (!gesture.current) return
    apply(e, true)
    gesture.current = null
    setDragging(false)
  }

  const step = (dir: 1 | -1) => {
    const next = Math.round((effectiveZoom + dir * 0.1) * 10) / 10
    onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)))
  }

  const Component = def?.component
  const style: React.CSSProperties = stacked
    ? { position: 'relative', width: '100%', height: win.collapsed ? TITLE_H : Math.min(win.h, 720), zIndex: 1 }
    : { left: win.x, top: win.y, width: win.w, height: win.collapsed ? TITLE_H : win.h, zIndex: z }

  const grips: Grip[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

  return (
    <section
      className={[
        styles.window,
        focused ? styles.windowFocused : '',
        dragging ? styles.windowDragging : '',
        win.collapsed ? styles.windowCollapsed : '',
        stacked ? styles.windowStacked : '',
      ].join(' ')}
      style={style}
      onPointerDownCapture={onFocus}
      aria-label={win.panel}
      data-window={win.panel}
    >
      <header
        className={styles.titleBar}
        onPointerDown={e => begin('move', e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button')) onMaximize() }}
        title={stacked ? undefined : 'Drag to move · double-click to maximize'}
      >
        <span className={styles.titleText}>{win.panel}</span>
        {!win.collapsed && (
          <>
            <button type="button" className={styles.titleBtn} title="Smaller content" aria-label="Smaller content"
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
            <button type="button" className={styles.titleBtn} title="Larger content" aria-label="Larger content"
              onClick={() => step(1)}>+</button>
          </>
        )}
        <button type="button" className={styles.titleBtn}
          title={win.collapsed ? 'Unroll window' : 'Roll window up to its title bar'}
          aria-label={win.collapsed ? 'Unroll window' : 'Roll up window'}
          aria-pressed={!!win.collapsed}
          onClick={onCollapse}>{win.collapsed ? '▾' : '▴'}</button>
        {!stacked && (
          <button type="button" className={styles.titleBtn}
            title={win.prev ? 'Restore window size' : 'Maximize window to the visible work area'}
            aria-label={win.prev ? 'Restore window' : 'Maximize window'}
            onClick={onMaximize}>{win.prev ? '❐' : '▢'}</button>
        )}
        <button type="button" className={styles.titleBtn} title="Close window" aria-label="Close window"
          onClick={onClose}>×</button>
      </header>

      {!win.collapsed && (
        <div ref={bodyRef} className={styles.body}>
          <div ref={innerRef} className={styles.inner} style={{ zoom: effectiveZoom } as React.CSSProperties}>
            <ErrorBoundary label={win.panel}>
              {Component ? (
                <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
                  <Component />
                </Suspense>
              ) : (
                <p className={styles.loading}>Unknown window "{win.panel}"</p>
              )}
            </ErrorBoundary>
          </div>
        </div>
      )}

      {!stacked && !win.collapsed && grips.map(g => (
        <div
          key={g}
          className={`${styles.grip} ${styles[`grip_${g}`]}`}
          onPointerDown={e => begin(g, e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          aria-hidden="true"
        />
      ))}
    </section>
  )
}
