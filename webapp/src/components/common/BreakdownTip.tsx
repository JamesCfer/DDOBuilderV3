// Hover breakdown for a damage number.
//
// The stat tooltip in breakdowns/statRows renders a flat list of additive
// bonuses, which is right for "where did my Strength come from". A damage
// number is not built that way: it is dice plus flat bonuses, then multiplied
// by a crit multiplier, then by Melee Power, then by doublestrike. A column of
// "+N" rows cannot say that.
//
// So this renders an ordered calculation instead — additive rows accumulate, a
// multiplier row shows the factor and the running value after it, and share
// rows show a percentage of a whole. Both tooltips place themselves with the
// same hook, so they behave identically at the screen edges.

import { useTipPosition } from './useTipPosition'
import { fmtDamage, fmtFactor, fmtSigned } from '../../lib/combat/format'
import styles from './BreakdownTip.module.css'

/** One line of a damage calculation. */
export type TipRow =
  /** Adds to the running subtotal: weapon dice, ability mod, damage bonuses. */
  | { kind: 'add'; label: string; value: number; note?: string }
  /** Multiplies the running subtotal: crit multiplier, Melee Power, %. */
  | { kind: 'mult'; label: string; factor: number; note?: string }
  /** A labelled checkpoint in the calculation. Does not change the value. */
  | { kind: 'subtotal'; label: string; note?: string }
  /** A slice of a total, shown as value + share. Does not accumulate. */
  | { kind: 'share'; label: string; value: number; note?: string }
  /** Free text — a caveat or an explanation, no number. */
  | { kind: 'note'; label: string }

export interface BreakdownTipState {
  /** What is being explained, e.g. "Hit damage". */
  label: string
  /** The final figure, already formatted. */
  display: string
  rows: TipRow[]
  /** Optional line under the title. */
  subtitle?: string
  x: number
  y: number
}

/**
 * Walks the rows, tracking the running value so multiplier rows can show what
 * the number becomes after they apply.
 *
 * `share` rows are slices of a whole rather than steps in a calculation, so
 * they are totalled separately and never touch the running value.
 */
function walk(rows: TipRow[]): {
  running: Array<number | null>
  shareTotal: number
  final: number
} {
  let value = 0
  let shareTotal = 0
  const running: Array<number | null> = []
  for (const r of rows) {
    switch (r.kind) {
      case 'add':
        value += r.value
        running.push(value)
        break
      case 'mult':
        value *= r.factor
        running.push(value)
        break
      case 'subtotal':
        running.push(value)
        break
      case 'share':
        shareTotal += r.value
        running.push(null)
        break
      default:
        running.push(null)
    }
  }
  return { running, shareTotal, final: value }
}

export default function BreakdownTip({ tip, onHide, openLeft = false }: {
  tip: BreakdownTipState
  onHide: () => void
  /** Preferred side. Only a hint — the viewport gets the final say. */
  openLeft?: boolean
}) {
  const { ref, pos } = useTipPosition(tip.x, tip.y, openLeft, [tip.label, tip.rows.length])
  const { running, shareTotal } = walk(tip.rows)
  const isShareList = tip.rows.length > 0 && tip.rows.every(r => r.kind === 'share' || r.kind === 'note')

  return (
    <div
      ref={ref}
      className={styles.tipBox}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      onMouseEnter={onHide}
      role="tooltip"
    >
      <div className={styles.tipTitle}>
        {tip.label} <span className={styles.tipTotal}>{tip.display}</span>
      </div>
      {tip.subtitle && <div className={styles.tipSubtitle}>{tip.subtitle}</div>}

      {tip.rows.length === 0 ? (
        <div className={styles.tipEmpty}>Nothing tracked for this number.</div>
      ) : (
        <table className={styles.tipTable}>
          <tbody>
            {tip.rows.map((r, i) => {
              if (r.kind === 'note') {
                return (
                  <tr key={i}>
                    <td className={styles.tipNoteCell} colSpan={3}>{r.label}</td>
                  </tr>
                )
              }
              if (r.kind === 'subtotal') {
                return (
                  <tr key={i} className={styles.tipSubtotalRow}>
                    <td>{r.label}</td>
                    <td className={styles.tipOp} />
                    <td className={styles.tipVal}>{fmtDamage(running[i] ?? 0)}</td>
                  </tr>
                )
              }
              if (r.kind === 'share') {
                const share = shareTotal > 0 ? (r.value / shareTotal) * 100 : 0
                return (
                  <tr key={i}>
                    <td>
                      {r.label}
                      {r.note && <span className={styles.tipRowNote}>{r.note}</span>}
                    </td>
                    <td className={styles.tipOp}>{share.toFixed(1)}%</td>
                    <td className={styles.tipVal}>{fmtDamage(r.value)}</td>
                  </tr>
                )
              }
              const op = r.kind === 'mult' ? fmtFactor(r.factor) : fmtSigned(r.value)
              return (
                <tr key={i} className={r.kind === 'mult' ? styles.tipMultRow : ''}>
                  <td>
                    {r.label}
                    {r.note && <span className={styles.tipRowNote}>{r.note}</span>}
                  </td>
                  <td className={styles.tipOp}>{op}</td>
                  <td className={styles.tipVal}>{fmtDamage(running[i] ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>{isShareList ? 'Total' : tip.label}</strong></td>
              <td className={styles.tipOp} />
              <td className={styles.tipVal}><strong>{tip.display}</strong></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
