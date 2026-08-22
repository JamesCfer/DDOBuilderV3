// Shared game constants derived from DDO data files.
// Single source of truth for values used across multiple components.

import type { Ability } from '../types/ddo'

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillDef {
  name: string
  ability: Ability
}

export const SKILLS: SkillDef[] = [
  { name: 'Balance',          ability: 'Dexterity' },
  { name: 'Bluff',            ability: 'Charisma' },
  { name: 'Concentration',    ability: 'Constitution' },
  { name: 'Diplomacy',        ability: 'Charisma' },
  { name: 'Disable Device',   ability: 'Intelligence' },
  { name: 'Haggle',           ability: 'Charisma' },
  { name: 'Heal',             ability: 'Wisdom' },
  { name: 'Hide',             ability: 'Dexterity' },
  { name: 'Intimidate',       ability: 'Charisma' },
  { name: 'Jump',             ability: 'Strength' },
  { name: 'Listen',           ability: 'Wisdom' },
  { name: 'Move Silently',    ability: 'Dexterity' },
  { name: 'Open Lock',        ability: 'Dexterity' },
  { name: 'Perform',          ability: 'Charisma' },
  { name: 'Repair',           ability: 'Intelligence' },
  { name: 'Search',           ability: 'Intelligence' },
  { name: 'Spellcraft',       ability: 'Intelligence' },
  { name: 'Spot',             ability: 'Wisdom' },
  { name: 'Swim',             ability: 'Strength' },
  { name: 'Tumble',           ability: 'Dexterity' },
  { name: 'Use Magic Device', ability: 'Charisma' },
]

export const SKILL_NAMES = SKILLS.map(s => s.name)

/**
 * V2 `skillTypeMap` (SkillTypes.h:57,63) maps BOTH "Spellcraft" and the older
 * "Spell Craft" onto `Skill_SpellCraft` ("translate old builds"), so either
 * spelling is valid anywhere a data file names a skill. V3 keys skills by the
 * canonical display name, so an un-normalised "Spell Craft" silently misses:
 * Arcane Trickster's class-skill list dropped Spellcraft, and the Festival:
 * Icy Pumpkin Coffee buff's +10 landed in a `skill.Spell Craft` bucket no
 * breakdown reads. Normalise on the way in instead of chasing spellings.
 */
const SKILL_NAME_ALIASES: Record<string, string> = {
  'spell craft': 'Spellcraft',
}
const SKILL_NAMES_BY_LOWER = new Map(SKILL_NAMES.map(n => [n.toLowerCase(), n]))

/** Canonical display name for a skill named by a data file, or the input
 *  unchanged when it names no known skill (e.g. "All"). */
export function normalizeSkillName(name: string): string {
  const trimmed = name.trim()
  const lower = trimmed.toLowerCase()
  return SKILL_NAMES_BY_LOWER.get(lower) ?? SKILL_NAME_ALIASES[lower] ?? trimmed
}

// ---------------------------------------------------------------------------
// Level caps
// ---------------------------------------------------------------------------

export const HEROIC_MAX_LEVEL = 20
export const EPIC_MAX_LEVELS = 10
// V2 MAX_BUILDER_LEVEL = 40 (stdafx.h): legendary levels 31-40. The live game
// cap is 36 (BUILD_START_LEVEL upstream), but data files define all 10
// legendary class levels — capping at 4 dropped levels 35+ of imported builds.
export const LEGENDARY_MAX_LEVELS = 10
// The live game's cap is character level 36 = 20 heroic + 10 epic + 6
// legendary, which is where a new build starts; the extra four legendary
// levels stay available for builds that import them.
export const LEGENDARY_DEFAULT_LEVELS = 6
export const LIVE_GAME_MAX_LEVEL = HEROIC_MAX_LEVEL + EPIC_MAX_LEVELS + LEGENDARY_DEFAULT_LEVELS

export const LEVELUP_LEVELS = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const
export type LevelUpLevel = typeof LEVELUP_LEVELS[number]

// ---------------------------------------------------------------------------
// Spell schools
// ---------------------------------------------------------------------------

export const SPELL_SCHOOLS = [
  'Abjuration',
  'Conjuration',
  'Divination',
  'Enchantment',
  'Evocation',
  'Illusion',
  'Necromancy',
  'Transmutation',
] as const
export type SpellSchool = typeof SPELL_SCHOOLS[number]

export const SCHOOL_DCS: string[] = [
  'Evocation', 'Conjuration', 'Necromancy', 'Enchantment',
  'Transmutation', 'Illusion', 'Abjuration', 'Divination',
]

// ---------------------------------------------------------------------------
// Spell power
// ---------------------------------------------------------------------------

export const SPELL_POWER_TYPES = [
  'Universal', 'Acid', 'Cold', 'Electric', 'Fire', 'Force',
  'LightAlignment', 'Negative', 'Positive', 'Repair', 'Rust',
  'Sonic', 'Poison', 'Physical', 'Chaos', 'Evil', 'Lawful', 'Untyped',
]

export const SPELL_POWER_LABELS: Record<string, string> = {
  LightAlignment: 'Light/Alignment',
}

// ---------------------------------------------------------------------------
// Class short names
// ---------------------------------------------------------------------------
/**
 * Three-letter class abbreviations, as used by the DDO community (Favored Soul
 * = FVS, Barbarian = BRB, …). The class data files carry no `ShortName` the way
 * race files do, so the mapping lives here; `classShortName` falls back to a
 * derivation for anything not listed (a class added to the data files before
 * this table hears about it).
 */
export const CLASS_SHORT_NAMES: Record<string, string> = {
  'Acolyte of the Skin': 'AOS',
  'Alchemist': 'ALC',
  'Arcane Trickster': 'ATK',
  'Artificer': 'ART',
  'Barbarian': 'BRB',
  'Bard': 'BRD',
  'Blight Caster': 'BLC',
  'Cleric': 'CLR',
  'Dark Apostate': 'DAP',
  'Dark Hunter': 'DKH',
  'Dragon Disciple': 'DDI',
  'Dragon Lord': 'DRL',
  'Druid': 'DRD',
  'Epic': 'EPI',
  'Favored Soul': 'FVS',
  'Fighter': 'FTR',
  'Iron Vanguard': 'IRV',
  'Legendary': 'LEG',
  'Monk': 'MNK',
  'Paladin': 'PAL',
  'Ranger': 'RNG',
  'Rogue': 'ROG',
  'Sacred Fist': 'SCF',
  'Sorcerer': 'SOR',
  'Stormsinger': 'STS',
  'Warlock': 'WLK',
  'Wild Mage': 'WLM',
  'Wizard': 'WIZ',
}

/**
 * The 3-letter tag for a class. Unlisted classes derive one: the initials of a
 * multi-word name (padded from the first word), else the first 3 letters.
 */
export function classShortName(name: string): string {
  if (!name) return ''
  const known = CLASS_SHORT_NAMES[name]
  if (known) return known
  const words = name.split(/[\s-]+/).filter(w => w.length > 2 || /^[A-Z]/.test(w))
  if (words.length >= 3) return words.slice(0, 3).map(w => w[0]).join('').toUpperCase()
  if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1][0]).toUpperCase()
  }
  return name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
}
