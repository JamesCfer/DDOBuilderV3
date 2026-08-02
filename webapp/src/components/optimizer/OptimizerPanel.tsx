// Custom › Optimizer — "take what I have and maximize my chosen stats".
//
// The user ranks (or weights) a list of breakdown stats, picks which build
// domains the search may fill in, and runs BOTH search strategies
// (lib/optimizer/plan): the greedy one, which always takes the best move
// available right now, and the long-term one, which scans the gated items at
// the tops of the accessible trees and branches toward them. Neither
// dominates the other, so both plans are shown with a comparison table and
// the user applies whichever they prefer.
//
// Either way the search only ADDS to the build — unspent action points,
// unspent destiny points, empty feat slots, unassigned class levels, unused
// destiny slots, empty gear / augment / filigree slots — it never revokes or
// swaps a choice the user already made. Results are previewed with per-step
// deltas before being applied.

import { useMemo, useRef, useState } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { findActiveLife } from '../../lib/multiLife'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import { useFavorites } from '../../lib/favoritesStore'
import {
  OPTIMIZER_STATS, statForFavoriteKey,
  type ObjectiveMode, type ObjectiveSpec, type ObjectiveStat,
} from '../../lib/optimizer/objective'
import type { OptimizeProgress } from '../../lib/optimizer/engine'
import type { OptimizeResult } from '../../lib/optimizer/optimizer'
import { planBuild, type PlanResult, type StrategyId } from '../../lib/optimizer/plan'
import type { LongTermResult } from '../../lib/optimizer/longTerm'
import { characterLevel, type MoveDomains } from '../../lib/optimizer/moves'
import {
  shortlistAugments, shortlistCandidates, shortlistFiligrees,
} from '../../lib/optimizer/gearCandidates'
import type { CandidatePools } from '../../lib/optimizer/candidatePools'
import { itemSlotKey } from '../../lib/gearSlots'
import { api } from '../../api'
import type { CharacterBuild, Item } from '../../types/ddo'
import styles from './OptimizerPanel.module.css'

const OBJECTIVE_STORAGE_KEY = 'ddo-optimizer-objective'

const EFFORT_LEVELS = [
  { id: 'quick', label: 'Quick (~2k evaluations)', maxEvals: 2000 },
  { id: 'normal', label: 'Normal (~10k evaluations)', maxEvals: 10000 },
  { id: 'thorough', label: 'Thorough (~40k evaluations)', maxEvals: 40000 },
] as const

interface StoredObjective { mode: ObjectiveMode; stats: ObjectiveStat[] }

function loadStoredObjective(): StoredObjective {
  try {
    const raw = localStorage.getItem(OBJECTIVE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredObjective
      if (parsed && Array.isArray(parsed.stats)) {
        return {
          mode: parsed.mode === 'weighted' ? 'weighted' : 'priority',
          stats: parsed.stats.filter(s => OPTIMIZER_STATS.some(o => o.key === s.key)),
        }
      }
    }
  } catch { /* fall through to default */ }
  return {
    mode: 'priority',
    stats: [{ key: 'melee.power', label: 'Melee Power', weight: 1 }],
  }
}

function storeObjective(o: StoredObjective): void {
  try { localStorage.setItem(OBJECTIVE_STORAGE_KEY, JSON.stringify(o)) } catch { /* ignore */ }
}

const STAT_GROUPS = [...new Set(OPTIMIZER_STATS.map(s => s.group))]

// Slots the gear domain may fill. Cosmetic slots are excluded — they carry no
// stats, so equipping one could never improve an objective.
const OPTIMIZABLE_GEAR_SLOTS = [
  'Helmet', 'Necklace', 'Trinket', 'Armor', 'Cloak', 'Belt', 'Ring', 'Ring2',
  'Gloves', 'Bracers', 'Boots', 'Goggles', 'Main Hand', 'Off Hand', 'Quiver', 'Arrow',
]

/**
 * Fetch and shortlist everything the content domains may choose from.
 *
 * Augments and slot upgrades share one pool: a slot upgrade only ever opens a
 * new augment slot, which is useless without augments to put in it, so the
 * augment catalogue is loaded whenever either domain is on.
 */
async function loadCandidatePools(
  build: CharacterBuild,
  domains: MoveDomains,
  objective: ObjectiveSpec,
  maxLevel: number,
): Promise<CandidatePools> {
  const pools: CandidatePools = {}
  const jobs: Array<Promise<void>> = []

  if (domains.gear) {
    jobs.push(loadEmptySlotItems(build.gear, maxLevel).then(bySlot => {
      pools.gearCandidates = shortlistCandidates(bySlot, objective, { maxLevel })
    }))
  }
  if (domains.augments || domains.slotUpgrades) {
    jobs.push(api.augments().then(all => {
      pools.augmentCandidates = shortlistAugments(all, objective, { maxLevel })
    }).catch(() => { /* leave the pool empty */ }))
  }
  if (domains.filigrees) {
    jobs.push(api.filigree().then(all => {
      pools.filigreeCandidates = shortlistFiligrees(all, objective)
    }).catch(() => { /* leave the pool empty */ }))
  }
  await Promise.all(jobs)
  return pools
}

/** Fetch the equippable catalogue for every gear slot the build has left empty. */
async function loadEmptySlotItems(
  gear: Record<string, string>,
  maxLevel: number,
): Promise<Record<string, Item[]>> {
  const empty = OPTIMIZABLE_GEAR_SLOTS.filter(slot => !gear[slot])
  const lists = await Promise.all(empty.map(slot =>
    api.items({ slot: itemSlotKey(slot), maxLevel })
      .then(items => [slot, items] as [string, Item[]])
      .catch(() => [slot, [] as Item[]] as [string, Item[]]),
  ))
  return Object.fromEntries(lists.filter(([, items]) => items.length > 0))
}

interface PlanSectionProps {
  title: string
  subtitle: string
  plan: OptimizeResult | LongTermResult
  isWinner: boolean
  applied: boolean
  canApply: boolean
  onApply: () => void
  onRevert: () => void
  stoppedLabel: Record<string, string>
}

/** One strategy's plan: why it stopped, what it is aiming at, and its steps. */
function PlanSection({
  title, subtitle, plan, isWinner, applied, canApply, onApply, onRevert, stoppedLabel,
}: PlanSectionProps) {
  const goals = 'goals' in plan ? plan.goals : []
  return (
    <section className={`${styles.planSection} ${isWinner ? styles.planWinner : ''}`}>
      <h3 className={styles.planTitle}>
        {title}
        {isWinner && <span className={styles.planBadge}>best</span>}
        <span className={styles.planEvals}>{plan.evals} evaluations</span>
      </h3>
      <div className={styles.help}>{subtitle}</div>

      {goals.length > 0 && (
        <div className={styles.goals}>
          Working toward:
          <ul>
            {goals.map(g => (
              <li key={g.description}>
                {g.description}
                <span className={styles.stepGains}>
                  +{Math.round(g.gain * 10) / 10} once unlocked
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.help}>{stoppedLabel[plan.stopped]}</div>

      {plan.unchanged ? (
        <div className={styles.help}>
          No open choice improves the objective — the build has no headroom
          left in the selected domains.
        </div>
      ) : (
        <>
          <ol className={styles.steps}>
            {plan.applied.map((a, i) => (
              <li key={i}>
                {a.description}
                {a.gains.length > 0 && (
                  <span className={styles.stepGains}>
                    {a.gains.map(g => `${g.after - g.before > 0 ? '+' : ''}${Math.round((g.after - g.before) * 10) / 10} ${g.label}`).join(', ')}
                  </span>
                )}
                {a.bridge && <span className={styles.stepBridge}>(taken for later payoff)</span>}
              </li>
            ))}
          </ol>
          <div className={styles.actionRow}>
            {applied ? (
              <>
                <span>Applied ✓</span>
                <button type="button" className={styles.iconBtn} onClick={onRevert}>Revert</button>
              </>
            ) : (
              <button
                type="button"
                className={styles.runBtn}
                onClick={onApply}
                disabled={!canApply}
                title={canApply ? undefined : 'Revert the applied plan first'}
              >
                Apply {plan.applied.length} step{plan.applied.length === 1 ? '' : 's'} to build
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export default function OptimizerPanel() {
  const { build, dispatch } = useCharacter()
  const { doc } = useDocument()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const [favorites] = useFavorites()

  const specialFeats = findActiveLife(doc)?.specialFeats
  const statsInput = useMemo(
    () => ({ ...bundle, gearItems, specialFeats }),
    [bundle, gearItems, specialFeats],
  )
  const currentStats = useBuildStats(statsInput)

  const initial = useMemo(loadStoredObjective, [])
  const [mode, setMode] = useState<ObjectiveMode>(initial.mode)
  const [rows, setRows] = useState<ObjectiveStat[]>(initial.stats)
  const [domains, setDomains] = useState<MoveDomains>({
    enhancements: true, destinies: true, feats: true, classLevels: true,
    abilityLevelUps: true, gear: false, augments: false, slotUpgrades: false,
    filigrees: false,
  })
  const charLevel = characterLevel(build)
  // Level the optimizer may build toward. Defaults to the current character
  // level (a fresh, class-less character defaults to heroic cap 20 so
  // "optimize" can level it up and go from there).
  const [targetLevel, setTargetLevel] = useState<number>(() => charLevel < 2 ? 20 : charLevel)
  const [targetBuildId, setTargetBuildId] = useState(build.id)
  if (targetBuildId !== build.id) {
    setTargetBuildId(build.id)
    setTargetLevel(charLevel < 2 ? 20 : charLevel)
  }
  const [effort, setEffort] = useState<(typeof EFFORT_LEVELS)[number]['id']>('normal')
  const [running, setRunning] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [progress, setProgress] = useState<OptimizeProgress | null>(null)
  const [result, setResult] = useState<PlanResult | null>(null)
  const [appliedStrategy, setAppliedStrategy] = useState<StrategyId | null>(null)
  const [appliedSnapshot, setAppliedSnapshot] = useState<CharacterBuild | null>(null)
  const cancelRef = useRef({ cancelled: false })

  function updateRows(next: ObjectiveStat[], nextMode: ObjectiveMode = mode) {
    setRows(next)
    storeObjective({ mode: nextMode, stats: next })
  }

  function updateMode(m: ObjectiveMode) {
    setMode(m)
    storeObjective({ mode: m, stats: rows })
  }

  function addStat(key: string) {
    const def = OPTIMIZER_STATS.find(s => s.key === key)
    if (!def || rows.some(r => r.key === key)) return
    updateRows([...rows, { key: def.key, label: def.label, weight: 1 }])
  }

  function importFavorites() {
    const found: ObjectiveStat[] = []
    for (const fav of favorites) {
      const def = statForFavoriteKey(fav)
      if (def && !rows.some(r => r.key === def.key) && !found.some(r => r.key === def.key)) {
        found.push({ key: def.key, label: def.label, weight: 1 })
      }
    }
    if (found.length > 0) updateRows([...rows, ...found])
  }

  function moveRow(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    updateRows(next)
  }

  async function run() {
    if (rows.length === 0 || running || !bundle.loaded) return
    const objective: ObjectiveSpec = { mode, stats: rows }
    cancelRef.current = { cancelled: false }
    setRunning(true)
    setResult(null)
    setAppliedSnapshot(null)
    setProgress(null)
    try {
      // Content catalogues are fetched per run rather than up front: they are
      // large and most runs do not ask for them.
      let pools: CandidatePools = {}
      if (domains.gear || domains.augments || domains.slotUpgrades || domains.filigrees) {
        setLoadingContent(true)
        try {
          pools = await loadCandidatePools(build, domains, objective, targetLevel)
        } finally {
          setLoadingContent(false)
        }
      }
      const res = await planBuild({
        input: statsInput,
        build,
        objective,
        domains,
        ...pools,
        maxEvals: EFFORT_LEVELS.find(e => e.id === effort)?.maxEvals,
        targetLevel,
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current.cancelled,
      })
      setResult(res)
    } finally {
      setRunning(false)
    }
  }

  function apply(strategy: StrategyId) {
    if (!result) return
    setAppliedSnapshot(build)
    setAppliedStrategy(strategy)
    dispatch({ type: 'LOAD_BUILD', build: result[strategy].build })
  }

  function revert() {
    if (!appliedSnapshot) return
    dispatch({ type: 'LOAD_BUILD', build: appliedSnapshot })
    setAppliedSnapshot(null)
    setAppliedStrategy(null)
  }

  const stoppedLabel: Record<string, string> = {
    converged: 'Search complete — no further improving choice found.',
    evalBudget: 'Stopped at the evaluation budget — a Thorough run may find more.',
    cancelled: 'Cancelled.',
  }

  return (
    <div className={styles.grid}>
      {/* ── Objective + search setup ──────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">Optimizer</div>
        <div className="panel-body">
          <div className={styles.help}>
            Ranks your chosen stats and fills every choice the build has left
            open — class levels up to your target level, unspent enhancement
            AP, unspent destiny points, empty feat slots, unset ability
            level-ups, free destiny slots, and empty gear slots. Choices you
            have already made are never changed.
          </div>

          <div className={styles.modeRow}>
            <label>
              <input type="radio" checked={mode === 'priority'} onChange={() => updateMode('priority')} />
              Ranked priorities
            </label>
            <label>
              <input type="radio" checked={mode === 'weighted'} onChange={() => updateMode('weighted')} />
              Weighted sum
            </label>
          </div>

          <div className={styles.statRows}>
            {rows.map((row, idx) => (
              <div key={row.key} className={styles.statRow}>
                <span className={styles.priorityBadge}>{mode === 'priority' ? `#${idx + 1}` : '•'}</span>
                <select
                  value={row.key}
                  onChange={e => {
                    const def = OPTIMIZER_STATS.find(s => s.key === e.target.value)
                    if (!def || rows.some((r, i) => i !== idx && r.key === def.key)) return
                    const next = [...rows]
                    next[idx] = { ...next[idx], key: def.key, label: def.label }
                    updateRows(next)
                  }}
                >
                  {STAT_GROUPS.map(g => (
                    <optgroup key={g} label={g}>
                      {OPTIMIZER_STATS.filter(s => s.group === g).map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {mode === 'weighted' && (
                  <input
                    type="number"
                    className={styles.weightInput}
                    value={row.weight}
                    min={0}
                    step={0.5}
                    onChange={e => {
                      const next = [...rows]
                      next[idx] = { ...next[idx], weight: Number(e.target.value) || 0 }
                      updateRows(next)
                    }}
                    title="Weight"
                  />
                )}
                <span title={`Current value: ${currentStats.total(row.key)}`}>
                  {currentStats.total(row.key)}
                </span>
                <button type="button" className={styles.iconBtn} disabled={idx === 0} onClick={() => moveRow(idx, -1)} title="Higher priority">↑</button>
                <button type="button" className={styles.iconBtn} disabled={idx === rows.length - 1} onClick={() => moveRow(idx, 1)} title="Lower priority">↓</button>
                <button type="button" className={styles.iconBtn} onClick={() => updateRows(rows.filter((_, i) => i !== idx))} title="Remove">✕</button>
              </div>
            ))}
            {rows.length === 0 && <div className={styles.help}>Add at least one stat to optimize for.</div>}
          </div>

          <div className={styles.addRow}>
            <select value="" onChange={e => { if (e.target.value) addStat(e.target.value) }}>
              <option value="">+ Add stat…</option>
              {STAT_GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {OPTIMIZER_STATS.filter(s => s.group === g && !rows.some(r => r.key === s.key)).map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={importFavorites}
              disabled={favorites.length === 0}
              title="Add every starred breakdown stat that the optimizer can target"
            >
              ☆ Add favorited stats
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.8rem 0' }} />

          <div className={styles.domains}>
            <label>
              <input type="checkbox" checked={domains.enhancements} onChange={e => setDomains({ ...domains, enhancements: e.target.checked })} />
              Enhancements (spend unspent AP)
            </label>
            <label>
              <input type="checkbox" checked={domains.destinies} onChange={e => setDomains({ ...domains, destinies: e.target.checked })} />
              Epic destinies (fill slots, spend destiny points)
            </label>
            <label>
              <input type="checkbox" checked={domains.feats} onChange={e => setDomains({ ...domains, feats: e.target.checked })} />
              Feats (fill empty slots)
            </label>
            <label>
              <input type="checkbox" checked={domains.classLevels} onChange={e => setDomains({ ...domains, classLevels: e.target.checked })} />
              Class levels (pick classes &amp; level up to the target level)
            </label>
            {domains.classLevels && (
              <label style={{ paddingLeft: '1.5rem' }}>
                Level up to
                <input
                  type="number"
                  className={styles.weightInput}
                  min={charLevel}
                  max={40}
                  value={targetLevel}
                  onChange={e => setTargetLevel(Math.max(charLevel, Math.min(40, Number(e.target.value) || charLevel)))}
                  title="The optimizer levels the build toward this character level (heroic classes first, then epic and legendary levels), picking whichever class levels score best"
                />
                <span style={{ opacity: 0.7 }}>(now {charLevel})</span>
              </label>
            )}
            <label>
              <input type="checkbox" checked={domains.abilityLevelUps ?? false} onChange={e => setDomains({ ...domains, abilityLevelUps: e.target.checked })} />
              Ability level-ups (assign unset +1s at levels 4, 8, 12…)
            </label>
            <label>
              <input type="checkbox" checked={domains.gear ?? false} onChange={e => setDomains({ ...domains, gear: e.target.checked })} />
              Gear (equip items into empty slots)
            </label>
            <label>
              <input type="checkbox" checked={domains.augments ?? false} onChange={e => setDomains({ ...domains, augments: e.target.checked })} />
              Augments (fill empty augment slots on equipped items)
            </label>
            <label>
              <input type="checkbox" checked={domains.slotUpgrades ?? false} onChange={e => setDomains({ ...domains, slotUpgrades: e.target.checked })} />
              Gear upgrades (pick a colour for an item's one-time slot upgrade)
            </label>
            <label>
              <input type="checkbox" checked={domains.filigrees ?? false} onChange={e => setDomains({ ...domains, filigrees: e.target.checked })} />
              Filigrees (fill empty weapon &amp; artifact filigree slots)
            </label>
            {(domains.gear || domains.augments || domains.slotUpgrades || domains.filigrees) && (
              <span className={styles.help} style={{ paddingLeft: '1.5rem' }}>
                Only empty slots are filled — gear, augments and filigrees you
                have already chosen are never swapped out. Each slot offers the
                content whose own effects touch your chosen stats, so a run
                costs more evaluations; raise the effort if it stops at the
                budget. A gear upgrade colour is permanent once picked, exactly
                as in V2.
              </span>
            )}
          </div>

          <div className={styles.runRow}>
            <select value={effort} onChange={e => setEffort(e.target.value as typeof effort)} disabled={running}>
              {EFFORT_LEVELS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
            {!running ? (
              <button type="button" className={styles.runBtn} onClick={run} disabled={rows.length === 0 || !bundle.loaded}>
                {bundle.loaded ? 'Optimize' : 'Loading data…'}
              </button>
            ) : (
              <button type="button" className={styles.runBtn} onClick={() => { cancelRef.current.cancelled = true }}>
                Cancel
              </button>
            )}
          </div>

          {(running || progress) && (
            <div className={styles.progress}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(100, ((progress?.evals ?? 0) / (progress?.maxEvals ?? 1)) * 100)}%` }}
                />
              </div>
              {progress && (
                <span>
                  {progress.evals.toLocaleString()} builds evaluated · {progress.applied} step{progress.applied === 1 ? '' : 's'} taken
                  {progress.lastApplied ? ` · last: ${progress.lastApplied}` : ''}
                </span>
              )}
            </div>
          )}

          <div className={styles.note}>
            The search is greedy: it repeatedly takes the single legal choice
            that most improves your top-ranked stat (ties broken by the next
            stat down). The long-term search additionally scans the gated
            items at the tops of your accessible trees, keeps the few that
            would pay off, and steers spending toward them across several
            branches at once — then both plans are shown side by side.
          </div>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">Result</div>
        <div className="panel-body">
          {!result && !running && (
            <div className={styles.help}>
              Run the optimizer to see a step-by-step plan here. Nothing is
              changed until you press Apply.
            </div>
          )}
          {running && (
            <div className={styles.help}>
              {loadingContent
                ? 'Loading the gear / augment / filigree catalogues…'
                : `Searching… (${progress?.strategy === 'longTerm' ? 'long-term plan' : 'greedy plan'})`}
            </div>
          )}
          {result && (
            <>
              <div className={styles.winner}>
                {result.winner === 'tie'
                  ? 'Both plans reach the same result — take the shorter one.'
                  : result.winner === 'greedy'
                    ? 'The greedy plan wins on your objective.'
                    : 'The long-term plan wins on your objective — it pays for something greedy would not reach.'}
              </div>

              <table className={styles.resultTable}>
                <thead>
                  <tr><th>Stat</th><th>Now</th><th>Greedy</th><th>Long-term</th></tr>
                </thead>
                <tbody>
                  {result.comparison.map(row => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{row.before}</td>
                      <td className={row.greedy > row.before ? styles.deltaPos : styles.deltaZero}>
                        {row.greedy}
                      </td>
                      <td className={row.longTerm > row.before ? styles.deltaPos : styles.deltaZero}>
                        {row.longTerm}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <PlanSection
                title="Greedy plan"
                subtitle="Always takes the single best move available right now."
                plan={result.greedy}
                isWinner={result.winner === 'greedy'}
                applied={appliedStrategy === 'greedy'}
                canApply={appliedStrategy === null}
                onApply={() => apply('greedy')}
                onRevert={revert}
                stoppedLabel={stoppedLabel}
              />

              <PlanSection
                title="Long-term plan"
                subtitle="Branches, and spends toward gated items at the tops of trees."
                plan={result.longTerm}
                isWinner={result.winner === 'longTerm'}
                applied={appliedStrategy === 'longTerm'}
                canApply={appliedStrategy === null}
                onApply={() => apply('longTerm')}
                onRevert={revert}
                stoppedLabel={stoppedLabel}
              />

              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => { setResult(null); setAppliedSnapshot(null); setAppliedStrategy(null) }}
                >
                  Discard both
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
