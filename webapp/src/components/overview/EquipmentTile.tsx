// Overview › Equipment: every worn slot and what is in it, two columns, with
// the sentient filigree count underneath. The Gear tab does the equipping.

import { useCharacter } from '../../context/CharacterContext'
import { useGearItems } from '../../hooks/useGearItems'
import DdoIcon from '../DdoIcon'
import styles from './Overview.module.css'

const SLOTS: Array<[slot: string, label: string]> = [
  ['Helmet', 'Helmet'], ['Gloves', 'Gloves'],
  ['Necklace', 'Necklace'], ['Bracers', 'Bracers'],
  ['Trinket', 'Trinket'], ['Boots', 'Boots'],
  ['Armor', 'Armor'], ['Goggles', 'Goggles'],
  ['Cloak', 'Cloak'], ['Main Hand', 'Main hand'],
  ['Belt', 'Belt'], ['Off Hand', 'Off hand'],
  ['Ring', 'Ring 1'], ['Quiver', 'Quiver'],
  ['Ring2', 'Ring 2'], ['Arrow', 'Arrow'],
]

export default function EquipmentTile() {
  const { build } = useCharacter()
  const items = useGearItems(build.gear)
  const worn = SLOTS.filter(([slot]) => build.gear[slot]).length
  const filigrees = (build.filigreeSlots ?? []).filter(f => f?.name).length
  const artifactFiligrees = (build.artifactFiligreeSlots ?? []).filter(f => f?.name).length
  const augments = Object.values(build.augmentChoices ?? {}).filter(Boolean).length

  return (
    <div className="panel">
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.meta}>{worn} / {SLOTS.length} slots</div>
        <div className={styles.gearGrid}>
          {SLOTS.map(([slot, label]) => {
            const name = build.gear[slot] ?? ''
            const item = items[slot]
            return (
              <div key={slot} className={styles.gearSlot} title={name || `${label}: empty`}>
                <span className={styles.iconBox}>
                  {name && <DdoIcon category="ItemImages" name={item?.Icon ?? name} size={20} />}
                </span>
                <span className={styles.gearText}>
                  <span className={styles.gearSlotName}>{label}</span>
                  <span className={`${styles.gearItem} ${name ? '' : styles.gearEmpty}`}>{name || 'empty'}</span>
                </span>
              </div>
            )
          })}
        </div>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Augments slotted</span>
            <span className={styles.rowValue}>{augments}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Filigrees</span>
            <span className={styles.rowValue}>{filigrees} sentient · {artifactFiligrees} artifact</span>
          </div>
          {build.activeGearSetName && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Gear set</span>
              <span className={styles.rowValue}>{build.activeGearSetName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
