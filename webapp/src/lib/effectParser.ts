// DDO Effect / ItemBuff → RawBonus converter
//
// Converts parsed XML Effect objects and ItemBuff objects into ParsedBonus
// entries for specific stat keys. Stat keys are flat dot-separated strings
// (e.g. "ability.Strength", "save.Fort", "skill.Heal", "sp.Fire", …).

import type { Effect, ItemBuff, Requirements, Requirement } from '../types/ddo'
import { SKILLS } from './gamedata'

// The six ability scores — used to expand Item="All" ability effects (V2 applies
// an AbilityBonus with ability "All" to every ability, e.g. Completionist +2).
const ALL_ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const

/** Expands an ability item list, turning "All" into the six ability names. */
function expandAbilityItems(items: string[]): string[] {
  return items.flatMap(it => (it === 'All' ? [...ALL_ABILITIES] : [it]))
}

/**
 * Expands SkillBonusAbility items (ability names) to the skill names governed
 * by that ability (V2 BreakdownItemSkill: adds Amount to every skill whose
 * governing ability matches the effect's Item field).
 */
function expandSkillsByAbility(items: string[]): string[] {
  return items.flatMap(it =>
    it === 'All'
      ? SKILLS.map(s => s.name)
      : SKILLS.filter(s => s.ability === it).map(s => s.name),
  )
}

// ---------------------------------------------------------------------------
// EffectContext: evaluated build state used to gate effects
// ---------------------------------------------------------------------------

export interface EffectContext {
  race: string
  alignment: string
  classLevels: Record<string, number>       // exact class → levels
  baseClassLevels: Record<string, number>   // base class (incl. derived) → total levels
  totalLevel: number
  feats: Set<string>                        // trained feats (player + auto + race)
  enhancements: Set<string>                 // trained enhancement item names
  abilityTotals: Record<string, number>     // ability → score (base+race+levelup)
  stances: Set<string>                      // active stances (Cloth Armor, Tower Shield, …)
  bab: number
  weaponTypes: Set<string>                  // currently equipped weapon types
  // Optional fields used by AType resolution and weapon-class requirements.
  // Older callers that don't populate these get conservative fallbacks.
  featCounts?: Record<string, number>       // feat → number of times trained
  enhancementSelections?: Record<string, string> // tree item → chosen selector option
  setBonusCounts?: Record<string, number>   // set bonus name → equipped tier count
  sliderValues?: Record<string, number>     // slider name → current value
  weaponClassMain?: Set<string>             // main-hand weapon class memberships
  weaponClassOffhand?: Set<string>          // off-hand weapon class memberships
  materialBySlot?: Record<string, string>   // V2 slot name (Weapon1, …) → equipped item Material
  skillTotals?: Record<string, number>      // skill → resolved total (fixed-point pass 2+)
  casterLevels?: Record<string, number>     // class → bonus caster levels from cl.* effects (fixed-point pass 2+)
}

// ---------------------------------------------------------------------------
// Requirements evaluator
// ---------------------------------------------------------------------------

function reqList(r: Requirement | Requirement[] | undefined): Requirement[] {
  if (!r) return []
  return Array.isArray(r) ? r : [r]
}

function items(req: Requirement): string[] {
  if (!req.Item) return []
  return Array.isArray(req.Item) ? req.Item : [req.Item]
}

/** Checks a single Requirement against a build context. */
function checkRequirement(req: Requirement, ctx: EffectContext): boolean {
  const its = items(req)
  const v = req.Value ?? 0
  switch (req.Type) {
    case 'Stance':
      return its.length === 0 || its.some(i => ctx.stances.has(i))
    case 'Race':
      return its.some(i => ctx.race === i)
    case 'NotConstruct':
      return !(ctx.race === 'Warforged' || ctx.race === 'Bladeforged')
    case 'RaceConstruct':
      return ctx.race === 'Warforged' || ctx.race === 'Bladeforged'
    case 'Class':
      return its.some(i => (ctx.classLevels[i] ?? 0) > 0)
    case 'BaseClass':
      return its.some(i => (ctx.baseClassLevels[i] ?? 0) > 0)
    case 'ClassMinLevel':
      return its.some(i => (ctx.classLevels[i] ?? 0) >= v)
    case 'ClassAtLevel':
      return its.some(i => (ctx.classLevels[i] ?? 0) === v)
    case 'BaseClassMinLevel':
      return its.some(i => (ctx.baseClassLevels[i] ?? 0) >= v)
    case 'BaseClassAtLevel':
      return its.some(i => (ctx.baseClassLevels[i] ?? 0) === v)
    case 'Level':
    case 'SpecificLevel':
      return ctx.totalLevel >= v
    case 'Feat':
    case 'FeatAnySource':
      return its.some(i => ctx.feats.has(i))
    case 'Enhancement':
      // V2 Requirement.cpp:839-855 EvaluateEnhancement: with two Items it is
      // build.IsTrained(Item[0], Item[1]) — the tree item must be trained AND
      // Item[1] must be the chosen selector option, not "either is trained".
      if (its.length >= 2 && ctx.enhancementSelections) {
        return ctx.enhancements.has(its[0]) && ctx.enhancementSelections[its[0]] === its[1]
      }
      return its.some(i => ctx.enhancements.has(i))
    case 'Ability':
      return its.some(i => (ctx.abilityTotals[i] ?? 0) >= v)
    case 'AbilityGreaterCondition':
      // Item[0] > Item[1]
      if (its.length < 2) return false
      return (ctx.abilityTotals[its[0]] ?? 0) > (ctx.abilityTotals[its[1]] ?? 0)
    case 'BAB':
      return ctx.bab >= v
    case 'Alignment':
      return its.some(i => ctx.alignment === i)
    case 'AlignmentType': {
      // Lawful/Chaotic/Good/Evil/Neutral type-axis match
      if (its.length === 0) return true
      const a = ctx.alignment
      return its.some(i => a.includes(i))
    }
    case 'WeaponTypesEquipped':
      return its.some(i => ctx.weaponTypes.has(i))
    case 'WeaponClassMainHand':
      // Conservative pass when caller hasn't populated weaponClassMain.
      if (!ctx.weaponClassMain) return true
      return its.some(i => ctx.weaponClassMain!.has(i))
    case 'WeaponClassOffHand':
      if (!ctx.weaponClassOffhand) return true
      return its.some(i => ctx.weaponClassOffhand!.has(i))
    case 'Skill':
      // V2 Requirement::EvaluateSkill (Requirement.cpp:1040-1048):
      // SkillAtLevel ≥ Value. Resolved totals arrive via the fixed-point
      // wrapper (pass 2+); conservative pass until then / for older callers.
      if (!ctx.skillTotals) return true
      return (ctx.skillTotals[its[0]] ?? 0) >= (req.Value ?? 0)
    case 'EnemyType':
      // V2 Requirement.cpp:467/513: `case Requirement_EnemyType: met = false`.
      // Favored-enemy-style effects NEVER apply inside the planner.
      return false
    case 'MaterialType': {
      // V2 Requirement::EvaluateMaterialType (Requirement.cpp:1083-1100):
      // Item = [material, V2 slot name]; met when the equipped item in that
      // slot has exactly that Material. Conservative pass when the caller
      // does not supply gear materials.
      if (!ctx.materialBySlot) return true
      if (its.length < 2) return false
      return ctx.materialBySlot[its[1]] === its[0]
    }
    case 'GroupMember':
    case 'GroupMember2':
    case 'StartingWorld':
    case 'ItemTypeInSlot':
    case 'ItemSlot':
    case 'Exclusive':
      // Not gated client-side; always pass.
      return true
    default:
      // Unknown requirement → conservative pass
      return true
  }
}

/** V2 Requirements::Met — top-level Requirements are AND'd; OneOf is OR; NoneOf is NOR. */
export function requirementsMet(reqs: Requirements | undefined, ctx: EffectContext): boolean {
  if (!reqs) return true

  for (const r of reqList(reqs.Requirement)) {
    if (!checkRequirement(r, ctx)) return false
  }
  const oneOfGroups = reqs.RequiresOneOf
    ? (Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf])
    : []
  for (const g of oneOfGroups) {
    const list = reqList(g.Requirement)
    if (list.length === 0) continue
    if (!list.some(r => checkRequirement(r, ctx))) return false
  }
  const noneOfGroups = reqs.RequiresNoneOf
    ? (Array.isArray(reqs.RequiresNoneOf) ? reqs.RequiresNoneOf : [reqs.RequiresNoneOf])
    : []
  for (const g of noneOfGroups) {
    const list = reqList(g.Requirement)
    if (list.some(r => checkRequirement(r, ctx))) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Re-export (useful for callers)
// ---------------------------------------------------------------------------
export type { RawBonus } from './bonus'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ParsedBonus {
  statKey: string
  value: number
  bonusType: string  // from Effect.Bonus or ItemBuff.BonusType
  source: string
  // V2 <Percent/> flag: the value is a percentage of the stat's base total
  // (BreakdownItem::DoPercentageEffects), not a flat amount.
  percent?: boolean
  // V2 <ApplyAsItemEffect/> flag: the effect joins m_itemEffects, whose bonus
  // types obey gear-style "Highest Only" stacking (BreakdownItem.cpp:623-698).
  asItemEffect?: boolean
  // V2 stack-merge identity (see RawBonus.stackGroup in bonus.ts).
  stackGroup?: string
  stackAmounts?: number[]
}

/**
 * True when a boolean-flag XML element is present. Self-closing elements
 * (`<Percent />`, `<ApplyAsItemEffect />`) parse to "" via fast-xml-parser,
 * while unit-test fixtures write literal `true` — both count as set.
 */
export function flagSet(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false
}

// ---------------------------------------------------------------------------
// Amount parsing helpers
// ---------------------------------------------------------------------------

/**
 * Coerces the raw Amount field (which fast-xml-parser may have produced as a
 * number, space-separated string, object with '#text', or array) into a flat
 * number[].
 */
export function parseAmount(raw: unknown): number[] {
  if (raw === undefined || raw === null) {
    return []
  }

  // Scalar number
  if (typeof raw === 'number') {
    return [raw]
  }

  // Plain string: space-separated numbers
  if (typeof raw === 'string') {
    return raw
      .trim()
      .split(/\s+/)
      .filter(s => s.length > 0)
      .map(s => parseFloat(s))
      .filter(n => !isNaN(n))
  }

  // Object with '#text' key (fast-xml-parser attribute-bearing text node)
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    const text = obj['#text']
    if (text !== undefined) {
      return parseAmount(text)
    }
    return []
  }

  // Array: recurse to flatten
  if (Array.isArray(raw)) {
    return (raw as unknown[]).flatMap(item => parseAmount(item))
  }

  return []
}

/**
 * Returns the Amount value at the given 1-based rank, clamped to array bounds.
 * Returns 0 if the amount array is empty.
 */
export function getAmountAtRank(raw: unknown, rank: number): number {
  const amounts = parseAmount(raw)
  if (amounts.length === 0) return 0
  const idx = Math.max(0, Math.min(rank - 1, amounts.length - 1))
  return amounts[idx]
}

// ---------------------------------------------------------------------------
// Spell element normalization
// ---------------------------------------------------------------------------

/**
 * Normalises a spell-element string to the canonical form used by the stat key
 * system (e.g. 'Light/Alignment' → 'LightAlignment').
 */
function normalizeSpellElement(raw: string): string {
  switch (raw) {
    case 'Alignment':
    case 'Light':
    case 'Light/Alignment':
      return 'LightAlignment'
    default:
      return raw
  }
}

// ---------------------------------------------------------------------------
// Item array helper
// ---------------------------------------------------------------------------

function toStringArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

// ---------------------------------------------------------------------------
// Stance-gated effect guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the effect has a Stance requirement, meaning it is
 * conditionally active only in a specific stance. These are toggled abilities
 * that must be excluded from passive stat totals.
 */
function hasStanceRequirement(effect: Effect): boolean {
  const reqs = effect.Requirements
  if (!reqs) return false

  const reqList = reqs.Requirement
  if (!reqList) return false

  const arr: { Type: string }[] = Array.isArray(reqList) ? reqList : [reqList]
  return arr.some(r => r.Type === 'Stance')
}

// ---------------------------------------------------------------------------
// AType → numeric value
// ---------------------------------------------------------------------------

function abilityModFromTotal(total: number): number {
  // V2: AbilityMod = (score - 10) / 2 floored, including for negatives.
  return Math.floor((total - 10) / 2)
}

function firstItem(effect: Effect): string | undefined {
  const it = effect.Item
  if (!it) return undefined
  if (Array.isArray(it)) return it[0]
  return it
}

/**
 * V2 ability-driven ATypes read the ability from StackSource (e.g. "Charisma"
 * or "SnapshotCharisma"); they fall back to Item only as a legacy convenience.
 * The "Snapshot" prefix is stripped — the stat planner has no temporal snapshot,
 * so the current ability total is the closest analogue (and far better than 0).
 */
function abilityFromEffect(effect: Effect): string | undefined {
  const raw = effect.StackSource ?? firstItem(effect)
  if (!raw) return undefined
  return raw.startsWith('Snapshot') ? raw.slice('Snapshot'.length) : raw
}

function effectHasCap(effect: Effect): boolean {
  return effect.Cap !== undefined && effect.Cap !== null
}

function effectCap(effect: Effect): number {
  const n = Number(typeof effect.Cap === 'object' && effect.Cap !== null
    ? (effect.Cap as { '#text'?: unknown })['#text']
    : effect.Cap)
  return isNaN(n) ? Infinity : n
}

function resolveValue(
  effect: Effect,
  rank: number,
  classLevels: number,
  treeTotalAP: number,
  ctx?: EffectContext,
): number | null {
  const atype = effect.AType ?? 'Stacks'

  switch (atype) {
    // ---------------------------------------------------------------------
    // Non-numeric / informational ATypes — produce no flat value.
    // ---------------------------------------------------------------------
    case 'Unknown':
    case 'NotNeeded':
    case 'SpellInfo':
    case 'SLA':                     // SLA: caster level + charges + recharge — handled separately
    case 'Dice':                    // Damage dice — modeled by weapon breakdown
    case 'CriticalDice':            // Critical damage dice — modeled by weapon breakdown
    case 'Slider':                  // Slider definition — UI metadata, not a stat value
    case 'UserList':                // V3 legacy alias — selector requiring user input
      return null

    case 'Simple':
      // V2: m_Amount[0] * m_stacks
      return getAmountAtRank(effect.Amount, 1) * Math.max(1, rank)

    case 'ClassLevel':
    case 'BaseClassLevel':
    case 'ClassCasterLevel': {
      // V2 Effect.cpp:1214-1256: Amount is indexed by class level from StackSource,
      // i.e. Amount[classLevel]. For single-entry arrays this clamps to Amount[0].
      let level = classLevels
      if (ctx && effect.StackSource) {
        // A StackSource naming a class the character has 0 of contributes 0 —
        // fall back to 0, NOT the total character level (which over-scaled
        // Epic/Legendary-sourced effects on heroic builds, e.g. +40 HP each
        // from Stout of Heart's Epic/Legendary variants). V2 parity.
        level = atype === 'BaseClassLevel'
          ? (ctx.baseClassLevels[effect.StackSource] ?? 0)
          : (ctx.classLevels[effect.StackSource] ?? 0)
        // V2 Effect.cpp:1286-1313 — ClassCasterLevel reads the class's CASTER
        // LEVEL breakdown (class levels + CasterLevel effects incl. "All"),
        // not the raw class level. Only classes with actual levels get the
        // bonus (a 0-level class's spells stay inert).
        if (atype === 'ClassCasterLevel' && level > 0 && ctx.casterLevels) {
          level += (ctx.casterLevels[effect.StackSource] ?? 0) + (ctx.casterLevels['All'] ?? 0)
        }
      }
      return getAmountAtRank(effect.Amount, level + 1)
    }

    case 'TotalLevel': {
      // V2: m_Amount[totalLevel-1] * m_stacks (40-entry array indexed by char
      // level). m_stacks counts repeat acquisitions (Past Life ×3, Toughness
      // retrains) — V2 merges/sums them, so the table value multiplies by rank.
      const idx = Math.max(1, classLevels)
      return getAmountAtRank(effect.Amount, idx) * Math.max(1, rank)
    }

    case 'APCount': {
      const base = getAmountAtRank(effect.Amount, 1)
      return base * treeTotalAP
    }

    // ---------------------------------------------------------------------
    // Ability-driven amounts. V2 Effect.cpp:1316-1416 reads the ability from
    // StackSource (e.g. "Charisma" or "SnapshotCharisma") — NOT from Item, which
    // for these effects holds the targets (Trip/Sunder/…) — and returns the
    // ability total / mod directly, ignoring the Amount field. V3 previously
    // read Item[0] and multiplied by Amount[0], so effects with no Amount and a
    // StackSource ability (e.g. Warpriest Divine Might) resolved to 0.
    // ---------------------------------------------------------------------
    case 'AbilityValue':
    case 'AbilityTotal': {
      const ability = abilityFromEffect(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      return effectHasCap(effect) ? Math.min(total, effectCap(effect)) : total
    }

    case 'AbilityTotalIndex': {
      // V2: Amount[min(abilityTotal, size-1)]
      const ability = abilityFromEffect(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      const v = getAmountAtRank(effect.Amount, total + 1)
      return effectHasCap(effect) ? Math.min(v, effectCap(effect)) : v
    }

    case 'AbilityMod': {
      const ability = abilityFromEffect(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      return abilityModFromTotal(total)
    }

    case 'HalfAbilityMod': {
      const ability = abilityFromEffect(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      return Math.trunc(abilityModFromTotal(total) / 2)
    }

    case 'ThirdAbilityMod': {
      const ability = abilityFromEffect(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      return Math.trunc(abilityModFromTotal(total) / 3)
    }

    case 'BAB': {
      // V2 Effect.cpp:1161-1183: stacks = min(BAB, MAX_BAB=25); total = Amount[0] * stacks.
      const base = getAmountAtRank(effect.Amount, 1)
      const MAX_BAB = 25
      return base * Math.min(ctx?.bab ?? 0, MAX_BAB)
    }

    case 'FeatCount': {
      // V2 Effect.cpp:1417-1428: count = FeatTrainedCount(StackSource());
      // total = Amount[min(count, size-1)] * stacks. This is a VECTOR LOOKUP by
      // feat-trained count, not base*count. The feat name lives in StackSource
      // (Item is reserved for effect targets on most effect types).
      const feat = effect.StackSource ?? firstItem(effect)
      if (!feat) return 0
      const count =
        ctx?.featCounts?.[feat] ??
        (ctx?.feats.has(feat) ? 1 : 0)
      // count is a 0-based index into Amount[]; getAmountAtRank is 1-based → count+1.
      return getAmountAtRank(effect.Amount, count + 1) * Math.max(1, rank)
    }

    case 'SetBonusCount': {
      // V2 Effect.cpp:1258-1278: count = SetBonusCount(StackSource());
      // total = Amount[min(count, size-1)] * stacks. VECTOR LOOKUP by tier count,
      // not base*count. StackSource carries the set name.
      const setName = effect.StackSource ?? firstItem(effect)
      if (!setName) return 0
      const count = ctx?.setBonusCounts?.[setName] ?? 0
      // count is a 0-based index into Amount[]; getAmountAtRank is 1-based → count+1.
      return getAmountAtRank(effect.Amount, count + 1) * Math.max(1, rank)
    }

    case 'SliderValue': {
      // The slider name lives in StackSource (like SliderValueLookup); Item
      // holds the effect's TARGET (e.g. "Reflex" on Slippery Magic's
      // SaveBonus), so falling back to it is only for StackSource-less data.
      const sliderName = effect.StackSource ?? firstItem(effect)
      if (!sliderName) return 0
      const base = getAmountAtRank(effect.Amount, 1)
      const value = ctx?.sliderValues?.[sliderName] ?? 0
      return base * value
    }

    case 'SliderValueLookup': {
      // V2 PARITY (Effect.cpp:1448-1467): despite the AType name, V2 does NOT
      // index Amount[] by the slider value — it indexes by ClassLevels(StackSource):
      //   total = Amount[min(classLevels, size-1)] * stacks.
      // This looks like a V2 bug (the name implies a slider-value lookup), but we
      // replicate the actual V2 runtime behavior for faithful parity. StackSource
      // holds the class name here.
      const cls = effect.StackSource
      const classLevels = cls && ctx ? (ctx.classLevels[cls] ?? 0) : 0
      // classLevels is a 0-based index into Amount[]; getAmountAtRank is 1-based.
      return getAmountAtRank(effect.Amount, classLevels + 1) * Math.max(1, rank)
    }

    case 'Stacks':
    default:
      return getAmountAtRank(effect.Amount, rank)
  }
}

// ---------------------------------------------------------------------------
// Effect.Type → stat key(s) mapping
// ---------------------------------------------------------------------------

/**
 * Returns zero or more ParsedBonus entries for a single Effect at the
 * specified rank.
 *
 * @param effect      The Effect object from the XML data
 * @param rank        1-based rank / tier of the enhancement or feat
 * @param source      Human-readable label for the bonus source
 * @param classLevels Number of class levels (used for ClassLevel AType)
 * @param treeTotalAP Total AP spent in the tree (used for APCount AType)
 */
export function parseEffect(
  effect: Effect,
  rank: number,
  source: string,
  classLevels = 0,
  treeTotalAP = 0,
  ctx?: EffectContext,
): ParsedBonus[] {
  // V2 data uses multiple <Type> elements in a single <Effect> block to grant
  // two different bonus types from the same amount (e.g. ["PRR","MRR"],
  // ["MeleePower","RangedPower"]).  fast-xml-parser promotes duplicate child
  // elements to an array, so effect.Type may be string[] rather than string.
  // Expand by re-calling with each individual type.
  if (Array.isArray(effect.Type)) {
    // V2 applies one effect copy per <Type> element. DUPLICATE Type entries
    // are how the data expresses stack count — e.g. Fury of the Wild "Primal
    // Scream" declares <Type>AbilityBonus</Type> twice with AType=Stacks
    // Amount="0 2 4" → two merged stacks → Amount[1] = +2. Emit ONE copy per
    // Type element (NOT collapsed): AType=Stacks copies then share a stackGroup
    // and the buildStats stack-merge post-pass counts them → Amount[count-1];
    // non-Stacks copies (Simple, etc.) simply sum, matching V2's per-copy add.
    return (effect.Type as unknown as string[]).flatMap(t =>
      parseEffect({ ...effect, Type: t }, rank, source, classLevels, treeTotalAP, ctx),
    )
  }

  // V2 EnhancementTreeItem::GetEffects (EnhancementTreeItem.cpp:509-510):
  // an effect tagged <Rank> is only included when applying that specific
  // rank — Build::ApplyAllCurrentEffects loops rank 1..R, so the effect
  // fires exactly once, at/after the tagged rank, with a single stack.
  // It is never scaled by the trained rank count.
  if (typeof effect.Rank === 'number') {
    if (Math.max(1, rank) < effect.Rank) return []
    rank = 1
  }

  // V2 Effect::IsActive → Requirements::Met. Gate the effect entirely if any
  // top-level requirement, OneOf group, or NoneOf group fails.
  // When no ctx is supplied, fall back to the legacy stance-only check.
  if (ctx) {
    if (!requirementsMet(effect.Requirements, ctx)) return []
  } else {
    if (hasStanceRequirement(effect)) return []
  }

  const resolved = resolveValue(effect, rank, classLevels, treeTotalAP, ctx)

  // SaveBonusAbility has AType=NotNeeded so resolveValue returns null, but
  // it must still emit markers so Phase 2 in useBuildStats can substitute the
  // best-modifier ability for each save.
  // items = [abilityName, saveType, ...]: first item is the ability, the rest
  // are save types (matches V2 XML structure: <Item>Charisma</Item><Item>Will</Item>).
  if (effect.Type === 'SaveBonusAbility') {
    const its = toStringArray(effect.Item)
    if (its.length >= 2) {
      const ability = its[0]
      const saveTypes = its.slice(1)
      const bt = effect.Bonus ?? 'Enhancement'
      return saveTypes.flatMap(st => {
        if (st === 'All') {
          return (['Fort', 'Reflex', 'Will'] as const).map(k => ({
            statKey: `save.${k}.ability.${ability}`, value: 1, bonusType: bt, source,
          }))
        }
        const key = st === 'Fortitude' ? 'Fort' : st
        return [{ statKey: `save.${key}.ability.${ability}`, value: 1, bonusType: bt, source }]
      })
    }
    return []
  }

  // V2 parity: SpellLikeAbility effects register the SLA in CSLAControl
  // (SLAControl.cpp::AddSLA).  Emit a sla.<spellName> marker so buildStatMap
  // accumulates the full SLA list for the build (displayed in the SLA panel
  // and the forum export AddSLAs section).
  if (effect.Type === 'SpellLikeAbility') {
    const spellName = toStringArray(effect.Item)[0]
    if (!spellName || spellName === 'None') return []
    return [{ statKey: `sla.${spellName}`, value: 1, bonusType: 'SLA', source }]
  }

  // V2 parity: GrantFeat effects (Build::ApplyFeatEffects) cause V2 to look up
  // the feat and apply all of its effects to the build stats. Emit a
  // grantedFeat.<FeatName> marker so buildStatMap can collect them and apply the
  // feat's own effects in a post-pass. The optional <Rank> field gates the grant
  // to ranks ≥ that value (e.g. "Magical Training" only at rank 3 of
  // "Magical Studies"). AType is always NotNeeded (no Amount), so this must
  // fire before the `resolved === null` early-return below.
  if (effect.Type === 'GrantFeat') {
    // The <Rank> gate is handled centrally above (a tagged effect only
    // reaches here once the enhancement is trained to at least that rank).
    const featNames = toStringArray(effect.Item)
    return featNames
      .filter(n => n && n !== 'None')
      .map(n => ({ statKey: `grantedFeat.${n}`, value: 1, bonusType: 'GrantFeat', source }))
  }

  // Ability-substitution markers carry no Amount (AType NotNeeded) but must
  // still fire — they only signal an attack/damage ability CANDIDATE for the
  // wielded weapon (V2 LargestStatBonus, BreakdownItemWeaponAttackBonus.cpp
  // :327+). Gated on weapon type / weapon class like the rest of the family.
  if (effect.Type === 'Weapon_AttackAbility' || effect.Type === 'Weapon_DamageAbility'
      || effect.Type === 'WeaponAttackAbilityClass' || effect.Type === 'WeaponDamageAbilityClass') {
    const its = toStringArray(effect.Item)
    if (!ctx || its.length < 2) return []
    const byClass = effect.Type.endsWith('Class')
    const memberSet = byClass ? ctx.weaponClassMain : ctx.weaponTypes
    if (!memberSet || !its.slice(1).some(i => memberSet.has(i))) return []
    const kind = effect.Type.includes('Attack') ? 'attackAbility' : 'damageAbility'
    return [{ statKey: `melee.${kind}.${its[0]}`, value: 1, bonusType: effect.Bonus ?? 'Enhancement', source }]
  }

  if (resolved === null) {
    // Marker effects whose AType (NotNeeded / SpellInfo) yields no Amount but
    // which V2 still consumes: immunities and DR bypasses feed display
    // breakdowns (Breakdown_Immunities / the DR breakdown's bypass list);
    // GrantSpell / SpellListAddition add spells to a class's list
    // (SpellsControl). These previously died here and were silently dropped.
    const mits = toStringArray(effect.Item)
    const mbt = effect.Bonus ?? 'Enhancement'
    switch (effect.Type) {
      case 'Immunity':
        return mits.length > 0
          ? mits.map(i => ({ statKey: `immunity.${i}`, value: 1, bonusType: mbt, source }))
          : [{ statKey: 'immunity.All', value: 1, bonusType: mbt, source }]
      case 'DRBypass': {
        // Item = weapon scope (usually "All"); Value = the DR kind bypassed
        // (e.g. Adamantine).
        const kind = (effect as { Value?: string }).Value ?? mits[0] ?? 'Untyped'
        return [{ statKey: `drBypass.${kind}`, value: 1, bonusType: mbt, source }]
      }
      case 'GrantSpell':
      case 'SpellListAddition': {
        // Item = [spellName, className]; Amount = [spellLevel, cost, …].
        if (mits.length < 2) return []
        const amounts = String((effect.Amount as { '#text'?: unknown } | undefined)?.['#text'] ?? effect.Amount ?? '')
          .split(/\s+/).map(Number)
        const spellLevel = Number.isFinite(amounts[0]) ? amounts[0] : 1
        return [{ statKey: `grantSpell.${mits[1]}.${mits[0]}`, value: spellLevel, bonusType: mbt, source }]
      }
      default:
        return []
    }
  }
  const value: number = resolved

  const bonusType = effect.Bonus ?? 'Enhancement'
  const items = toStringArray(effect.Item)

  // V2 stack-merge (BreakdownItem::AddEffect + Amount_Stacks): identical
  // AType=Stacks effects merge into one whose value is Amount[count-1], not the
  // sum. Build the identity key from the fields Effect::operator== compares
  // (DisplayName, Type, Bonus, Item, Amount); only multi-element Amount tables
  // can differ by stack count, so single-value tables are left alone.
  // V2 merges by Effect::operator==, which compares DisplayName. The tiered
  // stance/stack pattern the merge exists for (monk forms, Primal Scream)
  // ALWAYS carries a DisplayName; anonymous effects that merely share
  // Type/Bonus/Item/Amount (many gear/set/reaper flat bonuses) must NOT be
  // collapsed — they sum. Require a non-empty DisplayName + multi-element table.
  const stacksAType = (effect.AType ?? 'Stacks') === 'Stacks'
  const displayName = typeof effect.DisplayName === 'string' ? effect.DisplayName.trim() : ''
  const stackAmounts = stacksAType ? parseAmount(effect.Amount) : undefined
  const stackGroupBase = (displayName !== '' && stackAmounts && stackAmounts.length > 1)
    ? `${displayName}|${String(effect.Type)}|${bonusType}|${items.join(',')}|${stackAmounts.join(',')}`
    : undefined
  function make(statKey: string, bt = bonusType): ParsedBonus {
    return {
      statKey, value, bonusType: bt, source,
      percent: flagSet(effect.Percent),
      asItemEffect: flagSet(effect.ApplyAsItemEffect),
      // statKey-scoped so Item=All fan-out to different stats doesn't merge.
      ...(stackGroupBase ? { stackGroup: `${statKey}::${stackGroupBase}`, stackAmounts } : {}),
    }
  }

  const type = effect.Type

  switch (type) {
    // -----------------------------------------------------------------------
    // Ability scores
    // -----------------------------------------------------------------------
    case 'AbilityBonus':
    case 'AbilityScore':
      if (items.length > 0) {
        return expandAbilityItems(items).map(item => make(`ability.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Skills
    // -----------------------------------------------------------------------
    case 'SkillBonus':
      if (items.length > 0) {
        return items.map(item => make(`skill.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Saving throws
    // -----------------------------------------------------------------------
    case 'SaveBonus': {
      if (items.length === 0) {
        // No Item → all three saves
        return [
          make('save.Fort'),
          make('save.Reflex'),
          make('save.Will'),
        ]
      }
      const results: ParsedBonus[] = []
      for (const item of items) {
        switch (item) {
          case 'All':
            results.push(make('save.Fort'))
            results.push(make('save.Reflex'))
            results.push(make('save.Will'))
            break
          case 'Fortitude':
            results.push(make('save.Fort'))
            break
          case 'Reflex':
            results.push(make('save.Reflex'))
            break
          case 'Will':
            results.push(make('save.Will'))
            break
          case 'Poison':
          case 'Disease':
          case 'Spell':
          case 'Traps':
          case 'Magic':
          case 'Fear':
          case 'Enchantment':
          case 'Illusion':
          case 'Curse':
            results.push(make(`save.sub.${item}`))
            break
          default:
            break
        }
      }
      return results
    }

    case 'FortitudeSave':
      return [make('save.Fort')]

    case 'ReflexSave':
      return [make('save.Reflex')]

    case 'WillSave':
      return [make('save.Will')]

    case 'AllSaveBonus':
      return [make('save.Fort'), make('save.Reflex'), make('save.Will')]

    // -----------------------------------------------------------------------
    // Defensive stats
    // -----------------------------------------------------------------------
    case 'Hitpoints':
      return [make('hp')]

    case 'ACBonus':
      return [make('ac')]

    case 'NaturalArmor':
    case 'NaturalArmorBonus':
      return [make('ac', 'Natural Armor')]

    case 'ShieldBonus':
      return [make('ac', 'Shield')]

    case 'Deflection':
      return [make('ac', 'Deflection')]

    case 'DodgeBonus':
    case 'Dodge':
      return [make('dodge', 'Dodge')]

    case 'DodgeCap':
    case 'DodgeCapBonus':
      return [make('dodgeCap')]

    case 'MaxDexBonus':
      return [make('mdb')]

    case 'PRR':
      return [make('prr')]

    case 'MRR':
      return [make('mrr')]

    case 'MRRCap':
      return [make('mrrCap')]

    case 'BAB':
      return [make('bab')]

    case 'EnergyResistance':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`resist.${e}`))
            : [make(`resist.${elem}`)],
        )
      }
      return []

    case 'EnergyAbsorbance':
    case 'EnergyAbsorption':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`absorb.${e}`, 'Absorption'))
            : [make(`absorb.${elem}`, 'Absorption')],
        )
      }
      return []

    case 'DR':
      if (items.length > 0) return [make(`dr.${items[0]}`)]
      return [make('dr.Untyped')]

    case 'CasterLevel':
    case 'EpicCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`))
      return [make('cl.All')]

    case 'MaxCasterLevel':
      if (items.length > 0) return items.map(item => make(`maxCl.${item}`))
      return [make('maxCl.All')]

    case 'CasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`clSchool.${item}`))
      return []

    case 'CasterLevelEnergy':
      if (items.length > 0) return items.map(item => make(`clEnergy.${normalizeSpellElement(item)}`))
      return []

    case 'Fortification':
    case 'FortificationBase':
      return [make('fortification')]

    case 'Concealment':
      return [make('concealment')]

    case 'Incorporeality':
      return [make('incorporeality')]

    case 'MoveSpeed':
    case 'MovementSpeed':
      return [make('speed')]

    case 'SpellResistance':
      return [make('spellResistance')]

    // -----------------------------------------------------------------------
    // Melee / combat
    // -----------------------------------------------------------------------
    case 'MeleePower':
      return [make('melee.power')]

    case 'RangedPower':
      return [make('ranged.power')]

    case 'Doublestrike':
      return [make('melee.doublestrike')]

    case 'Strikethrough':
      return [make('melee.strikethrough')]

    case 'Doubleshot':
      return [make('ranged.doubleshot')]

    case 'Weapon_Attack':
      return [make('melee.toHit')]

    case 'Weapon_Damage':
      return [make('melee.damage')]

    case 'Weapon_AttackAndDamage':
      return [make('melee.toHit'), make('melee.damage')]

    case 'Weapon_OtherDamageBonus':
      return [make('melee.damage')]

    case 'SneakAttack':
    case 'SneakAttackDice':
      return [make('melee.sneakDice')]

    // -----------------------------------------------------------------------
    // Spell power / crit / DC
    // -----------------------------------------------------------------------
    case 'SpellPower':
      if (items.length > 0) {
        return items.map(item => make(`sp.${normalizeSpellElement(item)}`))
      }
      return []

    case 'UniversalSpellPower':
      return [make('sp.Universal')]

    case 'SpellCritChance':
    case 'SpellLore':
      if (items.length > 0) {
        return items.map(item => make(`spCrit.${normalizeSpellElement(item)}`))
      }
      return []

    case 'UniversalSpellLore':
    case 'UniversalSpellCritChance':
      return [make('spCrit.Universal')]

    case 'SpellPoints':
      return [make('spellPoints')]

    case 'SpellFocusMastery':
      return [make('spellPenetration')]

    case 'SpellPenetration':
    case 'SpellPenetrationBonus':
    case 'SpellResistancePenetration':
      return [make('spellPenetration')]

    case 'SpellFocus':
    case 'SpellDC':
      if (items.length > 0) {
        return items.map(item => make(`dc.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Miscellaneous
    // -----------------------------------------------------------------------
    case 'Initiative':
      return [make('initiative')]

    case 'ThreatRange':
    case 'ImprovedCritical':
      return [make('weapon.threatRange')]

    case 'OffHandAttack':
    case 'OffhandAttack':
      return [make('offhand.attack')]

    case 'Displacement':
      return [make('displacement')]

    case 'HelplessBonus':
      return [make('helpless')]

    case 'TurnUndead':
    case 'ExtraTurns':
      return [make('turnUndead')]

    // -----------------------------------------------------------------------
    // V2 parity: bypasses (DR / fortification / dodge / missile deflection)
    // -----------------------------------------------------------------------
    case 'DRBypass':
      if (items.length > 0) return items.map(item => make(`drBypass.${item}`))
      return [make('drBypass.Untyped')]

    case 'FortificationBypass':
      return [make('fortBypass')]

    case 'DodgeBypass':
      return [make('dodgeBypass')]

    case 'MissileDeflection':
      return [make('missileDeflection')]

    case 'MissileDeflectionBypass':
      return [make('missileDeflectionBypass')]

    // -----------------------------------------------------------------------
    // V2 parity: armor / shield specific AC and check penalty effects.
    // Bonus-type-coded variants flow into the same 'ac' stat key with the
    // appropriate exclusive-stack type per V2.
    // -----------------------------------------------------------------------
    // V2 routes Effect_ArmorACBonus → Breakdown_BonusArmorAC ("Armor % Bonus")
    // and Effect_ACBonusShield → Breakdown_BonusShieldAC ("Shield % Bonus");
    // BreakdownItemAC.cpp:115-157 applies these as a PERCENTAGE of the printed
    // armor (+ enchantment) / shield AC, not as flat AC points.
    case 'ArmorACBonus':
      return [make('armorACPercent', 'Stacking')]

    case 'ACBonusShield':
      return [make('shieldACPercent', 'Stacking')]

    case 'ArmorCheckPenalty':
      return [make('armorCheckPenalty', 'Penalty')]

    case 'ArmorCheckPenaltyShield':
      return [make('armorCheckPenaltyShield', 'Penalty')]

    case 'ArcaneSpellFailure':
      return [make('arcaneSpellFailure')]

    case 'ArcaneSpellFailureShields':
      return [make('arcaneSpellFailureShield')]

    // Tower-shield-gated dodge / mdb — V2 keeps a separate breakdown for
    // tower-shield MDB (Effect.h:Effect_MaxDexBonusTowerShield →
    // Breakdown_MaxDexBonusShields) so the AC and Dodge breakdowns can apply
    // it as an additional cap when a tower shield is equipped
    // (BreakdownItemAC.cpp:71-82, BreakdownItemDodge.cpp:55-63).
    case 'DodgeBonusTowerShield':
      return [make('dodge', 'Dodge')]

    case 'MaxDexBonusTowerShield':
      return [make('mdbShields')]

    case 'BlockingDR':
      return [make('blockingDR')]

    case 'EnchantArmor':
      return [make('armor.enchantment')]

    case 'ShieldEnchantment':
      return [make('shield.enchantment')]

    // -----------------------------------------------------------------------
    // Healing / repair / negative-energy amplification
    // -----------------------------------------------------------------------
    case 'HealingAmplification':
      return [make('healAmp')]

    case 'NegativeHealingAmplification':
      return [make('negHealAmp')]

    case 'RepairAmplification':
      return [make('repairAmp')]

    // -----------------------------------------------------------------------
    // Hitpoint variants
    // -----------------------------------------------------------------------
    // V2 BreakdownItemHitpoints.cpp:168-194: `HitpointsReaper` (typically
    // AType=APCount, scaling with AP spent in a reaper tree) feeds a SEPARATE
    // breakdown (Breakdown_ReaperHitpoints) that gets level-capped before it
    // is folded into HP — unlike plain `Hitpoints`-typed effects tagged
    // Bonus="Reaper" (e.g. "Reaper's Defense I/II/IV"'s flat +10/+20/+100),
    // which apply directly and uncapped. Keep them in separate stat keys so
    // the cap in buildStatMap only ever touches the APCount-scaled ones.
    case 'HitpointsReaper':
      return [make('hpReaperAP', 'Reaper')]

    // V2 BreakdownItemHitpoints.cpp:139-152 — style feats are a *count*; HP
    // bonus is then derived as 0.25 × min(4, count) × non-epic class HD.
    // Route the raw effect into a counter the hook reads later.
    case 'HitpointsStyleBonus':
      return [make('styleFeats')]

    case 'FalseLife':
      return [make('hp', 'False Life')]

    // -----------------------------------------------------------------------
    // Sneak attack: V2 splits Dice / Damage / Range / Attack and main-vs-ranged.
    // -----------------------------------------------------------------------
    case 'SneakAttackAttack':
      return [make('melee.sneakAttack')]

    case 'SneakAttackDamage':
      return [make('melee.sneakDamage')]

    case 'SneakAttackRange':
      return [make('melee.sneakRange')]

    case 'RangedSneakAttackDamage':
      return [make('ranged.sneakDamage')]

    case 'RangedSneakAttackRange':
      return [make('ranged.sneakRange')]

    // -----------------------------------------------------------------------
    // AP / fate point bonuses
    // -----------------------------------------------------------------------
    case 'DestinyAPBonus':
      return [make('destinyAP')]

    // V2 Effect_RAPBonus = bonus RACIAL action points (Life::CountBonusRacialAP,
    // Life.cpp:735-772) — was mis-keyed as reaperAP.
    case 'RAPBonus':
      return [make('racialAP')]

    case 'UAPBonus':
      return [make('universalAP')]

    case 'FatePoint':
      return [make('fatePoint')]

    // -----------------------------------------------------------------------
    // Threat / tactical / spell DC
    // -----------------------------------------------------------------------
    case 'ThreatBonusMelee':
      return [make('threat.melee')]

    case 'ThreatBonusRanged':
      return [make('threat.ranged')]

    case 'ThreatBonusSpell':
      return [make('threat.spell')]

    case 'TacticalDC':
      if (items.length > 0) return items.map(item => make(`tacticalDC.${item}`))
      return [make('tacticalDC.All')]

    // -----------------------------------------------------------------------
    // Turn-undead (V2 splits these into multiple effects)
    // -----------------------------------------------------------------------
    case 'TurnBonus':
      return [make('turnUndead.bonus')]

    case 'TurnDiceBonus':
      return [make('turnUndead.diceBonus')]

    case 'TurnLevelBonus':
      return [make('turnUndead.levelBonus')]

    case 'TurnMaxDice':
      return [make('turnUndead.maxDice')]

    // -----------------------------------------------------------------------
    // Ki (monk)
    // -----------------------------------------------------------------------
    case 'KiCritical':
      return [make('ki.critical')]

    case 'KiHit':
      return [make('ki.hit')]

    case 'KiMaximum':
      return [make('ki.max')]

    case 'KiPassive':
      return [make('ki.passive')]

    // -----------------------------------------------------------------------
    // Songs (bard) — V2 emits these as Music-typed bonuses to the corresponding
    // primary stat key. We carry the V2 stat shape and tag the bonus type as
    // 'Music' so they stack-resolve correctly under the bard exclusive type.
    // -----------------------------------------------------------------------
    case 'SongCount':
      return [make('song.count')]

    case 'SongDuration':
      return [make('song.duration')]

    // Song (bard "Inspire …") effects are CONDITIONAL — active only while a
    // song is up. V2 routes every one to its own informational breakdown
    // (Breakdown_Song*, BreakdownsPane.cpp:1898-2128) and NEVER folds them into
    // the character's real always-on PRR/MRR/Save/AC/Dodge/attack/etc. totals
    // (BreakdownItemPRR/Save have no Song handling). V3 had folded them into the
    // real totals, over-counting PRR/saves on every Bard/Stormsinger build.
    // Route to informational `song.*` keys so they display separately without
    // corrupting the real stat. Verified against v2calc.
    case 'SongACBonus':            return [make('song.ac', 'Music')]
    case 'SongDodgeBonus':         return [make('song.dodge', 'Music')]
    case 'SongSaveBonus':          return [make('song.save', 'Music')]
    case 'SongAttackBonus':        return [make('song.attack', 'Music')]
    case 'SongDoublestrike':       return [make('song.doublestrike', 'Music')]
    case 'SongDoubleshot':         return [make('song.doubleshot', 'Music')]
    case 'SongDamageBonus':        return [make('song.damage', 'Music')]
    case 'SongUniversalSpellPower': return [make('song.sp', 'Music')]
    case 'SongSpellPenetration':   return [make('song.spellPen', 'Music')]
    case 'SongCasterLevel':        return [make('song.cl', 'Music')]
    case 'SongSkillBonus':         return [make('song.skill', 'Music')]
    case 'SongPRR':                return [make('song.prr', 'Music')]
    case 'SongMRR':                return [make('song.mrr', 'Music')]
    case 'SongHealingAmp':         return [make('song.healAmp', 'Music')]
    case 'SongNegativeHealingAmp': return [make('song.negHealAmp', 'Music')]
    case 'SongRepairAmp':          return [make('song.repairAmp', 'Music')]

    // -----------------------------------------------------------------------
    // Damage ability multipliers (Strength 1.5x for THF, 0.5x for offhand, …)
    // -----------------------------------------------------------------------
    case 'DamageAbilityMultiplier':
      return [make('melee.damageAbilityMult')]

    case 'DamageAbilityMultiplierOffhand':
      return [make('offhand.damageAbilityMult')]

    // -----------------------------------------------------------------------
    // Helpless (extra damage vs. helpless / damage taken while helpless)
    // -----------------------------------------------------------------------
    case 'HelplessDamage':
      return [make('helpless')]

    case 'HelplessDamageReduction':
      return [make('helplessDR')]

    // -----------------------------------------------------------------------
    // Miscellaneous combat / movement / utility
    // -----------------------------------------------------------------------
    case 'DivineGrace':
      return [make('save.divineGrace')]

    case 'OverrideBAB':
      return [make('babOverride')]

    case 'DoublestrikeOffhand':
      return [make('offhand.doublestrike')]

    case 'PointBlankShotRange':
      return [make('pointBlankShotRange')]

    case 'SecondaryShieldBash':
      return [make('secondaryShieldBash')]

    case 'TumbleCharge':
      return [make('tumbleCharge')]

    case 'TrueSeeing':
      return [make('trueSeeing')]

    case 'UnconsciousRange':
      return [make('unconsciousRange')]

    case 'WildsurgeChance':
      return [make('wildsurgeChance')]

    case 'ImbueDice':
      return [make('imbueDice')]

    case 'Immunity':
      return [make(`immunity.${items[0] ?? 'All'}`)]

    case 'EldritchBlastD6':
      return [make('eldritchBlast.d6')]

    case 'EldritchBlastD8':
      return [make('eldritchBlast.d8')]

    case 'DragonmarkUse':
      return [make('dragonmark.uses')]

    case 'NegativeLevel':
      return [make('negativeLevel')]

    case 'OffHandAttackBonus':
      return [make('offhand.attack')]

    case 'ImplementBonus':
      return [make('implementBonus')]

    // -----------------------------------------------------------------------
    // Caster level — spell-specific / school-specific maxima
    // -----------------------------------------------------------------------
    case 'CasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`clSpell.${item}`))
      return []

    case 'MaxCasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`maxClSpell.${item}`))
      return []

    case 'MaxCasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`maxClSchool.${item}`))
      return []

    // -----------------------------------------------------------------------
    // Spell cost / spell critical damage
    // -----------------------------------------------------------------------
    case 'SpellCostReduction':
      if (items.length > 0) return items.map(item => make(`spellCost.${item}`))
      return [make('spellCost.All')]

    case 'SpellPointCostPercent':
      return [make('spellCostPct')]

    case 'SpellCriticalDamage':
      if (items.length > 0) return items.map(item => make(`spCritDmg.${normalizeSpellElement(item)}`))
      return []

    case 'UniversalSpellCriticalDamage':
      return [make('spCritDmg.Universal')]

    // -----------------------------------------------------------------------
    // Metamagic cost reductions
    // -----------------------------------------------------------------------
    case 'MetamagicCostAccelerate':       return [make('metamagic.cost.Accelerate')]
    case 'MetamagicCostEschewMaterials':  return [make('metamagic.cost.EschewMaterials')]
    case 'MetamagicCostEmbolden':         return [make('metamagic.cost.Embolden')]
    case 'MetamagicCostEmpower':          return [make('metamagic.cost.Empower')]
    case 'MetamagicCostEmpowerHealing':   return [make('metamagic.cost.EmpowerHealing')]
    case 'MetamagicCostEnlarge':          return [make('metamagic.cost.Enlarge')]
    case 'MetamagicCostExtend':           return [make('metamagic.cost.Extend')]
    case 'MetamagicCostHeighten':         return [make('metamagic.cost.Heighten')]
    case 'MetamagicCostIntensify':        return [make('metamagic.cost.Intensify')]
    case 'MetamagicCostMaximize':         return [make('metamagic.cost.Maximize')]
    case 'MetamagicCostQuicken':          return [make('metamagic.cost.Quicken')]

    // -----------------------------------------------------------------------
    // Action boost / class extras (extra uses per rest)
    // -----------------------------------------------------------------------
    case 'ExtraActionBoost':       return [make('actionBoost.extra')]
    case 'ExtraLayOnHands':        return [make('lohExtra')]
    case 'LOHRegenRate':           return [make('lohRegen')]
    case 'ExtraRage':              return [make('rageExtra')]
    case 'ExtraSmite':             return [make('smiteExtra')]
    case 'ExtraRemoveDisease':     return [make('removeDiseaseExtra')]
    case 'ExtraWildEmpathy':       return [make('wildEmpathyExtra')]

    // -----------------------------------------------------------------------
    // Rune arm
    // -----------------------------------------------------------------------
    case 'RuneArmChargeRate':      return [make('runeArm.chargeRate')]
    case 'RuneArmStableCharge':    return [make('runeArm.stableCharge')]

    // -----------------------------------------------------------------------
    // Save / skill ability replacement (e.g. "use Cha for Reflex saves").
    // V2 models these as ability-substitution effects on the corresponding
    // save / skill breakdown. We can't fully model that without a breakdown
    // engine, so we surface them under a dedicated stat key for downstream
    // engines to consume.
    // -----------------------------------------------------------------------
    case 'SaveBonusAbility':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.ability')
            case 'Reflex':    return make('save.Reflex.ability')
            case 'Will':      return make('save.Will.ability')
            case 'All':       return make('save.All.ability')
            default:          return make(`save.sub.${item}.ability`)
          }
        })
      }
      return []

    case 'SaveNoFailOn1':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.noFailOn1')
            case 'Reflex':    return make('save.Reflex.noFailOn1')
            case 'Will':      return make('save.Will.noFailOn1')
            default:          return make('save.All.noFailOn1')
          }
        })
      }
      return [make('save.All.noFailOn1')]

    case 'SkillBonusAbility': {
      const skillNames = expandSkillsByAbility(items)
      return skillNames.map(name => make(`skill.${name}`))
    }

    // -----------------------------------------------------------------------
    // Hireling stats (Stream 4 — surfaced under their own Breakdowns section).
    // -----------------------------------------------------------------------
    case 'HirelingAbilityBonus':
      return items.length > 0
        ? items.map(it => make(`hireling.ability.${it}`))
        : [make('hireling.ability.All')]
    case 'HirelingConcealment':
      return [make('hireling.concealment')]
    case 'HirelingHitpoints':
      return [make('hireling.hp')]
    case 'HirelingFortification':
      return [make('hireling.fort')]
    case 'HirelingPRR':
      return [make('hireling.prr')]
    case 'HirelingMRR':
      return [make('hireling.mrr')]
    case 'HirelingDodge':
      return [make('hireling.dodge')]
    case 'HirelingMeleePower':
      return [make('hireling.melee.power')]
    case 'HirelingRangedPower':
      return [make('hireling.ranged.power')]
    case 'HirelingSpellPower':
      return items.length > 0
        ? items.map(it => make(`hireling.sp.${it}`))
        : [make('hireling.sp.All')]
    case 'HirelingSaveBonus':
      return items.length > 0
        ? items.map(it => make(`hireling.save.${it}`))
        : [make('hireling.save.All')]
    case 'HirelingGrantFeat':
      // Encode the granted feat name in bonusType so the Hireling section can
      // surface a list of granted feats without polluting the resolver math.
      return items.length > 0
        ? items.map(it => ({ statKey: 'hireling.grantedFeats', value: 1, bonusType: it, source }))
        : []

    // -----------------------------------------------------------------------
    // Weapon-specific effects: surface a subset as flat stat keys so the
    // breakdowns engine can show per-weapon attack-speed / crit / vorpal /
    // keen totals (V2 BreakdownItemWeaponAttackSpeed, ...VorpalRange).
    // -----------------------------------------------------------------------
    case 'Weapon_Alacrity':
      return [make('weapon.alacrity')]
    case 'Weapon_Keen':
      return [make('weapon.keen')]
    case 'Weapon_VorpalRange':
      return [make('weapon.vorpalRange')]
    // Weapon_CriticalMultiplier is universal (not weapon-class-gated) but V2
    // (BreakdownItemWeaponCriticalMultiplier.cpp:70-93) sums it into the same
    // total as the class-gated WeaponCriticalMultiplierClass sibling, so both
    // route to melee.crit.multiplier (V2 parity pass N8).
    case 'Weapon_CriticalMultiplier':
      return [make('melee.crit.multiplier')]
    case 'Weapon_CriticalMultiplier19To20':
      return [make('weapon.critMultiplier19to20')]
    // Universal sibling of WeaponCriticalRangeClass — same total (N7),
    // matching V2 BreakdownItemWeaponCriticalThreatRange.cpp:52-57.
    case 'Weapon_CriticalRange':
      return [make('melee.crit.range')]
    // Crit-only damage bonuses (V2 BreakdownItemWeaponDamageBonus.cpp:184-202):
    // extra damage that lands only on a confirmed crit. Surfaced as
    // `melee.crit.damage` so the DPR estimator can add it on crits.
    case 'Weapon_DamageCritical':
    case 'Weapon_AttackAndDamageCritical':
    case 'WeaponOtherDamageBonusCritical':
      return [make('melee.crit.damage')]
    // -----------------------------------------------------------------------
    // Per-weapon-class effects (V2 BreakdownItemWeaponAttackBonus.cpp:233-279,
    // BreakdownItemWeaponDamageBonus.cpp:157-205, ...CriticalThreatRange /
    // ...CriticalMultiplier). V2 applies these only when the equipped weapon
    // is a member of the named weapon class (Build::IsWeaponInGroup); V3
    // gates on ctx.weaponClassMain (the main-hand weapon's derived classes).
    // Without weapon context (older callers / no weapon equipped) nothing is
    // emitted — same as V2 with no weapon wielded.
    // -----------------------------------------------------------------------
    case 'WeaponAttackBonusClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.toHit')] : []
    case 'WeaponDamageBonusClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.damage')] : []
    case 'WeaponAttackBonusCriticalClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.crit.toHit')] : []
    case 'WeaponDamageBonusCriticalClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.crit.damage')] : []
    case 'WeaponCriticalMultiplierClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.crit.multiplier')] : []
    case 'WeaponCriticalRangeClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.crit.range')] : []
    case 'WeaponAlacrityClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.alacrity')] : []
    case 'WeaponOtherDamageBonusClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.damage')] : []
    case 'WeaponOtherDamageBonusCriticalClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.crit.damage')] : []
    // Weapon enchantment adds to BOTH attack and damage (V2 routes
    // Effect_Weapon_Enchantment into the attack and damage breakdowns).
    case 'Weapon_Enchantment':
      return items.includes('All') || (ctx && items.some(i => ctx.weaponTypes.has(i)))
        ? [make('melee.toHit'), make('melee.damage')] : []
    case 'Weapon_EnchantmentClass':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.toHit'), make('melee.damage')] : []
    // Extra base damage dice (+W) for the listed weapon TYPES.
    case 'Weapon_BaseDamage':
      return ctx && items.some(i => ctx.weaponTypes.has(i))
        ? [make('weapon.bonusW')] : []
    // Crit-confirm bonuses for the wielded weapon type.
    case 'Weapon_AttackCritical':
      return items.includes('All') || (ctx && items.some(i => ctx.weaponTypes.has(i)))
        ? [make('melee.crit.toHit')] : []
    // Ability substitution for attack/damage rolls (e.g. Pact weapons:
    // CHA-to-hit). Item = [Ability, ...weaponTypes] (or weapon classes for
    // the *Class variants). Emit a marker; CombatPanel picks the LARGEST
    // candidate ability (V2 BreakdownItemWeaponAttackBonus.cpp:327+
    // LargestStatBonus).
    // Stat / Proficiency / Other variants are still unmodelled (~5 effects):
    case 'WeaponOtherDamageBonus':
    case 'WeaponDamageBonusCriticalStat':
    case 'WeaponDamageBonusStat':
    case 'WeaponProficiencyClass':
      return []
    // -----------------------------------------------------------------------
    // Per-damage-type effects (V2 BreakdownItemWeaponEffects.cpp:306-323).
    // V2 gates these on the wielded weapon's damage-type group membership
    // (Bludgeoning / Slashing / Piercing / Ranged — regular weapon groups in
    // WeaponGroupings.xml). These group names are already in ctxWeaponClassMain
    // via deriveWeaponClasses, so we reuse that set exactly as V2 does with
    // Build::IsWeaponInGroup(item, weaponType).
    // -----------------------------------------------------------------------
    case 'WeaponAttackBonusDamageType':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.toHit')] : []
    case 'WeaponAttackBonusCriticalDamageType':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.crit.toHit')] : []
    case 'WeaponDamageBonusDamageType':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.damage')] : []
    case 'WeaponDamageBonusCriticalDamageType':
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [make('melee.crit.damage')] : []
    case 'WeaponKeenDamageType':
      // Amount=0 in data — V2 computes the doubling from the weapon's base crit
      // range at runtime (BreakdownItemWeaponCriticalThreatRange.cpp:152-168).
      // Emit value=1 as a binary "Improved Critical active" marker.
      return ctx?.weaponClassMain && items.some(i => ctx.weaponClassMain!.has(i))
        ? [{ statKey: 'weapon.keen', value: 1, bonusType, source }] : []

    // -----------------------------------------------------------------------
    // Niche surfaced stats (V2 parity): regen, guard, ghost touch, etc.
    // -----------------------------------------------------------------------
    case 'Regeneration':
      return [make('regeneration')]

    case 'Guard':
      return [make(items.length > 0 ? `guard.${items[0]}` : 'guard')]

    case 'GhostTouch':
      return [make('ghostTouch')]

    case 'ImplementInYourHands':
      return items.length > 0
        ? items.map(item => make(`implementInHands.${item}`))
        : [make('implementInHands.Any')]

    case 'SpellPowerReplacement':
      return items.length > 0
        ? items.map(item => make(`spellPowerReplacement.${normalizeSpellElement(item)}`))
        : []

    // -----------------------------------------------------------------------
    // Control-flow / UI-only effects (no flat stat contribution)
    // -----------------------------------------------------------------------
    case 'AddGroupWeapon':
    case 'MergeGroups':
    case 'ExclusionGroup':
    case 'ExcludeFeatSelection':
    case 'GrantFeat':
    case 'SpellLikeAbility':
    case 'CreateSlider':
    case 'EnhancementTree':
    case 'DestinyTree':
    case 'ItemClickie':
    case 'RustSusceptability':
    case 'NotModeled':
    case 'Unknown':
      return []

    // SLA charge count for the named SLA (V2 CSLAControl charge display).
    case 'SLACharge':
      return items.length > 0 ? [make(`slaCharge.${items[0]}`)] : []

    // Unknown effect type — return nothing
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// ItemBuff parsing
// ---------------------------------------------------------------------------

/**
 * A buff template from ItemBuffs.xml (V2 Buff.cpp). The item's per-Buff Type
 * names one of these; its Effect list carries the real stats, with Amount /
 * Bonus placeholders that the item's Value1 / BonusType override
 * (V2 Buff::UpdatedEffects, Buff.cpp:164-249).
 */
export interface ItemBuffTemplate {
  Type: string
  Effect?: Effect | Effect[]
}

/**
 * Resolves a named item-buff Type against the ItemBuffs.xml template
 * catalogue, mirroring V2 Item::FindEffect / BuffValue (Item.cpp:452-506):
 * FindBuff(Type).Effects() with the item's Value1/Item/BonusType stamped onto
 * the template effects via Buff::UpdatedEffects. Most equipped-item buffs use
 * flavour-named Types (Vampirism, PhysicalSheltering, WeaponEnchantment, …)
 * whose stats live ONLY in the template — without this they were silently
 * dropped by the direct switch's `default: return []`.
 */
function parseItemBuffViaTemplate(
  buff: ItemBuff,
  source: string,
  catalogue: Map<string, ItemBuffTemplate>,
  ctx?: EffectContext,
): ParsedBonus[] {
  const tpl = catalogue.get(buff.Type)
  if (!tpl) return []
  const effects = Array.isArray(tpl.Effect) ? tpl.Effect : tpl.Effect ? [tpl.Effect] : []
  if (effects.length === 0) return []

  const hasValue1 = buff.Value1 != null
  const itemBonus = buff.BonusType && buff.BonusType !== '' ? buff.BonusType : undefined
  const itemFilter = buff.Item && buff.Item !== '' ? buff.Item : undefined

  const out: ParsedBonus[] = []
  for (const eff of effects) {
    // Buff::UpdatedEffects: stamp BonusType (if the item supplies one), set the
    // Item filter, and override Amount with Value1 (ItemBuff carries no Value2,
    // so the even/odd split collapses to "Value1 on every effect").
    const cloned: Effect = { ...eff }
    if (itemBonus) cloned.Bonus = itemBonus
    if (itemFilter) cloned.Item = itemFilter
    if (hasValue1) cloned.Amount = buff.Value1
    // Pass ctx so stance-gated template effects (e.g. Enhanced Bloodrage's
    // +8 CON while the item stance is toggled on) evaluate against the
    // active-stance set instead of being conservatively dropped.
    out.push(...parseEffect(cloned, 1, source, 0, 0, ctx))
  }
  return out
}

/**
 * Converts an ItemBuff (from an equipped item's Buff list) into ParsedBonus
 * entries for the relevant stat keys.
 *
 * ItemBuff uses `Value1` for the magnitude and `BonusType` for the bonus type.
 * Types not recognised by the direct switch are resolved against the
 * ItemBuffs.xml template catalogue (when supplied) before being dropped.
 */
export function parseItemBuff(
  buff: ItemBuff,
  source: string,
  catalogue?: Map<string, ItemBuffTemplate>,
  ctx?: EffectContext,
): ParsedBonus[] {
  const value = buff.Value1 ?? 0
  const items = toStringArray(buff.Item as string | string[] | undefined)

  // Determine effective bonus type with override logic
  let bonusType: string
  switch (buff.BonusType) {
    case 'Natural Armor':
      bonusType = 'Natural Armor'
      break
    case 'Deflection':
      bonusType = 'Deflection'
      break
    case 'Dodge':
      bonusType = 'Dodge'
      break
    default:
      bonusType = buff.BonusType ?? 'Enhancement'
      break
  }

  function make(statKey: string, bt = bonusType): ParsedBonus {
    return { statKey, value, bonusType: bt, source, percent: flagSet(buff.Percent) }
  }

  const type = buff.Type

  switch (type) {
    // -----------------------------------------------------------------------
    // Ability scores — direct
    // -----------------------------------------------------------------------
    case 'Strength':
      return [make('ability.Strength')]
    case 'Dexterity':
      return [make('ability.Dexterity')]
    case 'Constitution':
      return [make('ability.Constitution')]
    case 'Intelligence':
      return [make('ability.Intelligence')]
    case 'Wisdom':
      return [make('ability.Wisdom')]
    case 'Charisma':
      return [make('ability.Charisma')]

    case 'AbilityBonus':
      if (items.length > 0) {
        return expandAbilityItems(items).map(item => make(`ability.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Saving throws
    // -----------------------------------------------------------------------
    case 'FortitudeSave':
      return [make('save.Fort')]

    case 'ReflexSave':
      return [make('save.Reflex')]

    case 'WillSave':
      return [make('save.Will')]

    case 'SaveBonus': {
      if (items.length === 0) {
        return [make('save.Fort'), make('save.Reflex'), make('save.Will')]
      }
      const results: ParsedBonus[] = []
      for (const item of items) {
        switch (item) {
          case 'All':
            results.push(make('save.Fort'), make('save.Reflex'), make('save.Will'))
            break
          case 'Fortitude':
            results.push(make('save.Fort')); break
          case 'Reflex':
            results.push(make('save.Reflex')); break
          case 'Will':
            results.push(make('save.Will')); break
          case 'Poison': case 'Disease': case 'Spell': case 'Traps':
          case 'Magic': case 'Fear': case 'Enchantment':
          case 'Illusion': case 'Curse':
            results.push(make(`save.sub.${item}`)); break
          default:
            break
        }
      }
      return results
    }

    // -----------------------------------------------------------------------
    // Defensive stats
    // -----------------------------------------------------------------------
    case 'Hitpoints':
    case 'HitPoints':
      return [make('hp')]

    case 'ACBonus':
      return [make('ac')]

    case 'NaturalArmor':
      return [make('ac', 'Natural Armor')]

    case 'Deflection':
      return [make('ac', 'Deflection')]

    case 'DodgeBonus':
    case 'Dodge':
      return [make('dodge', 'Dodge')]

    case 'PRR':
      return [make('prr')]

    case 'MRR':
      return [make('mrr')]

    case 'MRRCap':
      return [make('mrrCap')]

    case 'BAB':
      return [make('bab')]

    case 'MaxDexBonus':
      return [make('mdb')]

    case 'DodgeCap':
    case 'DodgeCapBonus':
      return [make('dodgeCap')]

    case 'EnergyResistance':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`resist.${e}`))
            : [make(`resist.${elem}`)],
        )
      }
      return []

    case 'EnergyAbsorbance':
    case 'EnergyAbsorption':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`absorb.${e}`, 'Absorption'))
            : [make(`absorb.${elem}`, 'Absorption')],
        )
      }
      return []

    case 'DR':
      if (items.length > 0) return [make(`dr.${items[0]}`)]
      return [make('dr.Untyped')]

    case 'CasterLevel':
    case 'EpicCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`))
      return [make('cl.All')]

    case 'MaxCasterLevel':
      if (items.length > 0) return items.map(item => make(`maxCl.${item}`))
      return [make('maxCl.All')]

    case 'Fortification':
      return [make('fortification')]

    case 'Concealment':
      return [make('concealment')]

    case 'SpellResistance':
      return [make('spellResistance')]

    case 'SpellFocus':
    case 'SpellDC':
      if (items.length > 0) return items.map(item => make(`dc.${item}`))
      return [make('dc.All')]

    // School-specific DC bonus from items (e.g. "Admiral's Gloves" +2 Equipment Illusion DC).
    // V2 ItemBuff type SchoolFocus / SchoolFocusNumber → BreakdownItemSpellDC school total.
    case 'SchoolFocus':
    case 'SchoolFocusNumber':
      if (items.length > 0) return items.map(item => make(`dc.${item}`))
      return [make('dc.All')]

    // Universal DC bonus from items (e.g. "Doctor Gustav's Warped Lenses" +1 Profane).
    // V2 ItemBuff type SpellFocusNumber → BreakdownItemSpellDC All total.
    case 'SpellFocusNumber':
      return [make('dc.All')]

    // -----------------------------------------------------------------------
    // Skills — by group type
    // -----------------------------------------------------------------------
    case 'SkillBonus':
      if (items.length > 0) {
        return items.map(item => make(`skill.${item}`))
      }
      return []

    case 'Balance':
      return [make('skill.Balance')]
    case 'Bluff':
      return [make('skill.Bluff')]
    case 'Concentration':
      return [make('skill.Concentration')]
    case 'Diplomacy':
      return [make('skill.Diplomacy')]
    case 'DisableDevice':
    case 'Disable_Device':
      return [make('skill.Disable Device')]
    case 'Haggle':
      return [make('skill.Haggle')]
    case 'Heal':
      return [make('skill.Heal')]
    case 'Hide':
      return [make('skill.Hide')]
    case 'Intimidate':
      return [make('skill.Intimidate')]
    case 'Jump':
      return [make('skill.Jump')]
    case 'Listen':
      return [make('skill.Listen')]
    case 'MoveSilently':
    case 'Move_Silently':
      return [make('skill.Move Silently')]
    case 'OpenLock':
    case 'Open_Lock':
      return [make('skill.Open Lock')]
    case 'Perform':
      return [make('skill.Perform')]
    case 'Repair':
      return [make('skill.Repair')]
    case 'Search':
      return [make('skill.Search')]
    case 'Spellcraft':
      return [make('skill.Spellcraft')]
    case 'Spot':
      return [make('skill.Spot')]
    case 'Swim':
      return [make('skill.Swim')]
    case 'Tumble':
      return [make('skill.Tumble')]
    case 'UseMagicDevice':
    case 'Use_Magic_Device':
      return [make('skill.Use Magic Device')]

    // -----------------------------------------------------------------------
    // Spell stats
    // -----------------------------------------------------------------------
    case 'SpellPoints':
      return [make('spellPoints')]

    case 'SpellPower':
      if (items.length > 0) {
        return items.map(item => make(`sp.${normalizeSpellElement(item)}`))
      }
      return []

    case 'UniversalSpellPower':
      return [make('sp.Universal')]

    case 'SpellFocusMastery':
      return [make('spellPenetration')]

    case 'SpellPenetration':
    case 'SpellPenetrationBonus':
      return [make('spellPenetration')]

    // -----------------------------------------------------------------------
    // Combat
    // -----------------------------------------------------------------------
    case 'MeleePower':
      return [make('melee.power')]

    case 'RangedPower':
      return [make('ranged.power')]

    case 'Doublestrike':
      return [make('melee.doublestrike')]

    case 'Doubleshot':
      return [make('ranged.doubleshot')]

    case 'Initiative':
      return [make('initiative')]

    case 'MoveSpeed':
    case 'MovementSpeed':
      return [make('speed')]

    // -----------------------------------------------------------------------
    // V2 parity: bypasses
    // -----------------------------------------------------------------------
    case 'DRBypass':
      if (items.length > 0) return items.map(item => make(`drBypass.${item}`))
      return [make('drBypass.Untyped')]

    case 'FortificationBypass':
      return [make('fortBypass')]

    case 'DodgeBypass':
      return [make('dodgeBypass')]

    case 'MissileDeflection':
      return [make('missileDeflection')]

    case 'MissileDeflectionBypass':
      return [make('missileDeflectionBypass')]

    // -----------------------------------------------------------------------
    // V2 parity: armor / shield specific
    // -----------------------------------------------------------------------
    // ArmorBonus/ShieldBonus = flat printed AC; ArmorACBonus/ACBonusShield =
    // percentage of base armor/shield AC (V2 Breakdown_BonusArmorAC/ShieldAC).
    case 'ArmorBonus':
      return [make('ac', 'Armor')]

    case 'ShieldBonus':
      return [make('ac', 'Shield')]

    case 'ArmorACBonus':
      return [make('armorACPercent', 'Stacking')]

    case 'ACBonusShield':
      return [make('shieldACPercent', 'Stacking')]

    case 'ArmorCheckPenalty':
      return [make('armorCheckPenalty', 'Penalty')]

    case 'ArmorCheckPenaltyShield':
      return [make('armorCheckPenaltyShield', 'Penalty')]

    case 'ArcaneSpellFailure':
      return [make('arcaneSpellFailure')]

    case 'ArcaneSpellFailureShields':
      return [make('arcaneSpellFailureShield')]

    case 'BlockingDR':
      return [make('blockingDR')]

    case 'EnchantArmor':
    case 'ArmorEnchantment':
      return [make('armor.enchantment')]

    case 'ShieldEnchantment':
      return [make('shield.enchantment')]

    // -----------------------------------------------------------------------
    // Healing / repair / negative-energy amplification
    // -----------------------------------------------------------------------
    case 'HealingAmplification':
      return [make('healAmp')]

    case 'NegativeHealingAmplification':
      return [make('negHealAmp')]

    case 'RepairAmplification':
      return [make('repairAmp')]

    // -----------------------------------------------------------------------
    // HP variants
    // -----------------------------------------------------------------------
    // See the parseEffect note above — HitpointsReaper feeds a separate,
    // level-capped accumulator (`hpReaperAP`), not the flat `hp` Reaper bucket.
    case 'HitpointsReaper':
      return [make('hpReaperAP', 'Reaper')]

    // V2 BreakdownItemHitpoints.cpp:139-152 — counter (see parseEffect note)
    case 'HitpointsStyleBonus':
      return [make('styleFeats')]

    // V2 separate Breakdown_MaxDexBonusShields (Effect.h:Effect_MaxDexBonusTowerShield)
    case 'MaxDexBonusTowerShield':
      return [make('mdbShields')]

    case 'FalseLife':
      return [make('hp', 'False Life')]

    // -----------------------------------------------------------------------
    // Sneak attack
    // -----------------------------------------------------------------------
    case 'SneakAttackAttack':
      return [make('melee.sneakAttack')]

    case 'SneakAttackDamage':
      return [make('melee.sneakDamage')]

    case 'SneakAttackDice':
      return [make('melee.sneakDice')]

    case 'SneakAttackRange':
      return [make('melee.sneakRange')]

    case 'RangedSneakAttackDamage':
      return [make('ranged.sneakDamage')]

    case 'RangedSneakAttackRange':
      return [make('ranged.sneakRange')]

    // -----------------------------------------------------------------------
    // Threat / tactical / spell DC
    // -----------------------------------------------------------------------
    case 'ThreatBonusMelee':
      return [make('threat.melee')]

    case 'ThreatBonusRanged':
      return [make('threat.ranged')]

    case 'ThreatBonusSpell':
      return [make('threat.spell')]

    case 'TacticalDC':
      if (items.length > 0) return items.map(item => make(`tacticalDC.${item}`))
      return [make('tacticalDC.All')]

    // -----------------------------------------------------------------------
    // Spell-related
    // -----------------------------------------------------------------------
    case 'SpellLore':
    case 'SpellCritChance':
      if (items.length > 0) return items.map(item => make(`spCrit.${normalizeSpellElement(item)}`))
      return []

    case 'UniversalSpellLore':
    case 'UniversalSpellCritChance':
      return [make('spCrit.Universal')]

    case 'SpellCriticalDamage':
      if (items.length > 0) return items.map(item => make(`spCritDmg.${normalizeSpellElement(item)}`))
      return []

    case 'UniversalSpellCriticalDamage':
      return [make('spCritDmg.Universal')]

    case 'SpellCostReduction':
      if (items.length > 0) return items.map(item => make(`spellCost.${item}`))
      return [make('spellCost.All')]

    case 'SpellPointCostPercent':
      return [make('spellCostPct')]

    case 'CasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`clSpell.${item}`))
      return []

    case 'MaxCasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`maxClSpell.${item}`))
      return []

    case 'CasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`clSchool.${item}`))
      return []

    case 'MaxCasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`maxClSchool.${item}`))
      return []

    case 'CasterLevelEnergy':
      if (items.length > 0) return items.map(item => make(`clEnergy.${normalizeSpellElement(item)}`))
      return []

    case 'EpicCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`))
      return [make('cl.All')]

    // -----------------------------------------------------------------------
    // Metamagic cost reductions
    // -----------------------------------------------------------------------
    case 'MetamagicCostAccelerate':       return [make('metamagic.cost.Accelerate')]
    case 'MetamagicCostEschewMaterials':  return [make('metamagic.cost.EschewMaterials')]
    case 'MetamagicCostEmbolden':         return [make('metamagic.cost.Embolden')]
    case 'MetamagicCostEmpower':          return [make('metamagic.cost.Empower')]
    case 'MetamagicCostEmpowerHealing':   return [make('metamagic.cost.EmpowerHealing')]
    case 'MetamagicCostEnlarge':          return [make('metamagic.cost.Enlarge')]
    case 'MetamagicCostExtend':           return [make('metamagic.cost.Extend')]
    case 'MetamagicCostHeighten':         return [make('metamagic.cost.Heighten')]
    case 'MetamagicCostIntensify':        return [make('metamagic.cost.Intensify')]
    case 'MetamagicCostMaximize':         return [make('metamagic.cost.Maximize')]
    case 'MetamagicCostQuicken':          return [make('metamagic.cost.Quicken')]

    // -----------------------------------------------------------------------
    // AP / fate / class extras
    // -----------------------------------------------------------------------
    case 'DestinyAPBonus':         return [make('destinyAP')]
    case 'RAPBonus':               return [make('racialAP')]
    case 'UAPBonus':               return [make('universalAP')]
    case 'FatePoint':              return [make('fatePoint')]
    case 'ExtraActionBoost':       return [make('actionBoost.extra')]
    case 'ExtraLayOnHands':        return [make('lohExtra')]
    case 'LOHRegenRate':           return [make('lohRegen')]
    case 'ExtraRage':              return [make('rageExtra')]
    case 'ExtraSmite':             return [make('smiteExtra')]
    case 'ExtraRemoveDisease':     return [make('removeDiseaseExtra')]
    case 'ExtraWildEmpathy':       return [make('wildEmpathyExtra')]
    case 'ExtraTurns':
    case 'TurnUndead':             return [make('turnUndead')]
    case 'TurnBonus':              return [make('turnUndead.bonus')]
    case 'TurnDiceBonus':          return [make('turnUndead.diceBonus')]
    case 'TurnLevelBonus':         return [make('turnUndead.levelBonus')]
    case 'TurnMaxDice':            return [make('turnUndead.maxDice')]

    // -----------------------------------------------------------------------
    // Ki / monk
    // -----------------------------------------------------------------------
    case 'KiCritical':             return [make('ki.critical')]
    case 'KiHit':                  return [make('ki.hit')]
    case 'KiMaximum':              return [make('ki.max')]
    case 'KiPassive':              return [make('ki.passive')]

    // -----------------------------------------------------------------------
    // Helpless / damage ability multiplier / divine grace
    // -----------------------------------------------------------------------
    case 'HelplessDamage':
    case 'HelplessBonus':          return [make('helpless')]
    case 'HelplessDamageReduction':return [make('helplessDR')]
    case 'DamageAbilityMultiplier':         return [make('melee.damageAbilityMult')]
    case 'DamageAbilityMultiplierOffhand':  return [make('offhand.damageAbilityMult')]
    case 'DivineGrace':            return [make('save.divineGrace')]

    // -----------------------------------------------------------------------
    // Songs (bard) — Music-typed bonuses to the corresponding stat keys
    // -----------------------------------------------------------------------
    case 'SongCount':              return [make('song.count')]
    case 'SongDuration':           return [make('song.duration')]
    // Song effects are conditional and route to informational song.* keys in
    // V2 — never the real totals (see the parseEffect Song block above).
    case 'SongACBonus':            return [make('song.ac', 'Music')]
    case 'SongDodgeBonus':         return [make('song.dodge', 'Music')]
    case 'SongAttackBonus':        return [make('song.attack', 'Music')]
    case 'SongDoublestrike':       return [make('song.doublestrike', 'Music')]
    case 'SongDoubleshot':         return [make('song.doubleshot', 'Music')]
    case 'SongDamageBonus':        return [make('song.damage', 'Music')]
    case 'SongUniversalSpellPower':return [make('song.sp', 'Music')]
    case 'SongSpellPenetration':   return [make('song.spellPen', 'Music')]
    case 'SongPRR':                return [make('song.prr', 'Music')]
    case 'SongMRR':                return [make('song.mrr', 'Music')]
    case 'SongHealingAmp':         return [make('song.healAmp', 'Music')]
    case 'SongNegativeHealingAmp': return [make('song.negHealAmp', 'Music')]
    case 'SongRepairAmp':          return [make('song.repairAmp', 'Music')]
    case 'SongSaveBonus':          return [make('song.save', 'Music')]
    case 'SongCasterLevel':        return [make('song.cl', 'Music')]
    case 'SongSkillBonus':         return [make('song.skill', 'Music')]

    // -----------------------------------------------------------------------
    // Threat / utility / misc
    // -----------------------------------------------------------------------
    case 'OffHandAttackBonus':
    case 'OffHandAttack':
    case 'OffhandAttack':          return [make('offhand.attack')]
    case 'DoublestrikeOffhand':    return [make('offhand.doublestrike')]
    case 'OverrideBAB':            return [make('babOverride')]
    case 'PointBlankShotRange':    return [make('pointBlankShotRange')]
    case 'SecondaryShieldBash':    return [make('secondaryShieldBash')]
    case 'TumbleCharge':           return [make('tumbleCharge')]
    case 'TrueSeeing':              return [make('trueSeeing')]
    case 'UnconsciousRange':       return [make('unconsciousRange')]
    case 'WildsurgeChance':        return [make('wildsurgeChance')]
    case 'Incorporeality':         return [make('incorporeality')]
    case 'ImbueDice':              return [make('imbueDice')]
    case 'NegativeLevel':          return [make('negativeLevel')]
    case 'DragonmarkUse':          return [make('dragonmark.uses')]
    case 'ImplementBonus':         return [make('implementBonus')]
    case 'Displacement':           return [make('displacement')]
    case 'ThreatRange':
    case 'ImprovedCritical':       return [make('weapon.threatRange')]

    case 'Immunity':
      return [make(`immunity.${items[0] ?? 'All'}`)]

    case 'EldritchBlastD6':
      return [make('eldritchBlast.d6')]

    case 'EldritchBlastD8':
      return [make('eldritchBlast.d8')]

    // -----------------------------------------------------------------------
    // Save / skill ability replacement
    // -----------------------------------------------------------------------
    case 'SaveBonusAbility':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.ability')
            case 'Reflex':    return make('save.Reflex.ability')
            case 'Will':      return make('save.Will.ability')
            case 'All':       return make('save.All.ability')
            default:          return make(`save.sub.${item}.ability`)
          }
        })
      }
      return []

    case 'SkillBonusAbility': {
      const skillNames = expandSkillsByAbility(items)
      return skillNames.map(name => make(`skill.${name}`))
    }

    case 'SaveNoFailOn1':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.noFailOn1')
            case 'Reflex':    return make('save.Reflex.noFailOn1')
            case 'Will':      return make('save.Will.noFailOn1')
            default:          return make('save.All.noFailOn1')
          }
        })
      }
      return [make('save.All.noFailOn1')]

    // -----------------------------------------------------------------------
    // Rune arm
    // -----------------------------------------------------------------------
    case 'RuneArmChargeRate':      return [make('runeArm.chargeRate')]
    case 'RuneArmStableCharge':    return [make('runeArm.stableCharge')]

    // -----------------------------------------------------------------------
    // Hireling stats (Stream 4 — surfaced under their own Breakdowns section).
    // -----------------------------------------------------------------------
    case 'HirelingAbilityBonus':
      return items.length > 0
        ? items.map(it => make(`hireling.ability.${it}`))
        : [make('hireling.ability.All')]
    case 'HirelingConcealment':
      return [make('hireling.concealment')]
    case 'HirelingHitpoints':
      return [make('hireling.hp')]
    case 'HirelingFortification':
      return [make('hireling.fort')]
    case 'HirelingPRR':
      return [make('hireling.prr')]
    case 'HirelingMRR':
      return [make('hireling.mrr')]
    case 'HirelingDodge':
      return [make('hireling.dodge')]
    case 'HirelingMeleePower':
      return [make('hireling.melee.power')]
    case 'HirelingRangedPower':
      return [make('hireling.ranged.power')]
    case 'HirelingSpellPower':
      return items.length > 0
        ? items.map(it => make(`hireling.sp.${it}`))
        : [make('hireling.sp.All')]
    case 'HirelingSaveBonus':
      return items.length > 0
        ? items.map(it => make(`hireling.save.${it}`))
        : [make('hireling.save.All')]
    case 'HirelingGrantFeat':
      return items.length > 0
        ? items.map(it => ({ statKey: 'hireling.grantedFeats', value: 1, bonusType: it, source }))
        : []

    // -----------------------------------------------------------------------
    // Weapon-specific (modeled by the weapon breakdown engine)
    // -----------------------------------------------------------------------
    case 'Weapon_Alacrity':
      return [make('weapon.alacrity')]
    case 'Weapon_Keen':
      return [make('weapon.keen')]
    case 'Weapon_VorpalRange':
      return [make('weapon.vorpalRange')]
    // Universal sibling of WeaponCriticalMultiplierClass — same total (N8).
    case 'Weapon_CriticalMultiplier':
      return [make('melee.crit.multiplier')]
    case 'Weapon_CriticalMultiplier19To20':
      return [make('weapon.critMultiplier19to20')]
    // Universal sibling of WeaponCriticalRangeClass — same total (N7).
    case 'Weapon_CriticalRange':
      return [make('melee.crit.range')]
    // Crit-only damage bonuses (V2 BreakdownItemWeaponDamageBonus.cpp:184-202):
    // surfaced as `melee.crit.damage` for the DPR estimator's crit term.
    case 'Weapon_AttackAndDamageCritical':
    case 'Weapon_DamageCritical':
    case 'WeaponOtherDamageBonusCritical':
      return [make('melee.crit.damage')]
    case 'Weapon_Attack':
    case 'Weapon_AttackAbility':
    case 'Weapon_AttackAndDamage':
    case 'Weapon_AttackCritical':
    case 'Weapon_BaseDamage':
    case 'Weapon_Damage':
    case 'Weapon_DamageAbility':
    case 'Weapon_Enchantment':
    case 'Weapon_OtherDamageBonus':
    case 'WeaponOtherDamageBonus':
    case 'WeaponOtherDamageBonusClass':
    case 'WeaponOtherDamageBonusCriticalClass':
    case 'WeaponAlacrityClass':
    case 'WeaponAttackAbilityClass':
    case 'WeaponDamageAbilityClass':
    case 'WeaponDamageBonusCriticalStat':
    case 'WeaponDamageBonusStat':
    case 'WeaponProficiencyClass':
    case 'WeaponAttackBonusClass':
    case 'WeaponAttackBonusCriticalClass':
    case 'WeaponDamageBonusClass':
    case 'WeaponDamageBonusCriticalClass':
    case 'WeaponCriticalMultiplierClass':
    case 'WeaponCriticalRangeClass':
    case 'Weapon_EnchantmentClass':
    case 'WeaponAttackBonusDamageType':
    case 'WeaponAttackBonusCriticalDamageType':
    case 'WeaponDamageBonusDamageType':
    case 'WeaponDamageBonusCriticalDamageType':
    case 'WeaponKeenDamageType':
      return []

    // -----------------------------------------------------------------------
    // Niche surfaced stats (V2 parity): regen, guard, ghost touch, etc.
    // -----------------------------------------------------------------------
    case 'Regeneration':
      return [make('regeneration')]

    case 'Guard':
      return [make(items.length > 0 ? `guard.${items[0]}` : 'guard')]

    case 'GhostTouch':
      return [make('ghostTouch')]

    case 'ImplementInYourHands':
      return items.length > 0
        ? items.map(item => make(`implementInHands.${item}`))
        : [make('implementInHands.Any')]

    case 'SpellPowerReplacement':
      return items.length > 0
        ? items.map(item => make(`spellPowerReplacement.${normalizeSpellElement(item)}`))
        : []

    // -----------------------------------------------------------------------
    // Control-flow / UI-only
    // -----------------------------------------------------------------------
    case 'AddGroupWeapon':
    case 'MergeGroups':
    case 'ExclusionGroup':
    case 'ExcludeFeatSelection':
    case 'GrantFeat': {
      // V2 parity: item buffs that grant a feat cause Build::ApplyFeatEffects
      // to apply the feat's effects. Emit a grantedFeat.<FeatName> marker so
      // buildStatMap's post-pass can look up the feat and apply its effects.
      // Items are either equipped or not — no rank gating.
      const grantItems = toStringArray(buff.Item as string | string[] | undefined)
      const grants = grantItems.filter(n => n && n !== 'None')
        .map(n => ({ statKey: `grantedFeat.${n}`, value: 1, bonusType: 'GrantFeat', source }))
      if (grants.length > 0) return grants
      return []
    }
    case 'GrantSpell':
    case 'SpellListAddition':
    case 'SpellLikeAbility':
    case 'CreateSlider':
    case 'EnhancementTree':
    case 'DestinyTree':
    case 'ItemClickie':
    case 'SLACharge':
    case 'RustSusceptability':
    case 'NotModeled':
    case 'Unknown':
      return []

    // Unknown buff type → resolve via the ItemBuffs.xml template catalogue
    // (V2 Item::FindEffect/BuffValue) before giving up.
    default:
      if (catalogue) return parseItemBuffViaTemplate(buff, source, catalogue, ctx)
      return []
  }
}
