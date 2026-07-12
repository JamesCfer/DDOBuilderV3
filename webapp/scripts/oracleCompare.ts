// Batch parity comparison: v2calc (real V2 math) vs V3 computeBuildStats,
// across every Output/FuzzBuilds/*.DDOBuild. Diffs the stats the oracle
// currently emits: level, race, classes, inherent ability scores
// (point-buy + racial + level-ups + tomes, NO gear/enhancement effects —
// V2 Build::AbilityAtLevel), and BAB.
//
//   cd webapp && npx tsx scripts/oracleCompare.ts
//
// Exit 1 if any build shows a mismatch.

import { execFileSync } from 'child_process'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/lib/buildStats'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { initBonusTypes } from '../src/lib/bonus'
import type { CharacterBuild, DDOClass, Race, Item } from '../src/types/ddo'

const ROOT = path.join(__dirname, '..', '..')
const DATA = path.join(ROOT, 'Output', 'DataFiles')
const BUILDS = path.join(ROOT, 'Output', 'FuzzBuilds')
const V2CALC = path.join(ROOT, 'v2calc', 'build', 'v2calc')

const cat = loadAllCatalogues(DATA)
initBonusTypes(cat.allBonusTypes)

const ABBR = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const
const AB_FULL = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const

function abMod(score: number): number { return Math.floor((score - 10) / 2) }

/**
 * V3's inherent ability at total level — the same quantity v2calc emits via
 * Build::AbilityAtLevel(…, includeTomes=true): point-buy base + racial mod +
 * spent level-up increments + tome. Deliberately excludes gear/enhancement
 * effects (those are the fully-buffed `ability.*` stat, not comparable here).
 */
function v3InherentAbility(build: CharacterBuild, race: Race | undefined, ab: typeof AB_FULL[number]): number {
  let v = build.baseAbilities[ab] ?? 8
  // racial modifier — stored as a top-level numeric key on the Race
  // (e.g. Wood Elf {Dexterity:2, Intelligence:-2}), exactly as buildStats.ts:937.
  v += race ? Number((race as unknown as Record<string, number>)[ab]) || 0 : 0
  // level-up increments (every 4th level picks an ability)
  for (const lvl of Object.keys(build.abilityLevelUps ?? {})) {
    if ((build.abilityLevelUps as Record<string, string>)[lvl] === ab) v += 1
  }
  // tome
  v += Number((build.abilityTomes ?? {})[ab] ?? 0)
  return v
}

function v3Bab(build: CharacterBuild): number {
  const gearItems: Record<string, Item> = {}
  for (const [s, n] of Object.entries(build.gear)) {
    const it = cat.allItems.find(i => i.Name === n); if (it) gearItems[s] = it
  }
  const stats = computeBuildStats({
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs, allItemBuffs: cat.allItemBuffs,
    gearItems,
  } as never, build)
  // V2 BaseAttackBonus is capped at MAX_BAB (25); V3 exposes the raw sum.
  return Math.min(25, stats.total('bab'))
}

interface Row { file: string; mismatches: string[] }
const rows: Row[] = []
const files = readdirSync(BUILDS).filter(f => /\.DDOBuild$/.test(f)).sort()

for (const f of files) {
  const full = path.join(BUILDS, f)
  let v2: Record<string, unknown>
  try {
    // v2calc resolves its data dir relative to CWD unless given explicitly —
    // pass the absolute DataFiles path and run from the repo root.
    const out = execFileSync(V2CALC, [full, DATA], { encoding: 'utf-8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
    v2 = JSON.parse(out)
  } catch (e) {
    rows.push({ file: f, mismatches: [`v2calc failed: ${e instanceof Error ? e.message : e}`] })
    continue
  }

  const { build } = importV2Build(readFileSync(full, 'utf-8'))
  const race = cat.allRaces.find(r => r.Name === build.race)
  const mm: string[] = []

  // level
  if (v2.level !== build.totalLevel) mm.push(`level: V2=${v2.level} V3=${build.totalLevel}`)
  // race
  if (v2.race !== build.race) mm.push(`race: V2="${v2.race}" V3="${build.race}"`)
  // classes (set-equality; V2 pads with "Unknown")
  const v2Classes = (v2.classes as string[]).filter(c => c && c !== 'Unknown').sort()
  const v3Classes = build.classes.filter(c => c.name && c.levels > 0).map(c => c.name).sort()
  if (v2Classes.join('|') !== v3Classes.join('|')) mm.push(`classes: V2=[${v2Classes}] V3=[${v3Classes}]`)
  // BAB
  const v2bab = Number(v2.baseAttackBonus)
  const v3bab = v3Bab(build)
  if (v2bab !== v3bab) mm.push(`BAB: V2=${v2bab} V3=${v3bab}`)
  // inherent abilities
  const v2ab = v2.abilityBase as Record<string, number>
  for (let i = 0; i < 6; i++) {
    const v3v = v3InherentAbility(build, race, AB_FULL[i])
    if (v2ab[ABBR[i]] !== v3v) mm.push(`${ABBR[i]}: V2=${v2ab[ABBR[i]]}(mod ${abMod(v2ab[ABBR[i]])}) V3=${v3v}(mod ${abMod(v3v)})`)
  }

  rows.push({ file: f, mismatches: mm })
}

let bad = 0
for (const r of rows) {
  if (r.mismatches.length === 0) {
    console.log(`✓ ${r.file}`)
  } else {
    bad++
    console.log(`✗ ${r.file}`)
    for (const m of r.mismatches) console.log(`    ${m}`)
  }
}
console.log(`\n${rows.length - bad}/${rows.length} builds match on {level,race,classes,BAB,inherent abilities}`)
if (bad > 0) process.exit(1)
