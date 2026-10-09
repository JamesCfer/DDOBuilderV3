// X22: the forum export's PastLives section must match V2's per-feat-line
// format and block order.
//
// V2 ForumExportDlg.cpp:393-433 AddPastLives calls AddFeats (:475-507) for
// Heroic, Racial, Iconic, Epic in that order. Each non-empty block is a plain
// heading, "[HR][/HR]", then one "FeatName" / "FeatName(N)" line per feat
// sorted by name, then a blank line. Types outside those four are not printed.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { DDOClass, Feat, Race } from '../types/ddo'

const section = DEFAULT_SECTIONS.find(s => s.id === 'PastLives')!

describe('X22 - PastLives uses V2 per-feat lines', () => {
  it('formats a V2-imported build exactly like V2', () => {
    // Shape produced by v2Import.ts parseFeatsListObject.
    const build = {
      ...emptyBuild(),
      pastLives: {
        Wizard: 3,
        Fighter: 1,
        Elf: 2,
        'Past Life: Bladeforged': 1,
        'Past Life: Arcane Sphere: Ancient Knowledge': 3,
        'Some Special Feat': 1,
      },
      pastLifeTypes: {
        Wizard: 'HeroicPastLife',
        Fighter: 'HeroicPastLife',
        Elf: 'RacialPastLife',
        'Past Life: Bladeforged': 'IconicPastLife',
        'Past Life: Arcane Sphere: Ancient Knowledge': 'EpicPastLife',
        'Some Special Feat': 'Special',
      },
    }
    expect(section.emit({ build, stats: null })).toEqual([
      'Heroic Past Lives', '[HR][/HR]',
      'Past Life: Fighter',
      'Past Life: Wizard(3)',
      '',
      'Racial Past Lives', '[HR][/HR]',
      'Past Life: Elf(2)',
      '',
      'Iconic Past Lives', '[HR][/HR]',
      'Past Life: Bladeforged',
      '',
      'Epic Past Lives', '[HR][/HR]',
      'Past Life: Arcane Sphere: Ancient Knowledge(3)',
    ])
  })

  it('types entries set in the Past Lives panel from the catalogues', () => {
    const build = {
      ...emptyBuild(),
      pastLives: { Bard: 2, Human: 1, Bladeforged: 3, 'Past Life: Primal Sphere: Doubleshot': 1 },
    }
    const lines = section.emit({
      build, stats: null,
      allClasses: [{ Name: 'Bard' } as unknown as DDOClass],
      allRaces: [
        { Name: 'Human' } as unknown as Race,
        { Name: 'Bladeforged', IsIconic: true } as unknown as Race,
      ],
      epicPastLifeFeats: [{ Name: 'Past Life: Primal Sphere: Doubleshot' } as unknown as Feat],
    })
    expect(lines).toEqual([
      'Heroic Past Lives', '[HR][/HR]', 'Past Life: Bard(2)', '',
      'Racial Past Lives', '[HR][/HR]', 'Past Life: Human', '',
      'Iconic Past Lives', '[HR][/HR]', 'Past Life: Bladeforged(3)', '',
      'Epic Past Lives', '[HR][/HR]', 'Past Life: Primal Sphere: Doubleshot',
    ])
  })

  it('has no "Other Past Lives" bucket', () => {
    const build = { ...emptyBuild(), pastLives: { Mystery: 1 }, pastLifeTypes: { Mystery: 'Special' } }
    expect(section.emit({ build, stats: null })).toEqual([])
  })
})
