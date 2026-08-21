// "Bring the named item, get the better named item."
//
// A dozen of DDO's crafting systems are the same bargain wearing different
// hats: one altar, one currency the quest chain drops, and a fixed list of
// items it will trade up. The list *is* the system — nobody asks how the
// Stormreaver Monument works, they ask whether it does anything for the
// Madstone Boots they just pulled — so these entries are mostly a faithful
// transcription of each wiki page's upgrade table.
//
// Where a page lists what an upgrade removes and adds, the interesting half
// is kept: what you gain. The full before-and-after enchantment lists belong
// on the item pages, and the wiki link on each system goes there.

import type { CraftingSystemMeta } from './crafting'

// ---------------------------------------------------------------------------
// Catalyst Crafting
// ---------------------------------------------------------------------------

/**
 * Base item, heroic result, legendary result, slot, catalyst type, drop site.
 *
 * An em dash in the legendary column means the wiki lists no legendary
 * variant, not that it is unknown — those items stop at heroic.
 */
const CATALYSTS: Array<[string, string, string, string, string, string]> = [
  ['The Blood Stone', 'The Bloody Boulder', 'Legendary The Bloody Boulder', 'Trinket', 'Abyssal', 'Flocked Together, end chest'],
  ['Bow of Sinew', "Demon's Arc", "Legendary Demon's Arc", 'Long Bow', 'Abyssal', 'A Blood Pact, end chest'],
  ['Cannith Boots of Propulsion', 'Demonic Rush', 'Legendary Demonic Rush', 'Boots', 'Abyssal', 'The Darklake, red-named rare encounter chests'],
  ['Cowl of the Devotee', 'Cowl of the Drow Devotee', '', 'Headgear', 'Deep', 'Demon in the Rough, end chest'],
  ["Death's Door", "Demon's Door", "Legendary Demon's Door", 'Large Shield', 'Abyssal', "If It Wasn't For Bad Luck, end chest"],
  ['Demon Scale Armor', 'Scales of Demogorgon', '', 'Heavy Armor', 'Abyssal', 'For Want of a Heart, end chest'],
  ['Drow Bastard Sword of the Weapon Master', 'Perfected Bastard Sword of the Weapon Master', 'Legendary Perfected Bastard Sword of the Weapon Master', 'Bastard Sword', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Dagger of the Weapon Master', 'Perfected Dagger of the Weapon Master', 'Legendary Perfected Dagger of the Weapon Master', 'Dagger', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Greataxe of the Weapon Master', 'Perfected Greataxe of the Weapon Master', 'Legendary Perfected Greataxe of the Weapon Master', 'Greataxe', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Khopesh of the Weapon Master', 'Perfected Khopesh of the Weapon Master', 'Legendary Perfected Khopesh of the Weapon Master', 'Khopesh', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Light Mace of the Weapon Master', 'Perfected Light Mace of the Weapon Master', 'Legendary Perfected Light Mace of the Weapon Master', 'Light Mace', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Longsword of the Weapon Master', 'Perfected Longsword of the Weapon Master', 'Legendary Perfected Longsword of the Weapon Master', 'Long Sword', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Maul of the Weapon Master', 'Perfected Maul of the Weapon Master', 'Legendary Perfected Maul of the Weapon Master', 'Maul', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Piwafwi', 'Piwafwi of the Drow Assassin', 'Legendary Piwafwi of the Drow Assassin', 'Cloak', 'Deep', 'Hideous to Behold, end chest'],
  ['Drow Quarterstaff of the Weapon Master', 'Perfected Quarterstaff of the Weapon Master', 'Legendary Perfected Quarterstaff of the Weapon Master', 'Quarterstaff', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Rapier of the Weapon Master', 'Perfected Rapier of the Weapon Master', 'Legendary Perfected Rapier of the Weapon Master', 'Rapier', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Scimitar of the Weapon Master', 'Perfected Scimitar of the Weapon Master', 'Legendary Perfected Scimitar of the Weapon Master', 'Scimitar', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Shortsword of the Weapon Master', 'Perfected Shortsword of the Weapon Master', 'Legendary Perfected Shortsword of the Weapon Master', 'Short Sword', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Drow Warhammer of the Weapon Master', 'Perfected Warhammer of the Weapon Master', 'Legendary Perfected Warhammer of the Weapon Master', 'War Hammer', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Duergar Waraxe of the Weapon Master', 'Perfected Dwarven Waraxe of the Weapon Master', 'Legendary Perfected Dwarven Waraxe of the Weapon Master', 'Dwarven Waraxe', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Elemental Victory', 'Crown of Ioun', '', 'Headgear', 'Deep', 'Tower of Vengeance, end chest'],
  ['Expeditious Boots', 'Hooves of Orcus', 'Legendary Hooves of Orcus', 'Boots', 'Abyssal', "The Darklake, Depthdigger's chest"],
  ["Graz'zt's Habiliment", "The Shadow King's Cruelty", '', 'Light Armor', 'Abyssal', 'Stealing from Sorcere, end chest'],
  ['Hide of the Goristro', "Baphomet's Brutality", "Legendary Baphomet's Brutality", 'Medium Armor', 'Abyssal', 'Flocked Together, end chest'],
  ['Insanity', 'Madness of the Demon Lords', 'Legendary Madness of the Demon Lords', 'Greatsword', 'Abyssal', 'The Price of an Egg, end chest'],
  ['Lantern Ring', 'Lantern of the Abyss', 'Legendary Lantern of the Abyss', 'Ring', 'Abyssal', 'Back to the Abyss, end chest'],
  ['Locus of Vol', 'The Blood of Demons', '', 'Necklace', 'Abyssal', "The Darklake, J'anara's chest"],
  ['The Mad Lute', 'The Wicked Pull', 'Legendary The Wicked Pull', 'Greatclub', 'Abyssal', 'Tower of Vengeance, end chest'],
  ['Mantle of the Worldshaper', 'Dream of the Worldshaper', 'Legendary Dream of the Worldshaper', 'Cloak', 'Deep', 'Hideous to Behold, end chest'],
  ["Muck's Doom", "Muck's Ascension", "Legendary Muck's Ascension", 'Club', 'Abyssal', 'The Price of an Egg, end chest'],
  ['Pansophic Circlet', 'Occultic Circlet', '', 'Headgear', 'Abyssal', 'Raiding the Raiders, end chest'],
  ['Planar Compass', 'Abyssal Compass', '', 'Trinket', 'Abyssal', 'For Want of a Heart, end chest'],
  ['Planar Gird', 'Planar Lariat', 'Legendary Planar Lariat', 'Belt', 'Abyssal', 'A Blood Pact, end chest'],
  ['Royal Guard Mask', "Drow Captain's Mask", "Legendary Drow Captain's Mask", 'Headgear', 'Deep', 'Demon in the Rough, end chest'],
  ['Seraphim', "Lolth's Protection", "Legendary Lolth's Protection", 'Headgear', 'Abyssal', 'Stealing from Sorcere, end chest'],
  ['Spidersilk Robes', "Drow Priestess' Mantle", "Legendary Drow Priestess' Mantle", 'Cloth Armor', 'Deep', 'The Fetid Wedding, end chest'],
  ['Spider-spun Caparison', 'Webs of the Drow Penitent', 'Legendary Webs of the Drow Penitent', 'Cloth Armor', 'Deep', 'The Fetid Wedding, end chest'],
  ['Staff of the Necromancer', 'Staff of the Demonic Resurrector', 'Legendary Staff of the Demonic Resurrector', 'Quarterstaff', 'Abyssal', 'A Long Way to Mushrooms, end chest'],
  ['Sun Blade', 'Null Blade', 'Legendary Null Blade', 'Short Sword', 'Abyssal', 'Back to the Abyss, end chest'],
  ['Torc of Prince Raiyum-de II', 'Torc of the Lords of the Abyss', '', 'Necklace', 'Abyssal', 'Raiding the Raiders, end chest'],
  ['Ultimatum', 'Fiendish Requisition', 'Legendary Fiendish Requisition', 'Tower Shield', 'Abyssal', "If It Wasn't For Bad Luck, end chest"],
  ['Visor of the Flesh Render Guards', "Visor of Fraz-Urb'luu", "Legendary Visor of Fraz-Urb'luu", 'Goggles', 'Abyssal', "The Darklake, Zarazurthu's chest"],
]

const CATALYST_CRAFTING: CraftingSystemMeta = {
  key: 'catalyst',
  name: 'Catalyst Crafting',
  category: 'Item upgrades',
  blurb: 'A Demogorgon catalyst plus an old named item makes a new drow- or demon-themed one.',
  detail:
    'Catalyst Crafting is the game\'s way of giving forty-odd forgotten items a second '
    + 'life. Each catalyst names one specific base item, and the two together — plus '
    + 'Abyssal Gems — become a new ML 11 or ML 35 item themed around the Demon Lords. '
    + 'Heroic and legendary are separate projects end to end: a heroic catalyst, a heroic '
    + 'base item and 50 Abyssal Gems make the heroic version, while the legendary needs '
    + 'the legendary catalyst, the epic or legendary base item and 5 Legendary Abyssal '
    + 'Gems. Because the catalysts are unbound they turn up on the auction house and the '
    + 'shard exchange, so the one you want can be bought rather than farmed — you still '
    + 'need Terror of Demogorgon to use it. The result is a newly created item, which '
    + 'means card curses, Mythic and Reaper bonuses and every socketed augment on the '
    + 'base item are gone.',
  where: 'The Strange Catalyst Forge, in Gravenhollow.',
  ingredients: 'The matching Abyssal or Deep Catalyst, the base item, and 50 Abyssal Gems (heroic) or 5 Legendary Abyssal Gems (legendary).',
  source: 'Catalysts drop from the rare loot list of fixed chests across the Terror of Demogorgon pack.',
  wiki: 'https://ddowiki.com/page/Catalyst_Crafting',
  files: [],
  manual: [
    {
      type: 'Heroic items (ML 11)',
      recipes: CATALYSTS.map(([base, heroic, , slot, catalyst, where]) => ({
        name: heroic,
        description: `${slot}. Made from ${base}.`,
        minLevel: 11,
        ingredients: [base, `${catalyst} Catalyst — ${where}`, '50 Abyssal Gems'],
      })),
    },
    {
      type: 'Legendary items (ML 35)',
      recipes: CATALYSTS
        .filter(([, , legendary]) => legendary.length > 0)
        .map(([base, , legendary, slot, catalyst, where]) => ({
          name: legendary,
          description: `${slot}. Made from the epic or legendary ${base}.`,
          minLevel: 35,
          ingredients: [
            `The epic or legendary ${base}`,
            `Legendary ${catalyst} Catalyst — ${where}`,
            '5 Legendary Abyssal Gems',
          ],
        })),
    },
  ],
}

// ---------------------------------------------------------------------------
// Dampened — the Altar of Vulkoor
// ---------------------------------------------------------------------------

const DAMPENED_ITEMS: Array<[base: string, upgraded: string, type: string, quest: string]> = [
  ['Dampened Cacophonic Verge', 'Cacophonic Verge', 'Wand', 'The Claw of Vulkoor'],
  ['Dampened Shatterbow', 'Shatterbow', 'Longbow', 'The Claw of Vulkoor'],
  ['Dampened Robe of Dissonance', 'Robe of Dissonance', 'Robe', 'Fathom the Depths'],
  ['Dampened Frozen Plate', 'Frozen Plate', 'Full Plate', 'Into the Deep'],
  ['Dampened Greatclub of the Scrag', 'Greatclub of the Scrag', 'Greatclub', 'Into the Deep'],
]

const DAMPENED: CraftingSystemMeta = {
  key: 'dampened',
  name: 'Dampened',
  category: 'Quest chain crafting',
  blurb: 'Five Red Fens items, restored with a Token of Vulkoor — then epic and legendary on top.',
  detail:
    'The smallest complete system in the game, and a useful shape to know because it '
    + 'runs three rungs deep on very little effort. A Dampened item plus one Token of '
    + 'Vulkoor gives the cleansed ML 5–7 version. From there the Altar of Epic Rituals '
    + 'takes all five to ML 20 for 50 Glowing Fen Mushrooms, and the Altar of Legendary '
    + 'Rituals takes all but the wand to ML 30 for 100 mushrooms and 5 Star Fragments. '
    + 'Getting the token is the only fiddly step: gather Golden Swamp Pearls from the '
    + 'Colossal Clams in the Red Fens and hand a single pearl to Pearl Collector Dagni '
    + 'd\'Kundarak. The altar shows no preview, so what each upgrade adds is worth '
    + 'reading here first.',
  where: 'The Altar of Vulkoor, in the Raveneye Refugee Camp in The Red Fens. The epic and legendary rungs are at the ritual altars in The Twelve.',
  ingredients: 'One Token of Vulkoor per item, then Glowing Fen Mushrooms and Star Fragments for the epic and legendary rungs.',
  source: 'The Red Fens. Dampened items drop from the quests\' end chests — higher difficulties far more often. The Last Stand drops none.',
  wiki: 'https://ddowiki.com/page/Dampened',
  files: [],
  manual: [
    {
      type: 'Cleansing (ML 5–7)',
      recipes: DAMPENED_ITEMS.map(([base, upgraded, type, quest]) => ({
        name: upgraded,
        description: `${type}. Removes Dampened from ${base}, which drops in ${quest}.`,
        ingredients: [base, '1 Token of Vulkoor'],
      })),
    },
    {
      type: 'Epic upgrade (ML 20)',
      recipes: DAMPENED_ITEMS.map(([, upgraded, type]) => ({
        name: `Epic ${upgraded}`,
        description: `${type}, raised to ML 20 and bound to character.`,
        minLevel: 20,
        ingredients: [upgraded, '50 Glowing Fen Mushrooms'],
      })),
    },
    {
      type: 'Legendary upgrade (ML 30)',
      recipes: DAMPENED_ITEMS
        .filter(([, , type]) => type !== 'Wand')
        .map(([, upgraded, type]) => ({
          name: `Legendary ${upgraded}`,
          description: `${type}, raised to ML 30 and bound to character.`,
          minLevel: 30,
          ingredients: [`Epic ${upgraded}`, '100 Glowing Fen Mushrooms', '5 Star Fragments'],
        })),
      },
  ],
}

// ---------------------------------------------------------------------------
// Zhentarim Attuned
// ---------------------------------------------------------------------------

const ZHENTARIM: CraftingSystemMeta = {
  key: 'zhentarim-attuned',
  name: 'Zhentarim Attuned',
  category: 'Quest chain crafting',
  blurb: 'Six Haunted Halls items, each upgraded for 150 Black Stones — no altar needed.',
  detail:
    'The only crafting system with no crafting device at all: double-click a Black Stone '
    + 'in your inventory and the Zhentarim Improvement window opens wherever you happen '
    + 'to be. Double-clicking also previews what the upgrade does, which is handy because '
    + 'the price is flat — 150 Black Stones for any of the six — and the items differ '
    + 'wildly in what they gain. Every upgrade adds an augment slot on top of its stat '
    + 'changes. Note the binding change: a Bind-on-Equip item becomes bound to character '
    + 'the moment it is upgraded, so upgrade last, after you have decided who is wearing '
    + 'it.',
  where: 'Nowhere in particular — double-click a Black Stone in your inventory.',
  ingredients: '150 Black Stones per item, from the chests of The Haunted Halls of Eveningstar.',
  source: 'The Haunted Halls of Eveningstar.',
  wiki: 'https://ddowiki.com/page/Zhentarim_Attuned',
  files: [],
  manual: [{
    type: 'Zhentarim Attuned upgrades',
    recipes: ([
      ['Lantern Ring', 'Ring', 'Radiant Glory damage rises to 3–18, Radiance VIII, and a green slot.'],
      ['Libram of Silver Magic', 'Orb', 'Spell Lore II Insightful, +11 Intelligence and Charisma, and an orange slot.'],
      ['Magestar', 'Trinket', 'Magestar charges double from 5 to 10, and a green slot.'],
      ['Manual of Stealthy Pilfering', 'Trinket', '+6 Dexterity and Intelligence, +5 Use Magic Device, and a green slot.'],
      ['Necklace of Mystic Eidolons', 'Necklace', 'Cooldown cut to 80 seconds, +4 Insightful Constitution and Dexterity, and Augment Summoning.'],
      ['Purple Dragon Shield', 'Tower Shield', 'A purple augment slot.'],
    ] as Array<[string, string, string]>).map(([item, type, gains]) => ({
      name: item,
      description: `${type}. ${gains}`,
      ingredients: [item, '150 Black Stones'],
      note: 'A Bind-on-Equip copy becomes bound to character when upgraded.',
    })),
  }],
}

// ---------------------------------------------------------------------------
// Stormreaver Monument
// ---------------------------------------------------------------------------

const STORMREAVER: CraftingSystemMeta = {
  key: 'stormreaver-monument',
  name: 'Stormreaver Monument',
  category: 'Raid crafting',
  blurb: 'Reaver\'s Fate loot traded up with a Seal of the Stormreaver, one seal per item.',
  detail:
    'A raid upgrade altar with a second life as a dragon scale sink. Seals of the '
    + 'Stormreaver drop from The Reaver\'s Fate warded chest on Hard and Elite, but they '
    + 'can also be bought outright at the Monument for 20 each of Black, Blue and White '
    + 'Dragon Scales — which is often the faster route if you were running Gianthold Tor '
    + 'anyway. One seal buys one upgrade. Unusually among upgrade altars, this one leaves '
    + 'a Deck of Many Curses curse on the item alone. Items pulled before Update 12 need '
    + 'unlocking first with 5 giant, elven or dragon relics; Flawless Dragonscale Armor '
    + 'and Fall of Truth treasure are upgraded here too, the latter for 5 to 12 '
    + 'Commendations of Heroism depending on the difficulty it dropped on.',
  where: 'Gianthold, in the south-west corner of the camp, west of the mailbox.',
  ingredients: 'One Seal of the Stormreaver per item — from the raid, or 20 Black + 20 Blue + 20 White Dragon Scales at the Monument.',
  source: 'The Reaver\'s Fate, plus The Fall of Truth and Flawless Dragonscale Armor at the same altar.',
  wiki: 'https://ddowiki.com/page/Stormreaver_Monument',
  files: [],
  manual: [
    {
      type: 'The Reaver\'s Fate loot',
      recipes: ([
        ['Amulet of the Stormreaver', 'Necklace', 'Electric resistance rises to 40.'],
        ['Cloudburst', 'Greatsword', 'Adds Lightning Strike.'],
        ['Dreamspitter', 'Quarterstaff', 'Adds Force damage.'],
        ['Gauntlets of Eternity', 'Gloves', '+15 Heal and Repair, Devotion 72.'],
        ['Head of Good Fortune', 'Trinket', 'Both bonuses step up a tier.'],
        ['Madstone Boots', 'Boots', '+6 Dexterity, Potency 52.'],
        ['Madstone Shield', 'Tower Shield', 'Improved Shield Bashing.'],
        ['Ring of Lies', 'Ring', 'Improved Bluff and +2 Exceptional Charisma skills.'],
        ["Stormreaver's Napkin", 'Cloak', 'Spell Focus Mastery rises to +2.'],
        ['Tenderizer', 'Morningstar', 'Adds Spikes and Bone Breaking.'],
        ['Treason', 'Shortsword', 'Armor-piercing rises a tier.'],
      ] as Array<[string, string, string]>).map(([item, type, gains]) => ({
        name: item,
        description: `${type}. ${gains}`,
        ingredients: [item, '1 Seal of the Stormreaver'],
      })),
    },
    {
      type: 'Ingredient trade',
      recipes: [{
        name: 'Seal of the Stormreaver',
        description: 'Buys a seal outright, without the raid.',
        ingredients: ['20 Black Dragon Scales', '20 Blue Dragon Scales', '20 White Dragon Scales'],
      }],
    },
    {
      type: 'The Fall of Truth treasure',
      recipes: [{
        name: 'Fall of Truth item, tier by tier',
        description:
          'Epic Normal loot can be upgraded twice; Epic Hard once, to tier 2, for 7 '
          + 'Commendations; Epic Elite loot arrives fully upgraded.',
        ingredients: ['The Fall of Truth item', '5 to 12 Commendations of Heroism, by difficulty'],
      }],
    },
    {
      type: 'Unlocking pre-Update 12 items',
      recipes: [{
        name: 'Unlock an old Reaver or Abbot item',
        description: 'Adds the upgrade option to a copy pulled before Update 12.',
        ingredients: ['The old item', '5 giant, elven or dragon relics — whichever the item calls for'],
        note: 'Dreamspitter keeps its Suppressed or Unsuppressed status, and Stone of Change rituals survive.',
      }],
    },
  ],
}

// ---------------------------------------------------------------------------
// Fountain of Necrotic Might
// ---------------------------------------------------------------------------

const FOUNTAIN: CraftingSystemMeta = {
  key: 'fountain-of-necrotic-might',
  name: 'Fountain of Necrotic Might',
  category: 'Raid crafting',
  blurb: 'Ascension Chamber loot upgraded with a Seal of the Black Abbot; Necro IV gear gets augment slots.',
  detail:
    'Two jobs at one fountain. The older one upgrades the Black Abbot\'s raid loot: one '
    + 'Seal of the Black Abbot, farmed on Hard or Elite, per item. Copies pulled before '
    + 'Update 12 need converting first with 5 Shreds of Tapestry, and there is a trap '
    + 'worth knowing — if the item is Exclusive the conversion destroys it and leaves an '
    + '"essence" in your ingredient bag, which you then have to take out and put back in '
    + 'to receive the new version. The newer job adds augment slots to Update 23 epic '
    + 'items marked "Upgradable — Primary/Secondary Augment", for 120 Epic or Masterwork '
    + 'Tapestry Shreds; the slot colour still obeys the usual item-type rules, so armor '
    + 'and accessories will not take orange, red or purple.',
  where: 'Upper Necropolis — one fountain to the right as you zone in from Lower Necropolis, another by the Litany of the Dead Part 4 quest givers.',
  ingredients: 'Seals of the Black Abbot for the raid loot; Epic and Masterwork Tapestry Shreds for the augment slots.',
  source: 'The Ascension Chamber raid, and the Necro IV quests.',
  wiki: 'https://ddowiki.com/page/Fountain_of_Necrotic_Might',
  files: [],
  manual: [
    {
      type: 'Ascension Chamber loot',
      recipes: ([
        ['Breeze', 'Quarterstaff', 'Screaming and Roaring both step up to Greater.'],
        ['Circle of Hatred', 'Ring', 'Harm rises to 5 charges a day, and +30 Intimidate.'],
        ['Deific Diadem', 'Helm', 'Lesser Heighten 5 and +2 Evocation DC.'],
        ['Enduring Conviction', 'Longsword', 'Evil Outsider bane becomes Greater.'],
        ['Litany of the Dead', 'Trinket', 'Removes the Taint of Evil.'],
        ['Noxious Embers', 'Necklace', 'Lesser Maximize 5 charges and Spell Lore VI.'],
        ['Purging the Pantheon', 'Belt', '+100 and Quell at 5 charges.'],
        ['Quiver of Alacrity', 'Quiver', '+30 to its bonus.'],
        ['Shroud of the Abbot', 'Robe', 'Light 30 and +1 Arcane Augmentation 9.'],
        ['Staff of the Petitioner', 'Quarterstaff', 'Potency and lore both step up.'],
        ['Unwavering Ardency', 'Longbow', 'Adds Blinding Embers.'],
        ['Vile Blasphemy', 'Gloves', 'Power Drain at 3 charges, and Greater Dispelling.'],
        ['Wretched Twilight', 'Cloak', 'Steps up a tier and adds Void Lore V.'],
      ] as Array<[string, string, string]>).map(([item, type, gains]) => ({
        name: item,
        description: `${type}. ${gains}`,
        ingredients: [item, '1 Seal of the Black Abbot'],
        note: 'Clicky items gain fewer extra charges than the altar claims — the Litany and Purging the Pantheon excepted.',
      })),
    },
    {
      type: 'Augment slots on Update 23 epic items',
      recipes: [
        {
          name: 'Primary augment slot',
          description: 'Adds the primary slot to an item marked "Upgradable — Primary Augment".',
          ingredients: ['The Necro IV epic item', '120 Epic Tapestry Shreds'],
        },
        {
          name: 'Secondary augment slot',
          description: 'Adds the secondary slot to an item marked "Upgradable — Secondary Augment".',
          ingredients: ['The Necro IV epic item', '120 Masterwork Tapestry Shreds'],
        },
      ],
    },
    {
      type: 'Converting pre-Update 12 items',
      recipes: [{
        name: 'Convert an old Ascension Chamber item',
        description: 'Turns a pre-Update 12 copy into the upgradeable version.',
        ingredients: ['The old item', '5 Shreds of Tapestry'],
        note: 'On an Exclusive item this yields an "essence" in your ingredient bag — put it back into the altar to get the item.',
      }],
    },
  ],
}

// ---------------------------------------------------------------------------
// Suppressed Power — the Dreamforge
// ---------------------------------------------------------------------------

const IOUN_STONES: Array<[string, string]> = [
  ['Dark Blue Ioun Stone', '+15 Spot and Listen, up from +3.'],
  ['Deep Red Ioun Stone', '+6 Dexterity plus +2 Insightful.'],
  ['Dusty Rose Ioun Stone', 'Its bonus rises from +1 to +5.'],
  ['Incandescent Blue Ioun Stone', '+6 Wisdom plus +2 Insightful.'],
  ['Pale Blue Ioun Stone', '+6 Strength plus +2 Insightful.'],
  ['Pale Lavender Ioun Stone', 'Absorbs 50 spell levels instead of 20, and recharges.'],
  ['Pink and Green Ioun Stone', '+6 Charisma plus +2 Insightful.'],
  ['Pink Ioun Stone', '+6 Constitution plus +2 Insightful.'],
  ['Scarlet and Blue Ioun Stone', '+6 Intelligence plus +2 Insightful.'],
  ['Vibrant Purple Ioun Stone', 'Steps up to the third tier.'],
]

const MINDSUNDER_ITEMS: Array<[string, string, string]> = [
  ["Death's Touch", 'Sickle', 'Adds Unholy and Necromancy Focus II.'],
  ['Dream Edge', 'Kama', 'Its random effect steps up a tier.'],
  ["Elocator's Habiliment", 'Splint Mail', 'Its displacement effect becomes Greater.'],
  ["Gloves of Titan's Grip", 'Gloves', 'Adds Reconstruction 84, Repair Lore V and Repair Systems.'],
  ['Light and Darkness', 'Large Shield', 'Adds an epic armor bonus and Bashing.'],
  ['Quorforged Docent of Battle', 'Docent', 'Fortification becomes superior, plus Vitality 20.'],
  ["Rahl's Might", 'Quarterstaff', 'Every face of its random effect improves.'],
  ['Regalia of the Phoenix', 'Robe', 'Evocation Focus II and Fire Lore V.'],
  ['Terror', 'Greatsword', 'Adds +15 Intimidate and Bluff.'],
]

const DREAMFORGE: CraftingSystemMeta = {
  key: 'suppressed-power',
  name: 'Suppressed Power',
  category: 'Quest chain crafting',
  blurb: 'The Dreamforge unlocks Ioun Stones, Mindsunder gear and Dreamspitter with a Crystal Disc of Dreams.',
  detail:
    'Everything the Dreamforge does costs one Crystal Disc of Dreams, and the whole '
    + 'system is really the question of how you get one. Three routes: 24 essences (six '
    + 'each of Horrors, Nightmares, Phantasms and Torments) combined at the forge, six '
    + 'Crystal Shards of Dreams from the end reward list, or 50 astral shards on the '
    + 'spot. The essences drop one per completion from the four Dreaming Dark quests, '
    + 'and the forge will trade three of a kind for the fourth, which is how you fix a '
    + 'lopsided bag. The awkward part is access: the forge is in the last room of The '
    + 'Dreaming Dark itself, so the quest must be run each time you want to use it, and '
    + 'the forcefields stay up to stop you swapping to an alt.',
  where: 'The final room of The Dreaming Dark, after The Devourer of Dreams is dead.',
  ingredients: 'A Crystal Disc of Dreams — 24 essences, or 6 Crystal Shards of Dreams, or 50 astral shards.',
  source: 'The Dreaming Dark quest chain, The Mindsunder, and The Reaver\'s Fate for Dreamspitter.',
  wiki: 'https://ddowiki.com/page/Dreamforge',
  files: [],
  manual: [
    {
      type: 'Ingredient combinations',
      recipes: [
        {
          name: 'Any one Essence',
          description: 'Trades three kinds of essence for the fourth.',
          ingredients: ['The other three essences'],
        },
        {
          name: 'Crystal Shard of Dreams',
          description: 'One of each essence.',
          ingredients: ['Essence of Horrors', 'Essence of Nightmares', 'Essence of Phantasms', 'Essence of Torments'],
        },
        {
          name: 'Crystal Disc of Dreams',
          description: 'The currency every upgrade below is bought with.',
          ingredients: ['6 of each essence — or 6 Crystal Shards of Dreams, or 50 Astral Shards'],
        },
      ],
    },
    {
      type: 'Ioun Stones (become ML 5)',
      recipes: IOUN_STONES.map(([item, gains]) => ({
        name: item,
        description: gains,
        minLevel: 5,
        ingredients: [item, '1 Crystal Disc of Dreams'],
        note: 'Drag the stone onto the crafting menu — the forge will not pick it up otherwise.',
      })),
    },
    {
      type: 'The Mindsunder items',
      recipes: MINDSUNDER_ITEMS.map(([item, type, gains]) => ({
        name: item,
        description: `${type}. ${gains}`,
        ingredients: [item, '1 Crystal Disc of Dreams'],
      })),
    },
  ],
}

// ---------------------------------------------------------------------------
// Mikrom Sum — Attuned to Heroism
// ---------------------------------------------------------------------------

/** Tier 3 is per-weapon; these are the twelve Caught in the Web raid weapons. */
const HEROISM_TIER3: Array<[string, string]> = [
  ['Agony, the Knife in the Dark', 'Hemorrhaging becomes Phlebotomizing.'],
  ['Antipode, Fist of the Horizon', 'Adds +0.5 weapon dice multiplier.'],
  ['Balizarde, Protector of the King', 'Hemorrhaging becomes Phlebotomizing.'],
  ['Breach, The Dividing Blade', 'Shrieking becomes Wailing.'],
  ['Celestia, Brightest Star of Day', 'Adds Banishing.'],
  ['Cleaver, Hewer of Suffering', 'Hemorrhaging becomes Phlebotomizing.'],
  ['Mornh, Hammer of the Mountains', 'Adds +0.5 weapon dice multiplier.'],
  ['Needle, Quill-slinger', 'Hemorrhaging becomes Phlebotomizing.'],
  ['Nightmare, the Fallen Moon', 'Adds +0.5 weapon dice multiplier.'],
  ['Pinion, Cloud-piercer', 'Shrieking becomes Wailing.'],
  ['Sireth, Spear of the Sky', 'Adds +0.5 weapon dice multiplier.'],
  ['Tinah, Sword of the Sea', 'Adds +0.5 weapon dice multiplier.'],
  ['Twilight, Element of Magic', 'Adds +120 spell power of your choice — Combustion, Glaciation, Corrosion, Magnetism, Nullification, Devotion or Radiance.'],
]

const MIKROM_SUM: CraftingSystemMeta = {
  key: 'mikrom-sum',
  name: 'Mikrom Sum',
  category: 'Raid crafting',
  blurb: 'Four tiers of Attuned by Heroism on the Caught in the Web weapons, bought with Commendations.',
  detail:
    'A vendor rather than an altar, and the friendliest upgrade path in the game for it: '
    + 'the tiers keep the item you already have. Upgraded items retain their binding — an '
    + 'unbound Bind-on-Equip copy stays tradeable — and, rarely, they retain their Mythic '
    + 'and Reaper bonuses too, so there is no reason to hold off upgrading a good pull. '
    + 'Tiers one and two are flat: Planar Conflux, then +7 enhancement becoming +8. Tier '
    + 'three is where the weapons diverge, each getting its own improvement, and tier '
    + 'four adds an augment slot — red for eleven of the twelve, green for Celestia.',
  where: 'Mikrom Sum, Purple Dragon Knight patron vendor, in the north-central area of Eveningstar next to Battlemaster Dint.',
  ingredients: 'Commendations of Heroism — 3, 5, 7 and 10 for the four tiers.',
  source: 'Caught in the Web for the weapons; Trial by Fury, The Deal and the Demon and Reclaiming the Rift for the armor.',
  wiki: 'https://ddowiki.com/page/Mikrom_Sum',
  files: [],
  manual: [
    {
      type: 'Tier 1 and 2 (any Caught in the Web raid item)',
      recipes: [
        {
          name: 'Attuned by Heroism: Tier 1',
          description: 'Adds Planar Conflux.',
          ingredients: ['Any Caught in the Web raid item', '3 Commendations of Heroism'],
        },
        {
          name: 'Attuned by Heroism: Tier 2',
          description: 'The +7 enhancement bonus becomes +8.',
          ingredients: ['A Tier 1 item', '5 Commendations of Heroism'],
        },
      ],
    },
    {
      type: 'Tier 3 (per weapon)',
      recipes: HEROISM_TIER3.map(([weapon, gains]) => ({
        name: weapon,
        description: gains,
        ingredients: ['The Tier 2 weapon', '7 Commendations of Heroism'],
      })),
    },
    {
      type: 'Tier 4 (augment slot)',
      recipes: HEROISM_TIER3.map(([weapon]) => ({
        name: weapon,
        description: weapon.startsWith('Celestia')
          ? 'Adds a green augment slot.'
          : 'Adds a red augment slot.',
        ingredients: ['The Tier 3 weapon', '10 Commendations of Heroism'],
      })),
    },
  ],
}

// ---------------------------------------------------------------------------
// Cauldron of Sora Katra
// ---------------------------------------------------------------------------

const SORA_KATRA: CraftingSystemMeta = {
  key: 'cauldron-of-sora-katra',
  name: 'Cauldron of Sora Katra',
  category: 'Quest chain crafting',
  blurb: 'Fuse a Malleable item\'s effect onto a Fusible one with the right Droaam Mark.',
  detail:
    'The most genuinely creative crafting in the game, and the least explained. Items '
    + 'from the Diplomatic Impunity chain carry the Fusible tag; items from Attack on '
    + 'Stormreach carry Malleable. Put one of each into the cauldron with the Mark that '
    + 'matches the fusible item, and the fusible item keeps everything it had and gains '
    + 'the malleable item\'s effect on top. Which Mark you need depends on the base item, '
    + 'not on what you are grafting, so the Marks are worth collecting across all four '
    + 'quests. The oddity is the Blade of Fury, which with two Marks instead of one '
    + 'splits into two shortswords rather than staying a greatsword. Not every fusible '
    + 'item is bound, so some can be bought outright from the auction house.',
  where: 'The south-west corner of Lordsmarch Plaza, south of the palace entrance.',
  ingredients: 'Droaam Marks — of Bal Molesh, Rhesh Turakbar, Sheshka or Tzaryan Rrac, in heroic and legendary versions.',
  source: 'Attack on Stormreach for the Marks and the Malleable items; Diplomatic Impunity for the Fusible ones.',
  wiki: 'https://ddowiki.com/page/Cauldron_of_Sora_Katra',
  files: [],
  manual: [
    {
      type: 'Fusing',
      recipes: [
        {
          name: 'Upgraded Greatsword',
          description: 'A fusible greatsword gains the malleable item\'s effect.',
          ingredients: ['The fusible greatsword', 'A Malleable item', 'Mark of Sheshka'],
        },
        {
          name: 'Two Shortswords from the Blade of Fury',
          description: 'The Blade of Fury splits into two shortswords instead of one greatsword, both carrying the grafted effect.',
          ingredients: ['Blade of Fury', 'A Malleable item', '2 Marks'],
        },
        {
          name: 'Upgraded Falchion',
          description: 'A fusible falchion gains the malleable item\'s effect.',
          ingredients: ['The fusible falchion', 'A Malleable item', 'Mark of Bal Molesh'],
        },
        {
          name: 'Upgraded Heavy Pick',
          description: 'A fusible heavy pick gains the malleable item\'s effect.',
          ingredients: ['The fusible heavy pick', 'A Malleable item', 'Mark of Rhesh Turakbar'],
        },
        {
          name: 'Upgraded Handwraps',
          description: 'Fusible handwraps gain the malleable item\'s effect — Stonedust Handwraps plus a Hooked Blade gives Stonedust Handwraps of Maiming.',
          ingredients: ['The fusible handwraps', 'A Malleable item', 'Mark of Tzaryan Rrac'],
        },
      ],
    },
    {
      type: 'Where the Marks drop',
      recipes: ([
        ['Mark of Bal Molesh', 'Undermine and Siegebreaker in-quest chests, the chain end reward, or 25 Astral Shards in the device.'],
        ['Mark of Rhesh Turakbar', 'Assault on Summerfield in-quest chests.'],
        ['Mark of Sheshka', 'Blockade Buster in-quest chests.'],
        ['Mark of Tzaryan Rrac', 'Siegebreaker in-quest chests.'],
      ] as Array<[string, string]>).map(([mark, where]) => ({
        name: mark,
        description: where,
        ingredients: ['Also comes in a Legendary version from the same sources'],
      })),
    },
  ],
}

// ---------------------------------------------------------------------------
// Sealed Altar — Weaponry of the Oozing Hunger
// ---------------------------------------------------------------------------

const SEALED_ALTAR: CraftingSystemMeta = {
  key: 'sealed-altar',
  name: 'Sealed Altar',
  category: 'Item upgrades',
  blurb: 'Duergarcraft weapons and shields become Oozing Hunger — once you have built a Slime Emblem.',
  detail:
    'The trade itself is simple — a Duergarcraft item and 50 Abyssal Gems (or 50 '
    + 'Legendary Abyssal Gems for the legendary tier) gives the Oozing Hunger version. '
    + 'Getting to the altar is the system. It is invisible until you stand at the '
    + 'southernmost point of Gravenhollow\'s upper floor, by the glowing green spike, for '
    + 'ten seconds; and it will not open at all without a Slime Emblem in your inventory. '
    + 'The Emblem is not consumed but must be assembled from six Globes of Slime scattered '
    + 'across four different packs, combined three at a time into a top and a bottom at '
    + 'the Fetid Cauldron. In practice that means Menace of the Underdark, White Plume '
    + 'Mountain, the Temple of Elemental Evil and Terror of Demogorgon between them gate '
    + 'this system. The Emblem survives reincarnation.',
  where: 'Upstairs in Gravenhollow — stand at the southernmost point by the green spike for ten seconds to make the altar appear.',
  ingredients: '50 Abyssal Gems or 50 Legendary Abyssal Gems, plus a Slime Emblem in inventory (not consumed).',
  source: 'Duergarcraft weapons and shields; the Globes of Slime come from slime encounters across six quests.',
  wiki: 'https://ddowiki.com/page/Sealed_Altar',
  files: [],
  manual: [
    {
      type: 'Weaponry of the Oozing Hunger',
      recipes: [
        {
          name: 'Shield of the Oozing Hunger',
          description: '1.50[W], +4 shield bonus, Acid Absorption, and a red augment slot.',
          ingredients: ['The heroic Duergarcraft shield', '50 Abyssal Gems', 'Slime Emblem in inventory'],
        },
        {
          name: 'Sceptre of the Oozing Hunger',
          description: '1.50[1d6], Potency 49, Blighted 12, Insightful Acid 7, Acid 12, and a red augment slot.',
          ingredients: ['The heroic Duergarcraft sceptre', '50 Abyssal Gems', 'Slime Emblem in inventory'],
        },
        {
          name: 'Any other weapon of the Oozing Hunger',
          description: '1.50[W], Acid, Slime, and a red augment slot.',
          ingredients: ['The heroic Duergarcraft weapon', '50 Abyssal Gems', 'Slime Emblem in inventory'],
        },
      ],
    },
    {
      type: 'Legendary Weaponry of the Oozing Hunger',
      recipes: [
        {
          name: 'Legendary Shield of the Oozing Hunger',
          description: '6[W], +11 shield bonus, Lingering Acidic Burn, and orange and purple augment slots.',
          ingredients: ['The Legendary Duergarcraft shield', '50 Legendary Abyssal Gems', 'Slime Emblem in inventory'],
        },
        {
          name: 'Legendary Sceptre of the Oozing Hunger',
          description: '6[1d6+3], Lingering Acidic Burn, Blighted 25, Insightful Acid 14, Acid 25, and orange and purple augment slots.',
          ingredients: ['The Legendary Duergarcraft sceptre', '50 Legendary Abyssal Gems', 'Slime Emblem in inventory'],
        },
        {
          name: 'Any other Legendary weapon of the Oozing Hunger',
          description: '6[W], Lingering Acidic Burn, and orange and purple augment slots.',
          ingredients: ['The Legendary Duergarcraft weapon', '50 Legendary Abyssal Gems', 'Slime Emblem in inventory'],
        },
      ],
    },
    {
      type: 'The Slime Emblem (at the Fetid Cauldron)',
      recipes: [
        {
          name: 'Top of the Slime Emblem',
          description: 'Three globes combined at the Fetid Cauldron, beside the Stoneaxe brothers in Gravenhollow.',
          ingredients: [
            'Black Globe of Slime — Terror of Demogorgon',
            "Green Globe of Slime — ToEE: Lower Temple Complex, the Living Pool's chest",
            'Gold Globe of Slime — The Underdark, the northern shrine after slaying Digestive Slimes',
          ],
        },
        {
          name: 'Bottom of the Slime Emblem',
          description: 'The other three globes.',
          ingredients: [
            "Blue Globe of Slime — Durk's Got A Secret, Muck's second chest",
            "Gray Globe of Slime — White Plume Mountain, the Huge Black Pudding's chest",
            'Pink Globe of Slime — The Pit, the Avatar of Juiblex\'s second chest',
          ],
        },
        {
          name: 'Slime Emblem',
          description: 'The key to the altar. Not consumed by crafting, and it survives reincarnation.',
          ingredients: ['Top of the Slime Emblem', 'Bottom of the Slime Emblem'],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Dragonscale Armor
// ---------------------------------------------------------------------------

const SCALE_COLOURS: Array<[colour: string, effects: string, from: string]> = [
  ['Black', 'Haste guard, Relentless Fury, and Acid resistance 30.', 'Gianthold Tor and Mired in Kobolds'],
  ['Blue', 'Spell Lore VI, Potency 52, and Electric resistance 30.', 'Gianthold Tor'],
  ['White', '+100 hit points, and Cold resistance 30.', 'Gianthold Tor and Prey on the Hunter'],
]

const FLAWLESS_COLOURS: Array<[colour: string, effects: string, from: string]> = [
  ['Black', 'Draconic Ferocity, Haste guard, Relentless Fury, Acid resistance 40, and a blue augment slot.', 'Gianthold Tor, epic only'],
  ['Blue', 'Draconic Ferocity, the blue set effects raised a tier, and a blue augment slot.', 'Gianthold Tor, epic only'],
  ['White', 'Draconic Ferocity, the white set effects raised a tier, and a blue augment slot.', 'Gianthold Tor, epic only'],
  ['Red', 'Draconic Ferocity and the red set effects.', 'Plane of Night and the Underdark Arenas, epic only'],
  ['Green', 'Draconic Ferocity and the green set effects.', "Don't Drink the Water and The King's Forest"],
]

/**
 * The five bodies every dragonscale set comes in, spelled the way the items
 * are actually named — "Dragonhide", not "Dragonscale Hide". Dragonscale
 * outfits do not exist.
 */
const SCALE_BODIES = [
  'Dragonscale Robe', 'Dragonhide Armor', 'Dragonscale Armor',
  'Dragonplate Armor', 'Dragonscale Docent',
]

const DRAGONSCALE: CraftingSystemMeta = {
  key: 'dragonscale-armor',
  name: 'Dragonscale Armor',
  category: 'Craft from scratch',
  blurb: 'Twenty scales of one colour bought straight into a set of armor — five bodies, three colours.',
  detail:
    'Not an upgrade but a purchase: hand the Master Scalesmiths twenty dragon scales of '
    + 'one colour and choose which of the five bodies you want it in. Since Update 14 the '
    + 'enchantments are uniform across the bodies, so robe or full plate is purely a '
    + 'question of what you can wear — there are no dragonscale outfits. The flawless '
    + 'tier is the same idea at ML 25 and costs relics on top of the scales, and adds '
    + 'Draconic Ferocity and an augment slot. Flawless armor can be pushed further still '
    + 'at the Stormreaver Monument.',
  where: 'The Master Scalesmiths, in Gianthold.',
  ingredients: '20 dragon scales of the colour you want; the flawless tier adds 10 each of Restored Dragon, Giant and Elven Relics and 3 Commendations of Heroism.',
  source: 'Gianthold Tor mostly, plus Plane of Night, the Underdark Arenas and The King\'s Forest for the red and green scales.',
  wiki: 'https://ddowiki.com/page/Dragonscale_Armor',
  files: [],
  manual: [
    ...SCALE_COLOURS.map(([colour, effects, from]) => ({
      type: `${colour} Dragonscale (ML 14) — scales from ${from}`,
      recipes: SCALE_BODIES.map(body => ({
        name: `${colour} ${body}`,
        description: effects,
        minLevel: 14,
        ingredients: [`20 ${colour} Dragon Scales`],
      })),
    })),
    ...FLAWLESS_COLOURS.map(([colour, effects, from]) => ({
      type: `Flawless ${colour} Dragonscale (ML 25) — scales from ${from}`,
      recipes: SCALE_BODIES.map(body => ({
        name: `Flawless ${colour} ${body}`,
        description: effects,
        minLevel: 25,
        ingredients: [
          `20 Flawless ${colour} Dragon Scales`,
          '10 Restored Dragon Relics', '10 Restored Giant Relics', '10 Restored Elven Relics',
          '3 Commendations of Heroism',
        ],
        note: 'Can be upgraded further at the Stormreaver Monument.',
      })),
    })),
  ],
}

export const NAMED_UPGRADE_SYSTEMS: CraftingSystemMeta[] = [
  CATALYST_CRAFTING,
  DAMPENED,
  ZHENTARIM,
  STORMREAVER,
  FOUNTAIN,
  DREAMFORGE,
  MIKROM_SUM,
  SORA_KATRA,
  SEALED_ALTAR,
  DRAGONSCALE,
]
