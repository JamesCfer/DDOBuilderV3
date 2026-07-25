// FavoritesDock — always-visible right-hand rail showing the user's starred
// breakdown stats on every page, so a favorited number (HP, a DC, Doublestrike…)
// can be watched live while training feats, spending AP, or swapping gear.
// Rows come from the exact same section builder the Breakdowns panel uses,
// and the star list is the shared favoritesStore, so pinning/unpinning in
// either place updates both.

import { useMemo, useState } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import { useFavorites } from '../../lib/favoritesStore'
import { buildBreakdownSections, indexSectionRows } from './breakdownSections'
import { Tooltip, StatRow, type TipState } from './statRows'
import styles from './FavoritesDock.module.css'

const OPEN_KEY = 'ddo-favorites-dock-open'

export default function FavoritesDock() {
  const [favorites] = useFavorites()
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true }
  })

  if (favorites.length === 0) return null

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
        title="Show favorite stats"
        aria-label="Show favorite stats"
      >
        ★
      </button>
    )
  }

  return <DockBody onCollapse={toggleOpen} />
}

// The stat computation lives in a child component so it only runs while the
// dock is actually open (and only when at least one row is starred).
function DockBody({ onCollapse }: { onCollapse: () => void }) {
  const [favorites, toggleFavorite] = useFavorites()
  const { build } = useCharacter()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)
  const [tip, setTip] = useState<TipState | null>(null)

  const sections = buildBreakdownSections(stats, build, bundle.allClasses)
  const rowIndex = indexSectionRows(sections)

  return (
    <aside className={styles.dock} aria-label="Favorite stats">
      {tip && <Tooltip tip={tip} onHide={() => setTip(null)} openLeft />}
      <div className={styles.dockHeader}>
        <span className={styles.dockTitle}>★ Favorites</span>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onCollapse}
          title="Hide favorite stats"
          aria-label="Hide favorite stats"
        >
          »
        </button>
      </div>
      <div className={styles.dockBody}>
        {favorites.map(key => {
          const found = rowIndex.get(key)
          if (!found) return null
          const [section, stat] = found
          return (
            <StatRow
              key={key}
              stat={{ ...stat, label: `${stat.label.trim()} · ${section}` }}
              onTip={setTip}
              favKey={key}
              starred
              onToggleStar={toggleFavorite}
              tipAnchor="left"
            />
          )
        })}
        <div className={styles.dockHint}>Star rows in Analysis › Breakdowns to track them here.</div>
      </div>
    </aside>
  )
}
