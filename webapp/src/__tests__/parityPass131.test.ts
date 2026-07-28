/**
 * Parity pass 131 — fuzz-corpus alignment (oracle referee over
 * Output/FuzzBuilds, 79 → 0 mismatching builds).
 *
 * Root causes fixed (each verified against the v2calc oracle):
 *  1. Identical duplicate gear effects STACK-MERGE (V2 BreakdownItem::
 *     AddEffect: one entry, amount × stacks) instead of competing
 *     Highest-Only — Epic Ring of the Buccaneer carries GoodLuck +1 Luck
 *     twice → +2 (fuzz-5099).
 *  2. Item FalseLife buffs use the ITEM's <BonusType> (Enhancement/
 *     Insightful/Quality tiers all stack: Indomitable Wrappings 12+5+2=19,
 *     fuzz-5003/5021); a buff with NO <Value1> takes the TEMPLATE's Amount
 *     (Nightforge Docent bare <FalseLife> → +10, fuzz-5020).
 *  3. Anonymous AType=Stacks effects merge by their owner's stamped name
 *     (V2 Feat::EndElement / EnhancementTreeItem::GetEffects stamp
 *     DisplayName): Shifter + Razorclaw Shifter "Shifter: Self Reliant"
 *     merge to Amount[ranks-1] (fuzz-5057), while "Past Life: Elf" vs
 *     "Past Life: Halfling" (identical anonymous tables) do NOT merge.
 *  4. V2's tree-version gate on import: spends in out-of-version trees are
 *     revoked wholesale (SpendInTree::EndElement, headless answer = No),
 *     and a trimmed legacy tree name never resolves in V2 (fuzz-5009).
 */

import { describe, it, expect } from 'vitest'
import { resolveBonus, initBonusTypes, resetBonusTypes } from '../lib/bonus'
import { parseItemBuff, parseEffect, type ItemBuffTemplate } from '../lib/effectParser'
import { importV2Build } from '../lib/v2Import'
import type { ItemBuff, Effect } from '../types/ddo'

// ---------------------------------------------------------------------------
// 1 — identical duplicate gear effects stack-merge (amount × stacks)
// ---------------------------------------------------------------------------

describe('identical duplicate gear effects (V2 AddEffect stack-merge)', () => {
  it('two identical +1 Luck entries from the SAME item merge to +2, exempt from Highest-Only', () => {
    const r = resolveBonus([
      { value: 1, type: 'Luck', source: 'Epic Ring of the Buccaneer (Ring)', fromGear: true },
      { value: 1, type: 'Luck', source: 'Epic Ring of the Buccaneer (Ring)', fromGear: true },
    ])
    expect(r.total).toBe(2)
  })

  it('same-type different-value gear effects still compete Highest-Only', () => {
    // dodge items declare <BonusType>Enhancement</BonusType> — the fix that
    // stopped every dodge item from stacking unconditionally (fuzz-5034:
    // Book-Cover Beltstrap 9 + Wildwood Gauntlets 8 → 9, not 17).
    const r = resolveBonus([
      { value: 9, type: 'Enhancement', source: 'Book-Cover Beltstrap (Belt)', fromGear: true },
      { value: 8, type: 'Enhancement', source: 'Wildwood Gauntlets (Gloves)', fromGear: true },
    ])
    expect(r.total).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// 2 — item FalseLife honors the item's BonusType / template amount
// ---------------------------------------------------------------------------

describe('item FalseLife buffs (V2 Buff::UpdatedEffects)', () => {
  it('tiered FalseLife (Enhancement/Insightful/Quality) are three stacking types', () => {
    const mk = (v: number, bt: string): ItemBuff =>
      ({ Type: 'FalseLife', Value1: v, BonusType: bt } as unknown as ItemBuff)
    const all = [
      ...parseItemBuff(mk(12, 'Enhancement'), 'belt'),
      ...parseItemBuff(mk(5, 'Insightful'), 'belt'),
      ...parseItemBuff(mk(2, 'Quality'), 'belt'),
    ]
    expect(all.map(b => b.bonusType)).toEqual(['Enhancement', 'Insightful', 'Quality'])
    const r = resolveBonus(all.map(b => ({ value: b.value, type: b.bonusType, source: b.source, fromGear: true })))
    expect(r.total).toBe(19)
  })

  it('a FalseLife buff with no Value1 falls back to the ItemBuffs.xml template amount', () => {
    const catalogue = new Map<string, ItemBuffTemplate>([
      ['FalseLife', {
        Type: 'FalseLife',
        Effect: { Type: 'FalseLife', Bonus: 'False Life', AType: 'Simple', Amount: 10 } as unknown as Effect,
      }],
    ])
    const buff = { Type: 'FalseLife', BonusType: 'Enhancement' } as unknown as ItemBuff
    const parsed = parseItemBuff(buff, 'Nightforge Docent', catalogue)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].value).toBe(10)
    // the item's BonusType stamps the template's Bonus
    expect(parsed[0].bonusType).toBe('Enhancement')
  })
})

// ---------------------------------------------------------------------------
// 3 — anonymous Stacks effects merge by the owner's stamped name
// ---------------------------------------------------------------------------

describe('anonymous AType=Stacks merge identity (V2 load-time DisplayName stamp)', () => {
  const anonEffect = {
    Type: 'SaveBonus', Bonus: 'Enhancement', AType: 'Stacks',
    Amount: '1 2 3', Item: 'Will',
  } as unknown as Effect

  it('same stamped owner name → same stackGroup (Shifter + Razorclaw "Self Reliant")', () => {
    const a = parseEffect(anonEffect, 2, 'Shifter: Shifter: Self Reliant', 0, 0, undefined, 'Shifter: Self Reliant')
    const b = parseEffect(anonEffect, 2, 'Razorclaw Shifter: Shifter: Self Reliant', 0, 0, undefined, 'Shifter: Self Reliant')
    expect(a[0].stackGroup).toBeDefined()
    expect(a[0].stackGroup).toBe(b[0].stackGroup)
  })

  it('different owners → different stackGroups (racial past lives never merge)', () => {
    const a = parseEffect(anonEffect, 3, 'Past life: Elf', 0, 0, undefined, 'Past Life: Elf')
    const b = parseEffect(anonEffect, 3, 'Past life: Halfling', 0, 0, undefined, 'Past Life: Halfling')
    expect(a[0].stackGroup).toBeDefined()
    expect(a[0].stackGroup).not.toBe(b[0].stackGroup)
  })

  it('no owner stamp and no DisplayName → no stackGroup (conservative sum)', () => {
    const parsed = parseEffect(anonEffect, 1, 'somewhere')
    expect(parsed[0].stackGroup).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 4 — V2 tree-version gate on import
// ---------------------------------------------------------------------------

function buildXml(spend: string): string {
  return `<?xml version="1.0"?>
<DDOBuilderCharacterData>
  <Character version="1">
    <ActiveLifeIndex>0</ActiveLifeIndex>
    <ActiveBuildIndex>0</ActiveBuildIndex>
    <Life version="1">
      <Name>T</Name><Race>Human</Race>
      <Build version="1">
        <Level>20</Level>
        ${spend}
      </Build>
    </Life>
  </Character>
</DDOBuilderCharacterData>`
}

describe('V2 tree-version gate (SpendInTree::EndElement, headless answer = No)', () => {
  const trees = [
    { Name: 'Ninja Spy', Version: 2 },
    { Name: 'Ninja Spy V1', Version: 1, Legacy: true },
  ]

  it('a spend whose TreeVersion mismatches the current tree is revoked', () => {
    const xml = buildXml(`<EnhancementSpendInTree>
          <TreeName>Ninja Spy</TreeName>
          <TreeVersion>1</TreeVersion>
          <TrainedEnhancement><EnhancementName>NSAcrobatic</EnhancementName><Ranks>2</Ranks></TrainedEnhancement>
        </EnhancementSpendInTree>`)
    const { build } = importV2Build(xml, { allTrees: trees })
    expect(build.enhancementChoices['Ninja Spy']).toBeUndefined()
  })

  it('a matching TreeVersion is kept', () => {
    const xml = buildXml(`<EnhancementSpendInTree>
          <TreeName>Ninja Spy</TreeName>
          <TreeVersion>2</TreeVersion>
          <TrainedEnhancement><EnhancementName>NSAcrobatic</EnhancementName><Ranks>2</Ranks></TrainedEnhancement>
        </EnhancementSpendInTree>`)
    const { build } = importV2Build(xml, { allTrees: trees })
    expect(build.enhancementChoices['Ninja Spy']).toEqual({ NSAcrobatic: 2 })
  })

  it('a TRIMMED legacy tree name never resolves in V2 (leading-space names) → revoked', () => {
    // V3-authored spend naming the legacy tree without V2's leading space
    const xml = buildXml(`<EnhancementSpendInTree>
          <TreeName>Ninja Spy V1</TreeName>
          <TreeVersion>1</TreeVersion>
          <TrainedEnhancement><EnhancementName>NSCore1</EnhancementName><Ranks>1</Ranks></TrainedEnhancement>
        </EnhancementSpendInTree>`)
    const { build } = importV2Build(xml, { allTrees: trees })
    expect(build.enhancementChoices['Ninja Spy V1']).toBeUndefined()
  })

  it('a real V2-authored legacy spend (spaced name in the raw XML) survives', () => {
    const xml = buildXml(`<EnhancementSpendInTree>
          <TreeName> Ninja Spy V1</TreeName>
          <TreeVersion>1</TreeVersion>
          <TrainedEnhancement><EnhancementName>NSCore1</EnhancementName><Ranks>1</Ranks></TrainedEnhancement>
        </EnhancementSpendInTree>`)
    const { build } = importV2Build(xml, { allTrees: trees })
    expect(build.enhancementChoices['Ninja Spy V1']).toEqual({ NSCore1: 1 })
  })

  it('without a catalogue the gate is inert (back-compat)', () => {
    const xml = buildXml(`<EnhancementSpendInTree>
          <TreeName>Ninja Spy</TreeName>
          <TreeVersion>1</TreeVersion>
          <TrainedEnhancement><EnhancementName>NSAcrobatic</EnhancementName><Ranks>2</Ranks></TrainedEnhancement>
        </EnhancementSpendInTree>`)
    const { build } = importV2Build(xml)
    expect(build.enhancementChoices['Ninja Spy']).toEqual({ NSAcrobatic: 2 })
  })
})

// keep module-level bonus state deterministic for other suites
initBonusTypes([])
resetBonusTypes()
