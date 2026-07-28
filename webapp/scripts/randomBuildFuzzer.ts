// Random-build parity fuzzer (V2 vs V3) — CLI.
//
//   npx tsx scripts/randomBuildFuzzer.ts generate [--count 5] [--seed 1000]
//       [--out ../Output/FuzzBuilds] [--data ../Output/DataFiles]
//   npx tsx scripts/randomBuildFuzzer.ts compare [--dir ../Output/FuzzBuilds]
//       [--data ../Output/DataFiles]
//
// `generate` writes, per build:
//   fuzz-<seed>.DDOBuild      — open this in V2 (Windows) to read its numbers
//   fuzz-<seed>.v3stats.json  — V3's stat totals (a filled golden template)
//   fuzz-<seed>.golden.json   — SAME template; REPLACE values with V2's
//                               BreakdownsPane numbers, then run `compare`
//   fuzz-<seed>.log.txt       — every random decision the generator made
//
// `compare` re-imports each .DDOBuild, recomputes V3 stats, and diffs them
// against the (V2-filled) golden file via lib/goldenCompare. Exit 1 on any
// mismatch — each failing stat key is a V3 parity bug to investigate.

import fs from 'fs'
import path from 'path'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { generateRandomBuild, validateBuild } from '../src/lib/fuzz/randomBuild'
import { computeBuildStats } from '../src/lib/buildStats'
import type { BuildStatsInput } from '../src/lib/buildStats'
import { initBonusTypes } from '../src/lib/bonus'
import { exportV2Build } from '../src/lib/v2Export'
import { importV2Build } from '../src/lib/v2Import'
import { captureTemplate, compareAgainstGolden, formatReport } from '../src/lib/goldenCompare'
import type { GoldenFile } from '../src/lib/goldenCompare'
import type { CharacterBuild, Item } from '../src/types/ddo'

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

const DATA_DIR = path.resolve(arg('data', path.join(__dirname, '..', '..', 'Output', 'DataFiles')))
const cat = loadAllCatalogues(DATA_DIR)
initBonusTypes(cat.allBonusTypes)

function statsFor(build: CharacterBuild) {
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }
  const input: BuildStatsInput = {
    allClasses: cat.allClasses,
    allRaces: cat.allRaces,
    allFeats: cat.allFeats,
    allTrees: cat.allTrees,
    allSelfBuffs: cat.allSelfBuffs,
    allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses,
    allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees,
    allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells,
    allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs,
    gearItems,
  }
  return computeBuildStats(input, build)
}

function generate() {
  const count = parseInt(arg('count', '5'), 10)
  const seedBase = parseInt(arg('seed', '1000'), 10)
  const outDir = path.resolve(arg('out', path.join(__dirname, '..', '..', 'Output', 'FuzzBuilds')))
  fs.mkdirSync(outDir, { recursive: true })

  const itemLookup = new Map(cat.allItems.map(i => [i.Name, i]))
  let bad = 0

  for (let i = 0; i < count; i++) {
    const seed = seedBase + i
    const { build, log } = generateRandomBuild(cat, { seed })
    const problems = validateBuild(cat, build)
    if (problems.length > 0) {
      bad++
      console.error(`✗ seed ${seed}: generator produced an ILLEGAL build:`)
      problems.forEach(p => console.error(`    ${p}`))
      continue
    }

    const stats = statsFor(build)
    const buildFile = `fuzz-${seed}.DDOBuild`

    fs.writeFileSync(path.join(outDir, buildFile), exportV2Build(build, itemLookup))
    // NOTE: this script used to also emit fuzz-<seed>.golden.json /
    // .v3stats.json "golden templates" pre-filled with V3's OWN totals — a
    // circular baseline (V3 validated against V3) that was never replaced
    // with real V2 captures. The v2calc oracle (scripts/oracleDiff.ts, which
    // scans Output/FuzzBuilds by default) now referees these builds with
    // V2's actual compiled math, so the templates are gone for good.
    fs.writeFileSync(path.join(outDir, `fuzz-${seed}.log.txt`), log.join('\n') + '\n')

    console.log(`✓ seed ${seed}: ${build.name} — hp ${stats.total('hp')}, ac ${stats.total('ac')}, ` +
      `prr ${stats.total('prr')} → ${buildFile}`)
  }

  console.log(`\n${count - bad}/${count} builds written to ${outDir}`)
  console.log('Next: referee them against V2\'s own compiled math with:')
  console.log('  make -C v2calc && npx tsx scripts/oracleDiff.ts')
  if (bad > 0) process.exit(1)
}

// `compare` mode still accepts hand-captured fuzz-<seed>.golden.json files
// (real V2 BreakdownsPane numbers) if any exist, but the standard referee for
// fuzz builds is now scripts/oracleDiff.ts (see the note in generate()).
function compare() {
  const dir = path.resolve(arg('dir', path.join(__dirname, '..', '..', 'Output', 'FuzzBuilds')))
  const goldens = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => /^fuzz-\d+\.golden\.json$/.test(f))
    : []
  if (goldens.length === 0) {
    console.error(`No fuzz-*.golden.json files in ${dir} — the oracle referee (scripts/oracleDiff.ts) supersedes them.`)
    process.exit(2)
  }

  let failures = 0
  for (const gf of goldens) {
    const golden = JSON.parse(fs.readFileSync(path.join(dir, gf), 'utf-8')) as GoldenFile
    const v3statsPath = path.join(dir, gf.replace('.golden.json', '.v3stats.json'))
    if (fs.existsSync(v3statsPath)) {
      const v3 = JSON.parse(fs.readFileSync(v3statsPath, 'utf-8')) as GoldenFile
      if (JSON.stringify(v3.stats) === JSON.stringify(golden.stats) && !golden.capturedAt) {
        console.log(`— ${gf}: still the V3 template (no V2 numbers captured yet), skipping`)
        continue
      }
    }
    const buildPath = path.join(dir, golden.buildFile)
    if (!fs.existsSync(buildPath)) {
      console.error(`✗ ${gf}: build file ${golden.buildFile} missing`)
      failures++
      continue
    }
    const { build } = importV2Build(fs.readFileSync(buildPath, 'utf-8'))
    const stats = statsFor(build)
    const report = compareAgainstGolden(stats.keys(), stats.total, golden)
    const failing = report.results.filter(r => !r.pass)
    console.log(`\n=== ${golden.buildFile} ===`)
    console.log(formatReport(report, false))
    if (failing.length > 0) failures++
  }

  if (failures > 0) {
    console.error(`\n${failures} build(s) with V2/V3 mismatches — investigate the failing keys in V3.`)
    process.exit(1)
  }
  console.log('\nAll captured goldens match V3 within tolerance.')
}

const cmd = process.argv[2] ?? 'generate'
if (cmd === 'generate') generate()
else if (cmd === 'compare') compare()
else {
  console.error(`Unknown command "${cmd}" — use generate | compare`)
  process.exit(2)
}
