/**
 * Parity gap — Guild Buff effects with AType="TotalLevel" always resolve to
 * Amount[0] instead of the value for the character's actual total level.
 *
 * V2 source: Effect.cpp:1205-1219 (Amount_TotalLevel) — `size_t level =
 * m_pBuild->Level()` (the TOTAL character level, heroic + epic + legendary),
 * then `vi = min(level - 1, m_Amount.size() - 1)`. Real data example,
 * GuildBuffs.xml "Game Hunter" (Level 42 guild requirement):
 *   <AType>TotalLevel</AType>
 *   <Amount size="40">1 1 1 1 1 1 1 1 2 2 2 2 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3</Amount>
 *   <Item>Fortitude</Item>
 * — +1 Fortitude at character level 1-8, +2 at 9-12, +3 at 13+.
 *
 * V3's `accumulateGuildBuffs` (buildStats.ts) called
 * `parseEffect(eff, 1, source, 0, 0, ctx)` — hardcoding the `classLevels`
 * parameter (which `effectParser.ts`'s `TotalLevel` case reads as the total
 * character level) to 0, so `Math.max(1, 0) = 1` always selected Amount[0].
 * Every TotalLevel-scaled guild buff was frozen at its level-1 value no
 * matter how high the actual build's level was — confirmed against the real
 * `v2calc` oracle on YingsMonk.DDOBuild (level 34): V2 saveFortitude 84, V3
 * 82, root-caused via a per-effect `AllActiveEffects()` oracle dump to
 * "Game Hunter" contributing +1 in V3 instead of the correct +3.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment, GuildBuff,
} from '../types/ddo'

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

const gameHunter: GuildBuff = {
  Name: 'Game Hunter',
  Level: 1,
  Effect: {
    Type: 'SaveBonus',
    Bonus: 'Guild',
    AType: 'TotalLevel',
    Amount: '1 1 1 1 1 1 1 1 2 2 2 2 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3',
    Item: 'Fortitude',
  },
} as unknown as GuildBuff

describe('Guild Buff AType="TotalLevel" indexes by the character total level (V2 Effect.cpp Amount_TotalLevel parity)', () => {
  it('a level-34 character gets Amount[33] (=3), not Amount[0] (=1)', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 20,
      epicLevels: 10,
      legendaryLevels: 4,
      guildLevel: 200,
      applyGuildBuffs: true,
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      allGuildBuffs: [gameHunter],
    } as BuildStatsInput, build)

    const bonus = stats.resolve('save.Fort').bonuses.find(b => b.source === 'Guild Buff: Game Hunter')
    expect(bonus?.value).toBe(3)
  })

  it('a level-1 character still gets Amount[0] (=1)', () => {
    const build = {
      ...makeEmptyBuild(),
      totalLevel: 1,
      epicLevels: 0,
      legendaryLevels: 0,
      guildLevel: 200,
      applyGuildBuffs: true,
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      allGuildBuffs: [gameHunter],
    } as BuildStatsInput, build)

    const bonus = stats.resolve('save.Fort').bonuses.find(b => b.source === 'Guild Buff: Game Hunter')
    expect(bonus?.value).toBe(1)
  })
})
