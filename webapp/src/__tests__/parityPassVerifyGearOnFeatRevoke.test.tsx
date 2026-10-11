// @vitest-environment jsdom
//
// V2 Build::RevokeEnhancementEffects (Build.cpp:3748-3822) runs
// Build::VerifyGear whenever a revoked enhancement carried a GrantFeat
// effect, unequipping gear whose requirements the build no longer meets.
// That includes the load-time tree reset in CEnhancementsPane::DetermineTrees
// (EnhancementsPane.cpp:316-374), the one VerifyGear a load can trigger.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'
import { resetGearItemCacheForTests } from '../hooks/useGearItems'
import GearVerifier from '../components/builder/GearVerifier'
import { emptyBuild, type CharacterBuild, type EnhancementTree } from '../types/ddo'
import { revokedSpendGrantsFeat } from '../lib/enhancementSpend'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { computeV3ForXml } from '../server/oracleParity'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const RACES = [{ Name: 'Dwarf' }, { Name: 'Human' }]
const CLASSES = [{ Name: 'Fighter' }]
const ITEMS: Record<string, unknown> = {
  'Dwarven Bracers': {
    Name: 'Dwarven Bracers', MinLevel: 1,
    Requirements: { Requirement: [{ Type: 'Race', Item: ['Dwarf'] }] },
  },
  'Level Five Ring': { Name: 'Level Five Ring', MinLevel: 5 },
  'Plain Cloak': { Name: 'Plain Cloak', MinLevel: 1 },
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  let body: unknown = []
  if (url.pathname.endsWith('/races')) body = RACES
  else if (url.pathname.endsWith('/classes')) body = CLASSES
  else if (url.pathname.endsWith('/item')) body = ITEMS[url.searchParams.get('name') ?? ''] ?? null
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

const LOADED: CharacterBuild = {
  ...emptyBuild(),
  race: 'Dwarf',
  classes: [{ name: 'Fighter', levels: 6 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
  levelClasses: Array.from({ length: 6 }, () => 'Fighter'),
  totalLevel: 6,
  epicLevels: 0,
  legendaryLevels: 0,
  gear: { Bracers: 'Dwarven Bracers', Ring1: 'Level Five Ring', Cloak: 'Plain Cloak' },
}

let api: ReturnType<typeof useCharacter> | null = null
function Grab() { api = useCharacter(); return null }

let mounted: Array<{ root: Root; container: HTMLElement }> = []
beforeEach(() => { resetStaticBundleForTests(); resetGearItemCacheForTests(); api = null })
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
})

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
}

async function mountWith(build: CharacterBuild) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(
      React.createElement(CharacterProvider, null,
        React.createElement(DocumentProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(Grab),
            React.createElement(GearVerifier),
          ),
        ),
      ),
    )
  })
  mounted.push({ root, container })
  await act(async () => { api!.dispatch({ type: 'LOAD_BUILD', build }) })
  await settle()
}

const TREE: EnhancementTree = {
  Name: 'Test Tree',
  EnhancementTreeItem: [
    { Name: 'Grants', InternalName: 'TGrants', Effect: { Type: 'GrantFeat', Item: 'Some Feat' } },
    { Name: 'Plain', InternalName: 'TPlain', Effect: { Type: 'AbilityBonus', Item: 'Strength' } },
    { Name: 'Rank3', InternalName: 'TRank3', Effect: { Type: 'GrantFeat', Item: 'Diehard', Rank: 3 } },
    {
      Name: 'Pick', InternalName: 'TPick',
      Selector: [{ EnhancementSelection: [
        { Name: 'A', Effect: { Type: 'GrantFeat', Item: 'Other Feat' } },
        { Name: 'B', Effect: { Type: 'SkillBonus', Item: 'Spot' } },
      ] }],
    },
  ],
}

describe('revokedSpendGrantsFeat', () => {
  it('is true only when a lowered enhancement carries a GrantFeat effect', () => {
    expect(revokedSpendGrantsFeat(TREE, { TGrants: 1 }, {})).toBe(true)
    expect(revokedSpendGrantsFeat(TREE, { TPlain: 2 }, { TPlain: 1 })).toBe(false)
    expect(revokedSpendGrantsFeat(TREE, { TGrants: 1 }, { TGrants: 1, TPlain: 1 })).toBe(false)
  })

  it('counts a ranked GrantFeat only when that rank is revoked', () => {
    // fuzz-5006: Tenuous Relationship With Death grants Diehard at rank 3 only.
    expect(revokedSpendGrantsFeat(TREE, { TRank3: 2 }, {})).toBe(false)
    expect(revokedSpendGrantsFeat(TREE, { TRank3: 3 }, {})).toBe(true)
    expect(revokedSpendGrantsFeat(TREE, { TRank3: 3 }, { TRank3: 2 })).toBe(true)
  })

  it('checks the chosen selection', () => {
    expect(revokedSpendGrantsFeat(TREE, { TPick: 1 }, {}, { TPick: 'A' })).toBe(true)
    expect(revokedSpendGrantsFeat(TREE, { TPick: 1 }, {}, { TPick: 'B' })).toBe(false)
  })
})

describe('enhancement edits that revoke a granted feat verify gear', () => {
  const FAILING: CharacterBuild = { ...LOADED, race: 'Human' }

  it('unequips gear the build fails when the edit revokes a GrantFeat enhancement', async () => {
    await mountWith(FAILING)
    expect(api!.build.gear.Bracers).toBe('Dwarven Bracers')
    await act(async () => {
      api!.dispatch({ type: 'RESET_ENH_TREE', treeName: 'Test Tree', verifyGear: true })
    })
    await settle()
    expect(api!.build.gear.Bracers).toBeUndefined()
    expect(api!.build.gear.Cloak).toBe('Plain Cloak')
  })

  it('leaves gear alone when no granted feat is revoked', async () => {
    await mountWith(FAILING)
    await act(async () => {
      api!.dispatch({ type: 'SET_ENH_CHOICES', treeName: 'Test Tree', choices: {}, verifyGear: false })
    })
    await settle()
    expect(api!.build.gear.Bracers).toBe('Dwarven Bracers')
  })
})

describe('load-time tree reset (oracle-pinned)', () => {
  const ROOT = join(__dirname, '..', '..', '..')
  const FUZZ = join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-5087.DDOBuild')
  const DATA = join(ROOT, 'Output', 'DataFiles')
  // An Aasimar with spend in "Aasimar: Scourge of the Undead": V2 resets the
  // tree at load, the revoke runs VerifyGear, and the Aasimar Scourge-only
  // Faded Tracker's Boots (+6 Dex, +25% speed) come off. v2calc: DEX 15,
  // movement speed 0, AC 16.
  it.skipIf(!existsSync(FUZZ) || !existsSync(DATA))('fuzz-5087 loses the boots like V2', () => {
    const cat = loadAllCatalogues(DATA)
    const { stats } = computeV3ForXml(readFileSync(FUZZ, 'utf8'), cat)
    expect(stats.total('ability.Dexterity')).toBe(15)
    expect(stats.resolve('speed').bonuses.some(b => /Tracker/.test(b.source ?? ''))).toBe(false)
    expect(stats.total('ac')).toBe(16)
  }, 120_000)
})
