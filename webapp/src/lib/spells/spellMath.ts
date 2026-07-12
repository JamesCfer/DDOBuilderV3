// Spell DC, Caster Level, Max Caster Level, and Spell Point cost.
//
// V2 source:
//   DDOBuilder/SpellDC.cpp:62-129  (CalculateSpellDC)
//   DDOBuilder/Spell.cpp:113-122    (Cost default)
//   DDOBuilder/Spell.cpp:174-228    (CasterLevel / MaxCasterLevel)
//   DDOBuilder/Spell.cpp:354-448    (Cost with metamagics + reductions)
//
// The computation is read-only against the resolved StatMap.

import type { Spell, SpellDC, DDOClass, Ability } from '../../types/ddo'
import type { BuildStats } from '../../hooks/useBuildStats'

const ABILITY_KEYS = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const

function abMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

function abilityTotal(stats: BuildStats, ab: string): number {
  return stats.total(`ability.${ab}`)
}

/**
 * Returns the number of spells a character can have trained (known/prepared)
 * for the given spell level at the specified class level.
 * Mirrors V2 Class::SpellSlotsAtLevel (SpellsPane.cpp:248).
 *
 * Returns Infinity when the class has no Level<N> data (no cap enforced).
 * Returns 0 when the row exists but the given spell level has no slots yet.
 */
export function knownSpellCount(cls: DDOClass | undefined, classLevel: number, spellLevel: number): number {
  if (!cls) return Infinity
  const idx = Math.min(Math.max(classLevel, 0), 20)
  const row = levelRowText((cls as unknown as Record<string, unknown>)[`Level${idx}`])
  if (row) {
    const slots = row.trim().split(/\s+/).map(Number)
    return slots[spellLevel - 1] ?? 0
  }
  return Infinity
}

/**
 * `Level<N>` spell-slot tables carry a `size` attribute, so fast-xml-parser
 * wraps them as `{ '#text': '…', size: N }` rather than a bare string. Unwrap
 * `#text`; a plain `typeof === 'string'` check silently misses the wrapped
 * form (the cause of wrong spell caps/counts). Verified against v2calc.
 */
function levelRowText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && '#text' in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>)['#text'] ?? '')
  }
  return ''
}

/**
 * Returns the highest spell level the character can cast for the given class
 * at the supplied number of class levels. Mirrors V2 Class::MaxSpellLevel.
 *
 * Reads `Level<N>` rows on DDOClass: each row is a space-separated tuple of
 * spell slots per spell level (1..9). The non-zero-trailing index +1 is the
 * cap. Falls back to standard caster-class formulas if the rows are missing.
 */
export function computeMaxSpellLevel(cls: DDOClass | undefined, classLevel: number): number {
  if (!cls) return 0
  const idx = Math.min(Math.max(classLevel, 0), 20)
  const row = levelRowText((cls as unknown as Record<string, unknown>)[`Level${idx}`])
  if (row) {
    const slots = row.trim().split(/\s+/).map(Number)
    let cap = 0
    for (let i = 0; i < slots.length; i++) if (slots[i] > 0) cap = i + 1
    if (cap > 0) return cap
  }
  const FULL = new Set(['Cleric', 'Wizard', 'Sorcerer', 'Druid', 'Favored Soul', 'FavoredSoul', 'Warlock', 'Alchemist'])
  const HALF = new Set(['Bard', 'Paladin', 'Ranger', 'Artificer'])
  if (FULL.has(cls.Name)) return Math.max(0, Math.floor((classLevel + 1) / 2))
  if (HALF.has(cls.Name)) return Math.min(4, Math.max(0, Math.floor(classLevel / 3) + 1))
  return 0
}

/** Picks the casting ability of a class with the highest current mod. */
function pickCastingStat(cls: DDOClass | undefined, stats: BuildStats): Ability {
  const cs = (cls as unknown as { CastingStat?: Ability | Ability[] } | undefined)?.CastingStat
  const list = toArray(cs as Ability | Ability[] | undefined)
  if (list.length === 0) return 'Wisdom'
  return list.reduce((best, ab) => abilityTotal(stats, ab) > abilityTotal(stats, best) ? ab : best)
}

/**
 * All metamagic flag keys on Spell (mirrors V2 Spell.h:67-76).
 * V2 declares exactly ten DL_FLAG metamagics; EschewMaterials is NOT among them
 * (it is a feat, not a per-spell metamagic flag, and appears 0 times in
 * Spells.xml), so it must not be offered as a toggle here.
 */
export const METAMAGIC_KEYS: Array<keyof Spell> = [
  'Accelerate', 'Embolden', 'Empower', 'EmpowerHealing', 'Enlarge',
  'Extend', 'Heighten', 'Intensify', 'Maximize', 'Quicken',
]

/** Returns the metamagic names that the spell allows. */
export function availableMetamagics(spell: Spell): string[] {
  return METAMAGIC_KEYS.filter(k => spell[k] === true) as string[]
}

/**
 * Computes a single SpellDC entry's value. A spell may declare multiple DC
 * blocks; callers typically pick the matching one or take the maximum.
 *
 * Mirrors V2 SpellDC.cpp:62-129.
 */
export function computeSpellDC(
  spell: Spell,
  dc: SpellDC,
  cls: DDOClass | undefined,
  classLevel: number,
  stats: BuildStats,
  options: { heightenActive?: boolean } = {},
): number {
  let value = dc.Amount ?? 10

  if (dc.CastingStatMod) {
    const castingStat = pickCastingStat(cls, stats)
    value += abMod(abilityTotal(stats, castingStat))
    // V2: when the spell is being heightened, use the class's max spell level
    // in place of the spell's natural level for DC purposes.
    let spellLvl = spell.Level?.[cls?.Name ?? ''] ?? 0
    if (options.heightenActive && spell.Heighten) {
      spellLvl = computeMaxSpellLevel(cls, classLevel)
    }
    value += spellLvl
  }

  // Add the max ability mod from the listed alternatives.
  const modAbs = toArray(dc.ModAbility)
  if (modAbs.length > 0) {
    let bestMod = -Infinity
    for (const ab of modAbs) {
      if (!ABILITY_KEYS.includes(ab as typeof ABILITY_KEYS[number])) continue
      const m = abMod(abilityTotal(stats, ab))
      if (m > bestMod) bestMod = m
    }
    if (bestMod !== -Infinity) value += bestMod
  }

  // School DC bonuses. V2 (SpellDC.cpp:120-128) iterates ONLY the DC block's
  // own m_School list — it does NOT fall back to the parent spell's school.
  // The school-less DC blocks in the data are fixed-Amount on-hit effects
  // (e.g. Gust of Wind "Knocked Prone", Sleet Storm) that must NOT pick up
  // school DC bonuses; adding the spell's school here over-counts them.
  for (const sch of toArray(dc.School)) {
    value += stats.total(`dc.${sch}`)
  }
  // Universal DC bonuses
  value += stats.total('dc.All')
  value += stats.total('dc.Spell')
  return value
}

/**
 * Caster level for a spell. Mirrors V2 Spell.cpp:174-197.
 * Result is capped at MaxCasterLevel.
 *
 * `options.mixedMagicsCharacterLevel`: when the build has trained the
 * "Mixed Magics" enhancement (Wild Mage `WMUnstableSorcery` or Arcane
 * Trickster `ATMoreMagicMoreFun`), V2 raises that class's caster level to
 * min(20, character level) — implemented in BreakdownItemCasterLevel.cpp:77-100
 * as an extra (maxLevel - classLevels) "other effect" on the class CL
 * breakdown. We pass min(20, totalLevel) here and add the same delta.
 */
export function computeCasterLevel(
  spell: Spell,
  cls: DDOClass | undefined,
  classLevel: number,
  stats: BuildStats,
  options: { mixedMagicsCharacterLevel?: number } = {},
): number {
  let cl = classLevel
  // V2 BreakdownItemCasterLevel.cpp:77-100: Mixed Magics adds (min(20,charLvl)
  // - classLevels) so effective class CL becomes the character level.
  if (options.mixedMagicsCharacterLevel != null) {
    cl += Math.max(0, options.mixedMagicsCharacterLevel - classLevel)
  }
  if (cls) cl += stats.total(`cl.${cls.Name}`)
  for (const sch of toArray(spell.School)) {
    cl += stats.total(`clSchool.${sch}`)
  }
  cl += stats.total(`clSpell.${spell.Name}`)
  cl += stats.total('cl.All')
  const max = computeMaxCasterLevel(spell, cls, classLevel, stats)
  return Math.min(cl, max)
}

/** Mirrors V2 Spell.cpp:199-228. */
export function computeMaxCasterLevel(
  spell: Spell,
  cls: DDOClass | undefined,
  classLevel: number,
  stats: BuildStats,
): number {
  if (spell.MaxCasterLevel == null) return Number.POSITIVE_INFINITY
  let max = spell.MaxCasterLevel
  if (cls) max += stats.total(`maxCl.${cls.Name}`)
  for (const sch of toArray(spell.School)) {
    max += stats.total(`maxClSchool.${sch}`)
  }
  max += stats.total(`maxClSpell.${spell.Name}`)
  max += stats.total('maxCl.All')
  // V2 Spell::ActualMaxCasterLevel returns the computed max as-is — there is
  // NO class-level floor (the previous Math.max(max, classLevel) was a V3
  // invention that wrongly raised the cap past MaxCasterLevel for any class
  // levelled beyond it).
  return max
}

/**
 * Spell point cost incl. metamagic surcharges (V2 Spell.cpp:354-448).
 * Cost reductions are display-only in V2 and deliberately NOT applied.
 *
 * Metamagic costs are pulled from `metamagic.cost.<name>` stat keys (set by
 * the corresponding metamagic stances in effectParser.ts:1055-1086). Only
 * metamagics the user has toggled on for this spell AND which have an active
 * stance contributing a non-zero cost are charged.
 */
export function computeSpellCost(
  spell: Spell,
  cls: DDOClass | undefined,
  classLevel: number,
  stats: BuildStats,
  enabledMetamagics: string[],
): number {
  const spellLvl = spell.Level?.[cls?.Name ?? ''] ?? 0
  let cost = spell.Cost ?? 5 * spellLvl
  if (cost <= 0 && spellLvl > 0) cost = 5 * spellLvl

  for (const mm of enabledMetamagics) {
    if (mm === 'Heighten') {
      const maxLvl = computeMaxSpellLevel(cls, classLevel)
      const delta = Math.max(0, maxLvl - spellLvl)
      cost += stats.total(`metamagic.cost.Heighten`) * delta
    } else {
      cost += stats.total(`metamagic.cost.${mm}`)
    }
  }

  // V2 Spell::TotalCost (Spell.cpp:354-448) ends after the metamagic
  // surcharges: Effect_SpellCostReduction feeds a DISPLAY-ONLY breakdown
  // (Breakdown_SpellCostReduction, BreakdownsPane.cpp:1689) that TotalCost
  // never consumes. V3 previously subtracted spellCost.*/spellCostPct here,
  // diverging from V2's displayed cost.
  return Math.max(0, cost)
}
