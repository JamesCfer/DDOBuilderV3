// V2 ForumExportDlg.cpp:1093-1165 (AddBonuses) + BonusesPane.cpp — the forum
// export's "Bonuses" section reads `Life::MonitoredBonuses()` (a small,
// user-curated list of breakdown display names) and, for each one found in
// `breakdownNameMap` (BreakdownTypes.h:338-464, the fixed ~127-entry name
// catalogue CBonusesPane offers), emits one table row with 10 columns — the
// breakdown's `GetEffectValue(bonusType, /*bItemEffectsOnly*/true)` for each
// of Enhancement/Insightful/Artifact/Quality/Profane/Equipment/Competence/
// Exceptional/Festive/Fortune.
//
// `bItemEffectsOnly=true` (BreakdownItem.cpp:1210-1238) restricts the sum to
// GEAR-sourced effects only (m_itemEffects, after the Highest-Only stacking
// pass) — feat/enhancement contributions are deliberately excluded from this
// table, matching that all 10 named bonus types are ones DDO items actually
// carry. V3's `fromGear` RawBonus flag is exactly this pool (see bonus.ts).
//
// V2 quirk reproduced verbatim: "Dodge Cap" maps to the SAME breakdown as
// "Dodge" (`{Breakdown_Dodge, L"Dodge Cap"}`, BreakdownTypes.h:344) — V2 has
// no separate tracked Dodge-cap breakdown object (unlike MRR, which does).

import type { BuildStats } from './buildStats'

export const BONUS_TYPE_COLUMNS = [
  'Enhancement', 'Insightful', 'Artifact', 'Quality', 'Profane',
  'Equipment', 'Competence', 'Exceptional', 'Festive', 'Fortune',
] as const

/** V2 breakdownNameMap (BreakdownTypes.h:338-464) → the V3 stat key that
 *  backs the same breakdown. Order matches the C++ table. */
export const MONITORED_BONUS_KEYS: Record<string, string> = {
  Strength: 'ability.Strength',
  Dexterity: 'ability.Dexterity',
  Constitution: 'ability.Constitution',
  Intelligence: 'ability.Intelligence',
  Wisdom: 'ability.Wisdom',
  Charisma: 'ability.Charisma',
  'Fortitude Save': 'save.Fort',
  'Reflex Save': 'save.Reflex',
  'Will Save': 'save.Will',
  PRR: 'prr',
  MRR: 'mrr',
  'MRR Cap': 'mrrCap',
  Dodge: 'dodge',
  'Dodge Cap': 'dodge', // V2 quirk: aliases the Dodge breakdown, see file header
  Doublestrike: 'melee.doublestrike',
  Doubleshot: 'ranged.doubleshot',
  Fortification: 'fortification',
  'Healing Amplification': 'healAmp',
  'Negative Healing Amplification': 'negHealAmp',
  'Repair Amplification': 'repairAmp',
  'Melee Threat': 'threat.melee',
  'Ranged Threat': 'threat.ranged',
  'Spell Threat': 'threat.spell',
  'Fortification Bypass': 'fortBypass',
  Assassinate: 'tacticalDC.Assassinate',
  Stun: 'tacticalDC.Stun',
  Sunder: 'tacticalDC.Sunder',
  Trip: 'tacticalDC.Trip',
  'Sneak Attack Dice': 'melee.sneakDice',
  'Sneak Attack Damage': 'melee.sneakDamage',
  'Sneak Attack Attack': 'melee.sneakAttack',
  'Helpless Damage Bonus': 'helpless',
  Balance: 'skill.Balance',
  Bluff: 'skill.Bluff',
  Concentration: 'skill.Concentration',
  Diplomacy: 'skill.Diplomacy',
  'Disable Device': 'skill.Disable Device',
  Haggle: 'skill.Haggle',
  Heal: 'skill.Heal',
  Hide: 'skill.Hide',
  Intimidate: 'skill.Intimidate',
  Jump: 'skill.Jump',
  Listen: 'skill.Listen',
  'Move Silently': 'skill.Move Silently',
  'Open Lock': 'skill.Open Lock',
  Perform: 'skill.Perform',
  Repair: 'skill.Repair',
  Search: 'skill.Search',
  'Spell Craft': 'skill.Spellcraft', // V2 display name differs from V3's skill key
  Spot: 'skill.Spot',
  Swim: 'skill.Swim',
  Tumble: 'skill.Tumble',
  'Use Magic Device': 'skill.Use Magic Device',
  'Spell Points': 'spellPoints',
  'Spell Resistance': 'spellResistance',
  'Spell Penetration': 'spellPenetration',
  'Acid Spell Power': 'sp.Acid',
  'Chaos Spell Power': 'sp.Chaos',
  'Cold Spell Power': 'sp.Cold',
  'Electric Spell Power': 'sp.Electric',
  'Evil Spell Power': 'sp.Evil',
  'Fire Spell Power': 'sp.Fire',
  'Force Spell Power': 'sp.Force',
  'Lawful Spell Power': 'sp.Lawful',
  'Light and Alignment Spell Power': 'sp.LightAlignment',
  'Negative Spell Power': 'sp.Negative',
  'Physical Spell Power': 'sp.Physical',
  'Positive Spell Power': 'sp.Positive',
  'Repair Spell Power': 'sp.Repair',
  'Rust Spell Power': 'sp.Rust',
  'Sonic Spell Power': 'sp.Sonic',
  'Poison Spell Power': 'sp.Poison',
  'Untyped Spell Power': 'sp.Untyped',
  'Universal Spell Power': 'sp.Universal',
  'Acid Spell Critical Chance': 'spCrit.Acid',
  'Chaos Spell Critical Chance': 'spCrit.Chaos',
  'Light and Alignment Spell Critical Chance': 'spCrit.LightAlignment',
  'Cold Spell Critical Chance': 'spCrit.Cold',
  'Electric Spell Critical Chance': 'spCrit.Electric',
  'Evil Spell Critical Chance': 'spCrit.Evil',
  'Fire Spell Critical Chance': 'spCrit.Fire',
  'Force Spell Critical Chance': 'spCrit.Force',
  'Lawful Spell Critical Chance': 'spCrit.Lawful',
  'Negative Spell Critical Chance': 'spCrit.Negative',
  'Physical Spell Critical Chance': 'spCrit.Physical',
  'Poison Spell Critical Chance': 'spCrit.Poison',
  'Positive Spell Critical Chance': 'spCrit.Positive',
  'Repair Spell Critical Chance': 'spCrit.Repair',
  'Rust Spell Critical Chance': 'spCrit.Rust',
  'Sonic Spell Critical Chance': 'spCrit.Sonic',
  'Untyped Spell Critical Chance': 'spCrit.Untyped',
  'Universal Spell Critical Chance': 'spCrit.Universal',
  'Abjuration DC': 'dc.Abjuration',
  'Conjuration DC': 'dc.Conjuration',
  'Divination DC': 'dc.Divination',
  'Enchantment DC': 'dc.Enchantment',
  'Evocation DC': 'dc.Evocation',
  'Illusion DC': 'dc.Illusion',
  'Necromancy DC': 'dc.Necromancy',
  'Transmutation DC': 'dc.Transmutation',
  'Acid Resistance': 'resist.Acid',
  'Chaos Resistance': 'resist.Chaos',
  'Cold Resistance': 'resist.Cold',
  'Electric Resistance': 'resist.Electric',
  'Evil Resistance': 'resist.Evil',
  'Fire Resistance': 'resist.Fire',
  'Force Resistance': 'resist.Force',
  'Good Resistance': 'resist.Good',
  'Lawful Resistance': 'resist.Lawful',
  'Light Resistance': 'resist.Light',
  'Negative Resistance': 'resist.Negative',
  'Poison Resistance': 'resist.Poison',
  'Acid Absorption': 'absorb.Acid',
  'Chaos Absorption': 'absorb.Chaos',
  'Cold Absorption': 'absorb.Cold',
  'Electric Absorption': 'absorb.Electric',
  'Evil Absorption': 'absorb.Evil',
  'Fire Absorption': 'absorb.Fire',
  'Force Absorption': 'absorb.Force',
  'Good Absorption': 'absorb.Good',
  'Lawful Absorption': 'absorb.Lawful',
  'Light Absorption': 'absorb.Light',
  'Negative Absorption': 'absorb.Negative',
  'Poison Absorption': 'absorb.Poison',
  'Sonic Absorption': 'absorb.Sonic',
  'Melee Power': 'melee.power',
  'Ranged Power': 'ranged.power',
}

/** V2 GetEffectValue(bonusType, true) — sum of active, gear-sourced (item)
 *  effects of the given bonus type feeding the named breakdown. */
export function monitoredBonusValue(stats: BuildStats, statKey: string, bonusType: string): number {
  const total = stats.resolve(statKey).bonuses
    .filter(b => b.active && b.fromGear && b.type === bonusType)
    .reduce((sum, b) => sum + b.value, 0)
  return Math.trunc(total)
}
