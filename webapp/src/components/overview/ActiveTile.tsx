// Overview › Active: what is switched on right now — every stance the engine
// counts as live, and the buffs that have been toggled. A buff chip clicks
// off; the full lists live in the Stances & Buffs window.

import { useMemo } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import styles from './Overview.module.css'

export default function ActiveTile() {
  const { build, dispatch } = useCharacter()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)

  const stances = stats.activeStances
  const buffs = build.activeBuffs ?? []

  return (
    <div className="panel">
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.section}>
          <span>Stances</span>
          <span className={styles.sectionNote}>{stances.length} on</span>
        </div>
        <div className={styles.chips}>
          {stances.length === 0
            ? <span className={styles.empty}>No stance is active</span>
            : stances.map(s => <span key={s} className={`${styles.chip} ${styles.chipOn}`}>{s}</span>)}
        </div>

        <div className={styles.section}>
          <span>Buffs</span>
          <span className={styles.sectionNote}>{buffs.length} on</span>
        </div>
        <div className={styles.chips}>
          {buffs.length === 0
            ? <span className={styles.empty}>No buffs toggled</span>
            : buffs.map(b => (
              <button
                key={b}
                type="button"
                className={`${styles.chip} ${styles.chipOn} ${styles.chipBtn}`}
                title="Click to switch this buff off"
                onClick={() => dispatch({ type: 'TOGGLE_BUFF', buffName: b })}
              >
                {b} ×
              </button>
            ))}
        </div>

        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Guild buffs</span>
            <span className={build.applyGuildBuffs ? styles.rowValue : styles.rowMuted}>
              {build.applyGuildBuffs ? `level ${build.guildLevel ?? 0}` : 'off'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
