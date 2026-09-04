// itemDisplay — presentation helpers shared by the gear hover cards, the item
// picker and Find Gear.
//
// Item <Buff> entries name WHAT they boost in a separate field from the buff
// Type: "AbilityBonus" with <Item>Intelligence</Item> is "+15 Intelligence",
// not "+15 AbilityBonus". V2 resolves this through ItemBuffs.xml's DisplayText
// template (Buff::MakeDescription, Buff.cpp:111-170, substituting %v1/%b1/%i1);
// we do the same substitution for the prose line and additionally derive a
// short structured label for the effect tables.

import type { Item, ItemBuff, Augment } from '../types/ddo'

// ---------------------------------------------------------------------------
// Buff labels
// ---------------------------------------------------------------------------

/** Target values that name nothing useful — V2's placeholder/"applies to every
 *  weapon" markers, which must not end up in a display label. */
const NOISE_TARGETS = new Set(['', 'All', 'Unknown', 'Not Set', 'None'])

/** "AbilityBonus" → "Ability Bonus", "SpellCriticalDamage" → "Spell Critical Damage". */
export function humanizeBuffType(type: string): string {
  return type
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

function cleanTarget(raw: unknown): string | undefined {
  if (raw == null) return undefined
  const parts = (Array.isArray(raw) ? raw : [raw])
    .map(v => String(v).trim())
    .filter(v => !NOISE_TARGETS.has(v))
  return parts.length > 0 ? parts.join(' / ') : undefined
}

/**
 * The stat this buff names, if any. V2 substitutes %i1 from <Description1>
 * first and falls back to <Item> (Buff.cpp:148-156) — right for flavour text,
 * but on the stat-targeted types <Description1> sometimes carries the tier
 * numeral ("II") while <Item> carries the actual school, so those prefer
 * <Item>. Either way the "All"/"Unknown" placeholders that weapon buffs use as
 * an applies-to filter are dropped.
 */
export function buffTarget(buff: ItemBuff): string | undefined {
  const fromItem = cleanTarget(buff.Item)
  const fromDesc = cleanTarget(buff.Description1)
  return buff.Type in TARGETED_TYPES
    ? (fromItem ?? fromDesc)
    : (fromDesc ?? fromItem)
}

/**
 * Buff types whose target IS the stat, and how to read the pair back as one
 * name. Anything not listed keeps the humanized type and appends the target in
 * parentheses (e.g. "Wizardry (IX)"), which is how the numeral-tier buffs read.
 */
const TARGETED_TYPES: Record<string, (target: string) => string> = {
  AbilityBonus: t => t,
  SkillBonus: t => t,
  SkillBonusAbility: t => `${t} Skills`,
  SaveBonus: t => `${t} Save`,
  SpellPower: t => `${t} Spell Power`,
  SpellCriticalChance: t => `${t} Spell Critical Chance`,
  SpellCriticalDamage: t => `${t} Spell Critical Damage`,
  SpellLore: t => `${t} Lore`,
  SpellDC: t => `${t} Spell DC`,
  SchoolFocusNumber: t => `${t} Spell DC`,
  TacticalDC: t => `${t} DC`,
  EnergyResistance: t => `${t} Resistance`,
  EnergyAbsorbance: t => `${t} Absorption`,
  Absorption: t => `${t} Absorption`,
  DRBypass: t => `${t} Bypass`,
  Immunity: t => `${t} Immunity`,
}

export interface BuffDisplay {
  /** What the buff boosts, e.g. "Intelligence" or "Acid Resistance". */
  label: string
  /** Stacking category, e.g. "Enhancement" / "Insightful" / "Quality". */
  bonusType?: string
  /** Rendered magnitude ("+15", "+12/+18", "15%"), or undefined when the buff
   *  carries no value of its own (Vorpal, Ghost Touch, …). */
  value?: string
  percent: boolean
}

function flagged(v: unknown): boolean {
  return v === true || v === '' || v === 'true'
}

function magnitude(buff: ItemBuff): string | undefined {
  const pct = flagged(buff.Percent) ? '%' : ''
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n}${pct}`
  if (buff.Value1 == null) return undefined
  if (buff.Value2 != null && buff.Value2 !== buff.Value1) {
    return `${fmt(buff.Value1)}/${fmt(buff.Value2)}`
  }
  return fmt(buff.Value1)
}

/** Structured, human-readable view of one item <Buff>. */
export function describeBuff(buff: ItemBuff): BuffDisplay {
  const target = buffTarget(buff)
  const human = humanizeBuffType(buff.Type)
  let label: string
  if (target == null) {
    label = human
  } else if (TARGETED_TYPES[buff.Type]) {
    label = TARGETED_TYPES[buff.Type](target)
  } else if (target.toLowerCase() === buff.Type.toLowerCase()) {
    label = human
  } else {
    label = `${human} (${target})`
  }
  return {
    label,
    bonusType: buff.BonusType && buff.BonusType.trim() !== '' ? buff.BonusType.trim() : undefined,
    value: magnitude(buff),
    percent: flagged(buff.Percent),
  }
}

/** One-line plain-text form, for `title=` fallbacks and text-only tables. */
export function formatBuffText(buff: ItemBuff): string {
  const d = describeBuff(buff)
  const val = d.value ? `${d.value} ` : ''
  const bonus = d.bonusType ? ` (${d.bonusType})` : ''
  return `${val}${d.label}${bonus}`
}

function toBuffArray(val: ItemBuff | ItemBuff[] | undefined): ItemBuff[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

/** The item's <Buff> entries, normalised to an array. */
export function itemBuffs(item: Item): ItemBuff[] {
  return toBuffArray(item.Buff as ItemBuff | ItemBuff[] | undefined)
}

/**
 * One line per effect, exactly as the hover card reads them
 * ("+15 Intelligence (Enhancement)"). Used both for the picker's effect line
 * and, lower-cased, as part of what a search query is matched against.
 */
export function itemEffectLines(item: Item): string[] {
  return itemBuffs(item).map(formatBuffText)
}

// Picker tiles re-render as the grid pages in, and the summary is the same
// every time: build it once per catalogue entry. A WeakMap keeps nothing
// alive beyond the catalogue itself.
const summaries = new WeakMap<Item, string>()

/** The item's effects as one comma-separated line, for compact lists. */
export function itemEffectsSummary(item: Item): string {
  const cached = summaries.get(item)
  if (cached !== undefined) return cached
  const text = itemEffectLines(item).join(', ')
  summaries.set(item, text)
  return text
}

/** Everything one buff can be searched by: its display line, its raw
 *  <Type> (so the "AbilityBonus" style names still match), its stacking
 *  category and its target stat. */
export function buffSearchText(buff: ItemBuff): string {
  const d = describeBuff(buff)
  return [formatBuffText(buff), buff.Type, humanizeBuffType(buff.Type), d.bonusType, buffTarget(buff)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// Augment slot colours
// ---------------------------------------------------------------------------

/**
 * Augment slot types get the colour the game paints them, so a slot list reads
 * at a glance. Exact names first, then family prefixes for the large generated
 * groups (Cannith crafting, Random loot, Reaper, …).
 */
const AUGMENT_COLORS: Record<string, string> = {
  Colorless: '#d9dcea',
  Blue: '#4f9ae8',
  Green: '#3fbf72',
  Yellow: '#e3ca4c',
  Orange: '#e58c3c',
  Purple: '#a878e6',
  Red: '#e35b5b',
  Sun: '#f2c744',
  Moon: '#9db8ea',
  Mythic: '#e0a53c',
  'Incredible Potential': '#e08ce8',
  'Leashed Power': '#c98ce8',
  'Trace of Madness': '#b06a9c',
  'Planar Searing': '#ff8a5c',
  'Eldritch Rune': '#c88a4a',
  'Sovereign Rune': '#d4a34a',
  'Tempest Rune': '#6fc3d4',
}

const AUGMENT_COLOR_PREFIXES: Array<[string, string]> = [
  ['Cannith', '#5fb8b0'],
  ['Random', '#8890b0'],
  ['Reaper', '#c04a6a'],
  ['Legendary Alchemical', '#7fd6a0'],
  ['Alchemical', '#7fd6a0'],
  ['Thunderforged', '#7fa8ff'],
  ['Legendary Slavelords', '#b08cd8'],
  ['Slavelords', '#b08cd8'],
  ['Greensteel', '#6fbf5a'],
  ['IoD:', '#cf7a3a'],
  ['Nearly Complete', '#9aa8c8'],
  ['Shadow', '#79809e'],
  ['Deck Curse', '#b06060'],
  ['Set Bonus', '#d4982a'],
  ['Equipment Tier', '#9aa8c8'],
  // Vecna Unleashed sorrow-themed slots
  ['Melancholic', '#8f7fd0'],
  ['Dolorous', '#8f7fd0'],
  ['Miserable', '#8f7fd0'],
  ['Woeful', '#8f7fd0'],
]

/** CSS colour for an augment slot type; undefined types fall back to muted text. */
export function augmentTypeColor(type: string | undefined): string {
  if (!type) return 'var(--color-text-muted)'
  const key = type.trim()
  const exact = AUGMENT_COLORS[key]
  if (exact) return exact
  for (const [prefix, color] of AUGMENT_COLOR_PREFIXES) {
    if (key.startsWith(prefix)) return color
  }
  return 'var(--color-text-secondary)'
}

// ---------------------------------------------------------------------------
// Augment descriptions
// ---------------------------------------------------------------------------

/** Parses V2's space-separated numeric tables (`<Levels>`, `<LevelValue>`). */
function numberTable(raw: unknown): number[] {
  if (raw == null) return []
  const text = typeof raw === 'object' && raw !== null && '#text' in (raw as Record<string, unknown>)
    ? String((raw as Record<string, unknown>)['#text'] ?? '')
    : String(raw)
  return text.trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
}

/** V2 Augment::LevelValue — a space-separated per-level table. */
export function augmentLevelValues(aug: Augment): number[] {
  return numberTable(aug.LevelValue)
}

/**
 * V2 Augment::Levels — the item level each LevelValue entry belongs to. Only
 * the gem augments carry it; those are the ones the player picks a tier for.
 */
export function augmentLevels(aug: Augment): number[] {
  return numberTable(aug.Levels)
}

/** True when this augment's tier is the player's choice rather than the item's
 *  level (V2: PopulateAugmentList shows the level combo only for HasLevels). */
export function hasSelectableLevels(aug: Augment): boolean {
  return augmentLevels(aug).length > 0 && augmentLevelValues(aug).length > 0
}

export interface AugmentLevelOption {
  /** Index into LevelValue — what V2 stores as ItemAugment::SelectedLevelIndex. */
  index: number
  /** The item level this tier requires. */
  level: number
  /** The effect amount at this tier. */
  value: number
}

/**
 * Selectable tiers, capped to what the character can actually use — V2 only
 * lists levels <= the build level (ItemSelectDialog.cpp:573).
 */
export function augmentLevelOptions(aug: Augment, maxLevel?: number): AugmentLevelOption[] {
  const levels = augmentLevels(aug)
  const values = augmentLevelValues(aug)
  const out: AugmentLevelOption[] = []
  for (let i = 0; i < levels.length && i < values.length; i++) {
    if (maxLevel != null && levels[i] > maxLevel) continue
    out.push({ index: i, level: levels[i], value: values[i] })
  }
  return out
}

/** The best tier usable at a level — the default when the player picks one. */
export function bestAugmentLevelIndex(aug: Augment, maxLevel?: number): number {
  const options = augmentLevelOptions(aug, maxLevel)
  if (options.length > 0) return options[options.length - 1].index
  // Nothing is usable at this level; fall back to the lowest tier.
  return 0
}

/** The effect amount at a stored SelectedLevelIndex. */
export function augmentValueAtIndex(aug: Augment, index: number): number | undefined {
  const values = augmentLevelValues(aug)
  if (values.length === 0) return undefined
  return values[Math.min(Math.max(0, index), values.length - 1)]
}

/**
 * The augment's value at a host item level, mirroring the index fallback in
 * buildStats' augment loop (LevelValue[itemLevel - 1], clamped).
 */
export function augmentValueAtLevel(aug: Augment, itemLevel?: number): number | undefined {
  const table = augmentLevelValues(aug)
  if (table.length === 0) return undefined
  const idx = Math.min(Math.max(0, (itemLevel ?? 1) - 1), table.length - 1)
  return table[idx]
}

/** Augment description with the `[value]` placeholder resolved for a level. */
export function augmentDescription(aug: Augment, itemLevel?: number): string | undefined {
  if (!aug.Description) return undefined
  const value = augmentValueAtLevel(aug, itemLevel)
  if (value == null) return aug.Description
  return aug.Description.replace(/\[value\]/gi, String(value))
}

export function augmentTypes(aug: Augment): string[] {
  const t = aug.Type
  if (t == null) return []
  return (Array.isArray(t) ? t : [t]).filter(Boolean)
}
