// Random-build parity fuzzer core (V2 vs V3).
//
// Generates a LEGAL random level-20 heroic build: 1–3 classes with a random
// per-level order, a random 28-point ability buy, random ability level-ups,
// feat slots filled through the SAME eligibility engine the UI uses
// (lib/featEligibility), enhancement AP spent through the SAME rules TreeGrid
// enforces (tier MinSpent gates, per-rank costs, core sequencing, per-item
// Requirements, single Tier-5 tree, selector choices), and random gear per
// inventory slot. The result exports as a V2 .DDOBuild so V2 (on Windows)
// can open it and its BreakdownsPane numbers can be captured as a golden
// file for lib/goldenCompare.
//
// Deterministic: same seed + same catalogues → same build.

import type {
  CharacterBuild, DDOClass, EnhancementSelection, EnhancementTree,
  EnhancementTreeItem, Feat, Item, Race, Ability,
} from '../../types/ddo'
import { emptyBuild, POINT_BUY_COSTS } from '../../types/ddo'
import { buildSlots } from '../levelTraining'
import { featOptionsForSlot } from '../featEligibility'
import { meetsRequirements } from '../requirements'
import { enhancementAPBudget } from '../actionPoints'

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// Catalogue subset the generator needs
// ---------------------------------------------------------------------------

export interface FuzzCatalogues {
  allRaces: Race[]
  allClasses: DDOClass[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]
  allItems: Item[]
}

export interface FuzzResult {
  build: CharacterBuild
  /** Human-readable decisions, for debugging a mismatch. */
  log: string[]
}

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

// ---------------------------------------------------------------------------
// Tree helpers (mirror EnhancementTreePanel / TreeGrid rules)
// ---------------------------------------------------------------------------

function treeMatchesName(treeName: string, name: string): boolean {
  if (!name) return false
  const t = treeName.toLowerCase()
  const n = name.toLowerCase()
  return t.includes(n) || n.includes(t)
}

function treeRequiredClass(tree: EnhancementTree): string | null {
  const reqs = tree.Requirements
  if (!reqs?.Requirement) return null
  const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
  for (const req of list) {
    if (req.Type === 'Class' || req.Type === 'BaseClass') {
      return Array.isArray(req.Item) ? req.Item[0] : req.Item ?? null
    }
  }
  return null
}

function isEnhancementTree(tree: EnhancementTree): boolean {
  return tree.IsReaperTree !== true && tree.IsEpicDestiny !== true
}

function isUniversalTree(tree: EnhancementTree): boolean {
  return tree.IsUniversalTree === true || (!tree.IsRacialTree && !tree.Requirements)
}

/** Trees this build may spend in — same rules as EnhancementTreePanel. */
export function accessibleTrees(cat: FuzzCatalogues, build: CharacterBuild): EnhancementTree[] {
  const classNames = build.classes.map(c => c.name).filter(Boolean)
  return cat.allTrees.filter(isEnhancementTree).filter(tree => {
    if (tree.IsRacialTree) return build.race ? treeMatchesName(tree.Name, build.race) : false
    if (isUniversalTree(tree)) return true
    if (classNames.some(cn => treeMatchesName(tree.Name, cn))) return true
    const req = treeRequiredClass(tree)
    if (req) return classNames.some(cn => cn === req)
    return false
  })
}

function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw || '1'
  if (typeof raw === 'object' && !Array.isArray(raw) && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    if (t != null) return String(t) || '1'
  }
  return '1'
}

function parseCosts(costPerRank: unknown, maxRanks: number): number[] {
  const str = normalizeCostPerRank(costPerRank)
  const parts = str.trim().split(/\s+/).map(Number).filter(isFinite)
  if (parts.length === 0) return Array(maxRanks).fill(1)
  if (parts.length === 1) return Array(maxRanks).fill(parts[0])
  const out: number[] = []
  for (let i = 0; i < maxRanks; i++) out.push(parts[i] ?? parts[parts.length - 1])
  return out
}

export function costUpToRank(item: EnhancementTreeItem, targetRank: number): number {
  const costs = parseCosts(item.CostPerRank, item.Ranks ?? 1)
  return costs.slice(0, targetRank).reduce((a, b) => a + b, 0)
}

export function nextRankCost(item: EnhancementTreeItem, currentRank: number): number {
  const costs = parseCosts(item.CostPerRank, item.Ranks ?? 1)
  return costs[currentRank] ?? 1
}

export function itemKey(item: EnhancementTreeItem): string {
  return item.InternalName ?? item.Name
}

function selectorOptions(item: EnhancementTreeItem): EnhancementSelection[] {
  if (!item.Selector || item.Selector.length === 0) return []
  const raw = item.Selector[0].EnhancementSelection
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

const CORE_Y = 0

export function treeSpent(tree: EnhancementTree, choices: Record<string, number>): number {
  return (tree.EnhancementTreeItem ?? []).reduce(
    (sum, item) => sum + costUpToRank(item, choices[itemKey(item)] ?? choices[item.Name] ?? 0),
    0,
  )
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

export interface FuzzOptions {
  seed: number
  /** Character level (heroic only, 1–20). Default 20. */
  level?: number
  /** Max enhancement-purchase attempts (safety valve). Default 400. */
  maxBuyAttempts?: number
}

export function generateRandomBuild(cat: FuzzCatalogues, opts: FuzzOptions): FuzzResult {
  const rng = mulberry32(opts.seed)
  const level = Math.min(20, Math.max(1, opts.level ?? 20))
  const log: string[] = [`seed ${opts.seed}, level ${level}`]

  const build = emptyBuild()
  build.totalLevel = level
  build.epicLevels = 0
  build.legendaryLevels = 0

  // ── Race ────────────────────────────────────────────────────────────────
  // Heroic, non-iconic races only (iconics start at level 15 with a fixed
  // class — a separate fuzz dimension).
  const races = cat.allRaces.filter(r => !r.NotHeroic && !r.IsIconic)
  const race = pick(rng, races)
  build.race = race.Name
  log.push(`race ${race.Name}`)

  // ── Classes: 1–3 heroic classes, random split, random per-level order ───
  // Excludes the V2 "Unknown" placeholder. DDO archetype rules: an archetype
  // (class with <BaseClass>) cannot multiclass with its own base class or
  // another archetype of the same base — archetypes of different bases mix
  // freely, each counting as one of the 3 classes.
  const heroicClasses = cat.allClasses.filter(c => !c.NotHeroic && c.Name !== 'Unknown')
  const classCount = 1 + Math.floor(rng() * 3)
  const chosen: DDOClass[] = []
  for (const c of shuffle(rng, heroicClasses)) {
    if (chosen.length >= classCount) break
    if (c.BaseClass && chosen.some(x => x.Name === c.BaseClass)) continue // not with its base
    if (c.BaseClass && chosen.some(x => x.BaseClass === c.BaseClass)) continue // no same-base pair
    if (chosen.some(x => x.BaseClass === c.Name)) continue               // base not with its archetype
    chosen.push(c)
  }
  // Random split of `level` into classCount parts, each ≥ 1.
  const splits: number[] = Array(classCount).fill(1)
  for (let i = classCount; i < level; i++) splits[Math.floor(rng() * classCount)]++
  build.classes = [
    { name: chosen[0]?.Name ?? '', levels: splits[0] ?? 0 },
    { name: chosen[1]?.Name ?? '', levels: splits[1] ?? 0 },
    { name: chosen[2]?.Name ?? '', levels: splits[2] ?? 0 },
  ]
  // Per-level order: first level of the primary class first (V2 requires a
  // class at level 1), then shuffle the rest.
  const pool: string[] = []
  chosen.forEach((c, i) => { for (let k = 0; k < splits[i]; k++) pool.push(c.Name) })
  const first = pool.indexOf(chosen[0].Name)
  pool.splice(first, 1)
  build.levelClasses = [chosen[0].Name, ...shuffle(rng, pool)]
  log.push(`classes ${chosen.map((c, i) => `${c.Name} ${splits[i]}`).join(' / ')}`)

  // ── Abilities: random legal 28-point buy ────────────────────────────────
  const base: Record<Ability, number> = {
    Strength: 8, Dexterity: 8, Constitution: 8, Intelligence: 8, Wisdom: 8, Charisma: 8,
  }
  let points = 28
  for (let guard = 0; guard < 500 && points > 0; guard++) {
    const ab = pick(rng, ABILITIES)
    const next = base[ab] + 1
    if (next > 18) continue
    const cost = (POINT_BUY_COSTS[next] ?? 99) - (POINT_BUY_COSTS[base[ab]] ?? 0)
    if (cost > points) continue
    base[ab] = next
    points -= cost
  }
  build.baseAbilities = { ...base }
  log.push(`abilities ${ABILITIES.map(a => `${a.slice(0, 3)} ${base[a]}`).join(', ')} (${28 - points}/28 pts)`)

  // ── Ability level-ups (levels 4, 8, …) ──────────────────────────────────
  build.abilityLevelUps = {}
  for (const lvl of [4, 8, 12, 16, 20] as const) {
    if (lvl <= level) build.abilityLevelUps[lvl] = pick(rng, ABILITIES)
  }

  // ── Feats: fill every slot through the UI's eligibility engine ──────────
  build.featChoices = {}
  const slots = buildSlots(build, cat.allClasses, cat.allRaces)
    .filter(s => s.level <= level)
    .sort((a, b) => a.level - b.level)
  for (const slot of slots) {
    const options = featOptionsForSlot(slot, slots, cat.allFeats, build, cat.allClasses, race)
      .filter(o => o.prereqsMet)
    if (options.length === 0) {
      log.push(`slot ${slot.key}: no eligible feats — left empty`)
      continue
    }
    const featPick = pick(rng, options).feat
    build.featChoices[slot.key] = featPick.Name
    log.push(`slot ${slot.key}: ${featPick.Name}`)
  }

  // ── Enhancements: random legal AP spend across accessible trees ─────────
  build.enhancementChoices = {}
  build.enhancementSelections = {}
  const budget = enhancementAPBudget(build, cat.allFeats)
  const trees = accessibleTrees(cat, build)
  build.enhancementPinned = trees.slice(0, 7).map(t => t.Name)
  let spentTotal = 0
  let tier5Tree: string | null = null
  const maxAttempts = opts.maxBuyAttempts ?? 400
  for (let attempt = 0; attempt < maxAttempts && spentTotal < budget; attempt++) {
    const tree = pick(rng, trees)
    const items = tree.EnhancementTreeItem ?? []
    if (items.length === 0) continue
    const choices = build.enhancementChoices[tree.Name] ?? {}
    const spentHere = treeSpent(tree, choices)
    const coreItems = items
      .filter(it => (it.YPosition ?? 0) === CORE_Y)
      .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))

    // All items purchasable RIGHT NOW under TreeGrid's exact gates.
    const purchasable = items.filter(item => {
      const rank = choices[itemKey(item)] ?? 0
      if (rank >= (item.Ranks ?? 1)) return false
      if (spentHere < (item.MinSpent ?? 0)) return false
      if (spentTotal + nextRankCost(item, rank) > budget) return false
      if ((item.YPosition ?? 0) === CORE_Y) {
        const idx = coreItems.findIndex(c => c.Name === item.Name)
        if (idx > 0) {
          const prev = coreItems[idx - 1]
          if ((choices[itemKey(prev)] ?? 0) < (prev.Ranks ?? 1)) return false
        }
      }
      if (item.Tier5 === true && tier5Tree && tier5Tree !== tree.Name) return false
      if (!meetsRequirements(item.Requirements, { build, allClasses: cat.allClasses, race })) return false
      return true
    })
    if (purchasable.length === 0) continue

    const item = pick(rng, purchasable)
    const key = itemKey(item)
    const rank = choices[key] ?? 0
    const opt = selectorOptions(item)
    if (opt.length > 0 && !(build.enhancementSelections[tree.Name]?.[key])) {
      const sel = pick(rng, opt)
      build.enhancementSelections[tree.Name] = {
        ...(build.enhancementSelections[tree.Name] ?? {}),
        [key]: sel.Name,
      }
    }
    build.enhancementChoices[tree.Name] = { ...choices, [key]: rank + 1 }
    spentTotal += nextRankCost(item, rank)
    if (item.Tier5 === true) tier5Tree = tree.Name
  }
  log.push(`enhancements: ${spentTotal}/${budget} AP across ${Object.keys(build.enhancementChoices).length} trees`)

  // ── Gear: random item per slot (MinLevel ≤ character level) ─────────────
  const SLOT_TO_EQUIP: Record<string, string> = {
    Helmet: 'Helmet', Necklace: 'Necklace', Trinket: 'Trinket', Armor: 'Armor',
    Cloak: 'Cloak', Belt: 'Belt', Ring: 'Ring', Ring2: 'Ring',
    Gloves: 'Gloves', Bracers: 'Bracers', Boots: 'Boots', Goggles: 'Goggles',
    'Main Hand': 'Weapon1',
  }
  build.gear = {}
  for (const [slot, equipKey] of Object.entries(SLOT_TO_EQUIP)) {
    const candidates = cat.allItems.filter(i =>
      i.EquipmentSlot && equipKey in i.EquipmentSlot
      && (Number(i.MinLevel ?? 0) <= level)
      && i.Name !== build.gear['Ring'])   // no duplicate ring item in both slots
    if (candidates.length === 0) continue
    const item = pick(rng, candidates)
    build.gear[slot] = item.Name
    log.push(`gear ${slot}: ${item.Name}`)
  }

  build.name = `Fuzz ${opts.seed} (${chosen.map((c, i) => `${c.Name.slice(0, 3)}${splits[i]}`).join('/')})`
  build.id = `fuzz-${opts.seed}`   // deterministic: same seed → identical build object
  return { build, log }
}

// ---------------------------------------------------------------------------
// Validator — replays every rule independently; returns human-readable
// violations (empty array = legal build). Used by tests and `compare`.
// ---------------------------------------------------------------------------

export function validateBuild(cat: FuzzCatalogues, build: CharacterBuild): string[] {
  const problems: string[] = []
  const race = cat.allRaces.find(r => r.Name === build.race)

  // Class legality: no Unknown, archetype never with its own base class or
  // with another archetype of the same base (different bases mix freely).
  const chosenClasses = build.classes
    .filter(c => c.name && c.levels > 0)
    .map(c => cat.allClasses.find(x => x.Name === c.name))
  if (build.classes.some(c => c.name === 'Unknown' && c.levels > 0)) {
    problems.push('class "Unknown" trained')
  }
  const archetypes = chosenClasses.filter(c => c?.BaseClass)
  const byBase = new Map<string, string[]>()
  for (const a of archetypes) {
    if (!a?.BaseClass) continue
    byBase.set(a.BaseClass, [...(byBase.get(a.BaseClass) ?? []), a.Name])
  }
  for (const [base, names] of byBase) {
    if (names.length > 1) {
      problems.push(`multiple archetypes of ${base}: ${names.join(', ')}`)
    }
  }
  for (const a of archetypes) {
    if (chosenClasses.some(c => c?.Name === a?.BaseClass)) {
      problems.push(`archetype ${a?.Name} multiclassed with its base class ${a?.BaseClass}`)
    }
  }

  // Feats: every chosen feat must be an eligible, prereq-met option for its slot.
  const slots = buildSlots(build, cat.allClasses, cat.allRaces)
  for (const [key, chosen] of Object.entries(build.featChoices)) {
    if (!chosen) continue
    const slot = slots.find(s => s.key === key)
    if (!slot) { problems.push(`feat slot ${key}: slot does not exist`); continue }
    const options = featOptionsForSlot(slot, slots, cat.allFeats, build, cat.allClasses, race)
    const found = options.find(o => o.feat.Name === chosen)
    if (!found) problems.push(`feat slot ${key}: "${chosen}" is not an offered option`)
    else if (!found.prereqsMet) problems.push(`feat slot ${key}: "${chosen}" prerequisites not met`)
  }

  // Enhancements: replay every tree's spend.
  const budget = enhancementAPBudget(build, cat.allFeats)
  const okTrees = new Set(accessibleTrees(cat, build).map(t => t.Name))
  let total = 0
  let tier5Trees = new Set<string>()
  for (const [treeName, choices] of Object.entries(build.enhancementChoices)) {
    if (Object.keys(choices).length === 0) continue
    if (!okTrees.has(treeName)) { problems.push(`tree ${treeName}: not accessible to this build`); continue }
    const tree = cat.allTrees.find(t => t.Name === treeName)!
    const items = tree.EnhancementTreeItem ?? []
    const spentHere = treeSpent(tree, choices)
    total += spentHere
    for (const [key, rank] of Object.entries(choices)) {
      const item = items.find(it => itemKey(it) === key || it.Name === key)
      if (!item) { problems.push(`tree ${treeName}: unknown item "${key}"`); continue }
      if (rank > (item.Ranks ?? 1)) problems.push(`tree ${treeName}/${key}: rank ${rank} > max ${item.Ranks ?? 1}`)
      // MinSpent gate: spend in tree EXCLUDING this item must reach MinSpent
      // (the item was bought when treeSpent-without-it ≥ MinSpent).
      const without = spentHere - costUpToRank(item, rank)
      if ((item.MinSpent ?? 0) > 0 && without < (item.MinSpent ?? 0)) {
        problems.push(`tree ${treeName}/${key}: MinSpent ${item.MinSpent} not met (${without} AP below it)`)
      }
      if (!meetsRequirements(item.Requirements, { build, allClasses: cat.allClasses, race })) {
        problems.push(`tree ${treeName}/${key}: item Requirements not met`)
      }
      if (item.Tier5 === true) tier5Trees.add(treeName)
      const opts = selectorOptions(item)
      if (opts.length > 0 && !(build.enhancementSelections[treeName]?.[key])) {
        problems.push(`tree ${treeName}/${key}: selector item has no selection`)
      }
    }
  }
  if (total > budget) problems.push(`AP overspent: ${total} > budget ${budget}`)
  if (tier5Trees.size > 1) problems.push(`Tier-5 in multiple trees: ${[...tier5Trees].join(', ')}`)

  // Gear: item exists, slot matches, level legal.
  for (const [slot, name] of Object.entries(build.gear)) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (!item) { problems.push(`gear ${slot}: unknown item "${name}"`); continue }
    if (Number(item.MinLevel ?? 0) > build.totalLevel) {
      problems.push(`gear ${slot}: "${name}" MinLevel ${item.MinLevel} > level ${build.totalLevel}`)
    }
  }

  return problems
}
