// The random-build fuzzer and the optimizer pick enhancement trees with
// `accessibleTrees`, which matched racial and class trees by name substring:
// a Tiefling could spend in "Tiefling Scoundrel" (Race requirement
// Tiefling Scoundrel). V3's stats drop such a tree as orphaned, while V2
// keeps spend in a tree it never selected, so 22 fuzz builds disagreed with
// the oracle for a reason no real save can produce, and the optimizer could
// suggest AP in a tree the build cannot use. Trees must also pass the real
// availability check.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { accessibleTrees } from '../lib/fuzz/randomBuild'
import { emptyBuild } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

describe.skipIf(!existsSync(DATA))('accessibleTrees', () => {
  const cat = loadAllCatalogues(DATA)
  const build = {
    ...emptyBuild(),
    race: 'Tiefling',
    classes: [{ name: 'Fighter', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
    levelClasses: Array(20).fill('Fighter'),
    totalLevel: 20,
  } as ReturnType<typeof emptyBuild>
  const names = accessibleTrees(cat, build).map(t => t.Name)

  it('offers only the racial tree of the build race', () => {
    expect(names).toContain('Tiefling')
    expect(names).not.toContain('Tiefling Scoundrel')
  })

  it('still offers the class and universal trees', () => {
    expect(names).toContain('Kensei')
    expect(names).toContain('Harper Agent')
  })
})
