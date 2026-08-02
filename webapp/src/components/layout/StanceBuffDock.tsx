// StanceBuffDock — always-visible LEFT rail carrying stances and, directly
// below them, the buff toggles.
//
// Stances and buffs are the shallowest choices in the whole app: one click,
// no cost, no prerequisite, and they move half the numbers on the page. Being
// choices, they lived on their own Analysis tabs — so checking what a stance
// did to a breakdown, a DC or a weapon meant leaving the page you were
// reading. They belong beside the numbers instead of one navigation away,
// which is what this rail is for. It mirrors the FavoritesDock on the right:
// sticky, collapsible, remembered across sessions.
//
// The panels themselves are the same components the Custom › Windows
// dashboard opens, unchanged — there is no second implementation to drift.

import { useState } from 'react'
import StancesPanel from '../stances/StancesPanel'
import SelfBuffsPanel from '../buffs/SelfBuffsPanel'
import GuildBuffsPanel from '../guildbuffs/GuildBuffsPanel'
import styles from './StanceBuffDock.module.css'

const OPEN_KEY = 'ddo-stance-dock-open'

export default function StanceBuffDock() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true }
  })

  function toggleOpen() {
    setOpen(v => {
      try { localStorage.setItem(OPEN_KEY, v ? '0' : '1') } catch { /* ignore */ }
      return !v
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.collapsedBtn}
        onClick={toggleOpen}
        title="Show stances and buffs"
        aria-label="Show stances and buffs"
        aria-expanded={false}
      >
        ⚔
      </button>
    )
  }

  return (
    <aside className={styles.dock} aria-label="Stances and buffs">
      <div className={styles.dockHeader}>
        <span className={styles.dockTitle}>Stances &amp; Buffs</span>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={toggleOpen}
          title="Hide stances and buffs"
          aria-label="Hide stances and buffs"
          aria-expanded
        >
          ‹
        </button>
      </div>
      <div className={styles.dockBody}>
        <StancesPanel />
        <SelfBuffsPanel />
        <GuildBuffsPanel />
      </div>
    </aside>
  )
}
