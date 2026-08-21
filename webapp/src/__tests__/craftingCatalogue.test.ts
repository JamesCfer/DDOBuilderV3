// The Crafting page's catalogue: every system in CRAFTING_SYSTEMS must
// actually resolve to recipes in the shipped `Output/DataFiles/Augments/`
// files, and the shapes the page renders (slot grouping, tier ordering, the
// level-scaled Cannith tables) must come out of the loader intact.
//
// A card promising "Green Steel" that opens onto nothing is worse than no
// card at all, so the coverage assertion here is deliberately strict: every
// declared system loads, or the test fails.

import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  CRAFTING_SYSTEMS, buildCraftingSystem, loadCraftingSystems, craftingSummaries,
} from '../server/crafting'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)
const maybeDescribe = haveData ? describe : describe.skip

maybeDescribe('crafting catalogue', () => {
  const systems = loadCraftingSystems(DATA_DIR)

  it('every declared system resolves to real recipes', () => {
    // loadCraftingSystems drops empty systems, so an equal count proves none
    // of them pointed at a file that is missing or misnamed.
    expect(systems).toHaveLength(CRAFTING_SYSTEMS.length)
    for (const system of systems) {
      expect(system.recipeCount, `${system.key} has no recipes`).toBeGreaterThan(0)
      expect(system.slotCount, `${system.key} has no slots`).toBeGreaterThan(0)
    }
  })

  it('keys are unique and URL-safe', () => {
    const keys = CRAFTING_SYSTEMS.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]+$/)
  })

  it('links every system to an exact ddowiki page title', () => {
    // MediaWiki titles are case-sensitive past the first letter, so a link
    // built by lower-casing a system name ("Slave_Lords_crafting") 404s. These
    // are transcribed from the wiki, and the shape assertion keeps a
    // hand-edited one from silently becoming a search URL or a bare domain.
    for (const system of CRAFTING_SYSTEMS) {
      expect(system.wiki, system.key).toMatch(/^https:\/\/ddowiki\.com\/page\/[A-Za-z0-9_:'()-]+$/)
    }
  })

  it('groups a recipe under every slot type it fits', () => {
    // Cannith shards list a dozen slot types each ("this fits belts and
    // boots and trinkets…"); the planner's whole premise is asking per slot.
    const cannith = systems.find(s => s.key === 'cannith')!
    const bootsPrefix = cannith.slots.find(s => s.type === 'Cannith Boots Prefix')
    const beltSuffix = cannith.slots.find(s => s.type === 'Cannith Belt Suffix')
    expect(bootsPrefix!.recipes.length).toBeGreaterThan(0)
    expect(beltSuffix!.recipes.length).toBeGreaterThan(0)
    // Balance is a competence skill shard listed on both.
    expect(bootsPrefix!.recipes.map(r => r.name)).toContain('Balance')
    expect(beltSuffix!.recipes.map(r => r.name)).toContain('Balance')
  })

  it('keeps the per-level tables that make Cannith values plannable', () => {
    const cannith = systems.find(s => s.key === 'cannith')!
    const balance = cannith.slots
      .find(s => s.type === 'Cannith Boots Prefix')!
      .recipes.find(r => r.name === 'Balance')!
    expect(balance.scalesWithLevel).toBe(true)
    // V2 indexes these tables by item level - 1, so the table must be long
    // enough to cover the levels the planner offers.
    expect(balance.values.length).toBeGreaterThanOrEqual(34)
    // Monotonic non-decreasing: a higher item level is never worth less.
    for (let i = 1; i < balance.values.length; i++) {
      expect(balance.values[i]).toBeGreaterThanOrEqual(balance.values[i - 1])
    }
  })

  it('records the slot cascade that alchemical tiers depend on', () => {
    const alchemical = systems.find(s => s.key === 'alchemical')!
    const material = alchemical.slots.find(s => s.type === 'Legendary Alchemical Material')!
    // Picking a material is what opens tier 1 (V2 AddAugment) — without this
    // the tier slots look unreachable on the page.
    expect(material.recipes.every(r => r.unlocks.includes('Legendary Alchemical Tier 1'))).toBe(true)
  })

  it('orders tier slots the way the crafting UI walks them, not alphabetically', () => {
    const alchemical = systems.find(s => s.key === 'alchemical')!
    const types = alchemical.slots.map(s => s.type)
    expect(types.indexOf('Legendary Alchemical Material'))
      .toBeLessThan(types.indexOf('Legendary Alchemical Tier 1'))
    expect(types.indexOf('Legendary Alchemical Tier 1'))
      .toBeLessThan(types.indexOf('Legendary Alchemical Tier 2'))
  })

  it('surfaces the set bonuses Legendary Green Steel choices stamp on an item', () => {
    const lgs = systems.find(s => s.key === 'legendary-greensteel')!
    const stamped = new Set(lgs.slots.flatMap(s => s.recipes.flatMap(r => r.setBonuses)))
    // The Dominion/Escalation/Opposition family is the reason LGS is a
    // gearset-wide decision (see parityPassD6Greensteel).
    expect(stamped).toContain('Dominion')
    expect(stamped).toContain('Escalation')
    expect(stamped).toContain('Opposition')
  })

  it('summaries drop the recipe lists but keep the counts', () => {
    const summaries = craftingSummaries(systems)
    expect(summaries).toHaveLength(systems.length)
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty('slots')
      expect(summary.recipeCount).toBeGreaterThan(0)
    }
  })

  it('reports a level range for every levelled system', () => {
    const greensteel = systems.find(s => s.key === 'greensteel')!
    expect(greensteel.minLevel).toBeGreaterThan(0)
    expect(greensteel.maxLevel).toBeGreaterThanOrEqual(greensteel.minLevel!)
  })

  it('returns an empty system rather than throwing when a file is missing', () => {
    const bogus = buildCraftingSystem(DATA_DIR, {
      key: 'nope', name: 'Nope', category: 'Item upgrades',
      blurb: '', detail: '', where: '', ingredients: '', source: '',
      wiki: '', files: ['ThisFileDoesNotExist'],
    })
    expect(bogus.recipeCount).toBe(0)
    expect(bogus.slots).toEqual([])
    expect(bogus.minLevel).toBeNull()
  })
})
