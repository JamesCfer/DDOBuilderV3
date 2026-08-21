// The upgrade systems: crafting that starts from an item you already looted.
//
// This is the larger half of `craftingManual.ts`'s job, split out because the
// systems here all share one shape — "bring the named item plus N of the
// quest's ingredient, get the better named item" — and reading them together
// makes the family resemblance obvious. Nothing here reaches V2's augment
// files: an upgraded item is a *different item*, not a slot filler, so the
// recipes are transcribed from ddowiki.
//
// One recurring caveat is worth reading once rather than on every recipe:
// most of these altars build a new item rather than editing the old one, so
// Mythic and Reaper bonuses, slotted augments and Deck of Many Curses curses
// are destroyed in the process. Where a system is an exception — the Stone of
// Change's rituals, Mikrom Sum's tiers — that is called out on the system.

import type { CraftingSystemMeta, ManualRecipe } from './crafting'

// ---------------------------------------------------------------------------
// Epic → Legendary → Perfected (the ELP path)
// ---------------------------------------------------------------------------

/**
 * The eight adventure packs on the ELP path, each with the ingredient its
 * chests drop.
 *
 * Every pack takes the identical recipe at each rung — 50 for epic, 100 for
 * legendary, 250 for perfected — so the rungs are generated from this list
 * rather than transcribed sixteen times over.
 */
const ELP_PACKS: Array<[pack: string, ingredient: string]> = [
  ['Sands of Menechtarun', 'Desert Sand Crystal'],
  ['The Vault of Night', 'Vault Key'],
  ['Sentinels of Stormreach', 'Medal of House Deneith'],
  ['Phiarlan Carnival', 'Scrap of Patterned Cloth'],
  ['The Red Fens', 'Glowing Fen Mushroom'],
  ['The Chronoscope', 'Fractured Sliver of Time'],
  ['Web of Chaos', 'Crystallized Spiderweb'],
  ['Sinister Secret of Saltmarsh', 'Saltmeadow Hay'],
]

function elpRecipes(
  rung: (pack: string, ingredient: string) => ManualRecipe,
): ManualRecipe[] {
  return ELP_PACKS.map(([pack, ingredient]) => rung(pack, ingredient))
}

const EPIC_CRAFTING: CraftingSystemMeta = {
  key: 'epic-crafting',
  name: 'Epic Crafting',
  category: 'Item upgrades',
  blurb: 'Turn a heroic named item into its ML 20 epic version with 50 of its pack\'s ingredient.',
  detail:
    'The first rung of the Epic – Legendary – Perfected path, and since the Update 50 '
    + 'overhaul the simplest crafting in the game: bring the heroic item and 50 of the '
    + 'ingredient its adventure pack drops. Raid items want five Greater Tokens of the '
    + 'Twelve on top. The overhaul restated most epic items to match post-squish '
    + 'itemisation, and replaced the old Scroll / Seal / Shard triples — if you still '
    + 'have those, Lahar crunches them into the new pack ingredients. Read the warning '
    + 'literally: the altar creates a *new item*, so Mythic boosts, slotted augments and '
    + 'sentient jewels on the heroic version are gone.',
  where: 'The Altar of Epic Rituals, in The Twelve, south-south-west of the Tower of the Twelve.',
  ingredients: '50 of the adventure pack\'s ingredient, plus 5 Greater Tokens of the Twelve for a raid item.',
  source: 'Eight adventure packs feed the path; the heroic version of the item is the other half of every recipe.',
  wiki: 'https://ddowiki.com/page/Epic_Crafting',
  files: [],
  manual: [{
    type: 'Heroic item → Epic item (ML 20)',
    recipes: elpRecipes((pack, ingredient) => ({
      name: `${pack} items`,
      description: `Any heroic named item from ${pack} becomes its epic ML 20 version.`,
      minLevel: 20,
      ingredients: ['The heroic base item', `50 ${ingredient}`, '5 Greater Tokens of the Twelve (raid items only)'],
    })),
  }],
}

const LEGENDARY_CRAFTING: CraftingSystemMeta = {
  key: 'legendary-crafting',
  name: 'Legendary Crafting',
  category: 'Item upgrades',
  blurb: 'The second rung: an epic item, 100 pack ingredients and 5 Star Fragments make the ML 30 version.',
  detail:
    'Legendary Crafting takes the item Epic Crafting made and lifts it to ML 30. The '
    + 'shape is the same and the pack list is the same; the numbers double, Star '
    + 'Fragments join the recipe, and a raid item now wants 250 Threads of Fate instead '
    + 'of Greater Tokens. There is no shortcut from heroic straight to legendary — the '
    + 'epic version is a required ingredient, so the path really is three purchases '
    + 'deep for anything you intend to carry to cap.',
  where: 'The Altar of Legendary Rituals, alongside the epic altar in The Twelve.',
  ingredients: '100 of the pack ingredient and 5 Star Fragments, plus 250 Threads of Fate for a raid item.',
  source: 'The same eight adventure packs as Epic Crafting; the epic version of the item is consumed.',
  wiki: 'https://ddowiki.com/page/Legendary_Crafting',
  files: [],
  manual: [{
    type: 'Epic item → Legendary item (ML 30)',
    recipes: elpRecipes((pack, ingredient) => ({
      name: `${pack} items`,
      description: `The epic version of a ${pack} item becomes its legendary ML 30 version.`,
      minLevel: 30,
      ingredients: ['The epic base item', `100 ${ingredient}`, '5 Star Fragments', '250 Threads of Fate (raid items only)'],
    })),
  }],
}

const PERFECTED_CRAFTING: CraftingSystemMeta = {
  key: 'perfected-crafting',
  name: 'Nebula Fragment Crafting',
  category: 'Item upgrades',
  blurb: 'The last rung: a Nebula Fragment turns a legendary item into a Perfected minor artifact.',
  detail:
    'Perfected items are minor artifacts, which means the usual artifact rule applies — '
    + 'one equipped at a time, whatever slots they occupy. Getting one is a small quest '
    + 'rather than a purchase. Show Lahar a Nebula Fragment and he hands you the Star '
    + 'Fragments: Frame, which you fill by clicking eight Star Shrines scattered across '
    + 'eight different packs; show him the full frame and the Perfected interface opens. '
    + 'The frame is account-bound, is not consumed, and can be posted through the shared '
    + 'bank, so the shrine run is done once per account rather than once per item. Access '
    + 'to all eight packs is genuinely required — seven of the eight shrines sit behind '
    + 'one.',
  where: 'Lahar, in The Twelve, once you have shown him a completed Star Fragments: Frame.',
  ingredients: '250 of the pack ingredient, 1 Nebula Fragment and 500 Threads of Fate.',
  source: 'Nebula Fragments drop from legendary chests in Sinister Secret of Saltmarsh; the legendary version of the item is consumed.',
  wiki: 'https://ddowiki.com/page/Item:Nebula_Fragment',
  files: [],
  manual: [
    {
      type: 'Legendary item → Perfected minor artifact',
      recipes: elpRecipes((pack, ingredient) => ({
        name: `${pack} items`,
        description: `The legendary version of a ${pack} item becomes its Perfected minor artifact.`,
        ingredients: ['The legendary base item', `250 ${ingredient}`, '1 Nebula Fragment', '500 Threads of Fate'],
        note: 'A new item, so it inherits no Mythic or Reaper bonus and no Deck of Many Curses curse.',
      })),
    },
    {
      type: 'Star Shrines — the eight clicks that build the frame',
      recipes: [
        ['Red Shard of Power', 'Saltmarsh wilderness, south of the Final Enemy entrance', 'Sinister Secret of Saltmarsh'],
        ['Orange Shard of Power', 'The Chronoscope — the Rusty Nail inn, behind the weapon and wand dealers\' counter', 'Devil Assault'],
        ['Yellow Shard of Power', 'Partycrashers, in the front lobby by the guest list', 'Phiarlan Carnival'],
        ['Green Shard of Power', 'Storm the Beaches, on the warship', 'Sentinels of Stormreach'],
        ['Teal Shard of Power', 'Into the Deep, bottom right corner', 'The Red Fens'],
        ['Blue Shard of Power', 'Plane of Night, on the island below the main platform — bring Feather Fall', 'The Vault of Night'],
        ['Purple Shard of Power', 'The Spinner of Shadows, in the lava', 'Web of Chaos'],
        ['Pink Shard of Power', 'Sands of Menechtarun wilderness, south-west of the Chains of Flame entrance', 'Sands of Menechtarun'],
      ].map(([shard, where, pack]) => ({
        name: shard,
        description: `Click the shrine with the frame in your inventory. ${where}.`,
        ingredients: [`Access to ${pack}`, 'Star Fragments: Frame in inventory'],
      })),
    },
  ],
}

// ---------------------------------------------------------------------------
// Trace of Madness — the Altar of Insanity
// ---------------------------------------------------------------------------

/** Watcher's Eyes, Polished Stones, Adhesive Slimes, Brain Samples. */
const MADNESS_RECIPES: Array<[name: string, effect: string, counts: [number, number, number, number]]> = [
  ['Mania', 'Melodic guard.', [10, 20, 50, 10]],
  ['Hysteria', 'Guard proc: Bestow Curse.', [10, 10, 50, 20]],
  ['Obsession', 'Attack proc: 100% extra melee and ranged threat for 15 seconds.', [10, 50, 20, 10]],
  ['Paranoia', 'Attack proc: half threat for 15 seconds.', [20, 50, 10, 10]],
  ['Delirium', 'Guard proc: Displacement for 15 seconds.', [50, 10, 10, 20]],
  ['Solipsism', 'Attack proc: dazed for 6 seconds.', [20, 50, 10, 10]],
  ['Alien Mind', '+10 Will saves. Does not stack with a Resistance item.', [10, 10, 20, 50]],
  ['Uncanny Awareness', '+10 Reflex saves. Does not stack with a Resistance item.', [50, 10, 10, 10]],
  ['Subtle Ambition', '+2 Conjuration and +2 Illusion DCs.', [20, 10, 20, 50]],
  ['Chaotic Ambition', '+1 Spell DCs.', [10, 20, 10, 50]],
]

const TRACE_OF_MADNESS: CraftingSystemMeta = {
  key: 'trace-of-madness',
  name: 'Trace of Madness',
  category: 'Item upgrades',
  blurb: 'One Xoriat Madness effect, chosen once, onto any armor carrying the Trace of Madness trait.',
  detail:
    'A small system with one large catch: the choice is permanent. Every recipe takes '
    + 'the same four Reign of Madness ingredients in different proportions, so what you '
    + 'are really spending is the ratio you happen to have — and once a Xoriat Madness '
    + 'effect is on the item it cannot be overwritten with a different one. The item '
    + 'stays account-bound and its minimum level does not move. The ingredients are '
    + 'unusual in that they are distributed to the whole party on a kill and go straight '
    + 'to the ingredient bag, so a full group farms them roughly four times as fast.',
  where: 'The Altar of Insanity, in the Hall of the Planes — head south inside the Tower of the Twelve, through the purple-marked door, and it is on your right.',
  ingredients: 'Watcher\'s Eyes, Polished Stones, Adhesive Slimes and Brain Samples, from any Reign of Madness enemy.',
  source: 'Harbinger of Madness, Reign of Madness and Disciples of Rage drop the Trace of Madness armors.',
  wiki: 'https://ddowiki.com/page/Altar_of_Insanity',
  files: [],
  manual: [{
    type: 'Xoriat Madness effects (choose one, permanently)',
    recipes: MADNESS_RECIPES.map(([name, effect, [eyes, stones, slimes, brains]]) => ({
      name: `Xoriat Madness: ${name}`,
      description: effect,
      ingredients: [
        'Any armor with the Trace of Madness trait',
        `${eyes} Watcher's Eyes`,
        `${stones} Polished Stones`,
        `${slimes} Adhesive Slimes`,
        `${brains} Brain Samples`,
      ],
    })),
  }],
}

// ---------------------------------------------------------------------------
// Vecna Unleashed — the Unholy Defiler and the Esoteric Table
// ---------------------------------------------------------------------------

const DUSTS = ['Gray', 'Black', 'Crimson', 'Golden']

/** Every Vecna upgrade costs the same four dusts; only the count changes. */
function vileDusts(count: number, legendary: boolean): string[] {
  return DUSTS.map(colour =>
    `${count} ${legendary ? 'Legendary ' : ''}${colour} Dust of Vile Darkness`)
}

const UNHOLY_DEFILER: CraftingSystemMeta = {
  key: 'unholy-defiler',
  name: 'Unholy Defiler of the Hidden Hand',
  category: 'Item upgrades',
  blurb: 'Defile a Vecna Unleashed weapon, shield or accessory with all four Dusts of Vile Darkness.',
  detail:
    'The hardest crafting station in the game to reach, and not for a mechanical reason: '
    + 'the Defiler is invisible without Steps\' Lenses of Seein\' Hidden Hand Secrets, and '
    + 'Steps Obliss only hands those over after you have spoken to him on fourteen '
    + 'consecutive days on one character. Once you can see it — in the rafters above him '
    + 'in Morgrave University\'s Upper Commons, reached by jumping the barrels in the '
    + 'nearby tavern — every recipe is the same trade: the item plus six of each dust '
    + 'heroic, twelve of each legendary. Each dust colour drops in one specific quest, so '
    + 'a full set means running all four. Legendary weapons made here can then go on to '
    + 'the Esoteric Table, which strips the Taint of Evil back off.',
  where: 'Morgrave University — Upper Commons, in the rafters above Steps Obliss, visible only while wearing his lenses.',
  ingredients: 'Gray, Black, Crimson and Golden Dust of Vile Darkness — six of each heroic, twelve of each legendary.',
  source: 'Vecna Unleashed. The dusts come from Vecna Denied, Taken in Hand, The Evil We Know and The Hand and the Eyes.',
  wiki: 'https://ddowiki.com/page/Unholy_Defiler_of_the_Hidden_Hand',
  files: [],
  manual: [
    {
      type: 'Heroic items',
      recipes: [
        ['Defiled Reliquary weapon', 'Shining Reliquary weapon'],
        ['Defiled Azure Buckler', 'Azure Buckler'],
        ['Defiled Azure Targe', 'Azure Targe'],
        ['Defiled Azure Rotella', 'Azure Rotella'],
        ['Defiled Azure Tower', 'Azure Tower'],
      ].map(([made, from]) => ({
        name: made,
        description: `Defiles ${from}.`,
        ingredients: [from, ...vileDusts(6, false)],
      })),
    },
    {
      type: 'Legendary items',
      recipes: [
        ['Legendary Defiled Reliquary weapon', 'Legendary Shining Reliquary weapon'],
        ['Legendary Defiled Azure Buckler', 'Legendary Azure Buckler'],
        ['Legendary Defiled Azure Targe', 'Legendary Azure Targe'],
        ['Legendary Defiled Azure Rotella', 'Legendary Azure Rotella'],
        ['Legendary Defiled Azure Tower', 'Legendary Azure Tower'],
        ['Desolation Spectacles', 'Legendary Study Spectacles'],
        ['Eyes of Defilement', 'Legendary Eyes of Enlightenment'],
        ['Misery Monocle', 'Legendary Mystic Monocle'],
        ['Buckle of Assimilation', 'Legendary Buckle of Transformation'],
        ['Blade-Barbed Bandolier', 'Legendary Bladesworn Bandolier'],
        ['Beltstrap of Forbidden Tomes', 'Legendary Book-Cover Beltstrap'],
      ].map(([made, from]) => ({
        name: made,
        description: `Defiles ${from}.`,
        ingredients: [from, ...vileDusts(12, true)],
      })),
    },
  ],
}

const ESOTERIC_TABLE: CraftingSystemMeta = {
  key: 'esoteric-table',
  name: 'Esoteric Table',
  category: 'Raid crafting',
  blurb: 'Three tiers on a Vecna legendary weapon — warp it, choose an element, then unleash it.',
  detail:
    'The Esoteric Table is the second half of Vecna crafting: it takes a Legendary '
    + 'Defiled weapon (or a raid weapon from Fire Over Morgrave) and walks it up three '
    + 'tiers. Tier one is the one worth understanding — it strips the Taint of Evil or '
    + 'the Planar Searing the weapon arrived with and replaces it with Leashed Power and '
    + 'Warp Souls, a stacking debuff on what you hit. Tier two picks an element, and the '
    + 'elements are mutually exclusive: taking Unleashed Inferno removes Unleashed Storm '
    + 'and Unleashed Resistance, so this is a decision rather than a sequence. The table '
    + 'sits in the entrance to Fire Over Morgrave and is usable before the raid begins or '
    + 'after it ends, but locks during the fight.',
  where: 'The entrance to Fire Over Morgrave, off Morgrave University — Upper Commons. Locked while the raid is running.',
  ingredients: 'Burning Planar Scraps and Legendary Esoteric Relics, plus Legendary Dusts of Vile Darkness at the higher tiers.',
  source: 'Vecna Unleashed and its raid, Fire Over Morgrave.',
  wiki: 'https://ddowiki.com/page/Esoteric_Table',
  files: [],
  manual: [
    {
      type: 'Tier 1 — Warp',
      recipes: [
        {
          name: 'Warp the Unholy',
          description:
            'On a Legendary Defiled Reliquary weapon: removes Taint of Evil, adds Leashed '
            + 'Power (Tier 2) and Warp Souls (−1 Will, AC and Fortification, stacking ten times).',
          ingredients: ['A Truly Vile Legendary Defiled Reliquary weapon', '20 Burning Planar Scraps', '20 Legendary Esoteric Relics'],
        },
        {
          name: 'Warp the Seared',
          description:
            'On a Fire Over Morgrave raid weapon: removes Planar Searing, adds Leashed '
            + 'Power (Tier 2) and Warp Souls.',
          ingredients: ['An Object Seared raid weapon from Fire Over Morgrave', '20 Burning Planar Scraps', '20 Legendary Esoteric Relics'],
        },
      ],
    },
    {
      type: 'Tier 2 — Unleash an element (mutually exclusive)',
      recipes: [
        ['Unleash the Fire', 'Unleashed Inferno', 'a small chance of 10d440 fire damage and a DC 110 Fortitude save or knockdown', 'Black', 'Golden'],
        ['Unleash the Lightning', 'Unleashed Storm', 'a small chance of chained lightning damage', 'Gray', 'Crimson'],
      ].map(([name, adds, effect, dustA, dustB]) => ({
        name,
        description: `Removes the other Unleashed effects and adds ${adds} — ${effect}.`,
        ingredients: [
          'A warped weapon',
          '120 Burning Planar Scraps',
          '30 Legendary Esoteric Relics',
          `12 Legendary ${dustA} Dust of Vile Darkness`,
          `12 Legendary ${dustB} Dust of Vile Darkness`,
        ],
        note: 'Taking one element removes the others — this is a choice, not a step.',
      })),
    },
  ],
}

// ---------------------------------------------------------------------------
// The two "pick an effect for a raid weapon" altars
// ---------------------------------------------------------------------------

/** The six elemental effects both the Ritual Table and the Augmentation Altar offer. */
const LEGENDARY_ELEMENTS = ['Dust', 'Ash', 'Vacuum', 'Ooze', 'Salt', 'Affirmation']

/** The eighteen ability options both altars offer on equipment. */
const ABILITY_OPTIONS = ['Strength', 'Constitution', 'Dexterity', 'Intelligence', 'Wisdom', 'Charisma']
  .flatMap(ability => [
    `${ability} +15`,
    `${ability} +7 Insightful`,
    `${ability} +3 Quality`,
  ])

const RITUAL_TABLE: CraftingSystemMeta = {
  key: 'ritual-table',
  name: 'Ritual Table',
  category: 'Raid crafting',
  blurb: 'Myth Drannor raid crafting: forge the Undying Age weapons, then pick one effect for them.',
  detail:
    'The Ritual Table does two separate jobs. The first is a straight trade — 120 '
    + 'Barrier Fragments turns a Legendary Weapon of the Golden Age into its Undying Age '
    + 'counterpart, the caster longswords included. The second is the interesting one: '
    + 'any Sealed in Fire weapon from that set or from the raid can take one of six '
    + 'legendary elemental effects for 20 Barrier Fragments, and the equipment can take '
    + 'an ability bonus instead. Both are re-choosable — applying a new effect removes '
    + 'the old one — so 20 fragments is the price of changing your mind, not of being '
    + 'wrong forever. The table is in a side room of Threats Old and New and only opens '
    + 'once the raid is complete.',
  where: 'A side room inside the raid Threats Old and New, reached from the Outskirts of Myth Drannor, accessible after the raid is finished.',
  ingredients: 'Barrier Fragments from the raid\'s end chest; the Sigils of the Crownblade, Warblade and Artblade are rare drops from the same chest.',
  source: 'Magic of Myth Drannor, and its raid Threats Old and New.',
  wiki: 'https://ddowiki.com/page/Ritual_Table',
  files: [],
  manual: [
    {
      type: 'Weaponry of the Undying Age',
      recipes: [{
        name: 'Any Weapon of the Undying Age',
        description: 'Including the caster longswords.',
        ingredients: ['The corresponding Legendary Weapon of the Golden Age', '120 Barrier Fragments'],
      }],
    },
    {
      type: 'Sealed in Fire weapon effects (one at a time)',
      recipes: LEGENDARY_ELEMENTS.map(element => ({
        name: `Legendary ${element}`,
        description: `Removes any previous Ritual Table effect and adds Legendary ${element}.`,
        ingredients: ['A Sealed in Fire weapon of the Undying Age or from the raid', '20 Barrier Fragments'],
      })),
    },
    {
      type: 'Sealed in Undeath clothing and jewellery',
      recipes: [{
        name: 'Ability bonus',
        description: `Removes any previous Ritual Table effect and adds one of: ${ABILITY_OPTIONS.join(', ')}.`,
        ingredients: ['A Sealed in Undeath item from the Threats Old and New raid', '20 Barrier Fragments'],
      }],
    },
  ],
}

const AUGMENTATION_ALTAR: CraftingSystemMeta = {
  key: 'augmentation-altar',
  name: 'Augmentation Altar',
  category: 'Raid crafting',
  blurb: 'Den of Vipers raid loot, given one elemental effect or one ability bonus for 20 Hydra Scales.',
  detail:
    'The Ritual Table\'s younger twin, for the Den of Vipers raid. The same six '
    + 'legendary elemental effects go on the raid\'s Sealed in Mist weapons and the same '
    + 'ability options go on its Sealed in Gloom equipment, all for 20 Hydra Scales a '
    + 'time. As there, the effect is re-choosable: applying one removes whatever the '
    + 'altar put on before, and applying an effect to a Sealed in Mist weapon does not '
    + 'strip Sealed in Mist itself.',
  where: 'Inside the raid Den of Vipers, in the Temple of Silith-tar.',
  ingredients: '20 Hydra Scales per effect, from the raid\'s end and optional chests.',
  source: 'The Den of Vipers raid.',
  wiki: 'https://ddowiki.com/page/Augmentation_Altar',
  files: [],
  manual: [
    {
      type: 'Den of Vipers weapons (Sealed in Mist)',
      recipes: LEGENDARY_ELEMENTS.map(element => ({
        name: `Legendary ${element}`,
        description: `Removes any previous Augmentation Altar effect and adds Legendary ${element}.`,
        ingredients: ['A Sealed in Mist raid weapon', '20 Hydra Scales'],
      })),
    },
    {
      type: 'Den of Vipers equipment (Sealed in Gloom)',
      recipes: [{
        name: 'Ability bonus',
        description: `Removes any previous Augmentation Altar effect and adds one of: ${ABILITY_OPTIONS.join(', ')}.`,
        ingredients: ['A Sealed in Gloom raid item', '20 Hydra Scales'],
      }],
    },
  ],
}

// ---------------------------------------------------------------------------
// Schism Shard
// ---------------------------------------------------------------------------

const SCHISM_SHARD: CraftingSystemMeta = {
  key: 'schism-shard',
  name: 'Schism Shard Crafting',
  category: 'Raid crafting',
  blurb: 'Nine legendary weapons from Killing Time shards — several of them changing weapon type entirely.',
  detail:
    'Unusually, the base weapons come from three different adventure packs rather than '
    + 'from the raid that drops the ingredient. Each of the three White Plume Mountain '
    + 'echoes offers two recipes: a direct upgrade that keeps the weapon type, or an '
    + 'alteration that changes it — Wave into an orb, Whelm into a throwing hammer, '
    + 'Blackrazor into a longsword. Those three also want their own sentient jewel as an '
    + 'ingredient, and the fiddly part is that both the weapon and the jewel must be '
    + 'clean: a weapon that has ever held a jewel is refused by the target slot and must '
    + 'be dragged into the ingredient area instead, and the jewel itself must be at zero '
    + 'sentience XP. Mythic and Reaper bonuses on the base weapon are lost; since Update '
    + '41 Threads of Fate can buy Mythic +2 or +4 back onto the result.',
  where: 'Varron Tertius, Schism Shard Collector, in The Gatekeepers\' Grove — he will not talk to you until you have completed Killing Time.',
  ingredients: '5 Schism Shards per recipe, a rare drop from the Killing Time end chest or 500 Time Runes; three recipes also consume a sentient jewel.',
  source: 'White Plume Mountain, Desire in the Dark and The Temple of Elemental Evil supply the base weapons.',
  wiki: 'https://ddowiki.com/page/Schism_Shard_Crafting',
  files: [],
  manual: [
    {
      type: 'White Plume Mountain echoes (sentient jewel required)',
      recipes: [
        ['Reflection of Wave', 'Quarterstaff', 'Legendary Echo of Wave', 'Wave'],
        ['Sphere of Waves', 'Orb', 'Legendary Echo of Wave', 'Wave'],
        ['Reflection of Blackrazor', 'Great Sword', 'Legendary Echo of Blackrazor', 'Blackrazor'],
        ['Soulrazor', 'Long Sword', 'Legendary Echo of Blackrazor', 'Blackrazor'],
        ['Reflection of Whelm', 'War Hammer', 'Legendary Echo of Whelm', 'Whelm'],
        ['Overwhelming Impact', 'Throwing Hammer', 'Legendary Echo of Whelm', 'Whelm'],
      ].map(([made, type, from, jewel]) => ({
        name: made,
        description: `${type}, made from ${from}.`,
        ingredients: [from, '5 Schism Shards', `Sentient Jewel of ${jewel} (at 0 sentience XP)`],
        note: 'The base weapon must never have held a sentient jewel, or must have had it removed first.',
      })),
    },
    {
      type: 'Other base weapons (no jewel)',
      recipes: [
        ['Reflection of Angdrelve', 'Great Sword', 'Legendary Wave of Sorrow'],
        ['Soul\'s Sorrow', 'Bastard Sword', 'Legendary Wave of Despair'],
        ['Reflection of The Frostblade', 'Scimitar', 'Epic Leopard\'s Chill'],
      ].map(([made, type, from]) => ({
        name: made,
        description: `${type}, made from ${from}.`,
        ingredients: [from, '5 Schism Shards'],
      })),
    },
  ],
}

export const UPGRADE_CRAFTING_SYSTEMS: CraftingSystemMeta[] = [
  EPIC_CRAFTING,
  LEGENDARY_CRAFTING,
  PERFECTED_CRAFTING,
  TRACE_OF_MADNESS,
  UNHOLY_DEFILER,
  ESOTERIC_TABLE,
  RITUAL_TABLE,
  AUGMENTATION_ALTAR,
  SCHISM_SHARD,
]
