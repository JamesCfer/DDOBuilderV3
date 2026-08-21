// Viktranium Experiment crafting — the Chill of Ravenloft augment system.
//
// This one gets a file to itself because it is the largest hand-transcribed
// system on the page by a wide margin: four augment families, three item
// classes, and a heroic and legendary value for nearly every effect, which
// comes to well over a hundred recipes. Structurally it is Dinosaur Bone
// crafting again — collect ingredients, craft typed augments, slot them into
// matching typed slots — but where Dinosaur Bone reaches V2's augment files,
// this does not, so the whole thing is transcribed.
//
// The four families differ only in what they cost and where the ingredient
// drops, which is the useful thing to know before farming:
//
//   Melancholic  quests               the cheap family, four base ingredients
//   Dolorous     quests               double the base ingredients
//   Miserable    wilderness           adds Bleak Wires
//   Woeful       raid, rare wilderness  adds Bleak Transformers
//
// Slot types match exactly: a "Melancholic (Weapon)" augment goes only into a
// "Melancholic Slot (Weapon)". Heroic slots accept legendary augments and the
// reverse, but a legendary augment drags a heroic item's minimum level up to
// 34, which is rarely what anyone wants.

import type { CraftingSystemMeta, ManualRecipe, ManualSlot } from './crafting'

/** Name, heroic effect, legendary effect. An empty heroic means legendary-only. */
type VikRow = [name: string, heroic: string, legendary: string]

interface VikSection {
  /** Family and item class, e.g. "Melancholic (Weapons)". */
  slot: string
  /** Which of the four base ingredients this family spends, and how many. */
  heroicCost: string[]
  legendaryCost: string[]
  rows: VikRow[]
}

/** The four ingredients every family spends, in the order the wiki lists them. */
const BASE = ['Bleak Alternators', 'Bleak Conductors', 'Bleak Insulators', 'Bleak Resistors']

/** The weapon recipes: the wiki names the four parts but states no count. */
const WEAPON_PARTS = BASE.map(name => name.replace(/s$/, ''))
const LEGENDARY_WEAPON_PARTS = WEAPON_PARTS.map(name => `Legendary ${name}`)

/** `cost(5)` → the four base ingredients at five apiece. */
function cost(each: number, extra: string[] = []): string[] {
  return [...BASE.map(name => `${each} ${name}`), ...extra]
}

function legendaryCost(each: number, extra: string[] = []): string[] {
  return [
    ...BASE.map(name => `${each} Legendary ${name}`),
    ...extra.map(e => `Legendary ${e}`),
  ]
}

const SECTIONS: VikSection[] = [
  {
    slot: 'Melancholic (Weapons)',
    heroicCost: cost(5),
    legendaryCost: legendaryCost(25),
    rows: [
      ['Melancholic Flames', 'Adds Adamantine material type. On hit: 2d6 Fire damage.', 'Adds Adamantine material type. On hit: 16d6 Fire damage.'],
      ['Melancholic Chill', 'Adds Cold Iron material type. On hit: 2d6 Cold damage.', 'Adds Cold Iron material type. On hit: 16d6 Cold damage.'],
      ['Melancholic Sparks', 'Adds Silver material type. On hit: 2d6 Electric damage.', 'Adds Silver material type. On hit: 16d6 Electric damage.'],
      ['Melancholic Acid', 'Adds Crystal and Byeshk material type. On hit: 2d6 Acid damage.', 'Adds Crystal and Byeshk material type. On hit: 16d6 Acid damage. Does not grant immunity to weapon damage from rust monsters or oozes.'],
      ['Melancholic Dimlight', '+5 Equipment bonus to Spell Penetration.', '+9 Equipment bonus to Spell Penetration. In a quarterstaff, also +1 Exceptional bonus to Spell DCs and the staff becomes an implement.'],
      ['Melancholic Shadows', '+5% Enhancement bonus to Spell Cost Reduction.', '+10% Enhancement bonus to Spell Cost Reduction. In a quarterstaff, also +1 Exceptional bonus to Spell DCs and the staff becomes an implement.'],
      ['Melancholic Arcana', '+41 Equipment bonus to all Spellpowers.', '+111 Equipment bonus to all Spellpowers. In a quarterstaff, also +1 Exceptional bonus to Spell DCs and the staff becomes an implement.'],
    ],
  },
  {
    slot: 'Dolorous (Weapons)',
    heroicCost: cost(10),
    legendaryCost: legendaryCost(50),
    rows: [
      ['Dolorous Flames', 'Adds Good alignment bypass and Flaming — 6d6 Fire damage on each critical hit.', 'Adds Good alignment bypass. Your attacks and spells have a small chance to deal a large amount of Fire damage.'],
      ['Dolorous Chill', 'Adds Chaotic alignment bypass and Freezing — 6d6 Ice damage on each critical hit.', 'Adds Chaotic alignment bypass. Your attacks and spells have a chance to inflict ten stacks of Cold damage over time.'],
      ['Dolorous Sparks', 'Adds Lawful alignment bypass and Jolting — 6d6 Lightning damage on each critical hit.', 'Adds Lawful alignment bypass. Your attacks and spells have a small chance to deal a massive amount of Electric damage.'],
      ['Dolorous Acid', 'Adds Evil alignment bypass and Corroding — 6d6 Acid damage on each critical hit.', 'Adds Evil alignment bypass. Your attacks and spells deal a large amount of stacking Acid damage over time.'],
      ['Dolorous Dimlight', '', 'Legendary only — there is no heroic version.'],
      ['Dolorous Shadows', '', 'Legendary only — there is no heroic version.'],
      ['Dolorous Focus', '+2 Equipment bonus to all Spell DCs.', '+5 Equipment bonus to all Spell DCs.'],
      ['Dolorous Arcana: Acid', '+35 Insight bonus to Acid Spellpower.', '+79 Insight bonus to Acid Spellpower.'],
      ['Dolorous Arcana: Cold', '+35 Insight bonus to Cold Spellpower.', '+79 Insight bonus to Cold Spellpower.'],
      ['Dolorous Arcana: Electric', '+35 Insight bonus to Electric Spellpower.', '+79 Insight bonus to Electric Spellpower.'],
      ['Dolorous Arcana: Fire', '+35 Insight bonus to Fire Spellpower.', '+79 Insight bonus to Fire Spellpower.'],
      ['Dolorous Arcana: Force', '+35 Insight bonus to Force and Physical Spellpower.', '+79 Insight bonus to Force and Physical Spellpower.'],
      ['Dolorous Arcana: Light', '+35 Insight bonus to Light and Alignment Spellpower.', '+79 Insight bonus to Light and Alignment Spellpower.'],
      ['Dolorous Arcana: Negative', '+35 Insight bonus to Negative and Poison Spellpower.', '+79 Insight bonus to Negative and Poison Spellpower.'],
      ['Dolorous Arcana: Positive', '+35 Insight bonus to Positive Spellpower.', '+79 Insight bonus to Positive Spellpower.'],
      ['Dolorous Arcana: Repair', '+35 Insight bonus to Repair Spellpower.', '+79 Insight bonus to Repair Spellpower.'],
      ['Dolorous Arcana: Sonic', '+35 Insight bonus to Sonic Spellpower.', '+79 Insight bonus to Sonic Spellpower.'],
    ],
  },
  {
    slot: 'Miserable (Weapons)',
    heroicCost: cost(5, ['20 Bleak Wires']),
    legendaryCost: legendaryCost(25, ['100 Bleak Wires']),
    rows: [
      ['Miserable Flames', '+1 Exceptional bonus to Strength.', '+2 Exceptional bonus to Strength.'],
      ['Miserable Chill', '+1 Exceptional bonus to Wisdom.', '+2 Exceptional bonus to Wisdom.'],
      ['Miserable Sparks', '+1 Exceptional bonus to Charisma.', '+2 Exceptional bonus to Charisma.'],
      ['Miserable Acid', '+1 Exceptional bonus to Constitution.', '+2 Exceptional bonus to Constitution.'],
      ['Miserable Dimlight', '+1 Exceptional bonus to Intelligence.', '+2 Exceptional bonus to Intelligence.'],
      ['Miserable Shadows', '+1 Exceptional bonus to Dexterity.', '+2 Exceptional bonus to Dexterity.'],
      ['Miserable Arcana: Acid', '+70 Equipment bonus to Acid Spellpower.', '+159 Equipment bonus to Acid Spellpower.'],
      ['Miserable Arcana: Cold', '+70 Equipment bonus to Cold Spellpower.', '+159 Equipment bonus to Cold Spellpower.'],
      ['Miserable Arcana: Electric', '+70 Equipment bonus to Electric Spellpower.', '+159 Equipment bonus to Electric Spellpower.'],
      ['Miserable Arcana: Fire', '+70 Equipment bonus to Fire Spellpower.', '+159 Equipment bonus to Fire Spellpower.'],
      ['Miserable Arcana: Force', '+70 Equipment bonus to Force and Physical Spellpower.', '+159 Equipment bonus to Force and Physical Spellpower.'],
      ['Miserable Arcana: Light', '+70 Equipment bonus to Light and Alignment Spellpower.', '+159 Equipment bonus to Light and Alignment Spellpower.'],
      ['Miserable Arcana: Negative', '+70 Equipment bonus to Negative and Poison Spellpower.', '+159 Equipment bonus to Negative and Poison Spellpower.'],
      ['Miserable Arcana: Positive', '+70 Equipment bonus to Positive Spellpower.', '+159 Equipment bonus to Positive Spellpower.'],
      ['Miserable Arcana: Repair', '+70 Equipment bonus to Repair Spellpower.', '+159 Equipment bonus to Repair Spellpower.'],
      ['Miserable Arcana: Sonic', '+70 Equipment bonus to Sonic Spellpower.', '+159 Equipment bonus to Sonic Spellpower.'],
      ['Miserable (Improved) Destruction', 'Your attacks apply a stack of Armor Destruction: −1 Armor Class and −1% Fortification for 20 seconds, stacking 15 times. Triggers once every three seconds.', 'The same, triggering once every second.'],
      ['Miserable Maiming', 'Adds Maiming — an additional +2d8 damage on a critical hit.', 'Adds Maiming — an additional +7d8 damage on a critical hit.'],
      ['Miserable Humanoid Bane', 'An additional 2d10 bane damage against Humanoids.', 'An additional 7d10 bane damage against Humanoids.'],
      ['Miserable Monstrous Humanoid Bane', 'An additional 2d10 bane damage against Monstrous Humanoids.', 'An additional 7d10 bane damage against Monstrous Humanoids.'],
      ['Miserable Undead Bane', 'An additional 2d10 bane damage against Undead.', 'An additional 7d10 bane damage against Undead.'],
      ['Miserable Vermin Bane', 'An additional 2d10 bane damage against Vermin.', 'An additional 7d10 bane damage against Vermin.'],
      ['Miserable Armor-Piercing', 'Adds Armor-Piercing — +8% Enhancement bonus to bypass enemy Fortification.', 'Adds Armor-Piercing — +23% Enhancement bonus to bypass enemy Fortification.'],
    ],
  },
  {
    slot: 'Woeful (Weapons)',
    heroicCost: [],
    legendaryCost: legendaryCost(50, ['50 Bleak Transformers']),
    rows: [
      ['Woeful Flames', '', 'Your attacks and offensive spells have a chance to reduce enemy Magical Resistance Rating and Universal Spell Power. Grants Legendary Ash.'],
      ['Woeful Chill', '', 'Your attacks and offensive spells have a chance to freeze your target in a block of ice. Grants Legendary Ice.'],
      ['Woeful Sparks', '', 'Your attacks and offensive spells have a chance to inflict multiple stacks of Vulnerability. Grants Legendary Vacuum.'],
      ['Woeful Acid', '', 'Your attacks and offensive spells have a chance to reduce enemy Physical Resistance Rating and Positive Healing Amplification. Grants Legendary Dust.'],
      ['Woeful Dimlight', '', 'Your attacks and offensive spells have a chance to grant you 1,000 temporary hit points. Grants Legendary Affirmation.'],
      ['Woeful Shadows', '', 'Your attacks and offensive spells have a chance to reduce enemy Physical and Magical Resistance Rating. Grants a version of Constricting Nightmare that works with spells.'],
    ],
  },
  {
    slot: 'Melancholic (Accessories)',
    heroicCost: cost(5),
    legendaryCost: legendaryCost(25),
    rows: [
      ['Melancholic False Life', '+18 Enhancement bonus to Maximum HP.', '+57 Enhancement bonus to Maximum HP.'],
      ['Melancholic Charisma', '+5 Enhancement bonus to Charisma.', '+15 Enhancement bonus to Charisma.'],
      ['Melancholic Constitution', '+5 Enhancement bonus to Constitution.', '+15 Enhancement bonus to Constitution.'],
      ['Melancholic Dexterity', '+5 Enhancement bonus to Dexterity.', '+15 Enhancement bonus to Dexterity.'],
      ['Melancholic Intelligence', '+5 Enhancement bonus to Intelligence.', '+15 Enhancement bonus to Intelligence.'],
      ['Melancholic Strength', '+5 Enhancement bonus to Strength.', '+15 Enhancement bonus to Strength.'],
      ['Melancholic Wisdom', '+5 Enhancement bonus to Wisdom.', '+15 Enhancement bonus to Wisdom.'],
      ['Melancholic Acid Spell Crit Damage', '+10% Enhancement bonus to Acid Spell Crit Damage.', '+23% Enhancement bonus to Acid Spell Crit Damage.'],
      ['Melancholic Cold Spell Crit Damage', '+10% Enhancement bonus to Cold Spell Crit Damage.', '+23% Enhancement bonus to Cold Spell Crit Damage.'],
      ['Melancholic Electric Spell Crit Damage', '+10% Enhancement bonus to Electric Spell Crit Damage.', '+23% Enhancement bonus to Electric Spell Crit Damage.'],
      ['Melancholic Fire Spell Crit Damage', '+10% Enhancement bonus to Fire Spell Crit Damage.', '+23% Enhancement bonus to Fire Spell Crit Damage.'],
      ['Melancholic Force Spell Crit Damage', '+10% Enhancement bonus to Force and Physical Spell Crit Damage.', '+23% Enhancement bonus to Force and Physical Spell Crit Damage.'],
      ['Melancholic Light Spell Crit Damage', '+10% Enhancement bonus to Light and Alignment Spell Crit Damage.', '+23% Enhancement bonus to Light and Alignment Spell Crit Damage.'],
      ['Melancholic Negative Spell Crit Damage', '+10% Enhancement bonus to Negative and Poison Spell Crit Damage.', '+23% Enhancement bonus to Negative and Poison Spell Crit Damage.'],
      ['Melancholic Positive Spell Crit Damage', '+10% Enhancement bonus to Positive Spell Crit Damage.', '+23% Enhancement bonus to Positive Spell Crit Damage.'],
      ['Melancholic Repair Spell Crit Damage', '+10% Enhancement bonus to Repair Spell Crit Damage.', '+23% Enhancement bonus to Repair Spell Crit Damage.'],
      ['Melancholic Sonic Spell Crit Damage', '+10% Enhancement bonus to Sonic Spell Crit Damage.', '+23% Enhancement bonus to Sonic Spell Crit Damage.'],
      ['Melancholic Doublestrike', '+6% Enhancement bonus to Doublestrike.', '+17% Enhancement bonus to Doublestrike.'],
      ['Melancholic Doubleshot', '+3% Enhancement bonus to Doubleshot.', '+9% Enhancement bonus to Doubleshot.'],
    ],
  },
  {
    slot: 'Dolorous (Accessories)',
    heroicCost: cost(10),
    legendaryCost: legendaryCost(50),
    rows: [
      ['Dolorous Healing Amplification', '+19 Competence bonus to Positive Healing Amplification.', '+61 Competence bonus to Positive Healing Amplification.'],
      ['Dolorous Negative Amplification', '+19 Profane bonus to Negative Healing Amplification.', '+61 Profane bonus to Negative Healing Amplification.'],
      ['Dolorous Repair Amplification', '+19 Enhancement bonus to Repair Amplification.', '+61 Enhancement bonus to Repair Amplification.'],
      ['Dolorous Accuracy', '+8 Competence bonus to Attack.', '+23 Competence bonus to Attack.'],
      ['Dolorous Damage', '+4 Competence bonus to Damage.', '+12 Competence bonus to Damage.'],
      ['Dolorous Deception', '+3 Enhancement bonus to Sneak Attacks, +5 Enhancement bonus to Sneak Attack Damage.', '+12 Enhancement bonus to Sneak Attacks, +18 Enhancement bonus to Sneak Attack Damage.'],
      ['Dolorous Seeker', '+5 Enhancement bonus to Critical Confirmation and Critical Damage.', '+15 Enhancement bonus to Critical Confirmation and Critical Damage.'],
      ['Dolorous Acid Spell Crit Damage', '+5% Insight bonus to Acid Spell Crit Damage.', '+12% Insight bonus to Acid Spell Crit Damage.'],
      ['Dolorous Cold Spell Crit Damage', '+5% Insight bonus to Cold Spell Crit Damage.', '+12% Insight bonus to Cold Spell Crit Damage.'],
      ['Dolorous Electric Spell Crit Damage', '+5% Insight bonus to Electric Spell Crit Damage.', '+12% Insight bonus to Electric Spell Crit Damage.'],
      ['Dolorous Fire Spell Crit Damage', '+5% Insight bonus to Fire Spell Crit Damage.', '+12% Insight bonus to Fire Spell Crit Damage.'],
      ['Dolorous Force Spell Crit Damage', '+5% Insight bonus to Force and Physical Spell Crit Damage.', '+12% Insight bonus to Force and Physical Spell Crit Damage.'],
      ['Dolorous Light Spell Crit Damage', '+5% Insight bonus to Light and Alignment Spell Crit Damage.', '+12% Insight bonus to Light and Alignment Spell Crit Damage.'],
      ['Dolorous Negative Spell Crit Damage', '+5% Insight bonus to Negative and Poison Spell Crit Damage.', '+12% Insight bonus to Negative and Poison Spell Crit Damage.'],
      ['Dolorous Positive Spell Crit Damage', '+5% Insight bonus to Positive Spell Crit Damage.', '+12% Insight bonus to Positive Spell Crit Damage.'],
      ['Dolorous Repair Spell Crit Damage', '+5% Insight bonus to Repair Spell Crit Damage.', '+12% Insight bonus to Repair Spell Crit Damage.'],
      ['Dolorous Sonic Spell Crit Damage', '+5% Insight bonus to Sonic Spell Crit Damage.', '+12% Insight bonus to Sonic Spell Crit Damage.'],
      ['Dolorous Quality Charisma', '+1 Quality bonus to Charisma.', '+3 Quality bonus to Charisma.'],
      ['Dolorous Quality Constitution', '+1 Quality bonus to Constitution.', '+3 Quality bonus to Constitution.'],
      ['Dolorous Quality Dexterity', '+1 Quality bonus to Dexterity.', '+3 Quality bonus to Dexterity.'],
      ['Dolorous Quality Intelligence', '+1 Quality bonus to Intelligence.', '+3 Quality bonus to Intelligence.'],
      ['Dolorous Quality Strength', '+1 Quality bonus to Strength.', '+3 Quality bonus to Strength.'],
      ['Dolorous Quality Wisdom', '+1 Quality bonus to Wisdom.', '+3 Quality bonus to Wisdom.'],
      ['Dolorous Quality Accuracy', '+1 Quality bonus to Attack.', '+5 Quality bonus to Attack.'],
      ['Dolorous Quality Damage', '+1 Quality bonus to Damage.', '+3 Quality bonus to Damage.'],
      ['Dolorous Quality Combat Mastery', '+1 Quality bonus to the DC to resist your Trip, Improved Trip, Sunder, Improved Sunder, Stunning Blow and Stunning Fist attempts.', '+3 Quality bonus to the same DCs.'],
    ],
  },
  {
    slot: 'Miserable (Accessories)',
    heroicCost: cost(5, ['20 Bleak Wires']),
    legendaryCost: legendaryCost(25, ['100 Bleak Wires']),
    rows: [
      ['Miserable Physical Resistance Rating', '+12 Enhancement bonus to Physical Resistance Rating.', '+38 Enhancement bonus to Physical Resistance Rating.'],
      ['Miserable Magical Resistance Rating', '+12 Enhancement bonus to Magical Resistance Rating.', '+38 Enhancement bonus to Magical Resistance Rating.'],
      ['Miserable Stunning', '+6 Enhancement bonus to Stunning DCs.', '+17 Enhancement bonus to Stunning DCs.'],
      ['Miserable Trip', '+6 Enhancement bonus to Trip DCs.', '+17 Enhancement bonus to Trip DCs.'],
      ['Miserable Sunder', '+6 Enhancement bonus to Sunder DCs.', '+17 Enhancement bonus to Sunder DCs.'],
      ['Miserable Assassinate', '+6 Enhancement bonus to Assassinate DCs.', '+17 Equipment bonus to Assassinate DCs.'],
      ['Miserable Spell Penetration', '+3 Equipment bonus to Spell Penetration.', '+10 Equipment bonus to Spell Penetration.'],
      ['Miserable Acid Spell Crit Damage', '+2% Quality bonus to Acid Spell Crit Damage.', '+6% Quality bonus to Acid Spell Crit Damage.'],
      ['Miserable Cold Spell Crit Damage', '+2% Quality bonus to Cold Spell Crit Damage.', '+6% Quality bonus to Cold Spell Crit Damage.'],
      ['Miserable Electric Spell Crit Damage', '+2% Quality bonus to Electric Spell Crit Damage.', '+6% Quality bonus to Electric Spell Crit Damage.'],
      ['Miserable Fire Spell Crit Damage', '+2% Quality bonus to Fire Spell Crit Damage.', '+6% Quality bonus to Fire Spell Crit Damage.'],
      ['Miserable Force Spell Crit Damage', '+2% Quality bonus to Force and Physical Spell Crit Damage.', '+6% Quality bonus to Force and Physical Spell Crit Damage.'],
      ['Miserable Light Spell Crit Damage', '+2% Quality bonus to Light and Alignment Spell Crit Damage.', '+6% Quality bonus to Light and Alignment Spell Crit Damage.'],
      ['Miserable Negative Spell Crit Damage', '+2% Quality bonus to Negative and Poison Spell Crit Damage.', '+6% Quality bonus to Negative and Poison Spell Crit Damage.'],
      ['Miserable Positive Spell Crit Damage', '+2% Quality bonus to Positive Spell Crit Damage.', '+6% Quality bonus to Positive Spell Crit Damage.'],
      ['Miserable Repair Spell Crit Damage', '+2% Quality bonus to Repair Spell Crit Damage.', '+6% Quality bonus to Repair Spell Crit Damage.'],
      ['Miserable Sonic Spell Crit Damage', '+2% Quality bonus to Sonic Spell Crit Damage.', '+6% Quality bonus to Sonic Spell Crit Damage.'],
    ],
  },
  {
    slot: 'Woeful (Accessories)',
    heroicCost: cost(10, ['10 Bleak Transformers']),
    legendaryCost: legendaryCost(50, ['50 Bleak Transformers']),
    rows: [
      ['Woeful Resistance', '+4 Resistance bonus to all Saving Throws.', '+12 Resistance bonus to all Saving Throws.'],
      ['Woeful Enhanced Ghostly', 'You become partially incorporeal: your attacks ignore the miss chance against incorporeal targets, enemy attacks have a 15% chance to miss you, and +5 Enhancement bonus to Hide and Move Silently.', 'The same effect at legendary level.'],
      ['Woeful Relentless Fury', 'Killing blows may drive you into a rage, giving +5% Enhancement damage to melee, ranged and unarmed attacks for 30 seconds. Weaker opponents trigger it less often.', 'The same effect at legendary level.'],
      ['Woeful Armor Piercing', '+8% Enhancement bonus to Fortification bypass.', '+23% Enhancement bonus to Fortification bypass.'],
      ['Woeful Wizardry', '+96 Enhancement bonus to Maximum SP.', '+310 Enhancement bonus to Maximum SP.'],
      ['Woeful Profane DCs', '+1 Profane bonus to Spell DCs.', '+2 Profane bonus to Spell DCs.'],
      ['Woeful Sacred DCs', '+1 Sacred bonus to Spell DCs.', '+2 Sacred bonus to Spell DCs.'],
    ],
  },
  {
    slot: 'Melancholic (Armor)',
    heroicCost: cost(5, ['20 Bleak Wires']),
    legendaryCost: legendaryCost(25, ['100 Bleak Wires']),
    rows: [
      ['Melancholic Device', 'You have Deathblock and are Ghostly.', 'You have Deathblock and are Ghostly.'],
      ['Melancholic Plating', '+70% Enhancement bonus to Fortification.', '+160% Enhancement bonus to Fortification.'],
      ['Melancholic Converter', '+19 Competence bonus to Positive Healing Amplification.', '+19 Enhancement bonus to Repair Healing Amplification.'],
      ['Melancholic Booster', '+3% Exceptional bonus to Universal Spell Lore.', '+5% Exceptional bonus to Universal Spell Lore.'],
    ],
  },
  {
    slot: 'Dolorous (Armor)',
    heroicCost: cost(10, ['10 Bleak Transformers']),
    legendaryCost: legendaryCost(50, ['50 Bleak Transformers']),
    rows: [
      ['Dolorous Silencer', '+1d6 Profane bonus to your Sneak Attack Dice.', '+2d6 Profane bonus to your Sneak Attack Dice.'],
      ['Dolorous Invigorator', '+1 Profane bonus to Spell DCs, Tactical DCs and Assassinate.', '+2 Profane bonus to Spell DCs, Tactical DCs and Assassinate.'],
      ['Dolorous Voidwheel', '+5 Exceptional bonus to Universal Spell Power.', '+15 Exceptional bonus to Universal Spell Power.'],
    ],
  },
]

/**
 * The Wicked variants, added later and legendary-only.
 *
 * The wiki gives these their own section rather than folding them into the
 * tables above, and gives no separate ingredient cost — they are crafted at
 * the same legendary workbench for the same family price.
 */
const WICKED_SECTIONS: VikSection[] = [
  {
    slot: 'Wicked — Miserable (Weapons)',
    heroicCost: [],
    legendaryCost: legendaryCost(25, ['100 Bleak Wires']),
    rows: [
      ['Miserable Metalline', '', 'This weapon bypasses metal-based damage reduction.'],
      ['Miserable Planar', '', 'This weapon bypasses alignment-based damage reduction.'],
      ['Miserable Acid Spell Crit Chance', '', 'Your Acid spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Cold Spell Crit Chance', '', 'Your Cold spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Electric Spell Crit Chance', '', 'Your Electric spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Fire Spell Crit Chance', '', 'Your Fire spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Force Spell Crit Chance', '', 'Your Force spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Light Spell Crit Chance', '', 'Your Light and Alignment spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Negative Spell Crit Chance', '', 'Your Negative and Poison spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Positive Spell Crit Chance', '', 'Your Positive spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Repair Spell Crit Chance', '', 'Your Repair spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Miserable Sonic Spell Crit Chance', '', 'Your Sonic spells have a +23% Equipment bonus to their chance to critical hit.'],
    ],
  },
  {
    slot: 'Wicked — Miserable (Accessories)',
    heroicCost: [],
    legendaryCost: legendaryCost(25, ['100 Bleak Wires']),
    rows: [
      ['Miserable Legendary Armor Piercing', '', '+5 Legendary bonus to bypass enemy Fortification.'],
      ['Miserable Force Absorption', '', '+17% Enhancement bonus to Force Absorption.'],
      ['Miserable Rebellion', '', '−25% Insight bonus to threat from all sources.'],
    ],
  },
  {
    slot: 'Wicked — Woeful (Weapons)',
    heroicCost: [],
    legendaryCost: legendaryCost(50, ['50 Bleak Transformers']),
    rows: [
      ['Woeful Exceptional Spell Focus Mastery', '', '+2 Exceptional bonus to Spell DCs.'],
      ['Woeful Salt', '', 'Your attacks and offensive spells have a chance to significantly slow enemies — eight stacks that fade over time, on a short internal cooldown. Does not affect bosses. Grants Legendary Salt.'],
      ['Woeful Shadow', '', '+3% Profane Doublestrike and Doubleshot, +15% Enhancement bonus to Melee Alacrity, +20% Enhancement bonus to Ranged Alacrity.'],
      ['Woeful Magma', '', 'Your attacks and offensive spells have a high chance to deal very strong Fire damage over time. Grants Dripping with Magma.'],
      ['Woeful Frostbite', '', 'Your attacks and offensive spells have a high chance to deal very strong Cold damage over time. Grants Bitter Frostbite.'],
      ['Woeful Lightning', '', 'Your attacks and offensive spells have a high chance to deal very strong Electric damage over time. Grants Lightning Lash.'],
      ['Woeful Acidburn', '', 'Your attacks and offensive spells have a high chance to deal very strong Acid damage over time. Grants Lingering Acidic Burn.'],
      ['Woeful Echoes', '', 'Your attacks and offensive spells have a high chance to deal very strong Sonic damage over time. Grants Rupturing Echo.'],
      ['Woeful Venom', '', 'Your attacks and offensive spells have a high chance to deal very strong Poison damage over time. Grants Grip of Venom.'],
      ['Woeful Energy', '', 'Your attacks and offensive spells have a high chance to deal very strong Force damage over time. Grants Rippling Energy.'],
    ],
  },
  {
    slot: 'Wicked — Woeful (Accessories)',
    heroicCost: [],
    legendaryCost: legendaryCost(50, ['50 Bleak Transformers']),
    rows: [
      ['Woeful Acid Spell Crit Chance', '', 'Your Acid spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Cold Spell Crit Chance', '', 'Your Cold spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Electric Spell Crit Chance', '', 'Your Electric spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Fire Spell Crit Chance', '', 'Your Fire spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Force Spell Crit Chance', '', 'Your Force spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Light Spell Crit Chance', '', 'Your Light and Alignment spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Negative Spell Crit Chance', '', 'Your Negative and Poison spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Positive Spell Crit Chance', '', 'Your Positive spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Repair Spell Crit Chance', '', 'Your Repair spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Sonic Spell Crit Chance', '', 'Your Sonic spells have a +23% Equipment bonus to their chance to critical hit.'],
      ['Woeful Quality Seeker', '', '+3 Quality bonus to confirm critical hits, and to damage before the multiplier on critical hits.'],
      ['Woeful Greater Marksmanship', '', '+3 Competence bonus to Ranged Attack and +2 Competence bonus to Ranged Damage.'],
      ['Woeful Strength of Purpose', '', '+128 to Unconsciousness Range, and 16 hit points of Positive healing every 6 seconds.'],
      ['Woeful Quality Spell Focus Mastery', '', '+2 Quality bonus to Spell DCs.'],
    ],
  },
]

/**
 * Splits one section into its heroic and legendary halves.
 *
 * They are separate slots on the page because they are separate workbenches
 * in game — one each for the heroic and legendary systems, in Ludendorf City
 * Hall — and because mixing ML 8 and ML 34 values in one list is how people
 * craft the wrong one.
 */
function toSlots(section: VikSection): ManualSlot[] {
  const slots: ManualSlot[] = []

  const heroic: ManualRecipe[] = section.heroicCost.length === 0 ? [] : section.rows
    .filter(([, effect]) => effect.length > 0)
    .map(([name, effect]) => ({
      name,
      description: effect,
      minLevel: 8,
      ingredients: section.heroicCost,
    }))
  if (heroic.length > 0) slots.push({ type: `${section.slot} — Heroic, ML 8`, recipes: heroic })

  const legendary: ManualRecipe[] = section.rows
    .filter(([, , effect]) => effect.length > 0)
    .map(([name, , effect]) => ({
      name: `Legendary ${name}`,
      description: effect,
      minLevel: 34,
      ingredients: section.legendaryCost,
    }))
  if (legendary.length > 0) slots.push({ type: `${section.slot} — Legendary, ML 34`, recipes: legendary })

  return slots
}

export const VIKTRANIUM: CraftingSystemMeta = {
  key: 'viktranium',
  name: 'Viktranium Experiment Crafting',
  category: 'Item upgrades',
  blurb: 'Bleak parts become Lamordia augments — Melancholic, Dolorous, Miserable and Woeful.',
  detail:
    'The Chill of Ravenloft\'s crafting, and mechanically a rerun of Dinosaur Bone: '
    + 'collect ingredients, craft them into typed augments, slot those into the matching '
    + 'typed slots on Ravenloft gear. What makes it worth planning is the ingredient '
    + 'geography. The four base parts — Alternators, Conductors, Insulators and Resistors '
    + '— come from quests, so the Melancholic and Dolorous families are farmable by '
    + 'questing alone. Miserable augments additionally want Bleak Wires, which come from '
    + 'the raid and wilderness encounters; Woeful augments want Bleak Transformers, from '
    + 'the raid and special wilderness encounters only. Slot types are exact matches: a '
    + 'Melancholic (Weapon) augment will not go into a Melancholic Slot (Armor). Heroic '
    + 'slots do accept legendary augments, but doing so drags the heroic item to ML 34.',
  where: 'The workbenches in Ludendorf City Hall — one for the heroic system, one for the legendary.',
  ingredients: 'Bleak Conductors, Insulators, Alternators and Resistors from quests; Bleak Wires and Transformers from the wilderness and the raid; Legendary Bleak Mementos from Relentless.',
  source: 'The Chill of Ravenloft. Most named items from the pack carry Melancholic and Dolorous slots; rares and minor artifacts add a Miserable slot, and Calamitous weapons carry all of them.',
  wiki: 'https://ddowiki.com/page/Viktranium_Experiment_crafting',
  files: [],
  manual: [
    {
      type: 'Craftable weapons',
      recipes: [
        {
          name: 'Calamitous weapon',
          description:
            'ML 8, +4 enhancement bonus and 1[W], Vampirism 1, with Melancholic, Dolorous '
            + 'and Miserable weapon slots and a red augment slot.',
          minLevel: 8,
          ingredients: WEAPON_PARTS,
          note: 'Cannot take a Mythic bonus.',
        },
        {
          name: 'Legendary Calamitous weapon',
          description:
            'ML 34, +15 enhancement bonus, 5.8[W] and +2/+4 loaded weapon dice for one- and '
            + 'two-handers, with all four Lamordia weapon slots plus orange and purple augment slots.',
          minLevel: 34,
          ingredients: LEGENDARY_WEAPON_PARTS,
          note: 'Cannot take a Mythic bonus.',
        },
        {
          name: 'Legendary Cataclysmic weapon or shield',
          description:
            'The same as a Legendary Calamitous weapon but with +3/+6 loaded weapon dice, '
            + 'and available as a shield. Also drops pre-crafted in the raid, which is the '
            + 'only way one of these can carry a Mythic bonus.',
          minLevel: 34,
          ingredients: [...LEGENDARY_WEAPON_PARTS, '25 Legendary Bleak Mementos'],
          note: 'Crafted at a station inside Relentless — safely, before the raid starts. Bound to character.',
        },
      ],
    },
    ...SECTIONS.flatMap(toSlots),
    ...WICKED_SECTIONS.flatMap(toSlots),
  ],
}
