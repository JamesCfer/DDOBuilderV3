// Regression corpus: 50 real user builds (Output/UserBuilds/collection).
// Guards the import → stats → feat-picker pipeline against the whole corpus:
//  - every file imports without throwing
//  - stats compute finite values (no NaN/crash)
//  - every trained feat lands in a UI-visible slot and is offered by the
//    picker, except the documented exceptions below.
//
// Documented exceptions (verified against V2 source/data, not V3 bugs):
//  - Warlocks.DDOBuild: V2 save corruption — V2 wrote item text into
//    TrainedFeat <Type> elements ("Pact AbilityThe blue shine of…"), so those
//    slots are unmappable for V2 itself too.
//  - Mobile Spellcasting without Combat Casting (3 builds): V2 also evaluates
//    it untrainable (Feats.xml Requirements) but keeps invalid trained feats,
//    flagging them red — V3 keeps them and shows them locked, same behavior.
//  - DOT.DDOBuild "Purity of Heart" / "Dreadful Dimlight (Legendary)": absent
//    from this repo's Output/DataFiles (the user's V2 install ships newer
//    game data) — a data-sync gap, not an engine gap.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats } from '../lib/buildStats'
import { loadAllCatalogues } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'
import { buildSlots } from '../lib/levelTraining'
import { featOptionsForSlot } from '../lib/featEligibility'
import { findActiveLife } from '../lib/multiLife'
import type { Item } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const DIR = join(__dirname, '..', '..', '..', 'Output', 'UserBuilds', 'collection')
const have = existsSync(DATA) && existsSync(DIR)

const CORRUPT_SAVES = new Set(['Warlocks.DDOBuild'])
// Feats V2 itself evaluates as untrainable (missing prereqs) but keeps on
// the build flagged red — V3 keeps them and shows them locked, same behavior.
const V2_INVALID_TRAINED = new Set(['Mobile Spellcasting', 'Past Life: Arcane Initiate'])
const MISSING_DATA_FEATS = new Set(['Purity of Heart'])

describe.skipIf(!have)('50-build user collection', () => {
  const cat = loadAllCatalogues(DATA)
  initBonusTypes(cat.allBonusTypes)
  const files = readdirSync(DIR).filter(f => f.endsWith('.DDOBuild'))

  it('has the corpus', () => {
    expect(files.length).toBe(50)
  })

  it('every build imports, computes finite stats, and passes the feat picker', () => {
    const failures: string[] = []
    for (const f of files) {
      let imported: ReturnType<typeof importV2Build> & { document?: { lives: { builds: unknown[] }[] } }
      try {
        imported = importV2Build(readFileSync(join(DIR, f), 'utf-8')) as never
      } catch (e) {
        failures.push(`${f}: IMPORT CRASH ${(e as Error).message}`)
        continue
      }
      const doc = imported.document
      const builds = doc ? doc.lives.flatMap(l => l.builds) : [imported.build]
      for (const build of builds as (typeof imported.build)[]) {
        const gearItems: Record<string, Item> = {}
        for (const [slot, name] of Object.entries(build.gear ?? {})) {
          if (!name) continue
          const item = cat.allItems.find(i => i.Name === name)
          if (item) gearItems[slot] = item
        }
        try {
          const specialFeats = doc ? findActiveLife(doc as never)?.specialFeats : undefined
          const stats = computeBuildStats({
            allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
            allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
            allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
            allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
            allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
            allItemBuffs: cat.allItemBuffs, specialFeats, gearItems,
          }, build)
          for (const key of ['hp', 'ac', 'prr', 'bab', 'ability.Strength', 'spellPoints']) {
            if (!isFinite(stats.total(key))) failures.push(`${f}: NaN ${key}`)
          }
        } catch (e) {
          failures.push(`${f}: STATS CRASH ${(e as Error).message.slice(0, 80)}`)
          continue
        }
        if (CORRUPT_SAVES.has(f)) continue
        const slots = buildSlots(build, cat.allClasses, cat.allRaces)
        const slotKeys = new Set(slots.map(s => s.key))
        const race = cat.allRaces.find(r => r.Name === build.race)
        for (const [key, trained] of Object.entries(build.featChoices ?? {})) {
          if (!trained) continue
          if (V2_INVALID_TRAINED.has(trained) || MISSING_DATA_FEATS.has(trained)) continue
          if (!slotKeys.has(key)) {
            failures.push(`${f}: orphan slot ${key} => ${trained}`)
            continue
          }
          const slot = slots.find(s => s.key === key)!
          const opts = featOptionsForSlot(slot, slots, cat.allFeats, build, cat.allClasses, race, {})
          const hit = opts.find(o => o.feat.Name === trained)
          if (!hit) failures.push(`${f}: not offered ${key}: ${trained}`)
          else if (!hit.prereqsMet) failures.push(`${f}: locked ${key}: ${trained}`)
        }
      }
    }
    expect(failures).toEqual([])
  })
})
