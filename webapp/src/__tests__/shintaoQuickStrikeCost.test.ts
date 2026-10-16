// Tester report (in game): Shintao: Quick Strike costs 2 AP. V2 2.0.0.86
// changed it to 1, and V3 keeps 2 over that, so a later V2 sync that brings
// the 1 back fails here instead of shipping quietly.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnhancementTrees } from '../server/dataLoaders'
import { costUpToRank } from '../lib/enhancementSpend'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

describe('Shintao: Quick Strike', () => {
  it.skipIf(!existsSync(DATA))('costs 2 AP', () => {
    const tree = loadEnhancementTrees(DATA).find(t => t.Name === 'Shintao')!
    const item = tree.EnhancementTreeItem!.find(i => i.InternalName === 'ShintaoQuickStrike')!
    expect(costUpToRank(item, 1)).toBe(2)
  })
})
