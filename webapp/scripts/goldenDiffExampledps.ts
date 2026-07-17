import path from 'path'
// Golden diff for the user-supplied exampledps.DDOBuild (V2 breakdown export
// captured 2026-07-17, values inline below). Run after any stat-engine change
// to measure progress on the "Golden-build residue" items in PARITY_TODO.md:
//
//   cd webapp && npx tsx scripts/goldenDiffExampledps.ts
import { readFileSync } from 'fs'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/lib/buildStats'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { initBonusTypes } from '../src/lib/bonus'
import { findActiveLife } from '../src/lib/multiLife'
import type { Item } from '../src/types/ddo'

const xml = readFileSync(path.join(__dirname, '..', '..', 'Output', 'UserBuilds', 'exampledps.DDOBuild'), 'utf-8')
const { build, document, warnings } = importV2Build(xml) as any
if (warnings?.length) console.log('warnings:', warnings)

const cat = loadAllCatalogues(path.join(__dirname, '..', '..', 'Output', 'DataFiles'))
initBonusTypes(cat.allBonusTypes)

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

console.log(`build: ${build.name} | classes: ${build.classes.map((c: any) => `${c.name} ${c.levels}`).join('/')} | heroic ${build.totalLevel} epic ${build.epicLevels} leg ${build.legendaryLevels}`)
console.log(`stances active: ${build.activeBuffs.join(', ')}`)

// V2 label → [expected, v3 value fn]
const T = (k: string) => stats.total(k)
const rows: Array<[string, number, number]> = [
  ['STR', 77, T('ability.Strength')],
  ['DEX', 25, T('ability.Dexterity')],
  ['CON', 63, T('ability.Constitution')],
  ['INT', 18, T('ability.Intelligence')],
  ['WIS', 20, T('ability.Wisdom')],
  ['CHA', 27, T('ability.Charisma')],
  ['Fort', 76, T('save.Fort')],
  ['Reflex', 66, T('save.Reflex')],
  ['Will', 54, T('save.Will')],
  ['Will vs Fear', 60, T('save.Will') + T('save.sub.Fear')],
  ['HP', 2875, T('hp')],
  ['False Life', 56, (stats.resolve('hp').bonuses.filter(b => b.type === 'False Life' && b.active).reduce((a, b) => a + b.value, 0))],
  ['Reaper HP', 164, (stats.resolve('hp').bonuses.filter(b => b.type === 'Reaper' && b.active).reduce((a, b) => a + b.value, 0))],
  ['SP', 888, T('spellPoints')],
  ['AC', 81, T('ac')],
  ['Max Dex Bonus', 29, T('mdb') + ((gearItems['Armor'] as any)?.MaximumDexterityBonus ?? 0)],
  ['PRR', 118, T('prr')],
  ['MRR', 150, T('mrr')],
  ['MRR Cap', 170, T('mrrCap')],
  ['Fortification', 338, T('fortification')],
  ['Dodge', 18, T('dodge')],
  ['Incorporeality', 10, T('incorporeality')],
  ['Displacement', 50, T('displacement')],
  ['BAB', 25, T('bab')],
  ['Doublestrike', 97, T('melee.doublestrike')],
  ['Doubleshot', 49, T('ranged.doubleshot')],
  ['Melee Power', 266, T('melee.power')],
  ['Ranged Power', 176, T('ranged.power')],
  ['Strikethrough', 20, T('melee.strikethrough')],
  ['Fort Bypass', 84, T('fortBypass')],
  ['Helpless Dmg', 68, T('helpless')],
  ['Off Hand Attack Chance', 20, T('offhand.attack')],
  ['Movement Speed', 60, (T('speed') - 100)],
  ['Fate Points', 42, T('fatePoint')],
  ['Maximum Ki', 65, T('ki.max')],
  ['Spell Pen', 2, T('spellPenetration')],
  ['Universal SPower', 128, T('sp.Universal')],
  ['Positive SPower', 203, T('sp.Positive') + T('sp.Universal')],
  ['Electric SPower', 200, T('sp.Electric') + T('sp.Universal')],
  ['Force SPower', 190, T('sp.Force') + T('sp.Universal')],
  ['Physical SPower', 190, T('sp.Physical') + T('sp.Universal')],
  ['Sonic SPower', 182, T('sp.Sonic') + T('sp.Universal')],
  ['Acid SPower', 150, T('sp.Acid') + T('sp.Universal')],
  ['Negative SPower', 153, T('sp.Negative') + T('sp.Universal')],
  ['Sneak Attack Dice', 4, T('melee.sneakDice')],
  ['Imbue Dice', 7, T('imbueDice')],
  ['Song Count', 18, T('song.count')],
  ['Skill Balance', 58, T('skill.Balance')],
  ['Skill Perform', 54, T('skill.Perform')],
  ['Skill Jump (uncapped)', 52, T('skill.Jump')],
  ['Skill Swim', 73, T('skill.Swim')],
  ['Skill Concentration', 44, T('skill.Concentration')],
  ['Skill UMD', 26, T('skill.Use Magic Device')],
  ['Skill Tumble', 26, T('skill.Tumble')],
  ['Skill Hide', 32, T('skill.Hide')],
]

console.log('\n  V2    V3    diff   stat')
let bad = 0
for (const [label, v2, v3] of rows) {
  const d = v3 - v2
  if (Math.abs(d) > 0.5) bad++
  const mark = Math.abs(d) > 0.5 ? ' ❌' : '   '
  console.log(`${String(v2).padStart(6)} ${String(Math.round(v3 * 10) / 10).padStart(6)} ${String(Math.round(d * 10) / 10).padStart(6)}${mark} ${label}`)
}
console.log(`\n${bad}/${rows.length} mismatching`)
