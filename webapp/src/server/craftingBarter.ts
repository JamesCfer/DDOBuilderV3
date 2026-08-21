// Crafting that happens at a barter window rather than an altar.
//
// Challenges, the seasonal events and the Sharn reforging stations all work
// the same way: you gather an ingredient that exists only inside one piece of
// content, then spend it against a fixed list at a vendor. There is no
// combination to discover — the interesting question is what the list holds
// and what the ingredient costs to farm, which is what these entries answer.

import type { CraftingSystemMeta } from './crafting'

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

const CHALLENGES: CraftingSystemMeta = {
  key: 'challenges',
  name: 'Challenges',
  category: 'Rituals & consumables',
  blurb: 'Timed dungeons farmed for ingredients, then spent at a Challenge Trader\'s barter list.',
  detail:
    'Challenges are crafting in the shape of a shop. You run a short timed dungeon, you '
    + 'are given a score rather than a completion, and the score decides how many '
    + 'collectible-like ingredients you leave with — so the crafting effort is really the '
    + 'scoring: resources gathered, enemies killed, whatever that particular challenge '
    + 'counts. The ingredients then buy and upgrade items from the Challenge Traders. Two '
    + 'packs feed the system: Vaults of the Artificers, whose four dungeons split into '
    + 'twelve challenges with nine epic variants, and the Eveningstar Challenge Pack, '
    + 'whose three dungeons split into six. VIPs and pack owners enter freely; everyone '
    + 'else spends a Challenge Token, and one free bound token per character per day is '
    + 'waiting with Kariya ir\'Vannis in House Cannith or Rikhard Downriver in Eveningstar. '
    + 'One wrinkle worth knowing: Cannith challenge items had their minimum level cut by '
    + 'one, but upgrading a pre-change item keeps the old levels — deconstruct it at an '
    + 'Essence Crafting station to reset it to the reduced-ML version.',
  where: 'The Challenge Traders — the central courtyard of House Cannith, just north of the crafting hall, and around the village of Eveningstar.',
  ingredients: 'The collectibles each challenge drops, in amounts set by your score. Challenge Tokens buy entry and Supply Vault items.',
  source: 'Vaults of the Artificers and the Eveningstar Challenge Pack.',
  wiki: 'https://ddowiki.com/page/Challenges',
  files: [],
  manual: [{
    type: 'How the barter works',
    recipes: [
      {
        name: 'Named challenge item',
        description:
          'Bought outright from a Challenge Trader with the ingredients that challenge '
          + 'drops. The per-pack item lists live on the wiki.',
        minLevel: 4,
        ingredients: ['Challenge ingredients, in amounts set by your score'],
      },
      {
        name: 'Upgraded challenge item',
        description: 'Trades a lower-level version of a challenge item up to a higher one.',
        ingredients: ['The lower-level item', 'More of the same challenge ingredients'],
        note: 'Upgrading a pre-change item keeps its old minimum level — deconstruct it first to get the reduced-ML version.',
      },
      {
        name: 'Challenge Token',
        description:
          'One free bound token per character per day, from Kariya ir\'Vannis or Rikhard '
          + 'Downriver. Buys one entry, or Supply Vault items inside a challenge.',
        ingredients: ['Free, once a day — the timer resets at 00:00 UTC'],
        note: 'Not needed at all by VIPs or anyone who owns the pack. Unbound tokens are sold in the DDO Store.',
      },
    ],
  }],
}

// ---------------------------------------------------------------------------
// Event Items
// ---------------------------------------------------------------------------

const EVENT_ITEMS: CraftingSystemMeta = {
  key: 'event-items',
  name: 'Event Items',
  category: 'Rituals & consumables',
  blurb: 'The seasonal events, each with its own altar, its own currency and its own reward list.',
  detail:
    'Seven events rotate through the year, and each is a small self-contained crafting '
    + 'system: an event-only ingredient, an altar or barter vendor that exists only while '
    + 'the event is running, and a reward list that overlaps with nothing else in the '
    + 'game — the Bottomless Flask of Rum from Crystal Cove being the usual example. '
    + 'Because they run on Standing Stone\'s schedule rather than yours, planning here is '
    + 'calendar work more than ingredient work: what an event offers is craftable only '
    + 'while it is live. These are the current rotation; each has its own wiki page with '
    + 'its own recipes.',
  where: 'Event-specific altars — the Risian Altar for the ice games, and their equivalents for each other event.',
  ingredients: 'Each event\'s own currency: coins, tokens, ice shards and the like.',
  source: 'The seasonal events, on Standing Stone Games\' schedule.',
  wiki: 'https://ddowiki.com/page/Special_events',
  files: [],
  manual: [{
    type: 'The events in the rotation',
    recipes: ([
      ['Anniversary Party', '2016 Anniversary'],
      ['Festival of the Traveler', '2010 Anniversary'],
      ['Mimic Hunt', '2015 Anniversary'],
      ['Treasure of Crystal Cove', '2011 Anniversary'],
      ['The Night Revels', '2015 Halloween'],
      ['Festivult', '2006 winter holidays'],
      ['Snowpeaks Festival', '2021 winter holidays'],
    ] as Array<[string, string]>).map(([event, introduced]) => ({
      name: event,
      description: `Introduced with the ${introduced} event. Its rewards are craftable only while it is running.`,
      ingredients: [`${event} event currency`],
    })),
  }],
}

// ---------------------------------------------------------------------------
// Nearly Finished
// ---------------------------------------------------------------------------

/** The Masterminds of Sharn quest items that carry the Nearly Finished tag. */
const NEARLY_FINISHED_QUEST_ITEMS = [
  'Resplendant Fury', 'Stygian Wrath', 'Black Satin Waist', 'Celestial Amethyst Ring',
  'Celestial Emerald Ring', 'Celestial Sapphire Ring', 'Celestial Ruby Ring',
  'Celestial Topaz Ring', 'Collective Sight', 'Cloak of Balance', 'Concentrated Chaos',
  'Solid Sound', 'Sunken Chains', 'Sunken Slippers',
]

/** The four construct scrap types every Sharn recipe draws on. */
const SHARN_MATERIALS = [
  'Iron Defender Claws and Rivets',
  'Magefire Cannon Cores and Parts',
  'Shield Guardian Cores and Gyroscopes',
  'Worker Drone Actuators and Platings',
]

const NEARLY_FINISHED: CraftingSystemMeta = {
  key: 'nearly-finished',
  name: 'Nearly Finished',
  category: 'Quest chain crafting',
  blurb: 'Sharn items that need one more step: pick an effect, and the set bonus trigger switches on.',
  detail:
    'An item tagged Nearly Finished or Almost There is telling you it has a slot for a '
    + 'decision. Take it to a Cannith Reforging Station and one recipe replaces the tag '
    + 'with an effect of your choice — which effects are offered depends on the item, and '
    + 'the heroic and legendary versions offer the same list at different values. The '
    + 'two-step economy is the part worth planning. The alloys, reforged ingots and '
    + 'compounds a recipe costs either come free from the four Masterminds of Sharn sagas '
    + '— two heroic, two epic — or are made at a Cannith Melting Station out of the '
    + 'construct scrap the quests drop, which makes running the sagas much the cheaper '
    + 'route. The awkwardness the wiki flags is real: the barter window will not show you '
    + 'what an item can become until you are holding the item.',
  where: 'A Cannith Reforging Station; the raw materials are combined at a Cannith Melting Station.',
  ingredients: 'Energizing or Dampening Alloys, Reforged Ingots, and Caustic or Stabilizing Compounds — from the Sharn sagas or melted from construct scrap. Raid items also want 250 Threads of Fate.',
  source: 'Masterminds of Sharn, and its raid for The Cornerstone Champion and the Silver Dragonscale pieces.',
  wiki: 'https://ddowiki.com/page/Nearly_Finished',
  files: [],
  manual: [
    {
      type: 'Quest items — choose one effect',
      recipes: NEARLY_FINISHED_QUEST_ITEMS.map(item => ({
        name: item,
        description:
          'Removes Nearly Finished and adds one effect of your choice, activating the set '
          + 'bonus trigger. The heroic and legendary versions take the same recipe.',
        minLevel: 15,
        ingredients: [
          `${item}, heroic or legendary`,
          'An alloy, two reforged ingots and a compound — which ones depends on the item',
          ...SHARN_MATERIALS,
        ],
        note: 'The barter window will not list the available effects until the item itself is in hand.',
      })),
    },
    {
      type: 'Raid items',
      recipes: ([
        ['The Cornerstone Champion', 'Dampening Alloy'],
        ['Silver Dragonscale Capelet', 'Energizing Alloy'],
        ['Silver Dragonscale Helmet', 'Energizing Alloy'],
      ] as Array<[string, string]>).map(([item, alloy]) => ({
        name: item,
        description: 'Removes Nearly Finished and adds one effect of your choice.',
        minLevel: 15,
        ingredients: [
          item,
          `1 ${alloy}`, '1 Caustic Compound', '1 Stabilizing Compound',
          '250 Threads of Fate',
          ...SHARN_MATERIALS,
        ],
      })),
    },
  ],
}

export const BARTER_CRAFTING_SYSTEMS: CraftingSystemMeta[] = [
  CHALLENGES,
  EVENT_ITEMS,
  NEARLY_FINISHED,
]
