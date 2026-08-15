import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { AttackRate } from '../../server/dataLoaders'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats, extractOffhandWeaponInfo } from '../../hooks/useBuildStats'
import { critProfile } from '../../lib/combat/critProfile'
import { buildAttackEntry } from '../../lib/combat/attackEntry'
import {
  collectAvailableAttacks, estimateChainDamage,
  chainWithAttackAdded, chainWithAttackRemoved, chainWithAttackMoved,
  type AvailableAttack, type SwingBaseline,
} from '../../lib/combat/attackChain'
import { lookupAttacksPerMinute, pickCombatStyleName } from '../../lib/combat/attackRate'
import { deriveWeaponClasses, type WeaponGroupSpec } from '../../lib/weapons/groups'
import styles from './CombatPanel.module.css'

function pickTwfTier(featChoices: Record<string, string>): 0 | 1 | 2 | 3 | 4 {
  const f = new Set(Object.values(featChoices).filter(Boolean))
  if (f.has('Perfect Two Weapon Fighting')) return 4
  if (f.has('Greater Two Weapon Fighting')) return 3
  if (f.has('Improved Two Weapon Fighting')) return 2
  if (f.has('Two Weapon Fighting')) return 1
  return 0
}

const DEFAULT_FOE_AC = 80
const DEFAULT_FOE_PRR = 50
const DEFAULT_FOE_FORT = 50

export default function CombatPanel() {
  const { build } = useCharacter()

  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const { allFeats, allTrees, allWeaponGroups } = bundle
  const [allAttackRates, setAllAttackRates] = useState<AttackRate[]>([])

  const [foeAC, setFoeAC] = useState(DEFAULT_FOE_AC)
  const [foePRR, setFoePRR] = useState(DEFAULT_FOE_PRR)
  const [foeFort, setFoeFort] = useState(DEFAULT_FOE_FORT)
  const [helpless, setHelpless] = useState(false)

  useEffect(() => {
    api.attackRates().then(setAllAttackRates).catch(() => setAllAttackRates([]))
  }, [])

  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)

  const result = useMemo(() => {
    if (!stats.weapon) return null
    // V2 BreakdownItemWeaponAttackBonus.cpp:327+ (LargestStatBonus): the
    // attack ability is the LARGEST of the weapon's default ability and any
    // Weapon_AttackAbility / WeaponAttackAbilityClass candidates active for
    // the wielded weapon (e.g. Pact weapons CHA-to-hit), surfaced by
    // effectParser as melee.attackAbility.<Ability> markers.
    const defaultAb = stats.weapon.attackModifier as string
    const abilityCandidates = new Set<string>([defaultAb])
    for (const key of stats.keys()) {
      const m = /^melee\.(attackAbility|damageAbility)\.(.+)$/.exec(key)
      if (m && stats.total(key) !== 0) abilityCandidates.add(m[2])
    }
    let ab = defaultAb
    for (const cand of abilityCandidates) {
      if (stats.total(`ability.${cand}`) > stats.total(`ability.${ab}`)) ab = cand
    }
    const abilityScore = stats.total(`ability.${ab}`)
    const bab = Math.min(25, stats.total('bab'))
    const twfTier = pickTwfTier(build.featChoices)
    const twoHanded = stats.weapon.diceNum >= 2
    const isUnarmed = stats.weapon.weaponType === 'Handwraps' ||
      stats.weapon.name.toLowerCase().includes('handwrap')
    const style = pickCombatStyleName({
      twfTier,
      twoHanded,
      hasOffhand: !!(build.gear['Off Hand'] ?? build.gear['Weapon2']),
      isUnarmed,
    })
    const apm = lookupAttacksPerMinute(allAttackRates, style, bab)
    // attacksPerRound = APM / 10 (6-second round, 10 rounds per minute)
    const attacksPerRound = apm > 0 ? apm / 10 : undefined
    // Off-hand weapon (two-weapon fighting). Light off-hand and Oversized TWF
    // each reduce the V2 TWF attack penalty by 2.
    const offhand = extractOffhandWeaponInfo(gearItems)
    const offhandIsLight = offhand?.weaponType
      ? deriveWeaponClasses(offhand.weaponType, allWeaponGroups).has('Light')
      : false
    const oversizedTwf = new Set(Object.values(build.featChoices).filter(Boolean))
      .has('Oversized Two Weapon Fighting')
    // V2 BreakdownItemWeaponAttackBonus.cpp:70-79: −4 to-hit if the character is
    // not proficient with the main-hand weapon (Build::IsWeaponInGroup("Proficiency")).
    const nonProficient = stats.weapon.weaponType
      ? !stats.isWeaponProficient(stats.weapon.weaponType)
      : false
    const entry = buildAttackEntry(stats, stats.weapon, abilityScore, bab, {
      foeAC, foePRR, foeFortification: foeFort,
      helpless,
      twoWeaponFightingTier: twfTier,
      twoHanded,
      attacksPerRound,
      offhand,
      offhandIsLight,
      oversizedTwf,
      nonProficient,
    })
    return { ...entry, apm }
  }, [stats, foeAC, foePRR, foeFort, helpless, build.featChoices, build.gear, gearItems, allAttackRates, allWeaponGroups])

  // Attacks granted by trained feats / enhancements (V2 DPSPane available list).
  const availableAttacks = useMemo(() => collectAvailableAttacks({
    allFeats, allTrees,
    trainedFeatNames: Object.values(build.featChoices),
    enhancementChoices: build.enhancementChoices,
    enhancementSelections: build.enhancementSelections,
  }), [allFeats, allTrees, build.featChoices, build.enhancementChoices, build.enhancementSelections])

  // Per-swing baseline feeding the chain estimator (V3 extension; V2's
  // per-style evaluators are stubs — see lib/combat/attackChain.ts).
  const chainBaseline = useMemo<SwingBaseline | null>(() => {
    if (!result || !stats.weapon) return null
    return {
      hitChance: result.hitChance,
      hitDamage: result.hitDamage,
      critDamage: result.critDamage,
      weaponDieAvg: stats.weapon.diceNum * (stats.weapon.diceSides + 1) / 2,
      threatFaces: critProfile(k => stats.total(k), stats.weapon).threatFaces,
      critMultiplier: critProfile(k => stats.total(k), stats.weapon).multiplier,
    }
  }, [result, stats])

  return (
    <div className="panel">
      <div className="panel-header">Combat</div>
      <div className="panel-body">
        {!stats.weapon ? (
          <p className={styles.empty}>Equip a weapon to see combat stats.</p>
        ) : (
          <>
            <div className={styles.weaponHead}>
              <strong>{stats.weapon.name}</strong>
              <span className={styles.subtle}>
                {stats.weapon.diceNum}d{stats.weapon.diceSides} crit{' '}
                {critProfile(k => stats.total(k), stats.weapon).threatDisplay} ×
                {critProfile(k => stats.total(k), stats.weapon).multiplier}
              </span>
            </div>

            <div className={styles.controls}>
              <label>
                Foe AC <input type="number" value={foeAC} onChange={e => setFoeAC(Number(e.target.value))} />
              </label>
              <label>
                Foe PRR <input type="number" value={foePRR} onChange={e => setFoePRR(Number(e.target.value))} />
              </label>
              <label>
                Foe Fort % <input type="number" value={foeFort} onChange={e => setFoeFort(Number(e.target.value))} />
              </label>
              <label>
                <input type="checkbox" checked={helpless} onChange={e => setHelpless(e.target.checked)} /> Helpless
              </label>
            </div>

            {result && (
              <table className={styles.statsTable}>
                <tbody>
                  <tr><th>Hit chance</th><td>{(result.hitChance * 100).toFixed(1)}%</td></tr>
                  <tr><th>Crit chance</th><td>{(result.critChance * 100).toFixed(1)}%</td></tr>
                  <tr><th>Hit damage</th><td>{result.hitDamage.toFixed(1)}</td></tr>
                  <tr><th>Crit damage</th><td>{result.critDamage.toFixed(1)}</td></tr>
                  <tr><th>Main DPR</th><td>{result.mainDPR.toFixed(1)}</td></tr>
                  <tr><th>Off-hand DPR</th><td>{result.offhandDPR.toFixed(1)}</td></tr>
                  <tr><th>Total DPR</th><td>{result.totalDPR.toFixed(1)}</td></tr>
                  <tr><th>Estimated DPS</th><td>{result.dps.toFixed(1)}</td></tr>
                </tbody>
              </table>
            )}

            <AttackChainsEditor
              available={availableAttacks}
              baseline={chainBaseline}
              attacksPerMinute={result?.apm && result.apm > 0 ? result.apm : 100}
            />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Attack-chain editor + per-swing rotation DPS (V2 DPSPane).
 *
 * Mirrors the V2 pane layout (DPSPane.cpp:117-188): chain selector with
 * new/delete, the chain's attack list (name / DPS score / time point /
 * cooldown columns + "Total Attack Chain Duration" row, DPSPane.cpp:577-634)
 * and the available-attack list with add/remove/move controls.
 */
function AttackChainsEditor({ available, baseline, attacksPerMinute }: {
  available: AvailableAttack[]
  baseline: SwingBaseline | null
  attacksPerMinute: number
}) {
  const { build, dispatch } = useCharacter()
  const [newName, setNewName] = useState('')
  const [selectedRow, setSelectedRow] = useState(-1)
  const chainNames = Object.keys(build.attackChains)
  const activeName = build.activeAttackChain && build.attackChains[build.activeAttackChain]
    ? build.activeAttackChain
    : chainNames[0] ?? ''
  const attacks = build.attackChains[activeName] ?? []

  const chainResult = useMemo(() => {
    if (!baseline) return null
    return estimateChainDamage(attacks, available, baseline, { attacksPerMinute })
  }, [attacks, available, baseline, attacksPerMinute])

  const setAttacks = (next: string[]) =>
    dispatch({ type: 'SET_ATTACK_CHAIN', chainName: activeName, attacks: next })

  const createChain = () => {
    const name = newName.trim()
    if (!name || build.attackChains[name]) return
    // V2 seeds new chains with one "Basic Attack" entry (DPSPane.cpp:503-506)
    // and makes the new chain active (Build.cpp:6562-6566).
    dispatch({ type: 'SET_ATTACK_CHAIN', chainName: name, attacks: ['Basic Attack'] })
    dispatch({ type: 'SET_ACTIVE_ATTACK_CHAIN', chainName: name })
    setNewName('')
  }

  const renameChain = (next: string) => {
    const name = next.trim()
    if (!name || name === activeName || build.attackChains[name]) return
    dispatch({ type: 'SET_ATTACK_CHAIN', chainName: name, attacks })
    dispatch({ type: 'DELETE_ATTACK_CHAIN', chainName: activeName })
    dispatch({ type: 'SET_ACTIVE_ATTACK_CHAIN', chainName: name })
  }

  return (
    <details className={styles.chainsBlock}>
      <summary>Attack Chains ({chainNames.length})</summary>
      <div className={styles.chainsList}>
        <div className={styles.chainRow}>
          <select
            value={activeName}
            onChange={e => dispatch({ type: 'SET_ACTIVE_ATTACK_CHAIN', chainName: e.target.value })}
            disabled={chainNames.length === 0}
          >
            {chainNames.length === 0 && <option value="">(no chains)</option>}
            {chainNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            disabled={!activeName}
            title="Delete the active Attack Chain"
            onClick={() => dispatch({ type: 'DELETE_ATTACK_CHAIN', chainName: activeName })}
          >
            ×
          </button>
          <input
            placeholder="New chain name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createChain() }}
          />
          <button onClick={createChain} disabled={!newName.trim()}>Add</button>
        </div>

        {activeName && (
          <div className={styles.chainRow}>
            <span className={styles.subtle}>Rename</span>
            <input
              type="text"
              key={activeName}
              defaultValue={activeName}
              onBlur={e => renameChain(e.target.value)}
            />
          </div>
        )}

        {activeName && (
          <table className={styles.chainTable}>
            <thead>
              <tr><th>Attack Name</th><th>DPS Score</th><th>Time Point</th><th>Cooldown</th><th /></tr>
            </thead>
            <tbody>
              {chainResult?.entries.map((e, i) => (
                <tr
                  key={`${e.name}-${i}`}
                  className={i === selectedRow ? styles.selectedRow : undefined}
                  onClick={() => setSelectedRow(i === selectedRow ? -1 : i)}
                >
                  <td className={styles.nameCell}>{e.name}</td>
                  <td>{Math.floor(e.dpsScore)}</td>
                  <td>{e.timePoint.toFixed(2)}</td>
                  <td>{e.cooldown !== undefined ? e.cooldown.toFixed(2) : ''}</td>
                  <td className={styles.rowButtons}>
                    <button title="Move up" disabled={i === 0}
                      onClick={ev => { ev.stopPropagation(); setAttacks(chainWithAttackMoved(attacks, i, -1)); setSelectedRow(i - 1) }}>↑</button>
                    <button title="Move down" disabled={i === attacks.length - 1}
                      onClick={ev => { ev.stopPropagation(); setAttacks(chainWithAttackMoved(attacks, i, 1)); setSelectedRow(i + 1) }}>↓</button>
                    <button title="Remove from chain"
                      onClick={ev => { ev.stopPropagation(); setAttacks(chainWithAttackRemoved(attacks, i)); setSelectedRow(-1) }}>×</button>
                  </td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td className={styles.nameCell}>Total Attack Chain Duration</td>
                <td>{chainResult ? Math.floor(chainResult.totalDPS) : ''}</td>
                <td />
                <td>{chainResult ? chainResult.totalDuration.toFixed(2) : ''}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}

        {activeName && (
          <div>
            <div className={styles.subtle}>Available Attacks</div>
            {available.length === 0 && <p className={styles.empty}>No attacks available — train feats or enhancements that grant attacks.</p>}
            <ul className={styles.availableList}>
              {available.map(a => (
                <li key={a.def.name}>
                  <button
                    title={`Add "${a.def.name}" to the Attack Chain, under the selected item`}
                    onClick={() => {
                      // V2 inserts under the selection, or at the end when
                      // nothing is selected (DPSPane.cpp:873-893).
                      const loc = selectedRow >= 0 ? selectedRow + 1 : attacks.length
                      setAttacks(chainWithAttackAdded(attacks, a.def.name, loc))
                    }}
                  >
                    +
                  </button>
                  <span title={a.def.description}>{a.def.name}</span>
                  <span className={styles.subtle}>
                    {a.def.cooldown ? ` cd ${a.def.cooldown[Math.min(a.stacks, a.def.cooldown.length) - 1]}s` : ''}
                    {a.stacks > 1 ? ` ×${a.stacks}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}
