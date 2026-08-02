// Run both search strategies over the same build and compare them.
//
// Greedy and long-term answer different questions. Greedy asks "what is the
// best thing to do next, repeatedly" and is cheap and often right. Long-term
// asks "what am I building toward" and will spend without immediate return to
// get there. Which one wins depends on the build and the objective, and it is
// not predictable up front — so both run and the user picks.
//
// The two searches are given the SAME candidate pools, the same objective and
// an equal share of the evaluation budget, so the comparison is honest. They
// also share one engine implementation (engine.ts), so a build scores
// identically under either.

import {
  compareScores, type ObjectiveSpec, type ScoreVector,
} from './objective'
import { optimizeBuild, type OptimizeResult } from './optimizer'
import { optimizeBuildLongTerm, type LongTermResult } from './longTerm'
import type { OptimizeProgress, SearchOptions } from './engine'

export type StrategyId = 'greedy' | 'longTerm'

export interface PlanOptions extends SearchOptions {
  /** Fraction of the evaluation budget given to greedy. Default 0.4. */
  greedyBudgetShare?: number
}

export interface PlanComparisonRow {
  key: string
  label: string
  before: number
  greedy: number
  longTerm: number
}

export interface PlanResult {
  greedy: OptimizeResult
  longTerm: LongTermResult
  /** Which plan scored better on the objective ('tie' when identical). */
  winner: StrategyId | 'tie'
  /** Per-objective-stat before / greedy / long-term totals. */
  comparison: PlanComparisonRow[]
}

const vecOf = (r: OptimizeResult): ScoreVector => r.before.map(s => s.after)

/**
 * Greedy gets the smaller share by default: it converges early and hands back
 * whatever it has not spent, whereas the long-term search can always use more
 * depth. Anything greedy leaves unused is rolled into the long-term run.
 */
export async function planBuild(opts: PlanOptions): Promise<PlanResult> {
  const total = opts.maxEvals ?? 20000
  const greedyBudget = Math.max(50, Math.floor(total * (opts.greedyBudgetShare ?? 0.4)))

  const forward = (strategy: StrategyId) =>
    opts.onProgress
      ? (p: OptimizeProgress) => opts.onProgress!({ ...p, strategy })
      : undefined

  const greedy = await optimizeBuild({
    ...opts, maxEvals: greedyBudget, onProgress: forward('greedy'),
  })

  const longTerm = await optimizeBuildLongTerm({
    ...opts,
    maxEvals: Math.max(50, total - greedy.evals),
    onProgress: forward('longTerm'),
  })

  const objective: ObjectiveSpec = opts.objective
  const cmp = compareScores(objective, vecOf(longTerm), vecOf(greedy))
  const winner: PlanResult['winner'] = cmp > 0 ? 'longTerm' : cmp < 0 ? 'greedy' : 'tie'

  return {
    greedy,
    longTerm,
    winner,
    comparison: objective.stats.map((s, i) => ({
      key: s.key,
      label: s.label,
      before: greedy.before[i]?.before ?? 0,
      greedy: greedy.before[i]?.after ?? 0,
      longTerm: longTerm.before[i]?.after ?? 0,
    })),
  }
}
