// Shared search primitives for the build optimizer's two strategies.
//
// Both the greedy search (optimizer.ts) and the long-term multi-branch search
// (longTerm.ts) need the same four things: turn a candidate build into a stat
// input, score it, build a MoveContext from it, and account for the
// evaluation budget while keeping the UI responsive. They live here so the
// two strategies cannot drift apart on any of it — a difference in how a
// candidate is evaluated would make their results incomparable, which is the
// whole point of running them side by side.

import type { CharacterBuild, Item } from '../../types/ddo'
import { computeBuildStats, type BuildStatsInput } from '../buildStats'
import { scoreVector, type ObjectiveSpec, type ScoreVector } from './objective'
import { characterLevel, type MoveContext, type MoveDomains } from './moves'
import type { CandidatePools } from './candidatePools'

export interface OptimizeProgress {
  evals: number
  maxEvals: number
  applied: number
  /** Description of the most recently applied move, if any. */
  lastApplied?: string
  /** Which strategy produced this tick, when both are running. */
  strategy?: 'greedy' | 'longTerm'
}

export type StopReason = 'converged' | 'evalBudget' | 'cancelled'

/** Options every search strategy accepts. */
export interface SearchOptions extends CandidatePools {
  input: BuildStatsInput
  build: CharacterBuild
  objective: ObjectiveSpec
  domains: MoveDomains
  /** Hard cap on stat-engine evaluations. Default 20000. */
  maxEvals?: number
  /**
   * Character level to level the build toward when the class-levels domain
   * is enabled (heroic classes first, then epic, then legendary levels).
   * Defaults to the build's current character level — no leveling.
   */
  targetLevel?: number
  onProgress?: (p: OptimizeProgress) => void
  shouldCancel?: () => boolean
}

export type Stats = ReturnType<typeof computeBuildStats>

export interface Evaluation {
  stats: Stats
  vec: ScoreVector
}

const YIELD_EVERY = 4

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

export interface Engine {
  /** Stat input for a candidate build (gear moves change what is equipped). */
  inputFor(build: CharacterBuild): BuildStatsInput
  /** Evaluate a candidate, charging one unit of the budget and yielding periodically. */
  evaluate(build: CharacterBuild): Promise<Evaluation>
  /** Evaluate without yielding — for the initial build, before the loop starts. */
  evaluateSync(build: CharacterBuild): Evaluation
  ctxFor(build: CharacterBuild, stats: Stats): MoveContext
  evals(): number
  outOfBudget(): boolean
  cancelled(): boolean
  report(applied: number, lastApplied?: string): void
}

export function createEngine(opts: SearchOptions, strategy?: 'greedy' | 'longTerm'): Engine {
  const { input, objective, domains } = opts
  const maxEvals = opts.maxEvals ?? 20000

  // Gear moves change which items are equipped, so the stat input's
  // `gearItems` has to follow the candidate build rather than staying pinned
  // to the user's current equipment.
  const itemByName = new Map<string, Item>()
  for (const list of Object.values(opts.gearCandidates ?? {})) {
    for (const it of list) itemByName.set(it.Name, it)
  }

  let evals = 0

  function inputFor(build: CharacterBuild): BuildStatsInput {
    if (!domains.gear) return input
    const base = input.gearItems ?? {}
    let gearItems = base
    for (const [slot, name] of Object.entries(build.gear ?? {})) {
      if (!name || base[slot]?.Name === name) continue
      const item = itemByName.get(name)
      if (!item) continue
      if (gearItems === base) gearItems = { ...base }
      gearItems[slot] = item
    }
    return gearItems === base ? input : { ...input, gearItems }
  }

  function evaluateSync(build: CharacterBuild): Evaluation {
    const stats = computeBuildStats(inputFor(build), build)
    return { stats, vec: scoreVector(objective, k => stats.total(k)) }
  }

  const engine: Engine = {
    inputFor,
    evaluateSync,
    async evaluate(build) {
      const result = evaluateSync(build)
      evals++
      if (evals % YIELD_EVERY === 0) {
        opts.onProgress?.({ evals, maxEvals, applied: 0, strategy })
        await tick()
      }
      return result
    },
    ctxFor(build, stats) {
      return {
        build,
        allClasses: input.allClasses,
        allRaces: input.allRaces,
        allFeats: input.allFeats,
        allTrees: input.allTrees,
        specialFeats: input.specialFeats,
        fatePoints: Math.max(0, Math.round(stats.total('fatePoint'))),
        destinyApBonus: Math.max(0, Math.round(stats.total('destinyAP'))),
        targetLevel: Math.max(opts.targetLevel ?? 0, characterLevel(build)),
        gearCandidates: opts.gearCandidates,
        // Augment and slot-upgrade legality reads the items actually equipped
        // on the CANDIDATE, so a freshly equipped item's augment slots become
        // available on the next round.
        gearItems: inputFor(build).gearItems,
        augmentCandidates: opts.augmentCandidates,
        filigreeCandidates: opts.filigreeCandidates,
      }
    },
    evals: () => evals,
    outOfBudget: () => evals >= maxEvals,
    cancelled: () => opts.shouldCancel?.() === true,
    report(applied, lastApplied) {
      opts.onProgress?.({ evals, maxEvals, applied, lastApplied, strategy })
    },
  }
  return engine
}
