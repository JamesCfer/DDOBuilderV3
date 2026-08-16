// Shared loader that fetches every static dataset useBuildStats needs.
// Replaces the boilerplate `Promise.all([api.classes(), api.races(), …])`
// blocks in BreakdownsPanel / CombatPanel / DCPanel / ForumExportPanel /
// BuildCompare / SpellsPanel / AutomaticFeats / EpicDestiniesPanel.
//
// The bundle is fetched ONCE per app session (module-level cache shared by
// every consumer) and warmed at app start, so switching tabs never refetches
// the catalogues and every panel computes stats from the same complete data.

import { useEffect, useState } from 'react'
import { api } from '../api'
import type {
  DDOClass, Race, Feat, EnhancementTree, Augment, SetBonus, FiligreeSetBonus,
  Filigree, OptionalBuff, GuildBuff, Spell, Stance,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'
import type { BonusTypeSpec, ItemBuffSpec } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'

export interface StaticBundle {
  allClasses: DDOClass[]
  allRaces: Race[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]
  allSelfBuffs: OptionalBuff[]
  allAugments: Augment[]
  allSetBonuses: SetBonus[]
  allFiligreeBonuses: FiligreeSetBonus[]
  allFiligrees: Filigree[]
  allWeaponGroups: WeaponGroupSpec[]
  allGuildBuffs: GuildBuff[]
  allSpells: Spell[]
  allBonusTypes: BonusTypeSpec[]
  allItemBuffs: ItemBuffSpec[]
  /** Stances.xml catalogue — drives the data-driven AUTO stance pass in
   *  buildStats (without it, only the hard-coded stance families derive). */
  allStances: Stance[]
  /** True once every catalogue fetch has settled. */
  loaded: boolean
}

const empty: StaticBundle = {
  allClasses: [], allRaces: [], allFeats: [], allTrees: [],
  allSelfBuffs: [], allAugments: [], allSetBonuses: [],
  allFiligreeBonuses: [], allFiligrees: [], allWeaponGroups: [],
  allGuildBuffs: [], allSpells: [], allBonusTypes: [], allItemBuffs: [],
  allStances: [],
  loaded: false,
}

// Module-level cache: one fetch set per app session, shared by all consumers.
let cache: StaticBundle | null = null
let inflight: Promise<StaticBundle> | null = null

/**
 * Kick off (or join) the one shared catalogue load. Called from App at
 * startup so the data is loading before the user reaches any stats tab, and
 * from useStaticBundle on first consumer mount.
 */
export function preloadStaticBundle(): Promise<StaticBundle> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = Promise.all([
      api.classes().catch(() => [] as DDOClass[]),
      api.races().catch(() => [] as Race[]),
      api.feats().catch(() => [] as Feat[]),
      api.enhancements().catch(() => [] as EnhancementTree[]),
      api.selfbuffs().catch(() => [] as OptionalBuff[]),
      api.augments().catch(() => [] as Augment[]),
      api.setbonuses().catch(() => [] as SetBonus[]),
      api.filigreeSetBonuses().catch(() => [] as FiligreeSetBonus[]),
      api.filigree().catch(() => [] as Filigree[]),
      api.weaponGroups().catch(() => [] as WeaponGroupSpec[]),
      api.guildbuffs().catch(() => [] as GuildBuff[]),
      api.spells().catch(() => [] as Spell[]),
      api.bonusTypes().catch(() => [] as BonusTypeSpec[]),
      api.itemBuffs().catch(() => [] as ItemBuffSpec[]),
      api.stances().catch(() => [] as Stance[]),
    ]).then(([
      allClasses, allRaces, allFeats, allTrees, allSelfBuffs, allAugments,
      allSetBonuses, allFiligreeBonuses, allFiligrees, allWeaponGroups,
      allGuildBuffs, allSpells, allBonusTypes, allItemBuffs, allStances,
    ]) => {
      if (allBonusTypes.length > 0) {
        initBonusTypes(allBonusTypes)
      }
      cache = {
        allClasses, allRaces, allFeats, allTrees, allSelfBuffs, allAugments,
        allSetBonuses, allFiligreeBonuses, allFiligrees, allWeaponGroups,
        allGuildBuffs, allSpells, allBonusTypes, allItemBuffs, allStances,
        loaded: true,
      }
      return cache
    })
  }
  return inflight
}

/** Test-only: clear the module-level cache between test files/cases. */
export function resetStaticBundleForTests(): void {
  cache = null
  inflight = null
}

export function useStaticBundle(): StaticBundle {
  const [bundle, setBundle] = useState<StaticBundle>(() => cache ?? empty)

  useEffect(() => {
    if (cache) {
      setBundle(cache)
      return
    }
    let cancelled = false
    preloadStaticBundle().then(b => {
      if (!cancelled) setBundle(b)
    })
    return () => { cancelled = true }
  }, [])

  return bundle
}
