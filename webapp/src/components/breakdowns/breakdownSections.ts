// breakdownSections — pure builder for every starrable stat-row section in
// the Breakdowns panel. Extracted from BreakdownsPanel so other hosts
// (visible on every page) computes exactly the same rows the panel shows,
// keyed identically ("Section/Label") for the shared favorites list.

import type { BuildStats } from '../../lib/buildStats'
import { absorptionTotal } from '../../lib/bonus'
import { deriveWeaponClasses, type WeaponGroupSpec } from '../../lib/weapons/groups'
import { critProfile } from '../../lib/combat/critProfile'
import { expectedDamage } from '../../lib/combat/expectedDamage'
import type { ResolvedBonus } from '../../lib/bonus'
import type { CharacterBuild, DDOClass } from '../../types/ddo'
import { SKILLS, SCHOOL_DCS } from '../../lib/gamedata'
import type { StatRowData } from './statRows'
import { sign } from './statRows'

export interface BreakdownSection {
  title: string
  rows: StatRowData[]
  defaultOpen: boolean
  /** Sections that only appear when they have data (Energy, Immunities, …). */
  hideWhenEmpty: boolean
}

function pct(n: number) { return n + '%' }

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const

export function buildBreakdownSections(
  stats: BuildStats,
  build: CharacterBuild,
  allClasses: DDOClass[],
  /** WeaponGroupings.xml — decides whether the wielded weapon is a ranged one.
   *  Without it the Ranged rows fall back to a name-based check. */
  allWeaponGroups: WeaponGroupSpec[] = [],
): BreakdownSection[] {
  /** Is this weapon type a bow, crossbow or thrown weapon? */
  function rangedWeapon(weaponType?: string): boolean {
    if (!weaponType) return false
    if (allWeaponGroups.length > 0) {
      const classes = deriveWeaponClasses(weaponType, allWeaponGroups)
      return classes.has('Ranged') || classes.has('All Ranged') || classes.has('Thrown')
    }
    return /bow|crossbow|dart|shuriken|throwing/i.test(weaponType)
  }
  // ── Class aggregates for labels ──────────────────────────────────────────
  const casterClasses = build.classes
    .filter(bc => bc.name && bc.levels > 0)
    .map(bc => ({ name: bc.name, levels: bc.levels, cls: allClasses.find(c => c.Name === bc.name) }))
    .filter(({ cls }) => cls?.SpellPointsPerLevel)

  // ── Helper builders ──────────────────────────────────────────────────────
  function statRow(label: string, key: string, fmt?: (n: number) => string, indent?: boolean): StatRowData {
    const resolved = stats.resolve(key)
    const total = resolved.total
    return {
      label, statKey: key, total,
      display: fmt ? fmt(total) : sign(total),
      bonuses: resolved.bonuses,
      indent,
      dim: total === 0,
    }
  }

  function subSave(label: string, baseKey: string, subKey: string): StatRowData {
    const total = stats.total(baseKey) + stats.total(subKey)
    return {
      label, total,
      display: sign(total),
      bonuses: [...stats.resolve(baseKey).bonuses, ...stats.resolve(subKey).bonuses],
      indent: true,
    }
  }

  /** A row whose value is computed rather than summed from one stat key.
   *  `statKey` is still worth passing when a derived key exists for it: the
   *  optimizer harvests every keyed row as a possible objective. */
  function fixedRow(
    label: string, value: number, display: string, bonuses: ResolvedBonus[],
    dim = false, statKey?: string,
  ): StatRowData {
    return { label, total: value, display, bonuses, dim, statKey }
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  const saveStats: StatRowData[] = [
    statRow('Fortitude',      'save.Fort',   sign),
    subSave('vs Poison',      'save.Fort',   'save.sub.Poison'),
    subSave('vs Disease',     'save.Fort',   'save.sub.Disease'),
    statRow('Reflex',         'save.Reflex', sign),
    subSave('vs Traps',       'save.Reflex', 'save.sub.Traps'),
    subSave('vs Spell',       'save.Reflex', 'save.sub.Spell'),
    subSave('vs Magic',       'save.Reflex', 'save.sub.Magic'),
    statRow('Will',           'save.Will',   sign),
    subSave('vs Enchantment', 'save.Will',   'save.sub.Enchantment'),
    subSave('vs Illusion',    'save.Will',   'save.sub.Illusion'),
    subSave('vs Fear',        'save.Will',   'save.sub.Fear'),
    subSave('vs Curse',       'save.Will',   'save.sub.Curse'),
  ]

  const hpTotal = stats.total('hp')
  const acTotal = stats.total('ac')
  const mrrCapTotal = stats.total('mrrCap')
  const spTotal = stats.total('spellPoints')
  // V2: BAB capped at MAX_BAB (25)
  const babRaw = stats.total('bab')
  const babTotal = Math.min(25, babRaw)
  const prrTotal = stats.total('prr')
  const mrrTotal = stats.total('mrr')

  // Mitigation % = 100 - (100 / (100 + value)) * 100
  function mitigation(n: number): string {
    if (n === 0) return '+0'
    const pctVal = 100 - (100 / (100 + n)) * 100
    return `${sign(n)} (${pctVal.toFixed(1)}%)`
  }

  const defenseStats: StatRowData[] = [
    fixedRow('Hit Points', hpTotal, String(hpTotal), stats.resolve('hp').bonuses, hpTotal === 0),
    fixedRow('AC', acTotal, String(acTotal), stats.resolve('ac').bonuses, acTotal <= 10),
    fixedRow('PRR', prrTotal, mitigation(prrTotal), stats.resolve('prr').bonuses, prrTotal === 0),
    fixedRow('MRR', mrrTotal, mitigation(mrrTotal), stats.resolve('mrr').bonuses, mrrTotal === 0),
    fixedRow('MRR Cap', mrrCapTotal, mrrCapTotal > 0 ? String(mrrCapTotal) : '—', stats.resolve('mrrCap').bonuses, mrrCapTotal === 0),
    statRow('Dodge',          'dodge',          pct),
    statRow('Fortification',  'fortification',  pct),
    statRow('Concealment',    'concealment',    pct),
    statRow('Displacement',   'displacement',   pct),
    statRow('Incorporeality',  'incorporeality', pct),
    statRow('Regeneration',    'regeneration',   String),
    statRow('Ghost Touch',     'ghostTouch',     String),
    fixedRow('Move Speed', stats.total('speed'), pct(stats.total('speed')), stats.resolve('speed').bonuses),
    statRow('Spell Resistance', 'spellResistance', String),
  ]

  // Hireling stat rows (V2 parity Stream 4) — only show when there's data.
  const hirelingStats: StatRowData[] = (() => {
    const rows: StatRowData[] = []
    const keys = [
      ['Hit Points', 'hireling.hp'],
      ['PRR', 'hireling.prr'],
      ['MRR', 'hireling.mrr'],
      ['Dodge', 'hireling.dodge'],
      ['Fortification', 'hireling.fort'],
      ['Concealment', 'hireling.concealment'],
      ['Melee Power', 'hireling.melee.power'],
      ['Ranged Power', 'hireling.ranged.power'],
    ] as const
    for (const [label, k] of keys) {
      const r = stats.resolve(k)
      if (r.total !== 0 || r.bonuses.length > 0) rows.push(fixedRow(label, r.total, String(r.total), r.bonuses))
    }
    // Per-ability hireling bonuses
    for (const ab of ABILITIES) {
      const r = stats.resolve(`hireling.ability.${ab}`)
      if (r.total !== 0) rows.push(fixedRow(`${ab} (hireling)`, r.total, sign(r.total), r.bonuses, false))
    }
    // All-ability hireling bonus
    const allAb = stats.resolve('hireling.ability.All')
    if (allAb.total !== 0) rows.push(fixedRow('All abilities', allAb.total, sign(allAb.total), allAb.bonuses))
    // Saves
    for (const sv of ['Fort', 'Reflex', 'Will', 'All'] as const) {
      const r = stats.resolve(`hireling.save.${sv}`)
      if (r.total !== 0) rows.push(fixedRow(`Save ${sv}`, r.total, sign(r.total), r.bonuses))
    }
    // Spell power
    const allSp = stats.resolve('hireling.sp.All')
    if (allSp.total !== 0) rows.push(fixedRow('All spell power', allSp.total, sign(allSp.total), allSp.bonuses))
    // Granted feats encoded in bonusType
    const grantedRes = stats.resolve('hireling.grantedFeats')
    if (grantedRes.bonuses.length > 0) {
      const feats = grantedRes.bonuses.filter(b => b.active).map(b => b.type).join(', ')
      rows.push(fixedRow('Granted feats', grantedRes.bonuses.length, feats, grantedRes.bonuses))
    }
    return rows
  })()

  // Energy Resistance / Absorption / DR rows (one per element with non-zero value)
  const ENERGY_TYPES = ['Fire','Cold','Acid','Electric','Sonic','Force','Light','Negative','Positive','Poison','Repair'] as const
  const energyStats: StatRowData[] = []
  for (const e of ENERGY_TYPES) {
    const r = stats.resolve(`resist.${e}`)
    const a = stats.resolve(`absorb.${e}`)
    if (r.total !== 0) {
      energyStats.push(fixedRow(`${e} Resistance`, r.total, String(r.total), r.bonuses))
    }
    if (a.total !== 0) {
      // Multiplicative absorption with V2's identical-effect merge
      const absPct = absorptionTotal(a.bonuses)
      energyStats.push(fixedRow(`${e} Absorption`, absPct, `${absPct.toFixed(1)}%`, a.bonuses))
    }
  }
  const drKeys = stats.keys().filter(k => k.startsWith('dr.'))
  for (const k of drKeys) {
    const bypass = k.slice(3)
    const r = stats.resolve(k)
    if (r.total !== 0) {
      energyStats.push(fixedRow(`DR ${r.total}/${bypass}`, r.total, `${r.total}/${bypass}`, r.bonuses))
    }
  }

  // melee.toHit / ranged.toHit already include STR/DEX mod from phase 2; bab is separate key
  const meleeToHitTotal  = babTotal + stats.total('melee.toHit')
  const rangedToHitTotal = babTotal + stats.total('ranged.toHit')

  const weapon = stats.weapon
  // Crit range and multipliers arrive on four different stat keys; critProfile
  // is the one place that reads all of them (a Dragonlord's +2 multiplier used
  // to be invisible here, and Keen counted in Combat but not in Analysis).
  const crit = critProfile(k => stats.total(k), weapon)
  const damage = expectedDamage(k => stats.total(k), stats.keys(), weapon)
  // A bow's crit profile is the wielded weapon's — V3 models weapon effects on
  // the hand that holds them — but Ranged Power scales the shot, not Melee.
  const shot = expectedDamage(k => stats.total(k), stats.keys(), weapon, { power: 'ranged' })
  const isRanged = weapon ? rangedWeapon(weapon.weaponType) : false
  // The off-hand keeps its own dice and base crit profile; the character's crit
  // bonuses and damage bonus apply to both hands, and DDO halves the off-hand's
  // ability damage.
  const offhand = stats.offhandWeapon ?? null
  const offhandCrit = critProfile(k => stats.total(k), offhand)
  const offhandDamage = expectedDamage(k => stats.total(k), stats.keys(), offhand, { offhand: true })
  const offhandCritBonuses: ResolvedBonus[] = [
    { value: offhandCrit.baseMultiplier, type: 'Base', source: offhand?.name ?? 'None', active: true },
    ...stats.resolve('melee.crit.multiplier').bonuses,
  ]
  const offhandThreatBonuses: ResolvedBonus[] = [
    { value: offhandCrit.baseThreatFaces, type: 'Base', source: offhand?.name ?? 'None', active: true },
    ...stats.resolve('weapon.threatRange').bonuses,
    ...stats.resolve('melee.crit.range').bonuses,
  ]
  const weaponDiceDisplay = weapon ? `${weapon.diceNum}d${weapon.diceSides}` : '—'
  const threatBonuses: ResolvedBonus[] = [
    { value: crit.baseThreatFaces, type: 'Base', source: weapon?.name ?? 'Unarmed', active: true },
    ...stats.resolve('weapon.threatRange').bonuses,
    ...stats.resolve('melee.crit.range').bonuses,
  ]
  const critMultBonuses: ResolvedBonus[] = [
    { value: crit.baseMultiplier, type: 'Base', source: weapon?.name ?? 'Unarmed', active: true },
    ...stats.resolve('melee.crit.multiplier').bonuses,
  ]

  const meleeStats: StatRowData[] = [
    statRow('Melee Power',    'melee.power',        sign),
    fixedRow('To-Hit Bonus',  meleeToHitTotal, sign(meleeToHitTotal),
      [...stats.resolve('bab').bonuses, ...stats.resolve('melee.toHit').bonuses]),
    statRow('Damage Bonus',   'melee.damage',       sign),
    fixedRow('W Dice',        0, weaponDiceDisplay, [], !weapon),
    fixedRow('Threat Range',  crit.threatFaces, crit.threatDisplay, threatBonuses,
      false, 'crit.threatFaces'),
    fixedRow('Crit Chance',   crit.critChance * 100, pct(crit.critChance * 100), threatBonuses,
      false, 'crit.chance'),
    fixedRow('Crit Multiplier', crit.multiplier, `×${crit.multiplier}`, critMultBonuses,
      false, 'crit.multiplier'),
    // Always listed even at zero: dimmed rows are still selectable optimizer
    // objectives, and "raise my 19-20 multiplier" is a goal a build may not
    // have made progress on yet.
    fixedRow('Crit Multiplier 19–20', crit.multiplier19to20, `×${crit.multiplier19to20}`,
      [...critMultBonuses, ...stats.resolve('weapon.critMultiplier19to20').bonuses],
      crit.bonus19to20 === 0, 'crit.multiplier19to20'),
    statRow('Crit-Only Damage', 'melee.crit.damage', sign),
    fixedRow('Damage per Swing', damage.perSwing, damage.perSwing.toFixed(1),
      [{ value: damage.perSwing, type: 'Computed', source:
        `${damage.normalHit.toFixed(1)} on a hit, ${damage.critStandard.toFixed(1)} on a crit`,
        active: true }], !weapon, 'damage.perSwing'),
    statRow('Doublestrike',   'melee.doublestrike', pct),
    statRow('Sneak Atk Dice', 'melee.sneakDice'),
    statRow('Strikethrough',  'melee.strikethrough', pct),
  ]

  const rangedStats: StatRowData[] = [
    statRow('Ranged Power',   'ranged.power',      sign),
    fixedRow('To-Hit Bonus',  rangedToHitTotal, sign(rangedToHitTotal),
      [...stats.resolve('bab').bonuses, ...stats.resolve('ranged.toHit').bonuses]),
    // Dimmed unless a ranged weapon is actually wielded: these describe the
    // equipped bow/crossbow, not a hypothetical one.
    fixedRow('Threat Range',  crit.threatFaces, crit.threatDisplay, threatBonuses, !isRanged),
    fixedRow('Crit Chance',   crit.critChance * 100, pct(crit.critChance * 100),
      threatBonuses, !isRanged),
    fixedRow('Crit Multiplier', crit.multiplier, `×${crit.multiplier}`, critMultBonuses, !isRanged),
    fixedRow('Crit Multiplier 19–20', crit.multiplier19to20, `×${crit.multiplier19to20}`,
      [...critMultBonuses, ...stats.resolve('weapon.critMultiplier19to20').bonuses],
      !isRanged || crit.bonus19to20 === 0),
    fixedRow('Damage per Shot', shot.perSwing, shot.perSwing.toFixed(1),
      [{ value: shot.perSwing, type: 'Computed', source:
        `${shot.normalHit.toFixed(1)} on a hit, ${shot.critStandard.toFixed(1)} on a crit`,
        active: true }], !isRanged, 'damage.perShot'),
    statRow('Doubleshot',     'ranged.doubleshot', pct),
  ]

  // ── Off Hand ─────────────────────────────────────────────────────────────
  // Every row is dimmed when the off hand is empty (or holds a shield), so the
  // section reads as "nothing here" rather than showing a phantom weapon.
  const offhandStats: StatRowData[] = [
    fixedRow('Weapon', 0, offhand?.name ?? '—', [], !offhand),
    fixedRow('W Dice', 0, offhand ? `${offhand.diceNum}d${offhand.diceSides}` : '—', [], !offhand),
    fixedRow('Threat Range', offhandCrit.threatFaces,
      offhand ? offhandCrit.threatDisplay : '—', offhandThreatBonuses, !offhand,
      'crit.offhand.threatFaces'),
    fixedRow('Crit Chance', offhandCrit.critChance * 100,
      offhand ? pct(offhandCrit.critChance * 100) : '—', offhandThreatBonuses, !offhand,
      'crit.offhand.chance'),
    fixedRow('Crit Multiplier', offhandCrit.multiplier,
      offhand ? `×${offhandCrit.multiplier}` : '—', offhandCritBonuses, !offhand,
      'crit.offhand.multiplier'),
    fixedRow('Crit Multiplier 19–20', offhandCrit.multiplier19to20,
      offhand ? `×${offhandCrit.multiplier19to20}` : '—',
      [...offhandCritBonuses, ...stats.resolve('weapon.critMultiplier19to20').bonuses],
      !offhand || offhandCrit.bonus19to20 === 0, 'crit.offhand.multiplier19to20'),
    fixedRow('Damage per Swing', offhandDamage.perSwing,
      offhand ? offhandDamage.perSwing.toFixed(1) : '—',
      [{ value: offhandDamage.perSwing, type: 'Computed', source:
        offhand
          ? `${offhandDamage.normalHit.toFixed(1)} on a hit, half ability damage`
          : 'No off-hand weapon',
        active: true }], !offhand, 'damage.offhand.perSwing'),
    statRow('Attack Chance', 'offhand.attack', pct),
    statRow('Doublestrike', 'offhand.doublestrike', pct),
  ]

  const spellStats: StatRowData[] = [
    fixedRow('Spell Points', spTotal, String(spTotal), stats.resolve('spellPoints').bonuses, spTotal === 0),
    ...casterClasses.map(({ name, levels }) => {
      const clClass = stats.resolve(`cl.${name}`)
      const clAll = stats.resolve('cl.All')
      const total = levels + clClass.total + clAll.total
      return fixedRow(`${name} CL`, total, String(total),
        [
          { value: levels, type: 'Base', source: `${name} class levels`, active: true },
          ...clClass.bonuses,
          ...clAll.bonuses,
        ])
    }),
    statRow('Spell Penetration', 'spellPenetration'),
    ...SCHOOL_DCS.map(school => statRow(`${school} DC`, `dc.${school}`)),
  ]

  const initiativeTotal  = stats.total('initiative')
  const skillPointsTotal = stats.total('skillPoints')
  const babDisplay = babRaw > babTotal ? `${sign(babTotal)} (capped, raw ${sign(babRaw)})` : sign(babTotal)
  const miscStats: StatRowData[] = [
    fixedRow('BAB',        babTotal,        babDisplay,            stats.resolve('bab').bonuses),
    fixedRow('Initiative', initiativeTotal, sign(initiativeTotal), stats.resolve('initiative').bonuses),
    fixedRow('Skill Pts',  skillPointsTotal, String(skillPointsTotal), stats.resolve('skillPoints').bonuses),
    statRow('Off-hand Atk', 'offhand.attack', pct),
    statRow('Helpless Dmg', 'helpless',        pct),
    statRow('Tactical DC (All)', 'tacticalDC.All', sign),
    ...[
      ['Assassinate',    'Assassinate'],
      ['Trap',           'Trap'],
      ['Trip',           'Trip'],
      ['Stun',           'Stun'],
      ['Sunder',         'Sunder'],
      ['StunningShield', 'Stunning Shield'],
      ['General',        'General'],
      ['Wands',          'Wands'],
      ['Fear',           'Fear'],
      ['InnateAttack',   'Innate Attack'],
      ['BreathWeapon',   'Breath Weapon'],
      ['Poison',         'Poison'],
      ['RuneArm',        'Rune Arm'],
    ].map(([key, label]) => statRow(`  vs ${label}`, `tacticalDC.${key}`, sign)),
  ]

  // Weapon-effect breakdowns (Stream-audit additions)
  const weaponEffectStats: StatRowData[] = []
  const wAlac = stats.resolve('weapon.alacrity')
  if (wAlac.total !== 0) weaponEffectStats.push(fixedRow('Alacrity', wAlac.total, pct(wAlac.total), wAlac.bonuses))
  const wKeen = stats.resolve('weapon.keen')
  if (wKeen.total !== 0) weaponEffectStats.push(fixedRow('Keen', wKeen.total, sign(wKeen.total), wKeen.bonuses))
  const wVorpal = stats.resolve('weapon.vorpalRange')
  if (wVorpal.total !== 0) weaponEffectStats.push(fixedRow('Vorpal Range', wVorpal.total, sign(wVorpal.total), wVorpal.bonuses))

  // Immunities — list every immunity.<name> key set anywhere in the build
  const immunityKeys = stats.keys().filter(k => k.startsWith('immunity.'))
  const immunityStats: StatRowData[] = immunityKeys.map(k => {
    const r = stats.resolve(k)
    return fixedRow(k.slice('immunity.'.length), r.total, r.total > 0 ? '✓' : '–', r.bonuses)
  })

  // Eldritch Blast
  const eldritchStats: StatRowData[] = []
  const ebD6 = stats.resolve('eldritchBlast.d6')
  if (ebD6.total !== 0) eldritchStats.push(fixedRow('Eldritch Blast d6', ebD6.total, `${ebD6.total}d6`, ebD6.bonuses))
  const ebD8 = stats.resolve('eldritchBlast.d8')
  if (ebD8.total !== 0) eldritchStats.push(fixedRow('Eldritch Blast d8', ebD8.total, `${ebD8.total}d8`, ebD8.bonuses))

  // V2 BreakdownsPane.cpp:2576 "Actions with Charges" — extras + LoH regen + dragonmark.
  const classResourceStats: StatRowData[] = [
    statRow('Action Boost (extra)',  'actionBoost.extra',     String),
    statRow('Lay on Hands (extra)',  'lohExtra',              String),
    statRow('Lay on Hands regen',    'lohRegen',              String),
    statRow('Rage (extra)',          'rageExtra',             String),
    statRow('Smite Evil (extra)',    'smiteExtra',            String),
    statRow('Wild Empathy (extra)',  'wildEmpathyExtra',      String),
    statRow('Remove Disease (extra)', 'removeDiseaseExtra',   String),
    statRow('Dragonmark uses',       'dragonmark.uses',       String),
  ]

  // V2 BreakdownItemDestinyAps + RAP/UAP/FatePoint
  const apPoolStats: StatRowData[] = [
    statRow('Destiny APs (bonus)',  'destinyAP',   sign),
    statRow('Reaper APs (bonus)',   'reaperAP',    sign),
    statRow('Universal APs',        'universalAP', sign),
    statRow('Fate Points',          'fatePoint',   sign),
  ]

  // V2 BreakdownsPane:2145 "Turn Undead"
  const turnUndeadStats: StatRowData[] = [
    statRow('Turn Undead',           'turnUndead',           sign),
    statRow('Turn bonus',            'turnUndead.bonus',     sign),
    statRow('Turn dice bonus',       'turnUndead.diceBonus', sign),
    statRow('Turn level bonus',      'turnUndead.levelBonus', sign),
    statRow('Turn max dice',         'turnUndead.maxDice',   sign),
  ]

  // V2 BreakdownsPane:1559 "Ki Breakdowns"
  const kiStats: StatRowData[] = [
    statRow('Maximum Ki',  'ki.max',      sign),
    statRow('Ki on hit',   'ki.hit',      sign),
    statRow('Ki on crit',  'ki.critical', sign),
    statRow('Ki passive',  'ki.passive',  sign),
  ]

  // V2 BreakdownsPane:1890 "Song Breakdowns" — V3 routes most song.* into their
  // primary stat keys tagged 'Music', so only count/duration are unique here.
  function fmtDuration(secs: number): string {
    if (secs <= 0) return '+0'
    const s = secs % 60
    const m = Math.floor(secs / 60) % 60
    const h = Math.floor(secs / 3600)
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    if (m > 0) return `${m}:${String(s).padStart(2,'0')}`
    return `${s}s`
  }
  const songCountTotal = stats.total('song.count')
  const songDurationTotal = stats.total('song.duration')
  const songStats: StatRowData[] = [
    fixedRow('Song count',    songCountTotal,    sign(songCountTotal),    stats.resolve('song.count').bonuses,    songCountTotal === 0),
    fixedRow('Song duration', songDurationTotal, fmtDuration(songDurationTotal), stats.resolve('song.duration').bonuses, songDurationTotal === 0),
  ]

  // V2 niche flags / mechanics — surface so they're visible when set.
  function flagDisplay(n: number): string { return n > 0 ? '✓' : '–' }
  const specialEffectStats: StatRowData[] = [
    statRow('True Seeing',           'trueSeeing',           flagDisplay),
    statRow('Tumble while charging', 'tumbleCharge',         flagDisplay),
    statRow('Unconscious range',     'unconsciousRange',     sign),
    statRow('Secondary shield bash', 'secondaryShieldBash',  flagDisplay),
    statRow('Point-blank shot rng',  'pointBlankShotRange',  sign),
    statRow('Wild Surge chance',     'wildsurgeChance',      pct),
    statRow('Imbue dice',            'imbueDice',            sign),
    statRow('Negative levels',       'negativeLevel',        sign),
    statRow('Rune arm charge rate',  'runeArm.chargeRate',   sign),
    statRow('Rune arm stable charge', 'runeArm.stableCharge', sign),
    statRow('Implement in hands',    'implementInHands.Any', flagDisplay),
    statRow('Implement bonus',       'implementBonus',       sign),
    statRow('BAB override',          'babOverride',          n => n > 0 ? String(n) : '—'),
  ]

  const skillStats: StatRowData[] = SKILLS.map(({ name }) => {
    const resolved = stats.resolve(`skill.${name}`)
    return {
      label:   name,
      total:   resolved.total,
      display: sign(resolved.total),
      bonuses: resolved.bonuses,
      dim:     resolved.total <= 0,
    }
  })

  return [
    { title: 'Saving Throws',            rows: saveStats,          defaultOpen: true,  hideWhenEmpty: false },
    { title: 'Defense',                  rows: defenseStats,       defaultOpen: true,  hideWhenEmpty: false },
    { title: 'Energy Resistance & DR',   rows: energyStats,        defaultOpen: true,  hideWhenEmpty: true },
    { title: 'Melee',                    rows: meleeStats,         defaultOpen: true,  hideWhenEmpty: false },
    { title: 'Ranged',                   rows: rangedStats,        defaultOpen: true,  hideWhenEmpty: false },
    { title: 'Off Hand',                 rows: offhandStats,       defaultOpen: false, hideWhenEmpty: false },
    { title: 'Spellcasting',             rows: spellStats,         defaultOpen: spellStats.some(s => !s.dim), hideWhenEmpty: false },
    { title: 'Combat',                   rows: miscStats,          defaultOpen: true,  hideWhenEmpty: false },
    { title: 'Weapon Effects',           rows: weaponEffectStats,  defaultOpen: false, hideWhenEmpty: true },
    { title: 'Eldritch Blast',           rows: eldritchStats,      defaultOpen: false, hideWhenEmpty: true },
    { title: 'Immunities',               rows: immunityStats,      defaultOpen: false, hideWhenEmpty: true },
    { title: 'Hireling',                 rows: hirelingStats,      defaultOpen: false, hideWhenEmpty: true },
    { title: 'Class Resources',          rows: classResourceStats, defaultOpen: false, hideWhenEmpty: false },
    { title: 'Action Points',            rows: apPoolStats,        defaultOpen: false, hideWhenEmpty: false },
    { title: 'Turn Undead',              rows: turnUndeadStats,    defaultOpen: false, hideWhenEmpty: false },
    { title: 'Ki',                       rows: kiStats,            defaultOpen: false, hideWhenEmpty: false },
    { title: 'Songs',                    rows: songStats,          defaultOpen: false, hideWhenEmpty: false },
    { title: 'Special Effects',          rows: specialEffectStats, defaultOpen: false, hideWhenEmpty: false },
    { title: 'Skills',                   rows: skillStats,         defaultOpen: false, hideWhenEmpty: false },
  ]
}

/** Map of "Section/Label" → [sectionTitle, row] over all sections. */
export function indexSectionRows(sections: BreakdownSection[]): Map<string, [string, StatRowData]> {
  const rowIndex = new Map<string, [string, StatRowData]>()
  for (const { title, rows } of sections) {
    for (const s of rows) rowIndex.set(`${title}/${s.label}`, [title, s])
  }
  return rowIndex
}
