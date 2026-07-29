/**
 * Section E parity — item Buff template resolution.
 *
 * V2 source: DDOBuilder/Item.cpp:452-506 (Item::FindEffect / Item::BuffValue)
 *            DDOBuilder/Buff.cpp:164-249  (Buff::UpdatedEffects)
 *
 * An equipped item's <Buff> only carries a Type (a name) plus Value1/BonusType.
 * The real stat effects live in the ItemBuffs.xml template whose <Effect> list
 * has Amount/Bonus placeholders. V2 resolves the template via FindBuff(Type)
 * and stamps the item's Value1 -> effect Amount and BonusType -> effect Bonus
 * (UpdatedEffects). V3 previously dropped every flavour-named Type via the
 * direct switch's `default: return []`; parseItemBuff now falls back to the
 * supplied template catalogue, mirroring V2.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { parseItemBuff, type ItemBuffTemplate } from '../lib/effectParser'
import { loadItemBuffs } from '../server/dataLoaders'
import type { ItemBuff } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

describe('parseItemBuff template resolution (synthetic catalogue)', () => {
  // A template whose single effect is a PRR placeholder (Amount 0, Bonus unset).
  const catalogue = new Map<string, ItemBuffTemplate>([
    ['PhysicalSheltering', {
      Type: 'PhysicalSheltering',
      Effect: { Type: 'PRR', Bonus: 'Not Set', AType: 'Simple', Amount: 0 },
    }],
    // A template with two effects, exercising the bonus/amount stamping on each.
    ['DualSpellPower', {
      Type: 'DualSpellPower',
      Effect: [
        { Type: 'SpellPower', Bonus: 'Not Set', AType: 'Simple', Amount: 0, Item: 'Fire' },
        { Type: 'SpellPower', Bonus: 'Not Set', AType: 'Simple', Amount: 0, Item: 'Cold' },
      ],
    }],
    // A cosmetic template (no Effect) — must resolve to nothing.
    ['Vampirism', { Type: 'Vampirism' }],
  ])

  it('stamps Value1 -> Amount and BonusType -> Bonus onto the template effect', () => {
    // V2 Buff::UpdatedEffects: Value1 overrides Amount, BonusType overrides Bonus.
    const buff: ItemBuff = { Type: 'PhysicalSheltering', Value1: 30, BonusType: 'Enhancement' }
    const res = parseItemBuff(buff, 'Helm', catalogue)
    expect(res).toEqual([
      // v2Name carries the merge identity (source::buffType) so effects born
      // from different buff templates never stack-merge (V2 Effect::operator==).
      { statKey: 'prr', value: 30, bonusType: 'Enhancement', source: 'Helm', percent: false, asItemEffect: false, v2Name: 'Helm::PhysicalSheltering' },
    ])
  })

  it('applies Value1 to every effect of a multi-effect template (no Value2)', () => {
    // ItemBuff carries no Value2, so the even/odd split collapses to Value1-on-all.
    const buff: ItemBuff = { Type: 'DualSpellPower', Value1: 50, BonusType: 'Equipment' }
    const res = parseItemBuff(buff, 'Robe', catalogue)
    expect(res.map(r => [r.statKey, r.value, r.bonusType])).toEqual([
      ['sp.Fire', 50, 'Equipment'],
      ['sp.Cold', 50, 'Equipment'],
    ])
  })

  it('resolves a cosmetic (effect-less) template to no bonuses', () => {
    expect(parseItemBuff({ Type: 'Vampirism', Value1: 3 }, 'Sword', catalogue)).toEqual([])
  })

  it('still returns [] for an unknown Type with no catalogue supplied', () => {
    expect(parseItemBuff({ Type: 'PhysicalSheltering', Value1: 30 }, 'Helm')).toEqual([])
  })

  it('directly-handled Types bypass the catalogue (no double processing)', () => {
    // Strength is handled by the direct switch; the catalogue must not interfere.
    const res = parseItemBuff({ Type: 'Strength', Value1: 8, BonusType: 'Enhancement' }, 'Belt', catalogue)
    expect(res).toEqual([
      { statKey: 'ability.Strength', value: 8, bonusType: 'Enhancement', source: 'Belt', percent: false },
    ])
  })
})

describe.runIf(haveData)('parseItemBuff template resolution (real ItemBuffs.xml)', () => {
  it('resolves PhysicalSheltering -> prr and MagicalSheltering -> mrr from the live catalogue', () => {
    const cat = new Map<string, ItemBuffTemplate>(
      loadItemBuffs(DATA_DIR).map(b => [b.Type, b as ItemBuffTemplate]),
    )
    const prr = parseItemBuff({ Type: 'PhysicalSheltering', Value1: 30, BonusType: 'Enhancement' }, 'x', cat)
    expect(prr.some(r => r.statKey === 'prr' && r.value === 30)).toBe(true)

    const mrr = parseItemBuff({ Type: 'MagicalSheltering', Value1: 25, BonusType: 'Enhancement' }, 'x', cat)
    expect(mrr.some(r => r.statKey === 'mrr' && r.value === 25)).toBe(true)
  })
})
