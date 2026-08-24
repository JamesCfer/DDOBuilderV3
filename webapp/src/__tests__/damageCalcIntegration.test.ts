// End-to-end check of the damage calculator against the real shipped data.
//
// Loads Items.xml / ItemBuffs.xml through the same loaders the server uses,
// equips a weapon that actually carries "Dripping with Magma", and confirms
// the effect survives the whole chain: item buff -> template lookup ->
// catalogue -> simulation list -> a damage bucket that is larger than zero.

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { XMLParser } from 'fast-xml-parser'

import { loadItemBuffs, type ItemBuffSpec } from '../server/dataLoaders'
import { extractLists } from '../lib/combat/autoDamage'
import { simulateDamage, emptyLists, type CoreParams } from '../lib/combat/damageSim'
import type { Item } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const ITEMS_DIR = join(DATA_DIR, 'Items')
const haveData = existsSync(ITEMS_DIR)

let itemBuffs: ItemBuffSpec[] = []
let magmaWeapon: Item | null = null

beforeAll(() => {
  if (!haveData) return
  itemBuffs = loadItemBuffs(DATA_DIR)

  // Find a shipped weapon carrying the effect, rather than hard-coding one.
  const parser = new XMLParser({ ignoreAttributes: false })
  for (const file of readdirSync(ITEMS_DIR)) {
    if (!file.endsWith('.item')) continue
    const raw = readFileSync(join(ITEMS_DIR, file), 'utf8')
    if (!raw.includes('Dripping with Magma')) continue
    const parsed = parser.parse(raw) as { Items?: { Item?: Item | Item[] } }
    const item = parsed?.Items?.Item
    magmaWeapon = (Array.isArray(item) ? item[0] : item) ?? null
    if (magmaWeapon) break
  }
})

function params(over: Partial<CoreParams> = {}): CoreParams {
  return {
    atk: 110, prof: 20, prec: 0, seeker: 0, threat: 17,
    critMult: 3, crit19: 0, confPrec: true,
    wMult: 1, wCount: 2, wSides: 6, wFlat: 0,
    deadly: 60, deadlyCrit: 60, coreTag: 'physical',
    sneakPct: 0, decHit: 0, decDmg: 0, sneakDice: 0, sneakTag: 'physical',
    imbBonus: 0, imbSides: 8, imbRate: 100, imbSrc: 'RP', imbSP: 0,
    imbMRR: true, imbTag: 'untyped',
    rp: 100, ds: 30, apm: 100,
    ac: 80, fort: 50, bypass: 0, prr: 50, mrr: 0,
    dur: 60, trials: 100, seed: 7,
    ...over,
  }
}

describe.runIf(haveData)('damage calculator against real game data', () => {
  it('finds a shipped weapon that carries Dripping with Magma', () => {
    expect(magmaWeapon).not.toBeNull()
    expect(magmaWeapon!.Name).toBeTruthy()
  })

  it('carries the effect from the item file all the way into a DoT', () => {
    const { lists, audit } = extractLists({ Weapon1: magmaWeapon! }, itemBuffs)

    const magma = lists.dots.find(d => d.name.startsWith('Dripping with Magma'))
    expect(magma, 'Dripping with Magma should reach the DoT list').toBeDefined()
    expect(magma!.tag).toBe('fire')
    // 10d20 per stack, from DDO wiki -- the item file itself states nothing.
    expect(magma!.dice).toBe(10)
    expect(magma!.sides).toBe(20)
    expect(magma!.cap).toBe(5)

    const row = audit.find(a => a.name.startsWith('Dripping with Magma'))
    expect(row?.confidence).toBe('exact')
    expect(row?.source).toContain(magmaWeapon!.Name)
  })

  it('turns that DoT into real damage in the simulation', () => {
    const { lists } = extractLists({ Weapon1: magmaWeapon! }, itemBuffs)

    const without = simulateDamage(params(), emptyLists())
    const withGear = simulateDamage(params(), lists)

    expect(without.buckets.dot).toBe(0)
    expect(withGear.buckets.dot).toBeGreaterThan(0)
    expect(withGear.mean).toBeGreaterThan(without.mean)
  })

  it('never lets a guard effect contribute outgoing damage', () => {
    // Build a synthetic item carrying only guard-style buffs from the real
    // catalogue and confirm none of them produce entries.
    const guards = itemBuffs
      .filter(b => !b.Effect && /guard/i.test(b.Type ?? ''))
      .slice(0, 20)
    expect(guards.length).toBeGreaterThan(0)

    const { lists } = extractLists(
      { Trinket: { Name: 'Guard Test', Buff: guards.map(g => ({ Type: g.Type })) } as Item },
      itemBuffs,
    )
    expect(lists.procs).toHaveLength(0)
    expect(lists.dots).toHaveLength(0)
  })

  it('does not double-count buffs that already carry stat effects', () => {
    // Every template with <Effect> blocks is applied by useBuildStats, so the
    // calculator must ignore all of them.
    const statBuffs = itemBuffs.filter(b => b.Effect).slice(0, 40)
    expect(statBuffs.length).toBeGreaterThan(0)

    const { lists, audit } = extractLists(
      { Trinket: { Name: 'Stat Test', Buff: statBuffs.map(b => ({ Type: b.Type })) } as Item },
      itemBuffs,
    )
    expect(audit).toHaveLength(0)
    expect(lists.procs.length + lists.dots.length + lists.debuffs.length).toBe(0)
  })
})
