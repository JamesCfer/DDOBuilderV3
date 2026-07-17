import { useEffect, useMemo } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices } from '../enhancements/TreeGrid'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import { tier5LockedTree, availableDestinyTrees, destinyPoolForBuild } from '../../lib/destiny'
import styles from './EpicDestiniesPanel.module.css'

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

function parseCosts(costPerRank: unknown, maxRanks: number): number[] {
  const str = normalizeCostPerRank(costPerRank)
  const parts = str.trim().split(/\s+/).map(Number).filter(isFinite)
  if (parts.length === 0) return Array(maxRanks).fill(1)
  if (parts.length === 1) return Array(maxRanks).fill(parts[0])
  return Array.from({ length: maxRanks }, (_, i) => parts[i] ?? parts[parts.length - 1])
}

function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs.slice(0, rank).reduce((a, b) => a + b, 0)
}

function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const key = item.InternalName ?? item.Name
    return sum + costUpToRank(item, choices[key] ?? choices[item.Name] ?? 0)
  }, 0)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EpicDestiniesPanel() {
  const { build, dispatch } = useCharacter()

  // Static data + full build stats. Stats give us the aggregated fate-point and
  // destiny-AP-bonus effect totals (FatePoint / DestinyAPBonus), exactly the
  // sources V2's BreakdownItemDestinyAps feeds into the destiny point pool.
  const bundle = useStaticBundle()
  const loading = !bundle.loaded

  // Epic destiny trees, derived from the shared bundle.
  const allTrees = useMemo(
    () => bundle.allTrees.filter((t: EnhancementTree) => t.IsEpicDestiny === true),
    [bundle.allTrees],
  )

  // Resolve equipped gear so gear-granted fate points/destiny APs are counted.
  const gearItems = useGearItems(build.gear)

  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)

  // ── Build state accessors ─────────────────────────────────────────────────

  const selectedDestinyTrees: [string, string, string] = build.selectedDestinyTrees ?? ['', '', '']
  const destinyChoices = build.destinyChoices

  // ── Derived state ─────────────────────────────────────────────────────────

  // V2: a destiny tree is available once the character meets its <Requirements>
  // (its same-named "claim" feat), which all epic characters have at level 20+.
  const race = useMemo(
    () => bundle.allRaces.find(r => r.Name === build.race),
    [bundle.allRaces, build.race],
  )
  const availableForSelect = useMemo(
    () => availableDestinyTrees(allTrees, build, bundle.allClasses, race),
    [allTrees, build, bundle.allClasses, race],
  )

  // V2 Tier-5 lock: only the tree holding a trained Tier-5 may train more
  // Tier-5s. This tree is also the "active"/primary destiny (V2 Tier5Tree).
  const lockedTier5Tree = useMemo(
    () => tier5LockedTree(selectedDestinyTrees, destinyChoices, allTrees),
    [selectedDestinyTrees, destinyChoices, allTrees],
  )

  // Keep build.activeEpicDestiny in sync with the Tier-5 tree (V2: Tier5Tree is
  // exported/imported as the active destiny).
  useEffect(() => {
    if ((build.activeEpicDestiny ?? '') !== lockedTier5Tree) {
      dispatch({ type: 'SET_ACTIVE_DESTINY', name: lockedTier5Tree })
    }
  }, [lockedTier5Tree, build.activeEpicDestiny, dispatch])
  const activeEpicDestiny = lockedTier5Tree

  // Selected (non-empty) slot names
  const selectedSlots = selectedDestinyTrees.filter(n => n !== '')

  // Destiny points are a single shared pool spent across ALL selected trees;
  // there is no per-tree cap. V2 BreakdownItemDestinyAps sums:
  //   level-based pool + floor(fatePoints/3) + DestinyAPBonus effects.
  // The level-based part uses the FULL character level (heroic + epic +
  // legendary — V2 Build::Level()), not the heroic-only totalLevel.
  const fatePoints = Math.max(0, Math.round(stats.total('fatePoint')))
  const destinyApBonus = Math.max(0, Math.round(stats.total('destinyAP')))
  const destinyPool = useMemo(
    () => destinyPoolForBuild(build, fatePoints, destinyApBonus),
    [build, fatePoints, destinyApBonus],
  )
  const totalSpentAllTrees = useMemo(
    () => selectedSlots.reduce((sum, name) => {
      const tree = allTrees.find(t => t.Name === name)
      return sum + (tree ? computeTreeSpent(tree, destinyChoices[name] ?? {}) : 0)
    }, 0),
    [selectedSlots, allTrees, destinyChoices],
  )
  const atDestinyCap = totalSpentAllTrees >= destinyPool

  // Trees with any AP spent (for AP annotations)
  const spentInTrees = useMemo(() =>
    allTrees.filter(t => Object.values(destinyChoices[t.Name] ?? {}).some(v => v > 0)).map(t => t.Name),
  [allTrees, destinyChoices])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSlotChange(slot: 0 | 1 | 2, name: string) {
    // V2: a slot's tree can only be changed when it has no AP spent.
    const current = selectedDestinyTrees[slot]
    if (current && (destinyChoices[current] ? computeTreeSpent(allTrees.find(t => t.Name === current)!, destinyChoices[current]) : 0) > 0) {
      return
    }
    dispatch({ type: 'SET_SELECTED_DESTINY', slot, name })
  }

  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    const prev = destinyChoices[treeName] ?? {}
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(updated)])
    for (const itemName of allKeys) {
      const oldRank = prev[itemName] ?? 0
      const newRank = updated[itemName] ?? 0
      if (oldRank !== newRank) {
        dispatch({ type: 'SET_DESTINY_CHOICE', treeName, itemName, rank: newRank })
      }
    }
  }

  function handleSelectionsChange(treeName: string, updated: Record<string, string>) {
    dispatch({ type: 'SET_DESTINY_SELECTIONS', treeName, selections: updated })
  }

  function handleReset(treeName: string) {
    dispatch({ type: 'RESET_DESTINY_TREE', treeName })
  }

  // ── Render guard ──────────────────────────────────────────────────────────

  const tooLow = build.totalLevel < 20

  if (loading) return <div className="panel"><div className="panel-header">Epic Destinies</div><div className="panel-body"><div className={styles.statusMsg}>Loading…</div></div></div>
  if (tooLow)  return <div className="panel"><div className="panel-header">Epic Destinies</div><div className="panel-body"><div className={styles.statusMsg}>Epic Destinies unlock at level 20.</div></div></div>

  // ── Full panel ────────────────────────────────────────────────────────────

  return (
    <div className="panel">
      <div className="panel-header">Epic Destinies</div>
      <div className="panel-body" style={{ padding: 0 }}>

        {/* ── Destiny slot selectors ────────────────────────────────────── */}
        <div className={styles.slotSection}>
          <div className={styles.slotSectionTitle}>Select Destiny Trees (up to 3)</div>
          <div className={styles.slotRows}>
            {([0, 1, 2] as const).map(slot => {
              const currentName = selectedDestinyTrees[slot]
              const otherSelected = selectedDestinyTrees.filter((_, i) => i !== slot)
              const slotSpent = currentName
                ? computeTreeSpent(allTrees.find(t => t.Name === currentName) ?? { EnhancementTreeItem: [] } as unknown as EnhancementTree, destinyChoices[currentName] ?? {})
                : 0
              const locked = slotSpent > 0   // V2: can't change a slot with AP spent
              return (
                <div key={slot} className={styles.slotRow}>
                  <span className={styles.slotLabel}>Destiny {slot + 1}</span>
                  <select
                    className={styles.slotSelect}
                    value={currentName}
                    disabled={locked}
                    title={locked ? 'Reset this tree before changing it' : undefined}
                    onChange={e => handleSlotChange(slot, e.target.value)}
                  >
                    <option value="">— None —</option>
                    {availableForSelect.map(t => (
                      <option
                        key={t.Name}
                        value={t.Name}
                        disabled={otherSelected.includes(t.Name)}
                      >
                        {t.Name}
                        {spentInTrees.includes(t.Name) ? ` (${computeTreeSpent(t, destinyChoices[t.Name] ?? {})} AP)` : ''}
                      </option>
                    ))}
                  </select>
                  {currentName && activeEpicDestiny === currentName && (
                    <span className={styles.activeBtnOn} title="Primary destiny (holds Tier-5 enhancements)">⚡ Primary</span>
                  )}
                  {locked && (
                    <button className={styles.resetBtn} onClick={() => handleReset(currentName)} title="Reset this tree to change the slot">Reset</button>
                  )}
                </div>
              )
            })}
          </div>
          {lockedTier5Tree && (
            <div className={styles.slotSectionTitle} style={{ opacity: 0.8 }}>
              Tier-5 locked to <strong>{lockedTier5Tree}</strong> — other trees' Tier-5s are unavailable until it is reset.
            </div>
          )}
        </div>

        {/* ── Shared pool + side-by-side tree grids (V2 DestinyPane) ─────── */}
        {selectedSlots.length > 0 && (
          <>
            <div className={styles.poolBar}>
              <span className={atDestinyCap ? styles.apCapReached : styles.apCurrent}>{totalSpentAllTrees}</span>
              <span className={styles.apSep}>/</span>
              <span className={styles.apCap}>{destinyPool}</span>
              <span className={styles.apLabel}>&nbsp;destiny points spent</span>
            </div>

            <div className={styles.multiTreeScroll}>
              <div className={styles.multiTreeRow}>
                {selectedSlots.map(name => {
                  const tree = allTrees.find(t => t.Name === name)
                  if (!tree) return null
                  const treeChoices: TreeChoices = destinyChoices[name] ?? {}
                  const spent = computeTreeSpent(tree, treeChoices)
                  return (
                    <div key={name} className={styles.treeColumn}>
                      <div className={styles.treeHeader}>
                        <div className={styles.treeTitle}>
                          {name}
                          {activeEpicDestiny === name && <span className={styles.activeBadge}>Primary</span>}
                        </div>
                        <div className={styles.treeAP}>
                          <span className={styles.apCurrent}>{spent}</span>
                          <span className={styles.apLabel}>&nbsp;spent</span>
                          {spent > 0 && (
                            <button className={styles.resetBtn} onClick={() => handleReset(name)}>
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                      <TreeGrid
                        tree={tree}
                        choices={treeChoices}
                        selections={build.destinySelections?.[name] ?? {}}
                        totalSpentAllTrees={totalSpentAllTrees}
                        totalAP={destinyPool}
                        tier5Locked={lockedTier5Tree !== '' && lockedTier5Tree !== name}
                        build={build}
                        allClasses={bundle.allClasses}
                        race={race}
                        onChoicesChange={(updated) => handleChoicesChange(name, updated)}
                        onSelectionsChange={(updated) => handleSelectionsChange(name, updated)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
