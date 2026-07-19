#!/usr/bin/env node
// v2ExportDiff — the one-command parity check.
//
// Give it a .DDOBuild and the matching V2 "Forum Export" text dump; it
// imports the build, computes V3's stats, parses every stat V2 printed, and
// shows the full diff. This is the fastest parity loop there is: any time V2
// and V3 disagree, export from V2 and run:
//
//   cd webapp && npx tsx scripts/v2ExportDiff.ts <build.DDOBuild> <v2export.txt>
//
// Exit 1 when any stat mismatches.

import { readFileSync } from 'fs'
import path from 'path'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/lib/buildStats'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { initBonusTypes } from '../src/lib/bonus'
import { findActiveLife } from '../src/lib/multiLife'
import { parseV2Export } from '../src/lib/export/parseV2Export'
import type { Item } from '../src/types/ddo'

const [buildPath, exportPath] = process.argv.slice(2)
if (!buildPath || !exportPath) {
  console.error('usage: npx tsx scripts/v2ExportDiff.ts <build.DDOBuild> <v2export.txt>')
  process.exit(2)
}

const cat = loadAllCatalogues(path.join(__dirname, '..', '..', 'Output', 'DataFiles'))
initBonusTypes(cat.allBonusTypes)

const { build, document, warnings } = importV2Build(readFileSync(buildPath, 'utf-8')) as any
if (warnings?.length) console.log('import warnings:', warnings.join('; '))

const gearItems: Record<string, Item> = {}
for (const [slot, name] of Object.entries(build.gear)) {
  if (!name) continue
  const item = cat.allItems.find(i => i.Name === name)
  if (item) gearItems[slot] = item
  else console.log('UNRESOLVED ITEM:', slot, name)
}
const specialFeats = document ? findActiveLife(document)?.specialFeats : undefined

const stats = computeBuildStats({
  allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
  allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
  allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
  allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
  allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
  allItemBuffs: cat.allItemBuffs, specialFeats, gearItems,
}, build)

const parsed = parseV2Export(readFileSync(exportPath, 'utf-8'))
if (parsed.warnings.length) {
  console.log(`parser warnings (${parsed.warnings.length}):`)
  parsed.warnings.slice(0, 8).forEach(w => console.log('  ', w))
}

// Some V2 keys need composition on the V3 side (mirrors goldenDiffExampledps).
const composed = (key: string): number => {
  if (key.startsWith('sp.') && key !== 'sp.Universal') {
    return stats.total(key) + stats.total('sp.Universal')
  }
  // parseV2Export already stores sub-save rows as (row − base), which is
  // exactly V3's save.sub.* value — compare directly.

  if (key === 'speed') return stats.total('speed') - 100
  return stats.total(key)
}

const keys = Object.keys(parsed.stats).sort()
let bad = 0
console.log('\n    V2     V3   diff   stat')
for (const key of keys) {
  const v2 = parsed.stats[key]
  const v3 = composed(key)
  const d = Math.round((v3 - v2) * 10) / 10
  const mark = Math.abs(d) > 0.5 ? ' ❌' : '   '
  if (Math.abs(d) > 0.5) bad++
  console.log(`${String(v2).padStart(6)} ${String(Math.round(v3 * 10) / 10).padStart(6)} ${String(d).padStart(6)}${mark} ${key}`)
}
console.log(`\n${bad}/${keys.length} mismatching`)
process.exit(bad > 0 ? 1 : 0)
