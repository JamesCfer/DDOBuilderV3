import { describe, expect, it } from 'vitest'
import {
  parseEffectText, findRolls, readTrigger, readChance, readIcd,
  readStackCap, readDotTiming, readVulnerability, isOutgoingDamage, stripLabel,
} from '../lib/combat/procText'
import { catalogLookup, isIgnored } from '../lib/combat/procCatalog'

// Effect prose below is quoted verbatim from Output/DataFiles/ItemBuffs.xml so
// the parser is tested against what the app actually ships.

describe('stripLabel', () => {
  it('removes the effect name DDO prefixes onto every description', () => {
    expect(stripLabel('Frostbite: On Hit: 1d6 cold damage.', 'Frostbite'))
      .toBe('On Hit: 1d6 cold damage.')
  })

  it('leaves prose alone when there is no label', () => {
    expect(stripLabel('On Hit: 1d6 cold damage.', 'Nothing')).toBe('On Hit: 1d6 cold damage.')
  })
})

describe('findRolls', () => {
  it('reads dice notation', () => {
    expect(findRolls('6d6 Evil damage')[0]).toMatchObject({ dice: 6, sides: 6, flat: 0 })
  })

  it('reads a dice expression with a flat addend', () => {
    expect(findRolls('30d3 + 90 electric damage')[0])
      .toMatchObject({ dice: 30, sides: 3, flat: 90 })
  })

  it('converts a stated range into a die that reproduces it', () => {
    // "85 to 195" spans 111 values starting at 85: 1d111 + 84.
    const r = findRolls('85 to 195 Fire Damage')[0]
    expect(r).toMatchObject({ dice: 1, sides: 111, flat: 84 })
    expect(r.flat + 1).toBe(85)
    expect(r.flat + r.sides).toBe(195)
  })

  it('ignores counts that are not damage', () => {
    expect(findRolls('adds 1-5 stacks of Vulnerability')).toHaveLength(0)
    expect(findRolls('stacks up to 20 times')).toHaveLength(0)
  })

  it('drops ability damage, which is not hit-point damage', () => {
    expect(findRolls('dealing 1d8 Constitution damage')).toHaveLength(0)
    expect(findRolls('deals 3d6 Constitution damage to the target')).toHaveLength(0)
  })

  it('keeps real damage in prose that also mentions ability damage', () => {
    const rolls = findRolls('10d6 poison damage every 2 seconds for 6 seconds. ' +
      'When the poison wears off, it also deals 3d6 Constitution damage to the target.')
    expect(rolls).toHaveLength(1)
    expect(rolls[0]).toMatchObject({ dice: 10, sides: 6 })
  })
})

describe('readTrigger', () => {
  it('separates vorpal from ordinary crits', () => {
    expect(readTrigger('On Vorpal: 85 to 195 Fire Damage')).toBe('natural 20')
    expect(readTrigger('On critical hits it will transfer the disease')).toBe('crit')
    expect(readTrigger('On Hit: 6d6 Evil damage')).toBe('hit')
  })
})

describe('readChance', () => {
  it('prefers a stated percentage', () => {
    expect(readChance('2% Chance to do 300 to 500 damage')).toEqual({ chance: 2, exact: true })
  })

  it('maps DDO adjectives onto estimates and flags them as inexact', () => {
    expect(readChance('a high chance to deal very strong fire damage'))
      .toEqual({ chance: 50, exact: false })
    expect(readChance('a small chance to deal massive fire damage'))
      .toEqual({ chance: 5, exact: false })
    expect(readChance('Occasionally, this power comes to the surface'))
      .toEqual({ chance: 10, exact: false })
  })

  it('treats an unconditional clause as firing every time', () => {
    expect(readChance('On Hit: 6d6 Evil damage')).toEqual({ chance: 100, exact: true })
  })
})

describe('readIcd', () => {
  it('reads a stated internal cooldown', () => {
    expect(readIcd('This can only proc once every 10 seconds.')).toBe(10)
    expect(readIcd('On Hit: 6d6 Evil damage')).toBe(0)
  })
})

describe('readStackCap', () => {
  it('reads digits and spelled-out counts', () => {
    expect(readStackCap('can stack up to 15 times')).toBe(15)
    expect(readStackCap('The effect can be stacked up to 3 times.')).toBe(3)
    expect(readStackCap('inflict ten stacks of Cold damage')).toBe(10)
  })

  it('defaults to a single stack', () => {
    expect(readStackCap('On Hit: 6d6 Evil damage')).toBe(1)
  })
})

describe('readDotTiming', () => {
  it('reads adjacent tick and duration clauses', () => {
    expect(readDotTiming('every 2 seconds for 10 seconds')).toEqual({ tick: 2, dur: 10 })
  })

  it('reads spelled-out numbers', () => {
    expect(readDotTiming('1d6 damage every two seconds for a duration of twelve seconds'))
      .toEqual({ tick: 2, dur: 12 })
  })

  it('finds a duration stated separately from the tick', () => {
    expect(readDotTiming('5d10 damage per stack every two seconds, lasts for 20 seconds'))
      .toEqual({ tick: 2, dur: 20 })
  })

  it('returns null for prose with no timing at all', () => {
    expect(readDotTiming('On Hit: 6d6 Evil damage')).toBeNull()
  })
})

describe('readVulnerability', () => {
  it('reads the standard Vulnerable clause', () => {
    const v = readVulnerability(
      'On Hit: Applies a stack of Vulnerable (1% more damage for 3 seconds. ' +
      'This effect stacks up to 20 times, and loses one stack on expiry.)',
    )
    expect(v).toMatchObject({ value: 1, cap: 20, decay: 3, stacks: 1, decayAll: false })
  })

  it('averages a stated range of applied stacks', () => {
    const v = readVulnerability('On Vorpal: 85 to 195 Fire Damage every 2 seconds ' +
      'for 10 seconds, and adds 1-5 stacks of Vulnerability.')
    expect(v?.stacks).toBe(3)
    // The "for 10 seconds" belongs to the DoT, not to the debuff.
    expect(v?.decay).toBe(3)
  })

  it('ignores a passing mention of the word vulnerable', () => {
    expect(readVulnerability(
      'inflicting a bleed effect on targets vulnerable to bleeding. ' +
      'This bleed deals 5d10 damage per stack every two seconds.',
    )).toBeNull()
  })
})

describe('isOutgoingDamage', () => {
  it('rejects guards and retaliation', () => {
    expect(isOutgoingDamage('Acid Guard VIII')).toBe(false)
    expect(isOutgoingDamage('When Hit in Melee: Deals 8 to 32 Acid damage to your attacker.')).toBe(false)
    expect(isOutgoingDamage('When hit or missed in combat, the attacking creature takes 8d8 Evil damage.')).toBe(false)
  })

  it('rejects self-healing and shield bashes', () => {
    expect(isOutgoingDamage('On Hit: You are healed for 3d2 hit points.')).toBe(false)
    expect(isOutgoingDamage('does an additional 1d6 damage when used to shield bash')).toBe(false)
  })

  it('accepts ordinary on-hit damage', () => {
    expect(isOutgoingDamage('On Hit: 6d6 Evil damage')).toBe(true)
  })
})

describe('parseEffectText', () => {
  it('reads a plain on-hit proc', () => {
    const r = parseEffectText(
      '1st Litany',
      'First Litany of the Crimson Covenant: On Hit: 6d6 Evil damage and 6d8 bleeding damage.',
    )
    expect(r.procs).toHaveLength(2)
    expect(r.procs[0]).toMatchObject({ trigger: 'hit', dice: 6, sides: 6, tag: 'evil' })
    expect(r.procs[1]).toMatchObject({ dice: 6, sides: 8, tag: 'bleed' })
    expect(r.exact).toBe(true)
  })

  it('reads a vorpal DoT together with the vulnerability it applies', () => {
    const r = parseEffectText(
      '3rd Degree Burns',
      '3rd Degree Burns: On Vorpal: 85 to 195 Fire Damage every 2 seconds for 10 seconds, ' +
      'and adds 1-5 stacks of Vulnerability.',
    )
    expect(r.procs).toHaveLength(0)
    expect(r.dots).toHaveLength(1)
    expect(r.dots[0]).toMatchObject({ trigger: 'natural 20', tick: 2, dur: 10, tag: 'fire' })
    expect(r.debuffs).toHaveLength(1)
    expect(r.debuffs[0]).toMatchObject({ target: 'vulnerability', stacks: 3 })
  })

  it('reads a stacking bleed with its real cap and duration', () => {
    const r = parseEffectText(
      'Glass Shards',
      'Glass Shards: This weapon is made of fragile glass and will shatter on impact, ' +
      'inflicting a bleed effect on targets vulnerable to bleeding. This bleed deals 5d10 ' +
      'damage per stack every two seconds, lasts for 20 seconds, and can stack up to 15 times.',
    )
    expect(r.dots).toHaveLength(1)
    expect(r.dots[0]).toMatchObject({ dice: 5, sides: 10, tick: 2, dur: 20, cap: 15, tag: 'bleed' })
    // "targets vulnerable to bleeding" is not an application of Vulnerable.
    expect(r.debuffs).toHaveLength(0)
  })

  it('takes the damage element from the effect name when the prose omits it', () => {
    const r = parseEffectText('Forged Lightning', 'Forged Lightning: On Hit: 2% Chance to do 300 to 500 damage in a blast radius.')
    expect(r.procs[0]).toMatchObject({ chance: 2, tag: 'electric' })
  })

  it('produces nothing for a guard', () => {
    const r = parseEffectText(
      'Disease Guard',
      'Disease Guard: This item carries the Maggot Plague disease, which deals 1d6 ' +
      'Constitution damage and may be contracted by enemies that hit you.',
    )
    expect(r.procs).toHaveLength(0)
    expect(r.dots).toHaveLength(0)
    expect(r.debuffs).toHaveLength(0)
  })

  it('produces nothing for an effect that only deals ability damage', () => {
    const r = parseEffectText(
      'DemonFever',
      'Demon Fever: On critical hits it will transfer the disease to enemies, ' +
      'dealing 1d8 Constitution damage.',
    )
    expect(r.procs).toHaveLength(0)
  })

  it('produces nothing when there is no description', () => {
    expect(parseEffectText('Anything', '').procs).toHaveLength(0)
  })
})

describe('procCatalog', () => {
  // Numbers below are quoted from DDO wiki, which is where the game's own data
  // files say nothing. See the source list at the top of procCatalog.ts.

  it('covers Dripping with Magma, which ships no numbers at all', () => {
    const text = 'Dripping with Magma: This Obsidian weapon drips with magma on every swing. ' +
      'Your attacks have a high chance to deal very strong fire damage over time.'
    // The text parser can find nothing to read.
    expect(parseEffectText('Dripping with Magma', text).dots).toHaveLength(0)

    const c = catalogLookup('Dripping with Magma', text)
    expect(c).not.toBeNull()
    expect(c!.dots).toHaveLength(1)
    // "Max 5 stacks of 10d20 fire damage with 5 seconds duration", ticking on
    // application and every 4s, dropping all stacks at once, 1s cooldown.
    expect(c!.dots[0]).toMatchObject({
      trigger: 'hit', tag: 'fire',
      dice: 10, sides: 20, cap: 5, dur: 5, tick: 4, icd: 1, decayAll: true,
    })
    expect(c!.confidence).toBe('exact')
    expect(c!.note).toMatch(/DDO wiki/)
  })

  it('gives every Magma-Like effect the same shape and its own element', () => {
    const family: Array<[string, string]> = [
      ['Lingering Acidic Burn', 'acid'],
      ['Bitter Frostbite', 'cold'],
      ['Grip of Venom', 'poison'],
      ['Lightning Lash', 'electric'],
      ['Rupturing Echo', 'sonic'],
      ['Rippling Energy', 'force'],
    ]
    for (const [name, tag] of family) {
      const c = catalogLookup(name, `${name}: high chance to deal very strong ${tag} damage over time.`)
      expect(c?.dots[0]?.tag, name).toBe(tag)
      expect(c?.dots[0], name).toMatchObject({ dice: 10, sides: 20, cap: 5, dur: 5, tick: 4 })
    }
  })

  it('matches effect names regardless of DDO’s inconsistent spacing', () => {
    // The game data ships "GreaterSunburst" and "MagmaSurge" without spaces.
    expect(catalogLookup('GreaterSunburst', 'nova of light')).not.toBeNull()
    expect(catalogLookup('Greater Sunburst', 'nova of light')).not.toBeNull()
    expect(catalogLookup('MagmaSurge', 'superheated magma')).not.toBeNull()
  })

  it('uses the tested proc rate and dice for Greater Sunburst', () => {
    // Wiki: "Tested Proc Rate: 2.00% ... Damage Formula: 10d10+200",
    // sample size 136,385.
    const c = catalogLookup('GreaterSunburst', 'unleashing a nova of light')
    expect(c!.procs[0]).toMatchObject({ chance: 2, dice: 10, sides: 10, flat: 200, tag: 'light' })
  })

  it('gives Greater Incineration twice the base proc rate, same dice', () => {
    const prose = 'Occasionally, this destructive power comes to the surface.'
    const base = catalogLookup('Incineration', prose)!
    const greater = catalogLookup('GreaterIncineration', prose)!
    // Wiki: 2% of 200+8d20; Greater is "dealt twice as often".
    expect(base.procs[0]).toMatchObject({ chance: 2, dice: 8, sides: 20, flat: 200 })
    expect(greater.procs[0]).toMatchObject({ chance: 4, dice: 8, sides: 20, flat: 200 })
  })

  it('models the shockwaves as vorpal procs at their documented dice', () => {
    const s = catalogLookup('Shockwave', 'On Vorpal, this weapon triggers a Shockwave')!
    expect(s.procs[0]).toMatchObject({ trigger: 'natural 20', dice: 20, sides: 3, flat: 60 })
    const l = catalogLookup('Legendary Whelming Shockwave', 'On Vorpal')!
    expect(l.procs[0]).toMatchObject({ trigger: 'natural 20', dice: 100, sides: 10, flat: 600 })
  })

  it('models Magma Surge as a DoT with its real tick schedule', () => {
    // Wiki: "2% chance of activating, 3d20+40 fire damage for 4 tics
    // (1 per 2 seconds over 8 seconds)".
    const c = catalogLookup('MagmaSurge', 'superheated magma occasionally surges')!
    expect(c.dots[0]).toMatchObject({
      chance: 2, dice: 3, sides: 20, perTick: 40, tick: 2, dur: 8, tag: 'fire',
    })
  })

  it('scales Vile Grip by tier and tolerates the truncated data-file name', () => {
    // Wiki: "1% for 10d44 of evil damage" / "1% for 10d440 of evil damage".
    // ItemBuffs.xml stores the base one as "Vile Grip of the Hidden".
    const base = catalogLookup('Vile Grip of the Hidden', 'massive evil damage')!
    expect(base.procs[0]).toMatchObject({ chance: 1, dice: 10, sides: 44, tag: 'evil' })
    const leg = catalogLookup('Legendary Vile Grip of the Hidden Hand', 'massive evil damage')!
    expect(leg.procs[0]).toMatchObject({ chance: 1, dice: 10, sides: 440, tag: 'evil' })
  })

  it('reproduces a stated damage range as a die spanning it', () => {
    // Wiki: Legendary Steam is "[15%] chance ... [70-120, ~86 average]".
    const c = catalogLookup('Legendary Steam', 'chance to deal Untyped damage')!
    const p = c.procs[0]
    expect(p.chance).toBe(15)
    expect(p.flat + 1).toBe(70)
    expect(p.flat + p.sides).toBe(120)
    // Bracketed wiki measurements are not datamined figures.
    expect(c.confidence).toBe('estimated')
  })

  it('keeps a lower-bound figure flagged as estimated', () => {
    // The wiki only says Alchemical Water Attunement is "at least 1d60".
    const c = catalogLookup('AlchemicalWaterAttunement', 'ten stacks of cold damage over time')!
    expect(c.confidence).toBe('estimated')
    expect(c.note).toMatch(/lower bound/)
  })

  it('returns null for effects the wiki does not document, rather than guessing', () => {
    // Neither of these has a published damage figure; they must surface in the
    // panel's "not modelled" list instead of being invented.
    expect(catalogLookup('Overwhelming Incineration', 'overwhelming fire damage')).toBeNull()
    expect(catalogLookup('Legendary Magma Surge', 'inflicting massive fire damage over time')).toBeNull()
  })

  it('ignores effects that are not damage you deal', () => {
    expect(isIgnored('Auto-Repair')).toBe(true)
    expect(isIgnored('Lesser Vampirism')).toBe(true)
    expect(isIgnored('RiposteRiposte')).toBe(true)
    // 5d6 Constitution damage is ability damage, not hit points.
    expect(isIgnored('Legendary Virulent Poison')).toBe(true)
    expect(isIgnored('Dripping with Magma')).toBe(false)
  })
})
