import { useMemo } from 'react'
import type { Stance } from '../../types/ddo'
import { useCharacter } from '../../context/CharacterContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import { collectSliders, type SliderDef } from '../../lib/effects/sliders'
import {
  collectDynamicStances, isAutoControlled, isSingleSelectionGroup, normalizeStanceGroup,
  type DynamicStance,
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
  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)
  const stances: Stance[] = bundle.allStances

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

  if (!bundle.loaded) {
    return (
      <div className="panel">
        <div className="panel-header">Stances</div>
        <div className="panel-body">
          <p className={styles.empty}>Loading…</p>
        </div>
      </div>
    )
  }

  // Which stances the engine actually has switched on for this build — auto
  // stances derived from gear/race/alignment/fighting style included. This is
  // the set every stance-gated effect is evaluated against.
  const active = new Set(stats.activeStances)
  const overrides = build.stanceOverrides ?? {}

  const autoStances = stances.filter(isAutoControlled)
  const staticToggleable = stances.filter(s => !isAutoControlled(s))
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

  // Auto stances the engine derives without a Stances.xml entry of their own:
  // the wielded weapon types ("Longsword"), the race, the Legendary Green
  // Steel dominance stances, alignment axes. V2 gives these their own
  // generated Auto buttons ("You are wielding a …"/"You are a …"), so they
  // belong on the pane too — and they gate real effects, so being able to
  // force one off is worth as much as for the catalogue ones.
  const listed = new Set<string>([
    ...staticNames,
    ...Array.from(groupMap.values()).flatMap(l => l.map(e => e.name)),
  ])
  const derivedExtras = Array.from(new Set([...active, ...Object.keys(overrides)]))
    .filter(n => !listed.has(n))
    .sort()

  /**
   * Auto stances are DERIVED, so a click sets a manual override rather than
   * storing a state: first click forces the opposite of what the build says,
   * second click drops the override and hands the stance back to the engine.
   */
  function toggleAuto(name: string): void {
    const isOverridden = overrides[name] !== undefined
    dispatch({
      type: 'SET_STANCE_OVERRIDE',
      stanceName: name,
      on: isOverridden ? undefined : !active.has(name),
    })
  }

  function autoTitle(name: string, description?: string): string {
    const isOn = active.has(name)
    const isOverridden = overrides[name] !== undefined
    return [
      description ?? name,
      isOverridden
        ? `Manually forced ${isOn ? 'on' : 'off'} — click to go back to automatic`
        : `Automatic: ${isOn ? 'active' : 'not active'} — click to force it ${isOn ? 'off' : 'on'}`,
    ].join('\n')
  }

  function renderAuto(name: string, description?: string) {
    const isOn = active.has(name)
    const isOverridden = overrides[name] !== undefined
    return (
      <button
        key={name}
        className={[
          styles.stance,
          isOn ? styles.stanceOn : styles.stanceOff,
          isOverridden ? styles.stanceManual : '',
        ].filter(Boolean).join(' ')}
        title={autoTitle(name, description)}
        onClick={() => toggleAuto(name)}
        type="button"
      >
        {isOn ? '✓ ' : ''}{name}{isOverridden ? ' ✋' : ''}
      </button>
    )
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

  const overrideCount = Object.keys(overrides).length

  return (
    <div className="panel">
      <div className="panel-header">Stances</div>
      <div className="panel-body">
        <div className={styles.sections}>
          {(autoStances.length > 0 || derivedExtras.length > 0) && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>Automatic</span>
                {overrideCount > 0 && (
                  <button
                    className={styles.resetButton}
                    type="button"
                    title="Drop every manual override and derive all of them from the build again"
                    onClick={() => dispatch({ type: 'CLEAR_STANCE_OVERRIDES' })}
                  >
                    reset {overrideCount} override{overrideCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
              <p className={styles.hint}>
                On automatically when the build meets their requirements. Click
                one to force it on or off for testing; click again to hand it
                back to the build.
              </p>
              <div className={styles.stanceList}>
                {autoStances.map(s => renderAuto(s.Name, s.Description))}
              </div>
              {derivedExtras.length > 0 && (
                <>
                  <div className={styles.groupTitle}>From your build</div>
                  <div className={styles.stanceList}>
                    {derivedExtras.map(n => renderAuto(n, `Derived from the build: ${n}`))}
                  </div>
                </>
              )}
            </section>
          )}

          {orderedGroups.map(([grp, list]) => (
            <section key={grp} className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>
                  {grp === 'User' ? 'Toggleable' : grp}
                  {isSingleSelectionGroup(grp) ? ' (one active)' : ''}
                </span>
              </div>
              <div className={styles.stanceList}>
                {list.map(e => {
                  const isOn = build.activeBuffs.includes(e.name)
                  // A toggled-on stance whose own requirements fail is revoked
                  // by the engine (V2 CStanceButton::Evaluate → DisableStance),
                  // so it contributes nothing — say so instead of showing it
                  // as if it were live.
                  const revoked = isOn && !active.has(e.name)
                  const tip = [
                    e.description ?? e.name,
                    e.source ? `From: ${e.source}` : '',
                    revoked ? 'Inactive: this build does not meet its requirements' : '',
                  ].filter(Boolean).join('\n')
                  return (
                    <button
                      key={e.name}
                      className={[
                        styles.stance,
                        isOn && !revoked ? styles.stanceOn : '',
                        revoked ? styles.stanceRevoked : '',
                      ].filter(Boolean).join(' ')}
                      title={tip}
                      onClick={() => toggleEntry(e)}
                      type="button"
                    >
                      {isOn && !revoked ? '✓ ' : ''}{e.name}{revoked ? ' ⊘' : ''}
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
                const isActive = !s.activeWhen ||
                  (s.activeWhen.kind === 'stance' && active.has(s.activeWhen.name))
                return (
                  <EffectSlider key={s.name} def={s} active={isActive} />
                )
              })}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
