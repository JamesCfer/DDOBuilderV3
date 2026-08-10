// Parity pass X13 — AddWeaponDamage drops most fields
//
// V2 ForumExportDlg.cpp:1680-1732 (AddWeaponDamage) always emits a fixed,
// unconditional scalar block: Melee Power, Doublestrike%, Strikethrough%,
// Mainhand/Offhand damage ability multiplier, Off-Hand attack Chance%,
// Fortification Bypass%, Dodge Bypass%, Helpless Damage bonus%, Ranged
// Power, Doubleshot Chance%, then (after a blank line) Sneak Attack Attack
// bonus and Sneak Attack Damage (Nd6+M) — all via AddBreakdown, which
// truncates to a whole number (`static_cast<int>(pBI->CappedTotal())`).
//
// V3's `weaponDamage` section only showed dice/crit/to-hit/damage/
// doublestrike% (content V2's export doesn't even have in this section) and
// dropped every field above. Rewritten to emit V2's exact block, reading the
// already-oracle-verified stat keys `melee.power`/`ranged.power`/
// `melee.doublestrike`/`melee.strikethrough`/`offhand.attack`/`fortBypass`/
// `helpless`/`ranged.doubleshot` (Done items #106/#137) plus the previously-
// unused `melee.damageAbilityMult`/`offhand.damageAbilityMult`/`dodgeBypass`/
// `melee.sneakAttack`/`melee.sneakDice`/`melee.sneakDamage` stat keys that
// were already parsed/computed but never surfaced in this export section.
// The per-weapon effects breakdown (BreakdownItemWeaponEffects::
// AddForumExportData) is not yet modeled in V3 and is intentionally omitted.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedBonus } from '../lib/bonus'

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

const section = DEFAULT_SECTIONS.find(s => s.id === 'WeaponDamage')!
const build = emptyBuild()

describe('Forum export weaponDamage section — full V2 scalar block (parity pass X13)', () => {
  it('section exists', () => {
    expect(section).toBeDefined()
  })

  it('emits the header and every V2 field in order, even when every stat is 0', () => {
    const stats = mockStats({})
    const lines = section.emit({ build, stats })
    expect(lines).toEqual([
      'Weapon Damage',
      '[HR][/HR]',
      'Melee Power:  0',
      'Doublestrike: 0%',
      'Strikethrough: 0%',
      'Mainhand damage ability multiplier: 0',
      'Offhand damage ability multiplier: 0',
      'Off-Hand attack Chance: 0%',
      'Fortification Bypass: 0%',
      'Dodge Bypass: 0%',
      'Helpless Damage bonus: 0%',
      'Ranged Power: 0',
      'Doubleshot Chance: 0%',
      '',
      'Sneak Attack Attack bonus: 0',
      'Sneak Attack Damage: 0d6+0',
    ])
  })

  it('reads the already-computed melee/ranged power and percent stats', () => {
    const stats = mockStats({
      'melee.power': 266, 'ranged.power': 176,
      'melee.doublestrike': 97, 'melee.strikethrough': 20,
      'offhand.attack': 20, 'fortBypass': 84, 'helpless': 68,
      'ranged.doubleshot': 49,
    })
    const lines = section.emit({ build, stats })
    expect(lines).toContain('Melee Power:  266')
    expect(lines).toContain('Ranged Power: 176')
    expect(lines).toContain('Doublestrike: 97%')
    expect(lines).toContain('Strikethrough: 20%')
    expect(lines).toContain('Off-Hand attack Chance: 20%')
    expect(lines).toContain('Fortification Bypass: 84%')
    expect(lines).toContain('Helpless Damage bonus: 68%')
    expect(lines).toContain('Doubleshot Chance: 49%')
  })

  it('truncates the damage ability multiplier and Dodge Bypass fields (V2 AddBreakdown int cast)', () => {
    const stats = mockStats({
      'melee.damageAbilityMult': 1.5, 'offhand.damageAbilityMult': 0.9, 'dodgeBypass': 12.9,
    })
    const lines = section.emit({ build, stats })
    expect(lines).toContain('Mainhand damage ability multiplier: 1')
    expect(lines).toContain('Offhand damage ability multiplier: 0')
    expect(lines).toContain('Dodge Bypass: 12%')
  })

  it('formats Sneak Attack Damage as "<dice>d6+<bonus>" from separate stat keys', () => {
    const stats = mockStats({
      'melee.sneakAttack': 5, 'melee.sneakDice': 4, 'melee.sneakDamage': 3,
    })
    const lines = section.emit({ build, stats })
    expect(lines).toContain('Sneak Attack Attack bonus: 5')
    expect(lines).toContain('Sneak Attack Damage: 4d6+3')
  })

  it('returns no lines when stats is null', () => {
    expect(section.emit({ build, stats: null })).toEqual([])
  })
})
