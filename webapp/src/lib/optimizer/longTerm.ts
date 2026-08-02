// Long-term, multi-branch build search (Custom › Optimizer, "Long-term" plan).
//
// The greedy search in optimizer.ts always takes the single best move
// available right now. That is the right answer surprisingly often and it is
// cheap, but it cannot pay a price today for a payoff later: the AP that buys
// a tier-1 filler is AP not spent toward the tier-5 capstone that would have
// been worth far more, and greedy will never see the capstone because every
// step toward it scores zero or negative.
//
// This search fixes both halves of that:
//
//  - GOALS FIRST. Before searching, it enumerates the gated items at the tops
//    of every accessible tree (`gatedTreeTargets` — MinSpent-locked items,
//    including tier-5s and capstones), evaluates each one hypothetically with
//    its gate waived, and keeps the few that would genuinely move the
//    objective. Those become the plan's long-term goals, and moves in their
//    trees are promoted for the rest of the run even when their own immediate
//    gain is zero. That is what "spend toward the capstone" looks like as a
//    search rule.
//
//  - MULTI-BRANCH. Instead of one build, it carries a beam of the best few
//    partial builds and expands each one. Branches are allowed to go
//    temporarily flat — a branch is judged by where it ENDS UP, not by
//    whether every step improved — so a line that spends four filler ranks to
//    unlock something large survives long enough to prove itself. The best
//    state ever seen is what gets returned, so a branch that wanders off is
//    never worse than not having explored it.
//
// It costs more evaluations than greedy for the same build, which is why the
// two run side by side (plan.ts) and the user sees both.

import type { CharacterBuild } from '../../types/ddo'
import {
  compareScores, scalarGain,
  type ScoreVector,
} from './objective'
import {
  applyMove, describeMove, gatedTreeTargets, generateMoves, moveId,
  type Move,
} from './moves'
import { treeSpent } from '../fuzz/randomBuild'
import { createEngine, type Evaluation, type SearchOptions, type StopReason } from './engine'
import type { AppliedMoveRecord, OptimizeResult, StatDelta } from './optimizer'

export interface LongTermOptions extends SearchOptions {
  /** Partial builds carried forward each round. Default 3. */
  beamWidth?: number
  /** Moves expanded per state per round. Default 6. */
  expandPerState?: number
  /** Long-term goals kept from the gated-target scan. Default 3. */
  goalCount?: number
  /** Gated targets evaluated during the goal scan. Default 80. */
  goalScanLimit?: number
  /** Rounds without a new global best before giving up. Default 20. */
  patience?: number
  /**
   * Moves expanded in the FIRST round, before any gain is known. Default 250.
   * See the seeding note in the search loop.
   */
  seedScanLimit?: number
}

/** A long-term target the plan is working toward. */
export interface PlanGoal {
  /** Human-readable target, e.g. the capstone's name and tree. */
  description: string
  tree: string
  /** Objective gain the target would deliver once unlocked. */
  gain: number
}

export interface LongTermResult extends OptimizeResult {
  /** Gated targets the search steered toward (may be empty). */
  goals: PlanGoal[]
  /** Branches explored — 1 means it degenerated to a single line. */
  branches: number
}

interface BeamState {
  build: CharacterBuild
  stats: Evaluation['stats']
  vec: ScoreVector
  applied: AppliedMoveRecord[]
  /** Sorted move ids — two orderings of the same choices are one state. */
  signature: string
  /** Points already sunk into the goals' trees — the tie-break that keeps
   *  a flat branch moving toward its unlock instead of wandering. */
  goalProgress: number
}

/** Reorder so consecutive entries come from different trees where possible. */
function interleaveByTree(moves: Move[]): Move[] {
  const byTree = new Map<string, Move[]>()
  for (const move of moves) {
    const tree = treeOf(move) ?? ''
    if (!byTree.has(tree)) byTree.set(tree, [])
    byTree.get(tree)!.push(move)
  }
  const queues = [...byTree.values()]
  const out: Move[] = []
  for (let i = 0; out.length < moves.length; i++) {
    let progressed = false
    for (const queue of queues) {
      if (i < queue.length) { out.push(queue[i]); progressed = true }
    }
    if (!progressed) break
  }
  return out
}

function treeOf(move: Move): string | null {
  switch (move.kind) {
    case 'enhancement':
    case 'destiny':
      return move.tree
    case 'destinyTree':
      return move.tree
    default:
      return null
  }
}

export async function optimizeBuildLongTerm(opts: LongTermOptions): Promise<LongTermResult> {
  const { objective, domains } = opts
  const engine = createEngine(opts, 'longTerm')
  const beamWidth = opts.beamWidth ?? 3
  const expandPerState = opts.expandPerState ?? 6
  const goalCount = opts.goalCount ?? 3
  const goalScanLimit = opts.goalScanLimit ?? 80
  // Flat rounds are the normal state of affairs here — the search is
  // deliberately spending toward an unlock — so patience has to outlast the
  // gap to a gate. Too small and it gives up one rank short of the payoff.
  // A tier-5 gate can sit 20+ points away, and every step of that climb is
  // flat. Patience has to outlast the climb or the search abandons it one
  // rank short — the exact failure it exists to avoid.
  const patience = opts.patience ?? 20
  const seedScanLimit = opts.seedScanLimit ?? 250

  const start = engine.evaluateSync(opts.build)
  const startTotals: StatDelta[] = objective.stats.map((s, i) => ({
    key: s.key, label: s.label, before: start.vec[i], after: start.vec[i],
  }))

  let stopped: StopReason = 'converged'
  const lastGain = new Map<string, number>()

  const initial: BeamState = {
    build: opts.build, stats: start.stats, vec: start.vec, applied: [],
    signature: '', goalProgress: 0,
  }
  let best = initial
  let branches = 1

  const report = () =>
    engine.report(best.applied.length, best.applied[best.applied.length - 1]?.description)

  // ── Goal scan: what is worth working toward? ────────────────────────────
  // Each gated target is evaluated once with its MinSpent waived. The ones
  // that would improve the objective become goals; their trees are where the
  // search is willing to spend without immediate return.
  const goals: PlanGoal[] = []
  const goalTrees = new Set<string>()
  {
    const ctx = engine.ctxFor(initial.build, initial.stats)
    // Round-robin across trees before truncating. Taking the first N targets
    // in generation order means scanning whichever trees the generator emits
    // first and never seeing the rest — the search would then "plan" toward a
    // small target in an early tree while a far better one three trees later
    // went unexamined.
    const targets = interleaveByTree(gatedTreeTargets(ctx, domains)).slice(0, goalScanLimit)
    const scored: PlanGoal[] = []
    for (const target of targets) {
      if (engine.outOfBudget() || engine.cancelled()) break
      const ev = await engine.evaluate(applyMove(initial.build, target))
      if (compareScores(objective, ev.vec, initial.vec) <= 0) continue
      const tree = treeOf(target)
      if (!tree) continue
      scored.push({
        description: describeMove(target),
        tree,
        gain: scalarGain(objective, initial.vec, ev.vec),
      })
    }
    scored.sort((a, b) => b.gain - a.gain)
    for (const goal of scored.slice(0, goalCount)) {
      goals.push(goal)
      goalTrees.add(goal.tree)
    }
  }

  // Points sunk into the goals' trees. Two branches that score the same are
  // not equally good: the one that is closer to unlocking a goal is.
  const goalTreeObjects = [...goalTrees]
    .map(name => opts.input.allTrees.find(t => t.Name === name))
    .filter((t): t is NonNullable<typeof t> => t != null)

  function goalProgressOf(build: CharacterBuild): number {
    let sum = 0
    for (const tree of goalTreeObjects) {
      const choices = tree.IsEpicDestiny
        ? build.destinyChoices?.[tree.Name]
        : build.enhancementChoices?.[tree.Name]
      sum += treeSpent(tree, choices ?? {})
    }
    return sum
  }

  // ── Beam search ─────────────────────────────────────────────────────────
  let beam: BeamState[] = [initial]
  let roundsSinceImprovement = 0
  // The first round expands EVERYTHING (up to seedScanLimit) rather than a
  // handful. Before anything has been evaluated the expansion heuristic has
  // no information — it would just take the first few moves the generator
  // emitted, which is tree-declaration order, and the beam would spend the
  // whole run inside whichever tree happens to come first. One wide round
  // seeds `lastGain` for every move, and none of those evaluations is wasted:
  // each becomes a candidate successor.
  let firstRound = true

  outer:
  while (beam.length > 0) {
    if (engine.cancelled()) { stopped = 'cancelled'; break }
    if (engine.outOfBudget()) { stopped = 'evalBudget'; break }
    if (roundsSinceImprovement >= patience) break

    const successors: BeamState[] = []
    const seen = new Set(beam.map(s => s.signature))

    for (const state of beam) {
      if (engine.cancelled()) { stopped = 'cancelled'; break outer }
      if (engine.outOfBudget()) { stopped = 'evalBudget'; break outer }

      const ctx = engine.ctxFor(state.build, state.stats)
      const moves = generateMoves(ctx, domains)
      if (moves.length === 0) continue

      // Expansion slots are SPLIT rather than ranked by one score. A single
      // combined ranking with a large goal bonus starves every other tree —
      // the search follows its one goal and never notices the tree that was
      // paying immediately. So a minority of slots is reserved for moves in
      // goal trees (the long-term steering) and the rest go to the best
      // moves anywhere (ordinary progress). Untried moves sort first in both
      // halves, since an unknown gain is worth one evaluation to learn.
      const UNTRIED = Number.MAX_SAFE_INTEGER / 2
      const scored = moves.map(move => {
        const tree = treeOf(move)
        return {
          move,
          id: moveId(move),
          isGoal: tree !== null && goalTrees.has(tree),
          rank: lastGain.get(moveId(move)) ?? UNTRIED,
        }
      })
      const byRank = (a: { rank: number }, b: { rank: number }) => b.rank - a.rank
      const width = firstRound ? Math.min(seedScanLimit, scored.length) : expandPerState
      const goalSlots = goalTrees.size > 0 ? Math.max(1, Math.floor(width / 3)) : 0

      const ordered: typeof scored = []
      const picked = new Set<string>()
      for (const cand of scored.filter(c => c.isGoal).sort(byRank).slice(0, goalSlots)) {
        ordered.push(cand)
        picked.add(cand.id)
      }
      for (const cand of [...scored].sort(byRank)) {
        if (ordered.length >= width) break
        if (picked.has(cand.id)) continue
        ordered.push(cand)
        picked.add(cand.id)
      }

      for (const cand of ordered) {
        if (engine.cancelled()) { stopped = 'cancelled'; break outer }
        if (engine.outOfBudget()) { stopped = 'evalBudget'; break outer }

        const signature = [...state.signature.split(' ').filter(Boolean), cand.id]
          .sort().join(' ')
        if (seen.has(signature)) continue
        seen.add(signature)

        const nextBuild = applyMove(state.build, cand.move)
        const ev = await engine.evaluate(nextBuild)
        lastGain.set(cand.id, scalarGain(objective, state.vec, ev.vec))

        const improved = compareScores(objective, ev.vec, state.vec) > 0
        successors.push({
          build: nextBuild,
          stats: ev.stats,
          vec: ev.vec,
          signature,
          goalProgress: goalProgressOf(nextBuild),
          applied: [...state.applied, {
            move: cand.move,
            description: describeMove(cand.move),
            // A step that does not pay off now is being taken for later —
            // exactly what the greedy search refuses to do.
            bridge: !improved,
            gains: objective.stats
              .map((s, i) => ({ key: s.key, label: s.label, before: state.vec[i], after: ev.vec[i] }))
              .filter(g => Math.abs(g.after - g.before) > 1e-9),
          }],
        })
      }
    }

    firstRound = false
    if (successors.length === 0) break

    successors.sort((a, b) => {
      const cmp = compareScores(objective, b.vec, a.vec)
      if (cmp !== 0) return cmp
      // Equal outcome: prefer the branch closest to unlocking a goal, then
      // the shorter path. Without the first tie-break every step of a climb
      // toward a gate looks exactly like idling, and the beam drifts.
      return (b.goalProgress - a.goalProgress) || (a.applied.length - b.applied.length)
    })
    beam = successors.slice(0, beamWidth)
    branches = Math.max(branches, beam.length)

    const leader = beam[0]
    if (compareScores(objective, leader.vec, best.vec) > 0) {
      best = leader
      roundsSinceImprovement = 0
    } else {
      roundsSinceImprovement++
    }
    report()
  }

  report()
  return {
    build: best.build,
    applied: best.applied,
    evals: engine.evals(),
    stopped,
    before: startTotals.map((s, i) => ({ ...s, after: best.vec[i] })),
    unchanged: best.applied.length === 0,
    goals,
    branches,
  }
}
