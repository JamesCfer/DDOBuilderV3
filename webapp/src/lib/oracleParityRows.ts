// oracleParityRows — the single source of truth for comparing the v2calc
// oracle's JSON output (DDOBuilder V2's own compiled C++ math, run headless)
// against V3's computeBuildStats totals.
//
// Extracted verbatim from scripts/oracleDiff.ts so the CLI referee and the
// upload-time background parity check (POST /api/parity-check) share one
// mapping. Every V2↔V3 representation difference (sub-saves compose over the
// base save, per-type spell power includes the universal feed, destiny APs
// derive from character level, …) is encoded here exactly once.

import { absorptionTotal, resolveBonus } from './bonus'
import { hasMixedMagics } from './mixedMagics'
import { critProfile, isOffhandSlotWeapon, offhandEnchantKey } from './combat/critProfile'
import type { BuildStats } from './buildStats'
import type { CharacterBuild, Item } from '../types/ddo'

/** Loose shape of the v2calc oracle's JSON output (see v2calc/src/main.cpp). */
export interface OracleJson {
  abilityTotal?: Record<string, number>
  breakdowns?: Record<string, number>
  spellDC?: Record<string, number>
  casterLevel?: Record<string, number>
  skills?: Record<string, number>
  tacticalDC?: Record<string, number>
  spellPower?: Record<string, number>
  spellCritChance?: Record<string, number>
  spellCritMultiplier?: Record<string, number>
  energyResistance?: Record<string, number>
  energyAbsorption?: Record<string, number>
  ac?: number
  songDuration?: number
  immunities?: string
  hireling?: Record<string, number>
  weaponMain?: Record<string, number>
  weaponOffhand?: Record<string, number>
}

export interface ParityRow {
  stat: string
  v2: number
  v3: number
}

// v2calc JSON key → V3 stat key. Sub-saves/spellpower composed separately below.
const BREAKDOWN_MAP: Record<string, string> = {
  hitpoints: 'hp', prr: 'prr', mrr: 'mrr', mrrCap: 'mrrCap',
  dodge: 'dodge', dodgeCap: 'dodgeCap', fortification: 'fortification', bab: 'bab',
  meleePower: 'melee.power', rangedPower: 'ranged.power',
  saveFortitude: 'save.Fort', saveReflex: 'save.Reflex', saveWill: 'save.Will',
}
const ABILITY_MAP: Record<string, string> = {
  STR: 'ability.Strength', DEX: 'ability.Dexterity', CON: 'ability.Constitution',
  INT: 'ability.Intelligence', WIS: 'ability.Wisdom', CHA: 'ability.Charisma',
}
// oracle key → [V3 base-save key, V3 sub-save bonus key]
const SUBSAVE_MAP: Array<[string, string, string]> = [
  ['savePoison',      'save.Fort',   'save.sub.Poison'],
  ['saveDisease',     'save.Fort',   'save.sub.Disease'],
  ['saveTraps',       'save.Reflex', 'save.sub.Traps'],
  ['saveSpell',       'save.Reflex', 'save.sub.Spell'],
  ['saveMagic',       'save.Reflex', 'save.sub.Magic'],
  ['saveEnchantment', 'save.Will',   'save.sub.Enchantment'],
  ['saveIllusion',    'save.Will',   'save.sub.Illusion'],
  ['saveFear',        'save.Will',   'save.sub.Fear'],
  ['saveCurse',       'save.Will',   'save.sub.Curse'],
]
// oracle spellDC key → V3 dc.<School> suffix
const SPELL_DC_MAP: Record<string, string> = {
  abjuration: 'Abjuration', conjuration: 'Conjuration', divination: 'Divination',
  enchantment: 'Enchantment', evocation: 'Evocation', illusion: 'Illusion',
  necromancy: 'Necromancy', transmutation: 'Transmutation',
}
// full-analytics expansion — oracle scalar key → V3 stat key
const SCALAR2_MAP: Record<string, string> = {
  fatePoints: 'fatePoint', styleBonusFeats: 'styleFeats',
  unconsciousRange: 'unconsciousRange',
  incorporeality: 'incorporeality', helplessDR: 'helplessDR',
  healAmp: 'healAmp', negHealAmp: 'negHealAmp', repairAmp: 'repairAmp',
  threatMelee: 'threat.melee', threatRanged: 'threat.ranged', threatSpell: 'threat.spell',
  doublestrike: 'melee.doublestrike', doubleshot: 'ranged.doubleshot',
  imbueDice: 'imbueDice', sneakAttackDice: 'melee.sneakDice',
  sneakAttackDamage: 'melee.sneakDamage', sneakAttackAttack: 'melee.sneakAttack',
  dodgeBypass: 'dodgeBypass', fortificationBypass: 'fortBypass',
  strikethrough: 'melee.strikethrough', helplessDamage: 'helpless',
  spellPoints: 'spellPoints', spellResistance: 'spellResistance',
  spellPenetration: 'spellPenetration', spellCostReduction: 'spellCostPct',
  kiMax: 'ki.max', kiPassive: 'ki.passive', kiHit: 'ki.hit', kiCritical: 'ki.critical',
  turnUndeadLevel: 'turnUndead.levelBonus',
  songCount: 'song.count', tumbleCharges: 'tumbleCharge',
  // Charges, offensive extras and metamagic costs (all V2 BreakdownItemSimple
  // pools except Turn Undead Hit Dice, which BreakdownItemTurnUndeadHitDice
  // composes like V3's turnUndead.diceBonus).
  layOnHands: 'lohExtra', lohRegen: 'lohRegen', rages: 'rageExtra',
  sneakAttackRange: 'melee.sneakRange', turnUndeadHitDice: 'turnUndead.diceBonus',
  eldritchBlastD6: 'eldritchBlast.d6', eldritchBlastD8: 'eldritchBlast.d8',
  runeArmChargeRate: 'runeArm.chargeRate', runeArmStableCharge: 'runeArm.stableCharge',
  wildsurge: 'wildsurgeChance', secondaryShieldBash: 'secondaryShieldBash',
  missileDeflectionBypass: 'missileDeflectionBypass', spellCritUniversal: 'spCrit.Universal',
  hitpointsPercent: 'hp.percent',
  mmAccelerate: 'metamagic.cost.Accelerate', mmEmbolden: 'metamagic.cost.Embolden',
  mmEmpower: 'metamagic.cost.Empower', mmEmpowerHealing: 'metamagic.cost.EmpowerHealing',
  mmEnlarge: 'metamagic.cost.Enlarge', mmEschew: 'metamagic.cost.EschewMaterials',
  mmExtend: 'metamagic.cost.Extend', mmHeighten: 'metamagic.cost.Heighten',
  mmIntensify: 'metamagic.cost.Intensify', mmMaximize: 'metamagic.cost.Maximize',
  mmQuicken: 'metamagic.cost.Quicken',
  // V2 "Tower Shield MDB" and "Dodge Cap (Tower Shield)" are both simple
  // pools of Effect_MaxDexBonusTowerShield (V3 mdbShields).
  maxDexBonusShields: 'mdbShields', dodgeCapTowerShield: 'mdbShields',
  armorACPercent: 'armorACPercent', shieldACPercent: 'shieldACPercent',
  totalACPercent: 'ac.percent', songAC: 'song.ac', songAttack: 'song.attack', songDamage: 'song.damage',
  songDoublestrike: 'song.doublestrike', songDoubleshot: 'song.doubleshot', songSpellPower: 'song.sp',
  songSpellPen: 'song.spellPen', songCasterLevel: 'song.cl', songSkill: 'song.skill', songPRR: 'song.prr',
  songMRR: 'song.mrr', songHealAmp: 'song.healAmp', songNegHealAmp: 'song.negHealAmp', songRepairAmp: 'song.repairAmp',
}
const SPELL_SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation'] as const
const HIRELING_MAP: Record<string, string> = {
  hitpoints: 'hireling.hp', fortification: 'hireling.fort',
  prr: 'hireling.prr', mrr: 'hireling.mrr', dodge: 'hireling.dodge',
  meleePower: 'hireling.melee.power', rangedPower: 'hireling.ranged.power',
  spellPower: 'hireling.sp.All', concealment: 'hireling.concealment',
}

/**
 * Builds the full [stat, v2, v3] comparison table for one build: every stat
 * the oracle emitted, paired with V3's composed equivalent.
 */
export function buildParityRows(
  oracle: OracleJson,
  stats: BuildStats,
  build: CharacterBuild,
  gearItems: Record<string, Item>,
): ParityRow[] {
  const rows: ParityRow[] = []
  const push = (stat: string, v2: number, v3: number) => rows.push({ stat, v2, v3 })

  for (const [ok, v3k] of Object.entries(ABILITY_MAP)) {
    if (oracle.abilityTotal?.[ok] === undefined) continue
    push(`ability.${ok}`, oracle.abilityTotal[ok], stats.total(v3k))
  }
  for (const [ok, v3k] of Object.entries(BREAKDOWN_MAP)) {
    if (oracle.breakdowns?.[ok] === undefined) continue
    push(ok, oracle.breakdowns[ok], stats.total(v3k))
  }
  // Damage Reduction: V2 shows every effect as "amount/kind", but its numeric
  // total stacks ALL kinds in one pool (Highest-Only across kinds). V3 keeps
  // one dr.<kind> pool per kind, so re-resolve their (already merged)
  // entries together to compare that total.
  if (oracle.breakdowns?.dr !== undefined) {
    const all = stats.keys().filter(k => k.startsWith('dr.')).flatMap(k =>
      // The kind is part of V2's effect identity: two 15/kind effects from
      // one item stay separate effects rather than merging into one stack.
      stats.resolve(k).bonuses.map(({ active: _a, simpleStacks: _s, v2Name: _n, stackGroup: _g, ...b }) =>
        ({ ...b, source: `${k}: ${b.source}` })))
    push('dr', oracle.breakdowns.dr, resolveBonus(all).total)
  }
  // Sub-saves: V2's BreakdownItemSave sub-breakdowns are BASE SAVE + the
  // sub-type bonuses; V3 models the sub bonus separately (UI subSave()).
  for (const [ok, base, sub] of SUBSAVE_MAP) {
    if (oracle.breakdowns?.[ok] === undefined) continue
    push(ok, oracle.breakdowns[ok], stats.total(base) + stats.total(sub))
  }
  // Max dex bonus: with no armor equipped V2 adds a 999 "No limit to Max
  // Dex Bonus" effect (BreakdownItemMDB::CreateOtherEffects) and MDB
  // effects stack on top; V3 models "no cap" as armorMaxDex === null with
  // the same effects in the 'mdb' pool.
  if (oracle.breakdowns?.maxDexBonus !== undefined) {
    const v2mdb = oracle.breakdowns.maxDexBonus
    // stats.armorMaxDex is the armor's PRINTED cap only; Effect_MaxDexBonus
    // contributions (armor mastery, Horizon Walker cores, …) pool under
    // 'mdb' in both the armored and unarmored cases. V2's "No limit" 999
    // effect fires whenever the CLOTH ARMOR stance is on (robes/outfits,
    // even with a printed 0) and no tower shield is equipped.
    const armorItem = gearItems['Armor'] as { Armor?: string } | undefined
    const towerShield = Object.values(gearItems)
      .some(i => (i as { Weapon?: string }).Weapon === 'Tower Shield')
    const featsChosen = new Set(Object.values(build.featChoices ?? {}))
    const docentAsCloth = armorItem?.Armor === 'Docent'
      && !featsChosen.has('Mithral Body') && !featsChosen.has('Adamantine Body')
    const clothNoLimit = (!armorItem || armorItem.Armor === 'Cloth' || docentAsCloth) && !towerShield
    // Typeless embedded armor (no <Armor> field): NOT cloth in V2, and with
    // no printed MDB the armored total is just the mdb effect pool.
    const typelessArmor = armorItem !== undefined && armorItem.Armor === undefined
    const v3mdb = (clothNoLimit && !typelessArmor
      ? 999
      : (stats.armorMaxDex ?? 0)) + stats.total('mdb')
    push('maxDexBonus', v2mdb, v3mdb)
  }
  // Spell school DCs. V2 BreakdownItemSpellSchool holds Item=All AND
  // school-specific SpellDC effects in ONE pool, so gear-pool Highest-Only
  // competes across both (fuzz-5000: quarterstaff +3 Evocation beats Amber
  // Pendant +2 All). Re-resolve the UNION of V3's dc.All and dc.<School>
  // pools to reproduce that competition.
  for (const [ok, school] of Object.entries(SPELL_DC_MAP)) {
    if (oracle.spellDC?.[ok] === undefined) continue
    const combined = resolveBonus([
      ...stats.resolve('dc.All').bonuses,
      ...stats.resolve(`dc.${school}`).bonuses,
    ]).total
    push(`dc.${school}`, oracle.spellDC[ok], combined)
  }
  // Per-class caster levels. V2 BreakdownItemClassCasterLevel composes:
  // class levels + Wild Mage/Arcane Trickster/Archmage "Mixed Magics"
  // (min(20, level) − classLevels, only when classLevels > 0) + CasterLevel
  // effects (per-class and Item=All pools).
  const mixedMagics = hasMixedMagics(build)
  const charLevel = (build.totalLevel ?? 0)
    + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  for (const [cls, v2cl] of Object.entries(oracle.casterLevel ?? {})) {
    const lv = build.classes.find(c => c.name === cls)?.levels ?? 0
    let v3cl = lv + stats.total(`cl.${cls}`) + stats.total('cl.All')
    if (lv > 0 && mixedMagics) v3cl += Math.min(20, charLevel) - lv
    push(`cl.${cls}`, v2cl, v3cl)
  }
  // Per-school caster levels. V2 BreakdownItemSchoolCasterLevel pools
  // CasterLevel / MaxCasterLevel effects whose Item is the school or "All".
  for (const school of SPELL_SCHOOLS) {
    const cl = oracle.breakdowns?.[`clSchool${school}`]
    if (cl !== undefined) push(`clSchool${school}`, cl, stats.total(`cl.${school}`) + stats.total('cl.All'))
    const mcl = oracle.breakdowns?.[`maxClSchool${school}`]
    if (mcl !== undefined) push(`maxClSchool${school}`, mcl, stats.total(`maxCl.${school}`) + stats.total('maxCl.All'))
  }
  // Full-analytics expansion
  for (const [ok, v3k] of Object.entries(SCALAR2_MAP)) {
    if (oracle.breakdowns?.[ok] === undefined) continue
    push(ok, oracle.breakdowns[ok], stats.total(v3k))
  }
  for (const [name, v2v] of Object.entries(oracle.skills ?? {})) {
    // Skills carry half-ranks (cross-class 0.5/point); V2 emits the raw
    // double (67.50). Compare both sides truncated, like V2's int display.
    push(`skill.${name}`, Math.trunc(v2v), stats.total(`skill.${name}`))
  }
  for (const [name, v2v] of Object.entries(oracle.tacticalDC ?? {})) {
    push(`tacticalDC.${name}`, v2v, stats.total(`tacticalDC.${name}`))
  }
  // V2 per-type spell power totals INCLUDE the universal breakdown (sibling
  // feed); Item=All effects are fanned into every per-type pool by the
  // parser (so they compete Highest-Only per type, V2-style). V2's
  // universal DISPLAY total is just the universal pool.
  const v3UniversalSP = stats.total('sp.Universal')
  if (oracle.breakdowns?.spellPowerUniversal !== undefined) {
    push('spellPowerUniversal', oracle.breakdowns.spellPowerUniversal, v3UniversalSP)
  }
  // Movement speed: V3 models the base run speed as a flat 100; V2's
  // breakdown holds only the bonuses.
  if (oracle.breakdowns?.movementSpeed !== undefined) {
    push('movementSpeed', oracle.breakdowns.movementSpeed, stats.total('speed') - 100)
  }
  // Destiny APs — V2 BreakdownItemDestinyAps::CreateOtherEffects derives the
  // level APs from Build::Level() with a +1 offset: at char level L ≥ 20,
  // epic APs = min(L−20+1, 10)×4 (so a flat level-20 build already has 4);
  // at L ≥ 30, legendary APs = min(L−30+1, 10)×4 EXCEPT exactly at
  // BUILD_START_LEVEL (36) where the count is pinned to 6. Plus FatePoints/3
  // (fractions dropped) and DestinyAPBonus effects (V3 'destinyAP' pool).
  if (oracle.breakdowns?.destinyAPs !== undefined) {
    let levelAPs = 0
    if (charLevel >= 20) {
      const l = charLevel - 20
      levelAPs += Math.min(l + 1, 10) * 4
      if (l >= 10) {
        let ll = Math.min(l - 10 + 1, 10)
        if (charLevel === 36) ll = 6
        levelAPs += ll * 4
      }
    }
    const v3daps = levelAPs
      + Math.floor(stats.total('fatePoint') / 3)
      + stats.total('destinyAP')
    push('destinyAPs', oracle.breakdowns.destinyAPs, v3daps)
  }
  for (const [name, v2v] of Object.entries(oracle.spellPower ?? {})) {
    push(`sp.${name}`, v2v, v3UniversalSP + stats.total(`sp.${name}`))
  }
  // V2 per-type spell crit chance = universal-lore breakdown (sibling feed)
  // + per-type lore (Item=All fanned per type by the parser, as above).
  const v3UniversalCrit = stats.total('spCrit.Universal')
  for (const [name, v2v] of Object.entries(oracle.spellCritChance ?? {})) {
    push(`spCrit.${name}`, v2v, v3UniversalCrit + stats.total(`spCrit.${name}`))
  }
  for (const [name, v2v] of Object.entries(oracle.energyResistance ?? {})) {
    push(`resist.${name}`, v2v, stats.total(`resist.${name}`))
  }
  // ── pass 134: AC / hirelings / immunities / song duration / crit mult ──
  if (oracle.ac !== undefined) push('ac', oracle.ac, stats.total('ac'))
  if (oracle.songDuration !== undefined) {
    push('songDuration', oracle.songDuration, stats.total('song.duration'))
  }
  // Immunities: V2 emits the display string (comma-joined effect names, with
  // duplicates); V3 pools immunity.<name> keys. Compare as SETS of names.
  if (oracle.immunities !== undefined) {
    const v3Set = new Set(stats.keys()
      .filter(k => k.startsWith('immunity.') && stats.total(k) > 0)
      .map(k => k.slice('immunity.'.length).trim()))
    // Some names contain a comma ("Stunning, dazing and disorientation from
    // sound based spells"), so rejoin adjacent pieces when together they
    // form a name V3 knows; a lone piece is a name only V2 has.
    const parts = oracle.immunities.split(',').map(x => x.trim()).filter(Boolean)
    const v2Set = new Set<string>()
    for (let i = 0; i < parts.length;) {
      let j = parts.length
      while (j > i + 1 && !v3Set.has(parts.slice(i, j).join(', '))) j--
      v2Set.add(parts.slice(i, j).join(', '))
      i = j
    }
    let diff = 0
    for (const n of v2Set) if (!v3Set.has(n)) diff++
    for (const n of v3Set) if (!v2Set.has(n)) diff++
    push('immunities', v2Set.size, v2Set.size - diff)
  }
  // Hirelings: V2's ability breakdown is ONE pool for all six abilities.
  for (const [ok, v3k] of Object.entries(HIRELING_MAP)) {
    if (oracle.hireling?.[ok] === undefined) continue
    push(`hireling.${ok}`, oracle.hireling[ok], stats.total(v3k))
  }
  if (oracle.hireling?.abilityBonus !== undefined) {
    const v3ab = stats.keys()
      .filter(k => k.startsWith('hireling.ability.'))
      .reduce((sum, k) => sum + stats.total(k), 0)
    push('hireling.abilityBonus', oracle.hireling.abilityBonus, v3ab)
  }
  // Spell crit multipliers: V2 per-type = universal feed + per-type effects;
  // fractional (0.25 steps) — compare ×100 as ints.
  const v3UniversalCritDmg = stats.total('spCritDmg.Universal') + stats.total('spCritDmg.All')
  for (const [name, v2v] of Object.entries(oracle.spellCritMultiplier ?? {})) {
    const v3v = name === 'Universal'
      ? stats.total('spCritDmg.Universal')
      : v3UniversalCritDmg + stats.total(`spCritDmg.${name}`)
    push(`spCritDmg.${name}`, Math.round(v2v * 100), Math.round(v3v * 100))
  }

  // ── pass 134: weapon lines (per-hand BreakdownItemWeapon totals) ───────
  // V3's weapon model is main-hand-centric flat keys; compose best-effort
  // equivalents. Lines V3 cannot yet model are compared anyway — mismatches
  // are the fix backlog, exactly like every previous widening.
  const wm = oracle.weaponMain
  if (wm !== undefined) {
    // BAB is now a line INSIDE the melee.toHit pool (V2 puts it in the attack
    // pool so percent effects scale over it). melee.* IS the unified
    // main-hand weapon line — ranged weapons' effects route there too.
    if (wm.enchantment !== undefined) {
      push('weaponMain.enchantment', wm.enchantment, stats.total('weapon.enchantMain'))
    }
    if (wm.attackBonus !== undefined) {
      push('weaponMain.attackBonus', wm.attackBonus, stats.total('melee.toHit'))
    }
    // A fractional [W] multiplier (5.85): compared in hundredths, since the
    // diff truncates V3's side to V2's integer display.
    if (wm.baseDamage !== undefined) {
      push('weaponMain.baseDamage', Math.round(wm.baseDamage * 100), Math.round(stats.total('weapon.baseDamage') * 100))
    }
    if (wm.damageBonus !== undefined) {
      push('weaponMain.damageBonus', wm.damageBonus, stats.total('melee.damage'))
    }
    // Critical lines: the standard line is the base, plus the crit-only pools
    // (BreakdownItemWeaponAttackBonus/DamageBonus in critical-effects mode).
    if (wm.critAttackBonus !== undefined) {
      push('weaponMain.critAttackBonus', wm.critAttackBonus,
        stats.total('melee.toHit') + stats.total('melee.crit.toHit'))
    }
    if (wm.critDamageBonus !== undefined) {
      push('weaponMain.critDamageBonus', wm.critDamageBonus,
        stats.total('melee.damage') + stats.total('melee.crit.damage'))
    }
    const w = stats.weapon
    if (wm.critThreatRange !== undefined) {
      const base = w?.critThreatRange ?? 1
      push('weaponMain.critThreatRange', wm.critThreatRange,
        base + stats.total('weapon.threatRange') + stats.total('melee.crit.range'))
    }
    if (wm.critMultiplier !== undefined) {
      const base = w?.critMultiplier ?? 2
      push('weaponMain.critMultiplier', wm.critMultiplier,
        base + stats.total('melee.crit.multiplier'))
    }
    if (wm.critMultiplier19To20 !== undefined) {
      push('weaponMain.critMultiplier19To20', wm.critMultiplier19To20,
        critProfile(k => stats.total(k), w).multiplier19to20)
    }
    if (wm.attackSpeed !== undefined) {
      push('weaponMain.attackSpeed', wm.attackSpeed,
        stats.total('weapon.alacrity') + stats.total('melee.alacrity'))
    }
    if (wm.vorpalRange !== undefined) {
      // V2's line has a base of 1 (a natural 20 is always vorpal).
      push('weaponMain.vorpalRange', wm.vorpalRange, 1 + stats.total('weapon.vorpalRange'))
    }
    if (wm.ghostTouch !== undefined) {
      push('weaponMain.ghostTouch', wm.ghostTouch, stats.total('ghostTouch'))
    }
    if (wm.trueSeeing !== undefined) {
      push('weaponMain.trueSeeing', wm.trueSeeing, stats.total('trueSeeing'))
    }
  }

  // Off-hand weapon crit lines: V2 keeps a separate breakdown per hand
  // (BreakdownItemWeaponEffects), fed by the off-hand item's base lines and
  // only the effects that name its weapon type or group.
  const wo = oracle.weaponOffhand
  if (wo !== undefined && isOffhandSlotWeapon(stats.offhandWeapon)) {
    const oc = critProfile(k => stats.total(k), stats.offhandWeapon, { offhand: true })
    if (wo.critThreatRange !== undefined) {
      push('weaponOffhand.critThreatRange', wo.critThreatRange, oc.baseThreatFaces + oc.bonusThreatFaces)
    }
    if (wo.critMultiplier !== undefined) {
      push('weaponOffhand.critMultiplier', wo.critMultiplier, oc.multiplier)
    }
    if (wo.critMultiplier19To20 !== undefined) {
      push('weaponOffhand.critMultiplier19To20', wo.critMultiplier19To20, oc.multiplier19to20)
    }
    if (wo.attackBonus !== undefined) {
      push('weaponOffhand.attackBonus', wo.attackBonus, stats.total('offhand.toHit'))
    }
    if (wo.baseDamage !== undefined) {
      push('weaponOffhand.baseDamage', Math.round(wo.baseDamage * 100), Math.round(stats.total('offhand.baseDamage') * 100))
    }
    if (wo.damageBonus !== undefined) {
      push('weaponOffhand.damageBonus', wo.damageBonus, stats.total('offhand.damage'))
    }
    if (wo.critAttackBonus !== undefined) {
      push('weaponOffhand.critAttackBonus', wo.critAttackBonus,
        stats.total('offhand.toHit') + stats.total('offhand.crit.toHit'))
    }
    if (wo.critDamageBonus !== undefined) {
      push('weaponOffhand.critDamageBonus', wo.critDamageBonus,
        stats.total('offhand.damage') + stats.total('offhand.crit.damage'))
    }
    if (wo.enchantment !== undefined) {
      push('weaponOffhand.enchantment', wo.enchantment, stats.total(offhandEnchantKey(stats.offhandWeapon)))
    }
    if (wo.attackSpeed !== undefined) {
      push('weaponOffhand.attackSpeed', wo.attackSpeed,
        stats.total('offhand.alacrity') + stats.total('melee.alacrity'))
    }
    if (wo.vorpalRange !== undefined) {
      push('weaponOffhand.vorpalRange', wo.vorpalRange, 1 + stats.total('offhand.vorpalRange'))
    }
    // V2 BreakdownItemWeaponEffects::AffectsUs routes every GhostTouch and
    // TrueSeeing effect to both hands, so the off-hand lines equal the build's.
    if (wo.ghostTouch !== undefined) {
      push('weaponOffhand.ghostTouch', wo.ghostTouch, stats.total('ghostTouch'))
    }
    if (wo.trueSeeing !== undefined) {
      push('weaponOffhand.trueSeeing', wo.trueSeeing, stats.total('trueSeeing'))
    }
  }

  // V2 BreakdownItemEnergyAbsorption::Total is MULTIPLICATIVE:
  // 100 - 100·∏(1 - aᵢ/100) over the active (post-non-stacking) effects,
  // after V2's identical-effect merge. V3 pools the same effects additively
  // under absorb.<type>; absorptionTotal() recombines them V2-style.
  for (const [name, v2v] of Object.entries(oracle.energyAbsorption ?? {})) {
    push(`absorb.${name}`, Math.trunc(v2v), absorptionTotal(stats.resolve(`absorb.${name}`).bonuses))
  }

  return rows
}

/**
 * Returns the rows whose truncated values differ by more than `tol`.
 * The oracle prints V2's running double cast to (int) — v2calc main.cpp
 * `(int)v` — exactly like V2's UI, so V3's double is truncated the same way
 * before comparing (fractional contributions like Rapid Shot's 1.5 × BAB
 * must not produce phantom sub-integer mismatches).
 */
export function diffParityRows(rows: ParityRow[], tol = 0): ParityRow[] {
  return rows
    .map(r => ({ ...r, v3: Math.trunc(r.v3) }))
    .filter(r => Math.abs(r.v2 - r.v3) > tol)
}
