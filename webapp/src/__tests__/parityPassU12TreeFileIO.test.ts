/**
 * Parity pass U12 — standalone per-tree save/load files
 * (V2 `EnhancementsPane.cpp::OnSaveTree`/`OnLoadTree`, ~932-1200; and
 * `DestinyPane.cpp::OnSaveTree`/`OnLoadTree`, ~984-1120).
 *
 * V2 lets a player export just the currently-selected Enhancement tree's
 * spend to a standalone `<DDOBuilderTree>` file (`SpendInTree::Write`,
 * `SpendInTree.cpp:165-170`), or a Destiny tree's spend to a standalone
 * `<DDOBuilderDestinyTree>` file — separate from the full-build `.DDOBuild`
 * export. `lib/treeFileIO.ts` is the pure export/parse logic (no V3
 * equivalent existed before this pass, so any Enhancement/Destiny tree
 * spend could only ever be shared as part of a whole build).
 */

import { describe, it, expect } from 'vitest'
import {
  exportEnhancementTreeFile, exportDestinyTreeFile, parseTreeFile,
} from '../lib/treeFileIO'

describe('U12 — standalone Enhancement tree save/load', () => {
  it('exports a <DDOBuilderTree><EnhancementSpendInTree> document', () => {
    const xml = exportEnhancementTreeFile({
      treeName: 'Assassin',
      choices: { 'Improved Sneak Attack Dice I': 2, 'Assassinate': 1 },
      selections: {},
    })
    expect(xml).toContain('<DDOBuilderTree>')
    expect(xml).toContain('<EnhancementSpendInTree>')
    expect(xml).toContain('<TreeName>Assassin</TreeName>')
    expect(xml).toContain('<EnhancementName>Improved Sneak Attack Dice I</EnhancementName>')
    expect(xml).toContain('<Ranks>2</Ranks>')
  })

  it('round-trips choices and selections through parseTreeFile', () => {
    const xml = exportEnhancementTreeFile({
      treeName: 'Assassin',
      choices: { 'Improved Sneak Attack Dice I': 2, 'Bane of Illusion': 1 },
      selections: { 'Bane of Illusion': 'Fire' },
    })
    const parsed = parseTreeFile(xml)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.kind).toBe('enhancement')
    expect(parsed.treeName).toBe('Assassin')
    expect(parsed.choices).toEqual({ 'Improved Sneak Attack Dice I': 2, 'Bane of Illusion': 1 })
    expect(parsed.selections).toEqual({ 'Bane of Illusion': 'Fire' })
  })

  it('drops zero-rank entries, matching V2 (ranks<=0 never trained)', () => {
    const xml = exportEnhancementTreeFile({
      treeName: 'Assassin',
      choices: { Assassinate: 0, 'Sneak Attack Training': 3 },
      selections: {},
    })
    const parsed = parseTreeFile(xml)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.choices).toEqual({ 'Sneak Attack Training': 3 })
  })
})

describe('U12 — standalone Destiny tree save/load', () => {
  it('exports a <DDOBuilderDestinyTree><DestinySpendInTree> document and round-trips', () => {
    const xml = exportDestinyTreeFile({
      treeName: 'Shiradi Champion',
      choices: { 'Force Manipulation': 3 },
      selections: {},
    })
    expect(xml).toContain('<DDOBuilderDestinyTree>')
    expect(xml).toContain('<DestinySpendInTree>')

    const parsed = parseTreeFile(xml)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.kind).toBe('destiny')
    expect(parsed.treeName).toBe('Shiradi Champion')
    expect(parsed.choices).toEqual({ 'Force Manipulation': 3 })
  })
})

describe('U12 — a real V2-authored file loads correctly', () => {
  it('parses the exact SpendInTree::Write shape V2 produces', () => {
    // Mirrors SpendInTree.cpp:165-170 (writer->StartElement/DL_WRITE) via
    // EnhancementsPane.cpp:966-977's SaxWriter document wrapper.
    const v2File = [
      '<?xml version="1.0"?>',
      '<DDOBuilderTree>',
      '<EnhancementSpendInTree>',
      '<TreeName>Ninja Spy</TreeName>',
      '<TreeVersion>3</TreeVersion>',
      '<TrainedEnhancement>',
      '<EnhancementName>Shadow Veil</EnhancementName>',
      '<Ranks>1</Ranks>',
      '</TrainedEnhancement>',
      '<TrainedEnhancement>',
      '<EnhancementName>Ninja Training</EnhancementName>',
      '<Selection>Dexterity</Selection>',
      '<Ranks>2</Ranks>',
      '</TrainedEnhancement>',
      '</EnhancementSpendInTree>',
      '</DDOBuilderTree>',
    ].join('\n')

    const parsed = parseTreeFile(v2File)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.kind).toBe('enhancement')
    expect(parsed.treeName).toBe('Ninja Spy')
    expect(parsed.choices).toEqual({ 'Shadow Veil': 1, 'Ninja Training': 2 })
    expect(parsed.selections).toEqual({ 'Ninja Training': 'Dexterity' })
  })

  it('rejects an unrelated XML file with a clear error', () => {
    const parsed = parseTreeFile('<?xml version="1.0"?><DDOBuilderCharacterData></DDOBuilderCharacterData>')
    expect('error' in parsed).toBe(true)
  })
})
