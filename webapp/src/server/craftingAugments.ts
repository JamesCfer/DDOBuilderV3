// The systems that make augments and sentience rather than gear.
//
// Three of these turn a raid item into something you slot: the Soulforge
// renders one into an Essence Augment carrying that item's signature effect,
// and the Cauldron of Cadence renders one into a Set Augment that overrides
// whatever set the host item belonged to. Both cost the item — you are
// trading a piece of gear for the ability to carry its best line on any
// other piece. Sentient Weapon is the fourth: not an augment, but the same
// question of what goes into a socket you have to earn first.

import type { CraftingSystemMeta } from './crafting'

// ---------------------------------------------------------------------------
// Cauldron of Cadence — Ferrocrystal and Set Augments
// ---------------------------------------------------------------------------

/** Name, the raid item it consumes, its three-piece bonus, where that item drops. */
const SET_AUGMENTS: Array<[string, string, string, string]> = [
  ['Alluring Elocution', 'Tattered Scrolls of the Broken One', '+3 Artifact bonus to Charisma', 'Too Hot to Handle'],
  ['Arcane Barrier', 'Mantle of Escher', '+30 Magical Resistance Rating cap', 'The Curse of Strahd'],
  ['Arcane Guardian', "Citadel's Gaze", '+30 Artifact bonus to MRR', 'Too Hot to Handle'],
  ['Bold Tactician', 'Page Regalia: Exiled Tactica', '+3 Artifact bonus to Tactical DCs', 'Fire Over Morgrave'],
  ['Brutal Blows', 'Mail of the Mroranon', '+3 Artifact bonus to Strength', 'Killing Time'],
  ['Cruel Cut', "The Family's Blessing", '+15% Artifact bonus to damage against the Helpless', 'Project Nemesis'],
  ['Cunning Impact', 'Strange Tidings', '+3 Artifact bonus to Dexterity', 'Defiler of the Just'],
  ['Dusk Raider', 'Coat of Van Richten', '+15 Artifact bonus to Melee and Ranged Power', 'The Curse of Strahd'],
  ['Esoterica', 'Cloak of the Mountain', '+3 Artifact bonus to all Spell DCs', 'Killing Time'],
  ['Imbued Infusion', "Kelas' Volatile Mixture", '+3 Artifact bonus to bonus Imbue Dice', 'Skeletons in the Closet'],
  ['Legendary Bulwark', 'The Stablestone', '+10% Legendary bonus to Maximum Hit Points', 'Hunt or Be Hunted'],
  ['Paragon Guard', 'Platemail of Strahd', '+15% Artifact bonus to Armor Class', 'The Curse of Strahd'],
  ['Perfect Silence', 'Vestments of Ravenloft', '+3 Artifact bonus to Sneak Attack Dice', "Old Baba's Hut"],
  ['Piercing Mind', 'Staggershockers', '+3 Artifact bonus to Intelligence', 'Project Nemesis'],
  ['Quickblade', 'Guided Sight', '+15% Artifact bonus to Doublestrike and Doubleshot', 'Riding the Storm Out'],
  ['Subtle Blade', 'Page Regalia: Unsanctioned Arcana', '+3 Artifact bonus to Assassinate DCs', 'Fire Over Morgrave'],
  ['Touch of Power', "Attunement's Gaze", '+25 Artifact bonus to Universal Spell Power', 'Project Nemesis'],
  ['Tough Shields', "Dumathoin's Bracers", '+30 Artifact bonus to Physical Resistance Rating', 'Temple of the Deathwyrm'],
  ['Truthful Blow', 'Helm of the Final Watcher', '+30% Artifact bonus to Fortification bypass', 'Project Nemesis'],
  ['Visions of the Beyond', 'Crystalline Gauntlets', '+3 Artifact bonus to Wisdom', 'Too Hot to Handle'],
  ['Wild Fortitude', 'Quori-Infused Core', '+3 Artifact bonus to Constitution', 'Legendary Lord of Blades'],
]

const CAULDRON_OF_CADENCE: CraftingSystemMeta = {
  key: 'cauldron-of-cadence',
  name: 'Cauldron of Cadence',
  category: 'Item upgrades',
  blurb: 'Ferrocrystal weapons from the Feywild, and Set Augments that override an item\'s own set.',
  detail:
    'Two systems at one cauldron. Ferrocrystal weaponry is a plain trade — 20 Chunks of '
    + 'Ferrocrystal for a weapon at ML 5, or 20 Legendary Chunks for one at ML 29, in any '
    + 'standard weapon type. Most of them carry the qualities that bypass Feywild damage '
    + 'reduction, which is what they are for. The Set Augments are the more interesting '
    + 'half: each consumes a specific raid item and turns its set into a level 30 augment '
    + 'that fits any colour of slot. The catch worth reading twice is that an augment set '
    + 'bonus takes priority over an item set bonus — slot one of these into a set item '
    + 'and it overrides the set that item already belonged to. Getting into the Feywild '
    + 'at all means the Hut from Beyond, on the north side of the Stormreach Harbour '
    + 'docks: choose "Journey to the Feywild through the Hut from Beyond".',
  where: 'Through the Hut from Beyond, north side of the docks in Stormreach Harbour.',
  ingredients: 'Chunks of Ferrocrystal for the weapons; 50 Threads of Fate, an Empty Soul Vessel and the named raid item for each Set Augment.',
  source: 'Chests in The Feywild for the ferrocrystal; a spread of legendary raids for the Set Augment ingredients.',
  wiki: 'https://ddowiki.com/page/Cauldron_of_Cadence',
  files: [],
  manual: [
    {
      type: 'Ferrocrystal weaponry',
      recipes: [
        {
          name: 'Ferrocrystal weapon (heroic)',
          description: 'Any standard weapon type at ML 5, mostly with the qualities that bypass Feywild damage reduction.',
          minLevel: 5,
          ingredients: ['20 Chunks of Ferrocrystal'],
        },
        {
          name: 'Ferrocrystal weapon (legendary)',
          description: 'The same, at ML 29.',
          minLevel: 29,
          ingredients: ['20 Legendary Chunks of Ferrocrystal'],
        },
      ],
    },
    {
      type: 'Set Augments (ML 30, any augment colour)',
      recipes: SET_AUGMENTS.map(([name, item, bonus, raid]) => ({
        name: `Set Augment: ${name}`,
        description: `3 pieces equipped: ${bonus}. Renders ${item}, from ${raid}.`,
        minLevel: 30,
        ingredients: ['50 Threads of Fate', 'Empty Soul Vessel', item],
        note: 'Slotted into a set item, this overrides that item\'s own set bonus.',
      })),
    },
  ],
}

// ---------------------------------------------------------------------------
// Soulforge — Essence Augments
// ---------------------------------------------------------------------------

/** Name, augment colour, the raid item it consumes, its slotted effect, the raid. */
const ESSENCE_AUGMENTS: Array<[string, string, string, string, string]> = [
  ['Essence of the Cloak of Strahd', 'Yellow', 'The Invisible Cloak of Strahd', 'Invisibility', "Old Baba's Hut"],
  ['Essence of the Nullscale Armor', 'Yellow', 'Nullscale Armor', 'Nullmagic', 'Killing Time'],
  ['Essence of the Epic Litany of the Dead', 'Colorless', 'Epic Litany of the Dead', '+2 to an ability', 'Mark of Death'],
  ['Essence of Constellation, Broken and Reforged', 'Orange', 'The Broken Blade and The Shattered Hilt of Constellation, or Constellation, Cursed Blade', 'Improved deception', 'Too Hot to Handle'],
  ['Essence of The Masque', 'Blue', 'The Masque', 'Soundproof', 'The Curse of Strahd'],
  ['Essence of the Cobalt Guard', 'Purple', 'Cobalt Guard', 'Improved guard', 'Riding the Storm Out'],
  ['Essence of the Cracked Core', 'Yellow', 'Cracked Core', 'Alchemical Conservation', 'Project Nemesis'],
  ['Essence of Dark Diversion', 'Yellow', 'Dark Diversion', 'Occultation', 'Temple of the Deathwyrm'],
  ['Essence of the Spear of the Mournlands', 'Orange', 'Spear of the Mournlands', 'Touch of the Mournlands', 'Legendary Lord of Blades'],
  ['Essence of the Champion of the Twins', 'Blue', 'Champion of the Twins', "Healer's Bounty", 'Legendary Vision of Destruction'],
  ['Essence of Ultimatum', 'Green', 'Ultimatum', 'Petrification', 'Defiler of the Just'],
  ['Essence of the Dethek Runestone', 'Green', 'Dethek Runestone', 'Runic Revitalization', 'Fire on Thunder Peak'],
  ["Essence of Pomura's Memento", 'Green', "Pomura's Memento", 'Insightful Spell Lore V', 'Hunt or Be Hunted'],
]

const SOULFORGE: CraftingSystemMeta = {
  key: 'soulforge',
  name: 'Soulforge',
  category: 'Raid crafting',
  blurb: 'Renders a raid item down into a level 30 augment carrying that item\'s signature effect.',
  detail:
    'The Soulforge answers a specific frustration: a raid item whose one good line you '
    + 'want, on a slot you cannot spare for it. Feeding it the item gives an Essence '
    + 'Augment — account-bound, level 30, coloured to suit the effect — that carries that '
    + 'line and nothing else. The trade is real: the item is consumed, and the augment '
    + 'only fits a slot of its own colour, so a yellow essence needs a yellow slot. The '
    + 'price is otherwise flat, 50 Threads of Fate and an Empty Soul Vessel every time.',
  where: 'The Soulforge altar in the Eberron Hall of Heroes — lower level, first room, south-west corner.',
  ingredients: '50 Threads of Fate, an Empty Soul Vessel, and the raid item being rendered.',
  source: 'A spread of legendary raids — each essence names its own.',
  wiki: 'https://ddowiki.com/page/Soulforge',
  files: [],
  manual: [{
    type: 'Essence Augments (ML 30)',
    recipes: ESSENCE_AUGMENTS.map(([name, colour, item, effect, raid]) => ({
      name,
      description: `${colour} augment. Slotted effect: ${effect}. Renders ${item}, from ${raid}.`,
      minLevel: 30,
      ingredients: ['50 Threads of Fate', 'Empty Soul Vessel', item],
      note: `Fits ${colour.toLowerCase()} slots only.`,
    })),
  }],
}

// ---------------------------------------------------------------------------
// Augment Slot — the plain slotted augments
// ---------------------------------------------------------------------------

const AUGMENT_SLOT: CraftingSystemMeta = {
  key: 'augments',
  name: 'Augment Slot',
  category: 'Item upgrades',
  blurb: 'Every plain augment there is, grouped by the colour of slot it drops into.',
  detail:
    'Augments are the crafting most people do without noticing they are crafting: pull a '
    + 'gem, drop it into a coloured slot, and the item is now better. Colour is the whole '
    + 'rule — a topaz goes into a yellow slot and nowhere else — with the exception of '
    + 'colourless augments, which fit a colourless slot only, and the orange and purple '
    + 'slots, which are two colours fused and take either of their halves. Slotting is '
    + 'free and reversible in the sense that a replacement destroys the augment already '
    + 'there, not the item. Unlike everything else on this page there is no altar and no '
    + 'ingredient: these are loot, or bought with tokens, which is why the Crafting page '
    + 'lists them last. The recipes here are read straight from the game data, so this '
    + 'list is exactly what the builder\'s own augment picker offers.',
  where: 'Anywhere — augments are slotted from the inventory panel.',
  ingredients: 'None. Augments are looted, bought from vendors, or traded for tokens and commendations.',
  source: 'Chests across the whole game, plus the augment vendors in the Twelve and House Cannith.',
  wiki: 'https://ddowiki.com/page/Augment_Slot',
  // Read from the shipped augment files — these are the plain slotted gems the
  // rest of the catalogue deliberately excludes, because they are loot rather
  // than a system. They are here because the wiki's own crafting index lists
  // them, and because "which blue augment exists at level 28" is a real question.
  files: ['Diamond', 'Ruby', 'Sapphire', 'Topaz', 'Emerald', 'Named', 'Other'],
}

// ---------------------------------------------------------------------------
// Sentient Weapon
// ---------------------------------------------------------------------------

const SENTIENT_WEAPON: CraftingSystemMeta = {
  key: 'sentient-weapon',
  name: 'Sentient Weapon',
  category: 'Item upgrades',
  blurb: 'A jewel wakes a level 20+ weapon; feeding it named items opens filigree slots.',
  detail:
    'Sentience is a socket you have to earn. Slot a Sentient Jewel into a named weapon of '
    + 'ML 20 or higher — the tooltip says "Accepts Sentience" — and the weapon gains '
    + 'filigree slots that open as the jewel gains sentient XP. The XP belongs to the '
    + 'jewel, not the weapon, so moving a levelled jewel to a new weapon carries every '
    + 'slot with it; the weapon keeps nothing. XP comes from feeding the jewel named '
    + 'items, valued by their minimum level: one times ML up to 20, five times from 21 to '
    + '27, and more again above that, which is why people hoard high-level named junk. A '
    + 'jewel caps at 61,000 sXP, enough for seven slots. Each of the three Sparks — '
    + 'Memory, Dream and Logic — raises the cap by one slot, once per jewel, to 211,000 '
    + 'and ten slots with all three. A jewel\'s name and personality change only what the '
    + 'weapon says out loud; they do not restrict filigrees. Two practical limits: a '
    + 'one-handed weapon loses its off-hand slot once sentient, so no dual-wielding two of '
    + 'them, and neither jewels nor filigrees can be moved while inside a quest.',
  where: 'The Sentient Item panel — the red square on the right of your inventory, above the pet stable link.',
  ingredients: 'A Sentient Jewel, named items to feed it, and filigrees to slot. Sparks of Memory, Dream and Logic raise the cap.',
  source: 'Jewels and filigrees drop across epic and legendary content; most named ML 20+ weapons accept sentience, but crafted ones mostly do not.',
  wiki: 'https://ddowiki.com/page/Sentient_Weapon',
  files: [],
  manual: [
    {
      type: 'Making a sentient weapon',
      recipes: [
        {
          name: 'Sentient weapon',
          description:
            'Drag the weapon into the top-left square of the Sentient Item panel and the '
            + 'jewel into the top-right. The weapon\'s minimum level does not change.',
          minLevel: 20,
          ingredients: ['A named weapon of ML 20 or higher that accepts sentience', 'A Sentient Jewel'],
          note: 'The weapon cannot be equipped while you do this. An unbound weapon becomes account-bound, because the jewel is.',
        },
        {
          name: 'Filigree, slotted',
          description:
            'Drag a filigree onto an open slot. The same filigree cannot go into one weapon '
            + 'twice, but two filigrees from different sets granting the same bonus can.',
          ingredients: ['An open filigree slot', 'A filigree'],
          note: 'Filigrees shared between a sentient weapon and a Minor Artifact count towards the same set bonuses.',
        },
      ],
    },
    {
      type: 'Raising the slot cap',
      recipes: [
        {
          name: 'Spark of Memory',
          description: 'Raises the jewel\'s sXP cap by one slot. Once per jewel.',
          ingredients: ['Legendary White Plume Mountain drop, or 500 Threads of Fate'],
        },
        {
          name: 'Spark of Dream',
          description: 'Raises the cap by another slot. Once per jewel.',
          ingredients: ['A drop from Legendary Lord of Blades, Legendary Master Artificer, Legendary Vision of Destruction, Too Hot to Handle or Project Nemesis'],
        },
        {
          name: 'Spark of Logic',
          description: 'The third and last, taking the cap to 211,000 sXP and ten slots.',
          ingredients: ['Sinister Secret of Saltmarsh (Legendary) on Elite or True Elite, or the Saltmarsh Legendary Saga'],
          note: 'A spark alone does not open the slot — you still have to reach the next sXP threshold.',
        },
      ],
    },
    {
      type: 'Getting things back out',
      recipes: [
        {
          name: 'Sentience Destroyer',
          description: 'Destroys a filigree or a jewel to free its slot. Bought for platinum from tools vendors.',
          ingredients: ['Platinum, from any tools vendor — Gianthold, for instance'],
        },
        {
          name: 'Sentience Toolkit',
          description: 'Unslots a filigree or jewel intact rather than destroying it.',
          ingredients: ['DDO Points in the store, or the same chests that drop filigrees'],
          note: 'A jewel cannot be removed until every filigree is out first, and neither can be moved inside a quest.',
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Minor Artifact
// ---------------------------------------------------------------------------

const MINOR_ARTIFACT: CraftingSystemMeta = {
  key: 'minor-artifact',
  name: 'Minor Artifact',
  category: 'Item upgrades',
  blurb: 'The one-per-character item class: levelled with named items directly, no jewel needed.',
  detail:
    'Minor Artifacts are a class of named item rather than a recipe, but they sit on the '
    + 'crafting index for a good reason: they take filigrees and they are fed like a '
    + 'sentient weapon, and one whole crafting path — Perfected items, via a Nebula '
    + 'Fragment — exists to make them. The rules that matter are short. Only one Minor '
    + 'Artifact can be equipped at a time whatever slots are involved. They come with a '
    + 'single filigree slot and open more by being fed named items directly through the '
    + 'Sentient Weapon panel: no jewel is involved, they cannot consume one, and the XP '
    + 'cost per slot is half a jewel\'s. Their filigrees pool with a sentient weapon\'s '
    + 'for set-bonus purposes. Two traps: the number of filigree slots is fixed per '
    + 'artifact and a Sentient Spark will not raise it, and the Epic Voice of the Master '
    + 'has exactly one slot ever, so feeding it anything is wasted.',
  where: 'The Sentient Item panel, the same one sentient weapons use.',
  ingredients: 'Named items to feed it, and filigrees to slot. Perfected artifacts are crafted from a Nebula Fragment — see that system.',
  source: 'Masterminds of Sharn onwards; the Perfected line is crafted from legendary items at Lahar in The Twelve.',
  wiki: 'https://ddowiki.com/page/Minor_Artifact',
  files: [],
  manual: [{
    type: 'Levelling a Minor Artifact',
    recipes: [
      {
        name: 'Open a filigree slot',
        description:
          'Feed named items to the artifact through the Sentient Item panel. Each slot '
          + 'costs half what the same slot costs a Sentient Jewel.',
        minLevel: 20,
        ingredients: ['Named items to feed it'],
        note: 'It cannot consume Sentient Jewels — the game refuses. It can, oddly, consume another Minor Artifact, but only for that item\'s base value.',
      },
      {
        name: 'Slot a filigree',
        description:
          'Artifacts start with one slot. Filigrees here and on your sentient weapon '
          + 'count towards the same set bonuses.',
        ingredients: ['An open filigree slot', 'A filigree'],
        note: 'The maximum number of slots is fixed per artifact and no Sentient Spark will raise it.',
      },
    ],
  }],
}

export const AUGMENT_CRAFTING_SYSTEMS: CraftingSystemMeta[] = [
  CAULDRON_OF_CADENCE,
  SOULFORGE,
  AUGMENT_SLOT,
  SENTIENT_WEAPON,
  MINOR_ARTIFACT,
]
