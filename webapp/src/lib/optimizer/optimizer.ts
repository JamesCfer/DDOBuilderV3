// Greedy build optimizer (Custom › Optimizer).
//
// Strategy: repeatedly evaluate every legal single addition to the build
// (lib/optimizer/moves) by recomputing full build stats on a candidate copy,
// apply the best objective-improving one, and repeat until nothing improves.
//
// Because one evaluation is a full computeBuildStats pass (~10-20 ms), a
// naive greedy loop would re-evaluate every move every round. Two standard
// accelerations keep it responsive:
//  - LAZY GREEDY: candidate gains almost always shrink as the build fills up
//    (bonuses of the same type stop stacking), so moves are re-checked in
//    order of their last-known gain and the scan stops as soon as the best
//    fresh gain beats every stale upper bound. Fresh (never-seen) moves are
//    always evaluated first. The final pick is verified with an exact score
//    comparison — the heuristic only orders the queue.
//  - BRIDGE PHASE: when no single move improves the objective but a gated
//    tree item WOULD (e.g. a tier-3 melee-power enhancement behind a
//    10-AP-in-tree gate), the search spends otherwise-neutral AP in that
//    tree to work toward the unlock, mirroring how players actually build.
//
// The loop yields to the event loop every few evaluations so the UI stays
// live, reports progress, and honors cancellation.

import type { CharacterBuild } from '../../types/ddo'
import { treeSpent } from '../fuzz/randomBuild'
import {
  compareScores, scalarGain, scoreVector,
  type ObjectiveSpec, type ScoreVector,
} from './objective'
import {
  applyMove, describeMove, gatedTreeTargets, generateMoves,
  isLevelingMove, moveId,
  type Move,
} from './moves'
import {
  createEngine,
  type Evaluation, type OptimizeProgress, type SearchOptions, type Stats, type StopReason,
} from './engine'

export type { OptimizeProgress, StopReason } from './engine'

export interface StatDelta {
  key: string
  label: string
  before: number
  after: number
}

export interface AppliedMoveRecord {
  move: Move
  description: string
  /** Objective-stat movements caused by this move (zero-delta rows omitted). */
  gains: StatDelta[]
  /** True when the move was taken for later payoff (leveling toward the
   *  target, or spending toward a MinSpent unlock), not for immediate gain. */
  bridge?: boolean
}

export interface OptimizeResult {
  build: CharacterBuild
  applied: AppliedMoveRecord[]
  evals: number
  stopped: StopReason
  /** Objective stat totals on the input build. */
  before: StatDelta[]
  /** True when the optimizer changed nothing (already optimal / no headroom). */
  unchanged: boolean
}

export type OptimizeOptions = SearchOptions

export async function optimizeBuild(opts: OptimizeOptions): Promise<OptimizeResult> {
  const { objective, domains } = opts
  const engine = createEngine(opts, 'greedy')

  let current = opts.build
  let start: Evaluation = engine.evaluateSync(current)
  let curStats = start.stats
  let curVec = start.vec
  const startTotals: StatDelta[] = objective.stats.map((s, i) => ({
    key: s.key, label: s.label, before: curVec[i], after: curVec[i],
  }))

  const applied: AppliedMoveRecord[] = []
  const lastGain = new Map<string, number>()
  let stopped: StopReason = 'converged'

  const report = () => engine.report(applied.length, applied[applied.length - 1]?.description)

  const evaluate = (candidate: CharacterBuild) => engine.evaluate(candidate)

  const ctxFor = engine.ctxFor

  function recordApply(move: Move, beforeVec: ScoreVector, afterVec: ScoreVector, bridge = false) {
    applied.push({
      move,
      description: describeMove(move),
      bridge,
      gains: objective.stats
        .map((s, i) => ({ key: s.key, label: s.label, before: beforeVec[i], after: afterVec[i] }))
        .filter(g => Math.abs(g.after - g.before) > 1e-9),
    })
  }

  outer:
  while (true) {
    if (engine.cancelled()) { stopped = 'cancelled'; break }
    if (engine.outOfBudget()) { stopped = 'evalBudget'; break }

    const ctx = ctxFor(current, curStats)
    const moves = generateMoves(ctx, domains)
    if (moves.length === 0) break

    // Lazy-greedy scan: fresh moves first, then stale ones by last-known gain.
    const ordered = moves
      .map(m => ({ m, id: moveId(m), stale: lastGain.get(moveId(m)) }))
      .sort((a, b) => (b.stale ?? Infinity) - (a.stale ?? Infinity))

    let best: { move: Move; build: CharacterBuild; stats: Stats; vec: ScoreVector; scalar: number } | null = null

    for (const cand of ordered) {
      if (best && cand.stale !== undefined && cand.stale <= best.scalar) break
      if (engine.outOfBudget()) { stopped = 'evalBudget'; break }
      if (engine.cancelled()) { stopped = 'cancelled'; break }

      const next = applyMove(current, cand.m)
      const ev = await evaluate(next)
      const scalar = scalarGain(objective, curVec, ev.vec)
      lastGain.set(cand.id, scalar)
      if (compareScores(objective, ev.vec, curVec) > 0
        && (!best || compareScores(objective, ev.vec, best.vec) > 0)) {
        best = { move: cand.m, build: next, stats: ev.stats, vec: ev.vec, scalar }
      }
    }

    if (best) {
      recordApply(best.move, curVec, best.vec)
      current = best.build
      curStats = best.stats
      curVec = best.vec
      report()
      if (stopped !== 'converged') break        // budget/cancel hit mid-scan
      continue
    }
    if (stopped !== 'converged') break

    // ── Leveling fallback ─────────────────────────────────────────────────
    // Below the target level, leveling is infrastructure: take the best
    // level-up move even at zero immediate gain — new levels bring feat
    // slots, action points, and destiny points that later rounds convert
    // into objective gains ("pick class levels and go from there").
    const levelMoves = moves.filter(isLevelingMove)
    if (levelMoves.length > 0) {
      let lm = levelMoves[0]
      let lmScore = -Infinity
      for (const f of levelMoves) {
        const g = lastGain.get(moveId(f)) ?? 0
        if (g > lmScore) { lmScore = g; lm = f }
      }
      const next = applyMove(current, lm)
      const ev = await evaluate(next)
      recordApply(lm, curVec, ev.vec, true)
      current = next
      curStats = ev.stats
      curVec = ev.vec
      report()
      continue
    }

    // ── Ability level-up fallback ─────────────────────────────────────────
    // A +1 that doesn't cross a modifier breakpoint scores zero, but leaving
    // the pick unset helps nobody. Fill it anyway: best gain first, ties
    // broken toward the highest current ability (usually the build's main
    // stat, whose next point is closest to the next breakpoint).
    const abilityMoves = moves.filter(m => m.kind === 'abilityLevelUp')
    if (abilityMoves.length > 0) {
      let am = abilityMoves[0]
      let amScore = -Infinity
      for (const f of abilityMoves) {
        if (f.kind !== 'abilityLevelUp') continue
        const score = (lastGain.get(moveId(f)) ?? 0) * 1e6 + curStats.total(`ability.${f.ability}`)
        if (score > amScore) { amScore = score; am = f }
      }
      const next = applyMove(current, am)
      const ev = await evaluate(next)
      recordApply(am, curVec, ev.vec, true)
      current = next
      curStats = ev.stats
      curVec = ev.vec
      report()
      continue
    }

    // ── Bridge phase ──────────────────────────────────────────────────────
    // No single legal move improves the objective. Check whether a MinSpent-
    // gated item WOULD improve it; if so, sink the least-harmful legal AP
    // into that tree and keep going.
    const targets = gatedTreeTargets(ctx, domains)
    let bestTarget: { move: Move; scalar: number } | null = null
    for (const t of targets) {
      if (engine.outOfBudget()) { stopped = 'evalBudget'; break outer }
      if (engine.cancelled()) { stopped = 'cancelled'; break outer }
      const ev = await evaluate(applyMove(current, t))    // hypothetical: gate waived
      if (compareScores(objective, ev.vec, curVec) <= 0) continue
      const scalar = scalarGain(objective, curVec, ev.vec)
      if (!bestTarget || scalar > bestTarget.scalar) bestTarget = { move: t, scalar }
    }
    if (!bestTarget) break                                 // genuinely converged

    // Spend toward the unlock: repeatedly buy the best (least-harmful,
    // cheapest) legal purchase in the target's tree until the gated item's
    // MinSpent is reached, then rejoin the main loop, which will train it.
    const targetMove = bestTarget.move as Extract<Move, { kind: 'enhancement' | 'destiny' }>
    const targetTree = opts.input.allTrees.find(t => t.Name === targetMove.tree)
    const targetItem = (targetTree?.EnhancementTreeItem ?? [])
      .find(it => (it.InternalName ?? it.Name) === targetMove.key || it.Name === targetMove.key)
    const targetMinSpent = targetItem?.MinSpent ?? 0
    let progressed = false
    for (let guard = 0; guard < 60; guard++) {
      if (engine.outOfBudget()) { stopped = 'evalBudget'; break outer }
      if (engine.cancelled()) { stopped = 'cancelled'; break outer }
      const bridgeCtx = ctxFor(current, curStats)
      const treeMoves = generateMoves(bridgeCtx, {
        enhancements: targetMove.kind === 'enhancement',
        destinies: targetMove.kind === 'destiny',
        feats: false, classLevels: false,
      }).filter(m => (m.kind === 'enhancement' || m.kind === 'destiny') && m.tree === targetMove.tree)
      if (treeMoves.length === 0) break
      const bridgeChoices = targetMove.kind === 'enhancement'
        ? current.enhancementChoices[targetMove.tree]
        : current.destinyChoices[targetMove.tree]
      const spentHere = targetTree ? treeSpent(targetTree, bridgeChoices ?? {}) : 0
      if (spentHere >= targetMinSpent) break                // unlocked — rejoin main loop
      let filler = treeMoves[0]
      let fillerScore = -Infinity
      for (const f of treeMoves) {
        const g = lastGain.get(moveId(f)) ?? 0              // unseen fillers assumed neutral
        const cost = f.kind === 'enhancement' || f.kind === 'destiny' ? f.cost : 99
        const score = g - cost * 1e-6                       // tie-break: cheaper first
        if (score > fillerScore) { fillerScore = score; filler = f }
      }
      const next = applyMove(current, filler)
      const ev = await evaluate(next)
      recordApply(filler, curVec, ev.vec, true)
      current = next
      curStats = ev.stats
      curVec = ev.vec
      progressed = true
      report()
    }
    if (!progressed) break                                  // couldn't move toward unlock
  }

  report()
  return {
    build: current,
    applied,
    evals: engine.evals(),
    stopped,
    before: startTotals.map((s, i) => ({ ...s, after: curVec[i] })),
    unchanged: applied.length === 0,
  }
}
