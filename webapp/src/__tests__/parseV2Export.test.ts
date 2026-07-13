// Tests for the V2 forum-export text parser.
//
// The fixtures below are hand-crafted to match EXACTLY what
// DDOBuilder/ForumExportDlg.cpp emits (fixed-width std::setw columns, CRLF
// line endings, [TABLE] blocks that start on the same line as the first
// [TR]). Line references in comments point at the V2 emitter code.

import { describe, it, expect } from 'vitest'
import { parseV2Export } from '../lib/export/parseV2Export'

// ---------------------------------------------------------------------------
// Fixture 1: vitals block (AddCharacterHeader :311-391, AddAbilityValues
// :530-548, AddBreakdown :576-619). MRR uses the capped "N/M" form
// (:584-596); Dodge always renders "N/M" with no % (:363-372).
// ---------------------------------------------------------------------------
const VITALS_CAPPED = [
  'Character name: Fuzz Test',
  'Classes: 20 Fighter',
  'Race: Human                Alignment: Lawful Good',
  '',
  '     Start Tome Final      HP:       1234      Displacement:    0%',
  'Str:     8    0    20      Unc Rng:   -10      Incorp:          0%',
  'Dex:    15    4    28      PRR:        63      AC:              57',
  'Con:    16    4    30      MRR:     70/60      +Healing Amp:   120',
  'Int:    18    6    34      Dodge:   12/25      -Healing Amp:     0',
  'Wis:    10    2    16      Fort:     150%      Repair Amp:       0',
  'Cha:     8    0    10      SR:          0      BAB:             20',
  'DR: 10/Adamantine',
  'Immunities: Fear, Natural Poison',
  '',
].join('\r\n')

// Same block but with the uncapped single-number MRR form (:597-603).
const VITALS_UNCAPPED = [
  '     Start Tome Final      HP:        512      Displacement:   25%',
  'Str:    18    8    45      Unc Rng:   -20      Incorp:         10%',
  'Dex:     8    0    14      PRR:       120      AC:              81',
  'Con:    14    8    38      MRR:        45      +Healing Amp:    64',
  'Int:     8    0    12      Dodge:    3/25      -Healing Amp:   100',
  'Wis:     8    0    10      Fort:     203%      Repair Amp:      50',
  'Cha:    10    4    22      SR:         34      BAB:             25',
].join('\r\n')

// ---------------------------------------------------------------------------
// Fixture 2: saves [TABLE] (AddSaves :509-528 + AddTableEntryBreakdown
// :550-574: "[TABLE]" is immediately followed by the first [TR] with no
// newline, values are width-3 space-filled, "*" marks no-fail-on-1, and the
// "vs Disease     " sub label carries V2's literal trailing spaces :515).
// ---------------------------------------------------------------------------
const SAVES = [
  'Saves:',
  '[TABLE][TR][TD]Fortitude[/TD][TD][/TD][TD] 45[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Poison[/TD][TD] 49*[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Disease     [/TD][TD] 45[/TD][/TR]',
  '[TR][TD]Will[/TD][TD][/TD][TD] 30*[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Enchantment[/TD][TD] 34[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Illusion[/TD][TD] 30[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Fear[/TD][TD] 32[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Curse[/TD][TD] 30[/TD][/TR]',
  '[TR][TD]Reflex[/TD][TD][/TD][TD]  9[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Traps[/TD][TD] 12[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Spell[/TD][TD]  9[/TD][/TR]',
  '[TR][TD][/TD][TD]vs Magic[/TD][TD]  9[/TD][/TR]',
  '[/TABLE]',
  'Marked with a* is no fail on a 1 if required DC met',
  '',
].join('\r\n')

// ---------------------------------------------------------------------------
// Fixture 3: energy resistances (AddEnergyResistances :1167-1214), spell
// powers (AddSpellPowers/AddSpellPowerToTable :1453-1520, labels padded to a
// fixed width, header cells wrapped in [COLOR=…]), and tactical DCs
// (AddTacticalDCs :1734-1756; value cell is DC::DCBreakdown's
// "<Versus> vs <N>" / "<Versus> vs <Other> + <N>" prefix, DC.cpp:214-221).
// ---------------------------------------------------------------------------
const TABLES = [
  '[TABLE][TR][TD]Energy[/TD][TD]Resistance[/TD][TD]Absorbance[/TD][/TR]',
  '[TR][TD]Acid:[/TD][TD]30[/TD][TD]0%[/TD][/TR]',
  '[TR][TD]Fire:[/TD][TD]44[/TD][TD]33%[/TD][/TR]',
  '[TR][TD]Negative:[/TD][TD]0[/TD][TD]15%[/TD][/TR]',
  '[/TABLE]',
  '[SIZE=3][TABLE]',
  '[TR][TD][COLOR=rgb(65, 168, 95)]Spell Power[/COLOR][/TD][TD][COLOR=rgb(65, 168, 95)]Base[/COLOR][/TD][TD][COLOR=rgb(65, 168, 95)]Critical Chance[/COLOR][/TD][TD][COLOR=rgb(65, 168, 95)]Critical Multiplier[/COLOR][/TD][/COLOR][/TR]',
  '[TR][TD]Acid           [/TD][TD]150[/TD][TD]25%[/TD][TD]0[/TD][/TR]',
  '[TR][TD]Light/Alignment[/TD][TD]82[/TD][TD]9%[/TD][TD]0[/TD][/TR]',
  '[TR][TD]Force/Untyped  [/TD][TD]190[/TD][TD]31%[/TD][TD]2[/TD][/TR]',
  '[TR][TD]Untyped        [/TD][TD]12[/TD][TD]5%[/TD][TD]0[/TD][/TR]',
  '[/TABLE][/SIZE]',
  '[SIZE=3][TABLE][TR][TD]Tactical DC[/TD][TD]Value[/TD][TD]Evaluation[/TD][/TR]',
  '[TR][TD]Stunning Blow[/TD][TD]Fortitude vs 45[/TD][TD]10 + Str Mod(7) + Stun(8) + 20[/TD][/TR]',
  '[TR][TD]Trip[/TD][TD]Balance vs Trip + 38[/TD][TD]Trip + 10 + Str Mod(7)[/TD][/TR]',
  '[/TABLE][/SIZE]',
  '',
].join('\r\n')

describe('parseV2Export — vitals block', () => {
  it('extracts HP, abilities and paired combat stats (capped MRR, dodge a/b)', () => {
    const { stats, warnings } = parseV2Export(VITALS_CAPPED)

    expect(stats.hp).toBe(1234)
    expect(stats.displacement).toBe(0)

    // Final column of the ability rows
    expect(stats['ability.Strength']).toBe(20)
    expect(stats['ability.Dexterity']).toBe(28)
    expect(stats['ability.Constitution']).toBe(30)
    expect(stats['ability.Intelligence']).toBe(34)
    expect(stats['ability.Wisdom']).toBe(16)
    expect(stats['ability.Charisma']).toBe(10)

    expect(stats.unconsciousRange).toBe(-10)
    expect(stats.incorporeality).toBe(0)
    expect(stats.prr).toBe(63)
    expect(stats.ac).toBe(57)

    // MRR capped "N/M" form → mrr = N, mrrCap = M, plus an advisory warning
    expect(stats.mrr).toBe(70)
    expect(stats.mrrCap).toBe(60)
    expect(warnings.some(w => w.includes('MRR is capped'))).toBe(true)

    expect(stats.healAmp).toBe(120)

    // Dodge "N/M" → dodge + dodgeCap (percent sign stripped if present)
    expect(stats.dodge).toBe(12)
    expect(stats.dodgeCap).toBe(25)
    expect(stats.negHealAmp).toBe(0)

    expect(stats.fortification).toBe(150) // "%" stripped
    expect(stats.repairAmp).toBe(0)
    expect(stats.spellResistance).toBe(0)
    expect(stats.bab).toBe(20)
  })

  it('handles the uncapped single-number MRR form without a cap warning', () => {
    const { stats, warnings } = parseV2Export(VITALS_UNCAPPED)

    expect(stats.hp).toBe(512)
    expect(stats.displacement).toBe(25)
    expect(stats.mrr).toBe(45)
    expect(stats.mrrCap).toBeUndefined()
    expect(warnings.some(w => w.includes('MRR is capped'))).toBe(false)

    expect(stats['ability.Strength']).toBe(45)
    expect(stats.unconsciousRange).toBe(-20)
    expect(stats.incorporeality).toBe(10)
    expect(stats.prr).toBe(120)
    expect(stats.ac).toBe(81)
    expect(stats.healAmp).toBe(64)
    expect(stats.dodge).toBe(3)
    expect(stats.dodgeCap).toBe(25)
    expect(stats.negHealAmp).toBe(100)
    expect(stats.fortification).toBe(203)
    expect(stats.repairAmp).toBe(50)
    expect(stats.spellResistance).toBe(34)
    expect(stats.bab).toBe(25)
  })

  it('also accepts V3-style "N/M%" dodge with a percent sign', () => {
    const { stats } = parseV2Export(
      'Int:    18    6    34      Dodge:   12/25%      -Healing Amp:     0',
    )
    expect(stats.dodge).toBe(12)
    expect(stats.dodgeCap).toBe(25)
  })
})

describe('parseV2Export — saves table', () => {
  it('extracts base saves and derives sub-save bonuses (row total − base)', () => {
    const { stats, warnings } = parseV2Export(SAVES)

    expect(stats['save.Fort']).toBe(45)
    expect(stats['save.Will']).toBe(30) // "*" marker stripped
    expect(stats['save.Reflex']).toBe(9)

    // V2 sub-save rows show base+sub totals; V3's save.sub.X keys hold the
    // sub bonus alone.
    expect(stats['save.sub.Poison']).toBe(4)
    expect(stats['save.sub.Disease']).toBe(0)
    expect(stats['save.sub.Enchantment']).toBe(4)
    expect(stats['save.sub.Illusion']).toBe(0)
    expect(stats['save.sub.Fear']).toBe(2)
    expect(stats['save.sub.Curse']).toBe(0)
    expect(stats['save.sub.Traps']).toBe(3)
    expect(stats['save.sub.Spell']).toBe(0)
    expect(stats['save.sub.Magic']).toBe(0)

    expect(warnings).toEqual([])
  })
})

describe('parseV2Export — BBCode tables', () => {
  it('extracts energy resistances/absorption, spell powers/crits, tactical DCs', () => {
    const { stats, warnings } = parseV2Export(TABLES)

    expect(stats['resist.Acid']).toBe(30)
    expect(stats['absorb.Acid']).toBe(0)
    expect(stats['resist.Fire']).toBe(44)
    expect(stats['absorb.Fire']).toBe(33)
    expect(stats['resist.Negative']).toBe(0)
    expect(stats['absorb.Negative']).toBe(15)

    expect(stats['sp.Acid']).toBe(150)
    expect(stats['spCrit.Acid']).toBe(25)
    // 'Light/Alignment' → LightAlignment, 'Force/Untyped' → Force
    expect(stats['sp.LightAlignment']).toBe(82)
    expect(stats['spCrit.LightAlignment']).toBe(9)
    expect(stats['sp.Force']).toBe(190)
    expect(stats['spCrit.Force']).toBe(31)
    expect(stats['sp.Untyped']).toBe(12)
    expect(stats['spCrit.Untyped']).toBe(5)

    // Tactical DC value cell: last integer of "<Versus> vs …"
    expect(stats['tacticalDC.Stunning Blow']).toBe(45)
    expect(stats['tacticalDC.Trip']).toBe(38)

    expect(warnings).toEqual([])
  })

  it('parses a full concatenated export in one pass', () => {
    const { stats } = parseV2Export(VITALS_CAPPED + '\r\n' + SAVES + '\r\n' + TABLES)
    expect(stats.hp).toBe(1234)
    expect(stats['save.Fort']).toBe(45)
    expect(stats['resist.Fire']).toBe(44)
    expect(stats['sp.Force']).toBe(190)
    expect(stats['tacticalDC.Trip']).toBe(38)
  })
})

describe('parseV2Export — robustness', () => {
  it('warns (never throws) on unparseable rows in known sections', () => {
    const junk = [
      'Saves:',
      '[TABLE][TR][TD]Fortitude[/TD][TD][/TD][TD]N/A[/TD][/TR]',
      '[TR][TD][/TD][TD]vs Poison[/TD][TD] 12[/TD][/TR]',
      '[/TABLE]',
      '[TABLE][TR][TD]Energy[/TD][TD]Resistance[/TD][TD]Absorbance[/TD][/TR]',
      '[TR][TD]Fire:[/TD][TD]abc[/TD][TD]1%[/TD][/TR]',
      '[/TABLE]',
    ].join('\r\n')
    const { stats, warnings } = parseV2Export(junk)
    // "N/A" base save is a warning; the sub-save that follows has no valid
    // base yet, so it is skipped with a warning rather than mis-derived.
    expect(stats['save.Fort']).toBeUndefined()
    expect(stats['save.sub.Poison']).toBeUndefined()
    expect(stats['resist.Fire']).toBeUndefined()
    expect(warnings.length).toBeGreaterThanOrEqual(3)
  })

  it('returns empty stats for arbitrary text', () => {
    const { stats, warnings } = parseV2Export('hello\nworld\n\nnothing to see here')
    expect(Object.keys(stats)).toHaveLength(0)
    expect(warnings).toEqual([])
  })

  it('ignores the feat-selection [TABLE] (Level/Class/Feats)', () => {
    const feats = [
      '[TABLE][TR][TD]Level[/TD][TD]Class[/TD][TD]Feats[/TD][/TR]',
      '[TR][TD]1[/TD][TD]Fighter(1)[/TD][TD]Standard: Power Attack[/TD][/TR]',
      '[/TABLE]',
    ].join('\r\n')
    const { stats, warnings } = parseV2Export(feats)
    expect(Object.keys(stats)).toHaveLength(0)
    expect(warnings).toEqual([])
  })
})
