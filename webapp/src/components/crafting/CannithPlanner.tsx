// Cannith Crafting planner.
//
// Cannith is the one system where browsing the recipe list is not enough to
// plan with, because almost every shard's value depends on the level you
// craft the item at: "Balance" is +3 on a level 1 blank and +22 by level 34.
// V2 stores that as a per-level table on the shard (`<LevelValue>`, indexed
// by item level - 1), and the planner's job is simply to ask the two
// questions the table needs — which item, and at what level — and then show
// the real numbers instead of a name.
//
// The three shard kinds (prefix, suffix, extra) sit side by side because
// that is the actual decision: one of each goes on the item, and the item is
// finished. Picking one in each column builds the summary at the bottom.

import { useEffect, useMemo, useState } from 'react'
import styles from './Crafting.module.css'
import { api } from '../../api'
import type { CraftingSystemDetail, CraftingRecipe } from '../../server/crafting'

/** The three shard kinds every craftable slot family is built from. */
const PARTS = ['Prefix', 'Suffix', 'Extra'] as const
type Part = typeof PARTS[number]

/** Where a slot family's effects come from — crafted, or rolled by the game. */
type Source = 'Cannith' | 'Random'

const SOURCE_BLURB: Record<Source, string> = {
  Cannith: 'Shards you craft and bind yourself at a Cannith altar.',
  Random: 'The same effect tables the game rolls on random loot — useful for '
    + 'judging whether a dropped item beats what you could craft.',
}

/**
 * One slot type, decomposed. "Cannith Boots Prefix" → source Cannith, kind
 * Boots, part Prefix. Slots that are neither prefix, suffix nor extra
 * ("Cannith Armor AC Bonus") keep their own label and are grouped separately,
 * because they are per-item properties rather than one of the three shards.
 */
export interface ParsedSlot {
  type: string
  source: Source
  kind: string
  part: Part | null
  /** For non-shard slots, the property name ("AC Bonus"). */
  label: string
}

export function parseSlots(detail: CraftingSystemDetail): ParsedSlot[] {
  const parsed: ParsedSlot[] = []

  // Pass one: the unambiguous "<source> <kind> <part>" slots. These also
  // establish the vocabulary of item kinds — deriving it from the data beats
  // hardcoding a list that goes stale the next time a slot family is added.
  const kinds = new Set<string>()
  for (const slot of detail.slots) {
    const match = /^(Cannith|Random) (.+) (Prefix|Suffix|Extra)$/.exec(slot.type)
    if (!match) continue
    kinds.add(match[2])
    parsed.push({
      type: slot.type,
      source: match[1] as Source,
      kind: match[2],
      part: match[3] as Part,
      label: match[3],
    })
  }

  // Pass two: the property slots ("Cannith Armor AC Bonus"), matched against
  // the vocabulary pass one established. A slot naming no known kind is
  // dropped rather than inventing a dropdown entry for itself — the item
  // picker must list items, not stray property names.
  for (const slot of detail.slots) {
    if (parsed.some(p => p.type === slot.type)) continue
    const match = /^(Cannith|Random) (.+)$/.exec(slot.type)
    if (!match) continue
    const source = match[1] as Source
    const rest = match[2]
    const kind = matchKind(rest, kinds)
    if (!kind) continue
    parsed.push({
      type: slot.type,
      source,
      kind,
      part: null,
      // Only trim the kind off the front when it *is* the front: stripping
      // "Shield" out of the middle of "Tower Shield Max Dex Bonus" would
      // leave a label that reads like a typo.
      label: rest.startsWith(kind) ? rest.slice(kind.length).trim() : rest,
    })
  }

  return parsed
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The item kind a property slot belongs to.
 *
 * Longest match wins, so "Rune Arm Extra" is not read as "Rune". Leading
 * matches are preferred, but a kind named anywhere in the slot still counts:
 * "Tower Shield Max Dex Bonus" is a property of a shield, and dropping it
 * because the word "Tower" comes first would hide it entirely.
 */
function matchKind(rest: string, kinds: Set<string>): string | undefined {
  const byLength = [...kinds].sort((a, b) => b.length - a.length)
  return byLength.find(k => rest === k || rest.startsWith(`${k} `))
    ?? byLength.find(k => new RegExp(`\\b${escapeRegExp(k)}\\b`).test(rest))
}

/**
 * A shard's value at an item level.
 *
 * V2 reads `LevelValue[itemLevel - 1]` and clamps to the table (Build.cpp's
 * augment loop) — a level past the end of the table keeps the top value
 * rather than falling off it.
 */
export function valueAtLevel(recipe: CraftingRecipe, level: number): number | null {
  if (recipe.values.length === 0) return null
  // Recipes with an explicit <Levels> table let the player pick the tier, so
  // the right entry is the best one at or below this level.
  if (recipe.levels.length > 0) {
    let best: number | null = null
    for (let i = 0; i < recipe.levels.length && i < recipe.values.length; i++) {
      if (recipe.levels[i] <= level) best = recipe.values[i]
    }
    return best
  }
  const index = Math.min(Math.max(0, level - 1), recipe.values.length - 1)
  return recipe.values[index]
}

/** Highest level any of this system's tables actually covers. */
function maxPlannableLevel(detail: CraftingSystemDetail | null): number {
  if (!detail) return 34
  const longest = detail.slots.reduce((max, slot) =>
    slot.recipes.reduce((m, r) => Math.max(m, r.values.length), max), 0)
  return Math.max(longest, 1)
}

/**
 * A shard value with its sign. Some Cannith effects are deliberately negative
 * — Diversion reduces threat — and a blanket "+" prefix rendered those as
 * "+-21".
 */
export function formatValue(value: number): string {
  return value < 0 ? String(value) : `+${value}`
}

export default function CannithPlanner() {
  const [detail, setDetail] = useState<CraftingSystemDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<Source>('Cannith')
  const [kind, setKind] = useState<string>('Boots')
  const [level, setLevel] = useState(30)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Partial<Record<Part, string>>>({})

  useEffect(() => {
    let cancelled = false
    api.craftingSystem('cannith')
      .then(res => { if (!cancelled) setDetail(res) })
      .catch(() => { if (!cancelled) setError('Could not load the Cannith shard tables.') })
    return () => { cancelled = true }
  }, [])

  const slots = useMemo(() => (detail ? parseSlots(detail) : []), [detail])
  const maxLevel = useMemo(() => maxPlannableLevel(detail), [detail])

  const kindsForSource = useMemo(() => {
    const set = new Set(slots.filter(s => s.source === source).map(s => s.kind))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [slots, source])

  // Switching source can strand the selected kind (some families are Cannith-
  // only). Fall back to the first one the new source offers.
  useEffect(() => {
    if (kindsForSource.length > 0 && !kindsForSource.includes(kind)) setKind(kindsForSource[0])
  }, [kindsForSource, kind])

  // Changing what is being crafted invalidates the shards chosen for it.
  useEffect(() => { setPicked({}) }, [kind, source])

  const recipesFor = useMemo(() => {
    const byType = new Map(detail?.slots.map(s => [s.type, s.recipes]) ?? [])
    const q = query.trim().toLowerCase()
    const filter = (list: CraftingRecipe[]) => (q
      ? list.filter(r => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      : list)
    return (part: Part): CraftingRecipe[] => {
      const slot = slots.find(s => s.source === source && s.kind === kind && s.part === part)
      return slot ? filter(byType.get(slot.type) ?? []) : []
    }
  }, [detail, slots, source, kind, query])

  const extraSlots = useMemo(
    () => slots.filter(s => s.source === source && s.kind === kind && s.part === null),
    [slots, source, kind])

  const chosen = useMemo(() => PARTS
    .map(part => {
      const name = picked[part]
      if (!name) return null
      const recipe = recipesFor(part).find(r => r.name === name)
        // A search that hides the picked shard must not erase it from the
        // summary — look past the filter for it.
        ?? detail?.slots
          .find(s => s.type === slots.find(p =>
            p.source === source && p.kind === kind && p.part === part)?.type)
          ?.recipes.find(r => r.name === name)
      return recipe ? { part, recipe } : null
    })
    .filter((x): x is { part: Part; recipe: CraftingRecipe } => x !== null),
  [picked, recipesFor, detail, slots, source, kind])

  if (error) return <p className={styles.error}>{error}</p>
  if (!detail) return <p className={styles.status}>Loading the Cannith shard tables…</p>

  return (
    <div className={styles.page}>
      <section className={styles.intro}>
        <div className={styles.introText}>
          <h2 className={styles.introTitle}>Cannith Crafting Planner</h2>
          <p className={styles.introBlurb}>
            Choose the item and the level you want to craft at, and every shard
            shows what it is actually worth there. A crafted item takes one
            prefix and one suffix, plus an extra effect on most slots.
          </p>
        </div>
        <a
          className={styles.wikiLink}
          href="https://ddowiki.com/page/Cannith_Crafting"
          target="_blank"
          rel="noreferrer"
        >
          Cannith Crafting on DDO wiki ↗
        </a>
      </section>

      <section className={styles.controls}>
        <label className={styles.control}>
          <span className={styles.controlLabel}>Effect tables</span>
          <select
            className={styles.select}
            value={source}
            onChange={e => setSource(e.target.value as Source)}
          >
            <option value="Cannith">Cannith shards</option>
            <option value="Random">Random loot</option>
          </select>
        </label>

        <label className={styles.control}>
          <span className={styles.controlLabel}>Item</span>
          <select className={styles.select} value={kind} onChange={e => setKind(e.target.value)}>
            {kindsForSource.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>

        <label className={`${styles.control} ${styles.levelControl}`}>
          <span className={styles.controlLabel}>Crafted at item level {level}</span>
          <input
            className={styles.slider}
            type="range"
            min={1}
            max={maxLevel}
            value={level}
            onChange={e => setLevel(Number(e.target.value))}
          />
        </label>

        <label className={styles.control}>
          <span className={styles.controlLabel}>Filter effects</span>
          <input
            className={styles.search}
            type="search"
            placeholder="strength, doublestrike…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
      </section>

      <p className={styles.sourceNote}>{SOURCE_BLURB[source]}</p>

      <div className={styles.shardColumns}>
        {PARTS.map(part => {
          const recipes = recipesFor(part)
          return (
            <section key={part} className={styles.shardColumn}>
              <h3 className={styles.shardTitle}>
                {part}
                <span className={styles.slotCount}>{recipes.length}</span>
              </h3>
              {recipes.length === 0 ? (
                <p className={styles.status}>
                  {query.trim() ? 'No match here.' : `${kind} has no ${part.toLowerCase()} slot.`}
                </p>
              ) : (
                <ul className={styles.shardList}>
                  {recipes.map(recipe => {
                    const value = valueAtLevel(recipe, level)
                    const isPicked = picked[part] === recipe.name
                    return (
                      <li key={recipe.name}>
                        <button
                          type="button"
                          className={`${styles.shard} ${isPicked ? styles.shardPicked : ''}`}
                          onClick={() => setPicked(p => ({
                            ...p, [part]: isPicked ? undefined : recipe.name,
                          }))}
                          aria-pressed={isPicked}
                        >
                          <span className={styles.shardName}>{recipe.name}</span>
                          {value != null && (
                            <span className={styles.shardValue}>{formatValue(value)}</span>
                          )}
                          {recipe.description && (
                            <span className={styles.shardDesc}>{recipe.description}</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {extraSlots.length > 0 && (
        <section className={styles.propertyBlock}>
          <h3 className={styles.shardTitle}>Item properties</h3>
          <p className={styles.categoryBlurb}>
            Crafted as part of the {kind.toLowerCase()} itself rather than as one
            of the three shards.
          </p>
          <div className={styles.propertyTags}>
            {extraSlots.map(slot => (
              <span key={slot.type} className={styles.tag}>{slot.label || slot.type}</span>
            ))}
          </div>
        </section>
      )}

      <section className={styles.result}>
        <h3 className={styles.shardTitle}>Your {kind.toLowerCase()} at level {level}</h3>
        {chosen.length === 0 ? (
          <p className={styles.status}>Pick a shard from the columns above to build it up.</p>
        ) : (
          <>
            <ul className={styles.resultList}>
              {chosen.map(({ part, recipe }) => {
                const value = valueAtLevel(recipe, level)
                return (
                  <li key={part} className={styles.resultRow}>
                    <span className={styles.resultPart}>{part}</span>
                    <span className={styles.resultName}>{recipe.name}</span>
                    {value != null && (
                      <span className={styles.shardValue}>{formatValue(value)}</span>
                    )}
                    <span className={styles.resultDesc}>{recipe.description}</span>
                  </li>
                )
              })}
            </ul>
            <p className={styles.resultNote}>
              Minimum level {level}. Crafting at a lower level costs less and
              lowers every value on the item together — the slider is the whole
              trade-off.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
