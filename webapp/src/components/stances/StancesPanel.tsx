import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import type { Stance, OptionalBuff, Feat, EnhancementTree } from '../../types/ddo'
import { useCharacter } from '../../context/CharacterContext'
import { collectSliders, type SliderDef } from '../../lib/effects/sliders'
import EffectSlider from '../common/EffectSlider'
import styles from './StancesPanel.module.css'

export default function StancesPanel() {
  const { build, dispatch } = useCharacter()
  const [stances, setStances] = useState<Stance[]>([])
  const [loading, setLoading] = useState(true)

  function toggleStance(s: Stance) {
    const incompatible = Array.isArray(s.IncompatibleStance)
      ? s.IncompatibleStance
      : (s.IncompatibleStance ? [s.IncompatibleStance] : undefined)
    dispatch({ type: 'TOGGLE_STANCE', stanceName: s.Name, incompatible })
  }

  // Slider sources
  const [allSelfBuffs, setAllSelfBuffs] = useState<OptionalBuff[]>([])
  const [allFeats, setAllFeats] = useState<Feat[]>([])
  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])

  useEffect(() => {
    api.stances()
      .then(setStances)
      .catch(() => setStances([]))
      .finally(() => setLoading(false))
    api.selfbuffs().then(setAllSelfBuffs).catch(() => setAllSelfBuffs([]))
    api.feats().then(setAllFeats).catch(() => setAllFeats([]))
    api.enhancements().then(setAllTrees).catch(() => setAllTrees([]))
  }, [])

  const sliders: SliderDef[] = useMemo(
    () => collectSliders(build, allSelfBuffs, allFeats, allTrees),
    [build, allSelfBuffs, allFeats, allTrees],
  )

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-header">Stances</div>
        <div className="panel-body">
          <p className={styles.empty}>Loading…</p>
        </div>
      </div>
    )
  }

  // AutoControlled is a presence flag in Stances.xml (<AutoControlled/> parses
  // to an empty string), so test for presence rather than truthiness.
  const autoStances = stances.filter(s => s.AutoControlled !== undefined)
  const toggleableStances = stances.filter(s => s.AutoControlled === undefined)

  // Group toggleable stances by their Group field (repeated <Group> elements
  // parse to an array — use the first entry).
  const groupOf = (s: Stance) =>
    (Array.isArray(s.Group) ? s.Group[0] : s.Group) ?? 'Other'
  const groupMap = new Map<string, Stance[]>()
  for (const s of toggleableStances) {
    const grp = groupOf(s)
    if (!groupMap.has(grp)) groupMap.set(grp, [])
    groupMap.get(grp)!.push(s)
  }

  return (
    <div className="panel">
      <div className="panel-header">Stances</div>
      <div className="panel-body">
        {stances.length === 0 ? (
          <p className={styles.empty}>No stance data available.</p>
        ) : (
          <div className={styles.sections}>
            {autoStances.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionTitle}>Automatic</div>
                <div className={styles.stanceList}>
                  {autoStances.map(s => (
                    <div
                      key={s.Name}
                      className={`${styles.stance} ${styles.stanceAuto}`}
                      title={s.Description ?? s.Name}
                    >
                      {s.Name}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {toggleableStances.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionTitle}>Toggleable</div>
                {Array.from(groupMap.entries()).map(([grp, list]) => (
                  <div key={grp} className={styles.group}>
                    {groupMap.size > 1 && (
                      <div className={styles.groupTitle}>{grp}</div>
                    )}
                    <div className={styles.stanceList}>
                      {list.map(s => {
                        const isOn = build.activeBuffs.includes(s.Name)
                        return (
                          <button
                            key={s.Name}
                            className={`${styles.stance} ${isOn ? styles.stanceOn : ''}`}
                            title={s.Description ?? s.Name}
                            onClick={() => toggleStance(s)}
                            type="button"
                          >
                            {isOn ? '✓ ' : ''}{s.Name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {autoStances.length === 0 && toggleableStances.length === 0 && (
              <p className={styles.empty}>No stances available.</p>
            )}

            {sliders.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionTitle}>Active Sliders</div>
                {sliders.map(s => {
                  const active = !s.activeWhen ||
                    (s.activeWhen.kind === 'stance' && build.activeBuffs.includes(s.activeWhen.name))
                  return (
                    <EffectSlider key={s.name} def={s} active={active} />
                  )
                })}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
