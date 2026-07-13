/**
 * D1 — Legacy enhancement trees are never filtered.
 *
 * V2 `EnhancementTree.h` has a `Legacy` flag (`<Legacy/>` in
 * `Legacy_Monk_Shintao_v1.tree.xml` etc.); `EnhancementsPane.cpp:332` hides
 * any `HasLegacy()` tree from the tree picker unless the character already
 * has it trained. V3's data loader never parsed the flag and the tree
 * picker (`EnhancementTreePanel.tsx`) never filtered on it, so every Monk
 * build showed both the modern "Shintao" tree and the legacy " Shintao V1"/
 * "HenshinMystic v1"/"NinjaSpy v1" duplicates side by side.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadEnhancementTrees } from '../server/dataLoaders'
import { isEnhancementTree, isLegacyTreeVisible } from '../components/enhancements/EnhancementTreePanel'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const have = existsSync(DATA)

describe.skipIf(!have)('Legacy enhancement tree filtering (V2 parity)', () => {
  const trees = loadEnhancementTrees(DATA)
  const legacyShintao = trees.find(t => t.Name === 'Shintao V1')
  const modernShintao = trees.find(t => t.Name === 'Shintao')

  it('parses the <Legacy/> flag from the XML', () => {
    expect(legacyShintao?.Legacy).toBe(true)
    expect(modernShintao?.Legacy).toBeUndefined()
  })

  it('hides a legacy tree from the picker when the build has not trained it', () => {
    expect(isLegacyTreeVisible(legacyShintao!, [])).toBe(false)
    expect(isLegacyTreeVisible(modernShintao!, [])).toBe(true)
  })

  it('keeps a legacy tree visible once the build already has it pinned', () => {
    expect(isLegacyTreeVisible(legacyShintao!, ['Shintao V1'])).toBe(true)
  })

  it('does not affect the existing reaper/destiny exclusion', () => {
    const reaperTree = trees.find(t => t.IsReaperTree)
    expect(reaperTree).toBeDefined()
    expect(isEnhancementTree(reaperTree!)).toBe(false)
  })
})
