#!/usr/bin/env node
// fillGoldens — fill fuzz golden files from V2 forum-export text dumps.
//
// For each Output/FuzzBuilds/fuzz-<seed>.v2export.txt (a paste of V2's
// "Forum Export" dialog output for the matching fuzz-<seed>.DDOBuild), parse
// the stat totals with lib/export/parseV2Export and MERGE them into
// fuzz-<seed>.golden.json:
//   - keys the parser extracted overwrite the template values
//     (zero-valued parsed keys are only written when the key already exists
//     in the golden, so files aren't flooded with 200+ zero entries);
//   - keys the parser did not extract keep their template values;
//   - capturedAt is set to the export file's mtime (ISO date) and the
//     description notes the auto-parse.
//
// Usage:
//   npx tsx scripts/fillGoldens.ts [--dir ../Output/FuzzBuilds] [--verbose]

import fs from 'fs'
import path from 'path'
import { parseV2Export } from '../src/lib/export/parseV2Export'
import type { GoldenFile } from '../src/lib/goldenCompare'

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

const dir = path.resolve(arg('dir', path.join(__dirname, '..', '..', 'Output', 'FuzzBuilds')))
const verbose = process.argv.includes('--verbose')

if (!fs.existsSync(dir)) {
  console.error(`Directory not found: ${dir}`)
  process.exit(1)
}

const exportFiles = fs.readdirSync(dir)
  .filter(f => /^fuzz-\d+\.v2export\.txt$/.test(f))
  .sort()

if (exportFiles.length === 0) {
  console.log(`No fuzz-<seed>.v2export.txt files found in ${dir}`)
  console.log('Paste V2\'s Forum Export output for fuzz-<seed>.DDOBuild into that filename first.')
  process.exit(0)
}

let totalFilled = 0
let totalWarnings = 0

for (const exportFile of exportFiles) {
  const seed = /^fuzz-(\d+)\./.exec(exportFile)![1]
  const exportPath = path.join(dir, exportFile)
  const goldenPath = path.join(dir, `fuzz-${seed}.golden.json`)

  const text = fs.readFileSync(exportPath, 'utf-8')
  const { stats, warnings } = parseV2Export(text)

  let golden: GoldenFile
  if (fs.existsSync(goldenPath)) {
    golden = JSON.parse(fs.readFileSync(goldenPath, 'utf-8')) as GoldenFile
  } else {
    golden = {
      description: '',
      buildFile: `fuzz-${seed}.DDOBuild`,
      defaultTolerance: 1,
      stats: {},
    }
  }

  // Merge: parsed keys overwrite; unparsed template keys are kept.
  // Zero-valued parsed keys are only written if already present in the golden
  // (absent-key comparisons default to 0 anyway).
  let filled = 0
  for (const [key, value] of Object.entries(stats)) {
    if (value === 0 && !(key in golden.stats)) continue
    golden.stats[key] = value
    filled++
  }

  const mtime = fs.statSync(exportPath).mtime
  golden.capturedAt = mtime.toISOString().slice(0, 10)
  golden.description =
    `Golden values for fuzz-${seed}.DDOBuild — auto-parsed from V2 forum export (${exportFile}) by scripts/fillGoldens.ts`

  fs.writeFileSync(goldenPath, JSON.stringify(golden, null, 2) + '\n')

  totalFilled += filled
  totalWarnings += warnings.length
  console.log(`${exportFile} → fuzz-${seed}.golden.json: ${filled} keys filled` +
    ` (${Object.keys(stats).length} parsed), ${warnings.length} warning(s)`)
  if (warnings.length > 0 && verbose) {
    for (const w of warnings) console.log(`    ! ${w}`)
  } else if (warnings.length > 0) {
    for (const w of warnings.slice(0, 3)) console.log(`    ! ${w}`)
    if (warnings.length > 3) console.log(`    … ${warnings.length - 3} more (use --verbose)`)
  }
}

console.log(`\nDone: ${exportFiles.length} file(s), ${totalFilled} keys filled, ${totalWarnings} warning(s).`)
