// Overview › Classes: the three class slots with level steppers, plus epic
// and legendary levels. Enough to set a split at a glance; the Level Plan tab
// keeps the per-level drag-and-drop editor for arranging the order.

import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useCharacter } from '../../context/CharacterContext'
import DdoIcon from '../DdoIcon'
import { getLevelClasses } from '../../lib/levelProgression'
import { EPIC_MAX_LEVELS, HEROIC_MAX_LEVEL, LEGENDARY_MAX_LEVELS } from '../../lib/gamedata'
import styles from './Overview.module.css'

const CLASS_COLORS = ['#c88a2a', '#6ab0de', '#8acd6a']

function Stepper({ value, min, max, onChange, label }: {
  value: number; min: number; max: number; onChange: (v: number) => void; label: string
}) {
  return (
    <span className={styles.stepper} aria-label={label}>
      <button type="button" className={styles.stepBtn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`${label} down`}>−</button>
      <span className={styles.stepValue}>{value}</span>
      <button type="button" className={styles.stepBtn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`${label} up`}>+</button>
    </span>
  )
}

export default function ClassesTile() {
  const { build, dispatch } = useCharacter()
  const { allClasses } = useStaticBundle()
  const classes = allClasses.filter(c => !c.NotHeroic && c.Name !== 'Unknown')

  const levelClasses = getLevelClasses(build)
  const heroicTotal = levelClasses.filter(Boolean).length
  const heroicRoom = HEROIC_MAX_LEVEL - heroicTotal
  const epic = build.epicLevels ?? 0
  const legendary = build.legendaryLevels ?? 0

  return (
    <div className="panel">
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.meta}>{heroicTotal} / {HEROIC_MAX_LEVEL} heroic</div>
        <div className={styles.rows}>
          {([0, 1, 2] as const).map(i => {
            const slot = build.classes[i]
            const taken = new Set(build.classes.filter((_, j) => j !== i).map(c => c.name).filter(Boolean))
            return (
              <div key={i} className={styles.classRow}>
                <span className={styles.iconBox} style={{ borderColor: slot.name ? CLASS_COLORS[i] : undefined }}>
                  {slot.name && <DdoIcon category="ClassImages" name={slot.name} size={20} />}
                </span>
                <select
                  value={slot.name}
                  onChange={e => dispatch({ type: 'SET_CLASS', index: i, name: e.target.value })}
                  aria-label={`Class ${i + 1}`}
                >
                  <option value="">— {i === 0 ? 'Class' : 'Multiclass'} —</option>
                  {classes.map(c => (
                    <option key={c.Name} value={c.Name} disabled={taken.has(c.Name)}>{c.Name}</option>
                  ))}
                </select>
                <Stepper
                  label={`${slot.name || `Class ${i + 1}`} levels`}
                  value={slot.levels}
                  min={0}
                  max={slot.name ? slot.levels + heroicRoom : 0}
                  onChange={v => dispatch({ type: 'SET_CLASS_LEVELS', index: i, levels: v })}
                />
              </div>
            )
          })}
        </div>

        {/* One segment per heroic level, coloured by class, so the split
            reads at a glance. */}
        <div className={styles.levelBar} aria-hidden="true">
          {Array.from({ length: HEROIC_MAX_LEVEL }, (_, lv) => {
            const name = levelClasses[lv] ?? ''
            const idx = build.classes.findIndex(c => c.name === name)
            return (
              <span
                key={lv}
                className={styles.levelSeg}
                style={{ width: `${100 / HEROIC_MAX_LEVEL}%`, background: name && idx >= 0 ? CLASS_COLORS[idx] : 'var(--color-bg-secondary)' }}
              />
            )
          })}
        </div>
        <div className={styles.levelLegend}>
          {build.classes.map((c, i) => c.name ? (
            <span key={i}><span className={styles.swatch} style={{ background: CLASS_COLORS[i] }} />{c.name} {c.levels}</span>
          ) : null)}
          {heroicTotal === 0 && <span className={styles.empty}>No class levels yet</span>}
        </div>

        <div className={styles.section}><span>Beyond 20</span></div>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Epic levels</span>
            <Stepper label="Epic levels" value={epic} min={0} max={EPIC_MAX_LEVELS}
              onChange={v => dispatch({ type: 'SET_EPIC_LEVELS', levels: v })} />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Legendary levels</span>
            <Stepper label="Legendary levels" value={legendary} min={0} max={LEGENDARY_MAX_LEVELS}
              onChange={v => dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: v })} />
          </div>
        </div>
        <span className={styles.footnote}>Arrange which level takes which class on the Level Plan tab.</span>
      </div>
    </div>
  )
}
