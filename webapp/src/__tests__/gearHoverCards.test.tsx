// @vitest-environment jsdom
//
// Gear hover cards: an item's <Buff> names WHAT it boosts in <Item>/
// <Description1>, not in the buff Type — so "AbilityBonus 15 Intelligence"
// must read "+15 Intelligence (Enhancement)", never "+15 AbilityBonus".
// Also covers augment slot colouring and the augment preview card.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { loadItems, loadAugments } from '../server/dataLoaders'
import {
  describeBuff, formatBuffText, humanizeBuffType, augmentTypeColor,
  augmentDescription, augmentValueAtLevel,
} from '../lib/itemDisplay'
import type { Augment, ItemBuff } from '../types/ddo'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import { resetStaticBundleForTests } from '../hooks/useStaticBundle'
import GearPanel from '../components/items/GearPanel'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// Pure formatting
// ---------------------------------------------------------------------------

describe('buff display', () => {
  it('names the ability an AbilityBonus buff boosts', () => {
    const buff: ItemBuff = {
      Type: 'AbilityBonus', Value1: 15, BonusType: 'Enhancement',
      Description1: 'Intelligence', Item: 'Intelligence',
    }
    expect(describeBuff(buff)).toMatchObject({
      label: 'Intelligence', bonusType: 'Enhancement', value: '+15',
    })
    expect(formatBuffText(buff)).toBe('+15 Intelligence (Enhancement)')
  })

  it('names the skill a SkillBonus buff boosts', () => {
    const buff: ItemBuff = {
      Type: 'SkillBonus', Value1: 10, BonusType: 'Insightful', Item: 'Concentration',
    }
    expect(formatBuffText(buff)).toBe('+10 Concentration (Insightful)')
  })

  it('reads targeted stat families back as one name', () => {
    expect(describeBuff({ Type: 'EnergyResistance', Value1: 30, Item: 'Acid' }).label)
      .toBe('Acid Resistance')
    expect(describeBuff({ Type: 'SaveBonus', Value1: 3, Item: 'Reflex' }).label)
      .toBe('Reflex Save')
    expect(describeBuff({ Type: 'SpellPower', Value1: 50, Item: 'Fire' }).label)
      .toBe('Fire Spell Power')
  })

  it('drops the applies-to-everything placeholders weapon buffs carry', () => {
    // "Silver" with <Item>All</Item> is not "Silver (All)".
    expect(describeBuff({ Type: 'Silver', Item: 'All', Description1: 'All' }).label)
      .toBe('Silver')
    expect(describeBuff({ Type: 'Vorpal', Item: 'All' }).label).toBe('Vorpal')
  })

  it('prefers <Item> over a tier numeral in <Description1> for stat types', () => {
    // Some SchoolFocusNumber buffs put the numeral in Description1 and the
    // school in Item — the school is what names the stat.
    expect(describeBuff({
      Type: 'SchoolFocusNumber', Value1: 2, Item: 'Necromancy', Description1: 'II',
    }).label).toBe('Necromancy Spell DC')
  })

  it('joins a multi-stat target', () => {
    expect(describeBuff({
      Type: 'AbilityBonus', Value1: 8, Item: ['Strength', 'Constitution'],
    } as unknown as ItemBuff).label).toBe('Strength / Constitution')
  })

  it('keeps a meaningful non-stat target in parentheses', () => {
    expect(describeBuff({ Type: 'Wizardry', Description1: 'IX' }).label).toBe('Wizardry (IX)')
  })

  it('splits camel-case buff types', () => {
    expect(humanizeBuffType('SpellCriticalDamage')).toBe('Spell Critical Damage')
    expect(humanizeBuffType('MRRCap')).toBe('MRR Cap')
  })

  it('renders percent and split values', () => {
    expect(describeBuff({ Type: 'Doublestrike', Value1: 15, Percent: '' }).value).toBe('+15%')
    expect(describeBuff({ Type: 'Deception', Value1: 12, Value2: 18 }).value).toBe('+12/+18')
    expect(describeBuff({ Type: 'GhostTouch' }).value).toBeUndefined()
  })
})

describe('augment slot colours', () => {
  it('gives each slot colour its own distinct value', () => {
    const colors = ['Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Red', 'Colorless', 'Sun', 'Moon']
      .map(augmentTypeColor)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('colours the generated slot families by prefix', () => {
    expect(augmentTypeColor('Cannith Trinket Prefix')).toBe(augmentTypeColor('Cannith Ring Suffix'))
    expect(augmentTypeColor('Melancholic Slot (Armor)')).toBe(augmentTypeColor('Dolorous Slot (Armor)'))
    expect(augmentTypeColor('Reaper Helmet')).not.toBe(augmentTypeColor('Cannith Helmet Prefix'))
  })

  it('falls back to theme text colours for unknown/absent types', () => {
    expect(augmentTypeColor(undefined)).toBe('var(--color-text-muted)')
    expect(augmentTypeColor('Some Future Slot')).toBe('var(--color-text-secondary)')
  })
})

describe('augment descriptions', () => {
  const aug = {
    Name: 'Ruby of Acid Damage',
    Description: 'You deal an extra [value]d6 Acid damage on attacks',
    Type: 'Red',
    ChooseLevel: '',
    LevelValue: { '#text': '1 2 3 4 5 6 7 8 9 10', size: 10 },
  } as unknown as Augment

  it('resolves [value] at the host item level', () => {
    expect(augmentValueAtLevel(aug, 4)).toBe(4)
    expect(augmentDescription(aug, 4)).toBe('You deal an extra 4d6 Acid damage on attacks')
  })

  it('clamps past the end of the level table', () => {
    expect(augmentValueAtLevel(aug, 34)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Rendered hover card
// ---------------------------------------------------------------------------

const ITEM = 'Legendary Bracers of Method and Magic'

function routeApi(pathname: string, params: URLSearchParams, cat: Record<string, unknown[]>): unknown {
  const key = pathname.replace(/^\/api\//, '')
  if (key === 'items') {
    const slot = params.get('slot')
    const all = cat.items as Array<Record<string, unknown>>
    return slot
      ? all.filter(i => { const s = i.EquipmentSlot as Record<string, unknown> | undefined; return s && slot in s })
      : all
  }
  if (key === 'item') {
    return (cat.items as Array<Record<string, unknown>>).find(i => i.Name === params.get('name')) ?? null
  }
  if (key === 'augments') {
    const type = params.get('type')
    const all = cat.augments as Array<Record<string, unknown>>
    return type
      ? all.filter(a => { const t = a.Type; return Array.isArray(t) ? t.includes(type) : t === type })
      : all
  }
  return cat[key] ?? []
}

function EquipBracers({ children }: { children: React.ReactNode }) {
  const { dispatch } = useCharacter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    dispatch({ type: 'SET_GEAR', slot: 'Bracers', itemName: ITEM })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? <>{children}</> : null
}

let mounted: Array<{ root: Root; container: HTMLElement }> = []

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount())
    m.container.remove()
  }
  mounted = []
  resetStaticBundleForTests()
})

function hover(el: Element) {
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
}

describe.runIf(haveData)('GearPanel hover cards', () => {
  beforeAll(() => {
    const cat = { items: loadItems(DATA_DIR), augments: loadAugments(DATA_DIR) } as Record<string, unknown[]>
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      return new Response(JSON.stringify(routeApi(url.pathname, url.searchParams, cat)), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
  })

  async function renderGear() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    await act(async () => {
      root = createRoot(container)
      root.render(
        <CharacterProvider>
          <DocumentProvider>
            <SettingsProvider>
              <EquipBracers><GearPanel /></EquipBracers>
            </SettingsProvider>
          </DocumentProvider>
        </CharacterProvider>,
      )
    })
    for (let i = 0; i < 6; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
    mounted.push({ root, container })
    return container
  }

  it('names the ability and skill each item bonus applies to', async () => {
    const container = await renderGear()
    const slotBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes(ITEM))
    expect(slotBtn).toBeTruthy()
    await act(async () => { hover(slotBtn!) })

    const card = document.querySelector('[role="tooltip"]')
    expect(card).toBeTruthy()
    const text = card!.textContent ?? ''
    expect(text).toContain(ITEM)
    // The complaint: "+15 ability bonus" with no ability named.
    expect(text).not.toContain('AbilityBonus')
    expect(text).not.toContain('SkillBonus')
    expect(text).toContain('Intelligence')
    expect(text).toContain('Enhancement')
    expect(text).toContain('Concentration')
    expect(text).toContain('Insightful')
    expect(text).toContain('+15')
  })

  it('colours augment slot types and previews an augment on hover', async () => {
    const container = await renderGear()

    // The bracers ship with Green / Colorless / Moon slots — each gets its own
    // colour rather than the flat muted grey.
    const typeLabels = Array.from(container.querySelectorAll('span'))
      .filter(s => ['Green', 'Colorless', 'Moon'].includes(s.textContent ?? ''))
    expect(typeLabels.length).toBeGreaterThanOrEqual(3)
    for (const label of typeLabels) {
      expect((label as HTMLElement).style.color).not.toBe('')
    }

    // Open the Colorless slot picker and hover the first augment offered.
    const openBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === '— Empty —')
    expect(openBtn).toBeTruthy()
    await act(async () => { openBtn!.click() })
    for (let i = 0; i < 4; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }

    const options = Array.from(container.querySelectorAll('[role="option"]'))
    expect(options.length).toBeGreaterThan(1)
    await act(async () => { hover(options[1]) })

    const card = document.querySelector('[role="tooltip"]')
    expect(card).toBeTruthy()
    expect(card!.textContent).toContain(options[1].textContent?.replace(/Lv \d+$/, '').trim() ?? '')
  })
})
