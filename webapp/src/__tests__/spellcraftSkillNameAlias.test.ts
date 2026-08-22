/**
 * "Spell Craft" is a valid spelling of Spellcraft everywhere in the data:
 * V2's `skillTypeMap` (SkillTypes.h:57,63) maps both it and "Spellcraft" onto
 * `Skill_SpellCraft`. V3 keys skills by the canonical display name, so the
 * unnormalised spelling silently vanished:
 *   • Arcane Trickster's `<ClassSkill>Spell Craft</ClassSkill>` meant the
 *     archetype had no Spellcraft class skill (reported by a user).
 *   • Festival: Icy Pumpkin Coffee's `<Item>Spell Craft</Item>` put its +10
 *     into a `skill.Spell Craft` bucket no breakdown reads.
 * Both data files now use the canonical spelling AND the loader/effect parser
 * normalise it, so neither can regress from a future data sync.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadClasses } from '../server/dataLoaders'
import { normalizeSkillName } from '../lib/gamedata'
import { parseEffect } from '../lib/effectParser'
import type { DDOClass, Effect } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

function toArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v]
}

describe('skill-name normalisation', () => {
  it('maps the V2 "Spell Craft" alias onto the canonical name', () => {
    expect(normalizeSkillName('Spell Craft')).toBe('Spellcraft')
    expect(normalizeSkillName('Spellcraft')).toBe('Spellcraft')
    expect(normalizeSkillName(' spell craft ')).toBe('Spellcraft')
  })

  it('leaves non-skill names (e.g. the Item="All" wildcard) alone', () => {
    expect(normalizeSkillName('All')).toBe('All')
    expect(normalizeSkillName('Use Magic Device')).toBe('Use Magic Device')
  })

  it('routes a SkillBonus effect naming "Spell Craft" to skill.Spellcraft', () => {
    const effect = {
      Type: 'SkillBonus', Bonus: 'Festive', AType: 'Simple',
      Amount: '10', Item: ['Jump', 'Spell Craft', 'Balance'],
    } as unknown as Effect
    const keys = parseEffect(effect, 1, 'Festival: Icy Pumpkin Coffee').map(b => b.statKey)
    expect(keys).toContain('skill.Spellcraft')
    expect(keys).not.toContain('skill.Spell Craft')
  })
})

describe.runIf(haveData)('Arcane Trickster class skills', () => {
  const classes = loadClasses(DATA_DIR) as DDOClass[]
  const trickster = classes.find(c => c.Name === 'Arcane Trickster')

  it('lists Spellcraft as a class skill', () => {
    expect(trickster).toBeDefined()
    expect(toArray(trickster!.ClassSkill)).toContain('Spellcraft')
  })

  it('auto-buys Spellcraft under its canonical name', () => {
    expect(toArray(trickster!.AutoBuySkill)).toContain('Spellcraft')
  })

  it('no class file leaks a non-canonical skill name', () => {
    const known = new Set(['Balance', 'Bluff', 'Concentration', 'Diplomacy', 'Disable Device',
      'Haggle', 'Heal', 'Hide', 'Intimidate', 'Jump', 'Listen', 'Move Silently', 'Open Lock',
      'Perform', 'Repair', 'Search', 'Spellcraft', 'Spot', 'Swim', 'Tumble', 'Use Magic Device'])
    for (const c of classes) {
      for (const s of toArray(c.ClassSkill)) {
        expect(known.has(s), `${c.Name} class skill "${s}"`).toBe(true)
      }
    }
  })
})
