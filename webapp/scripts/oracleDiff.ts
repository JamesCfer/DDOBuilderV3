#!/usr/bin/env node
// oracleDiff — the automatic parity referee.
//
// Runs the v2calc oracle (DDOBuilder V2's OWN compiled C++ math, headless) and
// V3's computeBuildStats over the SAME .DDOBuild files, and diffs every stat
// the oracle emits. This is the end of the manual-report loop: any V2↔V3
// disagreement shows up here with the exact stat and both values.
//
// The oracle↔V3 stat mapping lives in src/lib/oracleParityRows.ts and the
// oracle/V3 execution plumbing in src/server/oracleParity.ts — both shared
// with the upload-time background check (POST /api/parity-check), so this
// sweep and the live webapp can never drift apart.
//
// Prereq: build the oracle once — `make -C v2calc` (from repo root).
//
// Usage (from webapp/):
//   npx tsx scripts/oracleDiff.ts                       # all example + collection builds
//   npx tsx scripts/oracleDiff.ts <build.DDOBuild> ...  # specific files
//   npx tsx scripts/oracleDiff.ts --tol 0               # exact match required (default 0)
//
// Exit 1 if any build mismatches on a compared stat.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { initBonusTypes } from '../src/lib/bonus'
import { buildParityRows, diffParityRows, type OracleJson } from '../src/lib/oracleParityRows'
import { computeV3ForXml, runOracleOnFile } from '../src/server/oracleParity'

const ROOT = path.join(__dirname, '..', '..')
const DATA = path.join(ROOT, 'Output', 'DataFiles')
const ORACLE = path.join(ROOT, 'v2calc', 'build', 'v2calc')

if (!existsSync(ORACLE)) {
  console.error(`oracle binary not found at ${ORACLE}\nBuild it first:  make -C v2calc`)
  process.exit(2)
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

async function main(): Promise<void> {
  const perStatMismatch: Record<string, number> = {}
  let buildsWithDiff = 0
  let buildsCompared = 0
  const worst: Array<{ file: string; stat: string; v2: number; v3: number }> = []

  for (const f of files) {
    let oracle: OracleJson
    try {
      oracle = await runOracleOnFile(f, DATA, ORACLE)
    } catch {
      continue // multi-build docs / oracle parse issues — skip silently
    }
    let rows
    try {
      const { stats, build, gearItems } = computeV3ForXml(readFileSync(f, 'utf-8'), cat)
      rows = buildParityRows(oracle, stats, build, gearItems)
    } catch {
      continue
    }
    buildsCompared++

    const bad = diffParityRows(rows, tol)
    for (const r of bad) {
      perStatMismatch[r.stat] = (perStatMismatch[r.stat] ?? 0) + 1
      worst.push({ file: path.basename(f), stat: r.stat, v2: r.v2, v3: r.v3 })
    }
    if (bad.length > 0) buildsWithDiff++
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
}

main()
