// statRows — presentational pieces shared by BreakdownsPanel and the
// panel's ★ Favorites section: the hover tooltip, collapsible section
// wrapper, and a single stat row with its favorite star.

import { useLayoutEffect, useRef, useState } from 'react'
import type { ResolvedBonus } from '../../lib/bonus'
import styles from './BreakdownsPanel.module.css'

export interface TipState {
  label: string
  display: string
  bonuses: ResolvedBonus[]
  x: number
  y: number
}

export interface StatRowData {
  label: string
  /**
   * The engine stat key behind this row, when it has exactly one.
   * Composite rows (a base save plus its sub-save, a fixed display value)
   * leave it unset — they are readable but not individually targetable, which
   * is what the optimizer's objective picker keys off.
   */
  statKey?: string
  total: number
  display?: string
  bonuses: ResolvedBonus[]
  indent?: boolean
  dim?: boolean
}

export function sign(n: number) { return (n >= 0 ? '+' : '') + n }

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export function Tooltip({ tip, onHide, openLeft = false }: {
  tip: TipState
  onHide: () => void
  /** Preferred side. Only a hint — the viewport gets the final say. */
  openLeft?: boolean
}) {
  const activeTotal = tip.bonuses.filter(b => b.active).reduce((s, b) => s + b.value, 0)
  const hasBonuses = tip.bonuses.length > 0
  const ref = useRef<HTMLDivElement>(null)
  // Start off-screen so the first paint cannot flash in the wrong place: the
  // layout effect below measures and places it before the browser paints.
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number }>(
    { left: -9999, top: -9999 })

  // Clamp into the viewport. The old version placed the box at cursor + 14px
  // and trusted it to fit — which it does not for a row in the right-hand
  // Analysis rail (runs off the right edge) or a long bonus list near the
  // bottom of the screen (runs off the bottom). Measure, flip the side if the
  // preferred one does not fit, and cap the height so a long list scrolls
  // inside the box instead of leaving the screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const GAP = 14
    const MARGIN = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = el.getBoundingClientRect()
    const width = rect.width
    const maxHeight = Math.max(120, vh - 2 * MARGIN)
    const height = Math.min(rect.height, maxHeight)

    // Horizontal: honour the caller's preference when it fits, otherwise take
    // whichever side has room; if neither does, sit flush inside the edge.
    const fitsRight = tip.x + GAP + width <= vw - MARGIN
    const fitsLeft = tip.x - GAP - width >= MARGIN
    let left: number
    if (openLeft ? fitsLeft : fitsRight) {
      left = openLeft ? tip.x - GAP - width : tip.x + GAP
    } else if (openLeft ? fitsRight : fitsLeft) {
      left = openLeft ? tip.x + GAP : tip.x - GAP - width
    } else {
      left = Math.max(MARGIN, Math.min(tip.x - width / 2, vw - width - MARGIN))
    }

    // Vertical: prefer aligning near the cursor, then slide up to fit.
    const top = Math.max(MARGIN, Math.min(tip.y - 8, vh - height - MARGIN))

    setPos({ left: Math.round(left), top: Math.round(top), maxHeight })
  }, [tip.x, tip.y, tip.label, tip.bonuses.length, openLeft])

  return (
    <div
      ref={ref}
      className={styles.tipBox}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      onMouseEnter={onHide}
    >
      <div className={styles.tipTitle}>{tip.label} — {tip.display}</div>
      {hasBonuses ? (
        <table className={styles.tipTable}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {tip.bonuses.map((b, i) => (
              <tr key={i} className={b.active ? '' : styles.tipRowSuppressed}>
                <td>{b.source}</td>
                <td>{b.type}</td>
                <td className={styles.tipVal}>{sign(b.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td className={styles.tipVal}><strong>{sign(activeTotal)}</strong></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className={styles.tipEmpty}>No bonuses tracked.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

export function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.sectionCaret}>{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat row
// ---------------------------------------------------------------------------

export function StatRow({ stat, onTip, favKey, starred, onToggleStar, tipAnchor = 'right' }: {
  stat: StatRowData
  onTip: (t: TipState | null) => void
  /** Stable "Section/Label" key for favorites; rows without one get no star. */
  favKey?: string
  starred?: boolean
  onToggleStar?: (key: string) => void
  /** Which row edge the tooltip anchors to ('left' for right-docked rows). */
  tipAnchor?: 'right' | 'left'
}) {
  const display = stat.display ?? sign(stat.total)
  return (
    <div
      className={`${styles.row} ${stat.indent ? styles.rowIndent : ''} ${stat.dim ? styles.rowDim : ''}`}
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = tipAnchor === 'left' ? r.left : r.right
        onTip({ label: stat.label, display, bonuses: stat.bonuses, x, y: r.top })
      }}
      onMouseLeave={() => onTip(null)}
    >
      {favKey && onToggleStar && (
        <button
          className={`${styles.starBtn} ${starred ? styles.starOn : ''}`}
          onClick={e => { e.stopPropagation(); onToggleStar(favKey) }}
          title={starred ? 'Remove from favorites' : 'Pin to favorites'}
          aria-label={starred ? `Unpin ${stat.label}` : `Pin ${stat.label}`}
        >
          {starred ? '★' : '☆'}
        </button>
      )}
      <span className={styles.label}>{stat.label}</span>
      <span className={`${styles.value} ${stat.dim ? styles.valueDim : ''}`}>{display}</span>
    </div>
  )
}
