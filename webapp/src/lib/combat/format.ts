// Number formatting for combat readouts.
//
// The combat tables used `toFixed(1)` everywhere, which reads badly across the
// range these numbers actually span: "3602.1" wants a thousands separator, and
// "0.0" for an unused off-hand is noise dressed up as precision. Encounter
// totals reach seven figures, where a decimal place is meaningless.
//
// One place for the rules so the Combat table, the Damage Calc tiles, and the
// hover breakdowns all agree.

/**
 * A damage figure. Precision falls away as the number grows, because a tenth
 * of a point stops meaning anything once you are past a few hundred.
 *
 *   0        -> "0"
 *   12.34    -> "12.3"
 *   859.24   -> "859.2"
 *   3602.14  -> "3,602"
 *   1249842  -> "1,249,842"
 */
export function fmtDamage(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs < 1000) {
    // Below 1000 a decimal still carries information.
    return trimZero(n.toFixed(1))
  }
  return Math.round(n).toLocaleString('en-US')
}

/** Drops a trailing ".0" so whole numbers read as whole numbers. */
function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** A percentage, e.g. hit chance. Always one decimal: 95.0%, 23.8%. */
export function fmtPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(1)}%`
}

/** A percentage already expressed 0-100. */
export function fmtPercentValue(pct: number): string {
  if (!Number.isFinite(pct)) return '—'
  return `${pct.toFixed(1)}%`
}

/** An additive contribution in a breakdown: "+42.5", "-4". */
export function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const body = Math.abs(n) < 1000 ? trimZero(Math.abs(n).toFixed(1))
    : Math.round(Math.abs(n)).toLocaleString('en-US')
  return (n < 0 ? '−' : '+') + body
}

/**
 * A multiplicative contribution in a breakdown: "×2.5", "×1.35".
 *
 * Uses the multiplication sign rather than an "x" so it cannot be misread as
 * part of a label.
 */
export function fmtFactor(f: number): string {
  if (!Number.isFinite(f)) return '—'
  return `×${trimZero(f.toFixed(2).replace(/0$/, ''))}`
}

/**
 * A whole-number count, e.g. attacks per encounter.
 */
export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Math.abs(n) < 100 ? trimZero(n.toFixed(1)) : Math.round(n).toLocaleString('en-US')
}
