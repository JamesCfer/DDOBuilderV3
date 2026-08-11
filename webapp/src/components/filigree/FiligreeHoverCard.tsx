// Hover card for a filigree: what the piece itself grants, plus the FULL set
// bonus ladder it belongs to — every tier, with the ones already active, the
// one slotting this piece would unlock, and the ones still out of reach. That
// preview is the point: the set bonus is the reason to pick a filigree, and
// the panel otherwise only shows it after the piece is already slotted.

import type { Filigree, FiligreeSetBonus, FiligreeSetBuff } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import { HoverHeader, HoverBody, HoverSection, hoverStyles as h } from '../common/HoverCard'
import styles from './FiligreePanel.module.css'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

/** Filigree descriptions carry the rare-variant effect on a "Rare:" line. */
export function splitDescription(description: string | undefined): { base: string[]; rare: string[] } {
  const base: string[] = []
  const rare: string[] = []
  for (const line of (description ?? '').split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = line.match(/^Rare:\s*(.*)$/i)
    if (m) rare.push(m[1])
    else base.push(line)
  }
  return { base, rare }
}

export interface SetCount {
  /** Pieces of this set currently slotted across the build. */
  current: number
  /** Pieces that would be slotted with this filigree in the hovered slot. */
  projected: number
}

export function FiligreeCardContent({ filigree, setBonuses, countFor, rare }: {
  filigree: Filigree
  setBonuses: Map<string, FiligreeSetBonus>
  /** Current/projected piece counts for a set name. */
  countFor: (setName: string) => SetCount
  /** Whether the slot being previewed is flagged rare. */
  rare?: boolean
}) {
  const { base, rare: rareLines } = splitDescription(filigree.Description)
  const sets = toArray(filigree.SetBonus)

  return (
    <>
      <HoverHeader
        icon={<DdoIcon category="FiligreeImages" name={filigree.Icon ?? filigree.Name} size={28} />}
        title={filigree.Name}
        subtitle={filigree.Menu}
      />
      <HoverBody>
        {base.length > 0 && (
          <HoverSection title="Filigree">
            {base.map((line, i) => <div key={i} className={h.effectName}>{line}</div>)}
          </HoverSection>
        )}
        {rareLines.length > 0 && (
          <div className={rare ? styles.rareLineOn : styles.rareLine}>
            {rareLines.map((line, i) => (
              // Several filigrees state "Rare: No rare form of this filigree" —
              // that is a note, not an effect, so it skips the Rare chip.
              /^no rare/i.test(line)
                ? <div key={i} className={h.meta}>{line}</div>
                : <div key={i}><span className={styles.rareTag}>Rare</span> {line}</div>
            ))}
          </div>
        )}

        {sets.map(setName => {
          const { current, projected } = countFor(setName)
          const tiers = toArray<FiligreeSetBuff>(setBonuses.get(setName)?.Buff)
            .slice()
            .sort((a, b) => a.EquippedCount - b.EquippedCount)
          return (
            <HoverSection key={setName} title={`Set: ${setName}`}>
              <div className={styles.setCountLine}>
                {current} slotted{projected !== current ? ` → ${projected} with this` : ''}
              </div>
              {tiers.length === 0 ? (
                <div className={h.meta}>No set bonuses listed.</div>
              ) : (
                <div className={styles.tierList}>
                  {tiers.map((tier, i) => {
                    const active = current >= tier.EquippedCount
                    const unlocks = !active && projected >= tier.EquippedCount
                    const cls = active ? styles.tierActive
                      : unlocks ? styles.tierUnlocks
                        : styles.tierLocked
                    return (
                      <div key={i} className={`${styles.tierRow} ${cls}`}>
                        <span className={styles.tierCount}>{tier.EquippedCount}pc</span>
                        <span className={styles.tierText}>{tier.Description ?? ''}</span>
                        {unlocks && <span className={styles.tierBadge}>unlocks</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </HoverSection>
          )
        })}
      </HoverBody>
    </>
  )
}
