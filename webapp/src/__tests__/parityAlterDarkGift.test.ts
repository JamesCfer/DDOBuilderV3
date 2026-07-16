// Universal "Alter Dark Gift" feat slot at character level 4.
//
// V2 source: Build::TrainableFeatTypeAtLevel (Build.cpp:1091) grants this
// feat slot unconditionally to every character at level==3 (0-based) =
// character level 4, regardless of race or class ("you have to be level 4
// to go into the Lamordia zone where this feat can be acquired"). It has no
// backing race/class FeatSlot XML data, so V3's importer previously folded
// any TrainedFeat with Type="Alter Dark Gift" into the class-slot fallback
// key format (`${className}-${classLevel}-${featType}-${idx}`), which never
// matches any slot `buildSlots()` (the live FeatSlots/LevelTrainingPanel UI)
// generates — the trained feat became permanently invisible in the app even
// though it round-tripped correctly on export.
//
// Confirmed against 3 of 5 real user-submitted .DDOBuild files that all hit
// this exact orphaned key.

import { describe, expect, it } from 'vitest'
import { importV2Build } from '../lib/v2Import'
import { buildSlots } from '../lib/levelTraining'
import type { DDOClass, Race } from '../types/ddo'

function levelTrainingBlock(charLevel: number, className: string, feats: { name: string; type: string }[]): string {
  const featXml = feats.map(f => `
          <TrainedFeat>
            <FeatName>${f.name}</FeatName>
            <Type>${f.type}</Type>
            <LevelTrainedAt>${charLevel}</LevelTrainedAt>
          </TrainedFeat>`).join('')
  return `
        <LevelTraining>
          <Class>${className}</Class>${featXml}
        </LevelTraining>`
}

function buildXml(): string {
  const levels = [
    levelTrainingBlock(1, 'Fighter', [{ name: 'Toughness', type: 'Standard' }]),
    levelTrainingBlock(2, 'Fighter', []),
    levelTrainingBlock(3, 'Fighter', []),
    levelTrainingBlock(4, 'Fighter', [{ name: 'Living Shadow', type: 'Alter Dark Gift' }]),
  ].join('')
  return `<DDOBuilderCharacterData>
  <Character version="1">
    <Life>
      <Name>Test Life</Name>
      <Race>Human</Race>
      <Alignment>True Neutral</Alignment>
      <Build>${levels}
      </Build>
    </Life>
  </Character>
</DDOBuilderCharacterData>`
}

describe('Alter Dark Gift universal feat slot (V2 Build.cpp:1091 parity)', () => {
  it('imports into the alterDarkGift-4 slot key, not a class-slot fallback key', () => {
    const { build, warnings } = importV2Build(buildXml())
    expect(warnings).toEqual([])
    expect(build.featChoices['alterDarkGift-4']).toBe('Living Shadow')
    // Must NOT have fallen through to the class-slot key format.
    expect(build.featChoices['Fighter-4-Alter Dark Gift-0']).toBeUndefined()
  })

  it('the imported key matches a real buildSlots() slot (no orphaned feat)', () => {
    const { build } = importV2Build(buildXml())
    const mockFighter: DDOClass = { Name: 'Fighter', SkillPoints: 2, HitPoints: 10 }
    const mockHuman: Race = { Name: 'Human' }
    const slots = buildSlots(build, [mockFighter], [mockHuman])
    const slotKeys = new Set(slots.map(s => s.key))
    for (const key of Object.keys(build.featChoices)) {
      expect(slotKeys.has(key)).toBe(true)
    }
  })
})
