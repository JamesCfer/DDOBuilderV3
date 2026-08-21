// Coverage against the wiki's own index of crafting systems.
//
// ddowiki maintains `Template:CraftingTOC` — the table the /page/Crafting hub
// renders — as its list of *current* crafting systems, deliberately excluding
// historical ones whose ingredients no longer drop. That makes it the right
// yardstick for "does the Crafting page cover everything", and this test is
// the yardstick applied: every entry on that template must map to a system in
// the catalogue.
//
// The mapping is by key rather than by name because several systems are
// better known by a name the wiki does not use as its page title (the wiki
// says "Nebula Fragment Crafting" where the altar in game and the players
// both say "Perfected"). When a new system ships, the fix is to add it and
// then add its row here — not to loosen the assertion.

import { describe, expect, it } from 'vitest'
import { CRAFTING_SYSTEMS } from '../server/crafting'

/** Every row of Template:CraftingTOC, in its level order, → our key. */
const WIKI_TOC: Array<[wikiName: string, key: string]> = [
  ['Augment Slot', 'augments'],
  ['Essence Crafting', 'cannith'],
  ['Deck of Many Curses', 'deck-of-many-curses'],
  ['Event Items', 'event-items'],
  ['Reaper Forge', 'reaper'],
  ['Stone of Change', 'stone-of-change'],
  ['Challenges', 'challenges'],
  ['Trapmaking', 'trapmaking'],
  ['Cauldron of Cadence', 'cauldron-of-cadence'],
  ['Dampened', 'dampened'],
  ['Slave Lords Crafting', 'slave-lords'],
  ['Viktranium Experiment Crafting', 'viktranium'],
  ['Catalyst Crafting', 'catalyst'],
  ['Green Steel items', 'greensteel'],
  ['Nearly Complete', 'nearly-complete'],
  ['Sealed Altar', 'sealed-altar'],
  ['Alchemical Crafting', 'alchemical'],
  ['Cauldron of Sora Katra', 'cauldron-of-sora-katra'],
  ['Dragonscale Armor', 'dragonscale-armor'],
  ['Stormreaver Monument', 'stormreaver-monument'],
  ['Trace of Madness', 'trace-of-madness'],
  ['Fountain of Necrotic Might', 'fountain-of-necrotic-might'],
  ['Nearly Finished', 'nearly-finished'],
  ['Dragontouched Armor', 'dragontouched'],
  ['Incredible Potential', 'incredible-potential'],
  ['Suppressed Power', 'suppressed-power'],
  ['Lost Purpose', 'lost-purpose'],
  ['Unholy Defiler of the Hidden Hand', 'unholy-defiler'],
  ['Epic Crafting', 'epic-crafting'],
  ['Sentient Weapon', 'sentient-weapon'],
  ['Minor Artifact', 'minor-artifact'],
  ['Mikrom Sum', 'mikrom-sum'],
  ['Thunder-Forged', 'thunderforged'],
  ['Legendary Green Steel items', 'legendary-greensteel'],
  ['Zhentarim Attuned', 'zhentarim-attuned'],
  ['Schism Shard Crafting', 'schism-shard'],
  ['Legendary Crafting', 'legendary-crafting'],
  ['Nebula Fragment Crafting', 'perfected-crafting'],
  ['Soulforge', 'soulforge'],
  ['Dinosaur Bone crafting', 'isle-of-dread'],
  ['Esoteric Table', 'esoteric-table'],
  ['Ritual Table', 'ritual-table'],
  ['Augmentation Altar', 'augmentation-altar'],
]

describe('crafting coverage', () => {
  const keys = new Set(CRAFTING_SYSTEMS.map(s => s.key))

  it('covers every system on the wiki crafting index', () => {
    const missing = WIKI_TOC.filter(([, key]) => !keys.has(key)).map(([name]) => name)
    expect(missing).toEqual([])
  })

  it('maps each wiki row to a distinct system', () => {
    // Two rows pointing at one key would hide a gap: the count would still be
    // right while a real system went unrepresented.
    const mapped = WIKI_TOC.map(([, key]) => key)
    expect(new Set(mapped).size).toBe(mapped.length)
  })

  it('gives every system somewhere to craft it and something to spend', () => {
    for (const system of CRAFTING_SYSTEMS) {
      expect(system.where.length, `${system.key} has no location`).toBeGreaterThan(0)
      expect(system.ingredients.length, `${system.key} has no ingredients`).toBeGreaterThan(0)
      expect(system.detail.length, `${system.key} has no detail`).toBeGreaterThan(0)
    }
  })

  it('never ships a hand-authored recipe without a name or a description', () => {
    // A blank row renders as an empty bullet that looks like a rendering bug.
    for (const system of CRAFTING_SYSTEMS) {
      for (const slot of system.manual ?? []) {
        expect(slot.type.length, `${system.key} has an unnamed slot`).toBeGreaterThan(0)
        for (const recipe of slot.recipes) {
          expect(recipe.name.length, `${system.key}/${slot.type} has an unnamed recipe`).toBeGreaterThan(0)
          expect(recipe.description.length, `${system.key}: ${recipe.name} has no description`).toBeGreaterThan(0)
        }
      }
    }
  })
})
