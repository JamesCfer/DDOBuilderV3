// Grouped item-type <select> shared by the gear slot picker and the
// cross-slot Find Gear dialog. Options are derived from the items actually on
// offer (see lib/itemFilters.ts), so a slot never lists a type it can't show.

import type { ItemTypeOptionGroup } from '../../lib/itemFilters'

interface ItemTypeSelectProps {
  value: string
  onChange: (value: string) => void
  optionGroups: ItemTypeOptionGroup[]
  /** Class for the <select> itself, so each dialog keeps its own styling. */
  className?: string
  /** Label shown for "no type filter". */
  anyLabel?: string
}

export default function ItemTypeSelect({
  value,
  onChange,
  optionGroups,
  className,
  anyLabel = 'Any type',
}: ItemTypeSelectProps) {
  return (
    <select
      className={className}
      value={value}
      onChange={e => onChange(e.target.value)}
      title="Filter by item type — weapon type, shield, armor class or Minor Artifact"
    >
      <option value="">{anyLabel}</option>
      {optionGroups.map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
