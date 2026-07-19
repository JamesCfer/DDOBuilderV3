import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { OptionalBuff } from '../../types/ddo'
import styles from './SelfBuffsPanel.module.css'

export default function SelfBuffsPanel() {
  const { build, dispatch } = useCharacter()
  const [buffs, setBuffs] = useState<OptionalBuff[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.selfbuffs().then(data => {
      setBuffs([...data].sort((a, b) => a.Name.localeCompare(b.Name)))
    })
  }, [])

  const filtered = search.trim()
    ? buffs.filter(b => b.Name.toLowerCase().includes(search.toLowerCase()))
    : buffs

  const activeCount = (build.selfBuffs ?? []).length

  return (
    <div className="panel">
      <div className="panel-header">
        Self &amp; Party Buffs
        {activeCount > 0 && (
          <span className={styles.activeCount}>{activeCount} active</span>
        )}
      </div>
      <div className="panel-body">
        <input
          className={styles.search}
          type="text"
          placeholder="Search buffs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {buffs.length === 0 ? (
          <p className={styles.empty}>Loading buffs...</p>
        ) : filtered.length === 0 ? (
          <p className={styles.empty}>No buffs match "{search}"</p>
        ) : (
          <ul className={styles.list}>
            {filtered.map(buff => {
              const isActive = (build.selfBuffs ?? []).includes(buff.Name)
              return (
                <li
                  key={buff.Name}
                  className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                  onClick={() => dispatch({ type: 'TOGGLE_BUFF', buffName: buff.Name })}
                >
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={isActive}
                    onChange={() => dispatch({ type: 'TOGGLE_BUFF', buffName: buff.Name })}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className={styles.buffInfo}>
                    <span className={`${styles.buffName} ${isActive ? styles.buffNameActive : ''}`}>
                      {buff.Name}
                    </span>
                    {buff.Description && (
                      <span className={styles.buffDesc}>{buff.Description}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
