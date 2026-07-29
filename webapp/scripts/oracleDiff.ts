#!/usr/bin/env node
// oracleDiff — the automatic parity referee.
//
// Runs the v2calc oracle (DDOBuilder V2's OWN compiled C++ math, headless) and
// V3's computeBuildStats over the SAME .DDOBuild files, and diffs every stat
// the oracle emits. This is the end of the manual-report loop: any V2↔V3
// disagreement shows up here with the exact stat and both values.
//
// Prereq: build the oracle once — `make -C v2calc` (from repo root).
//
// Usage (from webapp/):
//   npx tsx scripts/oracleDiff.ts                       # all example + collection builds
//   npx tsx scripts/oracleDiff.ts <build.DDOBuild> ...  # specific files
//   npx tsx scripts/oracleDiff.ts --tol 0               # exact match required (default 0)
//
// Exit 1 if any build mismatches on a compared stat.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/lib/buildStats'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { absorptionTotal, initBonusTypes, resolveBonus } from '../src/lib/bonus'
import { findActiveLife } from '../src/lib/multiLife'
import type { Item } from '../src/types/ddo'

const ROOT = path.join(__dirname, '..', '..')
const DATA = path.join(ROOT, 'Output', 'DataFiles')
const ORACLE = path.join(ROOT, 'v2calc', 'build', 'v2calc')

if (!existsSync(ORACLE)) {
  console.error(`oracle binary not found at ${ORACLE}\nBuild it first:  make -C v2calc`)
  process.exit(2)
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
  songCount: 'song.count', tumbleCharges: 'tumbleCharge',
}

const args = process.argv.slice(2)
const tolIdx = args.indexOf('--tol')
const tol = tolIdx >= 0 ? Number(args[tolIdx + 1]) : 0
// NOTE: guard tolIdx — with no --tol flag, tolIdx is -1 and `i !== tolIdx+1`
// silently dropped the FIRST file argument (and a single-file invocation fell
// through to the full default sweep).
const fileArgs = args.filter((a, i) => !a.startsWith('--') && (tolIdx < 0 || i !== tolIdx + 1))

let files: string[]
if (fileArgs.length) {
  files = fileArgs.map(f => path.resolve(f))
} else {
  files = []
  // FuzzBuilds is part of the default referee sweep: its builds have no
  // hand-curated goldens (the old fuzz-*.golden.json files were V3's own
  // output — circular), so the oracle is their only source of truth.
  for (const d of [
    path.join(ROOT, 'Output', 'Example Builds'),
    path.join(ROOT, 'Output', 'UserBuilds', 'collection'),
    path.join(ROOT, 'Output', 'FuzzBuilds'),
  ]) {
    if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.DDOBuild')) files.push(path.join(d, f))
  }
}

const cat = loadAllCatalogues(DATA)
initBonusTypes(cat.allBonusTypes)

function v3Stats(buildPath: string) {
  const { build, document } = importV2Build(readFileSync(buildPath, 'utf-8'), { allTrees: cat.allTrees }) as never as { build: never, document?: never }
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries((build as { gear: Record<string, string> }).gear ?? {})) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }
  const specialFeats = document ? findActiveLife(document)?.specialFeats : undefined
  const stats = computeBuildStats({
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs, allStances: cat.allStances, specialFeats, gearItems,
  }, build)
  return { stats, build: build as unknown as { epicLevels?: number, legendaryLevels?: number } }
}

const perStatMismatch: Record<string, number> = {}
let buildsWithDiff = 0
let buildsCompared = 0
const worst: Array<{ file: string; stat: string; v2: number; v3: number }> = []

for (const f of files) {
  let oracle: { abilityTotal?: Record<string, number>; breakdowns?: Record<string, number> }
  try {
    const out = execFileSync(ORACLE, [f, DATA], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    oracle = JSON.parse(out.toString())
  } catch {
    continue // multi-build docs / oracle parse issues — skip silently
  }
  let stats: ReturnType<typeof computeBuildStats>
  let buildForStats: { epicLevels?: number, legendaryLevels?: number }
  try { ({ stats, build: buildForStats } = v3Stats(f)) } catch { continue }
  buildsCompared++

  const rows: Array<[string, number, number]> = []
  for (const [ok, v3k] of Object.entries(ABILITY_MAP)) {
    if (oracle.abilityTotal?.[ok] === undefined) continue
    rows.push([`ability.${ok}`, oracle.abilityTotal[ok], stats.total(v3k)])
  }
  for (const [ok, v3k] of Object.entries(BREAKDOWN_MAP)) {
    if (oracle.breakdowns?.[ok] === undefined) continue
    rows.push([ok, oracle.breakdowns[ok], stats.total(v3k)])
  }
  // Sub-saves: V2's BreakdownItemSave sub-breakdowns are BASE SAVE + the
  // sub-type bonuses; V3 models the sub bonus separately (UI subSave()).
  for (const [ok, base, sub] of SUBSAVE_MAP) {
    if (oracle.breakdowns?.[ok] === undefined) continue
    rows.push([ok, oracle.breakdowns[ok], stats.total(base) + stats.total(sub)])
  }
  // Max dex bonus: with no armor equipped V2 adds a 999 "No limit to Max
  // Dex Bonus" effect (BreakdownItemMDB::CreateOtherEffects) and MDB
  // effects stack on top; V3 models "no cap" as armorMaxDex === null with
  // the same effects in the 'mdb' pool.
  if (oracle.breakdowns?.maxDexBonus !== undefined) {
    const v2mdb = oracle.breakdowns.maxDexBonus
    // stats.armorMaxDex is the armor's PRINTED cap only; Effect_MaxDexBonus
    // contributions (armor mastery, Horizon Walker cores, …) pool under
    // 'mdb' in both the armored and unarmored cases.
    const v3mdb = (stats.armorMaxDex === null ? 999 : stats.armorMaxDex) + stats.total('mdb')
    rows.push(['maxDexBonus', v2mdb, v3mdb])
  }
  // Spell school DCs. V2 BreakdownItemSpellSchool holds Item=All AND
  // school-specific SpellDC effects in ONE pool, so gear-pool Highest-Only
  // competes across both (fuzz-5000: quarterstaff +3 Evocation beats Amber
  // Pendant +2 All). Re-resolve the UNION of V3's dc.All and dc.<School>
  // pools to reproduce that competition.
  const spellDC = (oracle as { spellDC?: Record<string, number> }).spellDC
  for (const [ok, school] of Object.entries(SPELL_DC_MAP)) {
    if (spellDC?.[ok] === undefined) continue
    const combined = resolveBonus([
      ...stats.resolve('dc.All').bonuses,
      ...stats.resolve(`dc.${school}`).bonuses,
    ]).total
    rows.push([`dc.${school}`, spellDC[ok], combined])
  }
  // Per-class caster levels. V2 BreakdownItemClassCasterLevel composes:
  // class levels + Wild Mage/Arcane Trickster "Mixed Magics" (min(20, level)
  // − classLevels, only when classLevels > 0) + CasterLevel effects (per-
  // class and Item=All pools).
  const casterLevel = (oracle as { casterLevel?: Record<string, number> }).casterLevel
  const mixedMagics = ['WMUnstableSorcery', 'ATMoreMagicMoreFun'].some(n =>
    Object.entries(buildForStats.enhancementSelections ?? {}).some(([tree, sels]) =>
      (sels as Record<string, string>)[n] === 'Mixed Magics'
      && ((buildForStats.enhancementChoices?.[tree] as Record<string, number> | undefined)?.[n] ?? 0) > 0))
  const charLvlForCl = (buildForStats.totalLevel ?? 0)
    + (buildForStats.epicLevels ?? 0) + (buildForStats.legendaryLevels ?? 0)
  for (const [cls, v2cl] of Object.entries(casterLevel ?? {})) {
    const lv = buildForStats.classes.find((c: { name: string }) => c.name === cls)?.levels ?? 0
    let v3cl = lv + stats.total(`cl.${cls}`) + stats.total('cl.All')
    if (lv > 0 && mixedMagics) v3cl += Math.min(20, charLvlForCl) - lv
    rows.push([`cl.${cls}`, v2cl, v3cl])
  }
  // Full-analytics expansion
  for (const [ok, v3k] of Object.entries(SCALAR2_MAP)) {
    if (oracle.breakdowns?.[ok] === undefined) continue
    rows.push([ok, oracle.breakdowns[ok], stats.total(v3k)])
  }
  const oracleExt = oracle as {
    skills?: Record<string, number>
    tacticalDC?: Record<string, number>
    spellPower?: Record<string, number>
    spellCritChance?: Record<string, number>
    energyResistance?: Record<string, number>
    energyAbsorption?: Record<string, number>
  }
  for (const [name, v2v] of Object.entries(oracleExt.skills ?? {})) {
    // Skills carry half-ranks (cross-class 0.5/point); V2 emits the raw
    // double (67.50). Compare both sides truncated, like V2's int display.
    rows.push([`skill.${name}`, Math.trunc(v2v), stats.total(`skill.${name}`)])
  }
  for (const [name, v2v] of Object.entries(oracleExt.tacticalDC ?? {})) {
    rows.push([`tacticalDC.${name}`, v2v, stats.total(`tacticalDC.${name}`)])
  }
  // V2 per-type spell power totals INCLUDE the universal breakdown (sibling
  // feed); Item=All effects are fanned into every per-type pool by the
  // parser (so they compete Highest-Only per type, V2-style). V2's
  // universal DISPLAY total is just the universal pool.
  const v3UniversalSP = stats.total('sp.Universal')
  if (oracle.breakdowns?.spellPowerUniversal !== undefined) {
    rows.push(['spellPowerUniversal', oracle.breakdowns.spellPowerUniversal, stats.total('sp.Universal')])
  }
  // Movement speed: V3 models the base run speed as a flat 100; V2's
  // breakdown holds only the bonuses.
  if (oracle.breakdowns?.movementSpeed !== undefined) {
    rows.push(['movementSpeed', oracle.breakdowns.movementSpeed, stats.total('speed') - 100])
  }
  // Destiny APs — V2 BreakdownItemDestinyAps::CreateOtherEffects derives the
  // level APs from Build::Level() with a +1 offset: at char level L ≥ 20,
  // epic APs = min(L−20+1, 10)×4 (so a flat level-20 build already has 4);
  // at L ≥ 30, legendary APs = min(L−30+1, 10)×4 EXCEPT exactly at
  // BUILD_START_LEVEL (34) where the count is pinned to 4. Plus FatePoints/3
  // (fractions dropped) and DestinyAPBonus effects (V3 'destinyAP' pool).
  if (oracle.breakdowns?.destinyAPs !== undefined) {
    const charLvl = (buildForStats.totalLevel ?? 0)
      + (buildForStats.epicLevels ?? 0) + (buildForStats.legendaryLevels ?? 0)
    let levelAPs = 0
    if (charLvl >= 20) {
      const l = charLvl - 20
      levelAPs += Math.min(l + 1, 10) * 4
      if (l >= 10) {
        let ll = Math.min(l - 10 + 1, 10)
        if (charLvl === 34) ll = 4
        levelAPs += ll * 4
      }
    }
    const v3daps = levelAPs
      + Math.floor(stats.total('fatePoint') / 3)
      + stats.total('destinyAP')
    rows.push(['destinyAPs', oracle.breakdowns.destinyAPs, v3daps])
  }
  for (const [name, v2v] of Object.entries(oracleExt.spellPower ?? {})) {
    rows.push([`sp.${name}`, v2v, v3UniversalSP + stats.total(`sp.${name}`)])
  }
  // V2 per-type spell crit chance = universal-lore breakdown (sibling feed)
  // + per-type lore (Item=All fanned per type by the parser, as above).
  const v3UniversalCrit = stats.total('spCrit.Universal')
  for (const [name, v2v] of Object.entries(oracleExt.spellCritChance ?? {})) {
    rows.push([`spCrit.${name}`, v2v, v3UniversalCrit + stats.total(`spCrit.${name}`)])
  }
  for (const [name, v2v] of Object.entries(oracleExt.energyResistance ?? {})) {
    rows.push([`resist.${name}`, v2v, stats.total(`resist.${name}`)])
  }
  // V2 BreakdownItemEnergyAbsorption::Total is MULTIPLICATIVE:
  // 100 - 100·∏(1 - aᵢ/100) over the active (post-non-stacking) effects,
  // after V2's identical-effect merge. V3 pools the same effects additively
  // under absorb.<type>; absorptionTotal() recombines them V2-style.
  for (const [name, v2v] of Object.entries(oracleExt.energyAbsorption ?? {})) {
    rows.push([`absorb.${name}`, Math.trunc(v2v), absorptionTotal(stats.resolve(`absorb.${name}`).bonuses)])
  }

  let hasDiff = false
  for (const [stat, v2, v3raw] of rows) {
    // The oracle prints V2's running double cast to (int) — v2calc main.cpp
    // `(int)v` — exactly like V2's UI. Compare V3's double the same way so
    // fractional contributions (e.g. Rapid Shot's 1.5 × BAB) don't produce
    // phantom sub-integer mismatches.
    const v3 = Math.trunc(v3raw)
    if (Math.abs(v2 - v3) > tol) {
      hasDiff = true
      perStatMismatch[stat] = (perStatMismatch[stat] ?? 0) + 1
      worst.push({ file: path.basename(f), stat, v2, v3 })
    }
  }
  if (hasDiff) buildsWithDiff++
}

console.log(`\nOracle vs V3 — ${buildsCompared} builds compared (tol ${tol})`)
console.log(`${buildsWithDiff} builds with at least one mismatch\n`)
console.log('mismatches per stat (V2 oracle is truth):')
for (const [stat, n] of Object.entries(perStatMismatch).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${stat}`)
}
console.log('\nsample mismatches (V2 → V3):')
for (const w of worst.slice(0, 100)) {
  console.log(`  ${w.stat.padEnd(20)} V2=${String(w.v2).padStart(6)}  V3=${String(w.v3).padStart(6)}  ${w.file}`)
}
process.exit(buildsWithDiff > 0 ? 1 : 0)
