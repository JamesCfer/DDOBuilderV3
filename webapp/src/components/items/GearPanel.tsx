import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Item, ItemBuff, ItemAugment, Augment } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import FindGearDialog from './FindGearDialog'
import GearImportDialog from './GearImportDialog'
import { exportGearSetXml } from '../../lib/v2Export'
import { importGearSetXml } from '../../lib/v2Import'
import { useDocument } from '../../context/DocumentContext'
import { resolveAugmentSlots, pendingSlotUpgrades } from '../../lib/gearSlotUpgrades'
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

// Display slot → <EquipmentSlot> key used in the item XML (V2
// InventorySlotTypes.h enum names, e.g. <CosmeticHelm/>).
const API_SLOT_NAME: Record<string, string> = {
  Ring2: 'Ring',
  'Cosmetic Helmet': 'CosmeticHelm',
  'Cosmetic Armor': 'CosmeticArmor',
  'Cosmetic Cloak': 'CosmeticCloak',
  'Cosmetic Weapon': 'CosmeticWeapon1',
  'Cosmetic Off Hand': 'CosmeticWeapon2',
}

function apiSlotName(slot: string): string {
  return API_SLOT_NAME[slot] ?? slot
}

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
// Tooltip formatter
// ---------------------------------------------------------------------------
function formatItemTooltip(item: Item): string {
  const lines: string[] = []
  const lvl = item.MinLevel && item.MinLevel > 1 ? ` (Level ${item.MinLevel})` : ''
  lines.push(item.Name + lvl)
  if (item.Description) lines.push('', item.Description)

  const buffs = toArray(item.Buff as ItemBuff | ItemBuff[] | undefined)
  if (buffs.length > 0) {
    lines.push('')
    for (const b of buffs) {
      const val = b.Value1 != null ? `+${b.Value1} ` : ''
      const bonus = b.BonusType ? ` (${b.BonusType})` : ''
      lines.push(`${val}${b.Type}${bonus}`)
    }
  }

  const augments = toArray(item.ItemAugment as ItemAugment | ItemAugment[] | undefined)
  if (augments.length > 0) {
    lines.push('', 'Augments: ' + augments.map(a => a.Type).join(', '))
  }

  const sets = toArray(item.SetBonus as string | string[] | undefined)
  if (sets.length > 0) {
    lines.push('', 'Set: ' + sets.join(', '))
  }

  if (item.DropLocation) lines.push('', 'From: ' + item.DropLocation)

  return lines.join('\n')
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
  const [search, setSearch] = useState('')
  const [minLv, setMinLv] = useState(1)
  const [maxLv, setMaxLv] = useState(maxLevel)
  const [buffFilter, setBuffFilter] = useState('')

  // Collect unique buff types across all items in this slot
  const allBuffTypes = Array.from(new Set(
    items.flatMap(item => toArray(item.Buff as ItemBuff | ItemBuff[] | undefined).map(b => b.Type).filter(Boolean))
  )).sort()

  const available = items
    .filter(item => (item.MinLevel ?? 1) >= minLv)
    .filter(item => (item.MinLevel ?? 1) <= maxLv)
    .filter(item => !buffFilter || toArray(item.Buff as ItemBuff | ItemBuff[] | undefined).some(b => b.Type === buffFilter))
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
          {(minLv !== 1 || maxLv !== maxLevel || buffFilter) && (
            <button
              className={styles.filterReset}
              onClick={() => { setMinLv(1); setMaxLv(maxLevel); setBuffFilter('') }}
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
              title={formatItemTooltip(item)}
              onClick={() => { onSelect(item.Name); onClose() }}
            >
              <DdoIcon
                category="ItemImages"
                name={item.Icon ?? item.Name}
                size={32}
                className={styles.pickerIcon}
              />
              <span className={styles.pickerItemName}>{item.Name}</span>
              {item.MinLevel != null && item.MinLevel > 1 && (
                <span className={styles.pickerItemLevel}>Lv {item.MinLevel}</span>
              )}
            </button>
          ))}
        </div>
      </div>
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
  onSet: (key: string, name: string) => void
  onClear: (key: string) => void
  maxItemLevel: number
}

function AugmentSlot({ slotName, augment, index, choice, onSet, onClear, maxItemLevel }: AugmentSlotProps) {
  const [options, setOptions] = useState<Augment[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const key = augmentKey(slotName, augment.Type, index)

  if (augment.Augment) {
    return (
      <div className={styles.augRow}>
        <span className={styles.augType}>{augment.Type}</span>
        <span className={styles.augFixed} title={augment.Augment.Description}>{augment.Augment.Name}</span>
      </div>
    )
  }

  function handleOpen() {
    if (!open && options.length === 0) {
      setLoading(true)
      api.augments({ type: augment.Type })
        .then(data => setOptions(data.filter(a => (a.MinLevel ?? 1) <= maxItemLevel)))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false))
    }
    setOpen(v => !v)
  }

  return (
    <div className={styles.augRow}>
      <span className={styles.augType}>{augment.Type}</span>
      <button
        className={`${styles.augSelector} ${choice ? styles.augFilled : ''}`}
        onClick={handleOpen}
        type="button"
      >
        {choice || '— Empty —'}
      </button>
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
          {loading ? (
            <div className={styles.pickerLoading}>Loading…</div>
          ) : options.length === 0 ? (
            <div className={styles.pickerEmpty}>No augments available for {augment.Type}</div>
          ) : (
            <select
              size={Math.min(8, options.length + 1)}
              className={styles.pickerSelect}
              value={choice}
              onChange={e => { onSet(key, e.target.value); setOpen(false) }}
            >
              <option value="">— Empty —</option>
              {options
                .slice()
                .sort((a, b) => (a.MinLevel ?? 0) - (b.MinLevel ?? 0) || a.Name.localeCompare(b.Name))
                .map(aug => (
                  <option key={aug.Name} value={aug.Name}>
                    {aug.Name}{aug.MinLevel && aug.MinLevel > 1 ? ` (Lv ${aug.MinLevel})` : ''}
                  </option>
                ))}
            </select>
          )}
        </div>
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
    api.items({ slot: apiSlotName(slot) })
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

    const slotTooltip = detail ? formatItemTooltip(detail) : (equipped ?? '')

    return (
      <div key={slot} className={styles.slotBlock}>
        <div className={styles.slotRow}>
          <span className={styles.slotLabel}>{slotLabel(slot)}</span>

          <button
            className={`${styles.slotBtn} ${equipped ? styles.slotBtnEquipped : ''}`}
            onClick={() => handleSlotClick(slot)}
            title={slotTooltip}
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
                choice={augmentChoices[augmentKey(slot, augment.Type, index)] ?? ''}
                onSet={(key, name) => dispatch({ type: 'SET_AUGMENT', key, augmentName: name })}
                onClear={(key) => dispatch({ type: 'CLEAR_AUGMENT', key })}
                maxItemLevel={detail?.MinLevel ?? maxLevel}
              />
            ))}
            {pendingUpgrades.map(({ upgrade, key, options }) => (
              <div key={key} className={styles.augRow}>
                <span className={styles.augType} title="Choose an additional augment slot color (cannot be undone)">
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
                    <option key={color} value={color}>{color}</option>
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
      {findGearOpen && <FindGearDialog onClose={() => setFindGearOpen(false)} />}
      {importOpen && <GearImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}
