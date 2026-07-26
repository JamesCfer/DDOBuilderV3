/**
 * Parity pass 124 — straggler root causes (round-2 agent diagnosis):
 *
 * B. Character level must come from the Build's explicit <Level> field —
 *    V2 Build::Level() (Build.h:378) is independent of per-level Class
 *    assignment; heroic LevelTraining rows with a blank/"Unknown" <Class>
 *    (TR/respec artifacts) still count toward it. V3 derived totalLevel by
 *    counting classed rows, so raydc (<Level>34</Level>, all 20 heroic rows
 *    classless) computed char level 14 and dropped 5 of its 8 STR level-ups.
 *
 * C. "Centered" requires being unarmed or wielding a monk weapon —
 *    WeaponGroupings.xml "Centered" group. V3 centered every cloth-armor
 *    monk regardless of weapon (speed leveling: Heavy Crossbow monk got
 *    Flurry of Blows' +4 dodge).
 *
 * (A — GrantFeat display-only correction — is pinned in parityPass59.test.ts.)
 */

import { describe, it, expect } from 'vitest'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment, WeaponGroupSpec,
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

// ---------------------------------------------------------------------------
// B — explicit <Level> field wins over classed-row counting
// ---------------------------------------------------------------------------

function levelTrainingRows(): string {
  // 20 heroic rows with NO Class element, then 10 Epic + 4 Legendary.
  const heroic = Array.from({ length: 20 }, () => '<LevelTraining></LevelTraining>').join('')
  const epic = Array.from({ length: 10 }, () => '<LevelTraining><Class>Epic</Class></LevelTraining>').join('')
  const leg = Array.from({ length: 4 }, () => '<LevelTraining><Class>Legendary</Class></LevelTraining>').join('')
  return heroic + epic + leg
}

const raydcStyleXml = `<?xml version="1.0"?>
<DDOBuilderCharacterData>
  <Character>
    <Name>Blank Classes</Name>
    <Life>
      <Name>Life 1</Name>
      <Build>
        <Level>34</Level>
        <Level4>Strength</Level4><Level8>Strength</Level8>
        <Level12>Strength</Level12><Level16>Strength</Level16>
        <Level20>Strength</Level20><Level24>Strength</Level24>
        <Level28>Strength</Level28><Level32>Strength</Level32>
        ${levelTrainingRows()}
      </Build>
    </Life>
  </Character>
</DDOBuilderCharacterData>`

describe('B — character level from the explicit <Level> field (V2 Build::Level)', () => {
  it('all-blank heroic classes with <Level>34</Level> still yield heroic 20 and all 8 level-ups', () => {
    const { build } = importV2Build(raydcStyleXml)
    expect(build.totalLevel).toBe(20)
    expect(build.epicLevels).toBe(10)
    expect(build.legendaryLevels).toBe(4)
    const strUps = Object.values(build.abilityLevelUps).filter(v => v === 'Strength').length
    expect(strUps).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// C — Centered gated on wielded weapon
// ---------------------------------------------------------------------------

const monk: DDOClass = { Name: 'Monk', HitPoints: 8 } as unknown as DDOClass

// Flurry-style feat: dodge gated on the Centered stance.
const flurryFeat: Feat = {
  Name: 'Test Flurry of Blows',
  Acquire: 'Automatic',
  Effect: {
    Type: 'DodgeBonus', Bonus: 'Feat', AType: 'Simple', Amount: 4,
    Requirements: { Requirement: { Type: 'Stance', Item: 'Centered' } },
  },
} as unknown as Feat

const monkWithFlurry: DDOClass = {
  Name: 'Monk', HitPoints: 8,
  AutomaticFeats: [{ Level: 1, Feats: 'Test Flurry of Blows' }],
} as unknown as DDOClass

const centeredGroup: WeaponGroupSpec = {
  Name: 'Centered',
  Weapon: ['Empty', 'Kama', 'Shuriken', 'Handwraps', 'Quarterstaff', 'Unarmed'],
} as unknown as WeaponGroupSpec

const heavyCrossbow: Item = { Name: 'Test Crossbow', Weapon: 'Heavy Crossbow' } as unknown as Item
const handwraps: Item = { Name: 'Test Wraps', Weapon: 'Handwraps' } as unknown as Item

function monkBuild() {
  return {
    ...makeEmptyBuild(),
    totalLevel: 20,
    classes: [{ name: 'Monk', levels: 20 }],
    levelClasses: Array.from({ length: 20 }, () => 'Monk'),
  }
}

describe('C — Centered requires unarmed or a monk weapon (WeaponGroupings "Centered" group)', () => {
  it('cloth monk with a Heavy Crossbow is NOT centered', () => {
    const stats = computeBuildStats({
      ...emptyInput(),
      allClasses: [monkWithFlurry], allFeats: [flurryFeat],
      allWeaponGroups: [centeredGroup],
      gearItems: { 'Main Hand': heavyCrossbow },
    } as BuildStatsInput, monkBuild())
    expect(stats.resolve('dodge').bonuses.some(b => b.source.includes('Test Flurry'))).toBe(false)
  })

  it('cloth monk with handwraps IS centered', () => {
    const stats = computeBuildStats({
      ...emptyInput(),
      allClasses: [monkWithFlurry], allFeats: [flurryFeat],
      allWeaponGroups: [centeredGroup],
      gearItems: { 'Main Hand': handwraps },
    } as BuildStatsInput, monkBuild())
    expect(stats.resolve('dodge').bonuses.some(b => b.source.includes('Test Flurry'))).toBe(true)
  })

  it('unarmed cloth monk IS centered', () => {
    const stats = computeBuildStats({
      ...emptyInput(),
      allClasses: [monkWithFlurry], allFeats: [flurryFeat],
      allWeaponGroups: [centeredGroup],
    } as BuildStatsInput, monkBuild())
    expect(stats.resolve('dodge').bonuses.some(b => b.source.includes('Test Flurry'))).toBe(true)
  })
})

// keep monk referenced (single-class fixture used implicitly above)
void monk
