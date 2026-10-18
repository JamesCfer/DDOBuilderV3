import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Ability, CharacterBuild, Feat } from '../../types/ddo'
import { specialFeatTrainedCount } from '../../lib/specialFeats'
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
      <CollapsibleCard title="Tomes" summary={tomeSummary(build.abilityTomes, build.skillTomes, build)}>
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
  build?: Pick<CharacterBuild, 'pastLives' | 'pastLifeTypes'>,
): string {
  const abilities = ABILITIES.filter(ab => (abilityTomes[ab] ?? 0) > 0).length
  const skills = SKILL_NAMES.filter(sk => (skillTomes[sk] ?? 0) > 0).length
  const special = build ? specialTomeCount(build) : 0
  if (abilities === 0 && skills === 0 && special === 0) return 'none set'
  const parts: string[] = []
  if (abilities > 0) parts.push(`${abilities} ability`)
  if (skills > 0) parts.push(`${skills} skill`)
  if (special > 0) parts.push(`${special} other`)
  return parts.join(' · ')
}

/** Special-feat tomes (Chrisms, Tome of Destiny) with at least one copy. */
function specialTomeCount(build: Pick<CharacterBuild, 'pastLives' | 'pastLifeTypes'>): number {
  return Object.entries(build.pastLives ?? {}).filter(([name, n]) =>
    n > 0 && (build.pastLifeTypes?.[name] === 'Special' || /^(Inherent |Tome of )/.test(name)),
  ).length
}

/** Action point and destiny tomes first: those are the ones players hunt for. */
function tomeRank(name: string): number {
  if (/Action Point/.test(name)) return 0
  if (/Destiny|Fate Point/.test(name)) return 1
  return 2
}

/** "Chrism Of Racial Knowledge" from "Chrism Of Racial Knowledge - Entwined …". */
function tomeItemName(feat: Feat): string {
  const desc = typeof feat.Description === 'string' ? feat.Description : ''
  const m = /^([^\n]{3,60}?)\s+-\s/.exec(desc)
  return m ? m[1] : ''
}

function TomesBody() {
  const { build, dispatch } = useCharacter()
  const { abilityTomes, skillTomes } = build
  // V2 "Special" feats (SpecialFeatsPane): Chrisms of Racial / Universal
  // Knowledge (bonus racial and universal AP), Tome of Destiny, Chrism of
  // Future Fate and the other inherent bonuses. The same counts are editable
  // under Past Lives › Special Feats; they are listed here too because these
  // are tomes in game and this is where players look for them.
  const [specialTomes, setSpecialTomes] = useState<Feat[]>([])
  useEffect(() => {
    let live = true
    api.feats({ acquire: 'Special' })
      .then(f => { if (live) setSpecialTomes([...f].sort((a, b) => tomeRank(a.Name) - tomeRank(b.Name))) })
      .catch(() => { if (live) setSpecialTomes([]) })
    return () => { live = false }
  }, [])

  function setSpecialCount(name: string, target: number) {
    const current = specialFeatTrainedCount(build, name)
    for (let i = current; i < target; i++) dispatch({ type: 'TRAIN_SPECIAL_FEAT', featName: name })
    for (let i = current; i > target; i--) dispatch({ type: 'REVOKE_SPECIAL_FEAT', featName: name })
  }

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

        {specialTomes.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Action Point, Destiny &amp; Chrism Tomes</h3>
            <div className={styles.skillGrid}>
              {specialTomes.map(feat => {
                const max = feat.MaxTimesAcquire ?? 1
                const count = specialFeatTrainedCount(build, feat.Name)
                const item = tomeItemName(feat)
                return (
                  <div key={feat.Name} className={styles.skillRow} title={typeof feat.Description === 'string' ? feat.Description : undefined}>
                    <span className={styles.skillLabel}>
                      {feat.Name}
                      {item && <span className={styles.tomeItem}>{item}</span>}
                    </span>
                    <select
                      className={styles.select}
                      aria-label={feat.Name}
                      value={Math.min(count, max)}
                      onChange={e => setSpecialCount(feat.Name, Number(e.target.value))}
                    >
                      {Array.from({ length: max + 1 }, (_, n) => (
                        <option key={n} value={n}>{n === 0 ? 'None' : `×${n}`}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </section>
        )}
    </>
  )
}
