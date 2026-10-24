// V2 BonusesPane.cpp parity: a grid of watched stats against the bonus types
// gear is usually planned around, so a build's gaps (no Insightful weapon
// damage, no Quality Intelligence, no Profane anything) stand out at a glance.
// The watch list is the life's MonitoredBonuses, shared with the forum export.

import { useMemo, useState } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import { findActiveLife, setMonitoredBonuses } from '../../lib/multiLife'
import {
  BONUSES_PANE_COLUMNS, DEFAULT_BONUS_WATCH_LIST, MONITORED_BONUS_KEYS,
  bonusStatGroup, bonusTypeCell, gearSearchPhrase,
} from '../../lib/bonusesTable'
import { bonusTypeColor } from '../../lib/bonusTypeColors'
import FindGearDialog from '../items/FindGearDialog'
import styles from './BonusesPanel.module.css'

const GROUP_ORDER = [
  'Abilities', 'Saves', 'Other', 'Spell Power', 'Spell Critical Chance', 'DCs',
  'Skills', 'Resistances', 'Absorption',
]

/** Short column labels so all eleven fit; the full name is the tooltip. */
const SHORT_LABEL: Record<string, string> = {
  Enhancement: 'Enhance', Insightful: 'Insight', Equipment: 'Equip',
  Competence: 'Compet', Exceptional: 'Except', Legendary: 'Legend',
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`
}

export default function BonusesPanel() {
  const { build } = useCharacter()
  const { doc, setDoc } = useDocument()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)

  const [gearOnly, setGearOnly] = useState(false)
  const [search, setSearch] = useState<string | null>(null)

  const saved = findActiveLife(doc)?.monitoredBonuses ?? []
  const usingDefaults = saved.length === 0
  const rows = (usingDefaults ? DEFAULT_BONUS_WATCH_LIST : saved)
    .filter(name => MONITORED_BONUS_KEYS[name])

  function saveRows(next: string[]) {
    setDoc(d => setMonitoredBonuses(d, next))
  }

  function addRow(name: string) {
    if (!name || rows.includes(name)) return
    saveRows([...rows, name])
  }

  function removeRow(name: string) {
    saveRows(rows.filter(r => r !== name))
  }

  function moveRow(name: string, delta: number) {
    const i = rows.indexOf(name)
    const j = i + delta
    if (i < 0 || j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    saveRows(next)
  }

  const addOptions = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const name of Object.keys(MONITORED_BONUS_KEYS)) {
      if (name === 'Dodge Cap' || rows.includes(name)) continue
      const g = bonusStatGroup(name)
      groups.set(g, [...(groups.get(g) ?? []), name])
    }
    return GROUP_ORDER.filter(g => groups.has(g)).map(g => ({ group: g, names: groups.get(g)! }))
  }, [rows])

  const grid = rows.map(name => {
    const key = MONITORED_BONUS_KEYS[name]
    const cells = BONUSES_PANE_COLUMNS.map(type => ({ type, ...bonusTypeCell(stats, key, type, gearOnly) }))
    return { name, cells }
  })

  return (
    <div className="panel">
      <div className="panel-header">Bonuses</div>
      <div className="panel-body">
        <div className={styles.toolbar}>
          <select
            className={styles.addSelect}
            value=""
            onChange={e => addRow(e.target.value)}
            aria-label="Add a stat"
          >
            <option value="">Add a stat...</option>
            {addOptions.map(({ group, names }) => (
              <optgroup key={group} label={group}>
                {names.map(n => <option key={n} value={n}>{n}</option>)}
              </optgroup>
            ))}
          </select>
          <label className={styles.toggle}>
            <input type="checkbox" checked={gearOnly} onChange={e => setGearOnly(e.target.checked)} />
            Gear only
          </label>
          {!usingDefaults && (
            <button type="button" className={styles.resetBtn} onClick={() => saveRows([])}>
              Reset rows
            </button>
          )}
        </div>
        <p className={styles.hint}>
          Empty cells are bonus types nothing on the build gives that stat.
          Click one to search for gear that does.
          {gearOnly ? ' Showing item bonuses only, like V2.' : ' Counting every source: gear, sets, feats, enhancements and buffs.'}
        </p>

        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={styles.statHead}>Statistic</th>
                {BONUSES_PANE_COLUMNS.map(type => (
                  <th key={type} className={styles.typeHead} title={type}>
                    <span className={styles.swatch} style={{ background: bonusTypeColor(type) }} />
                    {SHORT_LABEL[type] ?? type}
                  </th>
                ))}
                <th className={styles.actionsHead} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {grid.map(({ name, cells }, rowIndex) => (
                <tr key={name}>
                  <th scope="row" className={styles.statName}>{name}</th>
                  {cells.map(cell => cell.value !== 0 ? (
                    <td
                      key={cell.type}
                      className={styles.have}
                      title={cell.sources.map(s => `${s.source}: ${signed(s.value)}`).join('\n')}
                    >
                      {signed(cell.value)}
                    </td>
                  ) : (
                    <td key={cell.type} className={styles.gapCell}>
                      <button
                        type="button"
                        className={styles.gap}
                        title={`No ${cell.type} ${name}. Click to find gear with it.`}
                        aria-label={`Find gear with ${cell.type} ${name}`}
                        onClick={() => setSearch(gearSearchPhrase(name, cell.type))}
                      >
                        <span className={styles.gapMark} aria-hidden="true" />
                      </button>
                    </td>
                  ))}
                  <td className={styles.actions}>
                    <button type="button" title="Move up" aria-label={`Move ${name} up`}
                      disabled={rowIndex === 0} onClick={() => moveRow(name, -1)}>▲</button>
                    <button type="button" title="Move down" aria-label={`Move ${name} down`}
                      disabled={rowIndex === grid.length - 1} onClick={() => moveRow(name, 1)}>▼</button>
                    <button type="button" title="Remove" aria-label={`Remove ${name}`}
                      onClick={() => removeRow(name)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {search !== null && (
        <FindGearDialog key={search} initialBuffSearch={search} onClose={() => setSearch(null)} />
      )}
    </div>
  )
}
