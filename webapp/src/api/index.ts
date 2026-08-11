import type { Race, DDOClass, Feat, EnhancementTree, Item, Augment, SetBonus, Stance, GuildBuff, Filigree, FiligreeSetBonus, OptionalBuff, Patron, Quest, SentientGem, Spell } from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'
import type { AttackRate, BonusTypeSpec, Challenge, ItemBuffSpec, ItemClickieSpec } from '../server/dataLoaders'

const BASE = '/api'

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
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
  // In-game DungeonHelper plugins (downloads, not build data)
  plugins: () => get<PluginCatalogue>('/plugins'),
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
