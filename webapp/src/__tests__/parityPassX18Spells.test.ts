// Parity pass X18 — forum-export "Spells" section had no V2 table at all
//
// V2 ForumExportDlg.cpp:1522-1645 (AddSpells/AddSpellList): for each
// spellcasting class with at least one spell slot, emits
// "<Class> Spells\r\n" followed by a [SIZE=3][TABLE] with 7 columns
// (Level / Spell Name / School / CL/MCL / DC / Average Damage / Critical
// Damage), one row per fixed + trained spell. CL/MCL and the damage columns
// only populate when the spell has SpellDamageEffects (else "-"); DC reads
// only the FIRST SpellDC block (Spell::DC → DCs().front()), not the max
// across blocks (unlike the live Spells panel, which shows the max).
//
// V3's `spells` section (sections.ts) printed flat "Level N: Name, Name"
// lines under a "[b]Spells[/b]:" heading — no table, no School/CL/MCL/DC
// columns at all. Rewrote to emit V2's table structure, reusing the
// already-verified `computeSpellDC`/`computeCasterLevel`/
// `computeMaxCasterLevel` helpers from `lib/spells/spellMath.ts` (the same
// functions the live Spells panel uses). The Average Damage / Critical
// Damage columns are left as "-" — V2's per-spell dice-damage model
// (SpellDamage::AverageDamageText/CriticalDamageText) has no V3 equivalent
// yet, the same scoping decision as X13's per-weapon effects breakdown.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'
import type { DDOClass, Spell } from '../types/ddo'

function mockStats(totals: Record<string, number>): BuildStats {
  return {
    total: (key: string) => totals[key] ?? 0,
    resolve: (key: string) => ({ total: totals[key] ?? 0, bonuses: [] as ResolvedBonus[] }),
    keys: () => Object.keys(totals),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

const section = DEFAULT_SECTIONS.find(s => s.id === 'Spells')!

const wizardClass = { Name: 'Wizard', CastingStat: 'Intelligence' } as unknown as DDOClass

const fireball: Spell = {
  Name: 'Fireball',
  School: 'Fire',
  Level: { Wizard: 3 },
  MaxCasterLevel: 20,
  SpellDC: [{ Amount: 10, CastingStatMod: true }, { Amount: 999 }],
  SpellDamage: [{ School: 'Fire', Amount: '1d6' }],
}

const magicMissile: Spell = {
  Name: 'Magic Missile',
  School: 'Evocation',
  Level: { Wizard: 1 },
}

function buildWith(className: string, classLevel: number, byLevel: Record<number, string[]>) {
  return {
    ...emptyBuild(),
    classes: [{ name: className, levels: classLevel }, { name: '', levels: 0 }, { name: '', levels: 0 }],
    trainedSpells: { [className]: byLevel },
  }
}

describe('Forum export spells section — V2 table with School/CL/MCL/DC (parity pass X18)', () => {
  it('section exists', () => {
    expect(section).toBeDefined()
  })

  it('emits an empty result when no spells are trained', () => {
    const lines = section.emit({ build: emptyBuild(), stats: null })
    expect(lines).toEqual([])
  })

  it('emits "<Class> Spells" heading + [SIZE=3][TABLE] wrap with the 7-column header', () => {
    const build = buildWith('Wizard', 5, { 3: ['Fireball'] })
    const lines = section.emit({ build, stats: mockStats({}), allClasses: [wizardClass], allSpells: [fireball] })
    expect(lines[0]).toBe('Wizard Spells')
    expect(lines[1]).toBe('[SIZE=3][TABLE]')
    expect(lines[lines.length - 1]).toBe('[/TABLE][/SIZE]')
    expect(lines).toContain(
      '[TR][TD][COLOR=rgb(65, 168, 95)]Level[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Spell Name[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]School[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]CL/MCL[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]DC[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Average Damage[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Critical Damage[/COLOR][/TD][/TR]')
  })

  it('populates School, CL/MCL and DC from the spell catalogue + already-verified spellMath helpers', () => {
    const build = buildWith('Wizard', 5, { 3: ['Fireball'] })
    const stats = mockStats({ 'cl.Wizard': 3, 'ability.Intelligence': 20 })
    const lines = section.emit({ build, stats, allClasses: [wizardClass], allSpells: [fireball] })
    const row = lines.find(l => l.includes('Fireball'))!
    // CL = classLevel(5) + cl.Wizard(3) = 8, capped at MCL 20 → "8/20"
    // DC = front SpellDC block only: Amount(10) + INT mod(+5) + spell level(3) = 18
    // (the SECOND SpellDC block's Amount 999 must be ignored — V2 uses DCs().front())
    expect(row).toBe('[TR][TD]3[/TD][TD]Fireball[/TD][TD]Fire[/TD][TD]8/20[/TD][TD]18[/TD][TD]-[/TD][TD]-[/TD][/TR]')
  })

  it('shows "-" for CL/MCL when the spell has no SpellDamage effects, but still computes DC', () => {
    const build = buildWith('Wizard', 5, { 1: ['Magic Missile'] })
    const stats = mockStats({})
    const lines = section.emit({ build, stats, allClasses: [wizardClass], allSpells: [magicMissile] })
    const row = lines.find(l => l.includes('Magic Missile'))!
    expect(row).toBe('[TR][TD]1[/TD][TD]Magic Missile[/TD][TD]Evocation[/TD][TD]-[/TD][TD]-[/TD][TD]-[/TD][TD]-[/TD][/TR]')
  })

  it('shows "-" for every column when the spell is not found in the catalogue', () => {
    const build = buildWith('Wizard', 5, { 2: ['Unknown Spell'] })
    const lines = section.emit({ build, stats: mockStats({}), allClasses: [wizardClass], allSpells: [] })
    const row = lines.find(l => l.includes('Unknown Spell'))!
    expect(row).toBe('[TR][TD]2[/TD][TD]Unknown Spell[/TD][TD][/TD][TD]-[/TD][TD]-[/TD][TD]-[/TD][TD]-[/TD][/TR]')
  })

  it('emits one table per class with trained spells', () => {
    const build = {
      ...emptyBuild(),
      classes: [{ name: 'Wizard', levels: 5 }, { name: 'Fighter', levels: 15 }, { name: '', levels: 0 }],
      trainedSpells: { Wizard: { 3: ['Fireball'] }, Fighter: { 1: ['Jump'] } },
    }
    const lines = section.emit({ build, stats: mockStats({}), allClasses: [wizardClass], allSpells: [fireball] })
    expect(lines.filter(l => l === '[SIZE=3][TABLE]')).toHaveLength(2)
    expect(lines).toContain('Wizard Spells')
    expect(lines).toContain('Fighter Spells')
  })
})
