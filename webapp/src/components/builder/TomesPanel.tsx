import { useCharacter } from '../../context/CharacterContext'
import type { Ability } from '../../types/ddo'
import { SKILL_NAMES } from '../../lib/gamedata'
import CollapsibleCard from '../common/CollapsibleCard'
import styles from './TomesPanel.module.css'

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

interface Props {
  /**
   * Render as a folded card with a state summary in the header instead of an
   * always-open panel — used to host the editor on the Character Overview.
   */
  collapsible?: boolean
}

export default function TomesPanel({ collapsible = false }: Props = {}) {
  const { build } = useCharacter()

  if (collapsible) {
    return (
      <CollapsibleCard title="Tomes" summary={tomeSummary(build.abilityTomes, build.skillTomes)}>
        <TomesBody />
      </CollapsibleCard>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">Tomes</div>
      <div className="panel-body">
        <TomesBody />
      </div>
    </div>
  )
}

/** "6 ability · 3 skill" / "none set" — the overview card's header line. */
function tomeSummary(
  abilityTomes: Record<string, number>,
  skillTomes: Record<string, number>,
): string {
  const abilities = ABILITIES.filter(ab => (abilityTomes[ab] ?? 0) > 0).length
  const skills = SKILL_NAMES.filter(sk => (skillTomes[sk] ?? 0) > 0).length
  if (abilities === 0 && skills === 0) return 'none set'
  const parts: string[] = []
  if (abilities > 0) parts.push(`${abilities} ability`)
  if (skills > 0) parts.push(`${skills} skill`)
  return parts.join(' · ')
}

function TomesBody() {
  const { build, dispatch } = useCharacter()
  const { abilityTomes, skillTomes } = build

  return (
    <>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            Ability Tomes
            <button
              className={styles.quickBtn}
              onClick={() => {
                for (const ab of ABILITIES) {
                  dispatch({ type: 'SET_ABILITY_TOME', ability: ab, bonus: 8 })
                }
              }}
              title="Set every ability tome to +8 (Supreme Tome of Ability)"
            >
              Supreme +8 all
            </button>
          </h3>
          <div className={styles.abilityGrid}>
            {ABILITIES.map(ab => (
              <div key={ab} className={styles.abilityRow}>
                <span className={styles.abilityLabel}>{ab}</span>
                <select
                  className={styles.select}
                  value={abilityTomes[ab] ?? 0}
                  onChange={e => {
                    const bonus = Number(e.target.value)
                    dispatch({ type: 'SET_ABILITY_TOME', ability: ab, bonus })
                  }}
                >
                  <option value={0}>None</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <option key={n} value={n}>+{n}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Skill Tomes</h3>
          <div className={styles.skillGrid}>
            {SKILL_NAMES.map(skill => (
              <div key={skill} className={styles.skillRow}>
                <span className={styles.skillLabel}>{skill}</span>
                <select
                  className={styles.select}
                  value={skillTomes[skill] ?? 0}
                  onChange={e => {
                    const bonus = Number(e.target.value)
                    dispatch({ type: 'SET_SKILL_TOME', skill, bonus })
                  }}
                >
                  <option value={0}>None</option>
                  {/* V2 parity: skill tomes are capped at +7 in client storage. */}
                  {[1, 2, 3, 4, 5, 6, 7].map(n => (
                    <option key={n} value={n}>+{n}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
    </>
  )
}
