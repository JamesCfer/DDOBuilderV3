import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { useSettings } from '../../context/SettingsContext'
import type { CharacterBuild, DDOClass, Feat, Race, Requirement } from '../../types/ddo'
import { buildSlots } from '../../lib/levelTraining'
import type { SlotEntry } from '../../lib/levelTraining'
import { featOptionsForSlot } from '../../lib/featEligibility'
import type { FeatOption, OptionSettings } from '../../lib/featEligibility'
import DdoIcon from '../DdoIcon'
import styles from './FeatSlots.module.css'

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

// ---------------------------------------------------------------------------
// Prerequisite label formatting
// ---------------------------------------------------------------------------
function formatReq(req: Requirement): string {
  const item = Array.isArray(req.Item) ? req.Item[0] : req.Item ?? ''
  const val = req.Value ?? 0
  switch (req.Type) {
    case 'Ability': return `${item} ${val}+`
    case 'BAB': return `BAB ${val}+`
    case 'Feat': return item
    case 'Race': return `Race: ${item}`
    case 'Class': return `Class: ${item}`
    case 'ClassLevel': return `${item} ${val}+`
    case 'ClassMinLevel': return item ? `${item} ${val}+` : `Any class ${val}+`
    case 'BaseClassMinLevel': return `${item} ${val}+`
    case 'Level': return `Level ${val}+`
    case 'SpecificLevel': return `Level ${val}`
    case 'Skill': return `${item} ${val}+ ranks`
    case 'Stance': return `Stance: ${item}`
    default: return ''
  }
}

function formatPrerequisites(feat: Feat): string {
  const reqs = feat.Requirements
  if (!reqs) return ''
  const parts: string[] = []
  if (reqs.Requirement) {
    const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
    list.forEach(r => { const s = formatReq(r); if (s) parts.push(s) })
  }
  if (reqs.RequiresOneOf) {
    const groups = Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf]
    groups.forEach(g => {
      const sub = (Array.isArray(g.Requirement) ? g.Requirement : [g.Requirement])
        .map(formatReq).filter(Boolean)
      if (sub.length) parts.push(sub.join(' or '))
    })
  }
  return parts.length ? `Requires: ${parts.join(', ')}` : ''
}

// ---------------------------------------------------------------------------
// Icon picker modal
// ---------------------------------------------------------------------------
interface IconPickerProps {
  options: FeatOption[]
  current: string
  onSelect: (name: string) => void
  onClose: () => void
}

function IconPicker({ options, current, onSelect, onClose }: IconPickerProps) {
  const { settings } = useSettings()
  const [search, setSearch] = useState('')
  // V2 "Show Unavailable Feats" sets the default; the picker toggle remains
  // a per-dialog override.
  const [showLocked, setShowLocked] = useState(settings.showUnavailable)

  const lowerSearch = search.toLowerCase()
  const available = options.filter(o => o.prereqsMet && (!search || o.feat.Name.toLowerCase().includes(lowerSearch)))
  const locked = options.filter(o => !o.prereqsMet && (!search || o.feat.Name.toLowerCase().includes(lowerSearch)))
  const visible = showLocked ? [...available, ...locked] : available

  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <input
            className={styles.pickerSearch}
            placeholder="Search feats…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {locked.length > 0 && (
            <button
              className={`${styles.lockedToggle} ${showLocked ? styles.lockedToggleOn : ''}`}
              onClick={() => setShowLocked(v => !v)}
              title={showLocked ? 'Hide feats with unmet prerequisites' : 'Show feats with unmet prerequisites'}
            >
              {locked.length} locked
            </button>
          )}
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pickerGrid}>
          {visible.map(({ feat: f, prereqsMet }) => {
            const prereqLine = formatPrerequisites(f)
            const tooltip = [
              f.Name,
              f.Description ?? '',
              prereqLine,
            ].filter(Boolean).join('\n\n')
            return (
              <button
                key={f.Name}
                className={[
                  styles.pickerItem,
                  f.Name === current ? styles.pickerItemActive : '',
                  !prereqsMet ? styles.pickerItemLocked : '',
                ].join(' ')}
                title={tooltip}
                onClick={prereqsMet ? () => { onSelect(f.Name); onClose() } : undefined}
                style={!prereqsMet ? { cursor: 'default' } : undefined}
              >
                <DdoIcon
                  category="FeatImages"
                  name={f.Icon ?? f.Name}
                  size={32}
                  className={styles.pickerIcon}
                />
                <span className={styles.pickerName}>{f.Name}</span>
                {!prereqsMet && <span className={styles.pickerLockBadge}>🔒</span>}
              </button>
            )
          })}
          {visible.length === 0 && (
            <div className={styles.pickerEmpty}>No feats match your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function FeatSlots() {
  const { build, dispatch } = useCharacter()
  const { settings, isIgnored } = useSettings()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [feats, setFeats] = useState<Feat[]>([])
  const [openSlotKey, setOpenSlotKey] = useState<string | null>(null)

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats().then(setFeats)
  }, [])

  const slots = buildSlots(build, allClasses, allRaces)

  const openSlot = openSlotKey ? slots.find(s => s.key === openSlotKey) : null
  const currentRace = allRaces.find(r => r.Name === build.race)
  const pickerOptions = openSlot
    ? featOptionsForSlot(openSlot, slots, feats, build, allClasses, currentRace, {
        epicOnly: settings.showEpicOnly,
        showUnavailable: settings.showUnavailable,
        isIgnored,
      })
    : []

  return (
    <div className="panel">
      <div className="panel-header">Feat Slots</div>
      <div className="panel-body">
        {slots.length === 0 ? (
          <p className={styles.empty}>Select a race and classes to see feat slots.</p>
        ) : (
          <div className={styles.list}>
            {slots.map(slot => {
              const chosen = build.featChoices[slot.key] ?? ''
              const chosenFeat = feats.find(f => f.Name === chosen)
              const hoverTitle = chosen
                ? `${chosen}${chosenFeat?.Description ? '\n\n' + chosenFeat.Description : ''}`
                : 'Click to choose a feat'
              return (
                <div key={slot.key} className={styles.slot}>
                  <span className={styles.slotLevel}>Lv {slot.level}</span>
                  <span className={styles.slotType} title={slot.featType}>
                    {slot.featType.replace(' Feat', '')}
                  </span>
                  {slot.className !== 'Universal' && slot.className !== 'Epic' && slot.className !== 'Legendary' && (
                    <span className={styles.slotClass}>{slot.className}</span>
                  )}
                  <button
                    className={`${styles.featPickerBtn} ${chosen ? styles.featPickerBtnChosen : ''}`}
                    onClick={() => setOpenSlotKey(slot.key)}
                    title={hoverTitle}
                  >
                    {chosen ? (
                      <>
                        <DdoIcon
                          category="FeatImages"
                          name={chosenFeat?.Icon ?? chosen}
                          size={22}
                          className={styles.chosenIcon}
                        />
                        <span className={styles.chosenName}>{chosen}</span>
                      </>
                    ) : (
                      <span className={styles.emptySlotLabel}>Choose…</span>
                    )}
                  </button>
                  {chosen && (
                    <button
                      className={styles.clearBtn}
                      onClick={() => dispatch({ type: 'SET_FEAT', slotKey: slot.key, featName: '' })}
                      title="Clear feat"
                    >✕</button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {openSlotKey && openSlot && (
          <IconPicker
            options={pickerOptions}
            current={build.featChoices[openSlotKey] ?? ''}
            onSelect={name => dispatch({ type: 'SET_FEAT', slotKey: openSlotKey, featName: name })}
            onClose={() => setOpenSlotKey(null)}
          />
        )}
      </div>
    </div>
  )
}
