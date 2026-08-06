import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import { HEROIC_MAX_LEVEL, EPIC_MAX_LEVELS, LEGENDARY_MAX_LEVELS } from '../../lib/gamedata'
import { getLevelClasses } from '../../lib/levelProgression'
import styles from './ClassSelector.module.css'

const HEROIC_LEVELS = HEROIC_MAX_LEVEL
const EPIC_MAX = EPIC_MAX_LEVELS
const LEGENDARY_MAX = LEGENDARY_MAX_LEVELS
const CLASS_COLORS = ['#c88a2a', '#6ab0de', '#8acd6a']

function classIndex(name: string, assigned: string[]): number {
  const idx = assigned.indexOf(name)
  return idx >= 0 ? idx : 0
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/** Alignments this class permits ([] = any). */
function allowedAlignments(cls: DDOClass): string[] {
  const list = toArray(cls.Alignment).map(String)
  return list.includes('Any') ? [] : list
}

function alignmentAllows(cls: DDOClass, alignment: string): boolean {
  const list = allowedAlignments(cls)
  return list.length === 0 || list.includes(alignment)
}

export default function ClassSelector() {
  const { build, dispatch } = useCharacter()
  const [classes, setClasses] = useState<DDOClass[]>([])
  const [loading, setLoading] = useState(true)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    api.classes()
      .then(data => setClasses(data.filter(c => !c.NotHeroic && c.Name !== 'Unknown')))
      .finally(() => setLoading(false))
  }, [])

  // Per-level class array (V2 m_Levels parity); falls back to flatten for legacy data
  const levelClasses: string[] = getLevelClasses(build)
  while (levelClasses.length < HEROIC_LEVELS) levelClasses.push('')

  const usedClassNames = build.classes.map(c => c.name).filter(Boolean) as string[]

  const totals: Record<string, number> = {}
  for (const cls of levelClasses) {
    if (cls) totals[cls] = (totals[cls] ?? 0) + 1
  }

  const epicLevels = build.epicLevels ?? 10
  const legendaryLevels = build.legendaryLevels ?? 4
  const heroicAssigned = levelClasses.filter(Boolean).length
  const grandTotal = heroicAssigned + epicLevels + legendaryLevels
  const emptySlots = HEROIC_LEVELS - heroicAssigned
  const classCountFull = usedClassNames.length >= 3

  const heroicClasses = useMemo(
    () => [...classes].sort((a, b) => a.Name.localeCompare(b.Name)),
    [classes],
  )
  const usedClassObjs = usedClassNames
    .map(n => classes.find(c => c.Name === n))
    .filter((c): c is DDOClass => !!c)

  function setLevelClass(levelIndex: number, className: string) {
    // V2 parity: edit only the per-level slot the user clicked. The reducer
    // re-derives the `classes` aggregate from the updated array, so order
    // (e.g. Wizard at L1 then Fighter at L2) is preserved.
    dispatch({ type: 'SET_LEVEL_CLASS', level: levelIndex, name: className })
  }

  function fillEmpty(className: string) {
    const next = [...levelClasses]
    for (let i = 0; i < HEROIC_LEVELS; i++) {
      if (!next[i]) next[i] = className
    }
    dispatch({ type: 'SET_LEVEL_CLASSES', levels: next })
  }

  function clearAll() {
    dispatch({ type: 'SET_LEVEL_CLASSES', levels: Array.from({ length: HEROIC_LEVELS }, () => '') })
  }

  function clearClass(className: string) {
    dispatch({
      type: 'SET_LEVEL_CLASSES',
      levels: levelClasses.slice(0, HEROIC_LEVELS).map(c => (c === className ? '' : c)),
    })
  }

  /** Add one level of a class (first empty slot). */
  function addLevel(className: string) {
    const idx = levelClasses.findIndex(c => !c)
    if (idx < 0 || idx >= HEROIC_LEVELS) return
    setLevelClass(idx, className)
  }

  /**
   * Set a class's total heroic levels directly: extra levels fill empty
   * slots from the front, removed levels are blanked from the end (the same
   * reconciliation the SET_CLASS_LEVELS reducer uses).
   */
  function setCount(className: string, target: number) {
    const current = totals[className] ?? 0
    const clamped = Math.max(0, Math.min(HEROIC_LEVELS, Math.min(target, current + emptySlots)))
    if (clamped === current) return
    const next = [...levelClasses].slice(0, HEROIC_LEVELS)
    if (clamped > current) {
      let toAdd = clamped - current
      for (let i = 0; i < next.length && toAdd > 0; i++) {
        if (!next[i]) { next[i] = className; toAdd-- }
      }
    } else {
      let toRemove = current - clamped
      for (let i = next.length - 1; i >= 0 && toRemove > 0; i--) {
        if (next[i] === className) { next[i] = ''; toRemove-- }
      }
    }
    dispatch({ type: 'SET_LEVEL_CLASSES', levels: next })
  }

  /**
   * Drag-and-drop reorder of the selected classes. Order = which class is
   * class 1/2/3 (first appearance in the level plan), so the plan is
   * rewritten as grouped blocks in the new order.
   */
  function reorder(from: number, to: number) {
    if (from === to) return
    const order = [...usedClassNames]
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    const next: string[] = []
    for (const name of order) {
      for (let i = 0; i < (totals[name] ?? 0); i++) next.push(name)
    }
    while (next.length < HEROIC_LEVELS) next.push('')
    dispatch({ type: 'SET_LEVEL_CLASSES', levels: next })
  }

  /**
   * Why a class NOT yet in the build can't join it (null = allowed, and
   * always null for classes already in the build). Shared by the pick list
   * and the per-level grid so an illegal combo (e.g. Dragon Lord + Fighter,
   * Sacred Fist + Paladin) can't sneak in through either path.
   */
  function joinBlockReason(cls: DDOClass): string | null {
    if (usedClassNames.includes(cls.Name)) return null
    if (!alignmentAllows(cls, build.alignment)) {
      return `Requires alignment: ${allowedAlignments(cls).join(', ')}`
    }
    if (classCountFull) return 'Already using 3 classes — clear one first'
    if (cls.BaseClass && usedClassNames.includes(cls.BaseClass)) {
      return `${cls.Name} is an archetype of ${cls.BaseClass} — you cannot take both`
    }
    const archOfThis = usedClassObjs.find(c => c.BaseClass === cls.Name)
    if (archOfThis) {
      return `${archOfThis.Name} is an archetype of ${cls.Name} — you cannot take both`
    }
    // Archetypes of *different* base classes multiclass freely (each counts
    // as one of the 3 classes); only two archetypes sharing a base conflict.
    const sameBase = cls.BaseClass && usedClassObjs.find(c => c.BaseClass === cls.BaseClass)
    if (sameBase) {
      return `${sameBase.Name} is also a ${cls.BaseClass} archetype — you cannot take both`
    }
    return null
  }

  /** Why a pick-list row is unpickable right now (null = pickable). */
  function disabledReason(cls: DDOClass): string | null {
    if (!alignmentAllows(cls, build.alignment)) {
      return `Requires alignment: ${allowedAlignments(cls).join(', ')}`
    }
    const join = joinBlockReason(cls)
    if (join) return join
    if (emptySlots <= 0) return 'All 20 heroic levels are assigned'
    return null
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Classes
        <span className={styles.levelTotal}>Lv {grandTotal}</span>
      </div>
      <div className="panel-body">
        {loading ? (
          <span className={styles.loading}>Loading classes…</span>
        ) : (
          <>
            {/* ── Selected classes: vertical, draggable, editable at once ── */}
            <div className={styles.selectedList}>
              {usedClassNames.length === 0 && (
                <div className={styles.selectedEmpty}>
                  Pick classes from the list below — up to 3.
                </div>
              )}
              {usedClassNames.map((name, i) => {
                const cls = classes.find(c => c.Name === name)
                const misaligned = cls && !alignmentAllows(cls, build.alignment)
                const count = totals[name] ?? 0
                return (
                  <div
                    key={name}
                    className={`${styles.selectedRow} ${dragOverIndex === i ? styles.selectedRowDragOver : ''}`}
                    style={{ borderLeftColor: CLASS_COLORS[i] }}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
                    onDragLeave={() => setDragOverIndex(cur => (cur === i ? null : cur))}
                    onDrop={e => {
                      e.preventDefault()
                      if (dragIndex !== null) reorder(dragIndex, i)
                      setDragIndex(null)
                      setDragOverIndex(null)
                    }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                    title="Drag to reorder classes — levels are regrouped in the new class order"
                  >
                    <span className={styles.dragHandle}>⠿</span>
                    <DdoIcon category="ClassImages" name={name} size={24} />
                    <span className={styles.selectedName} style={{ color: CLASS_COLORS[i] }}>{name}</span>
                    {misaligned && (
                      <span
                        className={styles.alignWarnBadge}
                        title={`${name} does not allow ${build.alignment} (requires: ${cls ? allowedAlignments(cls).join(', ') : ''})`}
                      >⚠️</span>
                    )}
                    <button className={styles.rowBtn} disabled={count <= 0}
                      onClick={() => setCount(name, count - 1)} title="Remove one level">−</button>
                    <input
                      type="number"
                      className={styles.countInput}
                      value={count}
                      min={0}
                      max={HEROIC_LEVELS}
                      onChange={e => setCount(name, Number(e.target.value) || 0)}
                      title={`${name} heroic levels`}
                    />
                    <button className={styles.rowBtn} disabled={emptySlots <= 0}
                      onClick={() => setCount(name, count + 1)} title="Add one level">+</button>
                    <button className={`${styles.rowBtn} ${styles.rowBtnWide}`} disabled={emptySlots <= 0}
                      onClick={() => fillEmpty(name)} title={`Assign all remaining levels to ${name}`}>Fill</button>
                    <button className={styles.rowBtn}
                      onClick={() => clearClass(name)} title={`Remove ${name} (clears its levels)`}>✕</button>
                  </div>
                )
              })}
              <span className={`${styles.classCountBadge} ${classCountFull ? styles.classCountFull : ''}`}>
                {usedClassNames.length}/3 classes · {heroicAssigned}/20 levels
              </span>
            </div>

            {/* ── All classes: vertical pick list, greyed by alignment ───── */}
            <div className={styles.classList}>
              {heroicClasses.map(cls => {
                const selected = usedClassNames.includes(cls.Name)
                const reason = disabledReason(cls)
                const aligned = alignmentAllows(cls, build.alignment)
                return (
                  <button
                    key={cls.Name}
                    className={`${styles.classRow} ${selected ? styles.classRowSelected : ''}`}
                    disabled={!!reason}
                    onClick={() => addLevel(cls.Name)}
                    title={reason ?? (selected
                      ? `Add one more ${cls.Name} level`
                      : `Add ${cls.Name}${!aligned ? '' : ' (click to take level 1 of it)'}`)}
                  >
                    <DdoIcon category="ClassImages" name={cls.Name} size={24} />
                    <span className={styles.classRowName}>{cls.Name}</span>
                    {cls.BaseClass && <span className={styles.archetypeTag}>{cls.BaseClass} archetype</span>}
                    {selected && <span className={styles.classRowCount}>{totals[cls.Name] ?? 0} ✓</span>}
                  </button>
                )
              })}
            </div>

            {/* ── Heroic levels 1–20 ── */}
            <div className={styles.sectionHeader}>
              <span>Heroic</span>
              <span className={styles.sectionCount}>
                {heroicAssigned}/20
                {heroicAssigned > 0 && (
                  <button className={`${styles.rowBtn} ${styles.rowBtnWide}`}
                    style={{ display: 'inline-flex', marginLeft: 6 }}
                    onClick={clearAll}
                    title="Clear all 20 heroic level assignments">Clear all</button>
                )}
              </span>
            </div>
            <div className={styles.levelGrid}>
              {Array.from({ length: HEROIC_LEVELS }, (_, i) => {
                const lvl = i + 1
                const cls = levelClasses[i] ?? ''
                const clsIdx = classIndex(cls, usedClassNames)
                return (
                  <div key={lvl} className={styles.levelCell}>
                    <span className={styles.levelNum}>{lvl}</span>
                    <select
                      className={styles.levelSelect}
                      value={cls}
                      onChange={e => setLevelClass(i, e.target.value)}
                      style={cls ? { borderColor: CLASS_COLORS[clsIdx], color: CLASS_COLORS[clsIdx] } : {}}
                    >
                      <option value="">—</option>
                      {heroicClasses.map(c => {
                        // Same join rules as the pick list — a class that
                        // can't legally join the build is disabled here too
                        // (the level's current value always stays enabled).
                        const blocked = c.Name !== cls && joinBlockReason(c) !== null
                        return (
                          <option key={c.Name} value={c.Name} disabled={blocked}>{c.Name}</option>
                        )
                      })}
                    </select>
                  </div>
                )
              })}
            </div>

            {/* ── Epic levels 21–30 ── */}
            <div className={styles.sectionHeader}>
              <span>Epic <span className={styles.sectionRange}>(Lv 21–30)</span></span>
              <span className={styles.sectionCount}>{epicLevels}/10</span>
            </div>
            <div className={styles.progressionRow}>
              <button className={styles.adjBtn}
                disabled={epicLevels <= 0}
                onClick={() => dispatch({ type: 'SET_EPIC_LEVELS', levels: epicLevels - 1 })}>−</button>
              <div className={styles.progressPips}>
                {Array.from({ length: EPIC_MAX }, (_, i) => (
                  <button
                    key={i}
                    className={`${styles.pip} ${i < epicLevels ? styles.pipFilled : ''}`}
                    onClick={() => dispatch({ type: 'SET_EPIC_LEVELS', levels: i + 1 })}
                    title={`Epic level ${i + 1} (character level ${21 + i})`}
                  />
                ))}
              </div>
              <button className={styles.adjBtn}
                disabled={epicLevels >= EPIC_MAX}
                onClick={() => dispatch({ type: 'SET_EPIC_LEVELS', levels: epicLevels + 1 })}>+</button>
            </div>

            {/* ── Legendary levels 31+ (game cap is level 36; data defines to 40) ── */}
            <div className={styles.sectionHeader}>
              <span>Legendary <span className={styles.sectionRange}>(Lv 31–{30 + LEGENDARY_MAX})</span></span>
              <span className={styles.sectionCount}>{legendaryLevels}/{LEGENDARY_MAX}</span>
            </div>
            <div className={styles.progressionRow}>
              <button className={styles.adjBtn}
                disabled={legendaryLevels <= 0}
                onClick={() => dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: legendaryLevels - 1 })}>−</button>
              <div className={styles.progressPips}>
                {Array.from({ length: LEGENDARY_MAX }, (_, i) => (
                  <button
                    key={i}
                    className={`${styles.pip} ${i < legendaryLevels ? styles.pipFilled : ''}`}
                    onClick={() => dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: i + 1 })}
                    title={`Legendary level ${i + 1} (character level ${31 + i})`}
                  />
                ))}
              </div>
              <button className={styles.adjBtn}
                disabled={legendaryLevels >= LEGENDARY_MAX}
                onClick={() => dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: legendaryLevels + 1 })}>+</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
