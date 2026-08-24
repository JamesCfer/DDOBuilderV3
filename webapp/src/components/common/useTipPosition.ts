// Viewport-clamped placement for hover tooltips.
//
// Extracted from BreakdownsPanel's Tooltip so the stat-bonus tooltip and the
// damage-breakdown tooltip place themselves identically. The rules matter: a
// row in the right-hand Analysis rail runs off the right edge if you just add
// an offset to the cursor, and a long list near the bottom of the screen runs
// off the bottom.

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface TipPosition {
  left: number
  top: number
  maxHeight?: number
}

export interface UseTipPosition {
  ref: RefObject<HTMLDivElement>
  pos: TipPosition
}

/** Distance from the anchor point to the tooltip edge. */
const GAP = 14
/** Minimum clearance from the viewport edge. */
const MARGIN = 8

/**
 * Measures the tooltip and places it near (`x`, `y`), flipping sides and
 * capping the height rather than letting it leave the screen.
 *
 * Starts off-screen so the first paint cannot flash in the wrong place — the
 * layout effect measures and positions before the browser paints.
 *
 * `deps` re-runs the measurement when the tooltip's content changes size.
 */
export function useTipPosition(
  x: number,
  y: number,
  openLeft: boolean,
  deps: ReadonlyArray<unknown> = [],
): UseTipPosition {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<TipPosition>({ left: -9999, top: -9999 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = el.getBoundingClientRect()
    const width = rect.width
    const maxHeight = Math.max(120, vh - 2 * MARGIN)
    const height = Math.min(rect.height, maxHeight)

    // Horizontal: honour the caller's preference when it fits, otherwise take
    // whichever side has room; if neither does, sit flush inside the edge.
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

    // Vertical: prefer aligning near the cursor, then slide up to fit.
    const top = Math.max(MARGIN, Math.min(y - 8, vh - height - MARGIN))

    setPos({ left: Math.round(left), top: Math.round(top), maxHeight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, openLeft, ...deps])

  return { ref, pos }
}
