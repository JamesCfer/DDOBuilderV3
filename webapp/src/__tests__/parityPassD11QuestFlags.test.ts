/**
 * Parity pass — D11: `Quest.DoNotShow` flag normalisation (PARITY_TODO
 * "Medium-priority remaining › Data-file edge cases").
 *
 * V2 `Quest.h:59` (`DL_FLAG(_, DoNotShow)`) marks a handful of placeholder
 * `Quests.xml` entries (e.g. "Land of Lamordia", "Ruins of Myth Drannor" —
 * all `Favor=0`) hidden from every quest list. `<DoNotShow/>` is a
 * presence-only XML flag — the parser delivers it as `""`, which is falsy —
 * so `loadQuests` must promote it to an explicit `true`, the same pattern
 * already applied to `NoPastLife`/`NotHeroic`/`MinorArtifact`/`IsGreensteel`.
 * Without that normalisation, `FavorPanel.tsx`'s
 * `quests.filter(quest => !quest.DoNotShow)` is always true and never
 * filters anything.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadQuests } from '../server/dataLoaders'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

describe.skipIf(!haveData)('D11 — Quest.DoNotShow normalisation', () => {
  it('normalises <DoNotShow/> to boolean true on the flagged placeholder quests', () => {
    const quests = loadQuests(DATA_DIR)
    const lamordia = quests.find(q => q.Name === 'Land of Lamordia')
    const mythDrannor = quests.find(q => q.Name === 'Ruins of Myth Drannor')
    expect(lamordia?.DoNotShow).toBe(true)
    expect(mythDrannor?.DoNotShow).toBe(true)
  })

  it('leaves ordinary quests without the flag', () => {
    const quests = loadQuests(DATA_DIR)
    const flagged = quests.filter(q => q.DoNotShow)
    // V2's Quests.xml carries exactly 7 <DoNotShow/> placeholder entries.
    expect(flagged.length).toBe(7)
    const ordinary = quests.find(q => !q.DoNotShow)
    expect(ordinary?.DoNotShow).toBeUndefined()
  })
})
