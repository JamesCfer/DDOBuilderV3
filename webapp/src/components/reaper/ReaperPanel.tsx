import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree } from '../../types/ddo'
import TreeGrid, { type TreeChoices, type TreeSelections } from '../enhancements/TreeGrid'
import { reaperXpRequired } from '../../lib/v2Formulas'
import { computeTreeSpent } from '../../lib/enhancementSpend'
import styles from './ReaperPanel.module.css'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReaperPanel() {
  const { build, dispatch } = useCharacter()

  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reaperSelections, setReaperSelections] = useState<Record<string, TreeSelections>>({})

  const reaperAP = build.reaperAP

  // Load all enhancement trees once and filter to reaper trees
  useEffect(() => {
    setLoading(true)
    api.enhancements()
      .then(data => {
        setAllTrees(data.filter(t => t.IsReaperTree === true))
        setError(null)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // ── Choices via context ───────────────────────────────────────────────────
  const reaperChoices = build.reaperChoices

  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    const prev = reaperChoices[treeName] ?? {}
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(updated)])
    for (const itemName of allKeys) {
      const oldRank = prev[itemName] ?? 0
      const newRank = updated[itemName] ?? 0
      if (oldRank !== newRank) {
        dispatch({ type: 'SET_REAPER_CHOICE', treeName, itemName, rank: newRank })
      }
    }
  }

  function handleReset(treeName: string) {
    const treeChoices = reaperChoices[treeName] ?? {}
    for (const itemName of Object.keys(treeChoices)) {
      dispatch({ type: 'SET_REAPER_CHOICE', treeName, itemName, rank: 0 })
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const totalSpentAllTrees = useMemo(() => {
    return allTrees.reduce((sum, tree) => {
      return sum + computeTreeSpent(tree, reaperChoices[tree.Name] ?? {})
    }, 0)
  }, [allTrees, reaperChoices])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Reaper Enhancements</span>
        <span className={styles.apTotal}>
          {totalSpentAllTrees} / {reaperAP} REP spent
          {totalSpentAllTrees > 0 && (
            <span className={styles.xpRequired}>
              {' '}— Requires {reaperXpRequired(totalSpentAllTrees)}k Reaper XP
            </span>
          )}
        </span>
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        {loading && (
          <div className={styles.statusMsg}>Loading reaper enhancement trees…</div>
        )}

        {error && !loading && (
          <div className={`${styles.statusMsg} ${styles.errorMsg}`}>
            Failed to load reaper enhancements: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* AP budget control */}
            <div className={styles.budgetBar}>
              <label className={styles.budgetLabel} htmlFor="reaper-ap-slider">
                Reaper Enhancement Points available:
                <span className={styles.budgetValue}>{reaperAP}</span>
              </label>
              <input
                id="reaper-ap-slider"
                className={styles.budgetSlider}
                type="range"
                min={0}
                max={1000}
                step={1}
                value={reaperAP}
                onChange={e => dispatch({ type: 'SET_REAPER_AP', ap: Number(e.target.value) })}
              />
              <div className={styles.budgetNote}>
                You have {reaperAP} Reaper Enhancement Points available. Set above to plan your build.
              </div>
              <div className={styles.reaperNote}>
                Reaper points are earned by completing content on Reaper difficulty.
                {totalSpentAllTrees > 0 && (
                  <> {totalSpentAllTrees} RAPs spent require {reaperXpRequired(totalSpentAllTrees)}k Reaper XP.</>
                )}
              </div>
            </div>

            {/* All reaper trees side by side (like Epic Destinies) */}
            {allTrees.length > 0 && (
              <div className={styles.multiTreeScroll}>
                <div className={styles.multiTreeRow}>
                  {allTrees.map(tree => {
                    const treeChoices: TreeChoices = reaperChoices[tree.Name] ?? {}
                    const spent = computeTreeSpent(tree, treeChoices)
                    return (
                      <div key={tree.Name} className={styles.treeColumn}>
                        <div className={styles.treeHeader}>
                          <div className={styles.treeTitle}>
                            {tree.Name}
                            <span className={styles.treeBadge}>Reaper</span>
                          </div>
                          <div className={styles.treeAP}>
                            <span className={styles.apCurrent}>{spent}</span>
                            <span className={styles.apLabel}>&nbsp;REP</span>
                            {spent > 0 && (
                              <button
                                className={styles.resetBtn}
                                onClick={() => handleReset(tree.Name)}
                                title="Reset this reaper tree"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                        <TreeGrid
                          tree={tree}
                          choices={treeChoices}
                          selections={reaperSelections[tree.Name] ?? {}}
                          totalSpentAllTrees={totalSpentAllTrees}
                          totalAP={reaperAP}
                          onChoicesChange={(updated) => handleChoicesChange(tree.Name, updated)}
                          onSelectionsChange={(updated) => setReaperSelections(prev => ({ ...prev, [tree.Name]: updated }))}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
