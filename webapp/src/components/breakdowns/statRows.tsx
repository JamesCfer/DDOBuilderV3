// statRows — presentational pieces shared by BreakdownsPanel and the
// panel's ★ Favorites section: the hover tooltip, collapsible section
// wrapper, and a single stat row with its favorite star.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTipPosition } from '../common/useTipPosition'
import { isExclusiveType, type ResolvedBonus } from '../../lib/bonus'
import { bonusTypeColor } from '../../lib/bonusTypeColors'
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

/** All of one bonus type's contributions to a stat, with how they combine. */
export interface BonusTypeGroup {
  type: string
  /** Sum of the active bonuses: what this type adds to the total. */
  subtotal: number
  /** True when gear bonuses of this type competed and only one counted. */
  highestOnly: boolean
  bonuses: ResolvedBonus[]
}

/**
 * Groups a stat's bonuses by type, biggest contribution first. Within a type
 * the counted bonuses come before the ones another bonus overrode.
 */
export function groupBonusesByType(bonuses: ResolvedBonus[]): BonusTypeGroup[] {
  const byType = new Map<string, ResolvedBonus[]>()
  for (const b of bonuses) {
    const list = byType.get(b.type)
    if (list) list.push(b)
    else byType.set(b.type, [b])
  }
  const groups: BonusTypeGroup[] = []
  for (const [type, list] of byType) {
    const subtotal = list.filter(b => b.active).reduce((s, b) => s + b.value, 0)
    const gearCount = list.filter(b => b.fromGear).length
    const highestOnly = isExclusiveType(type) && (gearCount > 1 || list.some(b => !b.active))
    const sorted = [...list].sort((a, b) =>
      Number(b.active) - Number(a.active) || Math.abs(b.value) - Math.abs(a.value))
    groups.push({ type, subtotal, highestOnly, bonuses: sorted })
  }
  return groups.sort((a, b) => Math.abs(b.subtotal) - Math.abs(a.subtotal))
}

/** The gear bonus that beat `b` for its type, if one did. */
function overriddenBy(b: ResolvedBonus, group: BonusTypeGroup): ResolvedBonus | undefined {
  if (b.active) return undefined
  return group.bonuses.find(o => o.active && o.fromGear)
}

export function Tooltip({ tip, onHide, openLeft = false }: {
  tip: TipState
  onHide: () => void
  /** Preferred side. Only a hint — the viewport gets the final say. */
  openLeft?: boolean
}) {
  const activeTotal = tip.bonuses.filter(b => b.active).reduce((s, b) => s + b.value, 0)
  const hasBonuses = tip.bonuses.length > 0
  const groups = groupBonusesByType(tip.bonuses)
  const overridden = tip.bonuses.filter(b => !b.active).length
  const { ref, pos } = useTipPosition(tip.x, tip.y, openLeft, [tip.label, tip.bonuses.length])

  // Composition bar: each type's positive contribution as a share of all
  // positive contributions. Penalties are listed below but not drawn.
  const positive = groups.filter(g => g.subtotal > 0)
  const positiveSum = positive.reduce((s, g) => s + g.subtotal, 0)

  const box = (
    <div
      ref={ref}
      className={styles.tipBox}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      onMouseEnter={onHide}
      role="tooltip"
    >
      <div className={styles.tipTitle}>{tip.label} — {tip.display}</div>
      {hasBonuses ? (
        <>
          {positive.length > 1 && (
            <div className={styles.tipBar} aria-hidden="true">
              {positive.map(g => (
                <span
                  key={g.type}
                  className={styles.tipBarSeg}
                  style={{ flexGrow: g.subtotal / positiveSum, background: bonusTypeColor(g.type) }}
                />
              ))}
            </div>
          )}
          <table className={styles.tipTable}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Value</th>
              </tr>
            </thead>
            {groups.map(g => (
              <tbody key={g.type} className={styles.tipGroup}>
                <tr className={styles.tipGroupHead}>
                  <td>
                    <span
                      className={styles.tipSwatch}
                      style={{ background: bonusTypeColor(g.type) }}
                      aria-hidden="true"
                    />
                    {g.type.trim() || 'Untyped'}
                    <span className={styles.tipRule}>
                      {g.highestOnly ? 'highest only' : g.bonuses.length > 1 ? 'stacks' : ''}
                    </span>
                  </td>
                  <td className={styles.tipVal}>{sign(g.subtotal)}</td>
                </tr>
                {g.bonuses.map((b, i) => {
                  const winner = overriddenBy(b, g)
                  return (
                    <tr key={i} className={b.active ? styles.tipBonusRow : `${styles.tipBonusRow} ${styles.tipRowSuppressed}`}>
                      <td style={{ '--type-color': bonusTypeColor(g.type) } as React.CSSProperties}>
                        <span className={styles.tipSource}>{b.source}</span>
                        <span className={styles.tipOrigin}>{b.fromGear ? 'gear' : 'build'}</span>
                        {winner && (
                          <span className={styles.tipNote}>overridden by {winner.source}</span>
                        )}
                      </td>
                      <td className={styles.tipValMinor}><span className={styles.tipSource}>{sign(b.value)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <td>
                  <strong>Total</strong>
                  <span className={styles.tipCount}>
                    {tip.bonuses.length} {tip.bonuses.length === 1 ? 'source' : 'sources'}
                    {overridden > 0 && `, ${overridden} overridden`}
                  </span>
                </td>
                <td className={styles.tipVal}><strong>{sign(activeTotal)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </>
      ) : (
        <div className={styles.tipEmpty}>No bonuses tracked.</div>
      )}
    </div>
  )

  // Portal to the body: workspace windows set `contain: layout` and
  // `overflow: hidden`, which re-anchor a position: fixed child to the window
  // and clip it, so a tooltip rendered in place lands off-screen.
  return typeof document === 'undefined' ? box : createPortal(box, document.body)
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
