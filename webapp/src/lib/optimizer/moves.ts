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
//  - gear / augments / slot upgrades / filigrees: only slots that are EMPTY,
//    from the caller's shortlisted pools (lib/optimizer/gearCandidates). An
//    augment slot opened by a slot upgrade becomes fillable on a later round;
//    artifact filigree slots need an equipped Minor Artifact; a filigree
//    already slotted elsewhere is never offered twice.

import type {
  Ability, Augment, CharacterBuild, DDOClass, EnhancementTree, EnhancementTreeItem,
  Feat, Filigree, Item, Race,
} from '../../types/ddo'
import { resolveAugmentSlots, pendingSlotUpgrades, slotUpgradeKey } from '../gearSlotUpgrades'
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
  | { kind: 'gear'; slot: string; itemName: string }
  | { kind: 'augment'; slot: string; augType: string; index: number; augmentName: string }
  | { kind: 'slotUpgrade'; slot: string; upgradeType: string; index: number; color: string }
  | { kind: 'filigree'; artifact: boolean; slotIndex: number; filigreeName: string }

export interface MoveDomains {
  enhancements: boolean
  destinies: boolean
  feats: boolean
  classLevels: boolean
  abilityLevelUps?: boolean
  gear?: boolean
  augments?: boolean
  slotUpgrades?: boolean
  filigrees?: boolean
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
  /**
   * Shortlisted equippable items per EMPTY display gear slot, already level-
   * and relevance-filtered by the caller (lib/optimizer/gearCandidates). The
   * catalogue is thousands of items; the optimizer evaluates a shortlist.
   */
  gearCandidates?: Record<string, Item[]>
  /**
   * Equipped items by display slot — the same map the stat engine is given.
   * Augment and slot-upgrade moves read the equipped item's augment slots
   * from it, so those domains do nothing without it.
   */
  gearItems?: Record<string, Item>
  /** Shortlisted augments per augment colour (Blue, Red, Colourless, …). */
  augmentCandidates?: Record<string, Augment[]>
  /** Shortlisted filigrees, offered to every empty filigree slot. */
  filigreeCandidates?: Filigree[]
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
    case 'gear':        return `g|${m.slot}|${m.itemName}`
    case 'augment':     return `a|${m.slot}|${m.augType}|${m.index}|${m.augmentName}`
    case 'slotUpgrade': return `su|${m.slot}|${m.upgradeType}|${m.index}|${m.color}`
    case 'filigree':    return `fi|${m.artifact ? 'art' : 'wpn'}|${m.slotIndex}|${m.filigreeName}`
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
    case 'gear':
      return `Equip ${m.itemName} in ${m.slot}`
    case 'augment':
      return `Slot augment ${m.augmentName} in the ${m.augType} slot on ${m.slot}`
    case 'slotUpgrade':
      return `Upgrade ${m.slot}'s ${m.upgradeType} slot to ${m.color}`
    case 'filigree':
      return `Slot filigree ${m.filigreeName} in ${m.artifact ? 'artifact' : 'weapon'} slot ${m.slotIndex + 1}`
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
 * at most 3 distinct classes, and an archetype never with its own base class
 * or another archetype of the same base. `classes` and `totalLevel` are re-aggregated from
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
      if (cls.BaseClass && present.includes(cls.BaseClass)) continue       // not with its base
      if (cls.BaseClass && presentClasses.some(p => p.BaseClass === cls.BaseClass)) continue // no same-base pair
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

/**
 * Equip a shortlisted item into an EMPTY gear slot.
 *
 * Same contract as every other domain: additions only. A slot the user has
 * already filled is never re-equipped, so the optimizer cannot quietly throw
 * away a chosen item.
 *
 * The off-hand needs no special-casing here — the stat engine applies V2's
 * `EquippedGear::SetItem` rule and ignores an off-hand item whenever the
 * main-hand weapon forbids one, so such a move simply scores no gain.
 */
export function gearMoves(ctx: MoveContext): Move[] {
  const out: Move[] = []
  for (const [slot, items] of Object.entries(ctx.gearCandidates ?? {})) {
    if (ctx.build.gear?.[slot]) continue
    for (const item of items) out.push({ kind: 'gear', slot, itemName: item.Name })
  }
  return out
}

/** Augment colours the item's own slots ask for, keyed the way the UI keys them. */
function augmentKey(slot: string, augType: string, index: number): string {
  return `${slot}:${augType}:${index}`
}

/**
 * Slot an augment into an EMPTY augment slot on an equipped item.
 *
 * Slots whose augment is fixed by the item (`ItemAugment.Augment`) are not
 * choices and are skipped, as are slots the user has already filled.
 * Candidates are capped to the host item's level, mirroring the gear panel's
 * own picker (GearPanel `maxItemLevel`).
 */
export function augmentMoves(ctx: MoveContext): Move[] {
  const { build } = ctx
  const out: Move[] = []
  for (const [slot, item] of Object.entries(ctx.gearItems ?? {})) {
    if (!item) continue
    const itemLevel = Number(item.MinLevel ?? 0)
    for (const { augment, index } of resolveAugmentSlots(item, slot, build.slotUpgradeChoices ?? {})) {
      if (augment.Augment) continue                              // fixed by the item
      const key = augmentKey(slot, augment.Type, index)
      if (build.augmentChoices?.[key]) continue                  // already chosen
      for (const cand of ctx.augmentCandidates?.[augment.Type] ?? []) {
        if (Number(cand.MinLevel ?? 1) > itemLevel) continue
        out.push({ kind: 'augment', slot, augType: augment.Type, index, augmentName: cand.Name })
      }
    }
  }
  return out
}

/**
 * Choose the colour of an item's one-time augment-slot upgrade.
 *
 * V2 makes this irreversible the moment it is picked (SET_SLOT_UPGRADE
 * mirrors that), so it is a genuine addition: it can only ever open a slot
 * that was not there before. The augment domain fills the new slot on a
 * later round.
 */
export function slotUpgradeMoves(ctx: MoveContext): Move[] {
  const { build } = ctx
  const out: Move[] = []
  for (const [slot, item] of Object.entries(ctx.gearItems ?? {})) {
    if (!item) continue
    for (const pending of pendingSlotUpgrades(item, slot, build.slotUpgradeChoices ?? {})) {
      for (const color of pending.options) {
        out.push({
          kind: 'slotUpgrade', slot, upgradeType: pending.upgrade.Type,
          index: pending.index, color,
        })
      }
    }
  }
  return out
}

/**
 * Slot a filigree into an EMPTY filigree slot.
 *
 * A filigree already slotted elsewhere is not offered again: the same
 * filigree in several slots would multiply its set-bonus count, which no
 * real sentient weapon can do. Artifact slots are only offered when the
 * build has a Minor Artifact equipped — without one the stat engine ignores
 * them entirely (EquippedGear::HasMinorArtifact).
 */
export function filigreeMoves(ctx: MoveContext): Move[] {
  const { build } = ctx
  const candidates = ctx.filigreeCandidates ?? []
  if (candidates.length === 0) return []
  const used = new Set<string>()
  for (const s of [...(build.filigreeSlots ?? []), ...(build.artifactFiligreeSlots ?? [])]) {
    if (s?.name) used.add(s.name)
  }
  const hasMinorArtifact = Object.values(ctx.gearItems ?? {}).some(i => i && 'MinorArtifact' in i)

  const out: Move[] = []
  const offer = (artifact: boolean, slots: CharacterBuild['filigreeSlots']) => {
    slots?.forEach((slotEntry, slotIndex) => {
      if (slotEntry?.name) return
      for (const f of candidates) {
        if (used.has(f.Name)) continue
        out.push({ kind: 'filigree', artifact, slotIndex, filigreeName: f.Name })
      }
    })
  }
  offer(false, build.filigreeSlots)
  if (hasMinorArtifact) offer(true, build.artifactFiligreeSlots)
  return out
}

export function generateMoves(ctx: MoveContext, domains: MoveDomains): Move[] {
  const out: Move[] = []
  if (domains.enhancements) out.push(...enhancementMoves(ctx))
  if (domains.destinies) out.push(...destinyMoves(ctx))
  if (domains.feats) out.push(...featMoves(ctx))
  if (domains.classLevels) out.push(...classLevelMoves(ctx), ...levelProgressMoves(ctx))
  if (domains.abilityLevelUps) out.push(...abilityLevelUpMoves(ctx))
  if (domains.gear) out.push(...gearMoves(ctx))
  if (domains.augments) out.push(...augmentMoves(ctx))
  if (domains.slotUpgrades) out.push(...slotUpgradeMoves(ctx))
  if (domains.filigrees) out.push(...filigreeMoves(ctx))
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
    case 'gear':
      return { ...build, gear: { ...build.gear, [m.slot]: m.itemName } }
    case 'augment':
      return {
        ...build,
        augmentChoices: {
          ...build.augmentChoices,
          [augmentKey(m.slot, m.augType, m.index)]: m.augmentName,
        },
      }
    case 'slotUpgrade':
      return {
        ...build,
        slotUpgradeChoices: {
          ...build.slotUpgradeChoices,
          [slotUpgradeKey(m.slot, m.upgradeType, m.index)]: m.color,
        },
      }
    case 'filigree': {
      const field = m.artifact ? 'artifactFiligreeSlots' : 'filigreeSlots'
      const slots = [...(build[field] ?? [])]
      slots[m.slotIndex] = { ...(slots[m.slotIndex] ?? { name: '', rare: false }), name: m.filigreeName }
      return { ...build, [field]: slots } as CharacterBuild
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
