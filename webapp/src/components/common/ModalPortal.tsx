// Renders a modal overlay at the end of <body> instead of inside the panel
// that opened it. Workspace windows clip their content (overflow: hidden),
// contain fixed-position children (contain: layout) and scale it (CSS zoom),
// so an overlay left inside one is squeezed into, and cut off by, that window.
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>
  return createPortal(children, document.body)
}
