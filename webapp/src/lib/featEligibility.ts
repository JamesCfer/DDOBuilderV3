// Pure feat-slot eligibility engine, extracted verbatim from
// components/builder/FeatSlots.tsx so non-React consumers (the random-build
// parity fuzzer, CLI scripts) can compute exactly what the UI offers.
// FeatSlots.tsx imports these — there is ONE implementation.

import type { CharacterBuild, DDOClass, Feat, Race } from '../types/ddo'
import { buildSnapshotAtCharacterLevel } from './levelProgression'
import { meetsRequirements } from './requirements'
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

  // Feat choices: only feats trained in a strictly-earlier slot count. Same-
  // level slots (e.g. two heroic feats at level 1) cannot satisfy each other.
  const featChoices: Record<string, string> = {}
  for (const [key, value] of Object.entries(build.featChoices)) {
    if (!value || key === slot.key) continue
    const other = slots.find(s => s.key === key)
    if (!other) continue
    if (other.level < slot.level) {
      featChoices[key] = value
    }
  }

  return { ...snap, featChoices }
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

  // Exclude already-chosen feats in other slots (use FULL build for exclusion
  // so feats taken later are still blocked from being double-taken)
  const chosenElsewhere = new Set(
    Object.entries(build.featChoices)
      .filter(([k, v]) => k !== slot.key && v)
      .map(([, v]) => v)
  )

  const updateList = slot.featUpdateList

  return feats
    .filter(f => {
      if (chosenElsewhere.has(f.Name)) return false
      if (f.Acquire && f.Acquire !== 'Train') return false

      // V2 Build::TrainableFeats:1455-1459 — ignore-listed feats are hidden
      // unless ShowUnavailable is on (or it is the slot's current choice).
      if (opt.isIgnored?.(f.Name) && !opt.showUnavailable
          && build.featChoices[slot.key] !== f.Name) return false

      // If the slot has an explicit FeatUpdateList, it's the authoritative whitelist
      if (updateList && updateList.length > 0) {
        return updateList.includes(f.Name)
      }

      // Otherwise: match feat group to slot type (V2 behavior, Build.cpp:1523-1527)
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
          && meetsRequirements(cg.Requirements, { build: snap, allClasses, race })) {
          return true
        }
      }
      return false
    })
    .map(f => ({ feat: f, prereqsMet: meetsRequirements(f.Requirements, { build: snap, allClasses, race }) }))
    .sort((a, b) => {
      if (a.prereqsMet !== b.prereqsMet) return a.prereqsMet ? -1 : 1
      return a.feat.Name.localeCompare(b.feat.Name)
    })
}
