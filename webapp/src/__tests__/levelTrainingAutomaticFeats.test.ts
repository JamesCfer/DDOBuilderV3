/**
 * Per-level automatic feats in the Level Training view.
 *
 * V2 shows the feats auto-granted at the selected level in its own pane
 * (`CAutomaticFeatsPane::SetAutofeats` → `LevelTraining::AutomaticFeats`,
 * built by `Build::AutomaticFeats`, Build.cpp:2502-2581). V3's per-level
 * cards listed only chosen feat slots and skill ranks, so a level whose only
 * training is a grant read "Nothing trained at this level" — Arcane Trickster
 * 3 (Magical Training + Mage Hand + Sneak Attack) looked empty, which is how
 * the missing-Magical-Training report was found.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadClasses, loadRaces } from '../server/dataLoaders'
import { getLevelTrainingEntries } from '../lib/levelTraining'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

function trickster(levels: number): CharacterBuild {
  return {
    ...emptyBuild(),
    race: 'Human',
    classes: [{ name: 'Arcane Trickster', levels }],
    levelClasses: Array.from({ length: levels }, () => 'Arcane Trickster'),
    totalLevel: levels,
    epicLevels: 0,
    legendaryLevels: 0,
  }
}

describe.runIf(haveData)('level training — automatic feats per level', () => {
  const allClasses = loadClasses(DATA_DIR)
  const allRaces = loadRaces(DATA_DIR)

  it('grants Arcane Trickster its level 3 Magical Training', () => {
    const entries = getLevelTrainingEntries(trickster(5), allClasses, allRaces)
    const level3 = entries.find(e => e.charLevel === 3)!
    expect(level3.automaticFeats).toContain('Magical Training')
    expect(level3.automaticFeats).toContain('Mage Hand - Bluff')
    expect(level3.automaticFeats).toContain('Mage Hand - Disable Traps')
  })

  it('sorts each level alphabetically, as V2 does', () => {
    const entries = getLevelTrainingEntries(trickster(5), allClasses, allRaces)
    for (const e of entries) {
      expect(e.automaticFeats).toEqual(e.automaticFeats.slice().sort((a, b) => a.localeCompare(b)))
    }
  })

  it('attributes each grant to the level that gives it', () => {
    const entries = getLevelTrainingEntries(trickster(5), allClasses, allRaces)
    const at = (lvl: number) => entries.find(e => e.charLevel === lvl)!.automaticFeats
    expect(at(1)).toContain('Trapfinding')       // class level 1
    expect(at(2)).toContain('Evasion')           // class level 2
    expect(at(2)).not.toContain('Magical Training')
    expect(at(4)).toHaveLength(0)                // level 4 grants nothing
  })

  it('puts race granted feats on level 1', () => {
    const build = trickster(3)
    build.race = 'Dwarf'
    const entries = getLevelTrainingEntries(build, allClasses, allRaces)
    const dwarfGrants = entries.find(e => e.charLevel === 1)!.automaticFeats
    const dwarf = allRaces.find(r => r.Name === 'Dwarf')!
    const granted = Array.isArray(dwarf.GrantedFeat) ? dwarf.GrantedFeat : [dwarf.GrantedFeat!]
    for (const g of granted.filter(Boolean)) expect(dwarfGrants).toContain(g)
  })

  it('places a multiclassed grant at the character level that reaches it', () => {
    const build = emptyBuild()
    build.race = 'Human'
    build.classes = [{ name: 'Fighter', levels: 2 }, { name: 'Arcane Trickster', levels: 3 }]
    build.levelClasses = ['Fighter', 'Fighter', 'Arcane Trickster', 'Arcane Trickster', 'Arcane Trickster']
    build.totalLevel = 5
    build.epicLevels = 0
    build.legendaryLevels = 0
    const entries = getLevelTrainingEntries(build, allClasses, allRaces)
    // Arcane Trickster level 3 is reached at character level 5
    expect(entries.find(e => e.charLevel === 5)!.automaticFeats).toContain('Magical Training')
    expect(entries.find(e => e.charLevel === 3)!.automaticFeats).not.toContain('Magical Training')
  })
})
