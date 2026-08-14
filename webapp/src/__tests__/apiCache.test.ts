// @vitest-environment jsdom
//
// Catalogue responses are memoised at the api layer. Before this, opening a
// gear picker re-downloaded the slot's item list every time (4.2 MB for Main
// Hand) and panels each fetched /api/classes and /api/races independently.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, resetApiCacheForTests } from '../api'

let calls: string[] = []

beforeEach(() => {
  calls = []
  resetApiCacheForTests()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    calls.push(String(url))
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ Name: 'stub' }]),
    } as Response)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetApiCacheForTests()
})

const hits = (path: string) => calls.filter(u => u.includes(path)).length

describe('api catalogue cache', () => {
  it('fetches a catalogue once however many panels ask for it', async () => {
    await api.classes()
    await api.classes()
    await api.races()
    expect(hits('/api/classes')).toBe(1)
    expect(hits('/api/races')).toBe(1)
  })

  it('shares one in-flight request between concurrent callers', async () => {
    await Promise.all([api.items(), api.items(), api.items()])
    expect(hits('/api/items')).toBe(1)
  })

  it('caches each item slot separately', async () => {
    await api.items({ slot: 'Weapon1' })
    await api.items({ slot: 'Weapon1' })
    await api.items({ slot: 'Armor' })
    expect(calls.filter(u => u.includes('slot=Weapon1'))).toHaveLength(1)
    expect(calls.filter(u => u.includes('slot=Armor'))).toHaveLength(1)
  })

  it('returns the same data on a cache hit', async () => {
    const first = await api.classes()
    const second = await api.classes()
    expect(second).toEqual(first)
  })

  it('does not cache build- or user-specific endpoints', async () => {
    await api.itemSetBonuses(['A'])
    await api.itemSetBonuses(['A'])
    await api.version()
    await api.version()
    expect(hits('/api/item-setbonuses')).toBe(2)
    expect(hits('/api/version')).toBe(2)
  })

  it('does not cache a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      calls.push(String(url))
      return Promise.resolve({ ok: false, status: 500 } as Response)
    }))
    await expect(api.classes()).rejects.toThrow()
    await expect(api.classes()).rejects.toThrow()
    expect(hits('/api/classes')).toBe(2)
  })
})
