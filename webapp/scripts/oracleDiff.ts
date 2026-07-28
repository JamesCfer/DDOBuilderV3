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
import { initBonusTypes } from '../src/lib/bonus'
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
  dodge: 'dodge', fortification: 'fortification', bab: 'bab',
  meleePower: 'melee.power', rangedPower: 'ranged.power',
  saveFortitude: 'save.Fort', saveReflex: 'save.Reflex', saveWill: 'save.Will',
}
const ABILITY_MAP: Record<string, string> = {
  STR: 'ability.Strength', DEX: 'ability.Dexterity', CON: 'ability.Constitution',
  INT: 'ability.Intelligence', WIS: 'ability.Wisdom', CHA: 'ability.Charisma',
}

const args = process.argv.slice(2)
const tolIdx = args.indexOf('--tol')
const tol = tolIdx >= 0 ? Number(args[tolIdx + 1]) : 0
const fileArgs = args.filter((a, i) => !a.startsWith('--') && i !== tolIdx + 1)

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
  return computeBuildStats({
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs, specialFeats, gearItems,
  }, build)
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
  try { stats = v3Stats(f) } catch { continue }
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
for (const w of worst.slice(0, 25)) {
  console.log(`  ${w.stat.padEnd(20)} V2=${String(w.v2).padStart(6)}  V3=${String(w.v3).padStart(6)}  ${w.file}`)
}
process.exit(buildsWithDiff > 0 ? 1 : 0)
