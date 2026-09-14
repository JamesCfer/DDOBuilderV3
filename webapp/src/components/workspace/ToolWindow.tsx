// A utility panel (Settings, Content I Own, Help…) opened from the Tools
// menu: one floating window over the page, on its own scrim, dismissed by
// its close button, a click outside or Escape. It reuses the registry so the
// same panel can also be placed on a workspace tab if someone wants it there
// permanently.

import { Suspense, useEffect } from 'react'
import { WINDOW_REGISTRY } from './registry'
import ErrorBoundary from '../common/ErrorBoundary'
import styles from './ToolWindow.module.css'

interface Props {
  panel: string
  onClose: () => void
}

export default function ToolWindow({ panel, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const def = WINDOW_REGISTRY[panel]
  const Component = def?.component

  return (
    <div className={styles.scrim} onClick={onClose}>
      <section
        className={styles.window}
        role="dialog"
        aria-modal="true"
        aria-label={panel}
        onClick={e => e.stopPropagation()}
      >
        <header className={styles.titleBar}>
          <span className={styles.titleText}>{panel}</span>
          <button type="button" className={styles.titleBtn} title="Close" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className={styles.body}>
          <ErrorBoundary label={panel}>
            {Component ? (
              <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
                <Component />
              </Suspense>
            ) : (
              <p className={styles.loading}>Unknown window "{panel}"</p>
            )}
          </ErrorBoundary>
        </div>
      </section>
    </div>
  )
}

export type { Props as ToolWindowProps }
