import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import type { Stance } from '../../types/ddo'
import { useCharacter } from '../../context/CharacterContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { collectSliders, type SliderDef } from '../../lib/effects/sliders'
import {
  collectDynamicStances, isSingleSelectionGroup, normalizeStanceGroup, type DynamicStance,
} from '../../lib/stances/dynamicStances'
import EffectSlider from '../common/EffectSlider'
import styles from './StancesPanel.module.css'

interface ToggleEntry {
  name: string
  description?: string
  group: string
  /** Origin label for dynamic stances ("Divine Crusader: Holy Mantle"). */
  source?: string
}

export default function StancesPanel() {
  const { build, dispatch } = useCharacter()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const [stances, setStances] = useState<Stance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.stances()
      .then(setStances)
      .catch(() => setStances([]))
      .finally(() => setLoading(false))
  }, [])

  // Build-specific stance toggles (V2 CStancesPane NotifyNewStance parity):
  // trained tree items (destiny mantles etc.), equipped items and their
  // ItemBuffs.xml templates, trained spells, trained feats.
  const dynamicStances: DynamicStance[] = useMemo(() => {
    const itemBuffTemplates = new Map<string, unknown>(
      bundle.allItemBuffs.map(b => [(b as { Type: string }).Type, b]),
    )
    return collectDynamicStances(build, {
      allTrees: bundle.allTrees,
      allFeats: bundle.allFeats,
      allSpells: bundle.allSpells,
      itemBuffTemplates,
      gearItems,
    })
  }, [build, bundle, gearItems])

  const sliders: SliderDef[] = useMemo(
    () => collectSliders(build, bundle.allSelfBuffs, bundle.allFeats, bundle.allTrees),
    [build, bundle],
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

  const autoStances = stances.filter(s => s.AutoControlled)
  const staticToggleable = stances.filter(s => !s.AutoControlled)
  const staticNames = new Set(stances.map(s => s.Name))

  // Merge static + dynamic toggles into V2-style groups. Dynamic stances
  // whose name collides with a static one are already covered.
  const groupMap = new Map<string, ToggleEntry[]>()
  function addToGroup(e: ToggleEntry): void {
    if (!groupMap.has(e.group)) groupMap.set(e.group, [])
    groupMap.get(e.group)!.push(e)
  }
  for (const s of staticToggleable) {
    addToGroup({ name: s.Name, description: s.Description, group: normalizeStanceGroup(s.Group as string | string[] | undefined) })
  }
  for (const d of dynamicStances) {
    if (d.autoControlled || staticNames.has(d.name)) continue
    addToGroup({ name: d.name, description: d.description, group: d.group, source: d.source })
  }

  function toggleEntry(e: ToggleEntry): void {
    // V2: named groups (Mantle, …) are single-selection — activating one
    // stance deactivates its group siblings (StanceGroup::IsSingleSelection,
    // Build::ActivateStance). Static stances additionally carry their own
    // IncompatibleStance lists.
    const staticDef = stances.find(s => s.Name === e.name)
    const ownIncompat = Array.isArray(staticDef?.IncompatibleStance)
      ? staticDef.IncompatibleStance
      : staticDef?.IncompatibleStance ? [staticDef.IncompatibleStance] : []
    const groupSiblings = isSingleSelectionGroup(e.group)
      ? (groupMap.get(e.group) ?? []).map(x => x.name).filter(n => n !== e.name)
      : []
    const incompatible = [...new Set([...ownIncompat, ...groupSiblings])]
    dispatch({
      type: 'TOGGLE_STANCE',
      stanceName: e.name,
      incompatible: incompatible.length > 0 ? incompatible : undefined,
    })
  }

  // Render "User" first, then the named groups alphabetically.
  const orderedGroups = Array.from(groupMap.entries()).sort(([a], [b]) => {
    if (a === 'User') return -1
    if (b === 'User') return 1
    return a.localeCompare(b)
  })

  return (
    <div className="panel">
      <div className="panel-header">Stances</div>
      <div className="panel-body">
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

          {orderedGroups.map(([grp, list]) => (
            <section key={grp} className={styles.section}>
              <div className={styles.sectionTitle}>
                {grp === 'User' ? 'Toggleable' : grp}
                {isSingleSelectionGroup(grp) ? ' (one active)' : ''}
              </div>
              <div className={styles.stanceList}>
                {list.map(e => {
                  const isOn = build.activeBuffs.includes(e.name)
                  const tip = [e.description ?? e.name, e.source ? `From: ${e.source}` : '']
                    .filter(Boolean).join('\n')
                  return (
                    <button
                      key={e.name}
                      className={`${styles.stance} ${isOn ? styles.stanceOn : ''}`}
                      title={tip}
                      onClick={() => toggleEntry(e)}
                      type="button"
                    >
                      {isOn ? '✓ ' : ''}{e.name}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}

          {autoStances.length === 0 && orderedGroups.length === 0 && (
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
      </div>
    </div>
  )
}
