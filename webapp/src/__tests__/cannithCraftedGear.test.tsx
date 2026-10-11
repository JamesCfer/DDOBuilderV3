// @vitest-environment jsdom
//
// Build-your-own Cannith crafted gear (the in-game "Magic Item"). V2 ships one
// `<UserSetsLevel/>` item per slot type at MinLevel 0; its item list always
// offers them (ItemSelectDialog.cpp:306-308), the player picks the item level
// (SetupItemLevel / OnItemLevelSelect), and every Cannith shard slot reads its
// LevelValue at that level (ItemSelectDialog.cpp:251-258,
// Build::GetLatestVersionOfItem). V3's picker dropped every level-0 item.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { loadAllCatalogues, loadItems, loadAugments } from '../server/dataLoaders'
import { computeBuildStats } from '../lib/buildStats'
import { initBonusTypes } from '../lib/bonus'
import { exportV2Build } from '../lib/v2Export'
import { importV2Build } from '../lib/v2Import'
import { craftedAugmentLevelIndex, craftedItemLevel, effectiveItemLevel, userSetsLevel } from '../lib/craftedItems'
import { reducer, CharacterProvider } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'
import GearPanel from '../components/items/GearPanel'
import { emptyBuild, type CharacterBuild, type Item } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const RING: Item = {
  Name: 'Cannith Crafted Ring',
  UserSetsLevel: '',
  NoAutoUpdate: '',
  MinLevel: 0,
  EquipmentSlot: { Ring: true },
  ItemAugment: [{ Type: 'Cannith Ring Prefix' }, { Type: 'Cannith Ring Suffix' }, { Type: 'Cannith Ring Extra' }],
}

describe('crafted item helpers', () => {
  it('recognises the UserSetsLevel flag', () => {
    expect(userSetsLevel(RING)).toBe(true)
    expect(userSetsLevel({ Name: 'Plain', MinLevel: 0 })).toBe(false)
  })

  it('uses the chosen level, defaulting to 1 like V2', () => {
    expect(craftedItemLevel('Ring', {})).toBe(1)
    expect(craftedItemLevel('Ring', { Ring: 20 })).toBe(20)
    expect(effectiveItemLevel(RING, 'Ring', { Ring: 12 })).toBe(12)
    expect(effectiveItemLevel({ Name: 'x', MinLevel: 29 }, 'Ring', { Ring: 12 })).toBe(29)
  })

  it('forces the item level onto Cannith shard slots only', () => {
    expect(craftedAugmentLevelIndex(RING, 'Ring', 'Cannith Ring Prefix', { Ring: 20 })).toBe(19)
    expect(craftedAugmentLevelIndex(RING, 'Ring', 'Add Augment 1', { Ring: 20 })).toBeUndefined()
    expect(craftedAugmentLevelIndex({ Name: 'x' }, 'Ring', 'Cannith Ring Prefix', { Ring: 20 })).toBeUndefined()
  })
})

describe('crafted item level reducer', () => {
  it('stores the level with the item and drops it with the item', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_GEAR', slot: 'Ring', itemName: RING.Name, itemLevel: 20 })
    expect(b.gearItemLevels?.Ring).toBe(20)
    b = reducer(b, { type: 'SET_GEAR_ITEM_LEVEL', slot: 'Ring', itemLevel: 7 })
    expect(b.gearItemLevels?.Ring).toBe(7)
    b = reducer(b, { type: 'SET_GEAR', slot: 'Ring', itemName: 'Something Else' })
    expect(b.gearItemLevels?.Ring).toBeUndefined()
    b = reducer(b, { type: 'SET_GEAR', slot: 'Ring', itemName: RING.Name, itemLevel: 9 })
    b = reducer(b, { type: 'CLEAR_GEAR', slot: 'Ring' })
    expect(b.gearItemLevels?.Ring).toBeUndefined()
  })

  it('saves and restores the level with a named gear set', () => {
    let b = emptyBuild()
    b = reducer(b, { type: 'SET_GEAR', slot: 'Ring', itemName: RING.Name, itemLevel: 15 })
    b = reducer(b, { type: 'SAVE_GEAR_SET', setName: 'A' })
    b = reducer(b, { type: 'SET_GEAR_ITEM_LEVEL', slot: 'Ring', itemLevel: 3 })
    b = reducer(b, { type: 'LOAD_GEAR_SET', setName: 'A' })
    expect(b.gearItemLevels?.Ring).toBe(15)
  })
})

describe.runIf(haveData)('Cannith crafted gear data and stats', () => {
  const cat = loadAllCatalogues(DATA_DIR)
  initBonusTypes(cat.allBonusTypes)

  it('ships a level-0 user-levelled crafted item for every Cannith slot type', () => {
    const crafted = cat.allItems.filter(i => userSetsLevel(i) && /Cannith ?Crafted|CannithCrafted/i.test(i.Name))
    const slots = new Set(crafted.flatMap(i => Object.keys(i.EquipmentSlot ?? {})))
    for (const slot of ['Helmet', 'Necklace', 'Trinket', 'Armor', 'Cloak', 'Belt', 'Ring', 'Gloves', 'Bracers', 'Boots', 'Goggles', 'Weapon2']) {
      expect(slots.has(slot), slot).toBe(true)
    }
    for (const item of crafted) expect(item.MinLevel ?? 0).toBe(0)
  })

  function hideAt(level: number): number | undefined {
    const ring = cat.allItems.find(i => i.Name === 'Cannith Crafted Ring')!
    const build: CharacterBuild = {
      ...emptyBuild(),
      gear: { Ring: ring.Name },
      gearItemLevels: { Ring: level },
      augmentChoices: { 'Ring:Cannith Ring Prefix:0': 'Hide' },
    }
    const stats = computeBuildStats({
      allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
      allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
      allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
      allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
      allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
      allItemBuffs: cat.allItemBuffs, gearItems: { Ring: ring },
    }, build)
    return stats.resolve('skill.Hide').bonuses.find(b => b.source.includes('Hide'))?.value
  }

  it('scales a Cannith shard with the chosen item level (LevelValue[level - 1])', () => {
    // Hide's LevelValue: 3 4 5 … (index 0 → +3, index 19 → +17).
    expect(hideAt(1)).toBe(3)
    expect(hideAt(20)).toBe(17)
  })

  it('round-trips the crafted level through a V2 export', () => {
    const ring = cat.allItems.find(i => i.Name === 'Cannith Crafted Ring')!
    const build: CharacterBuild = {
      ...emptyBuild(),
      gear: { Ring: ring.Name },
      gearItemLevels: { Ring: 24 },
      augmentChoices: { 'Ring:Cannith Ring Prefix:0': 'Hide' },
    }
    const xml = exportV2Build(build, { [ring.Name]: ring })
    expect(xml).toContain('<UserSetsLevel/>')
    expect(xml).toContain('<MinLevel>24</MinLevel>')
    expect(xml).toContain('<SelectedLevelIndex>23</SelectedLevelIndex>')
    const back = importV2Build(xml).build
    expect(back.gear.Ring).toBe(ring.Name)
    expect(back.gearItemLevels?.Ring).toBe(24)
  })
})

// ---------------------------------------------------------------------------

let mounted: Array<{ root: Root; container: HTMLElement }> = []

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
  resetStaticBundleForTests()
})

describe.runIf(haveData)('gear picker offers the crafted item', () => {
  beforeAll(() => {
    const data = { items: loadItems(DATA_DIR), augments: loadAugments(DATA_DIR) }
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const key = url.pathname.replace(/^\/api\//, '')
      let body: unknown = []
      if (key === 'items') {
        const slot = url.searchParams.get('slot')
        body = slot
          ? (data.items as unknown as Array<Record<string, unknown>>).filter(i => {
            const s = i.EquipmentSlot as Record<string, unknown> | undefined
            return s && slot in s
          })
          : data.items
      } else if (key === 'item') {
        body = (data.items as unknown as Array<Record<string, unknown>>)
          .find(i => i.Name === url.searchParams.get('name')) ?? null
      } else if (key === 'augments') {
        body = data.augments
      }
      return new Response(JSON.stringify(body), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
  })

  async function settle(n = 6) {
    for (let i = 0; i < n; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
  }

  it('lists the Cannith Crafted Ring and shows an item level select once equipped', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(
        <CharacterProvider>
          <DocumentProvider>
            <SettingsProvider>
              <GearPanel />
            </SettingsProvider>
          </DocumentProvider>
        </CharacterProvider>,
      )
    })
    mounted.push({ root, container })
    await settle()

    const ringSlot = Array.from(container.querySelectorAll('[class*="slotRow"]'))
      .find(r => r.querySelector('[class*="slotLabel"]')?.textContent === 'Ring (1)')!
    await act(async () => { (ringSlot.querySelector('button[class*="slotBtn"]') as HTMLButtonElement).click() })
    await settle()

    const tile = Array.from(container.querySelectorAll('button[class*="pickerItem"]'))
      .find(b => b.textContent?.includes('Cannith Crafted Ring')) as HTMLButtonElement | undefined
    expect(tile).toBeTruthy()
    await act(async () => { tile!.click() })
    await settle()

    const row = Array.from(container.querySelectorAll('[class*="slotRow"]'))
      .find(r => r.querySelector('[class*="slotLabel"]')?.textContent === 'Ring (1)')!
    const select = row.querySelector('select[class*="itemLevelSelect"]') as HTMLSelectElement
    expect(select).toBeTruthy()
    // Starts at the character's level, the top of the offered range.
    expect(select.value).toBe(select.options[select.options.length - 1].value)
    expect(select.options[0].value).toBe('1')
    // The Cannith shard slots appear under the item.
    expect(container.textContent).toContain('Cannith Ring Prefix')
  })
})
