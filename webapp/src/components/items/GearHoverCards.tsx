// Content for the gear/augment hover cards. Kept apart from GearPanel so the
// item picker, the equipped-slot row, Find Gear and the augment picker all
// render the same card.

import type { Item, ItemBuff, ItemAugment, Augment } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import { HoverHeader, HoverBody, HoverSection, hoverStyles as s } from '../common/HoverCard'
import {
  describeBuff, buffDescription, augmentTypeColor, augmentDescription, augmentTypes,
  augmentValueAtLevel, hasSelectableLevels, augmentLevelOptions, augmentValueAtIndex,
} from '../../lib/itemDisplay'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

/** One "+15 | Intelligence | Enhancement" row, plus what the effect actually
 *  does when ItemBuffs.xml describes it — for the named effects ("Mind Drain",
 *  "Nightmare Guard") the label alone says nothing. */
function EffectRow({ buff }: { buff: ItemBuff }) {
  const d = describeBuff(buff)
  const description = buffDescription(buff)
  return (
    <div className={s.effectGroup}>
      <div className={s.effectRow}>
        <span className={s.effectValue}>{d.value ?? ''}</span>
        <span className={s.effectName}>{d.label}</span>
        {d.bonusType && <span className={s.chip}>{d.bonusType}</span>}
      </div>
      {description && <div className={s.effectText}>{description}</div>}
    </div>
  )
}

export interface AugmentFill {
  type: string
  index: number
  /** The augment currently slotted here, when the card is for equipped gear. */
  choice?: string
}

export function ItemCardContent({ item, augmentFills }: {
  item: Item
  /** Resolved slot list for equipped gear (includes the player's picks).
   *  Omitted for catalogue entries, which fall back to the item's own slots. */
  augmentFills?: AugmentFill[]
}) {
  const buffs = toArray(item.Buff as ItemBuff | ItemBuff[] | undefined)
  const slots: AugmentFill[] = augmentFills
    ?? toArray(item.ItemAugment as ItemAugment | ItemAugment[] | undefined)
      .map((a, index) => ({ type: a.Type, index, choice: a.SelectedAugment }))
  const sets = toArray(item.SetBonus as string | string[] | undefined)
  const minLevel = item.MinLevel ?? 1

  return (
    <>
      <HoverHeader
        icon={<DdoIcon category="ItemImages" name={item.Icon ?? item.Name} size={28} />}
        title={item.Name}
        subtitle={minLevel > 1 ? `Minimum level ${minLevel}` : undefined}
      />
      <HoverBody>
        {item.Description && <div className={s.description}>{item.Description}</div>}

        {buffs.length > 0 && (
          <HoverSection title="Effects">
            <div className={s.effects}>
              {buffs.map((b, i) => <EffectRow key={i} buff={b} />)}
            </div>
          </HoverSection>
        )}

        {slots.length > 0 && (
          <HoverSection title="Augment Slots">
            <div className={s.slotList}>
              {slots.map(slot => (
                <div className={s.slotRow} key={`${slot.type}:${slot.index}`}>
                  <span className={s.slotType} style={{ color: augmentTypeColor(slot.type) }}>
                    {slot.type}
                  </span>
                  {slot.choice
                    ? <span className={s.slotFilled}>{slot.choice}</span>
                    : <span className={s.slotEmpty}>empty</span>}
                </div>
              ))}
            </div>
          </HoverSection>
        )}

        {sets.length > 0 && (
          <HoverSection title="Set Bonuses">
            <div className={s.meta}>{sets.join(', ')}</div>
          </HoverSection>
        )}

        {item.DropLocation && (
          <div className={s.meta}><span className={s.metaLabel}>From: </span>{item.DropLocation}</div>
        )}
      </HoverBody>
    </>
  )
}

export function AugmentCardContent({ augment, itemLevel, maxTierLevel, slotType, levelIndex }: {
  augment: Augment
  /** Host item level — resolves a ChooseLevel augment's `[value]`. */
  itemLevel?: number
  /** Character level — caps the tiers listed for a <Levels> augment. */
  maxTierLevel?: number
  /** The slot it is being previewed for, highlighted among its types. */
  slotType?: string
  /** The tier in play for this slot, when the augment has selectable levels. */
  levelIndex?: number
}) {
  // An augment lists EVERY slot colour it fits (a blue augment also lists
  // Green/Purple), which is a wall of chips in a preview. When we know which
  // slot it is being previewed for, show just that one.
  const allTypes = augmentTypes(augment)
  const types = slotType && allTypes.includes(slotType) ? [slotType] : allTypes
  // A tiered augment shows its own ladder, so the description resolves at the
  // tier in play rather than at the item level.
  const tiered = hasSelectableLevels(augment)
  const tiers = tiered ? augmentLevelOptions(augment, maxTierLevel ?? itemLevel) : []
  const activeIndex = levelIndex ?? (tiers.length > 0 ? tiers[tiers.length - 1].index : 0)
  const description = tiered
    ? augment.Description?.replace(/\[value\]/gi, String(augmentValueAtIndex(augment, activeIndex) ?? ''))
    : augmentDescription(augment, itemLevel)
  // Only worth spelling out when the description did not already fold it in.
  const value = tiered || augment.Description?.match(/\[value\]/i)
    ? undefined
    : augmentValueAtLevel(augment, itemLevel)
  const minLevel = augment.MinLevel ?? 1

  return (
    <>
      <HoverHeader
        icon={<DdoIcon category="AugmentImages" name={augment.Icon ?? augment.Name} size={26} />}
        title={augment.Name}
        subtitle={minLevel > 1 ? `Minimum level ${minLevel}` : undefined}
      />
      <HoverBody>
        {types.length > 0 && (
          <div className={s.typeChips}>
            {types.map(t => (
              <span key={t} className={s.typeChip} style={{ color: augmentTypeColor(t) }}>
                {t}
              </span>
            ))}
          </div>
        )}
        {description && <div className={s.description}>{description}</div>}
        {value != null && (
          <div className={s.meta}>
            <span className={s.metaLabel}>At item level {itemLevel ?? 1}: </span>
            {value}
          </div>
        )}
        {tiers.length > 0 && (
          <HoverSection title="Levels">
            <div className={s.effects}>
              {tiers.map(tier => (
                <div
                  key={tier.index}
                  className={s.effectRow}
                  style={tier.index === activeIndex ? undefined : { opacity: 0.55 }}
                >
                  <span className={s.effectValue}>{tier.value >= 0 ? '+' : ''}{tier.value}</span>
                  <span className={s.effectName}>at item level {tier.level}</span>
                  {tier.index === activeIndex && <span className={s.chip}>selected</span>}
                </div>
              ))}
            </div>
          </HoverSection>
        )}
        {augment.SetBonus && (
          <div className={s.meta}>
            <span className={s.metaLabel}>Set: </span>
            {toArray(augment.SetBonus as string | string[]).join(', ')}
          </div>
        )}
      </HoverBody>
    </>
  )
}
