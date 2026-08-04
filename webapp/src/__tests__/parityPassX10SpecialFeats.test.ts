import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'

// V2 parity: PARITY_TODO X10 — the forum-export "Special Feats"/"Favor
// Feats" section (V2 ForumExportDlg.cpp:435-471 AddSpecialFeats/AddFeats)
// read `(build as any).specialFeats`, but V2's Life-level special feats
// (past lives aside) live on `Life.specialFeats`, not `CharacterBuild` — the
// cast was always undefined, so the section silently emitted nothing for
// every real build. Favor-reward feats (`build.favorFeats`, V2's separate
// `FavorFeats` FeatsListObject) were never read by this section either.

describe('Forum export SpecialFeats section (parity pass X10)', () => {
  it('emits Life-level special feats passed via SectionContext.specialFeats', () => {
    const build = { ...emptyBuild() }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SpecialFeats')!
    const lines = section.emit({ build, stats: null, specialFeats: ['Universal Tree Access'] })
    expect(lines).toContain('[b]Special Feats[/b]:')
    expect(lines).toContain('  Universal Tree Access')
  })

  it('emits build.favorFeats under a separate Favor Feats heading', () => {
    const build = { ...emptyBuild(), favorFeats: ['House Deneith Favor'] }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SpecialFeats')!
    const lines = section.emit({ build, stats: null })
    expect(lines).toContain('[b]Favor Feats[/b]:')
    expect(lines).toContain('  House Deneith Favor')
  })

  it('combines duplicate entries with a (count) suffix, like V2 AddSpecialFeats', () => {
    const build = { ...emptyBuild() }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SpecialFeats')!
    const lines = section.emit({
      build, stats: null,
      specialFeats: ['Improved Destiny Feat Slot', 'Improved Destiny Feat Slot'],
    })
    expect(lines).toContain('  Improved Destiny Feat Slot(2)')
  })

  it('emits nothing when there are no special or favor feats', () => {
    const build = { ...emptyBuild() }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SpecialFeats')!
    const lines = section.emit({ build, stats: null })
    expect(lines).toEqual([])
  })
})
