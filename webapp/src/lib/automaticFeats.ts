// V2 source: ForumExportDlg.cpp:1454-1530 (FES_AutomaticFeats), Race::GrantedFeats(),
// Class::AutomaticFeats(). Computes the auto-granted feats for a build given race
// and class data so the same logic can drive both the Builder panel and the
// forum export section.

import type { CharacterBuild, DDOClass, Feat, Race } from '../types/ddo'
import { characterLevelForClassLevel } from './levelProgression'
import { meetsRequirements, type RequirementContext } from './requirements'

export interface AutomaticFeatGroup {
  source: string
  feats: string[]
  /** Character level the group was granted at (for sorting; 0 for race/completionist). */
  charLevel?: number
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

export function buildAutomaticFeatGroups(
  build: Pick<CharacterBuild, 'race' | 'classes' | 'levelClasses' | 'totalLevel' | 'pastLives'>,
  allClasses: DDOClass[],
  allRaces: Race[],
): AutomaticFeatGroup[] {
  const groups: AutomaticFeatGroup[] = []

  if (build.race) {
    const race = allRaces.find(r => r.Name === build.race)
    if (race) {
      const feats = toArray(race.GrantedFeat).filter(Boolean)
      if (feats.length > 0) groups.push({ source: build.race, feats, charLevel: 0 })
    }
  }

  // Include the Epic/Legendary pseudo-classes — V2's automatic-feats table
  // lists their per-level grants (Epic Power/Skills/Saves/Knowledge,
  // Legendary Power/Knowledge) like any other class's.
  const classEntries: Array<{ name: string, levels: number, baseCharLevel?: number }> =
    build.classes.filter(bc => bc.name && bc.levels > 0).map(bc => ({ name: bc.name, levels: bc.levels }))
  const b = build as Pick<CharacterBuild, 'epicLevels' | 'legendaryLevels'> & typeof build
  if ((b.epicLevels ?? 0) > 0) classEntries.push({ name: 'Epic', levels: b.epicLevels ?? 0, baseCharLevel: 20 })
  if ((b.legendaryLevels ?? 0) > 0) classEntries.push({ name: 'Legendary', levels: b.legendaryLevels ?? 0, baseCharLevel: 30 })
  for (const bc of classEntries) {
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.AutomaticFeats) continue
    for (const autoFeat of cls.AutomaticFeats) {
      const classLvl = autoFeat.Level ?? 1
      if (classLvl > bc.levels) continue
      const featNames = toArray(autoFeat.Feats).filter(Boolean)
      if (featNames.length === 0) continue
      // V2 parity: the auto-feat is granted at the character level where the
      // class hits this class-level. Surface this so the panel and forum
      // export can sort and label correctly for multi-class builds.
      const charLvl = bc.baseCharLevel !== undefined
        ? bc.baseCharLevel + classLvl
        : characterLevelForClassLevel(build, bc.name, classLvl)
      const sourceLabel = charLvl
        ? `Lv ${charLvl} — ${bc.name} ${classLvl}`
        : `${bc.name} Lv ${classLvl}`
      groups.push({ source: sourceLabel, feats: featNames, charLevel: charLvl })
    }
  }

  // V2 DDOBuilder.cpp:494-550 (dynamic Completionist requirement, rebuilt at
  // data-load time): grouped by base class so archetypes (BaseClass set,
  // e.g. Stormsinger→Bard) satisfy their group via EITHER the base class's
  // own "Past Life: <Class>" OR any archetype's "Past Life: <Base> -
  // <Archetype>", each needing only >=1 (not >=3 — that threshold is for
  // races only). The "Unknown" placeholder class (Class_Unknown) is excluded,
  // matching `cit.GetBaseClass() != Class_Unknown`.
  const heroicClasses = allClasses.filter(c => !c.NotHeroic && c.Name !== 'Unknown')
  if (heroicClasses.length > 0) {
    const classGroups = new Map<string, string[]>()
    for (const c of heroicClasses) {
      const base = c.BaseClass || c.Name
      const key = c.BaseClass ? `${c.BaseClass} - ${c.Name}` : c.Name
      if (!classGroups.has(base)) classGroups.set(base, [])
      classGroups.get(base)!.push(key)
    }
    const complete = Array.from(classGroups.values())
      .every(keys => keys.some(k => (build.pastLives[k] ?? 0) >= 1))
    if (complete) groups.push({ source: 'Completionist', feats: ['Completionist'], charLevel: 0 })
  }

  // V2 DDOBuilder.cpp:555-577: every non-iconic race that supports past
  // lives (`!HasNoPastLife()`) needs "Past Life: <Race>" >=3.
  const heroicRaceNames = allRaces.filter(r => !r.NotHeroic && !r.IsIconic && !r.NoPastLife).map(r => r.Name)
  if (heroicRaceNames.length > 0 && heroicRaceNames.every(rn => (build.pastLives[rn] ?? 0) >= 3)) {
    groups.push({ source: 'Racial Completionist', feats: ['Racial Completionist'], charLevel: 0 })
  }

  // Sort: race/completionist first (charLevel=0), then by character level ascending.
  return groups.sort((a, b) => (a.charLevel ?? 0) - (b.charLevel ?? 0))
}

// V2 Build::AutomaticFeats (Build.cpp:2510-2552): beyond race GrantedFeat and
// class AutomaticFeats (both handled above), any Feat with Acquire="Automatic"
// and an <AutomaticAcquisition> requirement block (Sunder/Trip/Defensive
// Fighting at BAB 1, Attack/Sneak/Heroic Durability at level 1) is trained the
// moment its requirement is met, and V2's forum export (AddAutomaticFeats)
// lists them per level like any other automatic feat. `buildStats.ts` already
// applies the ones with real stat effects (Heroic Durability, Improved Heroic
// Durability) — this is the matching display-side enumeration, kept separate
// from `buildAutomaticFeatGroups` so `featEligibility.ts`'s own
// AutomaticAcquisition prerequisite-counting loop (which already covers this
// same feat set) isn't double-counted.
//
// Completionist / Racial Completionist are excluded: their real V2 gating is
// computed dynamically from past-life counts (see `buildAutomaticFeatGroups`
// above) — the XML AutomaticAcquisition entry is a placeholder V2 overrides
// at runtime (per Feats.xml's own "requirements are updated dynamically by
// the C++ code" comment).
export function automaticAcquisitionFeatGroup(
  build: Pick<CharacterBuild, 'classes' | 'totalLevel' | 'epicLevels' | 'legendaryLevels' | 'featChoices'>,
  allFeats: Feat[],
  allClasses: DDOClass[],
  race?: Race,
): AutomaticFeatGroup | null {
  const ctx: RequirementContext = { build: build as CharacterBuild, allClasses, race }
  const names: string[] = []
  for (const f of allFeats) {
    if (f.Acquire !== 'Automatic') continue
    if (f.Name === 'Completionist' || f.Name === 'Racial Completionist') continue
    if (!f.AutomaticAcquisition) continue
    if (meetsRequirements(f.AutomaticAcquisition, ctx)) names.push(f.Name)
  }
  // V2 Class::ImprovedHeroicDurabilityFeats (Class.cpp:383-404): every heroic
  // class dynamically synthesizes "Improved Heroic Durability (<Class> <N>)"
  // feats auto-acquired at class level 5, 10 and 15.
  for (const bc of build.classes) {
    if (!bc.name || bc.levels <= 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls || cls.NotHeroic) continue
    for (let level = 5; level <= 15; level += 5) {
      if (bc.levels >= level) names.push(`Improved Heroic Durability (${bc.name} ${level})`)
    }
  }
  return names.length > 0 ? { source: 'Automatically Acquired', feats: names, charLevel: 0 } : null
}

/**
 * Every feat the character HAS, whatever path it arrived by: feats trained in
 * a slot, the race's granted feats and the class automatic feats (Dark Hunter's
 * Two Weapon Fighting at class level 2, Improved Two Weapon Fighting at 6, …).
 *
 * V2's Build::CurrentFeats is the same union, and everything that asks "does
 * this character have feat X?" reads it — a granted feat is not a lesser feat.
 * Reading `build.featChoices` alone answers that question wrongly for every
 * class grant: it both let the player re-train a feat the class already gave
 * them and left the granted copy out of the combat maths.
 */
export function acquiredFeatNames(
  build: Pick<CharacterBuild,
    'race' | 'classes' | 'levelClasses' | 'totalLevel' | 'pastLives' | 'featChoices' | 'favorFeats'>,
  allClasses: DDOClass[],
  allRaces: Race[],
  specialFeats: string[] = [],
): Set<string> {
  const names = new Set<string>()
  for (const f of Object.values(build.featChoices ?? {})) if (f) names.add(f)
  for (const g of buildAutomaticFeatGroups(build, allClasses, allRaces)) {
    for (const f of g.feats) names.add(f)
  }
  for (const f of build.favorFeats ?? []) names.add(f)
  for (const f of specialFeats) names.add(f)
  return names
}
