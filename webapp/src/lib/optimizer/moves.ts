// Legal-move generation for the build optimizer (Custom › Optimizer).
//
// A Move is one atomic, legal ADDITION to the build — the optimizer only
// fills choices that are not already set (spend unspent AP / destiny points,
// fill empty feat slots, assign unassigned class levels, select an unused
// destiny slot). It never revokes or swaps anything the user has chosen.
//
// Legality mirrors the UI's own gates exactly:
//  - enhancements: TreeGrid rules (MinSpent, core sequencing, per-item
//    Requirements, single Tier-5 tree, AP budget) — same predicates the
//    random-build fuzzer replays (lib/fuzz/randomBuild).
//  - destinies: EpicDestiniesPanel rules (shared destiny point pool across
//    the 3 selected trees, Tier-5 lock via lib/destiny).
//  - feats: lib/featEligibility — only prereq-met options for empty slots.
//  - class levels: only unassigned levelClasses entries, only classes with
//    remaining declared levels, and never invalidating an already-set feat.

import type {
  Ability, CharacterBuild, DDOClass, EnhancementTree, EnhancementTreeItem, Feat, Race,
} from '../../types/ddo'
import { aggregateLevelClasses, HEROIC_CAP } from '../levelProgression'
import { EPIC_MAX_LEVELS, LEGENDARY_MAX_LEVELS } from '../gamedata'
import {
  accessibleTrees, treeSpent, nextRankCost, itemKey, type FuzzCatalogues,
} from '../fuzz/randomBuild'
import { getSelectorOptions } from '../buildStats'
import { enhancementAPBudget } from '../actionPoints'
import { meetsRequirements } from '../requirements'
import { buildSlots } from '../levelTraining'
import { featOptionsForSlot, isChosenFeatValid } from '../featEligibility'
import { availableDestinyTrees, destinyPoolForBuild, tier5LockedTree } from '../destiny'

export type Move =
  | { kind: 'enhancement'; tree: string; itemName: string; key: string; toRank: number; cost: number; selector?: string }
  | { kind: 'destiny'; tree: string; itemName: string; key: string; toRank: number; cost: number; selector?: string }
  | { kind: 'destinyTree'; slot: 0 | 1 | 2; tree: string; coreName: string; coreKey: string; cost: number; selector?: string }
  | { kind: 'feat'; slotKey: string; featName: string; level: number; featType: string }
  | { kind: 'classLevel'; level: number; className: string }
  | { kind: 'epicLevel'; toLevel: number }
  | { kind: 'legendaryLevel'; toLevel: number }
  | { kind: 'abilityLevelUp'; level: number; ability: Ability }

export interface MoveDomains {
  enhancements: boolean
  destinies: boolean
  feats: boolean
  classLevels: boolean
  abilityLevelUps?: boolean
}

/** True for moves that raise or assign character levels (the "level up and
 *  go from there" moves) — applied even at zero immediate gain when the
 *  build is below the optimizer's target level. */
export function isLevelingMove(m: Move): boolean {
  return m.kind === 'classLevel' || m.kind === 'epicLevel' || m.kind === 'legendaryLevel'
}

export interface MoveContext {
  build: CharacterBuild
  allClasses: DDOClass[]
  allRaces: Race[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]
  specialFeats?: string[]
  /** From current stats: stats.total('fatePoint') — feeds the destiny pool. */
  fatePoints: number
  /** From current stats: stats.total('destinyAP'). */
  destinyApBonus: number
  /**
   * Character level the optimizer may level the build toward (heroic class
   * levels first, then epic, then legendary). Defaults to the build's
   * current character level — i.e. no leveling.
   */
  targetLevel?: number
}

export function characterLevel(build: CharacterBuild): number {
  return (build.totalLevel ?? 0) + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
}

export function moveId(m: Move): string {
  switch (m.kind) {
    case 'enhancement': return `e|${m.tree}|${m.key}|${m.toRank}|${m.selector ?? ''}`
    case 'destiny':     return `d|${m.tree}|${m.key}|${m.toRank}|${m.selector ?? ''}`
    case 'destinyTree': return `dt|${m.slot}|${m.tree}|${m.selector ?? ''}`
    case 'feat':        return `f|${m.slotKey}|${m.featName}`
    case 'classLevel':  return `c|${m.level}|${m.className}`
    case 'epicLevel':      return `el|${m.toLevel}`
    case 'legendaryLevel': return `ll|${m.toLevel}`
    case 'abilityLevelUp': return `alu|${m.level}|${m.ability}`
  }
}

export function describeMove(m: Move): string {
  switch (m.kind) {
    case 'enhancement':
      return `Train ${m.itemName}${m.selector ? ` (${m.selector})` : ''} rank ${m.toRank} in ${m.tree} — ${m.cost} AP`
    case 'destiny':
      return `Train ${m.itemName}${m.selector ? ` (${m.selector})` : ''} rank ${m.toRank} in ${m.tree} — ${m.cost} destiny pt`
    case 'destinyTree':
      return `Select destiny tree ${m.tree} and train ${m.coreName}${m.selector ? ` (${m.selector})` : ''}`
    case 'feat':
      return `Take feat ${m.featName} (${m.featType || 'feat'} slot, level ${m.level})`
    case 'classLevel':
      return `Take level ${m.level} as ${m.className}`
    case 'epicLevel':
      return `Take epic level (character level ${m.toLevel})`
    case 'legendaryLevel':
      return `Take legendary level (character level ${m.toLevel})`
    case 'abilityLevelUp':
      return `Put the level-${m.level} ability point into ${m.ability}`
  }
}

// ---------------------------------------------------------------------------
// Tree purchase legality (shared by enhancement + destiny trees)
// ---------------------------------------------------------------------------

const CORE_Y = 0

function rankOf(choices: Record<string, number>, item: EnhancementTreeItem): number {
  return choices[itemKey(item)] ?? choices[item.Name] ?? 0
}

function selectionOf(selections: Record<string, string> | undefined, item: EnhancementTreeItem): string | undefined {
  return selections?.[itemKey(item)] ?? selections?.[item.Name]
}

interface TreeBuyInput {
  tree: EnhancementTree
  choices: Record<string, number>
  selections: Record<string, string> | undefined
  /** AP still spendable across the whole pool. */
  remaining: number
  /** Name of the tree currently holding a Tier-5 purchase, '' when none. */
  tier5Tree: string
  build: CharacterBuild
  allClasses: DDOClass[]
  race?: Race
  /** When true, ignore the MinSpent gate (used for unlock-target scanning). */
  ignoreMinSpent?: boolean
}

/**
 * All (item, nextRank, cost, selector) purchases legal in this tree right
 * now. Selector items with no selection yet yield one entry per option.
 */
function treePurchases(input: TreeBuyInput): Array<{ item: EnhancementTreeItem; toRank: number; cost: number; selector?: string }> {
  const { tree, choices, selections, remaining, tier5Tree, build, allClasses, race } = input
  const items = tree.EnhancementTreeItem ?? []
  const spentHere = treeSpent(tree, choices)
  const coreItems = items
    .filter(it => (it.YPosition ?? 0) === CORE_Y)
    .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))

  const out: Array<{ item: EnhancementTreeItem; toRank: number; cost: number; selector?: string }> = []
  for (const item of items) {
    const rank = rankOf(choices, item)
    if (rank >= (item.Ranks ?? 1)) continue
    if (!input.ignoreMinSpent && spentHere < (item.MinSpent ?? 0)) continue
    const cost = nextRankCost(item, rank)
    if (cost > remaining) continue
    if ((item.YPosition ?? 0) === CORE_Y) {
      const idx = coreItems.findIndex(c => c.Name === item.Name)
      if (idx > 0) {
        const prev = coreItems[idx - 1]
        if (rankOf(choices, prev) < (prev.Ranks ?? 1)) continue
      }
    }
    if (item.Tier5 === true && tier5Tree && tier5Tree !== tree.Name) continue
    if (!meetsRequirements(item.Requirements, { build, allClasses, race })) continue

    const options = getSelectorOptions(item)
    const existing = selectionOf(selections, item)
    if (options.length > 0 && !existing) {
      for (const opt of options) out.push({ item, toRank: rank + 1, cost, selector: opt.Name })
    } else {
      out.push({ item, toRank: rank + 1, cost })
    }
  }
  return out
}

/** The single heroic-enhancement tree holding a trained Tier-5, or ''. */
function enhancementTier5Tree(build: CharacterBuild, allTrees: EnhancementTree[]): string {
  for (const [treeName, choices] of Object.entries(build.enhancementChoices ?? {})) {
    const tree = allTrees.find(t => t.Name === treeName)
    if (!tree) continue
    if ((tree.EnhancementTreeItem ?? []).some(it => it.Tier5 === true && rankOf(choices, it) > 0)) {
      return treeName
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Per-domain generators
// ---------------------------------------------------------------------------

function fuzzCat(ctx: MoveContext): FuzzCatalogues {
  return {
    allRaces: ctx.allRaces, allClasses: ctx.allClasses, allFeats: ctx.allFeats,
    allTrees: ctx.allTrees, allItems: [],
  }
}

export function enhancementMoves(ctx: MoveContext): Move[] {
  const { build, allClasses, allFeats, allTrees } = ctx
  const race = ctx.allRaces.find(r => r.Name === build.race)
  const budget = enhancementAPBudget(build, allFeats, ctx.specialFeats ?? [])
  let totalSpent = 0
  for (const [treeName, choices] of Object.entries(build.enhancementChoices ?? {})) {
    const tree = allTrees.find(t => t.Name === treeName)
    if (tree) totalSpent += treeSpent(tree, choices)
  }
  const remaining = budget - totalSpent
  if (remaining <= 0) return []
  const tier5Tree = enhancementTier5Tree(build, allTrees)

  const out: Move[] = []
  for (const tree of accessibleTrees(fuzzCat(ctx), build)) {
    const purchases = treePurchases({
      tree,
      choices: build.enhancementChoices[tree.Name] ?? {},
      selections: build.enhancementSelections[tree.Name],
      remaining, tier5Tree, build, allClasses, race,
    })
    for (const p of purchases) {
      out.push({
        kind: 'enhancement', tree: tree.Name, itemName: p.item.Name,
        key: itemKey(p.item), toRank: p.toRank, cost: p.cost, selector: p.selector,
      })
    }
  }
  return out
}

export function destinyMoves(ctx: MoveContext): Move[] {
  const { build, allClasses, allTrees } = ctx
  const race = ctx.allRaces.find(r => r.Name === build.race)
  const destinyTrees = allTrees.filter(t => t.IsEpicDestiny === true)
  if (destinyTrees.length === 0) return []

  const pool = destinyPoolForBuild(build, ctx.fatePoints, ctx.destinyApBonus)
  const selected = build.selectedDestinyTrees ?? ['', '', '']
  const spentAll = selected
    .filter(n => n !== '')
    .reduce((sum, name) => {
      const tree = destinyTrees.find(t => t.Name === name)
      return sum + (tree ? treeSpent(tree, build.destinyChoices[name] ?? {}) : 0)
    }, 0)
  const remaining = pool - spentAll
  if (remaining <= 0) return []

  const t5 = tier5LockedTree(selected, build.destinyChoices ?? {}, destinyTrees)
  const out: Move[] = []

  // Spend inside already-selected trees.
  for (const name of selected) {
    if (!name) continue
    const tree = destinyTrees.find(t => t.Name === name)
    if (!tree) continue
    const purchases = treePurchases({
      tree,
      choices: build.destinyChoices[name] ?? {},
      selections: build.destinySelections?.[name],
      remaining, tier5Tree: t5, build, allClasses, race,
    })
    for (const p of purchases) {
      out.push({
        kind: 'destiny', tree: name, itemName: p.item.Name,
        key: itemKey(p.item), toRank: p.toRank, cost: p.cost, selector: p.selector,
      })
    }
  }

  // Fill the first empty destiny slot: selecting a tree alone changes nothing,
  // so the move is a composite "select tree + train its first core" — that
  // gives the search a real stat delta to judge the tree by.
  const emptySlot = selected.findIndex(n => n === '')
  if (emptySlot >= 0) {
    const taken = new Set(selected.filter(Boolean))
    for (const tree of availableDestinyTrees(destinyTrees, build, allClasses, race)) {
      if (taken.has(tree.Name)) continue
      const cores = (tree.EnhancementTreeItem ?? [])
        .filter(it => (it.YPosition ?? 0) === CORE_Y)
        .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))
      const core = cores[0]
      if (!core) continue
      const cost = nextRankCost(core, 0)
      if (cost > remaining) continue
      if (!meetsRequirements(core.Requirements, { build, allClasses, race })) continue
      const options = getSelectorOptions(core)
      if (options.length > 0) {
        for (const opt of options) {
          out.push({
            kind: 'destinyTree', slot: emptySlot as 0 | 1 | 2, tree: tree.Name,
            coreName: core.Name, coreKey: itemKey(core), cost, selector: opt.Name,
          })
        }
      } else {
        out.push({
          kind: 'destinyTree', slot: emptySlot as 0 | 1 | 2, tree: tree.Name,
          coreName: core.Name, coreKey: itemKey(core), cost,
        })
      }
    }
  }

  return out
}

export function featMoves(ctx: MoveContext): Move[] {
  const { build, allClasses, allRaces, allFeats } = ctx
  const race = allRaces.find(r => r.Name === build.race)
  const slots = buildSlots(build, allClasses, allRaces)
  const out: Move[] = []
  for (const slot of slots) {
    if (build.featChoices[slot.key]) continue
    const options = featOptionsForSlot(
      slot, slots, allFeats, build, allClasses, race,
      { specialFeats: ctx.specialFeats },
    ).filter(o => o.prereqsMet)
    for (const o of options) {
      out.push({
        kind: 'feat', slotKey: slot.key, featName: o.feat.Name,
        level: slot.level, featType: slot.featType,
      })
    }
  }
  return out
}

/**
 * Assign the next open heroic level to a class. Covers both "holes" left in
 * an existing level plan and leveling a low-level (or brand-new) character
 * toward the target level. Candidates follow the game's multiclass rules:
 * at most 3 distinct classes, at most one archetype, and an archetype never
 * with its own base class. `classes` and `totalLevel` are re-aggregated from
 * the per-level assignment exactly like the SET_LEVEL_CLASS reducer.
 */
export function classLevelMoves(ctx: MoveContext): Move[] {
  const { build, allClasses, allRaces, allFeats } = ctx
  const race = allRaces.find(r => r.Name === build.race)
  const target = ctx.targetLevel ?? characterLevel(build)

  const levels = [...(build.levelClasses ?? [])]
  while (levels.length < HEROIC_CAP) levels.push('')
  const idx = levels.findIndex(l => l === '')
  if (idx < 0) return []
  // Fill a hole inside the already-counted levels, or grow toward the target.
  const hasHole = idx < (build.totalLevel ?? 0)
  const mayGrow = (build.totalLevel ?? 0) < Math.min(HEROIC_CAP, target)
  if (!hasHole && !mayGrow) return []

  const present = [...new Set(levels.filter(Boolean))]
  const presentClasses = present
    .map(n => allClasses.find(c => c.Name === n))
    .filter((c): c is DDOClass => !!c)

  const out: Move[] = []
  for (const cls of allClasses) {
    if (cls.NotHeroic || cls.Name === 'Unknown') continue
    if (!present.includes(cls.Name)) {
      if (present.length >= 3) continue                                  // 3-class cap
      if (cls.BaseClass && presentClasses.some(p => p.BaseClass)) continue // one archetype max
      if (cls.BaseClass && present.includes(cls.BaseClass)) continue       // not with its base
      if (presentClasses.some(p => p.BaseClass === cls.Name)) continue     // base not with its archetype
    }
    const move: Move = { kind: 'classLevel', level: idx + 1, className: cls.Name }
    // Changing the per-level class plan shifts per-level snapshots, which can
    // invalidate feats the user already picked — drop any such move.
    const next = applyMove(build, move)
    const nextSlots = buildSlots(next, allClasses, allRaces)
    const stillValid = Object.entries(next.featChoices).every(([slotKey, featName]) => {
      if (!featName) return true
      const s = nextSlots.find(x => x.key === slotKey)
      if (!s) return false
      return isChosenFeatValid(s, nextSlots, featName, allFeats, next, allClasses, race, ctx.specialFeats ?? [])
    })
    if (stillValid) out.push(move)
  }
  return out
}

/** Epic / legendary level progression toward the target level. */
export function levelProgressMoves(ctx: MoveContext): Move[] {
  const { build } = ctx
  const charLevel = characterLevel(build)
  const target = ctx.targetLevel ?? charLevel
  if (charLevel >= target) return []
  if ((build.totalLevel ?? 0) < HEROIC_CAP) return []   // heroic levels first
  if ((build.epicLevels ?? 0) < EPIC_MAX_LEVELS) {
    return [{ kind: 'epicLevel', toLevel: charLevel + 1 }]
  }
  if ((build.legendaryLevels ?? 0) < LEGENDARY_MAX_LEVELS) {
    return [{ kind: 'legendaryLevel', toLevel: charLevel + 1 }]
  }
  return []
}

const ABILITY_LEVELUP_LEVELS = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const
const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

/** Fill unset +1 ability picks at levels 4, 8, 12, … up to the current level. */
export function abilityLevelUpMoves(ctx: MoveContext): Move[] {
  const { build } = ctx
  const charLevel = characterLevel(build)
  const out: Move[] = []
  for (const lvl of ABILITY_LEVELUP_LEVELS) {
    if (lvl > charLevel) break
    if (build.abilityLevelUps[lvl]) continue
    for (const ability of ABILITIES) {
      out.push({ kind: 'abilityLevelUp', level: lvl, ability })
    }
  }
  return out
}

export function generateMoves(ctx: MoveContext, domains: MoveDomains): Move[] {
  const out: Move[] = []
  if (domains.enhancements) out.push(...enhancementMoves(ctx))
  if (domains.destinies) out.push(...destinyMoves(ctx))
  if (domains.feats) out.push(...featMoves(ctx))
  if (domains.classLevels) out.push(...classLevelMoves(ctx), ...levelProgressMoves(ctx))
  if (domains.abilityLevelUps) out.push(...abilityLevelUpMoves(ctx))
  return out
}

// ---------------------------------------------------------------------------
// Applying a move — pure, never mutates the input build
// ---------------------------------------------------------------------------

function withTreeRank(
  choicesByTree: Record<string, Record<string, number>>,
  tree: string, key: string, itemName: string, rank: number,
): Record<string, Record<string, number>> {
  const treeChoices = { ...(choicesByTree[tree] ?? {}) }
  treeChoices[key] = rank
  // Same policy as TreeGrid.writeChoices: drop a stale display-name entry
  // when the canonical key is the InternalName.
  if (key !== itemName) delete treeChoices[itemName]
  return { ...choicesByTree, [tree]: treeChoices }
}

function withTreeSelection(
  selectionsByTree: Record<string, Record<string, string>>,
  tree: string, key: string, selector: string,
): Record<string, Record<string, string>> {
  return {
    ...selectionsByTree,
    [tree]: { ...(selectionsByTree[tree] ?? {}), [key]: selector },
  }
}

export function applyMove(build: CharacterBuild, m: Move): CharacterBuild {
  switch (m.kind) {
    case 'enhancement': {
      const next: CharacterBuild = {
        ...build,
        enhancementChoices: withTreeRank(build.enhancementChoices, m.tree, m.key, m.itemName, m.toRank),
      }
      if (m.selector) {
        next.enhancementSelections = withTreeSelection(build.enhancementSelections, m.tree, m.key, m.selector)
      }
      // Keep the tree visible in the Enhancements panel's pinned list.
      if (!build.enhancementPinned.includes(m.tree)) {
        next.enhancementPinned = [...build.enhancementPinned, m.tree]
      }
      return next
    }
    case 'destiny': {
      const next: CharacterBuild = {
        ...build,
        destinyChoices: withTreeRank(build.destinyChoices, m.tree, m.key, m.itemName, m.toRank),
      }
      if (m.selector) {
        next.destinySelections = withTreeSelection(build.destinySelections ?? {}, m.tree, m.key, m.selector)
      }
      return next
    }
    case 'destinyTree': {
      const selected = [...(build.selectedDestinyTrees ?? ['', '', ''])] as [string, string, string]
      selected[m.slot] = m.tree
      const next: CharacterBuild = {
        ...build,
        selectedDestinyTrees: selected,
        destinyChoices: withTreeRank(build.destinyChoices, m.tree, m.coreKey, m.coreName, 1),
      }
      if (m.selector) {
        next.destinySelections = withTreeSelection(build.destinySelections ?? {}, m.tree, m.coreKey, m.selector)
      }
      return next
    }
    case 'feat':
      return { ...build, featChoices: { ...build.featChoices, [m.slotKey]: m.featName } }
    case 'classLevel': {
      // Mirror the SET_LEVEL_CLASS reducer: write the per-level entry, then
      // re-aggregate the class slots and totalLevel from the level plan.
      const levels = [...(build.levelClasses ?? [])]
      while (levels.length < m.level) levels.push('')
      levels[m.level - 1] = m.className
      const trimmed = levels.slice(0, HEROIC_CAP)
      return {
        ...build,
        levelClasses: trimmed,
        classes: aggregateLevelClasses(trimmed),
        totalLevel: trimmed.filter(Boolean).length,
      }
    }
    case 'epicLevel':
      return { ...build, epicLevels: (build.epicLevels ?? 0) + 1 }
    case 'legendaryLevel':
      return { ...build, legendaryLevels: (build.legendaryLevels ?? 0) + 1 }
    case 'abilityLevelUp':
      return {
        ...build,
        abilityLevelUps: {
          ...build.abilityLevelUps,
          [m.level as 4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40]: m.ability,
        },
      }
  }
}

// ---------------------------------------------------------------------------
// Unlock-target scanning (bridge phase support)
// ---------------------------------------------------------------------------

/**
 * Items currently gated ONLY by their tree's MinSpent that could be bought if
 * more AP were sunk into the tree. The optimizer evaluates these
 * hypothetically; when one would improve the objective it justifies spending
 * otherwise-neutral AP in that tree ("spend 5 in tree to unlock tier 2").
 */
export function gatedTreeTargets(ctx: MoveContext, domains: MoveDomains): Move[] {
  const { build, allClasses, allTrees } = ctx
  const race = ctx.allRaces.find(r => r.Name === build.race)
  const out: Move[] = []

  if (domains.enhancements) {
    const budget = enhancementAPBudget(build, ctx.allFeats, ctx.specialFeats ?? [])
    let totalSpent = 0
    for (const [treeName, choices] of Object.entries(build.enhancementChoices ?? {})) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (tree) totalSpent += treeSpent(tree, choices)
    }
    const tier5Tree = enhancementTier5Tree(build, allTrees)
    for (const tree of accessibleTrees(fuzzCat(ctx), build)) {
      const choices = build.enhancementChoices[tree.Name] ?? {}
      const spentHere = treeSpent(tree, choices)
      const all = treePurchases({
        tree, choices, selections: build.enhancementSelections[tree.Name],
        remaining: budget - totalSpent, tier5Tree, build, allClasses, race,
        ignoreMinSpent: true,
      })
      for (const p of all) {
        const minSpent = p.item.MinSpent ?? 0
        if (spentHere >= minSpent) continue                      // not actually gated
        // The unlock must be affordable: gap to MinSpent plus the item itself.
        if ((minSpent - spentHere) + p.cost > budget - totalSpent) continue
        out.push({
          kind: 'enhancement', tree: tree.Name, itemName: p.item.Name,
          key: itemKey(p.item), toRank: p.toRank, cost: p.cost, selector: p.selector,
        })
      }
    }
  }

  if (domains.destinies) {
    const destinyTrees = allTrees.filter(t => t.IsEpicDestiny === true)
    const pool = destinyPoolForBuild(build, ctx.fatePoints, ctx.destinyApBonus)
    const selected = build.selectedDestinyTrees ?? ['', '', '']
    const spentAll = selected.filter(n => n !== '').reduce((sum, name) => {
      const tree = destinyTrees.find(t => t.Name === name)
      return sum + (tree ? treeSpent(tree, build.destinyChoices[name] ?? {}) : 0)
    }, 0)
    const t5 = tier5LockedTree(selected, build.destinyChoices ?? {}, destinyTrees)
    for (const name of selected) {
      if (!name) continue
      const tree = destinyTrees.find(t => t.Name === name)
      if (!tree) continue
      const choices = build.destinyChoices[name] ?? {}
      const spentHere = treeSpent(tree, choices)
      const all = treePurchases({
        tree, choices, selections: build.destinySelections?.[name],
        remaining: pool - spentAll, tier5Tree: t5, build, allClasses, race,
        ignoreMinSpent: true,
      })
      for (const p of all) {
        const minSpent = p.item.MinSpent ?? 0
        if (spentHere >= minSpent) continue
        if ((minSpent - spentHere) + p.cost > pool - spentAll) continue
        out.push({
          kind: 'destiny', tree: name, itemName: p.item.Name,
          key: itemKey(p.item), toRank: p.toRank, cost: p.cost, selector: p.selector,
        })
      }
    }
  }

  return out
}
