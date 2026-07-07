// Enhancement action-point budget (V2 Build::AvailableActionPoints,
// Build.cpp:1727-1783 + Life::CountBonusRacialAP / CountBonusUniversalAP,
// Life.cpp:712-815).
//
// Budget for the whole enhancements pane (TT_allEnhancement) is
//   min(20, heroicLevel) * 4 + bonusRacialAP + bonusUniversalAP
// where the bonuses come from Effect_RAPBonus / Effect_UAPBonus effects on
// special (past-life / favor-reward) feats: for each feat trained `count`
// times, every matching effect adds Amount[count-1], gated by the effect's
// optional Rank field (applies only when Rank == count).

import type { CharacterBuild, Effect, Feat } from '../types/ddo'

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function amounts(e: Effect): number[] {
  const raw = e.Amount as unknown
  const text = typeof raw === 'object' && raw !== null && '#text' in (raw as object)
    ? String((raw as Record<string, unknown>)['#text'])
    : String(raw ?? '')
  return text.split(/\s+/).filter(Boolean).map(Number)
}

function bonusFromFeat(feat: Feat, count: number, type: 'RAPBonus' | 'UAPBonus'): number {
  let total = 0
  for (const e of toArray(feat.Effect)) {
    if (e.Type !== type) continue
    // V2: if (!HasRank() || Rank() == count)
    if (e.Rank != null && e.Rank !== count) continue
    const a = amounts(e)
    total += a[Math.min(count, a.length) - 1] ?? 0
  }
  return total
}

export interface BonusActionPoints {
  racial: number
  universal: number
}

/**
 * Counts bonus racial/universal APs from past-life, favor, and Life-level
 * Special feats, exactly as V2's Life::CountBonusRacialAP /
 * CountBonusUniversalAP walk SpecialFeats. `specialFeats` comes from the
 * owning Life (not CharacterBuild) — e.g. Chrism reincarnation-cache feats,
 * which may appear more than once (one entry per redemption, up to +4).
 */
export function computeBonusActionPoints(
  build: CharacterBuild,
  allFeats: Feat[],
  specialFeats: string[] = [],
): BonusActionPoints {
  const out: BonusActionPoints = { racial: 0, universal: 0 }
  const counted = new Map<string, number>()
  for (const [source, count] of Object.entries(build.pastLives ?? {})) {
    if (!count) continue
    const feat = allFeats.find(f =>
      f.Name === source || f.Name === `Past Life: ${source}` || f.Name === `Racial Past Life: ${source}`)
    if (feat) counted.set(feat.Name, count)
  }
  // Favor-reward special feats (e.g. universal-tree access "The Free Agents
  // Favor Rewards") are trained once each.
  for (const fn of build.favorFeats ?? []) {
    if (!counted.has(fn)) {
      const feat = allFeats.find(f => f.Name === fn)
      if (feat) counted.set(feat.Name, 1)
    }
  }
  // Life-level Special feats — count repeated redemptions of the same name.
  const specialCounts = new Map<string, number>()
  for (const fn of specialFeats) {
    specialCounts.set(fn, (specialCounts.get(fn) ?? 0) + 1)
  }
  for (const [fn, count] of specialCounts) {
    if (!counted.has(fn)) {
      const feat = allFeats.find(f => f.Name === fn)
      if (feat) counted.set(feat.Name, count)
    }
  }
  for (const [name, count] of counted) {
    const feat = allFeats.find(f => f.Name === name)
    if (!feat) continue
    out.racial += bonusFromFeat(feat, count, 'RAPBonus')
    out.universal += bonusFromFeat(feat, count, 'UAPBonus')
  }
  return out
}

/** V2 TT_allEnhancement budget: min(20, heroic level)·4 + racial + universal. */
export function enhancementAPBudget(build: CharacterBuild, allFeats: Feat[], specialFeats: string[] = []): number {
  const heroic = Math.min(20, build.totalLevel || 0)
  const bonus = computeBonusActionPoints(build, allFeats, specialFeats)
  return heroic * 4 + bonus.racial + bonus.universal
}
