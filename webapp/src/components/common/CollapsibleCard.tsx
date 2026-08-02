import { useState, type ReactNode } from 'react'
import styles from './CollapsibleCard.module.css'

interface Props {
  title: string
  /** Short right-aligned state line, shown whether open or closed. */
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * A `panel` whose body folds away behind its header.
 *
 * Used to host full editors (Tomes, Past Lives) on the Character Overview
 * without the overview turning into a wall of controls: the header carries a
 * one-line summary of the current state and the real editor is one click
 * away. The body is not rendered until the card is first opened, so an
 * embedded panel's data fetching and effects stay dormant on a page where
 * nobody expanded it.
 */
export default function CollapsibleCard({ title, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  // Once opened, keep the body mounted so its state survives collapsing.
  const [everOpened, setEverOpened] = useState(defaultOpen)

  return (
    <div className="panel">
      <button
        type="button"
        className={`panel-header ${styles.header}`}
        aria-expanded={open}
        onClick={() => {
          setOpen(o => !o)
          setEverOpened(true)
        }}
      >
        <span className={styles.chevron} aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className={styles.title}>{title}</span>
        {summary != null && <span className={styles.summary}>{summary}</span>}
      </button>
      {everOpened && (
        <div className="panel-body" hidden={!open}>{children}</div>
      )}
    </div>
  )
}
