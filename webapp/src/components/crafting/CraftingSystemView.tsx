// One crafting system, opened: what it is, where it comes from, and every
// recipe it offers grouped by the slot it goes in.
//
// Slot-first is deliberate. Crafting in game is a sequence of "this slot is
// empty — what can I put in it" decisions, and several systems (Alchemical,
// Legendary Green Steel, Thunder-Forged) only open a slot once you have
// filled the one before it. Listing recipes flat would lose that order; the
// server hands the slots back already sequenced, and a recipe that unlocks a
// further slot says so.

import { useMemo, useState } from 'react'
import styles from './Crafting.module.css'
import type { CraftingSystemSummary, CraftingSystemDetail, CraftingRecipe } from '../../server/crafting'

interface Props {
  summary: CraftingSystemSummary | undefined
  detail: CraftingSystemDetail | null
  error: string | null
  onBack: () => void
}

export default function CraftingSystemView({ summary, detail, error, onBack }: Props) {
  const [query, setQuery] = useState('')
  const [openSlot, setOpenSlot] = useState<string | null>(null)

  const meta = detail ?? summary

  // Filtering across slots rather than within one: someone looking for
  // "doublestrike" wants to know which slot can give it, not to search each
  // slot in turn.
  const slots = useMemo(() => {
    if (!detail) return []
    const q = query.trim().toLowerCase()
    if (!q) return detail.slots
    return detail.slots
      .map(slot => ({
        ...slot,
        recipes: slot.recipes.filter(r =>
          r.name.toLowerCase().includes(q)
          || r.description.toLowerCase().includes(q)
          || r.setBonuses.some(s => s.toLowerCase().includes(q))),
      }))
      .filter(slot => slot.recipes.length > 0 || slot.type.toLowerCase().includes(q))
  }, [detail, query])

  const searching = query.trim().length > 0
  const hits = slots.reduce((n, s) => n + s.recipes.length, 0)

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backBtn} onClick={onBack}>
        ← All crafting systems
      </button>

      {meta && (
        <section className={styles.systemHead}>
          <div className={styles.systemHeadText}>
            <h2 className={styles.systemTitle}>{meta.name}</h2>
            <span className={styles.categoryPill}>{meta.category}</span>
            <p className={styles.systemDetail}>{meta.detail}</p>
          </div>
          <dl className={styles.systemFacts}>
            <div><dt>Where</dt><dd>{meta.where}</dd></div>
            <div><dt>Ingredients</dt><dd>{meta.ingredients}</dd></div>
            <div><dt>Base items from</dt><dd>{meta.source}</dd></div>
            {meta.minLevel != null && (
              <div>
                <dt>Recipe levels</dt>
                <dd>
                  {meta.minLevel === meta.maxLevel
                    ? `ML ${meta.minLevel}`
                    : `ML ${meta.minLevel}–${meta.maxLevel}`}
                </dd>
              </div>
            )}
            <div>
              <dt>Reference</dt>
              <dd><a href={meta.wiki} target="_blank" rel="noreferrer">DDO wiki ↗</a></dd>
            </div>
          </dl>
        </section>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {!detail && !error && <p className={styles.status}>Loading recipes…</p>}

      {detail && (
        <>
          <div className={styles.searchRow}>
            <input
              className={styles.search}
              type="search"
              placeholder={`Search ${detail.recipeCount} recipes — an effect, a set bonus…`}
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label={`Search ${detail.name} recipes`}
            />
            <span className={styles.count}>
              {searching
                ? `${hits} matching recipe${hits === 1 ? '' : 's'}`
                : `${detail.recipeCount} recipes across ${detail.slotCount} slots`}
            </span>
          </div>

          {slots.length === 0 && (
            <p className={styles.status}>No recipe matches “{query}”.</p>
          )}

          {slots.map(slot => (
            <SlotSection
              key={slot.type}
              type={slot.type}
              recipes={slot.recipes}
              // While searching, every section stands open: hiding the hits
              // behind a second click defeats the search.
              open={searching || openSlot === slot.type}
              onToggle={() => setOpenSlot(cur => (cur === slot.type ? null : slot.type))}
            />
          ))}
        </>
      )}
    </div>
  )
}

function SlotSection({ type, recipes, open, onToggle }: {
  type: string
  recipes: CraftingRecipe[]
  open: boolean
  onToggle: () => void
}) {
  return (
    <section className={styles.slotSection}>
      <button type="button" className={styles.slotHeader} onClick={onToggle} aria-expanded={open}>
        <span className={styles.slotCaret}>{open ? '▾' : '▸'}</span>
        <span className={styles.slotName}>{type}</span>
        <span className={styles.slotCount}>{recipes.length}</span>
      </button>
      {open && (
        <ul className={styles.recipeList}>
          {recipes.map((recipe, i) => (
            <RecipeRow key={`${recipe.name}-${i}`} recipe={recipe} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RecipeRow({ recipe }: { recipe: CraftingRecipe }) {
  return (
    <li className={styles.recipe}>
      <div className={styles.recipeHead}>
        <span className={styles.recipeName}>{recipe.name}</span>
        {recipe.minLevel > 0 && <span className={styles.recipeLevel}>ML {recipe.minLevel}</span>}
      </div>
      {recipe.description && <p className={styles.recipeDesc}>{recipe.description}</p>}
      <div className={styles.recipeMeta}>
        {recipe.setBonuses.map(set => (
          <span key={set} className={styles.setTag} title="Adds this set bonus to the item">
            Set: {set}
          </span>
        ))}
        {recipe.unlocks.map(slot => (
          <span key={slot} className={styles.unlockTag} title="Choosing this opens a further slot on the item">
            Unlocks: {slot}
          </span>
        ))}
        {recipe.scalesWithLevel && (
          <span className={styles.scaleTag} title={levelTableTitle(recipe)}>
            Scales with item level ({recipe.values[0]}–{recipe.values[recipe.values.length - 1]})
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * The whole per-level table as tooltip text.
 *
 * `Levels` is present on the recipes where the player picks the tier; where
 * it is absent the table is indexed by item level, so entry *n* is level *n*
 * (V2 reads `LevelValue[itemLevel - 1]`).
 */
function levelTableTitle(recipe: CraftingRecipe): string {
  const rows = recipe.values.map((value, i) => {
    const level = recipe.levels[i] ?? i + 1
    return `ML ${level}: ${value}`
  })
  return rows.join('\n')
}
