// Side-by-side build comparison. Compares the active build against any other
// build of the current Character document (V2's simultaneously-active builds
// within a life — U6) or any build from the saved-characters list.
//
// V2 parity: DDOBuilder.h supports multiple active builds for stat comparison.

import { useMemo, useState } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { usePersistence } from '../../hooks/usePersistence'
import { useStaticBundle, type StaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import type { CharacterBuild } from '../../types/ddo'
import styles from './BuildCompare.module.css'

/**
 * Hook that runs `useBuildStats` against an arbitrary CharacterBuild by
 * temporarily swapping the build context provider — except the API doesn't
 * allow that. So we provide a shim that mimics what useBuildStats reads.
 *
 * Implementation note: useBuildStats reads `useCharacter()` directly. To
 * compute stats for a non-active build we instead call a side helper. We
 * approximate by passing the build via React.useMemo and relying on
 * useBuildStats for stat calculation of one column at a time.
 *
 * Practical compromise: render two BuildColumn children, each within its own
 * hook call, with the build supplied via a context override.
 */

const STATS_TO_SHOW: Array<{ label: string; key: string; fmt?: (n: number) => string }> = [
  { label: 'Total Level', key: '_meta.totalLevel' },
  { label: 'HP', key: 'hp' },
  { label: 'AC', key: 'ac' },
  { label: 'BAB', key: 'bab' },
  { label: 'Fortitude', key: 'save.Fort' },
  { label: 'Reflex', key: 'save.Reflex' },
  { label: 'Will', key: 'save.Will' },
  { label: 'PRR', key: 'prr' },
  { label: 'MRR', key: 'mrr' },
  { label: 'Dodge', key: 'dodge', fmt: n => `${n}%` },
  { label: 'Fortification', key: 'fortification', fmt: n => `${n}%` },
  { label: 'Concealment', key: 'concealment', fmt: n => `${n}%` },
  // Offensive
  { label: 'Doublestrike', key: 'melee.doublestrike', fmt: n => `${n}%` },
  { label: 'Doubleshot', key: 'ranged.doubleshot', fmt: n => `${n}%` },
  { label: 'Strikethrough', key: 'strikethrough', fmt: n => `${n}%` },
  { label: 'Melee Power', key: 'melee.power' },
  { label: 'Ranged Power', key: 'ranged.power' },
  // Casting
  { label: 'Spell Points', key: 'spellPoints' },
  { label: 'Universal Spell Power', key: 'spellPower.Universal' },
  { label: 'Universal DC', key: 'dc.All' },
  // Abilities
  { label: 'STR', key: 'ability.Strength' },
  { label: 'DEX', key: 'ability.Dexterity' },
  { label: 'CON', key: 'ability.Constitution' },
  { label: 'INT', key: 'ability.Intelligence' },
  { label: 'WIS', key: 'ability.Wisdom' },
  { label: 'CHA', key: 'ability.Charisma' },
]

function StatColumn({ build, data }: { build: CharacterBuild; data: StaticBundle }) {
  const gearItems = useGearItems(build.gear)
  const statsInput = useMemo(() => ({ ...data, gearItems }), [data, gearItems])
  // useBuildStats accepts a build override so this column computes stats for
  // the supplied saved build instead of the active one.
  const stats = useBuildStats(statsInput, build)
  return (
    <td className={styles.statCol}>
      {STATS_TO_SHOW.map(({ label, key, fmt }) => {
        const v = key === '_meta.totalLevel' ? build.totalLevel : stats.total(key)
        const display = fmt ? fmt(v) : String(v)
        return (
          <div key={label} className={styles.statRow}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue}>{display}</span>
          </div>
        )
      })}
    </td>
  )
}

export default function BuildCompare() {
  const { build } = useCharacter()
  const { doc } = useDocument()
  const { saves } = usePersistence()
  const [otherId, setOtherId] = useState<string | null>(null)

  const bundle = useStaticBundle()
  const data = bundle.loaded ? bundle : null

  // U6 — builds of the current Character document (other lives/builds),
  // grouped per life, listed before the saved-character builds (V2 compares
  // simultaneously-active builds within a life).
  const docGroups = doc.lives
    .map(life => ({
      life,
      builds: life.builds.filter(b => b.id !== build.id),
    }))
    .filter(g => g.builds.length > 0)
  const docBuildIds = new Set(doc.lives.flatMap(l => l.builds.map(b => b.id)))
  const savedBuilds = saves.filter(b => b.id !== build.id && !docBuildIds.has(b.id))
  const other =
    doc.lives.flatMap(l => l.builds).find(b => b.id === otherId) ??
    saves.find(b => b.id === otherId) ??
    null

  return (
    <div className="panel">
      <div className="panel-header">Build Comparison</div>
      <div className="panel-body">
        <div className={styles.controls}>
          <strong>Compare with:</strong>
          <select value={otherId ?? ''} onChange={e => setOtherId(e.target.value || null)}>
            <option value="">— Select build —</option>
            {docGroups.map(g => (
              <optgroup key={g.life.id} label={`This character — ${g.life.name}`}>
                {g.builds.map(b => (
                  <option key={b.id} value={b.id}>{b.name} (L{b.totalLevel + (b.epicLevels ?? 0) + (b.legendaryLevels ?? 0)})</option>
                ))}
              </optgroup>
            ))}
            {savedBuilds.length > 0 && (
              <optgroup label="Saved characters">
                {savedBuilds.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {!data ? (
          <p className={styles.empty}>Loading data…</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th></th>
                <th>Active: {build.name}</th>
                <th>{other ? other.name : '(none)'}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.spacer}></td>
                <StatColumn build={build} data={data} />
                {other ? <StatColumn build={other} data={data} /> : <td className={styles.empty}>No build selected</td>}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
