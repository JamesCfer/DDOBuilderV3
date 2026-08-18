import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import {
  HEROIC_MAX_LEVEL, EPIC_MAX_LEVELS, LEGENDARY_MAX_LEVELS,
  LEGENDARY_DEFAULT_LEVELS, classShortName,
} from '../../lib/gamedata'
import { getLevelClasses } from '../../lib/levelProgression'
import styles from './ClassSelector.module.css'

const HEROIC_LEVELS = HEROIC_MAX_LEVEL
const EPIC_MAX = EPIC_MAX_LEVELS
const LEGENDARY_MAX = LEGENDARY_MAX_LEVELS
const CLASS_COLORS = ['#c88a2a', '#6ab0de', '#8acd6a']

/** Payload marker for the palette's "erase" tile. */
const ERASER = ''

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
  /** Class picked up by click ('' = eraser, null = nothing armed). */
  const [armed, setArmed] = useState<string | null>(null)
  /** Class being dragged out of the palette ('' = eraser). */
  const [dragClass, setDragClass] = useState<string | null>(null)
  /** Heroic level box being dragged (0-based). */
  const [dragLevel, setDragLevel] = useState<number | null>(null)
  const [dragOverLevel, setDragOverLevel] = useState<number | null>(null)

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

  const epicLevels = build.epicLevels ?? EPIC_MAX
  const legendaryLevels = build.legendaryLevels ?? LEGENDARY_DEFAULT_LEVELS
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
    // V2 parity: edit only the per-level slot the user changed. The reducer
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

  /**
   * Why a class NOT yet in the build can't join it (null = allowed, and
   * always null for classes already in the build). Shared by the palette and
   * the level boxes so an illegal combo (e.g. Dragon Lord + Fighter, Sacred
   * Fist + Paladin) can't sneak in through either path.
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

  /** Why a palette tile can't be dropped anywhere right now (null = usable). */
  function disabledReason(cls: DDOClass): string | null {
    if (!alignmentAllows(cls, build.alignment)) {
      return `Requires alignment: ${allowedAlignments(cls).join(', ')}`
    }
    return joinBlockReason(cls)
  }

  /**
   * Put `className` ('' clears) into heroic level box `idx`, refusing a class
   * that cannot legally join the build. Dropping onto the box it already
   * holds is a no-op.
   */
  function assignLevel(idx: number, className: string) {
    if (idx < 0 || idx >= HEROIC_LEVELS) return
    if (levelClasses[idx] === className) return
    if (className) {
      const cls = classes.find(c => c.Name === className)
      if (!cls || joinBlockReason(cls)) return
    }
    setLevelClass(idx, className)
  }

  /** Swap two heroic level boxes (drag a box onto another box). */
  function swapLevels(from: number, to: number) {
    if (from === to) return
    const next = levelClasses.slice(0, HEROIC_LEVELS)
    const tmp = next[from]
    next[from] = next[to]
    next[to] = tmp
    dispatch({ type: 'SET_LEVEL_CLASSES', levels: next })
  }

  /** A box click: drop the armed class, or pick this box's class up. */
  function boxClick(idx: number) {
    if (armed !== null) {
      assignLevel(idx, armed)
      return
    }
    const cur = levelClasses[idx]
    if (cur) setArmed(cur)
  }

  function endDrag() {
    setDragClass(null)
    setDragLevel(null)
    setDragOverLevel(null)
  }

  /** Drop onto heroic box `idx` — from the palette or from another box. */
  function dropOnLevel(idx: number) {
    if (dragLevel !== null) swapLevels(dragLevel, idx)
    else if (dragClass !== null) assignLevel(idx, dragClass)
    endDrag()
  }

  function setEpic(count: number) {
    dispatch({ type: 'SET_EPIC_LEVELS', levels: Math.max(0, Math.min(EPIC_MAX, count)) })
  }

  function setLegendary(count: number) {
    dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: Math.max(0, Math.min(LEGENDARY_MAX, count)) })
  }

  /** Epic/legendary boxes toggle: clicking the last filled one removes it. */
  function toggleTail(index: number, current: number, set: (n: number) => void) {
    set(index + 1 === current ? index : index + 1)
  }

  const armedLabel = armed === null ? '' : armed === ERASER ? 'Erase' : armed

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
            {/* ── Class palette: drag a tile onto a level box ───────────── */}
            <div className={styles.palette} role="list" aria-label="Classes">
              <button
                type="button"
                role="listitem"
                className={`${styles.classTile} ${styles.eraserTile} ${armed === ERASER ? styles.classTileArmed : ''}`}
                draggable
                onDragStart={() => { setDragClass(ERASER); setDragLevel(null) }}
                onDragEnd={endDrag}
                onClick={() => setArmed(a => (a === ERASER ? null : ERASER))}
                title="Drag onto a level box (or click, then click a box) to clear it"
              >
                <span className={styles.eraserGlyph}>✕</span>
                <span className={styles.classTileShort}>CLR</span>
              </button>
              {heroicClasses.map(cls => {
                const selected = usedClassNames.includes(cls.Name)
                const reason = disabledReason(cls)
                const count = totals[cls.Name] ?? 0
                const colour = selected ? CLASS_COLORS[classIndex(cls.Name, usedClassNames)] : undefined
                return (
                  <button
                    type="button"
                    role="listitem"
                    key={cls.Name}
                    data-class={cls.Name}
                    className={`${styles.classTile} ${selected ? styles.classTileSelected : ''} ${armed === cls.Name ? styles.classTileArmed : ''}`}
                    style={colour ? { borderColor: colour } : undefined}
                    draggable={!reason}
                    disabled={!!reason}
                    onDragStart={() => { setDragClass(cls.Name); setDragLevel(null) }}
                    onDragEnd={endDrag}
                    onClick={() => setArmed(a => (a === cls.Name ? null : cls.Name))}
                    title={reason ?? `${cls.Name}${cls.BaseClass ? ` (${cls.BaseClass} archetype)` : ''} — drag onto a level box, or click then click a box`}
                  >
                    <DdoIcon category="ClassImages" name={cls.Name} size={26} />
                    <span className={styles.classTileShort} style={colour ? { color: colour } : undefined}>
                      {classShortName(cls.Name)}
                    </span>
                    <span className={styles.classRowName}>{cls.Name}</span>
                    {count > 0 && <span className={styles.classTileCount}>{count}</span>}
                  </button>
                )
              })}
            </div>

            <div className={styles.toolbar}>
              <span className={styles.hint}>
                {armed === null
                  ? 'Drag a class onto a level box — or drag boxes to swap them.'
                  : `${armedLabel} armed — click a level box to place it.`}
              </span>
              {armed !== null && armed !== ERASER && (
                <button className={styles.toolBtn} disabled={emptySlots <= 0}
                  onClick={() => fillEmpty(armed)}
                  title={`Assign all remaining heroic levels to ${armed}`}>Fill empty</button>
              )}
              {heroicAssigned > 0 && (
                <button className={styles.toolBtn} onClick={clearAll}
                  title="Clear all 20 heroic level assignments">Clear all</button>
              )}
              <span className={`${styles.classCountBadge} ${classCountFull ? styles.classCountFull : ''}`}>
                {usedClassNames.length}/3 classes · {heroicAssigned}/20 levels
              </span>
            </div>

            {/* ── Heroic level boxes 1–20 ──────────────────────────────── */}
            <div className={styles.sectionHeader}>
              <span>Heroic <span className={styles.sectionRange}>(Lv 1–20)</span></span>
              <span className={styles.sectionCount}>{heroicAssigned}/20</span>
            </div>
            <div className={styles.boxGrid}>
              {Array.from({ length: HEROIC_LEVELS }, (_, i) => {
                const cls = levelClasses[i] ?? ''
                const colour = cls ? CLASS_COLORS[classIndex(cls, usedClassNames)] : undefined
                return (
                  <div
                    key={i}
                    data-level={i + 1}
                    className={`${styles.levelBox} ${cls ? styles.levelBoxFilled : ''} ${dragOverLevel === i ? styles.levelBoxDragOver : ''}`}
                    style={colour ? { borderColor: colour } : undefined}
                    draggable={!!cls}
                    onDragStart={() => { setDragLevel(i); setDragClass(null) }}
                    onDragOver={e => { e.preventDefault(); setDragOverLevel(i) }}
                    onDragLeave={() => setDragOverLevel(cur => (cur === i ? null : cur))}
                    onDrop={e => { e.preventDefault(); dropOnLevel(i) }}
                    onDragEnd={endDrag}
                    onClick={() => boxClick(i)}
                    title={cls
                      ? `Level ${i + 1}: ${cls} — drag onto another box to swap`
                      : `Level ${i + 1}: empty — drop a class here`}
                  >
                    <span className={styles.boxNum}>{i + 1}</span>
                    {cls ? (
                      <>
                        <DdoIcon category="ClassImages" name={cls} size={22} />
                        <span className={styles.boxShort} style={colour ? { color: colour } : undefined}>
                          {classShortName(cls)}
                        </span>
                      </>
                    ) : (
                      <span className={styles.boxEmpty}>+</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Epic levels 21–30: present automatically ──────────────── */}
            <div className={styles.sectionHeader}>
              <span>Epic <span className={styles.sectionRange}>(Lv 21–30)</span></span>
              <span className={styles.sectionCount}>{epicLevels}/{EPIC_MAX}</span>
            </div>
            <div className={styles.boxGrid}>
              {Array.from({ length: EPIC_MAX }, (_, i) => {
                const on = i < epicLevels
                return (
                  <button
                    type="button"
                    key={i}
                    data-epic={i + 1}
                    className={`${styles.levelBox} ${styles.epicBox} ${on ? styles.levelBoxFilled : styles.levelBoxOff}`}
                    onClick={() => toggleTail(i, epicLevels, setEpic)}
                    title={`Epic level ${i + 1} (character level ${21 + i})${on ? ' — click to drop back to here' : ' — click to take it'}`}
                  >
                    <span className={styles.boxNum}>{21 + i}</span>
                    <span className={styles.boxShort}>{classShortName('Epic')}</span>
                  </button>
                )
              })}
            </div>

            {/* ── Legendary levels 31+: present automatically to the live
                 game cap of 36; 37–40 stay available for imported builds ── */}
            <div className={styles.sectionHeader}>
              <span>Legendary <span className={styles.sectionRange}>(Lv 31–{30 + LEGENDARY_MAX})</span></span>
              <span className={styles.sectionCount}>{legendaryLevels}/{LEGENDARY_MAX}</span>
            </div>
            <div className={styles.boxGrid}>
              {Array.from({ length: LEGENDARY_MAX }, (_, i) => {
                const on = i < legendaryLevels
                const pastCap = i >= LEGENDARY_DEFAULT_LEVELS
                return (
                  <button
                    type="button"
                    key={i}
                    data-legendary={i + 1}
                    className={`${styles.levelBox} ${styles.legendaryBox} ${on ? styles.levelBoxFilled : styles.levelBoxOff} ${pastCap ? styles.levelBoxPastCap : ''}`}
                    onClick={() => toggleTail(i, legendaryLevels, setLegendary)}
                    title={`Legendary level ${i + 1} (character level ${31 + i})${pastCap ? ' — beyond the live game cap of 36' : ''}${on ? ' — click to drop back to here' : ' — click to take it'}`}
                  >
                    <span className={styles.boxNum}>{31 + i}</span>
                    <span className={styles.boxShort}>{classShortName('Legendary')}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
