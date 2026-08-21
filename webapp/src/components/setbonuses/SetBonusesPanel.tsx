import { useMemo } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useGearItems } from '../../hooks/useGearItems'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { computeSetBonusCounts, mergeAugmentChoices } from '../../lib/buildStats'
import type { SetBonus, SetBonusBuff } from '../../types/ddo'
import styles from './SetBonusesPanel.module.css'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

interface ActiveSetBonus {
  type: string
  count: number
  def?: SetBonus
}

export default function SetBonusesPanel() {
  const { build } = useCharacter()
  const gearItems = useGearItems(build.gear)
  const { allAugments, allSetBonuses, loaded } = useStaticBundle()

  const equippedNames = Object.values(build.gear).filter(Boolean)

  // Set counts come from the same helper the stat map uses, so augment-granted
  // sets (the raid "3 pieces equipped" essences, Greensteel, Slave Lords,
  // Dinosaur Bone …) and each augment's SuppressSetBonus flag are honoured
  // here exactly as they are when the bonus's effects are applied.
  const active = useMemo<Array<{ type: string; count: number }>>(() => {
    const counts = computeSetBonusCounts(
      gearItems,
      mergeAugmentChoices(build, gearItems),
      allAugments,
    )
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
  }, [build, gearItems, allAugments])

  const hasGear = equippedNames.length > 0
  const loading = !loaded

  const enriched: ActiveSetBonus[] = active.map(a => ({
    ...a,
    def: allSetBonuses.find(d => d.Type === a.type),
  }))

  function renderTiers(item: ActiveSetBonus) {
    const buffs: SetBonusBuff[] = toArray(item.def?.Buff)
    if (buffs.length === 0) return null

    // Sort by EquippedCount ascending
    const sorted = buffs.slice().sort((a, b) => a.EquippedCount - b.EquippedCount)

    // Show all unlocked tiers plus the next locked tier
    const unlockedTiers = sorted.filter(b => b.EquippedCount <= item.count)
    const nextLockedTier = sorted.find(b => b.EquippedCount > item.count)
    const tiersToShow = nextLockedTier ? [...unlockedTiers, nextLockedTier] : unlockedTiers

    return (
      <div className={styles.tiers}>
        {tiersToShow.map((buff, idx) => {
          const unlocked = buff.EquippedCount <= item.count
          return (
            <div
              key={idx}
              className={`${styles.tier} ${unlocked ? styles.tierUnlocked : styles.tierLocked}`}
            >
              <span className={styles.tierCheck}>{unlocked ? '✓' : '○'}</span>
              <span className={styles.tierCount}>{buff.EquippedCount}pc:</span>
              <span className={styles.tierDesc}>{buff.Description ?? '(no description)'}</span>
              {!unlocked && (
                <span className={styles.tierNeed}>
                  need {buff.EquippedCount - item.count} more
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">Set Bonuses</div>
      <div className="panel-body">
        {!hasGear ? (
          <p className={styles.empty}>Equip items to see set bonus progress.</p>
        ) : loading ? (
          <p className={styles.empty}>Loading…</p>
        ) : enriched.length === 0 ? (
          <p className={styles.empty}>No set bonuses active with current gear.</p>
        ) : (
          <div className={styles.list}>
            {enriched.map(item => (
              <div key={item.type} className={styles.setBonus}>
                <div className={styles.header}>
                  <span className={styles.name}>{item.type}</span>
                  <span className={styles.badge}>{item.count} piece{item.count !== 1 ? 's' : ''} equipped</span>
                </div>
                {renderTiers(item)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
