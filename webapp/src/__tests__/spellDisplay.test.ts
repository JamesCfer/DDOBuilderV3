// What the Spells tab shows for a spell: the damage dice at this build's
// caster level, the save it allows, and the effects it grants.
//
// The damage cases below are checked against each spell's own Description
// text, which states the maximum in the data file — so the formula is being
// held to what the data itself claims, not just to itself.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Spell } from '../types/ddo'
import {
  spellDamageLines, spellSaveLines, spellEffectLines, humanizeType,
} from '../lib/spells/spellDisplay'

const fireball: Spell = {
  Name: 'Fireball',
  Description: 'Creates a ball of Fire dealing 1d6+3 per caster level (Maximum damage 10d6+30)',
  School: 'Evocation',
  MaxCasterLevel: 10,
  SpellDamage: [{
    SpellDice: { BonusDice: { Number: 1, Sides: 6, Bonus: 3 } },
    Damage: 'Fire',
    SpellPower: 'Fire',
  }],
  SpellDC: [{ DCType: 'Half Damage', DCVersus: 'Reflex' } as never],
}

const magicMissile: Spell = {
  Name: 'Magic Missile',
  MaxCasterLevel: 20,
  SpellDamage: [{
    SpellDice: { PerCasterLevels: 2, BonusDice: { Number: 1, Sides: 2, Bonus: 3 } },
    Damage: 'Force',
    SpellPower: 'Force',
  }],
}

describe('spellDamageLines', () => {
  it('scales per caster level, matching the maximum the description states', () => {
    const [line] = spellDamageLines(fireball, 10)
    expect(line.dice).toBe('1d6+3')
    expect(line.scaling).toBe('per caster level')
    expect(line.damage).toBe('Fire')
    // The data file's own text: "Maximum damage 10d6+30".
    expect(line.atCasterLevel).toBe('10d6+30')
  })

  it('scales down for a caster below the cap', () => {
    expect(spellDamageLines(fireball, 4)[0].atCasterLevel).toBe('4d6+12')
  })

  it('clamps at MaxCasterLevel rather than growing forever', () => {
    expect(spellDamageLines(fireball, 30)[0].atCasterLevel).toBe('10d6+30')
  })

  it('states how a per-N-levels spell scales but does not compute a total', () => {
    const [line] = spellDamageLines(magicMissile, 20)
    expect(line.dice).toBe('1d2+3')
    expect(line.scaling).toBe('per 2 caster levels')
    // V2's floor(CL/perLevel) gives 10 missiles at caster level 20, where the
    // game caps at 5 — so no number is shown rather than a wrong one.
    expect(line.atCasterLevel).toBeUndefined()
  })

  it('omits the spell-power chip when it just repeats the damage type', () => {
    expect(spellDamageLines(fireball, 10)[0].spellPower).toBeUndefined()
    const mixed = spellDamageLines({
      ...fireball,
      SpellDamage: [{
        SpellDice: { BonusDice: { Number: 1, Sides: 6 } },
        Damage: 'Fire', SpellPower: 'Light',
      }],
    }, 5)
    expect(mixed[0].spellPower).toBe('Light')
    expect(mixed[0].dice).toBe('1d6')          // no "+0" tail
  })

  it('adds a flat base to the per-level part (Cloudkill: 2d6 + 1 per level)', () => {
    // The data files name the flat part BaseDice, not V2's StandardDice.
    const [line] = spellDamageLines({
      Name: 'Cloudkill',
      Description: '2d6 Acid damage plus 1 damage per caster level (Maximum damage 2d6+20.)',
      MaxCasterLevel: 20,
      SpellDamage: [{
        SpellDice: { BaseDice: { Number: 2, Sides: 6 }, PerCasterLevels: 1, BonusDice: { Bonus: 1 } },
        Damage: 'Acid',
      }],
    }, 20)
    expect(line.atCasterLevel).toBe('2d6+20')
    expect(line.dice).toBe('2d6 + 1')
  })

  it('returns nothing for a spell that deals no damage', () => {
    expect(spellDamageLines({ Name: 'Feather Fall' }, 10)).toEqual([])
  })

  it('writes a negative bonus as a minus rather than "+-3"', () => {
    const [line] = spellDamageLines({
      Name: 'Odd', MaxCasterLevel: 1,
      SpellDamage: [{ SpellDice: { BonusDice: { Number: 1, Sides: 4, Bonus: -3 } }, Damage: 'Cold' }],
    }, 1)
    expect(line.dice).toBe('1d4−3')
  })
})

describe('spellSaveLines', () => {
  it('reports which save and what it does', () => {
    expect(spellSaveLines(fireball)).toEqual([{ versus: 'Reflex', effect: 'Half Damage' }])
  })

  it('skips entries with no save to make', () => {
    expect(spellSaveLines({ Name: 'X', SpellDC: [{ DCType: 'Half Damage' } as never] })).toEqual([])
    expect(spellSaveLines({ Name: 'X' })).toEqual([])
  })
})

describe('spellEffectLines', () => {
  const resistEnergy: Spell = {
    Name: 'Resist Energy',
    Effect: [{
      Type: 'EnergyResistance',
      Bonus: 'Enhancement',
      AType: 'ClassCasterLevel',
      StackSource: 'Unknown',
      // index 0 is caster level 0, so caster level 7 reads 20.
      Amount: { '#text': '0 10 10 10 10 10 10 20 20 20 30' },
      Item: ['Acid', 'Cold', 'Electric', 'Fire', 'Sonic'],
    }],
  }

  it('reads a caster-level-indexed amount at this build s caster level', () => {
    expect(spellEffectLines(resistEnergy, 1)[0].value).toBe('+10')
    expect(spellEffectLines(resistEnergy, 7)[0].value).toBe('+20')
    expect(spellEffectLines(resistEnergy, 10)[0].value).toBe('+30')
  })

  it('names the effect, its bonus type and what it applies to', () => {
    const [line] = spellEffectLines(resistEnergy, 7)
    expect(line.label).toBe('Energy Resistance')
    expect(line.bonusType).toBe('Enhancement')
    expect(line.targets).toBe('Acid, Cold, Electric, Fire, Sonic')
  })

  it('drops an "Unknown" bonus type rather than showing it as a stacking rule', () => {
    const [line] = spellEffectLines({
      Name: 'X', Effect: [{ Type: 'ACBonus', Bonus: 'Unknown', Amount: 4 }],
    }, 1)
    expect(line.bonusType).toBeUndefined()
    expect(line.value).toBe('+4')
  })

  it('handles an effect whose Type is a list of stats', () => {
    // Heroism grants attack, saves and skills from ONE effect entry, so Type
    // is an array. Calling .replace() on it threw, and with no error boundary
    // the thrown TypeError blanked the entire app — 65 spells did this,
    // including Heroism, Good Hope, Recitation and Holy Sword.
    const [line] = spellEffectLines({
      Name: 'Heroism',
      Effect: [{
        Type: ['Weapon_Attack', 'SaveBonus', 'SkillBonus'] as never,
        Bonus: 'Morale', Amount: 2,
      }],
    }, 10)
    expect(line.label).toBe('Weapon Attack, Save Bonus, Skill Bonus')
    expect(line.value).toBe('+2')
  })

  it('survives a list where a plain string is expected, without throwing', () => {
    expect(() => spellEffectLines({
      Name: 'Odd',
      Effect: [{ Type: ['PRR', 'MRR'] as never, Bonus: ['Insight'] as never, Amount: 5 }],
    }, 10)).not.toThrow()
    const [line] = spellEffectLines({
      Name: 'Odd',
      Effect: [{ Type: ['PRR', 'MRR'] as never, Bonus: ['Insight'] as never, Amount: 5 }],
    }, 10)
    expect(line.label).toBe('PRR, MRR')
    expect(line.bonusType).toBe('Insight')
  })

  it('skips an effect it cannot name at all rather than rendering a blank row', () => {
    expect(spellEffectLines({ Name: 'X', Effect: [{ Type: 7 as never, Amount: 3 }] }, 1)).toEqual([])
  })

  it('prefers an explicit DisplayName over the raw type', () => {
    expect(spellEffectLines({
      Name: 'X', Effect: [{ Type: 'AbilityBonus', DisplayName: 'Strength', Amount: 4 }],
    }, 1)[0].label).toBe('Strength')
  })

  it('returns nothing for a spell with no effects', () => {
    expect(spellEffectLines({ Name: 'Fireball' }, 10)).toEqual([])
  })
})

describe('humanizeType', () => {
  it('splits camel case and underscores into words', () => {
    expect(humanizeType('EnergyResistance')).toBe('Energy Resistance')
    expect(humanizeType('Weapon_BaseDamage')).toBe('Weapon Base Damage')
    expect(humanizeType('AC')).toBe('AC')
  })

  it('joins a list and returns empty for anything that is not text', () => {
    expect(humanizeType(['PRR', 'MRR'])).toBe('PRR, MRR')
    expect(humanizeType(undefined)).toBe('')
    expect(humanizeType(42)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// The regression this whole change started from
// ---------------------------------------------------------------------------

describe('global form styling', () => {
  const css = readFileSync(join(__dirname, '..', 'styles', 'globals.css'), 'utf-8')

  it('does not stretch tick boxes to the width of their row', () => {
    // `select, input { width: 100% }` caught checkboxes too, so the train box
    // filled the spell row and squeezed the spell name to zero width.
    const rule = css.slice(css.indexOf('select, input'))
    const block = rule.slice(0, rule.indexOf('}'))
    expect(block).toContain("input:not([type='checkbox']):not([type='radio'])")
    expect(block).toContain('width: 100%')
  })

  it('sizes tick boxes without out-ranking a component that sizes its own', () => {
    // :where() keeps the specificity at zero so panel CSS still wins.
    expect(css).toMatch(/:where\(input\[type='checkbox'\], input\[type='radio'\]\)\s*\{/)
    const block = css.slice(css.indexOf(":where(input[type='checkbox']"))
    expect(block.slice(0, block.indexOf('}'))).toContain('flex: none')
  })
})
