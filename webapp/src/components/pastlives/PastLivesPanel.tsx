import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race, Feat } from '../../types/ddo'
import {
  specialFeatTrainedCount, canTrainSpecialFeat, canRevokeSpecialFeat,
} from '../../lib/specialFeats'
import CollapsibleCard from '../common/CollapsibleCard'
import styles from './PastLivesPanel.module.css'

const CLASS_PL_MAX = 3
const RACIAL_PL_MAX = 3
// Iconic past lives stack 3× like heroic/racial ones — the race-file feats
// carry <MaxTimesAcquire>3</MaxTimesAcquire> (e.g. Bladeforged.race.xml
// "Past Life: Bladeforged": +[10/20/30] per-stack stance bonuses).
const ICONIC_PL_MAX = 3
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
  /** Show "+1 all" / "Clear" bulk buttons (past-life groups only). */
  bulk?: boolean
}

interface Props {
  /**
   * Render as a folded card with a state summary in the header instead of an
   * always-open panel — used to host the editor on the Character Overview.
   * The body (and therefore its catalogue fetches) stays unmounted until the
   * card is first opened.
   */
  collapsible?: boolean
}

export default function PastLivesPanel({ collapsible = false }: Props = {}) {
  const { build } = useCharacter()
  const totalPLs = Object.values(build.pastLives).reduce((s, n) => s + n, 0)

  if (collapsible) {
    return (
      <CollapsibleCard
        title="Past Lives"
        summary={totalPLs > 0 ? `${totalPLs} total` : 'none trained'}
      >
        <PastLivesBody />
      </CollapsibleCard>
    )
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
        <PastLivesBody />
      </div>
    </div>
  )
}

function PastLivesBody() {
  const { build, dispatch } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [epicFeats, setEpicFeats] = useState<Feat[]>([])
  const [specialFeatsData, setSpecialFeatsData] = useState<Feat[]>([])
  const [destinyClaimFeats, setDestinyClaimFeats] = useState<Feat[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats({ acquire: 'EpicPastLife' }).then(setEpicFeats).catch(() => setEpicFeats([]))
    api.feats({ acquire: 'Special' }).then(setSpecialFeatsData).catch(() => setSpecialFeatsData([]))
    api.feats({ acquire: 'EpicDestinyTree' }).then(setDestinyClaimFeats).catch(() => setDestinyClaimFeats([]))
  }, [])

  const heroicClasses = allClasses.filter(c => !c.NotHeroic)
  const heroicRaces = allRaces.filter(r => !r.NotHeroic && !r.IsIconic)
  const iconicRaces = allRaces.filter(r => !r.NotHeroic && r.IsIconic)

  const groups: PLGroup[] = [
    {
      title: 'Heroic Past Lives (max 3 each)',
      entries: heroicClasses.map(c => ({ name: c.Name, max: CLASS_PL_MAX })),
      bulk: true,
    },
    {
      title: 'Racial Past Lives (max 3 each)',
      entries: heroicRaces.map(r => ({ name: r.Name, max: RACIAL_PL_MAX })),
      bulk: true,
    },
    {
      title: 'Iconic Past Lives (max 3 each)',
      entries: iconicRaces.map(r => ({ name: r.Name, max: ICONIC_PL_MAX })),
      bulk: true,
    },
  ]

  // U51 Destiny Tree claim feats (Feats.xml Acquire=EpicDestinyTree): one per
  // epic destiny — "You have claimed the <Destiny> Epic Destiny tree. Also
  // grants 3 Fate points when claimed". Every 3 Fate Points = +1 destiny
  // point, so each claimed destiny grows the shared destiny-point pool.
  if (destinyClaimFeats.length > 0) {
    groups.push({
      title: 'Epic Destinies Claimed (+3 Fate Points each → +1 Destiny Point)',
      entries: destinyClaimFeats.map(f => ({ name: f.Name, max: f.MaxTimesAcquire ?? 1 })),
      bulk: true,
    })
  }

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
        bulk: true,
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

  function setCount(name: string, count: number) {
    dispatch({ type: 'SET_PAST_LIFE', source: name, count })
  }

  // "Completionist" bulk helpers: +1 to every entry in a group (clicking a
  // 3-max group's button three times trains full completionist), and Clear.
  function bulkIncrement(group: PLGroup) {
    for (const entry of group.entries) {
      const current = build.pastLives[entry.name] ?? 0
      if (current < entry.max) setCount(entry.name, current + 1)
    }
  }

  function bulkClear(group: PLGroup) {
    for (const entry of group.entries) {
      if ((build.pastLives[entry.name] ?? 0) > 0) setCount(entry.name, 0)
    }
  }

  return (
    <>
        {groups.map(group => (
          <section key={group.title} className={styles.section}>
            <div className={styles.sectionTitle}>
              {group.title}
              {group.bulk && (
                <span className={styles.bulkBtns}>
                  <button
                    className={styles.bulkBtn}
                    onClick={() => bulkIncrement(group)}
                    disabled={group.entries.every(e => (build.pastLives[e.name] ?? 0) >= e.max)}
                    title="Add one past life of every entry in this group (click repeatedly for full completionist)"
                  >+1 all</button>
                  <button
                    className={styles.bulkBtn}
                    onClick={() => bulkClear(group)}
                    disabled={group.entries.every(e => (build.pastLives[e.name] ?? 0) === 0)}
                    title="Clear every past life in this group"
                  >Clear</button>
                </span>
              )}
            </div>
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
    </>
  )
}
