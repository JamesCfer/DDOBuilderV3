// Instant, formatted hover tooltip for enhancement, destiny and reaper trees.
//
// The tree cells used the browser's native `title`, which waits a second,
// cancels if the pointer moves, won't reappear on an element until the
// pointer leaves it, and never shows on touch. Testers read that as hovers
// that "do nothing" or work hit and miss. This shows a styled card beside
// the pointer as soon as it enters: name, cost line, description, then one
// line per effect with its bonus type coloured, and any warnings.

import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useTipPosition } from './useTipPosition'
import { bonusTypeColor } from '../../lib/bonusTypeColors'
import type { EffectLine } from '../../lib/effectSummary'
import styles from './HoverTip.module.css'

export interface TipContent {
  title: string
  /** Small line under the title, e.g. "Rank 1/3 · 2 AP". */
  subtitle?: string
  description?: string
  effects?: EffectLine[]
  /** Status lines; `warn` shows red (unmet requirement, locked). */
  notes?: { text: string; tone?: 'warn' | 'info' }[]
}

interface TipState { content: TipContent; x: number; y: number }

function EffectRow({ e }: { e: EffectLine }) {
  return (
    <li className={styles.effect}>
      <span className={styles.effectLabel}>{e.label}</span>
      {e.amount && (
        <span className={e.negative ? styles.amountNeg : styles.amountPos}> {e.amount}</span>
      )}
      {e.scaling && <span className={styles.muted}> {e.scaling}</span>}
      {e.bonus && (
        <span className={styles.bonus} style={{ color: bonusTypeColor(e.bonus) }}> ({e.bonus})</span>
      )}
      {e.conditional && <span className={styles.muted}> (situational)</span>}
    </li>
  )
}

export function TipCard({ content }: { content: TipContent }) {
  const { title, subtitle, description, effects = [], notes = [] } = content
  return (
    <>
      <div className={styles.title}>
        {title}
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {(description || effects.length > 0 || notes.length > 0) && (
        <div className={styles.body}>
          {description && <div className={styles.description}>{description.trim()}</div>}
          {effects.length > 0 && (
            <ul className={styles.effects}>
              {effects.map((e, i) => <EffectRow key={i} e={e} />)}
            </ul>
          )}
          {notes.map((n, i) => (
            <div key={i} className={n.tone === 'warn' ? styles.warn : styles.info}>{n.text}</div>
          ))}
        </div>
      )}
    </>
  )
}

function TipBox({ tip }: { tip: TipState }) {
  const { ref, pos } = useTipPosition(tip.x, tip.y, false, [tip.content])
  const box = (
    <div
      ref={ref}
      role="tooltip"
      className={styles.box}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
    >
      <TipCard content={tip.content} />
    </div>
  )
  return typeof document === 'undefined' ? box : createPortal(box, document.body)
}

// One tooltip on screen at a time, so a single store and a single layer
// (mounted once by the app) serve every hover target: spread
// `tipProps(content)` where a `title` used to be.
let current: TipState | null = null
const listeners = new Set<() => void>()
function setTip(next: TipState | null) {
  current = next
  listeners.forEach(l => l())
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }

export function tipText(c: TipContent): string {
  return [
    c.title, c.subtitle, c.description,
    ...(c.effects ?? []).map(e => [e.label, e.amount, e.scaling, e.bonus && `(${e.bonus})`].filter(Boolean).join(' ')),
    ...(c.notes ?? []).map(n => n.text),
  ].filter(Boolean).join('\n')
}

export function hideTip() { setTip(null) }

/** Props that show `content` while the pointer is over the element. */
export function tipProps(content: TipContent) {
  return {
    'aria-label': content.title,
    // The whole card as plain text: searchable, and what tests read.
    'data-tip': tipText(content),
    onMouseEnter: (e: React.MouseEvent) => setTip({ content, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setTip({ content, x: e.clientX, y: e.clientY }),
    onMouseLeave: hideTip,
  }
}

/** Renders whichever tooltip is showing. Mount once near the app root. */
export function TipLayer() {
  const tip = useSyncExternalStore(subscribe, () => current, () => null)
  // A click usually changes what the hovered thing is (a rank, a pick), and
  // a scroll moves it out from under the pointer: drop the stale card.
  useEffect(() => {
    const drop = () => hideTip()
    window.addEventListener('scroll', drop, true)
    window.addEventListener('mousedown', drop, true)
    return () => {
      window.removeEventListener('scroll', drop, true)
      window.removeEventListener('mousedown', drop, true)
    }
  }, [])
  return tip ? <TipBox tip={tip} /> : null
}
