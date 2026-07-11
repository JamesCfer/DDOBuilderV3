// Wide fuzz sweep — every self-check that runs without V2, over many seeds.
//
//   npx tsx scripts/fuzzSweep.ts [--from 9000] [--to 9099]
//
// Per seed: generate → validateBuild (legality replay) → .DDOBuild round-trip
// field equality → computeBuildStats with anomaly detection (NaN/Infinity in
// any stat key, non-positive HP, absurd totals). Prints every finding; exit 1
// if anything is broken. This is the "compare" we can run in CI — the V2
// golden compare additionally needs numbers captured from V2 on Windows.

import path from 'path'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { generateRandomBuild, validateBuild } from '../src/lib/fuzz/randomBuild'
import { computeBuildStats } from '../src/lib/buildStats'
import type { BuildStatsInput } from '../src/lib/buildStats'
import { initBonusTypes } from '../src/lib/bonus'
import { exportV2Build } from '../src/lib/v2Export'
import { importV2Build } from '../src/lib/v2Import'
import type { CharacterBuild, Item } from '../src/types/ddo'

function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : dflt
}

const FROM = arg('from', 9000)
const TO = arg('to', 9099)

const DATA_DIR = path.resolve(path.join(__dirname, '..', '..', 'Output', 'DataFiles'))
const cat = loadAllCatalogues(DATA_DIR)
initBonusTypes(cat.allBonusTypes)
const itemByName = new Map(cat.allItems.map(i => [i.Name, i]))

function statsInput(build: CharacterBuild): BuildStatsInput {
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    const item = name ? itemByName.get(name) : undefined
    if (item) gearItems[slot] = item
  }
  return {
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs, gearItems,
  }
}

/** Key-order-insensitive deep canonical form (objects sorted; arrays kept ordered). */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, val]) => `${JSON.stringify(k)}:${canon(val)}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

/** First few concrete differences between two records, for diagnosis. */
function diffDetail(a: unknown, b: unknown): string {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return `${canon(a)} vs ${canon(b)}`
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()
  const diffs: string[] = []
  for (const k of keys) {
    if (canon(ra[k]) !== canon(rb[k])) diffs.push(`${k}: ${canon(ra[k])} → ${canon(rb[k])}`)
    if (diffs.length >= 3) break
  }
  return diffs.join('; ')
}

interface Finding { seed: number; kind: string; detail: string }
const findings: Finding[] = []
const found = (seed: number, kind: string, detail: string) => {
  findings.push({ seed, kind, detail })
  console.log(`  ✗ [${kind}] seed ${seed}: ${detail}`)
}

let ok = 0
for (let seed = FROM; seed <= TO; seed++) {
  try {
    const { build } = generateRandomBuild(cat, { seed })

    // 1. Legality replay
    for (const p of validateBuild(cat, build)) found(seed, 'ILLEGAL', p)

    // 2. Round-trip
    try {
      const imported = importV2Build(exportV2Build(build)).build
      const fields: Array<[string, unknown, unknown]> = [
        ['race', build.race, imported.race],
        ['levelClasses', build.levelClasses, imported.levelClasses],
        ['baseAbilities', build.baseAbilities, imported.baseAbilities],
        ['abilityLevelUps', build.abilityLevelUps, imported.abilityLevelUps],
        ['featChoices', build.featChoices, imported.featChoices],
        ['enhancementChoices', build.enhancementChoices, imported.enhancementChoices],
        ['enhancementSelections', build.enhancementSelections, imported.enhancementSelections],
        ['gear', build.gear, imported.gear],
      ]
      for (const [name, a, b] of fields) {
        if (canon(a) !== canon(b)) {
          found(seed, 'ROUNDTRIP', `${name} differs after export→import: ${diffDetail(a, b)}`)
        }
      }
    } catch (e) {
      found(seed, 'ROUNDTRIP', `threw: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 3. Stats anomalies
    try {
      const stats = computeBuildStats(statsInput(build), build)
      for (const key of stats.keys()) {
        const t = stats.total(key)
        if (Number.isNaN(t)) found(seed, 'NAN', `stat ${key} is NaN`)
        else if (!Number.isFinite(t)) found(seed, 'INF', `stat ${key} is ${t}`)
        else if (Math.abs(t) > 100_000) found(seed, 'ABSURD', `stat ${key} = ${t}`)
      }
      const hp = stats.total('hp')
      if (hp <= 0) found(seed, 'ANOMALY', `hp = ${hp} (must be > 0 at L${build.totalLevel})`)
      if (stats.total('bab') < 0) found(seed, 'ANOMALY', `bab = ${stats.total('bab')}`)
      if (stats.total('ac') < 10) found(seed, 'ANOMALY', `ac = ${stats.total('ac')} (< base 10)`)
    } catch (e) {
      found(seed, 'STATS-THROW', e instanceof Error ? e.message : String(e))
    }

    if (!findings.some(f => f.seed === seed)) ok++
  } catch (e) {
    found(seed, 'GENERATE-THROW', e instanceof Error ? e.message : String(e))
  }
}

const total = TO - FROM + 1
console.log(`\n${ok}/${total} seeds fully clean; ${findings.length} finding(s) across ${new Set(findings.map(f => f.seed)).size} seed(s)`)
const byKind = new Map<string, number>()
for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1)
for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`)
process.exit(findings.length > 0 ? 1 : 0)
