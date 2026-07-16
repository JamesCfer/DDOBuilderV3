// V2 parity: shared Requirements::Met implementation.
//
// V2 Requirement.cpp:Evaluate*() handles every requirement type. V3 had
// its own private copy inside FeatSlots.tsx; consolidating it here lets
// enhancements, item-equip rules, and spell-train rules use the same
// engine.
//
// V2 sources cited:
//   Requirement.cpp:780-836  Evaluate{Class,ClassMinLevel,BaseClassMinLevel,…}
//   Requirement.cpp:864      EvaluateSpecificLevel
//   Requirement.cpp:880-905  EvaluateAbility / Skill / BAB
//   Requirement.cpp:944-990  EvaluateAlignment / Race / RaceConstruct …
import type {
  Ability, CharacterBuild, DDOClass, Race, Requirement, RequiresOneOf,
  Requirements,
} from '../types/ddo'
import {
  abilityAtLevel, classLevelsAtLevel, getLevelClasses, tomeCapAtLevel,
} from './levelProgression'

// ---------------------------------------------------------------------------
// BAB helper (V2 parity: per-class table sum)
// ---------------------------------------------------------------------------

function classBABAtLevels(cls: DDOClass | undefined, levels: number): number {
  if (!cls?.BAB) return Math.floor(levels * 0.75)
  const arr = String(cls.BAB).trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  return arr[Math.min(levels, arr.length - 1)] ?? 0
}

function totalBAB(build: CharacterBuild, allClasses: DDOClass[]): number {
  const lc = getLevelClasses(build)
  const counts: Record<string, number> = {}
  for (const c of lc) if (c) counts[c] = (counts[c] ?? 0) + 1
  if ((build.epicLevels ?? 0) > 0) counts['Epic'] = build.epicLevels
  if ((build.legendaryLevels ?? 0) > 0) counts['Legendary'] = build.legendaryLevels
  let sum = 0
  for (const [name, levels] of Object.entries(counts)) {
    const cls = allClasses.find(c => c.Name === name)
    sum += classBABAtLevels(cls, levels)
  }
  return sum
}

// ---------------------------------------------------------------------------
// Single-requirement evaluator
// ---------------------------------------------------------------------------

export interface RequirementContext {
  build: CharacterBuild
  allClasses: DDOClass[]
  /** Optional race object — folds racial ability/skill bonuses into checks. */
  race?: Race
  /** Optional pre-built feat name set; defaults to build.featChoices values. */
  feats?: Set<string>
  /**
   * V2 parity: map of groupName → claimant InternalName derived from trained
   * enhancements with ExclusionGroup effects. When provided, Exclusive
   * requirements are evaluated strictly; when absent, they pass conservatively.
   * Use computeExclusionGroups() from lib/exclusionGroups.ts to build this.
   */
  exclusionGroups?: Record<string, string>
  /**
   * V2 parity: Requirement.cpp:1062-1072  EvaluateStance.
   * When provided, Stance requirements are evaluated strictly against this list
   * (build.activeBuffs). When absent, they pass conservatively.
   */
  activeBuffs?: string[]
  /**
   * V2 parity: Requirement.cpp:870-911 EvaluateFeat counts acquisitions
   * (trained + special/favor) and compares against the requirement's Value
   * (default 1) — e.g. universal-tree access via "<X> Favor Rewards" ×3.
   * When provided, Feat/FeatAnySource requirements with Value > 1 compare
   * against these counts; when absent, they fall back to set membership
   * (the pre-existing behavior). Build with buildFeatCountMap() from
   * lib/treeAvailability.ts.
   */
  featCounts?: Record<string, number>
}

function getFeatSet(ctx: RequirementContext): Set<string> {
  if (ctx.feats) return ctx.feats
  return new Set(Object.values(ctx.build.featChoices).filter(Boolean))
}

export function meetsSingleRequirement(req: Requirement, ctx: RequirementContext): boolean {
  const item = Array.isArray(req.Item) ? req.Item[0] : req.Item ?? ''
  const value = req.Value ?? 0
  const { build, allClasses } = ctx

  switch (req.Type) {
    case 'Ability': {
      const charLvl = Math.max(1, build.totalLevel || 1)
      const tomeRaw = (build.abilityTomes ?? {})[item as Ability] ?? 0
      const tome = Math.min(tomeRaw, tomeCapAtLevel(charLvl))
      const racial = ctx.race ? Number((ctx.race as unknown as Record<string, unknown>)[item] ?? 0) || 0 : 0
      return abilityAtLevel(build, item as Ability, charLvl, racial, tome) >= value
    }
    case 'BAB':
      return totalBAB(build, allClasses) >= value
    case 'Feat':
    case 'FeatAnySource': {
      // V2 Requirement.cpp:870-911: both check the trained-feat set; FeatAnySource
      // additionally accepts granted feats, which getFeatSet already folds in.
      // With Value set, V2 requires that many acquisitions (trained + special);
      // honored when the caller supplies featCounts, else set membership.
      if (ctx.featCounts) return (ctx.featCounts[item] ?? 0) >= (req.Value ?? 1)
      return getFeatSet(ctx).has(item)
    }
    case 'Race':
      return build.race === item
    case 'RaceConstruct':
      // V2 Requirement.cpp:1031: race.HasIsConstruct(). Only Warforged/Bladeforged
      // carry IsConstruct in the race data.
      return build.race === 'Warforged' || build.race === 'Bladeforged'
    case 'NotConstruct':
      // V2 Requirement.cpp:1004: !race.HasIsConstruct().
      return !(build.race === 'Warforged' || build.race === 'Bladeforged')
    case 'AlignmentType': {
      // V2 Requirement.cpp:662-706: match the build alignment against an axis option
      // (Lawful/Chaotic/Good/Evil/TrueNeutral/PartNeutral). Alignment strings here
      // are like "Lawful Good", "True Neutral", "Chaotic Evil".
      const a = build.alignment
      switch (item) {
        case 'Lawful':       return a.includes('Lawful')
        case 'Chaotic':      return a.includes('Chaotic')
        case 'Good':         return a.includes('Good')
        case 'Evil':         return a.includes('Evil')
        case 'TrueNeutral':  return a === 'True Neutral'
        case 'PartNeutral':  return a.includes('Neutral') && a !== 'True Neutral'
        default:             return false
      }
    }
    case 'Class':
      return build.classes.some(c => c.name === item && c.levels > 0)
    case 'ClassLevel': {
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) >= value
    }
    case 'BaseClass': {
      // V2 Requirement.cpp:719-731: BaseClassLevels >= Value (or > 0 if no Value).
      const lvls = classLevelsAtLevel(build, item, build.totalLevel || 20, allClasses, true)
      return req.Value !== undefined ? lvls >= value : lvls > 0
    }
    case 'ClassAtLevel': {
      // V2 Requirement.cpp:806-825: classLevels == Value (and class-at-level == item).
      // V3 has no per-level class-at-level snapshot here; match the exact-level
      // count which is the build-affecting half of the predicate.
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) === value
    }
    case 'BaseClassAtLevel': {
      // V2 Requirement.cpp:733-778: base-class-aware exact-level match.
      const lvls = classLevelsAtLevel(build, item, build.totalLevel || 20, allClasses, true)
      return req.Value !== undefined ? lvls === value : lvls > 0
    }
    case 'AbilityGreaterCondition': {
      // V2 Requirement.cpp:633-645: value(Item[0]) > value(Item[1]).
      const its = Array.isArray(req.Item) ? req.Item : req.Item ? [req.Item] : []
      if (its.length < 2) return false
      const charLvl = Math.max(1, build.totalLevel || 1)
      const score = (ab: string) => {
        const tomeRaw = (build.abilityTomes ?? {})[ab as Ability] ?? 0
        const tome = Math.min(tomeRaw, tomeCapAtLevel(charLvl))
        const racial = ctx.race ? Number((ctx.race as unknown as Record<string, unknown>)[ab] ?? 0) || 0 : 0
        return abilityAtLevel(build, ab as Ability, charLvl, racial, tome)
      }
      return score(its[0]) > score(its[1])
    }
    case 'ClassMinLevel': {
      if (!item || item === 'Any') {
        return build.classes.some(c => c.levels >= value)
      }
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) >= value
    }
    case 'BaseClassMinLevel':
      return classLevelsAtLevel(build, item, build.totalLevel || 20, allClasses, true) >= value
    case 'Level':
    case 'SpecificLevel':
      return build.totalLevel >= value
    case 'Alignment':
      return build.alignment === item
    case 'Enhancement': {
      // Allow either trained (rank > 0) or trained-with-min-rank.
      const minRank = value
      for (const choices of Object.values(build.enhancementChoices ?? {})) {
        const rank = choices[item] ?? 0
        if (rank > 0 && (minRank === 0 || rank >= minRank)) return true
      }
      return false
    }
    case 'Stance':
      // V2 parity: Requirement.cpp:1062 EvaluateStance — build.IsStanceActive().
      // Evaluate strictly when activeBuffs is provided; pass conservatively otherwise.
      return ctx.activeBuffs ? ctx.activeBuffs.includes(item) : true
    case 'EnemyType':
      // V2 parity: BOTH dispatches hard-fail this type — Requirements::Met
      // (Requirement.cpp:467) and CanTrainEnhancement (:513) use
      // `met = false`. Never met inside the planner.
      return false
    case 'Skill':
      // Skill ranks are character-level dependent; we don't track per-level
      // ranks yet (skillRanksByLevel is in flight). Treat as met to avoid
      // false negatives.
      return true
    case 'StartingWorld':
      return true
    case 'WeaponTypesEquipped':
    case 'GroupMember':
    case 'GroupMember2':
    case 'WeaponClassMainHand':
    case 'WeaponClassOffHand':
    case 'ItemTypeInSlot':
    case 'ItemSlot':
    case 'MaterialType':
      // V2 Requirement.cpp: these depend on the currently-equipped weapon / item /
      // slot, which this trainability context does not carry. Conservative pass —
      // they gate runtime effect activation (handled in effectParser via weaponTypes),
      // not whether a feat/enhancement can be trained at all.
      return true
    case 'Exclusive': {
      // V2 parity: Build::IsExclusiveEnhancement (Build.cpp:3617-3636).
      // Exclusive requirement has Item[0]=enhancementInternalName, Item[1]=groupName.
      // When no exclusionGroups map is provided we pass conservatively to avoid
      // false negatives in contexts that don't populate the map yet.
      if (!ctx.exclusionGroups) return true
      const its = Array.isArray(req.Item) ? req.Item : req.Item ? [req.Item] : []
      const enhancementId = its[0] ?? ''
      const groupName = its[its.length - 1] ?? ''  // back() in V2: last element
      const claimed = ctx.exclusionGroups[groupName]
      // isUs || !found — V2 logic: passes if we own the group or it's unclaimed
      return !claimed || claimed === enhancementId
    }
    default:
      return true
  }
}

export function meetsOneOfGroup(group: RequiresOneOf, ctx: RequirementContext): boolean {
  const reqs = Array.isArray(group.Requirement) ? group.Requirement : [group.Requirement]
  return reqs.some(r => meetsSingleRequirement(r, ctx))
}

export function meetsRequirements(
  reqs: Requirements | undefined,
  ctx: RequirementContext,
): boolean {
  if (!reqs) return true

  if (reqs.Requirement) {
    const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
    if (!list.every(r => meetsSingleRequirement(r, ctx))) return false
  }

  if (reqs.RequiresOneOf) {
    const groups = Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf]
    if (!groups.every(g => meetsOneOfGroup(g, ctx))) return false
  }

  if (reqs.RequiresNoneOf) {
    const groups = Array.isArray(reqs.RequiresNoneOf) ? reqs.RequiresNoneOf : [reqs.RequiresNoneOf]
    if (groups.some(g => meetsOneOfGroup(g, ctx))) return false
  }

  return true
}
