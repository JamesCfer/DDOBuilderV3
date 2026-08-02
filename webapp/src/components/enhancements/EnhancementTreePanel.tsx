import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { findActiveLife } from '../../lib/multiLife'
import { enhancementAPBudget } from '../../lib/actionPoints'
import { availableEnhancementTrees, isEnhancementTree, isLegacyTreeVisible, isUnlockGatedTree } from '../../lib/treeAvailability'
import type { DDOClass, EnhancementTree, EnhancementTreeItem, Race, Feat } from '../../types/ddo'
import TreeGrid, { type TreeChoices, type TreeSelections } from './TreeGrid'
import DdoIcon from '../DdoIcon'
import styles from './EnhancementTreePanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw || '1'
  if (typeof raw === 'object' && !Array.isArray(raw) && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    if (t != null) return String(t) || '1'
  }
  return '1'
}

function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const maxRanks = typeof item.Ranks === 'number' ? item.Ranks : 1
  const str = normalizeCostPerRank(item.CostPerRank)
  const parts = str.trim().split(/\s+/).map(Number).filter(isFinite)
  const costs = parts.length === 0
    ? Array(maxRanks).fill(1)
    : parts.length === 1
    ? Array(maxRanks).fill(parts[0])
    : Array.from({ length: maxRanks }, (_, i) => parts[i] ?? parts[parts.length - 1])
  return costs.slice(0, rank).reduce((a: number, b: number) => a + b, 0)
}

function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const key = item.InternalName ?? item.Name
    return sum + costUpToRank(item, choices[key] ?? choices[item.Name] ?? 0)
  }, 0)
}

function isUniversalTree(tree: EnhancementTree): boolean {
  return tree.IsUniversalTree === true || (!tree.IsRacialTree && !tree.Requirements)
}

// Re-exported from lib/treeAvailability (V2 DetermineTrees parity) — kept
// here for back-compat with existing importers.
export { isEnhancementTree, isLegacyTreeVisible }

// ---------------------------------------------------------------------------
// Tree picker modal
// ---------------------------------------------------------------------------

interface TreePickerProps {
  allTrees: EnhancementTree[]
  selected: string[]
  /** Trees listed on the assumption that their account unlock is earned. */
  unlockGated: Set<string>
  onToggle: (name: string) => void
  onClose: () => void
}

function TreePicker({ allTrees, selected, unlockGated, onToggle, onClose }: TreePickerProps) {
  const racial: EnhancementTree[] = []
  const classTrees: EnhancementTree[] = []
  const universal: EnhancementTree[] = []

  for (const tree of allTrees) {
    if (tree.IsRacialTree) {
      racial.push(tree)
    } else if (isUniversalTree(tree)) {
      universal.push(tree)
    } else {
      classTrees.push(tree)
    }
  }

  function Section({ label, trees }: { label: string; trees: EnhancementTree[] }) {
    if (trees.length === 0) return null
    return (
      <div className={styles.pickerSection}>
        <div className={styles.pickerSectionLabel}>{label}</div>
        <div className={styles.pickerTreeGrid}>
          {trees.map(tree => {
            // Every tree offered here already passed the requirement-engine
            // availability filter (availableEnhancementTrees) — no per-tree
            // name heuristics needed.
            const on = selected.includes(tree.Name)
            const needsUnlock = unlockGated.has(tree.Name)
            const full = !on && selected.length >= MAX_VISIBLE
            return (
              <button
                key={tree.Name}
                className={[
                  styles.pickerTree,
                  on ? styles.pickerTreeOn : '',
                  full ? styles.pickerTreeDisabled : '',
                ].join(' ')}
                disabled={full && !on}
                onClick={() => onToggle(tree.Name)}
                title={needsUnlock
                  ? `${tree.Name} — unlocked in game by favor or the tree-access feat`
                  : tree.Name}
              >
                <DdoIcon category="EnhancementImages" name={tree.Icon ?? tree.Name} size={32} />
                <span className={styles.pickerTreeText}>
                  <span className={styles.pickerTreeName}>{tree.Name}</span>
                  {needsUnlock && <span className={styles.pickerUnlock}>favor unlock</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerModalHeader}>
          <span>Select Enhancement Trees ({selected.length}/{MAX_VISIBLE})</span>
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pickerBody}>
          <Section label="Racial" trees={racial} />
          <Section label="Class" trees={classTrees} />
          <Section label="Universal" trees={universal} />
          <p className={styles.pickerNote}>
            Trees marked <em>favor unlock</em> are listed for planning; in game
            they need the patron favor (or the tree-access feat) that grants
            them.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancementTreePanel() {
  const { build, dispatch } = useCharacter()
  const { doc } = useDocument()
  const specialFeats = findActiveLife(doc)?.specialFeats ?? []

  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [allFeats, setAllFeats] = useState<Feat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Enhancement state lives in the build (so Analysis can read it)
  const pinned = build.enhancementPinned
  const enhChoices = build.enhancementChoices
  const enhSelections = build.enhancementSelections

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.enhancements(),
      api.classes().catch(() => [] as DDOClass[]),
      api.races().catch(() => [] as Race[]),
      api.feats().catch(() => [] as Feat[]),
    ])
      .then(([trees, classes, races, feats]) => {
        setAllTrees(trees); setAllClasses(classes); setAllRaces(races); setAllFeats(feats); setError(null)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const currentRace = allRaces.find(r => r.Name === build.race)

  // Enhancement trees only (no destiny/reaper)
  const enhTrees = useMemo(() =>
    allTrees.filter(isEnhancementTree),
    [allTrees])

  // Available trees for current build — V2 requirement-engine evaluation
  // (CEnhancementsPane::DetermineTrees parity). Archetype classes reach their
  // base class's trees via BaseClass requirements, universal trees gate on
  // their tree-access feats (incl. Life-level special feats), iconic races
  // see exactly their own racial tree.
  const availableTrees = useMemo<EnhancementTree[]>(
    () => availableEnhancementTrees(enhTrees, build, allClasses, currentRace, pinned, specialFeats),
    [enhTrees, build, allClasses, currentRace, pinned, specialFeats])

  // Of those, the ones listed only because their account unlock is assumed —
  // labelled in the picker so the plan is honest about what it presumes.
  const unlockGatedTrees = useMemo(
    () => new Set(availableTrees
      .filter(t => isUnlockGatedTree(t, build, allClasses, currentRace, specialFeats))
      .map(t => t.Name)),
    [availableTrees, build, allClasses, currentRace, specialFeats])

  // Auto-pin racial tree when build changes.
  useEffect(() => {
    // While the tree catalogue is still loading, availableTrees is empty —
    // pruning against it here WIPED the imported/saved pinned list on every
    // mount (the cause of "enhancement trees not coming across" after a V2
    // import). Only prune once real data is present.
    if (loading || enhTrees.length === 0) return
    let next = pinned.filter(name => availableTrees.some(t => t.Name === name))
    const racial = availableTrees.find(t => t.IsRacialTree)
    if (racial && !next.includes(racial.Name)) {
      next = [racial.Name, ...next].slice(0, MAX_VISIBLE)
    }
    if (next.join(',') !== pinned.join(',')) {
      dispatch({ type: 'SET_ENH_PINNED', pinned: next })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTrees])

  const totalSpent = useMemo(() =>
    enhTrees.reduce((s, t) => s + computeTreeSpent(t, enhChoices[t.Name] ?? {}), 0),
    [enhTrees, enhChoices])

  // V2 Build::AvailableActionPoints(TT_allEnhancement): min(20, level)·4 plus
  // bonus racial/universal APs from past-life / favor feats (Effect_RAPBonus
  // / Effect_UAPBonus). The previous hardcoded 80 mis-reported imported
  // builds with bonus APs as over budget ("102 / 80").
  const apBudget = useMemo(
    () => (allFeats.length > 0 ? enhancementAPBudget(build, allFeats, specialFeats) : Math.min(20, build.totalLevel || 0) * 4),
    [build, allFeats, specialFeats])

  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    dispatch({ type: 'SET_ENH_CHOICES', treeName, choices: updated })
  }

  function handleSelectionsChange(treeName: string, updated: TreeSelections) {
    dispatch({ type: 'SET_ENH_SELECTIONS', treeName, selections: updated })
  }

  function handleReset(treeName: string) {
    dispatch({ type: 'RESET_ENH_TREE', treeName })
  }

  function toggleTree(name: string) {
    if (pinned.includes(name)) {
      dispatch({ type: 'SET_ENH_PINNED', pinned: pinned.filter(n => n !== name) })
    } else if (pinned.length < MAX_VISIBLE) {
      dispatch({ type: 'SET_ENH_PINNED', pinned: [...pinned, name] })
    }
  }

  function removeTree(name: string) {
    dispatch({ type: 'SET_ENH_PINNED', pinned: pinned.filter(n => n !== name) })
  }

  const visibleTrees = pinned
    .map(name => enhTrees.find(t => t.Name === name))
    .filter(Boolean) as EnhancementTree[]

  const hasCharacter = build.race || build.classes.some(c => c.name)

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Enhancements</span>
        <span className={styles.apTotal}>{totalSpent} / {apBudget} AP</span>
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        {loading && <div className={styles.statusMsg}>Loading enhancement trees…</div>}
        {error && !loading && (
          <div className={`${styles.statusMsg} ${styles.errorMsg}`}>
            Failed to load: {error}
          </div>
        )}

        {!loading && !error && !hasCharacter && (
          <div className={styles.statusMsg}>Select a race and class to see enhancement trees.</div>
        )}

        {/* The server answers 200 with an empty list when its data directory
            has no EnhancementTrees folder (loadEnhancementTrees returns []).
            Without this guard that misconfiguration renders as a misleading
            "No trees selected" while the build's pins stay intact. */}
        {!loading && !error && hasCharacter && enhTrees.length === 0 && (
          <div className={`${styles.statusMsg} ${styles.errorMsg}`}>
            The server returned no enhancement trees. Its data directory is
            missing the DataFiles/EnhancementTrees folder — open /api/health to
            see the directory the server resolved, and start the server from
            the webapp/ folder (or set DATA_FILES_PATH to the full path of
            Output/DataFiles). Your build's trained trees are unaffected and
            will appear once the data loads.
          </div>
        )}

        {!loading && !error && hasCharacter && enhTrees.length > 0 && (
          <>
            <div className={styles.toolbar}>
              <button className={styles.addTreeBtn} onClick={() => setPickerOpen(true)}>
                + Add Tree ({pinned.length}/{MAX_VISIBLE})
              </button>
              <span className={styles.toolbarHint}>{apBudget - totalSpent} AP remaining</span>
            </div>

            {visibleTrees.length === 0 ? (
              <div className={styles.statusMsg}>
                No trees selected. Click "Add Tree" to add enhancement trees.
              </div>
            ) : (
              <div className={styles.multiTreeScroll}>
                <div className={styles.multiTreeRow}>
                  {visibleTrees.map(tree => {
                    const treeChoices = enhChoices[tree.Name] ?? {}
                    const treeSelections = enhSelections[tree.Name] ?? {}
                    const spent = computeTreeSpent(tree, treeChoices)
                    return (
                      <div key={tree.Name} className={styles.treeColumn}>
                        <div className={styles.treeHeader}>
                          <DdoIcon
                            category="EnhancementImages"
                            name={tree.Icon ?? tree.Name}
                            size={24}
                            className={styles.treeHeaderIcon}
                          />
                          <span className={styles.treeHeaderName} title={tree.Name}>
                            {tree.Name}
                          </span>
                          <span className={styles.treeHeaderAP}>{spent} AP</span>
                          {spent > 0 && (
                            <button className={styles.resetBtn}
                              onClick={() => handleReset(tree.Name)} title="Reset">↺</button>
                          )}
                          <button className={styles.removeBtn}
                            onClick={() => removeTree(tree.Name)} title="Remove">✕</button>
                        </div>
                        <TreeGrid
                          tree={tree}
                          choices={treeChoices}
                          selections={treeSelections}
                          totalSpentAllTrees={totalSpent}
                          totalAP={apBudget}
                          onChoicesChange={u => handleChoicesChange(tree.Name, u)}
                          onSelectionsChange={u => handleSelectionsChange(tree.Name, u)}
                          build={build}
                          allClasses={allClasses}
                          race={currentRace}
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

      {pickerOpen && (
        <TreePicker
          allTrees={availableTrees}
          selected={pinned}
          unlockGated={unlockGatedTrees}
          onToggle={toggleTree}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
