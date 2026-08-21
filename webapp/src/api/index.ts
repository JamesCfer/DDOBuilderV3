import type { Race, DDOClass, Feat, EnhancementTree, Item, Augment, SetBonus, Stance, GuildBuff, Filigree, FiligreeSetBonus, OptionalBuff, Patron, Quest, SentientGem, Spell } from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'
import type { AttackRate, BonusTypeSpec, Challenge, ItemBuffSpec, ItemClickieSpec } from '../server/dataLoaders'
import type { CraftingSystemSummary, CraftingSystemDetail } from '../server/crafting'

const BASE = '/api'

// ---------------------------------------------------------------------------
// Catalogue cache
// ---------------------------------------------------------------------------
// The data-file catalogues never change while the app is running, but panels
// fetch them independently — /api/classes and /api/races were each requested
// five times per session, and every open of a gear picker re-downloaded the
// slot's item list (4.2 MB for Main Hand; 8.1 MB for Find Gear's full
// catalogue). Responses for these paths are memoised by full URL, and
// concurrent callers share one in-flight request instead of racing.
//
// Only static data lives here. Anything user- or build-specific (community
// browsing, parity runs, set-bonus lookups for the current gear) stays
// uncached so it always reflects current state.
const CACHEABLE = new Set([
  '/races', '/classes', '/feats', '/enhancements', '/items', '/item',
  '/augments', '/stances', '/setbonuses', '/guildbuffs', '/filigree',
  '/filigree-bonuses', '/selfbuffs', '/patrons', '/quests', '/gems',
  '/spells', '/weapongroups', '/attack-rates', '/bonus-types', '/challenges',
  '/ignored-list', '/adventure-packs', '/item-buffs', '/item-clickies',
  '/crafting',
])

/**
 * The crafting catalogue is as static as the rest, but its detail routes
 * carry the system in the path (`/crafting/greensteel`) rather than a query
 * string, so the exact-match set above cannot cover them. Browsing the
 * Crafting page is exactly the "flip between systems" pattern that wants a
 * cache, so match the prefix.
 */
function isCacheable(path: string): boolean {
  return CACHEABLE.has(path) || path.startsWith('/crafting/')
}

const responseCache = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

/** Test-only: drop every memoised catalogue response. */
export function resetApiCacheForTests(): void {
  responseCache.clear()
  inflight.clear()
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const key = url.toString()
  const cacheable = isCacheable(path)

  if (cacheable) {
    if (responseCache.has(key)) return responseCache.get(key) as T
    const pending = inflight.get(key)
    if (pending) return pending as Promise<T>
  }

  const request = fetch(key)
    .then(res => {
      if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
      return res.json() as Promise<T>
    })
    .then(data => {
      if (cacheable) responseCache.set(key, data)
      return data
    })
    .finally(() => {
      inflight.delete(key)
    })

  if (cacheable) inflight.set(key, request)
  return request
}

/** POST JSON, surfacing the server's `error` message when it rejects. */
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(detail?.error ?? `API ${path} → ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  races: () => get<Race[]>('/races'),
  classes: () => get<DDOClass[]>('/classes'),
  feats: (params?: { group?: string; acquire?: string }) => get<Feat[]>('/feats', params),
  enhancements: () => get<EnhancementTree[]>('/enhancements'),
  items: (params?: { slot?: string; minLevel?: number; maxLevel?: number }) =>
    get<Item[]>('/items', params as Record<string, string | number> | undefined),
  item: (name: string) => get<Item | null>('/item', { name }),
  augments: (params?: { type?: string }) => get<Augment[]>('/augments', params as Record<string, string> | undefined),
  stances: () => get<Stance[]>('/stances'),
  health: () => get<{ status: string; dataDir: string }>('/health'),
  version: () => get<{ version: string }>('/version'),
  itemSetBonuses: (names: string[]) =>
    names.length === 0
      ? Promise.resolve([] as Array<{ type: string; count: number }>)
      : get<Array<{ type: string; count: number }>>('/item-setbonuses', { names: names.join(',') }),
  setbonuses: () => get<SetBonus[]>('/setbonuses'),
  guildbuffs: () => get<GuildBuff[]>('/guildbuffs'),
  filigree: () => get<Filigree[]>('/filigree'),
  filigreeSetBonuses: () => get<FiligreeSetBonus[]>('/filigree-bonuses'),
  selfbuffs: () => get<OptionalBuff[]>('/selfbuffs'),
  patrons: () => get<Patron[]>('/patrons'),
  quests: () => get<Quest[]>('/quests'),
  gems: () => get<SentientGem[]>('/gems'),
  spells: () => get<Spell[]>('/spells'),
  weaponGroups: () => get<WeaponGroupSpec[]>('/weapongroups'),
  // V2-parity additions: AttackRates / BonusTypes / Challenges / ItemBuffs / ItemClickies
  attackRates: () => get<AttackRate[]>('/attack-rates'),
  bonusTypes: () => get<BonusTypeSpec[]>('/bonus-types'),
  challenges: () => get<Challenge[]>('/challenges'),
  ignoredList: () => get<string[]>('/ignored-list'),
  adventurePacks: () => get<string[]>('/adventure-packs'),
  itemBuffs: () => get<ItemBuffSpec[]>('/item-buffs'),
  itemClickies: () => get<ItemClickieSpec[]>('/item-clickies'),
  // Crafting systems (Crafting page — reference data, not build data)
  crafting: () => get<CraftingSystemSummary[]>('/crafting'),
  craftingSystem: (key: string) => get<CraftingSystemDetail>(`/crafting/${encodeURIComponent(key)}`),
  // In-game DungeonHelper plugins (downloads, not build data)
  plugins: () => get<PluginCatalogue>('/plugins'),
  /** Whether this server can deliver bug reports (Discord bot configured). */
  bugReportConfig: () => get<{ enabled: boolean }>('/bug-report/config'),
  sendBugReport: (report: { text: string; page?: string; version?: string }) =>
    post<{ ok: true }>('/bug-report', report),
}

/** A downloadable in-game plugin release (see /api/plugins). */
export interface PluginRelease {
  key: string
  name: string
  author: string
  description: string
  manifest: string
  version: string | null
  notes: string | null
  zipUrl: string | null
  isManager: boolean
}

export interface PluginCatalogue {
  managerKey: string
  plugins: PluginRelease[]
}
