/**
 * "Enhancement trees not coming across" (user-reported) — three fixes:
 *  1. EnhancementTreePanel's auto-pin effect pruned `pinned` against the
 *     still-empty tree catalogue on mount, wiping the imported tabs.
 *     (Covered by the jsdom probe assertions in panelRenderSmoke + here via
 *     budget math; the guard is `loading || enhTrees.length === 0`.)
 *  2. Effect_RAPBonus is RACIAL action points (Life::CountBonusRacialAP),
 *     not reaper — was mis-keyed.
 *  3. Character-level Special feats (Inherent Racial/Universal Action Point
 *     ×N, …) were parsed then dropped by the importer; the AP budget showed
 *     "102 / 80" for Maetrim. V2 budget = min(20,level)·4 + RAP + UAP
 *     (Build::AvailableActionPoints TT_allEnhancement, Build.cpp:1727-1783).
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { loadFeats } from '../server/dataLoaders'
import { computeBonusActionPoints, enhancementAPBudget } from '../lib/actionPoints'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const FIX = join(__dirname, '..', '..', '..', 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')
const have = existsSync(DATA) && existsSync(FIX)

describe.skipIf(!have)('enhancement AP budget (V2 TT_allEnhancement)', () => {
  it('imports Special feats and balances Maetrim at exactly 104 AP', () => {
    // Upstream 2.0.0.81 updated this example build: a 4th Inherent Universal
    // Action Point redemption (+1 UAP) and Duergar past lives (Tier 3: "+1
    // Racial Tree Action point", Races/Duergar.race.xml:99-104). "Past Life:
    // Duergar" is recorded at Life scope in this fixture (<Life>
    // <SpecialFeats>), not Character scope — v2Import.ts only read the
    // Character-level node until this pass wired in the Life-level merge
    // (V2 Life::AllSpecialFeats(), Life.cpp:709-713), so Duergar's RAP was
    // dropped and the budget under-counted by 1 (was 103).
    const { build } = importV2Build(readFileSync(FIX, 'utf-8'))
    expect(build.pastLives['Inherent Racial Action Point']).toBe(3)
    expect(build.pastLives['Inherent Universal Action Point']).toBe(4)
    expect(build.pastLives['Duergar']).toBe(3)
    const feats = loadFeats(DATA)
    const bonus = computeBonusActionPoints(build, feats)
    expect(bonus.racial + bonus.universal).toBe(24)
    expect(enhancementAPBudget(build, feats)).toBe(104) // 80 + 24 — V2-legal spend
    expect(build.enhancementPinned).toContain('Shintao')
    expect(build.enhancementPinned).toContain('Falconry')
  })

  it('a fresh level-N build budgets min(20, N)·4 with no bonuses', () => {
    const { build } = importV2Build(readFileSync(FIX, 'utf-8'))
    const fresh = { ...build, pastLives: {}, favorFeats: [], totalLevel: 12 }
    expect(enhancementAPBudget(fresh, loadFeats(DATA))).toBe(48)
  })
})
