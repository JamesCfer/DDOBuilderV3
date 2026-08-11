// HoverCard — a themed, viewport-clamped floating panel for rich hover
// content (gear items, augments). Replaces native `title=` tooltips, which
// cannot show colour, structure, or an icon.
//
// Positioning mirrors the breakdown tooltip (statRows.tsx): render off-screen
// for one frame, measure, then place on whichever side fits and cap the height
// so a long effect list scrolls inside the box rather than off the screen.

import { useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import styles from './HoverCard.module.css'

export interface HoverAnchor {
  x: number
  y: number
  /** Preferred side. Only a hint — the viewport gets the final say. */
  openLeft?: boolean
}

/** Anchor a hover card to the element the event fired on. */
export function anchorFrom(e: React.MouseEvent, side: 'right' | 'left' = 'right'): HoverAnchor {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: side === 'left' ? r.left : r.right, y: r.top, openLeft: side === 'left' }
}

/**
 * Hover state for a list of targets: `show(data)` on mouseenter, `hide` on
 * mouseleave. The payload carries whatever the card needs to render.
 */
export function useHoverCard<T>() {
  const [hover, setHover] = useState<(HoverAnchor & { data: T }) | null>(null)
  const show = useCallback((data: T, side: 'right' | 'left' = 'right') =>
    (e: React.MouseEvent) => setHover({ ...anchorFrom(e, side), data }), [])
  const hide = useCallback(() => setHover(null), [])
  return { hover, show, hide }
}

export default function HoverCard({ x, y, openLeft = false, children }: HoverAnchor & {
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number }>(
    { left: -9999, top: -9999 })

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

    const fitsRight = x + GAP + width <= vw - MARGIN
    const fitsLeft = x - GAP - width >= MARGIN
    let left: number
    if (openLeft ? fitsLeft : fitsRight) {
      left = openLeft ? x - GAP - width : x + GAP
    } else if (openLeft ? fitsRight : fitsLeft) {
      left = openLeft ? x + GAP : x - GAP - width
    } else {
      left = Math.max(MARGIN, Math.min(x - width / 2, vw - width - MARGIN))
    }
    const top = Math.max(MARGIN, Math.min(y - 8, vh - height - MARGIN))
    setPos({ left: Math.round(left), top: Math.round(top), maxHeight })
  }, [x, y, openLeft, children])

  const card = (
    <div
      ref={ref}
      className={styles.card}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      role="tooltip"
    >
      {children}
    </div>
  )

  // Portal to the body so the card escapes the `overflow: hidden` panels and
  // modal stacking contexts it is anchored inside.
  return typeof document === 'undefined' ? card : createPortal(card, document.body)
}

// ---------------------------------------------------------------------------
// Shared building blocks for card content
// ---------------------------------------------------------------------------

export function HoverHeader({ icon, title, subtitle }: {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
}) {
  return (
    <div className={styles.header}>
      {icon}
      <div className={styles.headerText}>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
    </div>
  )
}

export function HoverBody({ children }: { children: React.ReactNode }) {
  return <div className={styles.body}>{children}</div>
}

export function HoverSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <div className={styles.sectionTitle}>{title}</div>}
      {children}
    </div>
  )
}

export { styles as hoverStyles }
