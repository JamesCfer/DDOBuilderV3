import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter, MAX_FILIGREE_SLOTS } from '../../context/CharacterContext'
import type { Filigree, FiligreeSetBonus, FiligreeSetBuff, FiligreeSlot, SentientGem } from '../../types/ddo'
import styles from './FiligreePanel.module.css'

// Defaults when a build has no stored slot arrays; the rendered counts follow
// the arrays' lengths, adjustable 1..MAX_FILIGREE_SLOTS via the Slots selects.
const WEAPON_SLOT_COUNT = 6
const ARTIFACT_SLOT_COUNT = 10

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

function groupByMenu(filigrees: Filigree[]): Map<string, Filigree[]> {
  const groups = new Map<string, Filigree[]>()
  for (const f of filigrees) {
    const menu = f.Menu ?? 'Other'
    if (!groups.has(menu)) groups.set(menu, [])
    groups.get(menu)!.push(f)
  }
  return groups
}

function countSetBonuses(slots: FiligreeSlot[], filigrees: Filigree[]): Map<string, number> {
  const byName = new Map<string, Filigree>(filigrees.map(f => [f.Name, f]))
  const counts = new Map<string, number>()
  for (const slot of slots) {
    if (!slot.name) continue
    const f = byName.get(slot.name)
    // SetBonus is a repeated XML element — the parser delivers an ARRAY with
    // real catalogue data. Keying the map on the array (pre-fix behaviour)
    // crashed the whole page on `a.localeCompare` once any filigree was
    // slotted, and never matched FiligreeSetBonus.Type.
    for (const sb of toArray(f?.SetBonus)) {
      counts.set(sb, (counts.get(sb) ?? 0) + 1)
    }
  }
  return counts
}

interface SlotRowProps {
  index: number
  label: string
  slot: FiligreeSlot
  groups: Map<string, Filigree[]>
  menuNames: string[]
  onNameChange: (name: string) => void
  onRareToggle: (rare: boolean) => void
}

function FiligreeSlotRow({ index, label, slot, groups, menuNames, onNameChange, onRareToggle }: SlotRowProps) {
  return (
    <div className={styles.slotRow}>
      <span className={styles.slotLabel}>{label} {index + 1}</span>
      <select
        className={styles.slotSelect}
        value={slot.name}
        onChange={e => onNameChange(e.target.value)}
      >
        <option value="">— Empty —</option>
        {menuNames.map(menu => (
          <optgroup key={menu} label={menu}>
            {(groups.get(menu) ?? [])
              .slice()
              .sort((a, b) => a.Name.localeCompare(b.Name))
              .map(f => (
                <option key={f.Name} value={f.Name}>{f.Name}</option>
              ))}
          </optgroup>
        ))}
      </select>
      {slot.name && (
        <label className={`${styles.rareToggle} ${slot.rare ? styles.rareToggleOn : ''}`} title="Rare variant — applies rare effects">
          <input
            type="checkbox"
            checked={slot.rare}
            onChange={e => onRareToggle(e.target.checked)}
          />
          Rare
        </label>
      )}
    </div>
  )
}

export default function FiligreePanel() {
  const { build, dispatch } = useCharacter()
  const [filigrees, setFiligrees] = useState<Filigree[]>([])
  const [setBonuses, setSetBonuses] = useState<FiligreeSetBonus[]>([])
  const [gems, setGems] = useState<SentientGem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([api.filigree(), api.filigreeSetBonuses(), api.gems()])
      .then(([fils, bonuses, gemList]) => {
        setFiligrees(Array.isArray(fils) ? fils : [])
        setSetBonuses(Array.isArray(bonuses) ? bonuses : [])
        setGems(Array.isArray(gemList) ? gemList : [])
      })
      .catch(() => {
        setFiligrees([])
        setSetBonuses([])
        setGems([])
      })
      .finally(() => setLoading(false))
  }, [])

  const weaponSlots: FiligreeSlot[] = build.filigreeSlots ?? Array.from({ length: WEAPON_SLOT_COUNT }, () => ({ name: '', rare: false }))
  const artifactSlots: FiligreeSlot[] = build.artifactFiligreeSlots ?? Array.from({ length: ARTIFACT_SLOT_COUNT }, () => ({ name: '', rare: false }))

  const groups = groupByMenu(filigrees)
  const menuNames = Array.from(groups.keys()).sort()

  const allSlots = [...weaponSlots, ...artifactSlots]
  const equippedCounts = countSetBonuses(allSlots, filigrees)
  const setBonusByType = new Map<string, FiligreeSetBonus>(setBonuses.map(sb => [sb.Type, sb]))

  const selectedGem = build.sentientGem.name ?? ''
  const personality = build.sentientGem.personality ?? ''
  const majorAugment = build.sentientGem.majorAugment ?? ''
  const minorAugment = build.sentientGem.minorAugment ?? ''

  return (
    <div className="panel">
      <div className="panel-header">Sentient Jewel &amp; Artifact Filigrees</div>
      <div className="panel-body">
        {loading ? (
          <p className={styles.empty}>Loading filigrees&hellip;</p>
        ) : (
          <>
            {/* Sentient Gem Selector */}
            <div className={styles.gemRow}>
              <label className={styles.gemLabel} htmlFor="sentient-gem-select">Sentient Gem:</label>
              <select
                id="sentient-gem-select"
                className={styles.gemSelect}
                value={selectedGem}
                onChange={e => dispatch({ type: 'SET_SENTIENT_GEM_NAME', name: e.target.value })}
              >
                <option value="">— None —</option>
                {gems.map(gem => (
                  <option key={gem.Name} value={gem.Name}>{gem.Name}</option>
                ))}
              </select>
            </div>
            {/* Sentient gem personality + augments */}
            <div className={styles.gemRow}>
              <label className={styles.gemLabel} htmlFor="sentient-personality">Personality:</label>
              <input
                id="sentient-personality"
                className={styles.gemSelect}
                value={personality}
                onChange={e => dispatch({ type: 'SET_SENTIENT_GEM_PERSONALITY', personality: e.target.value })}
                placeholder="(optional, free text)"
              />
            </div>
            <div className={styles.gemRow}>
              <label className={styles.gemLabel} htmlFor="sentient-major">Major Augment:</label>
              <input
                id="sentient-major"
                className={styles.gemSelect}
                value={majorAugment}
                onChange={e => dispatch({ type: 'SET_SENTIENT_GEM_AUGMENT', slot: 'major', name: e.target.value })}
                placeholder="augment name"
              />
            </div>
            <div className={styles.gemRow}>
              <label className={styles.gemLabel} htmlFor="sentient-minor">Minor Augment:</label>
              <input
                id="sentient-minor"
                className={styles.gemSelect}
                value={minorAugment}
                onChange={e => dispatch({ type: 'SET_SENTIENT_GEM_AUGMENT', slot: 'minor', name: e.target.value })}
                placeholder="augment name"
              />
            </div>

            {/* Weapon Filigree Slots — count select mirrors V2's EquipmentPane
                "Num Filigrees" combo (1..MAX_FILIGREE=20). */}
            <div className={styles.sectionHeader}>
              Weapon Filigrees
              <label className={styles.slotCount}>
                Slots:{' '}
                <select
                  value={weaponSlots.length}
                  onChange={e => dispatch({ type: 'SET_FILIGREE_COUNT', count: Number(e.target.value) })}
                >
                  {Array.from({ length: MAX_FILIGREE_SLOTS }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.slotsSection}>
              {weaponSlots.map((slot, i) => (
                <FiligreeSlotRow
                  key={i}
                  index={i}
                  label="Slot"
                  slot={slot}
                  groups={groups}
                  menuNames={menuNames}
                  onNameChange={name => dispatch({ type: 'SET_FILIGREE', slotIndex: i, name })}
                  onRareToggle={rare => dispatch({ type: 'SET_FILIGREE_RARE', slotIndex: i, rare })}
                />
              ))}
            </div>

            {/* Artifact Filigree Slots */}
            <div className={styles.sectionHeader}>
              Artifact Filigrees
              <label className={styles.slotCount}>
                Slots:{' '}
                <select
                  value={artifactSlots.length}
                  onChange={e => dispatch({ type: 'SET_ARTIFACT_FILIGREE_COUNT', count: Number(e.target.value) })}
                >
                  {Array.from({ length: MAX_FILIGREE_SLOTS }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.slotsSection}>
              {artifactSlots.map((slot, i) => (
                <FiligreeSlotRow
                  key={i}
                  index={i}
                  label="Artifact"
                  slot={slot}
                  groups={groups}
                  menuNames={menuNames}
                  onNameChange={name => dispatch({ type: 'SET_ARTIFACT_FILIGREE', slotIndex: i, name })}
                  onRareToggle={rare => dispatch({ type: 'SET_ARTIFACT_FILIGREE_RARE', slotIndex: i, rare })}
                />
              ))}
            </div>

            {/* Active Set Bonuses */}
            <div className={styles.setBonusSection}>
              <div className={styles.setBonusHeader}>Active Set Bonuses</div>
              {equippedCounts.size === 0 ? (
                <p className={styles.empty}>No set bonuses active.</p>
              ) : (
                Array.from(equippedCounts.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([type, count]) => {
                    const sbData = setBonusByType.get(type)
                    const buffs = sbData ? toArray<FiligreeSetBuff>(sbData.Buff) : []
                    const unlockedBuffs = buffs.filter(b => b.EquippedCount <= count)
                    return (
                      <div key={type} className={styles.setBonusCard}>
                        <div className={styles.setBonusTitle}>
                          <span className={styles.setBonusName}>{type}</span>
                          <span className={styles.setBonusCount}>{count} piece{count !== 1 ? 's' : ''}</span>
                        </div>
                        {unlockedBuffs.length > 0 ? (
                          <ul className={styles.buffList}>
                            {unlockedBuffs
                              .sort((a, b) => a.EquippedCount - b.EquippedCount)
                              .map((buff, idx) => (
                                <li key={idx} className={styles.buffItem}>
                                  <span className={styles.buffTier}>({buff.EquippedCount}pc)</span>
                                  {buff.Description ?? ''}
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className={styles.empty}>No bonuses unlocked yet.</p>
                        )}
                      </div>
                    )
                  })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
