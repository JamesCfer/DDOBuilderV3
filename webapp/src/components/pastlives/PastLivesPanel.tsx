import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race, Feat } from '../../types/ddo'
import {
  specialFeatTrainedCount, canTrainSpecialFeat, canRevokeSpecialFeat,
  favorFeatTrainedCount, canTrainFavorFeat, canRevokeFavorFeat,
} from '../../lib/specialFeats'
import styles from './PastLivesPanel.module.css'

const CLASS_PL_MAX = 3
const RACIAL_PL_MAX = 3
const ICONIC_PL_MAX = 1
const EPIC_PL_MAX_DEFAULT = 3
const ACQUIRE_MAX_DEFAULT = 1

interface PLGroup {
  title: string
  entries: Array<{ name: string; max: number }>
  /** Defaults to reading/writing `build.pastLives` via SET_PAST_LIFE. */
  getCount?: (name: string) => number
  onIncrement?: (name: string) => void
  onDecrement?: (name: string) => void
  canIncrement?: (name: string, max: number) => boolean
  canDecrement?: (name: string) => boolean
}

export default function PastLivesPanel() {
  const { build, dispatch } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [epicFeats, setEpicFeats] = useState<Feat[]>([])
  const [specialFeatsData, setSpecialFeatsData] = useState<Feat[]>([])
  const [favorFeatsData, setFavorFeatsData] = useState<Feat[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats({ acquire: 'EpicPastLife' }).then(setEpicFeats).catch(() => setEpicFeats([]))
    api.feats({ acquire: 'Special' }).then(setSpecialFeatsData).catch(() => setSpecialFeatsData([]))
    api.feats({ acquire: 'Favor' }).then(setFavorFeatsData).catch(() => setFavorFeatsData([]))
  }, [])

  const heroicClasses = allClasses.filter(c => !c.NotHeroic)
  const heroicRaces = allRaces.filter(r => !r.NotHeroic && !r.IsIconic)
  const iconicRaces = allRaces.filter(r => !r.NotHeroic && r.IsIconic)

  const groups: PLGroup[] = [
    {
      title: 'Heroic Past Lives (max 3 each)',
      entries: heroicClasses.map(c => ({ name: c.Name, max: CLASS_PL_MAX })),
    },
    {
      title: 'Racial Past Lives (max 3 each)',
      entries: heroicRaces.map(r => ({ name: r.Name, max: RACIAL_PL_MAX })),
    },
    {
      title: 'Iconic Past Lives (max 1 each)',
      entries: iconicRaces.map(r => ({ name: r.Name, max: ICONIC_PL_MAX })),
    },
  ]

  // V2 ForumExportDlg.cpp:431 emits "Epic Past Lives" via FeatAcquisition_EpicPastLife.
  // Group by Sphere so the panel mirrors V2's SpecialFeatsPane layout.
  if (epicFeats.length > 0) {
    const bySphere = new Map<string, Feat[]>()
    for (const f of epicFeats) {
      const sph = f.Sphere || 'Other'
      if (!bySphere.has(sph)) bySphere.set(sph, [])
      bySphere.get(sph)!.push(f)
    }
    for (const sph of ['Arcane', 'Divine', 'Martial', 'Primal', 'Other']) {
      const list = bySphere.get(sph)
      if (!list) continue
      groups.push({
        title: `Epic Past Lives — ${sph} (max 3 each)`,
        entries: list.map(f => ({
          name: f.Name,
          max: f.MaxTimesAcquire ?? EPIC_PL_MAX_DEFAULT,
        })),
      })
    }
  }

  // V2 SpecialFeatsPane "Special" group (FeatAcquisition_Special): Chrism
  // reincarnation-cache redemptions etc. Trained count lives in
  // `build.pastLives` alongside past lives (parity pass N9).
  if (specialFeatsData.length > 0) {
    groups.push({
      title: 'Special Feats',
      entries: specialFeatsData.map(f => ({ name: f.Name, max: f.MaxTimesAcquire ?? ACQUIRE_MAX_DEFAULT })),
      getCount: name => specialFeatTrainedCount(build, name),
      onIncrement: name => dispatch({ type: 'TRAIN_SPECIAL_FEAT', featName: name }),
      onDecrement: name => dispatch({ type: 'REVOKE_SPECIAL_FEAT', featName: name }),
      canIncrement: (name, max) => canTrainSpecialFeat(build, name, max),
      canDecrement: name => canRevokeSpecialFeat(build, name),
    })
  }

  // V2 SpecialFeatsPane "Favor" group (FeatAcquisition_Favor): House favor
  // reward feats. Trained as a flat repeatable list in `build.favorFeats`
  // (Build::m_FavorFeats), distinct from the life-level pastLives counters.
  if (favorFeatsData.length > 0) {
    groups.push({
      title: 'Favor Feats',
      entries: favorFeatsData.map(f => ({ name: f.Name, max: f.MaxTimesAcquire ?? ACQUIRE_MAX_DEFAULT })),
      getCount: name => favorFeatTrainedCount(build, name),
      onIncrement: name => dispatch({ type: 'TRAIN_FAVOR_FEAT', featName: name }),
      onDecrement: name => dispatch({ type: 'REVOKE_FAVOR_FEAT', featName: name }),
      canIncrement: (name, max) => canTrainFavorFeat(build, name, max),
      canDecrement: name => canRevokeFavorFeat(build, name),
    })
  }

  const totalPLs = Object.values(build.pastLives).reduce((s, n) => s + n, 0)

  function setCount(name: string, count: number) {
    dispatch({ type: 'SET_PAST_LIFE', source: name, count })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Past Lives
        {totalPLs > 0 && (
          <span className={styles.totalBadge}>{totalPLs} total</span>
        )}
      </div>
      <div className="panel-body">
        {groups.map(group => (
          <section key={group.title} className={styles.section}>
            <div className={styles.sectionTitle}>{group.title}</div>
            <div className={styles.grid}>
              {group.entries.map(entry => {
                const count = group.getCount ? group.getCount(entry.name) : (build.pastLives[entry.name] ?? 0)
                const canDec = group.canDecrement ? group.canDecrement(entry.name) : count > 0
                const canInc = group.canIncrement ? group.canIncrement(entry.name, entry.max) : count < entry.max
                const dec = group.onDecrement ?? (name => setCount(name, Math.max(0, count - 1)))
                const inc = group.onIncrement ?? (name => setCount(name, Math.min(entry.max, count + 1)))
                return (
                  <div key={entry.name} className={styles.entry}>
                    <span className={styles.entryName} title={entry.name}>{entry.name}</span>
                    <div className={styles.controls}>
                      <button
                        className={styles.btn}
                        onClick={() => dec(entry.name)}
                        disabled={!canDec}
                        aria-label={`Decrease ${entry.name}`}
                      >−</button>
                      <span
                        className={styles.count}
                        data-nonzero={count > 0}
                      >{count}</span>
                      <button
                        className={styles.btn}
                        onClick={() => inc(entry.name)}
                        disabled={!canInc}
                        aria-label={`Increase ${entry.name}`}
                      >+</button>
                    </div>
                    <div className={styles.pips}>
                      {Array.from({ length: entry.max }, (_, i) => (
                        <span
                          key={i}
                          className={i < count ? styles.pipFilled : styles.pipEmpty}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        <p className={styles.note}>
          Past lives affect build point totals (via racial completionist) and grant stacking passive bonuses.
        </p>
      </div>
    </div>
  )
}
