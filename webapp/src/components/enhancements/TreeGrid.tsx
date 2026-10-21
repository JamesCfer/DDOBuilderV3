import { useState } from 'react'
import type {
  CharacterBuild, DDOClass, EnhancementSelection, EnhancementTree,
  EnhancementTreeItem, Race,
} from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import { tipProps, hideTip, type TipContent } from '../common/HoverTip'
import { summarizeEffects } from '../../lib/effectSummary'
import { meetsRequirements } from '../../lib/requirements'
import { enhancementRanksAllowNext, requiresEnhancement } from '../../lib/enhancementRankGate'
import type { TreeItemFeatContext } from '../../lib/enhancementFeats'
import { useSettings } from '../../context/SettingsContext'
import styles from './TreeGrid.module.css'
import ModalPortal from '../common/ModalPortal'

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
  const out: number[] = []
  for (let i = 0; i < maxRanks; i++) {
    out.push(parts[i] ?? parts[parts.length - 1])
  }
  return out
}

function costUpToRank(item: EnhancementTreeItem, targetRank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs.slice(0, targetRank).reduce((a, b) => a + b, 0)
}

function nextRankCost(item: EnhancementTreeItem, currentRank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs[currentRank] ?? 1
}

/**
 * V2 XML stores enhancements by InternalName (e.g. "ShintaoCore1"), while
 * manual UI choices historically used the display Name. Using InternalName as
 * the canonical choice key means V2-imported builds render correctly.
 * Old saves that used display Name still work via the fallback in getChoiceRank.
 */
function itemKey(item: EnhancementTreeItem): string {
  return item.InternalName ?? item.Name
}

function getChoiceRank(choices: TreeChoices, item: EnhancementTreeItem): number {
  return choices[itemKey(item)] ?? choices[item.Name] ?? 0
}

function getSelection(selections: TreeSelections, item: EnhancementTreeItem): string | undefined {
  return selections[itemKey(item)] ?? selections[item.Name]
}

/** Get all options from the first Selector on an item. */
function getSelectorOptions(item: EnhancementTreeItem): EnhancementSelection[] {
  if (!item.Selector || item.Selector.length === 0) return []
  const group = item.Selector[0]
  const raw = group.EnhancementSelection
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

function getSelectorExclusions(item: EnhancementTreeItem): string[] {
  const raw = item.Selector?.[0]?.Exclusions
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TreeChoices = Record<string, number>
export type TreeSelections = Record<string, string>

// ---------------------------------------------------------------------------
// Layout constants — matches v2 DDOBuilder canvas (299×466px, scaled ~1.15×)
// Core (Y=0): smaller cells at bottom; Tiers (Y=1..5): larger cells above
// ---------------------------------------------------------------------------
const CORE_Y = 0

// Tier cell
const T_W = 52          // cell width
const T_H = 60          // cell height
const T_COL = 56        // horizontal step (cell + gap)
const T_ROW = 70        // vertical step between tier rows

// Core cell
const C_W = 44          // core cell width
const C_H = 50          // core cell height
const C_COL = 50        // horizontal step for core cells

// Canvas padding
const PAD_X = 8
const PAD_Y = 6
const CORE_GAP = 6      // gap between bottom tier row and core row

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------

interface CanvasLayout {
  width: number
  height: number
  maxTierY: number
  maxTierX: number
  maxCoreX: number
}

function computeLayout(items: EnhancementTreeItem[]): CanvasLayout {
  const tierItems = items.filter(it => (it.YPosition ?? 0) !== CORE_Y)
  const coreItems = items.filter(it => (it.YPosition ?? 0) === CORE_Y)

  const maxTierX = tierItems.reduce((m, it) => Math.max(m, it.XPosition ?? 0), 0)
  const maxCoreX = coreItems.reduce((m, it) => Math.max(m, it.XPosition ?? 0), 0)
  const maxTierY = tierItems.reduce((m, it) => Math.max(m, it.YPosition ?? 1), 1)

  const tierColsNeeded = Math.max(maxTierX + 1, 1)
  const coreColsNeeded = Math.max(maxCoreX + 1, 1)
  const tierWidth = PAD_X * 2 + tierColsNeeded * T_COL
  const coreWidth = PAD_X * 2 + coreColsNeeded * C_COL
  const width = Math.max(tierWidth, coreWidth)

  const tierAreaH = maxTierY * T_ROW + T_H
  const height = coreItems.length > 0
    ? PAD_Y + tierAreaH + CORE_GAP + C_H + PAD_Y
    : PAD_Y + tierAreaH + PAD_Y

  return { width, height, maxTierY, maxTierX, maxCoreX }
}

function itemPos(item: EnhancementTreeItem, layout: CanvasLayout): { left: number; top: number } {
  const y = item.YPosition ?? 0
  const x = item.XPosition ?? 0
  if (y === CORE_Y) {
    return {
      left: PAD_X + x * C_COL,
      top: PAD_Y + layout.maxTierY * T_ROW + T_H + CORE_GAP,
    }
  }
  return {
    left: PAD_X + x * T_COL,
    top: PAD_Y + (layout.maxTierY - y) * T_ROW,
  }
}

// ---------------------------------------------------------------------------
// Selector picker modal
// ---------------------------------------------------------------------------

interface SelectorPickerProps {
  options: EnhancementSelection[]
  /** Options the build can pick now (V2 CSelectionSelectDialog enables only
   *  these); the rest are shown greyed out. */
  isSelectable: (opt: EnhancementSelection) => boolean
  onSelect: (name: string) => void
  onClose: () => void
}

function SelectorPicker({ options, isSelectable, onSelect, onClose }: SelectorPickerProps) {
  return (
    <ModalPortal>
    <div className={styles.selectorOverlay} onClick={onClose}>
      <div className={styles.selectorModal} onClick={e => e.stopPropagation()}>
        <div className={styles.selectorHeader}>Choose an option</div>
        <div className={styles.selectorGrid}>
          {options.map(opt => {
            const selectable = isSelectable(opt)
            return (
            <button
              key={opt.Name}
              className={styles.selectorOption}
              // aria-disabled, not disabled: a disabled button gets no mouse
              // events, so its tooltip (why it can't be picked) never shows.
              aria-disabled={!selectable}
              {...tipProps({
                title: opt.Name,
                description: opt.Description,
                effects: summarizeEffects(opt.Effect),
                notes: selectable ? [] : [{ text: 'Requirements not met', tone: 'warn' }],
              })}
              onClick={() => { if (!selectable) return; onSelect(opt.Name); onClose() }}
            >
              <DdoIcon
                category="EnhancementImages"
                name={opt.Icon ?? opt.Name}
                size={32}
                className={styles.selectorIcon}
              />
              <span className={styles.selectorName}>{opt.Name}</span>
            </button>
            )
          })}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ---------------------------------------------------------------------------
// Enhancement cell
// ---------------------------------------------------------------------------

interface CellProps {
  /** V2 parity: the item's <Requirements> are met against the current build. */
  reqsMet?: boolean
  /** V2 MetEnhancements: prerequisite enhancements have enough ranks for the next rank. */
  rankGateMet?: boolean
  item: EnhancementTreeItem
  rank: number
  selectedOption: string | undefined
  treeSpent: number
  totalSpent: number
  totalAP: number
  isCore: boolean
  coreUnlocked?: boolean
  /** V2 Tier-5 lock: this is a Tier-5 item and another tree already holds one. */
  tier5Blocked?: boolean
  pos: { left: number; top: number }
  onIncrement: () => void
  onDecrement: () => void
  onShowSelector: () => void
}

function EnhancementCell({
  item, rank, selectedOption, treeSpent, totalSpent, totalAP,
  isCore, coreUnlocked = true, reqsMet = true, rankGateMet = true, tier5Blocked = false, pos,
  onIncrement, onDecrement, onShowSelector,
}: CellProps) {
  const maxRanks = item.Ranks ?? 1
  const minSpent = item.MinSpent ?? 0
  // A Tier-5 item already trained here can still be reduced, so only block when
  // nothing is trained yet (rank 0).
  const locked = treeSpent < minSpent || (isCore && !coreUnlocked) || !reqsMet || (tier5Blocked && rank === 0)
  const atMax = rank >= maxRanks
  const cost = nextRankCost(item, rank)
  const canAfford = (totalAP - totalSpent) >= cost
  const canBuy = !locked && !atMax && canAfford && rankGateMet
  const canSell = rank > 0

  const options = getSelectorOptions(item)
  const hasSelector = options.length > 0
  const activeOption = hasSelector
    ? options.find(o => o.Name === selectedOption) ?? null
    : null

  const displayIcon = activeOption?.Icon ?? item.Icon ?? item.Name
  const displayName = activeOption?.Name ?? item.Name

  const totalCost = costUpToRank(item, rank)
  const warn = (text: string) => ({ text, tone: 'warn' as const })
  const tooltip: TipContent = {
    title: displayName,
    subtitle: [
      maxRanks > 1 ? `Rank ${rank}/${maxRanks}` : rank > 0 ? 'Trained' : '',
      atMax ? `${totalCost} AP spent` : `${cost} AP${maxRanks > 1 ? ' per rank' : ''}`,
      minSpent > 0 ? `needs ${minSpent} AP in tree` : '',
    ].filter(Boolean).join(' · '),
    description: activeOption?.Description ?? item.Description,
    effects: [
      ...summarizeEffects(item.Effect, rank),
      ...summarizeEffects(activeOption?.Effect, rank),
    ],
    notes: [
      ...(treeSpent < minSpent ? [warn(`Requires ${minSpent} AP spent in this tree (${treeSpent} so far)`)] : []),
      ...(isCore && !coreUnlocked ? [warn('Requires the previous core enhancement')] : []),
      ...(!reqsMet ? [warn('Build does not meet this enhancement\'s prerequisites')] : []),
      ...(!locked && !atMax && !rankGateMet ? [warn(`Rank ${rank + 1} needs rank ${rank + 1} of its prerequisite`)] : []),
      ...(tier5Blocked && rank === 0 ? [warn('Tier 5 is locked to another destiny tree')] : []),
      ...(!atMax && !canAfford && !locked ? [warn('Not enough action points')] : []),
      ...(hasSelector && !selectedOption ? [{ text: 'Click to choose an option' }] : []),
    ],
  }

  const w = isCore ? C_W : T_W
  const h = isCore ? C_H : T_H

  let stateClass = ''
  if (locked) stateClass = styles.locked
  else if (rank > 0) stateClass = styles.active
  else if (canBuy || (hasSelector && !selectedOption)) stateClass = styles.available
  else stateClass = styles.unavailable

  const cellClass = [
    styles.cell,
    isCore ? styles.coreCell : styles.tierCell,
    stateClass,
  ].join(' ')

  function handleClick() {
    if (locked) return
    if (hasSelector && !selectedOption && !atMax) {
      onShowSelector()
      return
    }
    if (canBuy) onIncrement()
  }

  return (
    <div
      className={cellClass}
      style={{ left: pos.left, top: pos.top, width: w, height: h }}
      {...tipProps(tooltip)}
      onClick={handleClick}
      onContextMenu={canSell ? (e) => { e.preventDefault(); onDecrement() } : undefined}
    >
      {item.ArrowRight && <span className={styles.arrowRight} aria-hidden>›</span>}
      {item.ArrowUp && <span className={styles.arrowUp} aria-hidden>↑</span>}

      <div className={styles.cellIconWrap}>
        <DdoIcon
          category="EnhancementImages"
          name={displayIcon}
          size={isCore ? 24 : 28}
          className={`${styles.cellIcon} ${rank > 0 ? styles.cellIconActive : ''}`}
        />
        {locked && <span className={styles.lockOverlay}>🔒</span>}
        {hasSelector && !selectedOption && !locked && (
          <span className={styles.selectorBadge}>▾</span>
        )}
      </div>

      {maxRanks > 1 && (
        <div className={styles.rankRow}>
          {Array.from({ length: maxRanks }, (_, i) => (
            <span key={i} className={i < rank ? styles.rankPipFilled : styles.rankPipEmpty} />
          ))}
        </div>
      )}

      <div className={styles.costLabel}>
        {atMax ? '✓' : `${cost} AP`}
      </div>

      {canSell && (
        <button
          className={styles.decrementBtn}
          onClick={(e) => { e.stopPropagation(); onDecrement() }}
          title="Remove rank"
          tabIndex={-1}
        >
          −
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TreeGrid
// ---------------------------------------------------------------------------

interface TreeGridProps {
  tree: EnhancementTree
  choices: TreeChoices
  selections: TreeSelections
  totalSpentAllTrees: number
  totalAP?: number
  /** V2 Tier-5 lock: another destiny tree already holds a trained Tier-5, so
   *  this tree's Tier-5 items cannot be trained. */
  tier5Locked?: boolean
  onChoicesChange: (updated: TreeChoices) => void
  onSelectionsChange: (updated: TreeSelections) => void
  /**
   * Optional V2-parity requirement context. When supplied, each tree-item's
   * <Requirements> are evaluated against the build and items with unmet
   * prerequisites are visually locked (TrainedEnhancement::IsAvailable).
   */
  build?: CharacterBuild
  allClasses?: DDOClass[]
  race?: Race
  /**
   * The build's full feat context (trained, automatic, special and granted
   * feats; lib/enhancementFeats). Without it, Feat requirements see only the
   * slot-trained feats.
   */
  featContext?: TreeItemFeatContext
}

export default function TreeGrid({
  tree, choices, selections, totalSpentAllTrees, totalAP = 80, tier5Locked = false,
  onChoicesChange, onSelectionsChange,
  build, allClasses, race, featContext,
}: TreeGridProps) {
  const { settings: { autoSelectSingleOption } } = useSettings()
  const [selectorTarget, setSelectorTarget] = useState<string | null>(null)

  const items = tree.EnhancementTreeItem ?? []
  if (items.length === 0) {
    return <div className={styles.empty}>No enhancements found for this tree.</div>
  }

  const layout = computeLayout(items)

  const treeSpent = items.reduce((sum, item) => {
    return sum + costUpToRank(item, getChoiceRank(choices, item))
  }, 0)

  const coreItems = items
    .filter(it => (it.YPosition ?? 0) === CORE_Y)
    .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))

  function coreIsUnlocked(item: EnhancementTreeItem): boolean {
    const idx = coreItems.findIndex(c => c.Name === item.Name)
    if (idx <= 0) return true
    const prev = coreItems[idx - 1]
    return getChoiceRank(choices, prev) >= (prev.Ranks ?? 1)
  }

  // V2 Build::IsTrained walks every trained tree; this tree's live choices win.
  function ranksOf(internalName: string): number {
    const local = choices[internalName]
    if (local != null) return local
    if (!build) return 0
    for (const pool of [build.enhancementChoices, build.destinyChoices, build.reaperChoices]) {
      for (const tc of Object.values(pool ?? {})) {
        const r = tc[internalName]
        if (r) return r
      }
    }
    return 0
  }

  function maxRanksOf(internalName: string): number | undefined {
    const it = items.find(i => itemKey(i) === internalName)
    return it ? (it.Ranks ?? 1) : undefined
  }

  function rankGateMet(item: EnhancementTreeItem): boolean {
    return enhancementRanksAllowNext(item.Requirements, getChoiceRank(choices, item), ranksOf, maxRanksOf)
  }

  // V2 SpendInTree::HasTrainedDependants: a trained item here that requires
  // this one and holds equal or more ranks blocks removing a rank.
  function hasTrainedDependants(item: EnhancementTreeItem, ranks: number): boolean {
    const key = itemKey(item)
    return items.some(other => {
      if (other === item) return false
      const r = getChoiceRank(choices, other)
      if (r <= 0) return false
      const sel = getSelection(selections, other)
      const opt = sel ? getSelectorOptions(other).find(o => o.Name === sel) : undefined
      const needs = requiresEnhancement(other.Requirements, key) || requiresEnhancement(opt?.Requirements, key)
      return needs && r >= ranks
    })
  }

  function writeChoices(item: EnhancementTreeItem, rank: number): TreeChoices {
    const key = itemKey(item)
    const next = { ...choices }
    if (rank === 0) {
      delete next[key]
    } else {
      next[key] = rank
    }
    // Remove any stale display-name entry when InternalName differs.
    if (key !== item.Name) delete next[item.Name]
    return next
  }

  /**
   * V2 CSelectionSelectDialog / EnhancementTreeDialog::GetAutoSelection: an
   * option can be picked only when its own requirements and MinSpent are met,
   * the AP is there, and no item named in the Selector's Exclusions already
   * trained that same option. Kensei Weapon Group Specialization is the
   * common case: only the weapon group chosen in the first core qualifies.
   */
  function optionSelectable(item: EnhancementTreeItem, opt: EnhancementSelection): boolean {
    if ((opt.MinSpent ?? 0) > treeSpent) return false
    if ((totalAP - totalSpentAllTrees) < nextRankCost(item, getChoiceRank(choices, item))) return false
    if (build) {
      const pools = [build.enhancementSelections, build.destinySelections, build.reaperSelections]
      for (const ex of getSelectorExclusions(item)) {
        for (const pool of pools) {
          for (const sels of Object.values(pool ?? {})) {
            if (sels[ex] === opt.Name) return false
          }
        }
      }
      if (allClasses && !meetsRequirements(opt.Requirements, { build, allClasses, race, ...featContext })) return false
    }
    return true
  }

  function openSelector(item: EnhancementTreeItem) {
    // V2 "Auto Select Single Option Enhancements" (EnhancementTreeDialog
    // ::GetAutoSelection): when exactly one option is selectable, pick it
    // without showing the dialog.
    const selectable = getSelectorOptions(item).filter(o => optionSelectable(item, o))
    if (autoSelectSingleOption && selectable.length === 1) {
      handleSelection(item.Name, selectable[0].Name)
      return
    }
    setSelectorTarget(item.Name)
  }

  function handleIncrement(item: EnhancementTreeItem) {
    const rank = getChoiceRank(choices, item)
    const maxRanks = item.Ranks ?? 1
    if (rank >= maxRanks) return
    const minSpent = item.MinSpent ?? 0
    if (treeSpent < minSpent) return
    const cost = nextRankCost(item, rank)
    if ((totalAP - totalSpentAllTrees) < cost) return
    const isCore = (item.YPosition ?? 0) === CORE_Y
    if (isCore && !coreIsUnlocked(item)) return
    if (!rankGateMet(item)) return

    const options = getSelectorOptions(item)
    if (options.length > 0 && !getSelection(selections, item)) {
      openSelector(item)
      return
    }

    onChoicesChange(writeChoices(item, rank + 1))
  }

  function handleDecrement(item: EnhancementTreeItem) {
    const rank = getChoiceRank(choices, item)
    if (rank <= 0) return
    const isCore = (item.YPosition ?? 0) === CORE_Y
    if (isCore) {
      const idx = coreItems.findIndex(c => c.Name === item.Name)
      if (coreItems.slice(idx + 1).some(c => getChoiceRank(choices, c) > 0)) return
    }
    if (hasTrainedDependants(item, rank)) return
    const newRank = rank - 1
    onChoicesChange(writeChoices(item, newRank))
    if (newRank === 0 && getSelection(selections, item)) {
      const next = { ...selections }
      delete next[itemKey(item)]
      delete next[item.Name]
      onSelectionsChange(next)
    }
  }

  function handleSelection(itemName: string, optionName: string) {
    const item = items.find(it => it.Name === itemName)
    if (!item) return
    const key = itemKey(item)
    // Write under InternalName key; remove any stale display-name entry.
    const nextSel = { ...selections, [key]: optionName }
    if (key !== item.Name) delete nextSel[item.Name]
    onSelectionsChange(nextSel)
    const rank = getChoiceRank(choices, item)
    const cost = nextRankCost(item, rank)
    if ((totalAP - totalSpentAllTrees) >= cost && rankGateMet(item)) {
      onChoicesChange(writeChoices(item, rank + 1))
    }
  }

  const selectorItem = selectorTarget ? items.find(it => it.Name === selectorTarget) : null
  const selectorOptions = selectorItem ? getSelectorOptions(selectorItem) : []

  const bgName = tree.Background
  const bgStyle = bgName && bgName !== 'NoTreeBackground'
    ? {
        backgroundImage: `linear-gradient(rgba(8,4,0,0.52), rgba(8,4,0,0.52)), url(/images/UIImages/${bgName}.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
      }
    : undefined

  return (
    <div
      className={styles.canvas}
      style={{ width: layout.width, height: layout.height, ...bgStyle }}
    >
      {/* Tier dividers (subtle horizontal lines) */}
      {Array.from({ length: layout.maxTierY }, (_, i) => {
        const tier = layout.maxTierY - i
        const y = PAD_Y + i * T_ROW + T_H
        return (
          <div
            key={`div-${tier}`}
            className={styles.tierDivider}
            style={{ top: y, left: PAD_X, width: layout.width - PAD_X * 2 }}
          />
        )
      })}

      {/* Core separator */}
      {coreItems.length > 0 && (
        <div
          className={styles.coreSeparator}
          style={{
            top: PAD_Y + layout.maxTierY * T_ROW + T_H + CORE_GAP / 2,
            left: 0,
            width: layout.width,
          }}
        />
      )}

      {/* All items — absolutely positioned */}
      {items.map(item => {
        const isCore = (item.YPosition ?? 0) === CORE_Y
        const pos = itemPos(item, layout)
        // V2 parity: evaluate per-item Requirements when build is provided.
        // Items without a Requirements block are always met.
        const reqsMet = build && allClasses
          ? meetsRequirements(item.Requirements, { build, allClasses, race, ...featContext })
          : true
        return (
          <EnhancementCell
            key={item.Name}
            item={item}
            rank={getChoiceRank(choices, item)}
            selectedOption={getSelection(selections, item)}
            treeSpent={treeSpent}
            totalSpent={totalSpentAllTrees}
            totalAP={totalAP}
            isCore={isCore}
            coreUnlocked={isCore ? coreIsUnlocked(item) : true}
            reqsMet={reqsMet}
            rankGateMet={rankGateMet(item)}
            tier5Blocked={tier5Locked && item.Tier5 === true}
            pos={pos}
            onIncrement={() => handleIncrement(item)}
            onDecrement={() => handleDecrement(item)}
            onShowSelector={() => openSelector(item)}
          />
        )
      })}

      {selectorTarget && selectorOptions.length > 0 && (
        <SelectorPicker
          options={selectorOptions}
          isSelectable={opt => optionSelectable(selectorItem!, opt)}
          onSelect={name => handleSelection(selectorTarget, name)}
          onClose={() => { hideTip(); setSelectorTarget(null) }}
        />
      )}
    </div>
  )
}
