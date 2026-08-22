// V2 parity: per-character-level training summary panel.
// V2 LevelTrainingPane shows class, trained feats, and skill spend grouped by
// character level. V3 previously had only a flat Feats list and a separate
// Skills panel; this panel unifies them into the same per-level view.

import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Feat, Race } from '../../types/ddo'
import { getLevelTrainingEntries } from '../../lib/levelTraining'
import type { LevelTrainingEntry } from '../../lib/levelTraining'
import { SKILLS } from '../../lib/gamedata'
import styles from './LevelTrainingPanel.module.css'

// ---------------------------------------------------------------------------
// Level card component
// ---------------------------------------------------------------------------

interface LevelCardProps {
  entry: LevelTrainingEntry
  allFeats: Feat[]
  collapsed: boolean
  onToggle: () => void
}

function LevelCard({ entry, allFeats, collapsed, onToggle }: LevelCardProps) {
  const {
    charLevel, className, featSlotKeys, featChoices,
    skillPointsAvailable, skillPointsSpent, skillRanks, automaticFeats,
  } = entry
  const hasFeats = featSlotKeys.some(k => featChoices[k])
  const hasSkills = Object.keys(skillRanks).length > 0
  const hasAutomatic = automaticFeats.length > 0
  const spOver = skillPointsSpent > skillPointsAvailable

  return (
    <div className={styles.card}>
      <button className={styles.cardHeader} onClick={onToggle}>
        <span className={styles.levelBadge}>L{charLevel}</span>
        <span className={styles.className}>{className || '—'}</span>
        {!collapsed && (
          <span className={styles.spBudget} title="Skill points spent / available">
            SP {skillPointsSpent}/{skillPointsAvailable}
            {spOver && <span className={styles.spOver}> !</span>}
          </span>
        )}
        <span className={styles.chevron}>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className={styles.cardBody}>
          {/* Feat slots */}
          {featSlotKeys.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionLabel}>Feats</div>
              {featSlotKeys.map(key => {
                const chosen = featChoices[key]
                const feat = chosen ? allFeats.find(f => f.Name === chosen) : undefined
                // derive a human-readable slot label from the key
                // e.g. "heroic-1" → "Standard", "Fighter-2-Fighter Bonus Feat-0" → "Fighter Bonus Feat"
                const label = (() => {
                  if (key.startsWith('heroic-')) return 'Standard'
                  if (key.startsWith('race-')) {
                    const parts = key.split('-')
                    // race-Level-FeatType-idx  (FeatType may contain spaces, but was serialised without dashes)
                    return parts.slice(2, parts.length - 1).join('-') || 'Racial'
                  }
                  if (key.startsWith('epic-') || key.startsWith('legendary-')) {
                    const parts = key.split('-')
                    return parts.slice(2, parts.length - 1).join(' ') || 'Epic'
                  }
                  // ClassName-classLevel-FeatType-idx
                  const parts = key.split('-')
                  if (parts.length >= 4) {
                    return parts.slice(2, parts.length - 1).join(' ')
                  }
                  return key
                })()
                return (
                  <div key={key} className={styles.slotRow}>
                    <span className={styles.slotType} title={key}>{label}</span>
                    {chosen ? (
                      <span className={styles.featName} title={feat?.Description ?? chosen}>{chosen}</span>
                    ) : (
                      <span className={styles.emptySlot}>— empty —</span>
                    )}
                  </div>
                )
              })}
            </section>
          )}

          {/* Skills */}
          {hasSkills && (
            <section className={styles.section}>
              <div className={styles.sectionLabel}>
                Skills
                <span className={`${styles.spBudgetInline} ${spOver ? styles.spOver : ''}`}>
                  {skillPointsSpent}/{skillPointsAvailable} SP
                </span>
              </div>
              {SKILLS
                .filter(s => (skillRanks[s.name] ?? 0) > 0)
                .map(s => (
                  <div key={s.name} className={styles.slotRow}>
                    <span className={styles.slotType}>{s.name}</span>
                    <span className={styles.rankValue}>+{skillRanks[s.name]}</span>
                  </div>
                ))
              }
            </section>
          )}

          {/* Automatic feats granted at this level (V2 CAutomaticFeatsPane) */}
          {hasAutomatic && (
            <section className={styles.section}>
              <div className={styles.sectionLabel}>Automatic feats</div>
              {automaticFeats.map(name => {
                const feat = allFeats.find(f => f.Name === name)
                return (
                  <div key={name} className={styles.slotRow}>
                    <span className={styles.slotType}>Granted</span>
                    <span className={styles.featName} title={feat?.Description ?? name}>{name}</span>
                  </div>
                )
              })}
            </section>
          )}

          {!hasFeats && !hasSkills && !hasAutomatic && (
            <div className={styles.emptyCard}>Nothing trained at this level.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function LevelTrainingPanel() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [allFeats, setAllFeats] = useState<Feat[]>([])
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces).catch(() => setAllRaces([]))
    api.feats().then(setAllFeats)
  }, [])

  const entries: LevelTrainingEntry[] = useMemo(
    () => getLevelTrainingEntries(build, allClasses, allRaces),
    [build, allClasses, allRaces],
  )

  const hasSelection = build.race || build.classes.some(c => c.name && c.levels > 0)

  function toggleAll(toCollapsed: boolean) {
    const next: Record<number, boolean> = {}
    for (const e of entries) next[e.charLevel] = toCollapsed
    setCollapsed(next)
  }

  return (
    <div className="panel">
      <div className="panel-header">Level Training</div>
      <div className="panel-body">
        {!hasSelection ? (
          <p className={styles.empty}>Select a race and classes to see level training.</p>
        ) : (
          <>
            <div className={styles.toolbar}>
              <button className={styles.toolbarBtn} onClick={() => toggleAll(false)}>Expand all</button>
              <button className={styles.toolbarBtn} onClick={() => toggleAll(true)}>Collapse all</button>
              <span className={styles.toolbarNote}>Heroic levels 1–{Math.min(20, build.totalLevel)}</span>
            </div>
            <div className={styles.levels}>
              {entries.map(entry => (
                <LevelCard
                  key={entry.charLevel}
                  entry={entry}
                  allFeats={allFeats}
                  collapsed={collapsed[entry.charLevel] ?? false}
                  onToggle={() => setCollapsed(prev => ({ ...prev, [entry.charLevel]: !(prev[entry.charLevel] ?? false) }))}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
