// Spell power table row math (Analysis panel "Spell Powers").
//
// Regression: the Crit × column used to be hardcoded at ×1.5, so spell
// critical damage from gear (augments, set bonuses, filigrees) never moved
// it. Crit % likewise carried a phantom +5 base V2 does not have.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { spellPowerRowValues } from '../lib/spellPowerRow'
import type { SpellPowerStatSource } from '../lib/spellPowerRow'
import type { ResolvedBonus } from '../lib/bonus'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import { findActiveLife } from '../lib/multiLife'
import type { Item } from '../types/ddo'

// ---------------------------------------------------------------------------
// Pure math, against a hand-rolled stat source
// ---------------------------------------------------------------------------

function fakeStats(totals: Record<string, number>): SpellPowerStatSource {
  return {
    total: (k: string) => totals[k] ?? 0,
    resolve: (k: string) => ({
      bonuses: totals[k] === undefined
        ? []
        : [{ value: totals[k], type: 'Equipment', source: k, active: true } as ResolvedBonus],
    }),
  }
}

describe('spellPowerRowValues', () => {
  it('folds universal power / lore / crit damage into the concrete type', () => {
    const r = spellPowerRowValues(fakeStats({
      'sp.Force': 300, 'sp.Universal': 100,
      'spCrit.Force': 14, 'spCrit.Universal': 16,
      'spCritDmg.Force': 45, 'spCritDmg.Universal': 5, 'spCritDmg.All': 15,
    }), 'Force')

    expect(r.power).toBe(400)
    expect(r.critChance).toBe(30)          // no phantom +5 base (V2 SpellDamage.cpp:59)
    expect(r.critMultiplier).toBeCloseTo(2.65, 5)  // 2 + 65/100
  })

  it('is ×2 with no spell critical damage at all', () => {
    const r = spellPowerRowValues(fakeStats({}), 'Fire')
    expect(r.critChance).toBe(0)
    expect(r.critMultiplier).toBe(2)
    expect(r.critChanceBonuses).toEqual([])
  })

  it('lists every crit-multiplier source, base first, in percentage points', () => {
    const r = spellPowerRowValues(fakeStats({
      'spCritDmg.Force': 45, 'spCritDmg.All': 15,
    }), 'Force')
    expect(r.critMultiplierBonuses.map(b => b.value)).toEqual([200, 45, 15])
    // Tooltip footer sums the rows: it must read as critMultiplier × 100.
    const total = r.critMultiplierBonuses.filter(b => b.active).reduce((s, b) => s + b.value, 0)
    expect(total).toBe(Math.round(r.critMultiplier * 100))
  })

  // N15 (PARITY_TODO): V2 BreakdownItemSpellPower::ReplacementTotal lets a
  // trained "Infernal Sovereign" style effect use the higher of two elemental
  // spell powers. Tiefling trains this as a pair of Acid<->Fire markers.
  it('substitutes a higher alternate spell power when a replacement marker is present (N15)', () => {
    const r = spellPowerRowValues(fakeStats({
      'sp.Acid': 20, 'sp.Fire': 120, 'sp.Universal': 10,
      'spellPowerReplacement.Acid.Fire': 1,
    }), 'Acid')
    // V2: max(Acid, Fire) + Universal = max(20, 120) + 10 = 130, not 20+10=30.
    expect(r.power).toBe(130)
  })

  it('keeps its own spell power when no alternate is higher', () => {
    const r = spellPowerRowValues(fakeStats({
      'sp.Acid': 200, 'sp.Fire': 20, 'sp.Universal': 10,
      'spellPowerReplacement.Acid.Fire': 1,
    }), 'Acid')
    expect(r.power).toBe(210)
  })

  it('ignores an alternate with no replacement marker trained', () => {
    const r = spellPowerRowValues(fakeStats({
      'sp.Acid': 20, 'sp.Fire': 120, 'sp.Universal': 10,
    }), 'Acid')
    expect(r.power).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// End to end: a real gear set must move both columns
// ---------------------------------------------------------------------------

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'collection', 'Magic missile healer.DDOBuild')
const haveData = existsSync(DATA_DIR) && existsSync(FIXTURE)

describe.runIf(haveData)('spell crit from gear', () => {
  it('gear-sourced spell critical chance and damage reach the row values', () => {
    const cat = loadAllCatalogues(DATA_DIR)
    initBonusTypes(cat.allBonusTypes)
    const { build, document } = importV2Build(readFileSync(FIXTURE, 'utf-8')) as any

    const gearItems: Record<string, Item> = {}
    for (const [slot, name] of Object.entries(build.gear as Record<string, string>)) {
      const item = name ? cat.allItems.find(i => i.Name === name) : undefined
      if (item) gearItems[slot] = item
    }

    const stats = computeBuildStats({
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs,
      specialFeats: document ? findActiveLife(document)?.specialFeats : undefined,
      gearItems,
    }, build)

    // Every spell power type this build carries crit damage on must report a
    // multiplier above the ×2 floor — the hardcoded 1.5 could not.
    const withCritDamage = stats.keys()
      .filter(k => k.startsWith('spCritDmg.'))
      .map(k => k.slice('spCritDmg.'.length))
      .filter(k => k !== 'Universal' && k !== 'All')
    expect(withCritDamage.length).toBeGreaterThan(0)

    for (const spKey of withCritDamage) {
      const r = spellPowerRowValues(stats, spKey)
      expect(r.critMultiplier).toBeGreaterThan(2)
      expect(r.critMultiplierBonuses.length).toBeGreaterThan(1)
    }
  })
})
