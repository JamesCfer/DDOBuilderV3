// Full-breakdown parity: v2calc (real V2 math) vs V3, across every
// Output/FuzzBuilds/*.DDOBuild.
//
// IMPORTANT SCOPE: v2calc currently applies base + feat + race + class effects
// only — enhancement/item/spell/set loaders are still stubs, so those effects
// no-op. To compare like-for-like, we STRIP gear, enhancements, destiny,
// reaper, filigrees and toggled buffs from the V3 build too. This validates the
// CORE breakdown formulas (hit dice + CON → HP, class + ability → saves, BAB,
// ability totals with feat effects). Gear/enhancement-inclusive comparison
// waits on the v2calc data-file loaders.
//
//   cd webapp && npx tsx scripts/oracleCompareFull.ts [--verbose]
//
// Exit 1 if any build mismatches on a compared stat.

import { execFileSync } from 'child_process'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/lib/buildStats'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { initBonusTypes } from '../src/lib/bonus'
import type { CharacterBuild } from '../src/types/ddo'

const ROOT = path.join(__dirname, '..', '..')
const DATA = path.join(ROOT, 'Output', 'DataFiles')
const BUILDS = path.join(ROOT, 'Output', 'FuzzBuilds')
const V2CALC = path.join(ROOT, 'v2calc', 'build', 'v2calc')
const VERBOSE = process.argv.includes('--verbose')

const cat = loadAllCatalogues(DATA)
initBonusTypes(cat.allBonusTypes)

const AB_FULL = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
const AB_ABBR: Record<string, typeof AB_FULL[number]> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
}

/** Strip everything V2 can't yet contribute so both sides are base+feat+race+class. */
function nakedBuild(b: CharacterBuild): CharacterBuild {
  return {
    ...b,
    gear: {},
    enhancementChoices: {}, enhancementSelections: {}, enhancementPinned: [],
    reaperChoices: {}, reaperSelections: {},
    destinyChoices: {}, destinySelections: {},
    filigreeSlots: [],
    activeBuffs: [],
    augmentChoices: {},
  } as CharacterBuild
}

function v3Stats(b: CharacterBuild) {
  return computeBuildStats({
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs, allItemBuffs: cat.allItemBuffs,
    gearItems: {},
  } as never, b)
}

// v2calc JSON key → { v3 stat total, tolerance }. Only stats whose scope is
// base+feat+race+class are compared here.
type Getter = (s: ReturnType<typeof v3Stats>, b: CharacterBuild) => number
const CMP: Array<{ label: string; v2: (j: Record<string, unknown>) => number; v3: Getter; tol?: number }> = [
  { label: 'hitpoints', v2: j => num((j.breakdowns as Rec).hitpoints), v3: s => s.total('hp') },
  { label: 'saveFortitude', v2: j => num((j.breakdowns as Rec).saveFortitude), v3: s => s.total('save.Fort') },
  { label: 'saveReflex', v2: j => num((j.breakdowns as Rec).saveReflex), v3: s => s.total('save.Reflex') },
  { label: 'saveWill', v2: j => num((j.breakdowns as Rec).saveWill), v3: s => s.total('save.Will') },
  { label: 'prr', v2: j => num((j.breakdowns as Rec).prr), v3: s => s.total('prr') },
  { label: 'mrr', v2: j => num((j.breakdowns as Rec).mrr), v3: s => s.total('mrr') },
  { label: 'bab', v2: j => num((j.breakdowns as Rec).bab), v3: s => Math.min(25, s.total('bab')) },
  ...AB_FULL.map(ab => ({
    label: `ability.${ab}`,
    v2: (j: Record<string, unknown>) => num((j.abilityTotal as Rec)[abbr(ab)]),
    v3: (s: ReturnType<typeof v3Stats>) => s.total(`ability.${ab}`),
  })),
]

type Rec = Record<string, unknown>
function num(v: unknown): number { return typeof v === 'number' ? v : Number(v) || 0 }
function abbr(full: string): string { return Object.keys(AB_ABBR).find(k => AB_ABBR[k] === full)! }

interface Row { file: string; diffs: string[] }
const rows: Row[] = []
const files = readdirSync(BUILDS).filter(f => /\.DDOBuild$/.test(f)).sort()
const perStatFail = new Map<string, number>()

for (const f of files) {
  const full = path.join(BUILDS, f)
  let j: Record<string, unknown>
  try {
    j = JSON.parse(execFileSync(V2CALC, [full, DATA], { encoding: 'utf-8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch (e) {
    rows.push({ file: f, diffs: [`v2calc failed: ${e instanceof Error ? e.message : e}`] })
    continue
  }
  const { build } = importV2Build(readFileSync(full, 'utf-8'))
  const s = v3Stats(nakedBuild(build))
  const diffs: string[] = []
  for (const c of CMP) {
    const a = c.v2(j), b = c.v3(s, build)
    if (Math.abs(a - b) > (c.tol ?? 0)) {
      diffs.push(`${c.label}: V2=${a} V3=${b}`)
      perStatFail.set(c.label, (perStatFail.get(c.label) ?? 0) + 1)
    }
  }
  rows.push({ file: f, diffs })
}

let bad = 0
for (const r of rows) {
  if (r.diffs.length === 0) { if (VERBOSE) console.log(`✓ ${r.file}`) }
  else { bad++; console.log(`✗ ${r.file}`); for (const d of r.diffs) console.log(`    ${d}`) }
}
console.log(`\n${rows.length - bad}/${rows.length} builds match on all compared breakdown stats`)
if (perStatFail.size) {
  console.log('mismatches by stat:')
  for (const [k, n] of [...perStatFail.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`)
}
if (bad > 0) process.exit(1)
