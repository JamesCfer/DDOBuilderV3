// useBuildStats — React hook wrapper around the pure stat aggregation layer.
//
// All computation lives in ../lib/buildStats (computeBuildStats et al.), which
// is React-free so the Express server and CLI scripts can use it too. This
// module memoises the expensive pieces for component use and re-exports the
// whole pure API so existing `from '../hooks/useBuildStats'` imports keep
// working unchanged.

import { useMemo } from 'react'
import { useCharacter } from '../context/CharacterContext'
import { useDocument } from '../context/DocumentContext'
import { findActiveLife } from '../lib/multiLife'
import type { CharacterBuild } from '../types/ddo'
import { resolveBonus, emptyResolvedStat } from '../lib/bonus'
import type { ResolvedStat } from '../lib/bonus'
import { deriveWeaponClasses } from '../lib/weapons/groups'
import {
  buildStatMap, buildRuntimeGroupAdds, extractWeaponInfo, extractArmorMaxDex,
} from '../lib/buildStats'
import type { BuildStats, BuildStatsInput, StatMap } from '../lib/buildStats'

export * from '../lib/buildStats'

export function useBuildStats(input: BuildStatsInput, buildOverride?: CharacterBuild): BuildStats {
  const ctx = useCharacter()
  const build = buildOverride ?? ctx.build
  const { doc } = useDocument()

  // Life.specialFeats isn't owned by CharacterBuild, so it isn't part of
  // `input` for most callers — default it to the active build's own life
  // here (the common case: every panel computing stats for the build the
  // user is editing). A caller comparing a different build (BuildCompare)
  // may pass `input.specialFeats` explicitly; otherwise it's left empty
  // rather than misattributed to the active life.
  const isActiveBuild = build === ctx.build
  const resolvedSpecialFeats = input.specialFeats
    ?? (isActiveBuild ? findActiveLife(doc)?.specialFeats : undefined)
  const effectiveInput = resolvedSpecialFeats !== undefined && resolvedSpecialFeats !== input.specialFeats
    ? { ...input, specialFeats: resolvedSpecialFeats }
    : input

  const statMap = useMemo<StatMap>(
    () => buildStatMap(effectiveInput, build),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      build,
      input.allClasses, input.allRaces, input.allFeats, input.allTrees,
      input.allSelfBuffs, input.allAugments, input.allSetBonuses,
      input.allFiligreeBonuses, input.allFiligrees, input.gearItems,
      resolvedSpecialFeats,
    ],
  )

  const weaponInfo = useMemo(() => extractWeaponInfo(input.gearItems), [input.gearItems])
  const armorMaxDex = useMemo(() => extractArmorMaxDex(input.gearItems), [input.gearItems])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupAddsResult = useMemo(() => buildRuntimeGroupAdds(input, build), [build, input.allFeats, input.allTrees, input.allClasses, input.allRaces])

  return useMemo<BuildStats>(() => {
    const statMapKeys = Array.from(statMap.keys())
    const slaList = statMapKeys
      .filter(k => k.startsWith('sla.'))
      .sort()
      .map(k => k.slice(4))
    const grantedFeatsList = statMapKeys
      .filter(k => k.startsWith('grantedFeat.'))
      .sort()
      .map(k => k.slice('grantedFeat.'.length))
    const groups = input.allWeaponGroups ?? []
    const { adds: groupAdds, merges: groupMerges } = groupAddsResult
    return {
      resolve: (key: string): ResolvedStat => {
        const bonuses = statMap.get(key)
        return bonuses?.length ? resolveBonus(bonuses) : emptyResolvedStat()
      },
      total: (key: string): number => {
        const bonuses = statMap.get(key)
        return bonuses?.length ? resolveBonus(bonuses).total : 0
      },
      keys: () => Array.from(statMap.keys()),
      weapon: weaponInfo,
      armorMaxDex,
      slaList,
      grantedFeatsList,
      isWeaponProficient: (weaponType: string) =>
        deriveWeaponClasses(weaponType, groups, groupAdds, groupMerges).has('Proficiency'),
    }
  }, [statMap, weaponInfo, armorMaxDex, input.allWeaponGroups, groupAddsResult])
}

// ---------------------------------------------------------------------------
// Skill → ability name lookup
