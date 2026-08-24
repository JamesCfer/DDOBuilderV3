// Distribution plot for the encounter-damage simulation.
//
// A React rendering of NicDamageCalc's SVG histogram: binned trial totals with
// the interquartile bins highlighted, a mean rule, and a percentile rail
// underneath. Colours come from the app theme rather than being hard-coded.

import { quantile, type SimResult } from '../../lib/combat/damageSim'
import styles from './DamageCalcPanel.module.css'

const BINS = 44
const W = 760
const H = 320
const PAD_L = 58
const PAD_R = 16
const PAD_T = 18
const PAD_B = 74

export const fmt = (n: number): string =>
  Math.abs(n) >= 10000
    ? Math.round(n).toLocaleString()
    : n.toFixed(Math.abs(n) < 10 ? 2 : 1)

export default function DamageHistogram({ result }: { result: SimResult }) {
  const { sorted, mean } = result
  if (sorted.length === 0) return null

  const p05 = quantile(sorted, 0.05)
  const p25 = quantile(sorted, 0.25)
  const p50 = quantile(sorted, 0.5)
  const p75 = quantile(sorted, 0.75)
  const p95 = quantile(sorted, 0.95)

  const lo = sorted[0]
  const hi = sorted[sorted.length - 1]
  const binW = Math.max(1e-9, (hi - lo) / BINS)
  const counts = new Array<number>(BINS).fill(0)
  for (const v of sorted) counts[Math.min(BINS - 1, Math.floor((v - lo) / binW))]++
  const maxC = Math.max(...counts)

  const pw = W - PAD_L - PAD_R
  const ph = H - PAD_T - PAD_B
  const x = (v: number): number => PAD_L + (hi > lo ? (v - lo) / (hi - lo) : 0.5) * pw
  const railY = PAD_T + ph + 38

  return (
    <svg
      className={styles.hist}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Distribution of total encounter damage"
    >
      {/* Horizontal gridlines and their count labels. */}
      {[0, 1, 2, 3].map(g => {
        const gy = PAD_T + ph - (g / 3) * ph
        return (
          <g key={g}>
            <line x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} stroke="var(--color-border)" />
            <text className={styles.axis} x={PAD_L - 8} y={gy + 3} textAnchor="end">
              {Math.round((maxC * g) / 3)}
            </text>
          </g>
        )
      })}

      {/* Bins. The interquartile range is picked out in the accent colour. */}
      {counts.map((c, i) => {
        const centre = lo + i * binW + binW / 2
        const bh = maxC ? (c / maxC) * ph : 0
        const inIqr = centre >= p25 && centre <= p75
        return (
          <rect
            key={i}
            x={PAD_L + (i / BINS) * pw}
            y={PAD_T + ph - bh}
            width={Math.max(0, pw / BINS - 1.2)}
            height={bh}
            fill={inIqr ? 'var(--color-accent, #d4982a)' : 'var(--color-bg-active, #1f2644)'}
          />
        )
      })}

      {/* Mean rule. */}
      <line
        x1={x(mean)} y1={PAD_T - 6} x2={x(mean)} y2={PAD_T + ph}
        stroke="var(--color-danger, #c9382b)" strokeWidth={1.5}
      />
      <text
        className={styles.railTxt} x={x(mean)} y={PAD_T - 9}
        textAnchor="middle" fill="var(--color-danger, #c9382b)"
      >
        mean
      </text>

      {/* Baseline and its min / mid / max labels. */}
      <line
        x1={PAD_L} y1={PAD_T + ph} x2={W - PAD_R} y2={PAD_T + ph}
        stroke="var(--color-text-muted)"
      />
      {[lo, (lo + hi) / 2, hi].map((v, i) => (
        <text
          key={i}
          className={styles.axis}
          x={x(v)}
          y={PAD_T + ph + 15}
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
        >
          {fmt(v)}
        </text>
      ))}

      {/* Percentile rail: p5-p95 whisker with a fat p25-p75 box. */}
      <line x1={x(p05)} y1={railY} x2={x(p95)} y2={railY} stroke="var(--color-bg-active, #1f2644)" strokeWidth={2} />
      <line x1={x(p25)} y1={railY} x2={x(p75)} y2={railY} stroke="var(--color-accent, #d4982a)" strokeWidth={6} />
      {([[p05, 'p5'], [p50, 'p50'], [p95, 'p95']] as Array<[number, string]>).map(([v, label]) => (
        <g key={label}>
          <line
            x1={x(v)} y1={railY - 7} x2={x(v)} y2={railY + 7}
            stroke="var(--color-text-primary)" strokeWidth={1.5}
          />
          <text className={styles.railTxt} x={x(v)} y={railY + 20} textAnchor="middle">
            {label} · {fmt(v)}
          </text>
        </g>
      ))}
    </svg>
  )
}
