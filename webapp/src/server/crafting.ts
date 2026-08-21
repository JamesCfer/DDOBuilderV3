// DDO crafting systems — the catalogue behind the Crafting page.
//
// Every crafting system in the game works the same way mechanically: a base
// item exposes one or more named *crafting slots* ("Weapon Aspect", "Alchemical
// Tier 1", "Cannith Boots Prefix", …) and the player fills each slot with one
// of the effects the system offers. V2's data model already stores exactly
// that — each `Output/DataFiles/Augments/*.Augments.xml` file is one crafting
// system, and every `<Augment>` in it is one recipe, tagged with the slot
// type(s) it can go into (`<Type>`), what it costs in item level
// (`<MinLevel>`), and — for the level-scaled systems like Cannith — the value
// it grants at each item level (`<LevelValue>`).
//
// So the Crafting page is not a second copy of that data: it is a different
// *view* of it. The gear panel asks "what fits in this slot on this item";
// the Crafting page asks "what can this system make, and what do I need to
// make it". This module supplies the second question's answer, by grouping the
// augment files into systems and pairing each with the out-of-game knowledge
// the XML has no field for (where you craft it, what the ingredients are,
// which quest chain drops the blanks).
//
// Deliberately excluded: the plain slotted-augment files (Diamond, Ruby,
// Sapphire, Topaz, Emerald, Named, Other). Those are loot you slot, not
// systems you craft with — they belong to the gear panel's augment picker.

import path from 'path'
import fs from 'fs'
import { xmlParser } from './dataLoaders'
import type { Augment } from '../types/ddo'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a system is grouped on the Crafting page. */
export type CraftingCategory =
  | 'Craft from scratch'
  | 'Raid crafting'
  | 'Quest chain crafting'
  | 'Item upgrades'

export interface CraftingSystemMeta {
  /** URL-safe id — the `/api/crafting/:key` path segment. */
  key: string
  name: string
  category: CraftingCategory
  /** One line, shown on the system's card. */
  blurb: string
  /** The longer explanation shown when the system is open. */
  detail: string
  /** Where in game the crafting is done. */
  where: string
  /** What it consumes — ingredients, currency, collectables. */
  ingredients: string
  /** Which quest / raid / pack the base items come from. */
  source: string
  /** ddowiki.com page for the system. */
  wiki: string
  /** Augment file basenames (without the `.Augments.xml` suffix). */
  files: string[]
  /**
   * Slot types that are only reachable by first filling another slot (V2
   * `AddAugment`), listed here so the UI can present the tier order the way
   * the crafting UI in game does rather than alphabetically.
   */
  slotOrder?: string[]
}

/** One recipe — an augment, reduced to what the Crafting page renders. */
export interface CraftingRecipe {
  name: string
  description: string
  minLevel: number
  /** Slot types this recipe fits. */
  slots: string[]
  /** Set bonus names the recipe stamps onto the host item. */
  setBonuses: string[]
  /** Slot types unlocked by choosing this recipe (V2 AddAugment/GrantAugment). */
  unlocks: string[]
  /** V2 `<Levels>` — the item level each `values` entry belongs to. */
  levels: number[]
  /** V2 `<LevelValue>` — the effect amount per level. */
  values: number[]
  /** True when the amount scales with level rather than being fixed. */
  scalesWithLevel: boolean
}

/** One crafting slot, with every recipe that fits it. */
export interface CraftingSlotGroup {
  type: string
  recipes: CraftingRecipe[]
}

/** Card-level summary — what `/api/crafting` returns for the hub page. */
export interface CraftingSystemSummary extends CraftingSystemMeta {
  recipeCount: number
  slotCount: number
  /** Lowest / highest `MinLevel` across the system's recipes, or null when
   *  the system has no levelled recipes. */
  minLevel: number | null
  maxLevel: number | null
}

/** Full detail — what `/api/crafting/:key` returns. */
export interface CraftingSystemDetail extends CraftingSystemSummary {
  slots: CraftingSlotGroup[]
}

// ---------------------------------------------------------------------------
// The catalogue
//
// `files` ties each entry to real data on disk; everything else is the
// context the XML does not carry. Where the in-game details are content the
// data files do not state, the text stays descriptive of what the recipes
// themselves show and points at the wiki for the rest.
// ---------------------------------------------------------------------------

export const CRAFTING_SYSTEMS: CraftingSystemMeta[] = [
  {
    key: 'cannith',
    name: 'Cannith Crafting',
    category: 'Craft from scratch',
    blurb: 'Build an item from a blank: one prefix, one suffix and an extra effect, at any level you like.',
    detail:
      'The only system that makes gear rather than upgrading it. You take a blank '
      + '(or any unbound item with a free crafting slot), then bind a prefix shard, a '
      + 'suffix shard and — on most slots — an extra effect shard to it. Every effect '
      + 'scales with the item level you craft at, so the same shard is worth more on a '
      + 'level 30 blank than on a level 8 one, and the finished item\'s minimum level '
      + 'is set by the strongest shard on it. Use the planner tab to pick a slot and a '
      + 'level and see exactly what each effect is worth there.',
    where: 'The Cannith Crafting Hall in House Cannith (public instance), or a portable crafting altar.',
    ingredients: 'Essences (arcane / eldritch) from deconstructing loot, plus collectables for the shard recipes.',
    source: 'No quest needed — blanks are bought from the crafting vendors or pulled from loot.',
    wiki: 'https://ddowiki.com/page/Cannith_Crafting',
    files: ['CannithAndRandomItem'],
  },
  {
    key: 'greensteel',
    name: 'Green Steel',
    category: 'Raid crafting',
    blurb: 'The Shroud. Three tiers per item, and matching your tiers unlocks the big set effects.',
    detail:
      'The original raid crafting system, and still the one whose planning matters '
      + 'most: each tier is an element / aspect / essence combination, and picking the '
      + 'same combination on several tiers is what turns a stack of small bonuses into '
      + 'the tier-three effects people actually build for. Weapons and accessories use '
      + 'separate recipe lists, so a blank of each kind is a separate project.',
    where: 'The Altar of Fecundity, Subjugation, Invasion and Devastation inside The Shroud.',
    ingredients: 'Shroud ingredients — small/medium/large scales, chains, bones, stones and the like.',
    source: 'The Shroud (Vale of Twilight).',
    wiki: 'https://ddowiki.com/page/Green_Steel_items',
    files: ['Greensteel_Heroic'],
    slotOrder: ['Weapon Aspect', 'Weapon Devastation', 'Weapon Invasion', 'Weapon Subjugation'],
  },
  {
    key: 'legendary-greensteel',
    name: 'Legendary Green Steel',
    category: 'Raid crafting',
    blurb: 'Green Steel at cap: three equipment or weapon tiers, plus the Dominion / Escalation / Opposition stances.',
    detail:
      'The endgame rebuild of Green Steel. Tiers work the same way, but the set '
      + 'bonuses each choice stamps on the item — Dominion, Escalation, Opposition, '
      + 'Ethereal, Material — are counted across everything you are wearing, and the '
      + 'highest count decides which mutually exclusive stance you get. That makes '
      + 'Legendary Green Steel a whole-gearset decision rather than a per-item one: '
      + 'two items are enough to start the stances, four for Ethereal / Material.',
    where: 'The altars in the Legendary Shroud.',
    ingredients: 'Legendary Shroud ingredients.',
    source: 'The Legendary Shroud (Vale of Twilight, legendary).',
    wiki: 'https://ddowiki.com/page/Legendary_Green_Steel_items',
    files: ['Greensteel_Legendary'],
    slotOrder: [
      'Greensteel Weapon Tier 1', 'Greensteel Weapon Tier 2', 'Greensteel Weapon Tier 3',
      'Greensteel Weapon Active',
      'Equipment Tier 1', 'Equipment Tier 2', 'Equipment Tier 3',
    ],
  },
  {
    key: 'alchemical',
    name: 'Alchemical',
    category: 'Raid crafting',
    blurb: 'Master Artificer weapons and shields: pick a material, then three tiers on top of it.',
    detail:
      'Alchemical items start by choosing the material the item is made of — which is '
      + 'also what decides the damage reduction it bypasses — and only then open their '
      + 'tier slots. Each tier you complete unlocks the next, so the choice cascades: '
      + 'material, tier one, tier two, tier three. The legendary versions follow the '
      + 'same shape at level 29.',
    where: 'The alchemical altars in the Master Artificer raid.',
    ingredients: 'Alchemical raid ingredients.',
    source: 'The Master Artificer (Lordsmarch Plaza / Legendary).',
    wiki: 'https://ddowiki.com/page/Alchemical_crafting',
    files: ['Alchemical'],
    slotOrder: [
      'Alchemical Material Type', 'Alchemical Tier 1', 'Alchemical Tier 2', 'Alchemical Tier 3',
      'Legendary Alchemical Material', 'Legendary Alchemical Tier 1',
      'Legendary Alchemical Tier 2', 'Legendary Alchemical T3',
    ],
  },
  {
    key: 'thunderforged',
    name: 'Thunder-Forged',
    category: 'Raid crafting',
    blurb: 'Shadow-forged gear from the Thunderholme raids, with a variant chosen per armor kind.',
    detail:
      'Thunder-Forged items are crafted from shadow-touched blanks: you choose the '
      + 'variant that matches the item — cloth, light, medium, heavy or docent — and '
      + 'the recipe list changes with it. Two-handed weapons additionally get an extra '
      + 'red augment slot granted by the crafting itself.',
    where: 'The Thunder-Forge in Thunderholme.',
    ingredients: 'Thunderholme raid ingredients and commendations.',
    source: 'Fire on Thunder Peak and Temple of the Deathwyrm.',
    wiki: 'https://ddowiki.com/page/Thunder-Forged_items',
    files: ['Thunderforged'],
    slotOrder: [
      'Shadow Cloth Variant', 'Shadow Light Variant', 'Shadow Medium Variant',
      'Shadow Heavy Variant', 'Shadow Docent Variant',
      'Thunderforged Tier 1', 'Thunderforged Tier 2', 'Thunderforged Tier 3',
    ],
  },
  {
    key: 'slave-lords',
    name: 'Slave Lords',
    category: 'Quest chain crafting',
    blurb: 'Prefix, suffix, extra and a set bonus, all crafted from one heroic quest chain.',
    detail:
      'A self-contained chain-crafting system: run the chain, collect the ingredients, '
      + 'and fill the item\'s prefix, suffix, extra and set-bonus slots yourself. '
      + 'Because the set bonus is one of the slots you choose, you can point a whole '
      + 'set of crafted items at the same bonus deliberately instead of hoping loot '
      + 'lines up.',
    where: 'The crafting altar for the Slave Lords chain.',
    ingredients: 'Ingredients from the Slave Lords of the Shard chain.',
    source: 'Slave Lords of the Shard (heroic).',
    wiki: 'https://ddowiki.com/page/Slave_Lords_crafting',
    files: ['Slavelords_Heroic'],
    slotOrder: ['Slavelords Prefix', 'Slavelords Suffix', 'Slavelords Extra', 'Slavelords Bonus', 'Slavelords Set Bonus'],
  },
  {
    key: 'legendary-slave-lords',
    name: 'Legendary Slave Lords',
    category: 'Quest chain crafting',
    blurb: 'The same prefix / suffix / extra / set-bonus crafting, at legendary levels.',
    detail:
      'Identical in shape to the heroic version — prefix, suffix, extra and a chosen '
      + 'set bonus — with legendary-scale numbers on every recipe.',
    where: 'The crafting altar for the legendary Slave Lords chain.',
    ingredients: 'Ingredients from the legendary Slave Lords chain.',
    source: 'Slave Lords of the Shard (legendary).',
    wiki: 'https://ddowiki.com/page/Slave_Lords_crafting',
    files: ['Slavelords_Legendary'],
    slotOrder: [
      'Legendary Slavelords Prefix', 'Legendary Slavelords Suffix',
      'Legendary Slavelords Extra', 'Legendary Slavelords Bonus',
      'Legendary Slavelords Set Bonus',
    ],
  },
  {
    key: 'dragontouched',
    name: 'Dragontouched Armor',
    category: 'Quest chain crafting',
    blurb: 'Three rune slots — Eldritch, Sovereign and Tempest — on one piece of armor.',
    detail:
      'Dragontouched armor carries three rune slots that are crafted independently: '
      + 'an Eldritch rune, a Sovereign rune and a Tempest rune, each with its own list '
      + 'of effects. The armor itself is the constant; the three runes are what you '
      + 'plan.',
    where: 'The Dragontouched altar.',
    ingredients: 'Runes and dragonshards from the Reign of Madness content.',
    source: 'Reign of Madness / Sschindylryn.',
    wiki: 'https://ddowiki.com/page/Dragontouched_Armor',
    files: ['Dragontouched_EldritchRune', 'Dragontouched_SovereignRune', 'Dragontouched_TempestRune'],
    slotOrder: ['Eldritch Rune', 'Sovereign Rune', 'Tempest Rune'],
  },
  {
    key: 'lamordia',
    name: 'Lamordia Slots',
    category: 'Item upgrades',
    blurb: 'Dolorous, Melancholic, Miserable and Woeful slots on Lamordia gear.',
    detail:
      'Lamordia gear exposes four slot families — Dolorous, Melancholic, Miserable and '
      + 'Woeful — and each one carries a different recipe list depending on whether it '
      + 'sits on a weapon, on armor or on an accessory. Heroic and legendary versions '
      + 'of every effect exist, which is why the same slot name appears twice in the '
      + 'catalogue at very different levels.',
    where: 'The Lamordia crafting altar.',
    ingredients: 'Lamordia crafting ingredients.',
    source: 'The Lamordia content.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['Lamordia_Heroic', 'Lamordia_Legendary'],
  },
  {
    key: 'isle-of-dread',
    name: 'Isle of Dread Bone Crafting',
    category: 'Item upgrades',
    blurb: 'Claw, fang, horn and scale slots on Isle of Dread accessories and armor.',
    detail:
      'Isle of Dread gear is upgraded with dinosaur parts: claws, fangs, horns and '
      + 'scales, each fitting its own slot on the accessory or armor, with a stronger '
      + 'artifact tier of every slot on the artifact pieces.',
    where: 'The Isle of Dread crafting altar.',
    ingredients: 'Dinosaur bones, claws, fangs, horns and scales from the Isle of Dread.',
    source: 'Isle of Dread (Update 55).',
    wiki: 'https://ddowiki.com/page/Isle_of_Dread',
    files: ['DinosaurBone'],
  },
  {
    key: 'sun-and-moon',
    name: 'Sun and Moon Gems',
    category: 'Item upgrades',
    blurb: 'Myth Drannor solar and lunar gems — artifact bonuses against profane ones.',
    detail:
      'The Myth Drannor gems come in matched solar and lunar pairs: the solar gem of '
      + 'an effect grants it as an artifact bonus, the lunar gem as a profane one, so '
      + 'which one you want depends entirely on what the rest of your gear already '
      + 'occupies. Heroic and legendary versions of each exist.',
    where: 'Slotted directly into Sun and Moon slots on Myth Drannor gear.',
    ingredients: 'Gems from the Myth Drannor content.',
    source: 'Myth Drannor.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['SunAndMoon'],
  },
  {
    key: 'deck-of-many-curses',
    name: 'Deck of Many Curses',
    category: 'Item upgrades',
    blurb: 'Curse slots that hand out fortune bonuses — the Vecna Unleashed deck.',
    detail:
      'The deck fills a curse slot with a "curse" that is in practice a fortune-bonus '
      + 'effect, from minor to major across the ability scores and combat stats.',
    where: 'Slotted into a Deck Curse slot.',
    ingredients: 'Cards from the Deck of Many Curses.',
    source: 'Vecna Unleashed.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['DeckOfManyCurses'],
  },
  {
    key: 'reaper',
    name: 'Reaper Crafting',
    category: 'Item upgrades',
    blurb: 'Reaper-slot effects on armor, accessories and weapons, bought with reaper XP.',
    detail:
      'Reaper crafting fills a per-slot reaper socket — armor, belt, boots, bracers, '
      + 'cloak, gloves, goggles, helmet, necklace, ring and so on each have their own '
      + 'list — with defensive and power bonuses paid for out of reaper experience.',
    where: 'The reaper crafting interface.',
    ingredients: 'Reaper experience.',
    source: 'Any reaper-difficulty content.',
    wiki: 'https://ddowiki.com/page/Reaper_crafting',
    files: ['Reaper'],
  },
  {
    key: 'mythic',
    name: 'Mythic & Reaper Boosts',
    category: 'Item upgrades',
    blurb: 'The mythic slot: flat PRR, MRR, melee, ranged and spell power added to an item.',
    detail:
      'A mythic boost is slotted into the mythic socket found on much of the endgame '
      + 'loot table and simply adds a rank-scaled block of power to the item. The rank '
      + 'is a number you enter rather than a recipe you pick.',
    where: 'Slotted into an item\'s mythic slot.',
    ingredients: 'Mythic boost items from endgame loot.',
    source: 'Endgame loot.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['Mythic'],
  },
  {
    key: 'sealed',
    name: 'Sealed Power',
    category: 'Item upgrades',
    blurb: 'Sealed in Fire / Mist / Undeath / Gloom — unsealing a weapon\'s hidden effect.',
    detail:
      'Sealed items arrive with their real effect locked behind a seal; the crafting '
      + 'step chooses which of the sealed powers is released. It is a one-slot decision '
      + 'per item, but an irreversible one.',
    where: 'The relevant unsealing altar.',
    ingredients: 'The sealing ingredients for the item\'s content.',
    source: 'Endgame raids and chains.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['SealedInFire', 'SealedInUndeath'],
  },
  {
    key: 'planar-searing',
    name: 'Planar Searing & Leashed Power',
    category: 'Item upgrades',
    blurb: 'Choose the unleashed effect on a planar-searing weapon.',
    detail:
      'A planar-searing weapon holds a burn that has to be pointed somewhere: the '
      + 'crafting slot picks which unleashed effect it becomes, or leaves it unupgraded.',
    where: 'The planar altar.',
    ingredients: 'Planar ingredients.',
    source: 'Endgame planar content.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['PlanarSearing'],
  },
  {
    key: 'lost-purpose',
    name: 'Lost Purpose',
    category: 'Item upgrades',
    blurb: 'Stamp a chosen legendary set bonus onto an item.',
    detail:
      'Lost Purpose is unusual: rather than an effect, the slot grants a *set bonus* '
      + 'of your choosing to the item — Legendary Heart of Blades, Vol\'s Influence, '
      + 'The Fury\'s Rage and the rest — which is how you finish a set you are one '
      + 'piece short of.',
    where: 'The Lost Purpose altar.',
    ingredients: 'Lost Purpose ingredients.',
    source: 'Endgame content.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['LostPurpose'],
  },
  {
    key: 'facets',
    name: 'Facets',
    category: 'Item upgrades',
    blurb: 'Facet slots granting a single strong slotted effect.',
    detail:
      'Facets are single-choice upgrade slots on endgame gear, each granting one '
      + 'substantial slotted effect rather than a numeric bonus.',
    where: 'Slotted into a facet slot.',
    ingredients: 'Facet ingredients.',
    source: 'Endgame content.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['Facets'],
  },
  {
    key: 'nearly-complete',
    name: 'Nearly Complete',
    category: 'Item upgrades',
    blurb: 'Finish an incomplete item by choosing which bonus family completes it.',
    detail:
      'A "nearly complete" item asks you which effect finishes it — an ability score, '
      + 'insightful or quality ability score, exceptional skills, healing amplification '
      + 'or spell focus — with separate heroic and legendary slot families.',
    where: 'The completion altar.',
    ingredients: 'The item\'s completion ingredients.',
    source: 'Various.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['NearlyComplete'],
  },
  {
    key: 'incredible-potential',
    name: 'Incredible Potential',
    category: 'Item upgrades',
    blurb: 'The big single-effect upgrade slot on items with incredible potential.',
    detail:
      'One slot, one large effect: spell powers, damage bonuses, healing amplification '
      + 'and the like, at a fixed high value rather than a scaling one.',
    where: 'The relevant altar.',
    ingredients: 'The item\'s upgrade ingredients.',
    source: 'Various.',
    wiki: 'https://ddowiki.com/page/Crafting',
    files: ['IncrediblePotential'],
  },
]

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Parses V2's space-separated numeric tables (`<Levels>`, `<LevelValue>`). */
function numberTable(raw: unknown): number[] {
  if (raw == null) return []
  const text = typeof raw === 'object' && raw !== null && '#text' in (raw as Record<string, unknown>)
    ? String((raw as Record<string, unknown>)['#text'] ?? '')
    : String(raw)
  return text.trim().split(/\s+/).map(Number).filter(n => !Number.isNaN(n))
}

function toArray(value: unknown): string[] {
  if (value == null) return []
  return (Array.isArray(value) ? value : [value])
    .map(v => String(v).trim())
    .filter(v => v.length > 0)
}

/** Reads one `*.Augments.xml` file into raw augment records. */
function readAugmentFile(dataDir: string, basename: string): Augment[] {
  const filePath = path.join(dataDir, 'Augments', `${basename}.Augments.xml`)
  if (!fs.existsSync(filePath)) return []
  try {
    const parsed = xmlParser.parse(fs.readFileSync(filePath, 'utf-8')) as
      { Augments?: { Augment?: unknown[] } }
    return (parsed?.Augments?.Augment ?? []) as Augment[]
  } catch {
    return []
  }
}

function toRecipe(aug: Augment): CraftingRecipe {
  const raw = aug as unknown as Record<string, unknown>
  const values = numberTable(raw['LevelValue'])
  return {
    name: String(raw['Name'] ?? '').trim(),
    description: String(raw['Description'] ?? '').trim(),
    minLevel: Number(raw['MinLevel'] ?? 0) || 0,
    slots: toArray(raw['Type']),
    setBonuses: toArray(raw['SetBonus']),
    // V2 spells the cascade three different ways; for a reader they are the
    // same fact — "picking this opens that slot".
    unlocks: [
      ...toArray(raw['AddAugment']),
      ...toArray(raw['GrantAugment']),
      ...toArray(raw['GrantConditionalAugment']),
    ],
    levels: numberTable(raw['Levels']),
    values,
    scalesWithLevel: raw['ChooseLevel'] !== undefined && values.length > 1,
  }
}

/**
 * Orders a system's slots: the explicit `slotOrder` first (that is the order
 * the in-game crafting UI walks the tiers in), then everything else
 * alphabetically. Sorting purely alphabetically would put "Tier 3" before
 * "Tier 1"'s prerequisite material slot and read as nonsense.
 */
function orderSlots(types: string[], slotOrder: string[] | undefined): string[] {
  const preferred = (slotOrder ?? []).filter(t => types.includes(t))
  const rest = types.filter(t => !preferred.includes(t)).sort((a, b) => a.localeCompare(b))
  return [...preferred, ...rest]
}

/** No item in the game is above level 40; V2's own level tables stop there. */
const MAX_ITEM_LEVEL = 40

/**
 * The level band a system's recipes cover, or `[null, null]` when it has no
 * meaningful one.
 *
 * Two kinds of noise are filtered out. A `MinLevel` above 40 cannot be a real
 * item level — `LostPurpose.Augments.xml` carries a `318` where `32` was
 * meant, and left alone it renders as "ML 18–318" on the card. And a system
 * whose recipes are *all* at level 1 (Reaper, Mythic, the Deck) is not a
 * level-1 system: those files simply never fill the field in, so claiming a
 * range would be inventing one.
 */
function levelRange(recipes: CraftingRecipe[]): [number | null, number | null] {
  const levels = recipes.map(r => r.minLevel).filter(l => l > 0 && l <= MAX_ITEM_LEVEL)
  if (levels.length === 0) return [null, null]
  const min = Math.min(...levels)
  const max = Math.max(...levels)
  if (max <= 1) return [null, null]
  return [min, max]
}

/**
 * Builds one system's full detail from its augment files.
 *
 * A recipe listing several slot types appears under each of them — that is
 * how V2 stores "this shard fits belts and boots", and splitting it here is
 * what lets the Cannith planner answer "what can go on boots" directly.
 */
export function buildCraftingSystem(dataDir: string, meta: CraftingSystemMeta): CraftingSystemDetail {
  const recipes = meta.files
    .flatMap(f => readAugmentFile(dataDir, f))
    .map(toRecipe)
    .filter(r => r.name.length > 0)

  const bySlot = new Map<string, CraftingRecipe[]>()
  for (const recipe of recipes) {
    for (const slot of recipe.slots) {
      const list = bySlot.get(slot)
      if (list) list.push(recipe)
      else bySlot.set(slot, [recipe])
    }
  }

  const slots: CraftingSlotGroup[] = orderSlots([...bySlot.keys()], meta.slotOrder)
    .map(type => ({
      type,
      recipes: (bySlot.get(type) ?? []).sort((a, b) =>
        a.minLevel - b.minLevel || a.name.localeCompare(b.name)),
    }))

  const [minLevel, maxLevel] = levelRange(recipes)

  return {
    ...meta,
    recipeCount: recipes.length,
    slotCount: slots.length,
    minLevel,
    maxLevel,
    slots,
  }
}

/** Every system, with its recipes — the source both API shapes are cut from. */
export function loadCraftingSystems(dataDir: string): CraftingSystemDetail[] {
  return CRAFTING_SYSTEMS
    .map(meta => buildCraftingSystem(dataDir, meta))
    // A system whose data file is missing from this install would render as an
    // empty card promising crafting that cannot be browsed — drop it instead.
    .filter(system => system.recipeCount > 0)
}

/** The hub page's payload: every system minus the (large) recipe lists. */
export function craftingSummaries(systems: CraftingSystemDetail[]): CraftingSystemSummary[] {
  return systems.map(({ slots: _slots, ...summary }) => summary)
}
