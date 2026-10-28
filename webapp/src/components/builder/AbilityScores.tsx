import { useState, useEffect } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import type { Ability, Race } from '../../types/ddo'
import { POINT_BUY_COSTS, totalPointsSpent, pointBuyCost, pastLifeCount } from '../../types/ddo'
import { tomeCapAtLevel } from '../../lib/levelProgression'
import { api } from '../../api'
import styles from './AbilityScores.module.css'

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
const ABBREV: Record<Ability, string> = {
  Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
  Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
}
const MIN_SCORE = 8
const MAX_SCORE = 18

function parseBuildPoints(raw: unknown): number[] {
  if (raw == null) return [28, 32, 34, 36]
  if (typeof raw === 'number') return [raw]
  if (typeof raw === 'string') return raw.split(' ').map(Number)
  if (typeof raw === 'object' && '#text' in (raw as object)) {
    const text = (raw as Record<string, unknown>)['#text']
    return typeof text === 'string' ? text.split(' ').map(Number) : [32]
  }
  return [28, 32, 34, 36]
}

const TIER_NAMES = ['Adventurer', 'Champion', 'Hero', 'Legend']

/**
 * V2 Build::DetermineBuildPoints. With no past lives the player chooses tier
 * [0] or [1] (the Champion flag). One past life gives tier [2], two or more
 * give tier [3]. Returns the tier index in use.
 */
export function buildPointTier(totalPastLives: number, champion: boolean): number {
  if (totalPastLives === 0) return champion ? 1 : 0
  return totalPastLives === 1 ? 2 : 3
}

export default function AbilityScores() {
  const { build, dispatch } = useCharacter()
  const { baseAbilities } = build
  const [races, setRaces] = useState<Race[]>([])

  useEffect(() => {
    api.races().then(setRaces).catch(() => setRaces([]))
  }, [])

  const race = races.find(r => r.Name === build.race)
  const points = race ? parseBuildPoints(race.BuildPoints) : [28, 32, 34, 36]
  // Counts heroic + racial past lives, not just the current race.
  const totalPLs = pastLifeCount(build.pastLives)
  const budgetIdx = Math.min(buildPointTier(totalPLs, !!build.championBuildPoints), points.length - 1)
  const POINT_BUY_BUDGET = points[budgetIdx] ?? 32

  const spent = totalPointsSpent(baseAbilities)
  const remaining = POINT_BUY_BUDGET - spent

  function adjust(ability: Ability, delta: 1 | -1) {
    const current = baseAbilities[ability]
    const next = current + delta
    if (next < MIN_SCORE || next > MAX_SCORE) return
    const cost = pointBuyCost(next) - pointBuyCost(current)
    if (cost > remaining) return
    dispatch({ type: 'SET_ABILITY', ability, score: next })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Ability Scores
        <span className={styles.pointsRemaining} data-over={remaining < 0}>
          {remaining} / {POINT_BUY_BUDGET} pts
        </span>
      </div>
      <div className="panel-body">
        <div className={styles.buildPoints} role="radiogroup" aria-label="Build points">
          <span className={styles.buildPointsLabel}>Build points</span>
          {points.slice(0, 4).map((pts, idx) => {
            // V2 DDOBuilderView::UpdateRadioPoints: tiers [0]/[1] are a free
            // choice with no past lives; [2]/[3] only follow past lives.
            const selectable = totalPLs === 0 && idx <= 1
            const why = idx <= 1
              ? (selectable ? `${TIER_NAMES[idx]}: ${pts} points` : `Past lives set the build points (${totalPLs} past life${totalPLs === 1 ? '' : 's'})`)
              : `${TIER_NAMES[idx]}: needs ${idx === 2 ? '1 past life' : '2 or more past lives'} (Past Lives window)`
            return (
              <button
                key={idx}
                type="button"
                role="radio"
                aria-checked={idx === budgetIdx}
                className={styles.buildPointsOption}
                data-active={idx === budgetIdx}
                disabled={!selectable}
                title={why}
                onClick={() => dispatch({ type: 'SET_CHAMPION_BUILD_POINTS', champion: idx === 1 })}
              >{pts}</button>
            )
          })}
        </div>
        <div className={styles.buildPointsHint}>
          {points.length < 4 ? null : totalPLs === 0
            ? `Pick ${points[0]} or ${points[1]}. ${points[2]} and ${points[3]} unlock with 1 and 2+ past lives.`
            : `${points[budgetIdx]} points from ${totalPLs} past life${totalPLs === 1 ? '' : 's'}.`}
        </div>
        <div className={styles.grid}>
          {ABILITIES.map(ab => {
            const score = baseAbilities[ab]
            const lvlUp = Object.values(build.abilityLevelUps).filter(a => a === ab).length
            const rawTome = build.abilityTomes[ab] ?? 0
            // V2 Life::TomeAtLevel — cap is shared across the codebase via levelProgression
            const totalCharLevel = build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
            const tomeMod = Math.min(rawTome, tomeCapAtLevel(Math.max(1, totalCharLevel)))
            // Racial ability modifier straight off the race file (Human 0,
            // Dwarf +2 CON / -2 CHA, …). Shown as its own chip so the total
            // is traceable: base + race + level-ups + tome.
            const raceMod = race?.[ab] ?? 0
            const total = score + raceMod + lvlUp + tomeMod
            const mod = Math.floor((total - 10) / 2)
            const canIncrease = score < MAX_SCORE && pointBuyCost(score + 1) - pointBuyCost(score) <= remaining
            const canDecrease = score > MIN_SCORE
            return (
              <div key={ab} className={styles.row}>
                <span className={styles.abbrev}>{ABBREV[ab]}</span>
                <button onClick={() => adjust(ab, -1)} disabled={!canDecrease}>−</button>
                <span className={styles.score}>{score}</span>
                <button onClick={() => adjust(ab, 1)} disabled={!canIncrease}>+</button>
                <span className={mod >= 0 ? styles.modPos : styles.modNeg}>
                  {mod >= 0 ? '+' : ''}{mod}
                </span>
                <span className={styles.cost}>{pointBuyCost(score)} pts</span>
                {raceMod !== 0 && (
                  <span
                    className={raceMod > 0 ? styles.racePos : styles.raceNeg}
                    title={`${build.race} racial ${ab} modifier`}
                  >{raceMod > 0 ? '+' : ''}{raceMod}R</span>
                )}
                {lvlUp > 0 && (
                  <span className={styles.levelUp} title={`${lvlUp} level-up point${lvlUp === 1 ? '' : 's'} spent on ${ab}`}>+{lvlUp}L</span>
                )}
                {tomeMod > 0 && (
                  <span className={styles.tome} title="Tome bonus">+{tomeMod}T</span>
                )}
                {total !== score && (
                  <span
                    className={styles.total}
                    title={`Total ${ab}: ${score} base${raceMod !== 0 ? ` ${raceMod > 0 ? '+' : '−'} ${Math.abs(raceMod)} race` : ''}${lvlUp > 0 ? ` + ${lvlUp} level-ups` : ''}${tomeMod > 0 ? ` + ${tomeMod} tome` : ''} = ${total}`}
                  >=&nbsp;{total}</span>
                )}
              </div>
            )
          })}
        </div>
        <div className={styles.legend}>
          {Object.entries(POINT_BUY_COSTS).map(([score, cost]) => (
            <span key={score} className={styles.legendEntry}>
              {score}={cost}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
