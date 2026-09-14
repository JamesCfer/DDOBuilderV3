// Overview › Character: who this build is. Name, alignment and race are
// editable in place; the race's ability modifiers and the level split show
// underneath so the tile reads as a character sheet header.

import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useCharacter } from '../../context/CharacterContext'
import { getLevelClasses } from '../../lib/levelProgression'
import styles from './Overview.module.css'

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'True Evil', 'Chaotic Evil',
]

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const

export default function IdentityTile() {
  const { build, dispatch } = useCharacter()
  const { allRaces, loaded } = useStaticBundle()

  const races = allRaces.filter(r => !r.NotHeroic)
  const heroic = races.filter(r => !r.IsIconic)
  const iconic = races.filter(r => r.IsIconic)
  const race = allRaces.find(r => r.Name === build.race)

  const heroicLevels = getLevelClasses(build).filter(Boolean).length
  const epic = build.epicLevels ?? 0
  const legendary = build.legendaryLevels ?? 0
  const total = heroicLevels + epic + legendary
  const mods: Array<[string, number]> = race
    ? ABILITIES.flatMap(ab => {
      const mod = (race as unknown as Record<string, unknown>)[ab]
      return typeof mod === 'number' && mod !== 0 ? [[ab, mod] as [string, number]] : []
    })
    : []

  return (
    <div className="panel">
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.meta}>Level {total}</div>
        <div className={styles.fields}>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label>Name</label>
            <input
              type="text"
              value={build.name}
              onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
              placeholder="Character name"
            />
          </div>
          <div className={styles.field}>
            <label>Race</label>
            <select
              value={build.race}
              onChange={e => dispatch({ type: 'SET_RACE', race: e.target.value })}
              disabled={!loaded && allRaces.length === 0}
            >
              <option value="">— Select —</option>
              <optgroup label="Heroic">
                {heroic.map(r => <option key={r.Name} value={r.Name}>{r.ShortName ?? r.Name}</option>)}
              </optgroup>
              {iconic.length > 0 && (
                <optgroup label="Iconic">
                  {iconic.map(r => <option key={r.Name} value={r.Name}>{r.ShortName ?? r.Name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className={styles.field}>
            <label>Alignment</label>
            <select
              value={build.alignment}
              onChange={e => dispatch({ type: 'SET_ALIGNMENT', alignment: e.target.value })}
            >
              {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.section}>
          <span>Race modifiers</span>
          {race?.IsIconic && <span className={styles.sectionNote}>Iconic</span>}
        </div>
        <div className={styles.chips}>
          {!race && <span className={styles.empty}>Pick a race</span>}
          {race && mods.length === 0 && <span className={styles.empty}>No ability modifiers</span>}
          {mods.map(([ab, mod]) => (
            <span key={ab} className={`${styles.chip} ${mod > 0 ? styles.chipPositive : styles.chipNegative}`}>
              {ab.slice(0, 3).toUpperCase()} {mod > 0 ? '+' : ''}{mod}
            </span>
          ))}
        </div>

        <div className={styles.section}><span>Levels</span></div>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Heroic</span>
            <span className={styles.rowValue}>{heroicLevels} / 20</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Epic</span>
            <span className={styles.rowValue}>{epic} / 10</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Legendary</span>
            <span className={styles.rowValue}>{legendary}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
