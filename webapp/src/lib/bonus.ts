// DDO bonus stacking engine
//
// Rules:
//   EXCLUSIVE types: only the highest positive and lowest (most negative) value
//   per bonus type are "active". All other contributions from that type are
//   suppressed.
//
//   STACKING types: every bonus in the group contributes to the total
//   regardless of magnitude.
//
// The exclusive set is initialised from the hard-coded fallback below, but
// callers should call initBonusTypes() at startup with the BonusTypes.xml
// data so the engine stays in sync with upstream data changes.

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RawBonus {
  value: number
  type: string    // 'Enhancement', 'Dodge', 'Feat', 'Racial', etc.
  source: string  // human-readable source name
  // V2 parity: feat/enhancement effects (m_effects) are summed without
  // bonus-type stacking rules; only item effects (m_itemEffects) have
  // "Highest Only" applied. Set fromGear=true for item-sourced bonuses.
  fromGear?: boolean
  // V2 <Percent/> flag: value is a percentage of the stat's base total
  // (applied in a post-pass in useBuildStats), not a flat amount.
  percent?: boolean
  // V2 stack-merge (BreakdownItem::AddEffect + Amount_Stacks): identical
  // AType=Stacks effects (same DisplayName/Type/Bonus/Item/Amount) MERGE into
  // one effect whose value is Amount[stackCount-1], NOT the sum. stackGroup is
  // the identity key; stackAmounts is the parsed Amount table. Collapsed in a
  // post-pass in buildStats. e.g. Monk "Ocean Stance: Strength Penalty" from
  // Ocean Stance + Adept/Master/Grandmaster of Forms = one -2, not -8.
  stackGroup?: string
  stackAmounts?: number[]
  // Number of AddEffect "applications" this single bonus represents (its own
  // trained rank) — the cross-source stack-merge sums these instead of
  // counting contributors (V2 Effect.cpp Amount_Stacks: m_stacks is a running
  // total across every source sharing the effect signature).
  stackRank?: number
  // V2 Effect identity (DisplayName / owner's stamped name) — when present,
  // the gear-pool identical-effect merge keys on this instead of `source`,
  // matching Effect::operator== (cross-source merges like the four
  // Shadowdancer cores' "Epic Spell DCs" +1s → one ×4 effect).
  v2Name?: string
}

export interface ResolvedBonus extends RawBonus {
  active: boolean  // false = suppressed by a higher exclusive-type bonus
}

export interface ResolvedStat {
  total: number
  bonuses: ResolvedBonus[]
}

/** Minimal shape we need from BonusTypes.xml entries. */
export interface BonusTypeEntry {
  Name: string
  Stacking?: string
}

/**
 * Builds the exclusive (Highest-Only) set from BonusTypes.xml data.
 * Names are trimmed to handle trailing-space variants in the XML.
 */
export function buildExclusiveSet(specs: BonusTypeEntry[]): Set<string> {
  const s = new Set<string>()
  for (const spec of specs) {
    if ((spec.Stacking ?? 'Highest Only') !== 'Always') {
      s.add(spec.Name.trim())
    }
  }
  return s
}

/**
 * Replace the module-level exclusive set with one derived from BonusTypes.xml.
 * Call this once at startup (useStaticBundle, CLI scripts) so that any upstream
 * additions or rule changes propagate automatically.
 */
export function initBonusTypes(specs: BonusTypeEntry[]): void {
  exclusiveTypes = buildExclusiveSet(specs)
}

/** Restore the hard-coded fallback set. Intended for use in tests only. */
export function resetBonusTypes(): void {
  exclusiveTypes = EXCLUSIVE_FALLBACK
}

// ---------------------------------------------------------------------------
// Exclusive (non-stacking) bonus types — hard-coded fallback
// Only the single highest positive value and single lowest (most negative)
// negative value per type contribute to the total.
// ---------------------------------------------------------------------------
const EXCLUSIVE_FALLBACK = new Set([
  'Action Boost',
  'Alchemical',
  'Armor',
  'Artifact',
  'Base',
  'Centered',
  'Circumstance',
  'Class',
  'Combat Style',
  'Competence',
  'Deflection',
  'Determination',
  'Divine',
  'Elemental Energy',
  'Elemental Spell Power',
  'Enchantment',
  'Enhancement',
  'Epic',
  'Equipment',
  'Eternal Faith',
  'Exceptional',
  'False Life',
  'Feat',
  'Festive',
  'Fortune',
  'Greater Elemental Energy',
  'Greater Elemental Spell Power',
  'Guild',
  'Implement',
  'Improved Elemental Energy',
  'Improved Elemental Spell Power',
  'Inherent',
  'Insightful',
  'Inspiration',
  'Keen',
  'Legendary',
  'Legendary Elemental Energy',
  'Legendary Elemental Spell Power',
  'Level Up',
  'Luck',
  'Morale',
  'Music',
  'Natural Armor',
  'Not Set',
  'Orb',
  'Pirate',
  'Primal',
  'Profane',
  'Psionic',
  'Quality',
  'Racial',
  'Rage',
  'Resistance',
  'Sacred',
  'Shield',
  'Silver Flame',
  'Size',
  'Special',
  'Spooky',
  'Universal',
  'Vitality',
  'Weapon Enchantment',
])

// Module-level exclusive set — replaced by initBonusTypes() when XML is loaded.
let exclusiveTypes: Set<string> = EXCLUSIVE_FALLBACK

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

/**
 * Groups bonuses by type, applies DDO stacking rules, and returns the total
 * plus each bonus annotated with whether it is active or suppressed.
 */
export function resolveBonus(bonuses: RawBonus[]): ResolvedStat {
  if (bonuses.length === 0) {
    return { total: 0, bonuses: [] }
  }

  // Group by normalised type (case-sensitive to match DDO data exactly)
  const byType = new Map<string, RawBonus[]>()
  for (const b of bonuses) {
    const group = byType.get(b.type)
    if (group) {
      group.push(b)
    } else {
      byType.set(b.type, [b])
    }
  }

  const resolved: ResolvedBonus[] = []
  let total = 0

  for (const [type, group] of byType) {
    if (exclusiveTypes.has(type)) {
      // -----------------------------------------------------------------------
      // Exclusive type — V2 parity split:
      //   Gear contributions (fromGear=true): only highest positive and lowest
      //   negative are active (standard "Highest Only" item stacking).
      //   Non-gear contributions (feats / enhancements / race): always stack,
      //   matching V2's m_effects which bypass RemoveNonStacking entirely.
      // -----------------------------------------------------------------------
      const rawGearBonuses = group.filter(b => b.fromGear)
      const nonGearBonuses = group.filter(b => !b.fromGear)

      // V2 BreakdownItem::AddEffect merges IDENTICAL effects into ONE entry
      // with a stack count, and Amount_Simple totals amount × stacks. The
      // merge happens BEFORE RemoveNonStacking, so identical item effects
      // are exempt from Highest-Only and multiply instead (Epic Ring of the
      // Buccaneer carries GoodLuck +1 Luck twice → +2 in V2). V2 equality is
      // content-based (Effect::operator==); approximated here by
      // (source, value, percent) — duplicates within one item share all
      // three, while different items' same-value effects usually differ by
      // DisplayName in V2 and compete Highest-Only instead.
      const gearBonuses: RawBonus[] = []
      {
        const seen = new Map<string, { merged: RawBonus; stacks: number; unit: number }>()
        for (const b of rawGearBonuses) {
          const key = `${b.v2Name ?? b.source}|${b.value}|${b.percent === true}`
          const prev = seen.get(key)
          if (prev) {
            prev.stacks++
            prev.merged.value = prev.unit * prev.stacks
            prev.merged.source = `${b.source} (×${prev.stacks} identical)`
          } else {
            const merged = { ...b }
            seen.set(key, { merged, stacks: 1, unit: b.value })
            gearBonuses.push(merged)
          }
        }
      }

      // Within gear: ONE winner per bonus type, by ABSOLUTE value — V2
      // RemoveNonStacking compares fabs(TotalAmount): a −2 Resistance
      // penalty is a "lesser version" of a +7 Resistance and is dropped
      // (Thaarak Fang −2 vs Drow Sage's Cowl +7 → +7, not +5). On equal
      // magnitudes V2's pairwise sweep removes the earlier entry, so the
      // LAST one listed survives (>=).
      let winner: RawBonus | undefined
      for (const b of gearBonuses) {
        if (winner === undefined || Math.abs(b.value) >= Math.abs(winner.value)) {
          winner = b
        }
      }

      for (const b of gearBonuses) {
        const isActive = b === winner
        resolved.push({ ...b, active: isActive })
        if (isActive) total += b.value
      }

      // Non-gear: all stack unconditionally
      for (const b of nonGearBonuses) {
        resolved.push({ ...b, active: true })
        total += b.value
      }
    } else {
      // -----------------------------------------------------------------------
      // Stacking type: every bonus is active.
      // -----------------------------------------------------------------------
      for (const b of group) {
        resolved.push({ ...b, active: true })
        total += b.value
      }
    }
  }

  return { total, bonuses: resolved }
}

// ---------------------------------------------------------------------------
// Convenience helper
// ---------------------------------------------------------------------------

/** Returns a resolved stat with no bonuses and a total of zero. */
export function emptyResolvedStat(): ResolvedStat {
  return { total: 0, bonuses: [] }
}
