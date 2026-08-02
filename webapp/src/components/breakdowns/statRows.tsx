// statRows — presentational pieces shared by BreakdownsPanel and the
// panel's ★ Favorites section: the hover tooltip, collapsible section
// wrapper, and a single stat row with its favorite star.

import { useState } from 'react'
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
  /** Open to the left of the anchor (for rows docked at the right screen edge). */
  openLeft?: boolean
}) {
  const activeTotal = tip.bonuses.filter(b => b.active).reduce((s, b) => s + b.value, 0)
  const hasBonuses = tip.bonuses.length > 0
  const pos = openLeft
    ? { right: window.innerWidth - tip.x + 14, top: tip.y - 8 }
    : { left: tip.x + 14, top: tip.y - 8 }

  return (
    <div
      className={styles.tipBox}
      style={pos}
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
