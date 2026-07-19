// Feat-picker eligibility parity — "feats not showing up".
//
// A sweep of 102 real .DDOBuild files (1690 trained feat slots) found 347
// cases where a feat V2 itself had trained was either not offered at all
// (117) or shown locked (230) by V3's picker. Root causes, all V2-verified:
//
//  1. BAB tables parse as `{'#text': '…'}` objects (size attribute), and
//     requirements.ts stringified them to "[object Object]" → every class
//     contributed 0 BAB → every BAB-gated feat (TWF chain, Improved
//     Critical, Power Attack, …) locked for everyone.
//  2. `Level` requirements compared against heroic-only totalLevel — every
//     epic feat gated `Level 21+` failed (V2 Requirement.cpp EvaluateLevel
//     uses the character level).
//  3. `FeatUpdateList` treated as a per-slot whitelist. V2 UpdateFeats
//     (DDOBuilder.cpp:1293-1320) instead ADDS the slot's FeatType to each
//     listed feat's Group at load time, then all slots use group matching.
//  4. Automatic class feats missing from prerequisite checks (V2
//     Build::CurrentFeats includes them — e.g. Stunning Fist needs the
//     automatic Monk feat "Flurry of Blows").
//  5. Same-level feats couldn't satisfy each other's prerequisites (V2
//     CurrentFeats gathers feats up to AND INCLUDING the slot level).

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { loadAllCatalogues } from '../server/dataLoaders'
import { buildSlots } from '../lib/levelTraining'
import { featOptionsForSlot } from '../lib/featEligibility'
import { buildSnapshotAtCharacterLevel } from '../lib/levelProgression'
import { meetsSingleRequirement } from '../lib/requirements'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const YINGS = join(__dirname, '..', '..', '..', 'Output', 'Example Builds', 'YingsMonk.DDOBuild')
const have = existsSync(DATA) && existsSync(YINGS)

// ---------------------------------------------------------------------------
// Unit-level: the specific broken requirement evaluations
// ---------------------------------------------------------------------------

describe('BAB requirement reads #text-wrapped class tables', () => {
  // fast-xml-parser shape for <BAB size="21">0 1 2 …</BAB>
  const fighter = {
    Name: 'Fighter',
    BAB: { '#text': '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20' },
  } as unknown as DDOClass
  const build: CharacterBuild = {
    ...emptyBuild(),
    classes: [{ name: 'Fighter', levels: 6 }],
    levelClasses: Array.from({ length: 6 }, () => 'Fighter'),
    totalLevel: 6,
    epicLevels: 0, // emptyBuild defaults to 10 — heroic-only here
    legendaryLevels: 0,
  }

  it('Fighter 6 meets BAB 6 (was 0 for every class)', () => {
    expect(meetsSingleRequirement({ Type: 'BAB', Value: 6 }, { build, allClasses: [fighter] })).toBe(true)
  })
  it('Fighter 6 does not meet BAB 7', () => {
    expect(meetsSingleRequirement({ Type: 'BAB', Value: 7 }, { build, allClasses: [fighter] })).toBe(false)
  })
})

describe('Level requirement uses character level (heroic+epic+legendary)', () => {
  const build: CharacterBuild = {
    ...emptyBuild(),
    totalLevel: 20,
    epicLevels: 5,
    legendaryLevels: 0,
  }
  it('level-25 character meets Level 25', () => {
    expect(meetsSingleRequirement({ Type: 'Level', Value: 25 }, { build, allClasses: [] })).toBe(true)
  })
  it('level-25 character fails Level 26', () => {
    expect(meetsSingleRequirement({ Type: 'Level', Value: 26 }, { build, allClasses: [] })).toBe(false)
  })
})

describe('snapshot clamps epic/legendary levels to the snapshot level', () => {
  const build: CharacterBuild = {
    ...emptyBuild(),
    classes: [{ name: 'Monk', levels: 20 }],
    levelClasses: Array.from({ length: 20 }, () => 'Monk'),
    totalLevel: 20,
    epicLevels: 10,
    legendaryLevels: 4,
  }
  it('heroic snapshot has no epic levels', () => {
    const snap = buildSnapshotAtCharacterLevel(build, 15)
    expect(snap.epicLevels).toBe(0)
    expect(snap.legendaryLevels).toBe(0)
  })
  it('epic-8 snapshot has 8 epic levels, no legendary', () => {
    const snap = buildSnapshotAtCharacterLevel(build, 28)
    expect(snap.epicLevels).toBe(8)
    expect(snap.legendaryLevels).toBe(0)
  })
  it('legendary snapshot keeps full epic + clamped legendary', () => {
    const snap = buildSnapshotAtCharacterLevel(build, 33)
    expect(snap.epicLevels).toBe(10)
    expect(snap.legendaryLevels).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Real-data: catalogue amendments + picker behavior
// ---------------------------------------------------------------------------

describe.skipIf(!have)('FeatUpdateList amends feat groups at load (V2 UpdateFeats)', () => {
  const cat = loadAllCatalogues(DATA)
  it('Two Weapon Fighting gains the "Monk Bonus" group from the Monk level-1 slot list', () => {
    const twf = cat.allFeats.find(f => f.Name === 'Two Weapon Fighting')
    expect(twf).toBeDefined()
    const groups = Array.isArray(twf!.Group) ? twf!.Group : [twf!.Group]
    expect(groups).toContain('Monk Bonus')
  })
  it('Mobility gains "Monk Bonus" too', () => {
    const f = cat.allFeats.find(x => x.Name === 'Mobility')
    const groups = Array.isArray(f!.Group) ? f!.Group : [f!.Group]
    expect(groups).toContain('Monk Bonus')
  })
})

describe.skipIf(!have)('real-build picker: every trained feat is offered and unlocked', () => {
  const cat = loadAllCatalogues(DATA)
  const { build } = importV2Build(readFileSync(YINGS, 'utf-8'))
  const slots = buildSlots(build, cat.allClasses, cat.allRaces)
  const race = cat.allRaces.find(r => r.Name === build.race)

  // Formerly-broken representatives (from the 102-file sweep):
  //  - Stunning Fist @ heroic-18: needs automatic feat "Flurry of Blows"
  //  - Mobility @ Monk-1-Monk Bonus-0: whitelist slot + Dodge same-level
  //  - Doublestrike @ epic-2-Epic Destiny Feat-0: was excluded by the epic
  //    slot's FeatUpdateList whitelist
  //  - Arcane Warrior @ epic-8: Level 28 requirement (char level, not heroic)
  it('every feat this V2-exported build trained is offered with prereqs met', () => {
    const failures: string[] = []
    for (const slot of slots) {
      const trained = build.featChoices?.[slot.key]
      if (!trained) continue
      const opts = featOptionsForSlot(slot, slots, cat.allFeats, build, cat.allClasses, race, {})
      const hit = opts.find(o => o.feat.Name === trained)
      if (!hit) failures.push(`NOT OFFERED: ${trained} @ ${slot.key}`)
      else if (!hit.prereqsMet) failures.push(`LOCKED: ${trained} @ ${slot.key}`)
    }
    expect(failures).toEqual([])
  })
})
