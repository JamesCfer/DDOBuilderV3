// The crafting systems that never reach V2's augment files.
//
// `crafting.ts` builds a system out of `Output/DataFiles/Augments/*.xml`,
// which works beautifully for the systems that fill an augment slot — but
// that is only a third of the crafting in DDO. A Stone of Change ritual, a
// Trapmaking mine, an Epic Crafting upgrade and a Catalyst Forge item all
// produce a *new item* rather than a slot filler, so V2 has no `<Augment>`
// for any of them and never will: the builder only needs to know what a
// finished item does, not how it was made.
//
// So these are transcribed from ddowiki, which is where the recipes live.
// The source for the roster is `Template:CraftingTOC` — the wiki's own index
// of current crafting systems, and the thing the /page/Crafting hub renders.
// Every system on that template is represented here or in `crafting.ts`.
//
// Two rules held while transcribing:
//
//   1. Ingredient counts are copied, never inferred. Where the wiki gives a
//      count ("20 Polished Stones") it is here verbatim; where it gives only
//      a name, the name is here alone rather than a guessed number.
//   2. Where a system's recipes are the same recipe repeated over a list —
//      Trapmaking's seven elements, Epic Crafting's eight adventure packs —
//      the list is expanded programmatically rather than pasted, so a
//      correction lands in one place. That is what the `expand*` helpers at
//      the top of each section do.
//
// Historical systems (ones whose ingredients no longer drop) are deliberately
// absent, on the same grounds the wiki keeps them off its template: there is
// already more current crafting here than anyone can hold in their head.

import type { CraftingSystemMeta, ManualRecipe } from './crafting'

// ---------------------------------------------------------------------------
// Shared shorthand
// ---------------------------------------------------------------------------

/** The seven trap-part elements that Trapmaking's recipes are written over. */
const TRAP_ELEMENTS = ['Acid', 'Cold', 'Electrical', 'Fire', 'Force', 'Sonic', 'Mechanical'] as const

/**
 * Expands one "<Elemental>" recipe into the seven it really is.
 *
 * The wiki writes Trapmaking once with a placeholder because every element
 * takes the identical recipe; the crafting UI in game lists them separately,
 * which is what someone with a bag of Fire Trap Parts is looking for.
 */
function perElement(
  make: (element: string) => ManualRecipe,
  elements: readonly string[] = TRAP_ELEMENTS,
): ManualRecipe[] {
  return elements.map(make)
}

// ---------------------------------------------------------------------------
// Stone of Change
// ---------------------------------------------------------------------------

/** Numeral, ore, soul gems, what the step adds. Order is the prerequisite chain. */
const ADAMANTINE_STEPS: Array<[string, string, string, string]> = [
  ['I', '10 Adamantine Ore', '10 Soul Gems: Essence of Earth', '+5 Hardness and +10 Durability.'],
  ['II', '15 Adamantine Ore', '20 Soul Gems: Essence of Earth', 'An additional +5 Durability.'],
  ['III', '20 Adamantine Ore', '30 Soul Gems: Essence of Earth', 'An additional +5 Durability.'],
  ['IV', '25 Adamantine Ore', '40 Soul Gems: Essence of Earth', 'An additional +5 Durability.'],
  ['V', '30 Adamantine Ore', '50 Soul Gems: Essence of Earth', 'An additional +5 Durability.'],
]

const ADAMANTINE_RITUALS: ManualRecipe[] = ADAMANTINE_STEPS.map(([numeral, ore, gems, benefit], i) => ({
  name: `Adamantine Ritual ${numeral}${i === ADAMANTINE_STEPS.length - 1 ? ' (max)' : ''}`,
  description: `Tempered: ${benefit}`,
  ingredients: ['Any Attuned item', ore, gems],
  note: i === 0
    ? 'Also restores an item that is broken beyond repair.'
    : `Requires Adamantine Ritual ${ADAMANTINE_STEPS[i - 1][0]} on the item already — the chain cannot be skipped.`,
}))

const STONE_OF_CHANGE: CraftingSystemMeta = {
  key: 'stone-of-change',
  name: 'Stone of Change',
  category: 'Rituals & consumables',
  blurb: 'The oldest Eldritch Device: bind and attune an item, then lay a ritual on top of it.',
  detail:
    'The Stone of Change does not make items — it changes ones you already own, and '
    + 'almost everything it does starts with the same step: 400 Siberys Dragonshard '
    + 'Fragments to Bind and Attune the item. Only an attuned item will take a ritual. '
    + 'After that an item can carry one Adamantine ritual chain (durability, run I '
    + 'through V in order) or one Eldritch ritual (a flat bonus keyed to the item type), '
    + 'never both — applying one replaces the other. Unusually among upgrades, an '
    + 'alchemical ritual leaves Mythic and Reaper bonuses alone; the original item '
    + 'stays as it is with the ritual laid on top. It also transmutes Siberys '
    + 'Dragonshards up their chain, ten of one grade to one of the next.',
  where: 'Stones of Change stand in the Marketplace, House Deneith, House Phiarlan, House Jorasco and on a guild airship as an amenity.',
  ingredients: 'Siberys Dragonshard Fragments to attune, then Adamantine Ore and soul gems, or collectables for the Eldritch rituals.',
  source: 'No quest chain — any equippable item you own is a candidate, including most cosmetics.',
  wiki: 'https://ddowiki.com/page/Stone_of_Change',
  files: [],
  manual: [
    {
      type: 'Binding and Attuning (do this first)',
      recipes: [{
        name: 'Attuned Equipable Item',
        description:
          'Binds and attunes the item, which is what every ritual below requires. '
          + 'An account-bound item stays account-bound; an unbound one becomes bound to character.',
        ingredients: ['Any equipable item', '400 Siberys Dragonshard Fragments'],
        note: 'Does not destroy slotted augments, and the item becomes immune to future permanent damage.',
      }],
    },
    { type: 'Alchemical Adamantine Rituals', recipes: ADAMANTINE_RITUALS },
    {
      type: 'Alchemical Eldritch Rituals',
      recipes: [
        {
          name: 'Alchemical Armor Eldritch Ritual',
          description: '+1 Alchemical bonus to AC.',
          ingredients: ['Any Attuned armor', '15 Strings of Prayer Beads', '5 Vials of Pure Water'],
          note: 'Also takes on cosmetic armor and cosmetic helmets, and stacks with the shield ritual.',
        },
        {
          name: 'Alchemical Shield Eldritch Ritual',
          description: '+1 Alchemical bonus to AC.',
          ingredients: ['Any Attuned shield or orb', '2 Tomes: Prophecies of Khyber', '6 Silver Flame Hymnals'],
        },
        {
          name: 'Force Damage Ritual',
          description: '1 point of force damage on each successful hit.',
          ingredients: ['Any Attuned weapon', '3 Luminescent Dusts', '9 Fragrant Drowshood'],
          note: 'Works on handwraps; randomly generated wraps may need a solo pass through the Stone first.',
        },
        {
          name: 'Force Critical Ritual',
          description: '1d4 points of force damage on each successful critical hit.',
          ingredients: ['Any Attuned weapon', '6 Sparkling Dusts', '12 Deadly Feverblanch'],
        },
        {
          name: 'Resistance Ritual',
          description: '+1 Competence bonus to saves.',
          ingredients: ['Any Attuned jewellery — goggles, necklace, ring, bracers or trinket', '4 Lightning-Split Soarwoods', '22 Funerary Tokens'],
        },
      ],
    },
    {
      type: 'Dragonshard transmutation',
      recipes: [
        { name: 'Flawed Siberys Dragonshard', description: 'Combines fragments into the first whole shard.', ingredients: ['100 Siberys Dragonshard Fragments'] },
        { name: 'Imperfect Siberys Dragonshard', description: 'One grade up.', ingredients: ['10 Flawed Siberys Dragonshards'] },
        { name: 'Siberys Dragonshard', description: 'One grade up.', ingredients: ['10 Imperfect Siberys Dragonshards'] },
        { name: 'Exceptional Siberys Dragonshard', description: 'One grade up.', ingredients: ['10 Siberys Dragonshards'] },
        { name: 'Flawless Siberys Dragonshard', description: 'The top of the chain.', ingredients: ['10 Exceptional Siberys Dragonshards'] },
      ],
    },
    {
      type: 'Odds and ends',
      recipes: [
        { name: 'Token of the Twelve', description: 'Breaks a greater token back down into a plain one.', ingredients: ['Greater Token of the Twelve'] },
        { name: 'Concentrated Tasty Ham Oil', description: 'Meat smithing, in its entirety.', ingredients: ['Tasty Ham'] },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Trapmaking
// ---------------------------------------------------------------------------

const MINE_GRADES: Array<[string, string, string[], number]> = [
  ['Weak', '10d6 damage', ['10 <E> Trap Parts', '10 Mechanical Trap Parts'], 3],
  ['Small', '20d6 damage', ['25 <E> Trap Parts', '10 Mechanical Trap Parts', '10 Siberys Dragonshard Fragments'], 5],
  ['Average', '30d6 damage, large area of effect', ['50 <E> Trap Parts', '25 Mechanical Trap Parts', '50 Siberys Dragonshard Fragments', '1 Magic Item Essence'], 7],
  ['Strong', '40d6 damage, large area of effect', ['75 <E> Trap Parts', '25 Mechanical Trap Parts', '100 Siberys Dragonshard Fragments', '3 Magic Item Essences'], 9],
  ['Deadly', '50d6 damage, huge area of effect', ['100 <E> Trap Parts', '25 Mechanical Trap Parts', '250 Siberys Dragonshard Fragments', '5 Magic Item Essences'], 11],
]

const GRENADE_GRADES: Array<[string, string, string[], number, number]> = [
  ['Weak', '2d6 damage, Reflex save 12', ['10 <E> Trap Parts', '25 Crude Vials'], 1, 12],
  ['Small', '6d6 damage, Reflex save 16', ['25 <E> Trap Parts', '25 Crude Vials', '10 Siberys Dragonshard Fragments'], 2, 16],
  ['Average', '12d6 damage, Reflex save 20', ['50 <E> Trap Parts', '25 Simple Vials', '50 Siberys Dragonshard Fragments', '1 Magic Item Essence'], 4, 22],
  ['Strong', '20d6 damage, Reflex save 24', ['75 <E> Trap Parts', '25 Simple Vials', '100 Siberys Dragonshard Fragments', '3 Magic Item Essences'], 8, 30],
  ['Deadly', '30d6 damage, Reflex save 28', ['100 <E> Trap Parts', '25 Unadorned Vials', '250 Siberys Dragonshard Fragments', '5 Magic Item Essences'], 16, 40],
]

/** The elements a mine or grenade actually comes in — Mechanical makes the parts, not the trap. */
const TRAP_DAMAGE_TYPES = ['Acid', 'Cold', 'Electrical', 'Fire', 'Force', 'Sonic'] as const

const TRAPMAKING: CraftingSystemMeta = {
  key: 'trapmaking',
  name: 'Trapmaking',
  category: 'Rituals & consumables',
  blurb: 'Rogues and Artificers turn harvested trap parts into mines, grenades and spell traps.',
  detail:
    'The only crafting in the game gated behind a feat rather than a place. Trapmaking '
    + 'is granted to Rogues and Artificers at level 4 (Dark Hunters at 3), and it does two '
    + 'things: it lets you strip parts off any control panel you disable, and it lets you '
    + 'arm what you build with them inside a quest. How many parts a panel gives depends on '
    + 'your Disable Device skill, the quest\'s heroic level and the trap\'s CR, and a panel '
    + 'only ever yields one type however many traps it runs. Mines are placed on the ground '
    + 'and trigger on contact without breaking stealth; grenades are thrown in an arc and '
    + 'splash. A mine\'s DC is half your Disable Device skill, rising to a full 100% of it '
    + 'with three ranks of Improved Traps — which is what makes the deadly grades worth the '
    + 'ingredients rather than the small ones.',
  where: 'A Device Workstation — the ground floor of the House Cannith enclave, or an airship amenity at guild level 30.',
  ingredients: 'Trap parts harvested from control panels, glass vials from the Free Agent vendors, Siberys Dragonshard Fragments, Magic Item Essences, and scrolls for the magical traps.',
  source: 'No content to farm — the parts come off any trap you disable, so higher-level quests with many traps are the best source.',
  wiki: 'https://ddowiki.com/page/Trapmaking',
  files: [],
  manual: [
    {
      type: 'Mines',
      recipes: [
        {
          name: 'Noisemakers',
          description: 'Makes a noise after a few seconds that lures creatures to it. Yields 15.',
          minLevel: 2,
          ingredients: ['25 Mechanical Trap Parts'],
        },
        ...MINE_GRADES.flatMap(([grade, effect, parts, level]) =>
          perElement(element => ({
            name: `${grade} ${element} Trap`,
            description: `${effect}. Yields 15 mines.`,
            minLevel: level,
            ingredients: parts.map(p => p.replace('<E>', element)),
          }), TRAP_DAMAGE_TYPES)),
      ],
    },
    {
      type: 'Mines — Construct grades (ML 13 to 27)',
      recipes: [13, 15, 17, 19, 21, 23, 25, 27].flatMap(level =>
        perElement(element => ({
          name: `Construct ${element} Trap (ML ${level})`,
          description: `${(level - 1) * 5}d6 damage, huge area of effect. Yields 15 mines.`,
          minLevel: level,
          ingredients: [
            `100 ${element} Trap Parts`, '25 Mechanical Trap Parts',
            '250 Siberys Dragonshard Fragments', '5 Magic Item Essences',
          ],
          note: 'Since Update 36 these have been observed dealing roughly two thirds of their listed damage.',
        }), TRAP_DAMAGE_TYPES)),
    },
    {
      type: 'Grenades',
      recipes: GRENADE_GRADES.flatMap(([grade, effect, parts, level, umd]) =>
        perElement(element => ({
          name: `${grade} ${element} Grenade`,
          description: `${effect}. Yields 25 grenades.`,
          minLevel: level,
          ingredients: parts.map(p => p.replace('<E>', element)),
          note: `Usable without Rogue or Artificer levels at UMD ${umd}.`,
        }), TRAP_DAMAGE_TYPES)),
    },
    {
      type: 'Magical traps',
      recipes: [
        {
          name: 'Magical Trap (level 1 spell)',
          description:
            'Casts the scroll\'s spell when triggered. Yields 15. Takes a scroll of '
            + 'Cause Fear, Daze, Grease, Hypnotism or Sleep.',
          ingredients: ['10 Magical Trap Parts', '10 Mechanical Trap Parts', '1 level 1 scroll'],
          note: 'The Marketplace Bazaar sells all of these but the rare Daze scrolls.',
        },
        {
          name: 'Magical Trap (level 2 spell)',
          description:
            'Yields 15 at ML 5. Takes a scroll of Blindness, Daze Monster, Glitterdust, '
            + 'Hypnotic Pattern, Otto\'s Resistible Dance, Scare, Touch of Idiocy or Web.',
          minLevel: 5,
          ingredients: ['25 Magical Trap Parts', '10 Mechanical Trap Parts', '1 level 2 scroll'],
        },
        {
          name: 'Magical Trap (level 3 spell)',
          description:
            'Yields 15 at ML 7. Takes a scroll of Deep Slumber, Dispel Magic, Halt Undead, '
            + 'Hold Person or Slow.',
          minLevel: 7,
          ingredients: ['50 Magical Trap Parts', '10 Mechanical Trap Parts', '1 level 3 scroll'],
          note: 'Object Desire in House Phiarlan sells the level 3 scrolls.',
        },
      ],
    },
  ],
}

export const MANUAL_CRAFTING_SYSTEMS: CraftingSystemMeta[] = [
  STONE_OF_CHANGE,
  TRAPMAKING,
]
