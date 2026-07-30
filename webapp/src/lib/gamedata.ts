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

// ---------------------------------------------------------------------------
// Level caps
// ---------------------------------------------------------------------------

export const HEROIC_MAX_LEVEL = 20
export const EPIC_MAX_LEVELS = 10
// V2 MAX_BUILDER_LEVEL = 40 (stdafx.h): legendary levels 31-40. The live game
// cap is 36 (BUILD_START_LEVEL upstream), but data files define all 10
// legendary class levels — capping at 4 dropped levels 35+ of imported builds.
export const LEGENDARY_MAX_LEVELS = 10

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
