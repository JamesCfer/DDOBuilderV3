// Pure feat-slot eligibility engine, extracted verbatim from
// components/builder/FeatSlots.tsx so non-React consumers (the random-build
// parity fuzzer, CLI scripts) can compute exactly what the UI offers.
// FeatSlots.tsx imports these — there is ONE implementation.

import type { CharacterBuild, DDOClass, Feat, Race } from '../types/ddo'
import { buildSnapshotAtCharacterLevel } from './levelProgression'
import { meetsRequirements } from './requirements'
import { buildAutomaticFeatGroups } from './automaticFeats'
import type { SlotEntry } from './levelTraining'

// V2 behavior: feats with <Group>X</Group> can be trained in slots whose
// FeatType is X. The "Heroic" universal slot is treated as type "Standard".
// "Epic Feat" slots additionally allow Standard-group feats (heroic feats
// can be re-taken as Epic feats).
// When `epicOnly` (V2 "Show only Epic feats for Epic feat slots" +
// !ShowUnavailable, Build.cpp:1539-1549) is set, Standard-group feats are NOT
// re-takable in Epic slots unless they are also Epic-group.
export function slotMatchesFeat(slotType: string, featGroups: string[], epicOnly = false): boolean {
  const matchType = slotType === 'Heroic' ? 'Standard' : slotType
  if (featGroups.includes(matchType)) return true
  if (matchType === 'Epic Feat' && featGroups.includes('Standard') && !epicOnly) return true
  return false
}

// ---------------------------------------------------------------------------
// Build snapshot at a specific slot's level (V2 parity)
// ---------------------------------------------------------------------------
// Returns the build "as it looked" right before the character was about to
// gain feats at this slot. Class levels come from levelClasses[0..slot.level-1]
// — exact, not proportional. Feat choices include only those trained at an
// earlier character-level slot.
export function buildSnapshotForSlot(
  slot: SlotEntry,
  slots: SlotEntry[],
  build: CharacterBuild,
): CharacterBuild {
  // Class levels: snapshot the per-level array up to (and including) this slot's
  // character level. For class-specific slots the slot level *is* the level the
  // owning class hits the relevant class-level, so the included entry is correct.
  const snap = buildSnapshotAtCharacterLevel(build, slot.level)

  // Feat choices: feats trained at this character level or earlier count —
  // INCLUDING other slots at the same level. V2 Build::CurrentFeats(level)
  // gathers every level's TrainedFeats up to and including `level`, so e.g.
  // Dodge and Mobility can both be trained at character level 1 (standard +
  // class bonus slot) with Mobility's Dodge prerequisite satisfied.
  const featChoices: Record<string, string> = {}
  for (const [key, value] of Object.entries(build.featChoices)) {
    if (!value || key === slot.key) continue
    const other = slots.find(s => s.key === key)
    if (!other) continue
    if (other.level <= slot.level) {
      featChoices[key] = value
    }
  }

  return { ...snap, featChoices }
}

/**
 * V2 Build::CurrentFeats(level) equivalent: the full feat set that
 * prerequisite checks evaluate against at a slot — trained feats up to and
 * including the slot's level (already in `snap.featChoices`), automatic
 * class/race feats granted by then, and special feats (past lives, favor
 * rewards, Life special feats) which V2 always includes regardless of level.
 */
export function prereqFeatCounts(
  snap: CharacterBuild,
  slotLevel: number,
  allClasses: DDOClass[],
  race: Race | undefined,
  specialFeats: string[] = [],
  allFeats?: Feat[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  const add = (name: string, n = 1) => {
    if (name) counts[name] = (counts[name] ?? 0) + n
  }
  for (const v of Object.values(snap.featChoices)) if (v) add(v)
  // AutomaticAcquisition feats (V2 Build::UpdateFeats evaluates each feat's
  // <AutomaticAcquisition> requirements per level): Sunder/Trip/Defensive
  // Fighting (BAB 1), Attack/Sneak/Heroic Durability (level 1), etc. count
  // toward prerequisites — e.g. Improved Sunder requires the automatic Sunder.
  if (allFeats) {
    const ctx = { build: snap, allClasses, race }
    for (const f of allFeats) {
      if (f.Acquire !== 'Automatic') continue
      const aa = (f as Feat & { AutomaticAcquisition?: unknown }).AutomaticAcquisition
      if (aa === undefined) continue
      if (meetsRequirements(aa as never, ctx)) add(f.Name)
    }
  }
  // Automatic class/race feats granted at or before this character level.
  for (const g of buildAutomaticFeatGroups(snap, allClasses, race ? [race] : [])) {
    if ((g.charLevel ?? 0) <= slotLevel) g.feats.forEach(f => add(f))
  }
  // Special feats: past lives (heroic/racial keys are stored stripped of the
  // "Past Life: " prefix — requirements name the full feat), favor feats,
  // and any Life-level special feats the caller supplies.
  for (const [name, n] of Object.entries(snap.pastLives ?? {})) {
    add(name.startsWith('Past Life') ? name : `Past Life: ${name}`, n)
  }
  for (const f of snap.favorFeats ?? []) add(f)
  for (const f of specialFeats) add(f)
  return counts
}

// ---------------------------------------------------------------------------
// Option filtering
// ---------------------------------------------------------------------------
export interface FeatOption {
  feat: Feat
  prereqsMet: boolean
}

export interface OptionSettings {
  /** V2 ShowEpicOnly && !ShowUnavailable (Build.cpp:1539-1549). */
  epicOnly?: boolean
  /** V2 ShowUnavailable — ignore-listed feats stay visible (Build.cpp:1455-1459). */
  showUnavailable?: boolean
  /** V2 IsInIgnoreList when "Ignore Lists Active". */
  isIgnored?: (name: string) => boolean
  /** Life-level special feats (V2 Build::SpecialFeats) for prerequisite counts. */
  specialFeats?: string[]
}

export function featOptionsForSlot(
  slot: SlotEntry,
  slots: SlotEntry[],
  feats: Feat[],
  build: CharacterBuild,
  allClasses: DDOClass[],
  race?: Race,
  opt: OptionSettings = {},
): FeatOption[] {
  // Snapshot of the build state just before this slot is chosen
  const snap = buildSnapshotForSlot(slot, slots, build)
  // V2 Build::CurrentFeats(level): trained + automatic + special feats all
  // count toward prerequisites (e.g. Stunning Fist requires the automatic
  // Monk feat "Flurry of Blows"; epic feats require "Past Life: X" ×N).
  const featCounts = prereqFeatCounts(snap, slot.level, allClasses, race, opt.specialFeats, feats)
  const featSet = new Set(Object.keys(featCounts))
  const reqCtx = { build: snap, allClasses, race, feats: featSet, featCounts }

  // Exclude feats already trained to their MaxTimesAcquire limit in other
  // slots (V2 Build.cpp:1584: bCanTrain = trainedCount < MaxTimesAcquire,
  // default 1). Toughness (MaxTimesAcquire 99) and other multi-acquire feats
  // stay offered no matter how many slots already hold them.
  const chosenCounts = new Map<string, number>()
  for (const [k, v] of Object.entries(build.featChoices)) {
    if (k === slot.key || !v) continue
    chosenCounts.set(v, (chosenCounts.get(v) ?? 0) + 1)
  }

  return feats
    .filter(f => {
      if ((chosenCounts.get(f.Name) ?? 0) >= (f.MaxTimesAcquire ?? 1)) return false
      if (f.Acquire && f.Acquire !== 'Train') return false

      // V2 Build::TrainableFeats:1455-1459 — ignore-listed feats are hidden
      // unless ShowUnavailable is on (or it is the slot's current choice).
      if (opt.isIgnored?.(f.Name) && !opt.showUnavailable
          && build.featChoices[slot.key] !== f.Name) return false

      // Match feat group to slot type (V2 behavior, Build.cpp:1523-1527).
      // NOTE: a slot's FeatUpdateList is NOT a per-slot whitelist — V2's
      // UpdateFeats (DDOBuilder.cpp:1293-1320) folds those names into the
      // feats' Group lists at load time (see loadFeats), after which ALL
      // slots of that FeatType use plain group matching. Treating the list
      // as authoritative both hid group-tagged feats from the listed slot
      // (Stunning Fist in Monk Bonus level 1) and hid listed feats from
      // unlisted same-type slots (Two Weapon Fighting in Monk Bonus 2/6).
      const featGroups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
      const epicOnly = (opt.epicOnly ?? false) && !(opt.showUnavailable ?? false)
      if (slotMatchesFeat(slot.featType, featGroups, epicOnly)) return true

      // V2 Build.cpp:1528-1538: ConditionalGroup adds extra group memberships when
      // its RequirementsToUse (here the nested Requirements) are met.
      const cg = f.ConditionalGroup
      if (cg) {
        const condGroups = Array.isArray(cg.Group) ? cg.Group : cg.Group ? [cg.Group] : []
        if (condGroups.length > 0
          && slotMatchesFeat(slot.featType, condGroups, epicOnly)
          && meetsRequirements(cg.Requirements, reqCtx)) {
          return true
        }
      }
      return false
    })
    .map(f => ({ feat: f, prereqsMet: meetsRequirements(f.Requirements, reqCtx) }))
    .sort((a, b) => {
      if (a.prereqsMet !== b.prereqsMet) return a.prereqsMet ? -1 : 1
      return a.feat.Name.localeCompare(b.feat.Name)
    })
}
