// Overview › Progression: where the points went. Enhancement AP per tree
// against the budget, the chosen destinies and their spend, reaper points
// and the past-life tally. Each has its own tab for the actual training.

import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useCharacter } from '../../context/CharacterContext'
import DdoIcon from '../DdoIcon'
import { computeTreeSpent } from '../../lib/enhancementSpend'
import { enhancementAPBudget } from '../../lib/actionPoints'
import { destinyPoolForBuild } from '../../lib/destiny'
import type { EnhancementTree } from '../../types/ddo'
import styles from './Overview.module.css'

function Bar({ tree, spent, max }: { tree: EnhancementTree | undefined; name?: string; spent: number; max: number }) {
  const label = tree?.Name ?? ''
  const pct = max > 0 ? Math.min(100, (spent / max) * 100) : 0
  return (
    <div className={styles.barRow}>
      <span className={styles.iconBox} style={{ width: 22, height: 22 }}>
        {tree && <DdoIcon category="EnhancementImages" name={tree.Icon ?? tree.Name} size={18} />}
      </span>
      <span className={styles.barName} title={label}>{label}</span>
      <div className={styles.barTrack} title={`${label}: ${spent} points`}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.barValue}>{spent}</span>
    </div>
  )
}

export default function ProgressionTile() {
  const { build } = useCharacter()
  const { allTrees, allFeats } = useStaticBundle()
  const treeByName = new Map(allTrees.map(t => [t.Name, t]))

  // Enhancements: every tree with points in it, biggest first.
  const enh = Object.entries(build.enhancementChoices ?? {})
    .map(([name, choices]) => ({ tree: treeByName.get(name), name, spent: treeByName.get(name) ? computeTreeSpent(treeByName.get(name)!, choices) : 0 }))
    .filter(e => e.spent > 0)
    .sort((a, b) => b.spent - a.spent)
  const enhSpent = enh.reduce((s, e) => s + e.spent, 0)
  const enhBudget = allFeats.length > 0 ? enhancementAPBudget(build, allFeats) : Math.min(20, build.totalLevel || 0) * 4

  // Destinies: the selected trees, the active one first.
  const destinies = (build.selectedDestinyTrees ?? []).filter(Boolean)
    .map(name => ({ tree: treeByName.get(name), name, spent: treeByName.get(name) ? computeTreeSpent(treeByName.get(name)!, build.destinyChoices?.[name] ?? {}) : 0 }))
    .sort((a, b) => (a.name === build.activeEpicDestiny ? -1 : b.name === build.activeEpicDestiny ? 1 : 0))
  const destinySpent = destinies.reduce((s, d) => s + d.spent, 0)
  const destinyPool = destinyPoolForBuild(build)

  // Reaper.
  const reaperSpent = Object.entries(build.reaperChoices ?? {})
    .reduce((s, [name, choices]) => s + (treeByName.get(name) ? computeTreeSpent(treeByName.get(name)!, choices) : 0), 0)

  // Past lives.
  const pastLives = Object.values(build.pastLives ?? {}).reduce((s, n) => s + (n || 0), 0)
  const twists = (build.twistChoices ?? []).filter(Boolean).length

  return (
    <div className="panel">
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.section}>
          <span>Enhancements</span>
          <span className={styles.sectionNote}>{enhSpent} / {enhBudget} AP</span>
        </div>
        {enh.length === 0
          ? <span className={styles.empty}>No action points spent</span>
          : <div className={styles.rows}>{enh.map(e => <Bar key={e.name} tree={e.tree} spent={e.spent} max={enhBudget} />)}</div>}

        <div className={styles.section}>
          <span>Epic destinies</span>
          <span className={styles.sectionNote}>{destinySpent} / {destinyPool} DP</span>
        </div>
        {destinies.length === 0
          ? <span className={styles.empty}>No destiny trees selected</span>
          : (
            <div className={styles.rows}>
              {destinies.map(d => <Bar key={d.name} tree={d.tree} spent={d.spent} max={destinyPool} />)}
            </div>
          )}

        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Active destiny</span>
            <span className={build.activeEpicDestiny ? styles.rowValue : styles.rowMuted}>{build.activeEpicDestiny || 'none'}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Twists of Fate</span>
            <span className={styles.rowValue}>{twists}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Reaper points</span>
            <span className={styles.rowValue}>{build.reaperAP ? `${reaperSpent} / ${build.reaperAP}` : `${reaperSpent} spent`}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Past lives</span>
            <span className={styles.rowValue}>{pastLives}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
