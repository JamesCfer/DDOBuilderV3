// Essence Crafting's combined prefixes — one shard, two effects, prefix slot.
//
// V2's augment files have never carried these: Update 55 added the first
// seven, Update 81 added a hundred more, and the upstream data still stops
// at single-effect shards. So they are transcribed here from ddowiki's
// "Dual Shard Recipe List" on /page/Essence_Crafting, in the same
// `CraftingRecipe` shape the XML shards are read into, so they land in the
// planner's prefix column next to the shards they compete with.
//
// What the wiki gives, and so what is here:
//   - both effect names, and which items take the shard;
//   - the bound and unbound crafting level (400/450 or 425/475);
//   - the Mystical ingredient for the seven Update 55 recipes.
// What it does not give, and so what is NOT here: the values each half is
// worth at a given item level. `values` stays empty rather than borrowing a
// single-effect table that nobody has confirmed applies.

import type { CraftingRecipe } from './crafting'

/** Every combined shard has a minimum item level of 20 since Update 81. */
export const COMBINED_PREFIX_MIN_LEVEL = 20

/**
 * The wiki names item slots the way the crafting UI does; the augment data
 * uses its own kind names. Only the names that differ are listed.
 */
const KIND_ALIASES: Record<string, string> = {
  Headgear: 'Helmet',
  Neclace: 'Necklace', // typo on the wiki page
}

/** name, effect 1, effect 2, item slots, update, bound crafting level, mystical ingredient */
type Row = [string, string, string, string, 55 | 81, 400 | 425, string?]

const ROWS: Row[] = [
  ['Armor Destroying', 'Armor Piercing', 'Destruction', 'Weapon', 55, 400, 'Mystical Band'],
  ["Champion's", 'Speed', 'Combat Mastery', 'Boots, Orb', 55, 400, 'Mystical Goblet'],
  ["Initiate's", 'Spell Penetration', 'Wizardry', 'Gloves, Ring', 55, 400, 'Mystical Bottle'],
  ['Sabotaging', 'Seeker', 'Deception', 'Gloves, Goggles, Ring', 55, 400, 'Mystical Urn'],
  ["Silver Flame's", 'Hallowed', 'Sacred', 'Armor, Boots, Ring', 55, 400, 'Mystical Dried Fish'],
  ['Warded', 'Protection from Evil', 'Curse Resistance', 'Headgear, Necklace, Ring', 55, 400, 'Mystical Vessel'],
  ['Watchful', 'Heightened Awareness', 'Dodge', 'Belt', 55, 400, 'Mystical Plant'],

  ['Airwarded', 'Electric Resistance', 'Electric Absorption', 'Bracers, Trinket', 81, 400],
  ['Anchored', 'Constitution', 'Conjuration Focus', 'Necklace, Ring, Trinket, Orb', 81, 400],
  ['Annihilating', 'Slay Living', 'Entropic', 'Weapon', 81, 400],
  ["Arcanist's", 'Charisma', 'Use Magic Device', 'Goggles, Ring, Orb', 81, 400],
  ['Blasphemous', 'Unholy Burst', 'Anarchic', 'Weapon', 81, 400],
  ['Bullying', 'Strength', 'Incite', 'Bracers, Ring', 81, 400],
  ['Celebrated', 'Charisma', 'Command', 'Belt, Cloak, Headgear, Ring', 81, 400],
  ['Crusading', 'Holy Blast', 'Axiomatic', 'Weapon', 81, 400],
  ['Destroying', 'Entropic', 'Anarchic', 'Weapon', 81, 400],
  ['Earth Attuned', 'Corrosion', 'Acid Absorption', 'Weapon', 81, 400],
  ['Earthwarded', 'Acid Resistance', 'Acid Absorption', 'Bracers, Trinket', 81, 400],
  ['Electrifying', 'Lightning Strike', 'Electrifying', 'Weapon', 81, 400],
  ['Enchanting', 'Enchantment Focus', 'Enchantment Resistance', 'Goggles, Neclace, Ring', 81, 400],
  ['Evasive', 'Dodge', 'Reflex', 'Belt, Ring', 81, 400],
  ['Firewarded', 'Fire Resistance', 'Fire Absorption', 'Bracers, Trinket', 81, 400],
  ['Flame Attuned', 'Combustion', 'Fire Absorption', 'Armor, Shield', 81, 400],
  ['Fortifying', 'Constitution', 'Fortification', 'Belt, Necklace, Ring', 81, 400],
  ['Frost Attuned', 'Glaciation', 'Cold Absorption', 'Armor, Shield', 81, 400],
  ['Frozen', 'Freezing Ice', 'Chilling', 'Shield, Weapon', 81, 400],
  ['Healthy', 'Constitution', 'Vitality', 'Armor, Shield', 81, 400],
  ['Honed', 'Vorpal', 'Speed', 'Weapon', 81, 400],
  ['Icewarded', 'Cold Resistance', 'Cold Absorption', 'Bracers, Trinket', 81, 400],
  ['Illusory', 'Illusion Focus', 'Illusion Resistance', 'Bracers, Trinket', 81, 400],
  ['Irksome', 'Incite', 'Intimidate', 'Headgear, Ring, Trinket', 81, 400],
  ['Meditative', 'Constitution', 'Concentration', 'Boots, Ring, Trinket', 81, 400],
  ['Necromantic', 'Necromancy Focus', 'Deathblock', 'Goggles, Necklace, Ring', 81, 400],
  ['Nightmarish', 'Nightmares', 'Impactful', 'Weapon', 81, 400],
  ['Plagued', 'Proof Against Disease', 'Proof Against Poison', 'Cloak, Necklace', 81, 400],
  ['Poison-Proof', 'Proof Against Poison', 'Poison Absorption', 'Armor, Shield', 81, 400],
  ['Poisonwarded', 'Proof Against Poison', 'Poison Resistance', 'Cloak, Necklace', 81, 400],
  ['Protected', 'Protection', 'Resistance', 'Bracers, Ring, Trinket', 81, 400],
  ['Rebellious', 'Anarchic', 'Holy Blast', 'Weapon', 81, 400],
  ['Reinforced', 'Protection', 'Physical Sheltering', 'Headgear, Ring', 81, 400],
  ['Riptide', 'Tidal', 'Chilling', 'Shield, Weapon', 81, 400],
  ['Riveted', 'Protection', 'Fortification', 'Armor, Shield', 81, 400],
  ['Slaying', 'Impulse', 'Physical Sheltering', 'Armor, Shield', 81, 400],
  ['Soul Capturing', 'Nullification', 'Magical Sheltering', 'Armor, Shield', 81, 400],
  ['Soul Stealing', 'Trap the Soul', 'Entropic', 'Weapon', 81, 400],
  ["Spellmaster's", 'Spell Focus Mastery', 'Spell Saves', 'Necklace, Ring', 81, 400],
  ['Spellwarded', 'Spell Resistance', 'Spell Saves', 'Belt, Bracers, Cloak', 81, 400],
  ['Stabilized', 'Constitution', 'Lifesealed', 'Belt, Ring', 81, 400],
  ['Stealthy', 'Hide', 'Move Silently', 'Boots', 81, 400],
  ['Swift', 'Speed', 'Reflex Save', 'Cloak, Ring', 81, 400],
  ['Tinkering', 'Disable Device', 'Open Lock', 'Gloves, Ring', 81, 400],
  ['Tyrannical', 'Axiomatic', 'Unholy Blast', 'Weapon', 81, 400],
  ['Willful', 'Wisdom', 'Will Save', 'Cloak, Orb', 81, 400],
  ['Windswept', 'Magnetism', 'Electric Absorption', 'Armor, Shield', 81, 400],

  ["Commander's", 'Combat Mastery', 'Spell Resistance', 'Armor, Trinket', 81, 425],
  ['Acid Resistance', 'Acid Resistance', 'Resistance', 'Bracers, Cloak', 81, 425],
  ['Aiming', 'Accuracy', 'Doubleshot', 'Belt, Boots, Ring', 81, 425],
  ['Artificing', 'Intelligence', 'Use Magic Device', 'Goggles, Ring', 81, 425],
  ["Assassin's", 'Doublestrike', 'Deception', 'Belt, Boots, Ring', 81, 425],
  ['Attuned Banishing', 'Banishing', 'Axiomatic Blast', 'Weapon', 81, 425],
  ['Attuned Disruption', 'Disruption', 'Holy Blast', 'Weapon', 81, 425],
  ['Attuned Smiting', 'Smiting', 'Anarchic Blast', 'Weapon', 81, 425],
  ['Aware', 'Search', 'Spot', 'Gloves, Ring', 81, 425],
  ["Brigand's", 'Deadly', 'Doublestrike', 'Gloves, Necklace, Ring', 81, 425],
  ['Bulwark', 'Protection', 'Sheltering', 'Headgear, Ring', 81, 425],
  ["Captain's", 'Combat Mastery', 'Dodge', 'Boots, Trinket', 81, 425],
  ['Changeling', 'Transmutation Focus', 'Spell Resistance', 'Ring, Trinket, Necklace', 81, 425],
  ['Convalescent', 'Healing Amplification', 'Repair Amplification', 'Armor, Boots, Ring, Shield', 81, 425],
  ['Cursed', 'Cursespewing', 'Unholy Burst', 'Weapon', 81, 425],
  ['Desert Eclipse', 'Flaming Blast', 'Sirocco', 'Weapon', 81, 425],
  ['Desert Sand', 'Flaming Blast', 'Speed', 'Weapon', 81, 425],
  ['Divine Light', 'Holy', 'Coruscating', 'Weapon', 81, 425],
  ['Dynamic', 'Lightning Strike', 'Electric Blast', 'Weapon', 81, 425],
  ['Earth Absorbing', 'Acid Absorption', 'Poison Absorption', 'Armor, Ring, Shield, Orb', 81, 425],
  ['Electric Absorbing', 'Electric Absorption', 'Negative Absorption', 'Armor, Ring, Shield, Orb', 81, 425],
  ['Electric Resistant', 'Electric Resistance', 'Resistance', 'Bracers, Cloak', 81, 425],
  ['Equilibrium', 'Healing Amplification', 'Negative Healing Amplification', 'Armor, Boots, Ring, Shield', 81, 425],
  ['Explosive', 'Evocation Focus', 'Spellcraft', 'Goggles, Ring', 81, 425],
  ['Flame Absorbing', 'Fire Absorption', 'Light Absorption', 'Armor, Ring, Shield, Orb', 81, 425],
  ['Flame Resistant', 'Fire Resistance', 'Resistance', 'Bracers, Cloak', 81, 425],
  ['Fletching', 'Doubleshot', 'Ranged Alacrity', 'Gloves, Ring', 81, 425],
  ['Flowing', 'Speed', 'Dodge', 'Boots, Orb', 81, 425],
  ['Frost Absorbing', 'Cold Absorption', 'Force Absorption', 'Armor, Ring, Shield, Orb', 81, 425],
  ['Frost Resistant', 'Cold Resistance', 'Resistance', 'Bracers, Cloak', 81, 425],
  ["Heart's Desire", 'Charisma', 'Spellcraft', 'Goggles, Headgear, Ring', 81, 425],
  ['Keen-Eyed', 'Accuracy', 'Dodge', 'Gloves, Ring', 81, 425],
  ["Killer's", 'Assassinate', 'Dexterity', 'Gloves, Trinket', 81, 425],
  ['Limber', 'Dexterity', 'Tumble', 'Boots, Trinket', 81, 425],
  ['Lucky', 'Good Luck', 'Dodge', 'Belt, Boots, Gloves, Headgear, Ring', 81, 425],
  ['Magmatic', 'Magma Surge', 'Flaming Blast', 'Weapon', 81, 425],
  ['Mauling', 'Maiming', 'Bleeding', 'Weapon', 81, 425],
  ["Mind's Eye", 'Intelligence', 'Concentration', 'Goggles, Headgear, Ring', 81, 425],
  ["Night Grasp's", 'Negative Blast', 'Maladroit', 'Weapon', 81, 425],
  ["Outlander's", 'Deception', 'Doubleshot', 'Gloves, Necklace, Ring', 81, 425],
  ['Pandemonium', 'Sonic Blast', 'Weakening', 'Weapon', 81, 425],
  ['Relentless', 'Deadly', 'Deception', 'Belt, Boots, Ring', 81, 425],
  ['Resonant', 'Sonic Blast', 'Sonic Lore', 'Weapon', 81, 425],
  ["Sapper's", 'Shatter', 'Melee Alacrity', 'Gloves, Trinket', 81, 425],
  ['Sensory', 'Concentration', 'Spot', 'Ring, Orb', 81, 425],
  ['Smoke Aligned', 'Smoke Screen', 'Flaming', 'Shield, Weapon', 81, 425],
  ['Sneaky', 'Hide', 'Move Silently', 'Armor, Belt, Cloak, Ring', 81, 425],
  ["Soul's Focus", 'Wisdom', 'Wizardry', 'Goggles, Headgear, Ring', 81, 425],
  ["Sun's Fury", 'Coruscating', 'Fiery', 'Weapon', 81, 425],
  ['Technical', 'Search', 'Disable Device', 'Goggles, Ring', 81, 425],
  ['Thieving', 'Accuracy', 'Deception', 'Gloves, Necklace, Ring', 81, 425],
  ['Virulently Poisoned', 'Poison Blast', 'Wounding', 'Weapon', 81, 425],
  ["Wintry's", 'Freezing Ice', 'Cold Blast', 'Shield, Weapon', 81, 425],
]

function toRecipe([name, first, second, items, update, bound, mystical]: Row): CraftingRecipe {
  const kinds = items.split(',').map(s => s.trim()).map(k => KIND_ALIASES[k] ?? k)
  return {
    name: `${name} (combined)`,
    description: `${first} and ${second}, both in the prefix slot.`,
    minLevel: COMBINED_PREFIX_MIN_LEVEL,
    slots: kinds.map(k => `Cannith ${k} Prefix`),
    setBonuses: [],
    unlocks: [],
    levels: [],
    values: [],
    scalesWithLevel: false,
    ingredients: [
      `Crafting level ${bound} bound, ${bound + 50} unbound`,
      ...(mystical ? [`5 ${mystical}`] : []),
    ],
    note: update === 81
      ? 'Added in Update 81. Only goes on a blank disjuncted after Update 81; an older keyed blank must be disjuncted again.'
      : 'Added in Update 55.',
  }
}

export const COMBINED_PREFIXES: CraftingRecipe[] = ROWS.map(toRecipe)
