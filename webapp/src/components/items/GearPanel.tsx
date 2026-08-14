import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Item, ItemBuff, ItemAugment, Augment } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import FindGearDialog from './FindGearDialog'
import GearImportDialog from './GearImportDialog'
import { exportGearSetXml } from '../../lib/v2Export'
import { importGearSetXml } from '../../lib/v2Import'
import { useDocument } from '../../context/DocumentContext'
import { resolveAugmentSlots, pendingSlotUpgrades, effectiveAugmentChoice } from '../../lib/gearSlotUpgrades'
import { itemSlotKey } from '../../lib/gearSlots'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import {
  augmentTypeColor, hasSelectableLevels, augmentLevelOptions, bestAugmentLevelIndex,
} from '../../lib/itemDisplay'
import { itemMatchesType, itemTypeLabel, itemTypeOptions } from '../../lib/itemFilters'
import HoverCard, { useHoverCard } from '../common/HoverCard'
import { ItemCardContent, AugmentCardContent, type AugmentFill } from './GearHoverCards'
import ItemTypeSelect from './ItemTypeSelect'
import styles from './GearPanel.module.css'

// ---------------------------------------------------------------------------
// Slot definitions
// ---------------------------------------------------------------------------
const LEFT_SLOTS = ['Helmet', 'Necklace', 'Trinket', 'Armor', 'Cloak', 'Belt', 'Ring', 'Ring2']
const RIGHT_SLOTS = ['Gloves', 'Bracers', 'Boots', 'Goggles', 'Main Hand', 'Off Hand', 'Quiver', 'Arrow']
// V2 also supports cosmetic-only slots that don't contribute stats but do
// participate in gear-set persistence and forum export. Listed here so they
// round-trip through save/load.
const COSMETIC_SLOTS = ['Cosmetic Helmet', 'Cosmetic Armor', 'Cosmetic Cloak', 'Cosmetic Weapon', 'Cosmetic Off Hand']
const ALL_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...COSMETIC_SLOTS]

function slotLabel(slot: string): string {
  if (slot === 'Ring') return 'Ring (1)'
  if (slot === 'Ring2') return 'Ring (2)'
  return slot
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

function augmentKey(slot: string, augType: string, idx: number) {
  return `${slot}:${augType}:${idx}`
}

// ---------------------------------------------------------------------------
// Item picker modal
// ---------------------------------------------------------------------------
interface ItemPickerModalProps {
  slot: string
  items: Item[]
  current: string | undefined
  maxLevel: number
  onSelect: (name: string) => void
  onClose: () => void
}

function ItemPickerModal({ slot, items, current, maxLevel, onSelect, onClose }: ItemPickerModalProps) {
  const { hover, show, hide } = useHoverCard<Item>()
  const { allWeaponGroups } = useStaticBundle()
  const [search, setSearch] = useState('')
  const [minLv, setMinLv] = useState(1)
  const [maxLv, setMaxLv] = useState(maxLevel)
  const [buffFilter, setBuffFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // Collect unique buff types across all items in this slot
  const allBuffTypes = Array.from(new Set(
    items.flatMap(item => toArray(item.Buff as ItemBuff | ItemBuff[] | undefined).map(b => b.Type).filter(Boolean))
  )).sort()

  // Weapon / armor / shield types this slot can actually hold. Weapon slots get
  // the full weapon-class list; a Necklace slot gets no type control at all.
  const typeOptions = useMemo(
    () => itemTypeOptions(items, allWeaponGroups),
    [items, allWeaponGroups],
  )

  const available = items
    .filter(item => (item.MinLevel ?? 1) >= minLv)
    .filter(item => (item.MinLevel ?? 1) <= maxLv)
    .filter(item => !buffFilter || toArray(item.Buff as ItemBuff | ItemBuff[] | undefined).some(b => b.Type === buffFilter))
    .filter(item => itemMatchesType(item, typeFilter, allWeaponGroups))
    .filter(item => !search || item.Name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.MinLevel ?? 0) - (b.MinLevel ?? 0) || a.Name.localeCompare(b.Name))

  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerModalHeader}>
          <span>Select {slotLabel(slot)} item</span>
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pickerSearch}>
          <input
            className={styles.pickerSearchInput}
            placeholder="Search items…"
            value={search}
            autoFocus
            onChange={e => setSearch(e.target.value)}
          />
          <span className={styles.pickerCount}>{available.length} items</span>
        </div>
        <div className={styles.pickerFilters}>
          <label className={styles.filterLabel}>
            Min Lv
            <input
              type="number"
              className={styles.filterNum}
              min={1}
              max={maxLevel}
              value={minLv}
              onChange={e => setMinLv(Math.max(1, Math.min(maxLevel, Number(e.target.value) || 1)))}
            />
          </label>
          <label className={styles.filterLabel}>
            Max Lv
            <input
              type="number"
              className={styles.filterNum}
              min={1}
              max={maxLevel}
              value={maxLv}
              onChange={e => setMaxLv(Math.max(1, Math.min(maxLevel, Number(e.target.value) || maxLevel)))}
            />
          </label>
          <label className={styles.filterLabel}>
            Effect
            <select
              className={styles.filterSelect}
              value={buffFilter}
              onChange={e => setBuffFilter(e.target.value)}
            >
              <option value="">All</option>
              {allBuffTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {typeOptions.length > 0 && (
            <label className={styles.filterLabel}>
              Type
              <ItemTypeSelect
                className={styles.filterSelect}
                value={typeFilter}
                onChange={setTypeFilter}
                optionGroups={typeOptions}
                anyLabel="All"
              />
            </label>
          )}
          {(minLv !== 1 || maxLv !== maxLevel || buffFilter || typeFilter) && (
            <button
              className={styles.filterReset}
              onClick={() => {
                setMinLv(1); setMaxLv(maxLevel); setBuffFilter(''); setTypeFilter('')
              }}
            >Reset</button>
          )}
        </div>
        <div className={styles.pickerGrid}>
          <button
            className={`${styles.pickerItem} ${!current ? styles.pickerItemActive : ''}`}
            onClick={() => { onSelect(''); onClose() }}
          >
            <span className={styles.pickerEmptyIcon}>—</span>
            <span className={styles.pickerItemName}>Empty</span>
          </button>
          {available.map(item => (
            <button
              key={item.Name}
              className={`${styles.pickerItem} ${item.Name === current ? styles.pickerItemActive : ''}`}
              onMouseEnter={show(item)}
              onMouseLeave={hide}
              onClick={() => { onSelect(item.Name); onClose() }}
            >
              <DdoIcon
                category="ItemImages"
                name={item.Icon ?? item.Name}
                size={32}
                className={styles.pickerIcon}
              />
              <span className={styles.pickerItemName}>{item.Name}</span>
              {itemTypeLabel(item) && (
                <span className={styles.pickerItemType}>{itemTypeLabel(item)}</span>
              )}
              {item.MinLevel != null && item.MinLevel > 1 && (
                <span className={styles.pickerItemLevel}>Lv {item.MinLevel}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {hover && (
        <HoverCard x={hover.x} y={hover.y} openLeft={hover.openLeft}>
          <ItemCardContent item={hover.data} />
        </HoverCard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AugmentSlot sub-component
// ---------------------------------------------------------------------------
interface AugmentSlotProps {
  slotName: string
  augment: ItemAugment
  index: number
  choice: string
  /** Stored V2 SelectedLevelIndex for this slot, when the player picked one. */
  levelIndex?: number
  onSet: (key: string, name: string, levelIndex?: number) => void
  onClear: (key: string) => void
  onSetLevel: (key: string, levelIndex: number) => void
  maxItemLevel: number
  /** Character level — V2 caps the offered augment tiers to it, not to the
   *  host item's level (ItemSelectDialog.cpp:573). */
  buildLevel: number
}

function AugmentSlot({
  slotName, augment, index, choice, levelIndex, onSet, onClear, onSetLevel, maxItemLevel,
  buildLevel,
}: AugmentSlotProps) {
  const [fetched, setFetched] = useState<Augment[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const { allAugments } = useStaticBundle()
  const { hover, show, hide } = useHoverCard<Augment>()
  const key = augmentKey(slotName, augment.Type, index)
  const typeColor = augmentTypeColor(augment.Type)

  // V2 CompatibleAugments (GlobalSupportFunctions.cpp:2355): a slot with
  // ItemSpecificAugments offers exactly that list — a picker, not a fixed
  // grant, and with no level filter; every other slot draws from the global
  // catalogue by slot type, capped to the host item's level.
  const itemSpecific = toArray(augment.Augment)
  const options = itemSpecific.length > 0 ? itemSpecific : fetched

  // The slotted augment's own record, for the closed-slot hover card. Item-
  // specific options carry their data inline; everything else resolves against
  // the shared catalogue, which is already loaded for the stats panels.
  const chosenAugment = choice
    ? (itemSpecific.find(a => a.Name === choice)
      ?? options.find(a => a.Name === choice)
      ?? allAugments.find(a => a.Name === choice))
    : undefined

  // Tier picker: only the gem augments carry a <Levels> table, and V2 caps the
  // offered tiers to the host item's level (ItemSelectDialog.cpp:573).
  const levelOptions = chosenAugment && hasSelectableLevels(chosenAugment)
    ? augmentLevelOptions(chosenAugment, buildLevel)
    : []
  const effectiveLevelIndex = levelIndex
    ?? (chosenAugment ? bestAugmentLevelIndex(chosenAugment, buildLevel) : 0)

  const needle = search.trim().toLowerCase()
  const sortedOptions = options
    .filter(a => !needle
      || a.Name.toLowerCase().includes(needle)
      || (a.Description ?? '').toLowerCase().includes(needle))
    .sort((a, b) => (a.MinLevel ?? 0) - (b.MinLevel ?? 0) || a.Name.localeCompare(b.Name))

  /** Picking an augment stores its best usable tier, so a Levels augment never
   *  silently sits on its weakest one. */
  function chooseAugment(name: string) {
    const picked = options.find(a => a.Name === name)
    const withLevels = picked && hasSelectableLevels(picked)
      ? bestAugmentLevelIndex(picked, buildLevel)
      : undefined
    onSet(key, name, withLevels)
    setOpen(false)
    setSearch('')
    hide()
  }

  function handleOpen() {
    if (!open && itemSpecific.length === 0 && fetched.length === 0) {
      setLoading(true)
      api.augments({ type: augment.Type })
        .then(data => setFetched(data.filter(a => (a.MinLevel ?? 1) <= maxItemLevel)))
        .catch(() => setFetched([]))
        .finally(() => setLoading(false))
    }
    setOpen(v => !v)
  }

  return (
    <div className={styles.augRow}>
      <span className={styles.augType} style={{ color: typeColor }} title={augment.Type}>
        {augment.Type}
      </span>
      <button
        className={`${styles.augSelector} ${choice ? styles.augFilled : ''}`}
        style={choice ? { borderColor: typeColor } : undefined}
        onClick={handleOpen}
        onMouseEnter={chosenAugment ? show(chosenAugment) : undefined}
        onMouseLeave={hide}
        type="button"
      >
        {choice || '— Empty —'}
      </button>
      {levelOptions.length > 1 && (
        <select
          className={styles.augLevelSelect}
          value={effectiveLevelIndex}
          title="Augment level — picks which value from the augment's level table applies"
          aria-label={`${choice} level`}
          onChange={e => onSetLevel(key, Number(e.target.value))}
        >
          {levelOptions.map(opt => (
            <option key={opt.index} value={opt.index}>
              Lv {opt.level} ({opt.value >= 0 ? '+' : ''}{opt.value})
            </option>
          ))}
        </select>
      )}
      {choice && (
        <button
          className={styles.augClear}
          onClick={() => { onClear(key); setOpen(false) }}
          type="button"
          title="Remove augment"
        >×</button>
      )}
      {open && (
        <div className={styles.augPicker}>
          <input
            className={styles.augSearch}
            placeholder="Search augments…"
            value={search}
            autoFocus
            onChange={e => setSearch(e.target.value)}
          />
          {loading ? (
            <div className={styles.pickerLoading}>Loading…</div>
          ) : options.length === 0 ? (
            <div className={styles.pickerEmpty}>No augments available for {augment.Type}</div>
          ) : sortedOptions.length === 0 ? (
            <div className={styles.pickerEmpty}>No augments match “{search}”</div>
          ) : (
            <div className={styles.augOptionList} role="listbox" aria-label={`${augment.Type} augments`}>
              <button
                type="button"
                role="option"
                aria-selected={!choice}
                className={`${styles.augOption} ${!choice ? styles.augOptionActive : ''}`}
                onClick={() => chooseAugment('')}
              >
                <span className={styles.augOptionName}>— Empty —</span>
              </button>
              {sortedOptions.map(aug => (
                <button
                  key={aug.Name}
                  type="button"
                  role="option"
                  aria-selected={aug.Name === choice}
                  className={`${styles.augOption} ${aug.Name === choice ? styles.augOptionActive : ''}`}
                  onMouseEnter={show(aug)}
                  onMouseLeave={hide}
                  onClick={() => chooseAugment(aug.Name)}
                >
                  <DdoIcon
                    category="AugmentImages"
                    name={aug.Icon ?? aug.Name}
                    size={16}
                    className={styles.augOptionIcon}
                  />
                  <span className={styles.augOptionName}>{aug.Name}</span>
                  {aug.MinLevel != null && aug.MinLevel > 1 && (
                    <span className={styles.augOptionLevel}>Lv {aug.MinLevel}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {hover && (
        <HoverCard x={hover.x} y={hover.y} openLeft={hover.openLeft}>
          <AugmentCardContent
            augment={hover.data}
            itemLevel={maxItemLevel}
            maxTierLevel={buildLevel}
            slotType={augment.Type}
            levelIndex={hover.data.Name === choice ? effectiveLevelIndex : undefined}
          />
        </HoverCard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GearPanel
// ---------------------------------------------------------------------------
export default function GearPanel() {
  const { build, dispatch } = useCharacter()
  const { doc } = useDocument()
  const itemHover = useHoverCard<{ item: Item; fills: AugmentFill[] }>()

  const [slotItems, setSlotItems] = useState<Record<string, Item[] | null>>({})
  const [itemDetails, setItemDetails] = useState<Record<string, Item | null>>({})
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [findGearOpen, setFindGearOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [setNameInput, setSetNameInput] = useState('')

  const gear = build.gear
  const augmentChoices = build.augmentChoices
  const maxLevel = Math.max(1, build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0))

  function ensureItemsLoaded(slot: string) {
    if (slotItems[slot] !== undefined) return
    setSlotItems(prev => ({ ...prev, [slot]: null }))
    api.items({ slot: itemSlotKey(slot) })
      .then(items => setSlotItems(prev => ({ ...prev, [slot]: items })))
      .catch(() => setSlotItems(prev => ({ ...prev, [slot]: [] })))
  }

  const loadItemDetails = useCallback((slot: string, itemName: string) => {
    if (itemDetails[slot] !== undefined) return
    setItemDetails(prev => ({ ...prev, [slot]: null }))
    api.item(itemName)
      .then(item => setItemDetails(prev => ({ ...prev, [slot]: item })))
      .catch(() => setItemDetails(prev => ({ ...prev, [slot]: null })))
  }, [itemDetails])

  useEffect(() => {
    for (const slot of ALL_SLOTS) {
      const itemName = gear[slot]
      if (!itemName) continue
      const cached = itemDetails[slot]
      if (cached === undefined) {
        loadItemDetails(slot, itemName)
      } else if (cached !== null && (cached as Item).Name !== itemName) {
        // Stale entry from a previous build load — invalidate so next render reloads
        setItemDetails(prev => { const n = { ...prev }; delete n[slot]; return n })
      }
    }
  }, [gear, itemDetails, loadItemDetails])

  function handleSlotClick(slot: string) {
    ensureItemsLoaded(slot)
    setOpenSlot(slot)
  }

  function handleSelectItem(slot: string, itemName: string) {
    if (itemName) {
      dispatch({ type: 'SET_GEAR', slot, itemName })
      setItemDetails(prev => ({ ...prev, [slot]: undefined as unknown as null }))
    } else {
      dispatch({ type: 'CLEAR_GEAR', slot })
      setItemDetails(prev => { const n = { ...prev }; delete n[slot]; return n })
    }
    setOpenSlot(null)
  }

  function handleClear(slot: string, e: React.MouseEvent) {
    e.stopPropagation()
    dispatch({ type: 'CLEAR_GEAR', slot })
    setItemDetails(prev => { const n = { ...prev }; delete n[slot]; return n })
    if (openSlot === slot) setOpenSlot(null)
  }

  useEffect(() => { setOpenSlot(null) }, [build.totalLevel])

  function renderSlot(slot: string) {
    const equipped = gear[slot]
    const cachedDetail = equipped ? (itemDetails[slot] ?? null) : null
    // Only use cached details if they match the equipped item (guard against stale entries during reload)
    const detail = cachedDetail && (cachedDetail as Item).Name === equipped ? cachedDetail : null
    const augSlots = detail ? resolveAugmentSlots(detail, slot, build.slotUpgradeChoices) : []
    const pendingUpgrades = detail ? pendingSlotUpgrades(detail, slot, build.slotUpgradeChoices) : []
    const icon = detail?.Icon

    // Try to find icon from the basic list too (if detail not yet loaded)
    const basicList = slotItems[slot]
    const basicItem = basicList ? basicList.find(i => i.Name === equipped) : null
    const displayIcon = icon ?? basicItem?.Icon

    // What the hover card shows for this slot: the item's augment slots with
    // the player's current picks folded in.
    const augFills: AugmentFill[] = augSlots.map(({ augment, index }) => ({
      type: augment.Type,
      index,
      choice: effectiveAugmentChoice(augmentChoices, augmentKey(slot, augment.Type, index), augment),
    }))

    return (
      <div key={slot} className={styles.slotBlock}>
        <div className={styles.slotRow}>
          <span className={styles.slotLabel}>{slotLabel(slot)}</span>

          <button
            className={`${styles.slotBtn} ${equipped ? styles.slotBtnEquipped : ''}`}
            onClick={() => handleSlotClick(slot)}
            onMouseEnter={detail ? itemHover.show({ item: detail, fills: augFills }) : undefined}
            onMouseLeave={itemHover.hide}
            title={detail ? undefined : (equipped ?? undefined)}
            type="button"
          >
            {equipped && displayIcon ? (
              <DdoIcon
                category="ItemImages"
                name={displayIcon}
                size={24}
                className={styles.slotIcon}
              />
            ) : (
              <span className={styles.slotIconPlaceholder} aria-hidden>◇</span>
            )}
            <span className={styles.slotBtnText}>{equipped ?? '— Empty —'}</span>
          </button>

          {equipped && (
            <button
              className={styles.clearBtn}
              onClick={e => handleClear(slot, e)}
              title="Remove item"
              type="button"
            >×</button>
          )}
        </div>

        {equipped && (augSlots.length > 0 || pendingUpgrades.length > 0) && (
          <div className={styles.augments}>
            {augSlots.map(({ augment, index }) => (
              <AugmentSlot
                key={`${augment.Type}:${index}`}
                slotName={slot}
                augment={augment}
                index={index}
                choice={effectiveAugmentChoice(augmentChoices, augmentKey(slot, augment.Type, index), augment)}
                levelIndex={build.augmentLevelChoices?.[augmentKey(slot, augment.Type, index)]}
                onSet={(key, name, levelIndex) => dispatch({ type: 'SET_AUGMENT', key, augmentName: name, levelIndex })}
                onSetLevel={(key, levelIndex) => dispatch({ type: 'SET_AUGMENT_LEVEL', key, levelIndex })}
                onClear={(key) => (augment.SelectedAugment
                  // A pre-filled slot needs an explicit '' so the item's
                  // SelectedAugment default stays overridden after clearing.
                  ? dispatch({ type: 'SET_AUGMENT', key, augmentName: '' })
                  : dispatch({ type: 'CLEAR_AUGMENT', key }))}
                maxItemLevel={detail?.MinLevel ?? maxLevel}
                buildLevel={maxLevel}
              />
            ))}
            {pendingUpgrades.map(({ upgrade, key, options }) => (
              <div key={key} className={styles.augRow}>
                <span
                  className={styles.augType}
                  style={{ color: augmentTypeColor(upgrade.Type) }}
                  title="Choose an additional augment slot color (cannot be undone)"
                >
                  {upgrade.Type}
                </span>
                <select
                  className={styles.upgradeSelect}
                  value=""
                  onChange={e => {
                    if (e.target.value) dispatch({ type: 'SET_SLOT_UPGRADE', key, upgradeType: e.target.value })
                  }}
                >
                  <option value="">— Choose slot color —</option>
                  {options.map(color => (
                    <option key={color} value={color} style={{ color: augmentTypeColor(color) }}>{color}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const namedGearSets = build.namedGearSets ?? {}
  const activeSetName = build.activeGearSetName ?? ''
  const setNames = Object.keys(namedGearSets)

  const hasUnsavedChanges = activeSetName !== '' && (() => {
    const saved = namedGearSets[activeSetName]
    if (!saved) return false
    return ALL_SLOTS.some(s => (build.gear[s] ?? '') !== (saved[s] ?? ''))
  })()

  function handleSaveSet() {
    const name = setNameInput.trim() || activeSetName
    if (!name) return
    dispatch({ type: 'SAVE_GEAR_SET', setName: name })
    setSetNameInput('')
  }

  function handleLoadSet(name: string) {
    if (name) dispatch({ type: 'LOAD_GEAR_SET', setName: name })
  }

  function handleDeleteSet() {
    if (activeSetName) dispatch({ type: 'DELETE_GEAR_SET', setName: activeSetName })
  }

  // For the open picker. Items from adventure packs the character does not
  // own are hidden (V2 ItemSelectDialog.cpp:312-318, ContentPane parity).
  const dontOwn = new Set(doc.contentIDontOwn ?? [])
  const pickerSlotItems = (openSlot ? (slotItems[openSlot] ?? []) : [])
    .filter(it => !it.AdventurePack || !dontOwn.has(it.AdventurePack))
  const isPickerLoading = openSlot && slotItems[openSlot] === null

  return (
    <div className="panel">
      <div className="panel-header">Gear</div>
      <div className="panel-body">
        <div className={styles.findGearRow}>
          <button
            className={styles.findGearBtn}
            type="button"
            onClick={() => setFindGearOpen(true)}
            title="Search all items across every slot by effect type"
          >
            Find Gear by Effect…
          </button>
          <button
            className={styles.findGearBtn}
            type="button"
            onClick={() => setImportOpen(true)}
            title="Import a gear set from a .gearset file or gear-planner website text (V2 Gear menu)"
          >
            Import Gear Set…
          </button>
          <button
            className={styles.findGearBtn}
            type="button"
            title="Copy the current gear set to the clipboard as V2 EquippedGear XML (V2 Gear → Copy)"
            onClick={() => {
              const xml = exportGearSetXml(build.activeGearSetName || 'Copied Set', build.gear, build.augmentChoices)
              void navigator.clipboard?.writeText(xml)
            }}
          >
            Copy Set
          </button>
          <button
            className={styles.findGearBtn}
            type="button"
            title="Paste a gear set from the clipboard (V2 Gear → Paste)"
            onClick={() => {
              navigator.clipboard?.readText().then(text => {
                const parsed = importGearSetXml(text)
                if (!parsed) { window.alert('Clipboard does not contain a V2 gear-set XML fragment.'); return }
                for (const [slot, itemName] of Object.entries(parsed.gear)) {
                  dispatch({ type: 'SET_GEAR', slot, itemName })
                }
                for (const [key, augmentName] of Object.entries(parsed.augmentChoices)) {
                  dispatch({ type: 'SET_AUGMENT', key, augmentName })
                }
                dispatch({ type: 'SAVE_GEAR_SET', setName: parsed.name })
              }).catch(() => window.alert('Could not read the clipboard.'))
            }}
          >
            Paste Set
          </button>
        </div>
        <div className={styles.gearSetRow}>
          <input
            type="text"
            className={styles.gearSetInput}
            placeholder={activeSetName || 'Set name…'}
            value={setNameInput}
            onChange={e => setSetNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveSet() }}
          />
          <button className={styles.gearSetBtn} type="button" onClick={handleSaveSet} title="Save current gear as a named set">
            Save Set
          </button>
          <select
            className={styles.gearSetSelect}
            value={activeSetName}
            onChange={e => handleLoadSet(e.target.value)}
            disabled={setNames.length === 0}
          >
            <option value="">Load Set ▼</option>
            {setNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            className={styles.gearSetDeleteBtn}
            type="button"
            onClick={handleDeleteSet}
            disabled={!activeSetName}
            title={activeSetName ? `Delete set "${activeSetName}"` : 'No active set'}
          >
            Delete
          </button>
          {hasUnsavedChanges && (
            <span className={styles.unsavedBadge} title="Gear differs from saved set">unsaved</span>
          )}
        </div>

        <div className={styles.grid}>
          <div className={styles.column}>
            <div className={styles.columnHeader}>Body</div>
            {LEFT_SLOTS.map(renderSlot)}
          </div>
          <div className={styles.column}>
            <div className={styles.columnHeader}>Accessories</div>
            {RIGHT_SLOTS.map(renderSlot)}
          </div>
        </div>

        <details className={styles.cosmetics}>
          <summary>Cosmetic slots ({COSMETIC_SLOTS.filter(s => build.gear[s]).length})</summary>
          <div className={styles.grid}>
            <div className={styles.column}>
              {COSMETIC_SLOTS.map(renderSlot)}
            </div>
          </div>
        </details>

        {build.totalLevel === 0 && (
          <p className={styles.hint}>Set your character level to filter items by level.</p>
        )}
      </div>

      {openSlot && !isPickerLoading && (
        <ItemPickerModal
          slot={openSlot}
          items={pickerSlotItems}
          current={gear[openSlot]}
          maxLevel={maxLevel}
          onSelect={name => handleSelectItem(openSlot, name)}
          onClose={() => setOpenSlot(null)}
        />
      )}
      {isPickerLoading && (
        <div className={styles.pickerOverlay} onClick={() => setOpenSlot(null)}>
          <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
            <div className={styles.pickerModalHeader}>
              <span>Loading items…</span>
              <button className={styles.pickerClose} onClick={() => setOpenSlot(null)}>✕</button>
            </div>
            <div className={styles.pickerLoading}>Loading {slotLabel(openSlot)} items…</div>
          </div>
        </div>
      )}
      {itemHover.hover && (
        <HoverCard x={itemHover.hover.x} y={itemHover.hover.y} openLeft={itemHover.hover.openLeft}>
          <ItemCardContent item={itemHover.hover.data.item} augmentFills={itemHover.hover.data.fills} />
        </HoverCard>
      )}
      {findGearOpen && <FindGearDialog onClose={() => setFindGearOpen(false)} />}
      {importOpen && <GearImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}
