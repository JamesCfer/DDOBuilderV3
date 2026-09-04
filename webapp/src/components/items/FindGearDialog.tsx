import { useState, useEffect, useId, useMemo, useDeferredValue } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { findGearByEffect } from '../../lib/findGear'
import { displaySlotsForItemKey } from '../../lib/gearSlots'
import { useDocument } from '../../context/DocumentContext'
import type { Item, ItemBuff } from '../../types/ddo'
import { formatBuffText } from '../../lib/itemDisplay'
import { itemTypeLabel, itemTypeOptions } from '../../lib/itemFilters'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import HoverCard, { useHoverCard } from '../common/HoverCard'
import { ItemCardContent } from './GearHoverCards'
import ItemTypeSelect from './ItemTypeSelect'
import styles from './FindGearDialog.module.css'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

interface EquipCellProps {
  item: Item
  apiSlot: string
  currentGear: Record<string, string>
  onEquip: (slot: string) => void
}

function EquipCell({ item, apiSlot, currentGear, onEquip }: EquipCellProps) {
  const slots = displaySlotsForItemKey(apiSlot)
  const isEquipped = slots.some(s => currentGear[s] === item.Name)

  if (slots.length === 1) {
    return (
      <button
        className={`${styles.equipBtn} ${isEquipped ? styles.equipBtnActive : ''}`}
        onClick={() => onEquip(slots[0])}
        type="button"
      >
        {isEquipped ? 'Equipped' : 'Equip'}
      </button>
    )
  }

  // Ring: show Ring 1 / Ring 2
  return (
    <div className={styles.equipBtnGroup}>
      {slots.map((s, i) => (
        <button
          key={s}
          className={`${styles.equipBtn} ${currentGear[s] === item.Name ? styles.equipBtnActive : ''}`}
          onClick={() => onEquip(s)}
          type="button"
          title={s === 'Ring2' ? 'Ring slot 2' : 'Ring slot 1'}
        >
          {i + 1}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface FindGearDialogProps {
  onClose: () => void
}

const MAX_RESULTS = 400

export default function FindGearDialog({ onClose }: FindGearDialogProps) {
  const { build, dispatch } = useCharacter()
  const { doc } = useDocument()
  const { allWeaponGroups } = useStaticBundle()
  const listId = useId()
  const itemHover = useHoverCard<Item>()

  const maxCharLevel = Math.max(
    1,
    build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0),
  )

  const [allItems, setAllItems] = useState<Item[] | null>(null)
  const [allBuffTypes, setAllBuffTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [nameSearch, setNameSearch] = useState('')
  const [buffSearch, setBuffSearch] = useState('')
  const [itemType, setItemType] = useState('')
  const [minLv, setMinLv] = useState(1)
  const [maxLv, setMaxLv] = useState(maxCharLevel)
  const [minVal, setMinVal] = useState<number | ''>('')

  // Searching runs over the whole 8779-item catalogue, so the inputs stay
  // immediate and the result table re-computes from the deferred copies.
  const deferredName = useDeferredValue(nameSearch)
  const deferredBuff = useDeferredValue(buffSearch)

  useEffect(() => {
    api
      .items()
      .then(items => {
        setAllItems(items)
        const types = Array.from(
          new Set(
            items.flatMap(item =>
              toArray(item.Buff as ItemBuff | ItemBuff[] | undefined)
                .map(b => b.Type)
                .filter(Boolean),
            ),
          ),
        ).sort()
        setAllBuffTypes(types)
      })
      .catch(() => setAllItems([]))
      .finally(() => setLoading(false))
  }, [])

  // V2 ContentPane parity: hide items from unowned adventure packs
  // (ItemSelectDialog.cpp:312-318 applies the same filter to FindGearDialog).
  const dontOwnKey = (doc.contentIDontOwn ?? []).join('\u0001')
  const ownedItems = useMemo(() => {
    if (!allItems) return null
    const dontOwn = new Set(dontOwnKey ? dontOwnKey.split('\u0001') : [])
    return allItems.filter(it => !it.AdventurePack || !dontOwn.has(it.AdventurePack))
  }, [allItems, dontOwnKey])

  // Type options come from the whole owned catalogue, so the list of weapon /
  // armor types on offer doesn't shift as the other filters narrow results.
  const typeOptions = useMemo(
    () => itemTypeOptions(ownedItems ?? [], allWeaponGroups),
    [ownedItems, allWeaponGroups],
  )

  const hasFilter = Boolean(
    nameSearch || buffSearch || itemType || minLv > 1 || maxLv < maxCharLevel || minVal !== '',
  )

  const results = useMemo(
    () =>
      ownedItems && hasFilter
        ? findGearByEffect(ownedItems, {
            nameSearch: deferredName || undefined,
            buffSearch: deferredBuff || undefined,
            itemType: itemType || undefined,
            weaponGroups: allWeaponGroups,
            minLevel: minLv > 1 ? minLv : undefined,
            maxLevel: maxLv,
            minValue: minVal !== '' ? minVal : undefined,
          })
        : [],
    [ownedItems, hasFilter, deferredName, deferredBuff, itemType, allWeaponGroups, minLv, maxLv, minVal],
  )

  const displayResults = results.slice(0, MAX_RESULTS)
  const truncated = results.length > MAX_RESULTS

  function handleEquip(item: Item, slot: string) {
    dispatch({ type: 'SET_GEAR', slot, itemName: item.Name })
  }

  function handleReset() {
    setNameSearch('')
    setBuffSearch('')
    setItemType('')
    setMinLv(1)
    setMaxLv(maxCharLevel)
    setMinVal('')
  }

  const isDirty = hasFilter

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <span>Find Gear by Effect</span>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <label className={styles.filterLabel}>
            Item text
            <input
              className={styles.filterInput}
              placeholder="Name, effect, description or set…"
              value={nameSearch}
              autoFocus
              onChange={e => setNameSearch(e.target.value)}
            />
          </label>

          <label className={styles.filterLabel}>
            Effect
            <input
              className={styles.filterInput}
              placeholder="e.g. Insightful Strength, Dodge…"
              value={buffSearch}
              list={listId}
              onChange={e => setBuffSearch(e.target.value)}
            />
            <datalist id={listId}>
              {allBuffTypes.map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>

          <label className={styles.filterLabel}>
            Item type
            <ItemTypeSelect
              className={styles.filterSelect}
              value={itemType}
              onChange={setItemType}
              optionGroups={typeOptions}
            />
          </label>

          <label className={styles.filterLabelNarrow}>
            Min Lv
            <input
              type="number"
              className={styles.filterNum}
              min={1}
              max={maxCharLevel}
              value={minLv}
              onChange={e =>
                setMinLv(Math.max(1, Math.min(maxCharLevel, Number(e.target.value) || 1)))
              }
            />
          </label>

          <label className={styles.filterLabelNarrow}>
            Max Lv
            <input
              type="number"
              className={styles.filterNum}
              min={1}
              max={maxCharLevel}
              value={maxLv}
              onChange={e =>
                setMaxLv(Math.max(1, Math.min(maxCharLevel, Number(e.target.value) || maxCharLevel)))
              }
            />
          </label>

          <label className={styles.filterLabelNarrow}>
            Min Value
            <input
              type="number"
              className={styles.filterNum}
              min={0}
              placeholder="any"
              value={minVal}
              onChange={e => setMinVal(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>

          {isDirty && (
            <button className={styles.resetBtn} type="button" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>

        {/* Body */}
        <div className={styles.body}>
          {loading ? (
            <div className={styles.placeholder}>Loading item database…</div>
          ) : !hasFilter ? (
            <div className={styles.placeholder}>
              Search across all gear slots: by item text (name, effect
              description, flavour text or set bonus), by a single effect
              (Insightful Constitution, Acid Resistance, Dodge), or by item
              type (Longsword, Small Shield, Medium Armor, Minor Artifact…).
            </div>
          ) : results.length === 0 ? (
            <div className={styles.placeholder}>No items match — try adjusting the filters.</div>
          ) : (
            <>
              <div className={styles.resultMeta}>
                {truncated
                  ? `Showing first ${MAX_RESULTS} of ${results.length} results`
                  : `${results.length} item${results.length === 1 ? '' : 's'}`}
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thName}>Item</th>
                      <th className={styles.thNum}>Lv</th>
                      <th className={styles.thSlot}>Slot</th>
                      <th className={styles.thType}>Type</th>
                      <th className={styles.thEffect}>Matched Effect(s)</th>
                      <th className={styles.thEquip}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayResults.flatMap(result =>
                      result.slots.map(apiSlot => (
                        <tr key={`${result.item.Name}:${apiSlot}`} className={styles.row}>
                          <td
                            className={styles.tdName}
                            onMouseEnter={itemHover.show(result.item)}
                            onMouseLeave={itemHover.hide}
                          >{result.item.Name}</td>
                          <td className={styles.tdNum}>{result.item.MinLevel ?? 1}</td>
                          <td className={styles.tdSlot}>
                            {/* Data-file slot keys ("Weapon1") read as the
                                panel's slot names ("Main Hand"). */}
                            {apiSlot === 'Ring' ? 'Ring' : displaySlotsForItemKey(apiSlot).join(' / ')}
                          </td>
                          <td className={styles.tdType}>
                            {itemTypeLabel(result.item) || '—'}
                            {'MinorArtifact' in result.item && (
                              <span className={styles.artifactTag} title="Minor Artifact — only one may be equipped">
                                Artifact
                              </span>
                            )}
                          </td>
                          <td className={styles.tdEffect}>
                            {result.matchedBuffs.map(b => formatBuffText(b)).join(', ') || '—'}
                          </td>
                          <td className={styles.tdEquip}>
                            <EquipCell
                              item={result.item}
                              apiSlot={apiSlot}
                              currentGear={build.gear}
                              onEquip={slot => handleEquip(result.item, slot)}
                            />
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {itemHover.hover && (
        <HoverCard x={itemHover.hover.x} y={itemHover.hover.y} openLeft={itemHover.hover.openLeft}>
          <ItemCardContent item={itemHover.hover.data} />
        </HoverCard>
      )}
    </div>
  )
}
