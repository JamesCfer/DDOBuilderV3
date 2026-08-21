// The Crafting page — every DDO crafting system in one place.
//
// Like the Plugins page, this stands apart from the builder: nothing here
// reads or writes the character you have open. It answers "what can I craft,
// and what goes into it", which is a question people arrive with *before*
// they have a build to slot the result into.
//
// The hub lists the systems as cards; opening one shows its recipes grouped
// by the slot they go in, which is the shape the in-game crafting UI uses.

import { useEffect, useMemo, useState } from 'react'
import styles from './Crafting.module.css'
import { api } from '../../api'
import type { CraftingSystemSummary, CraftingSystemDetail, CraftingCategory } from '../../server/crafting'
import CraftingSystemView from './CraftingSystemView'

/** Card order on the hub — the order people actually meet these systems in. */
const CATEGORY_ORDER: CraftingCategory[] = [
  'Craft from scratch', 'Raid crafting', 'Quest chain crafting', 'Item upgrades',
]

const CATEGORY_BLURB: Record<CraftingCategory, string> = {
  'Craft from scratch': 'Make the item yourself, at whatever level you want it.',
  'Raid crafting': 'Raid ingredients turned into the game\'s strongest planned gear.',
  'Quest chain crafting': 'Run a chain, collect its ingredients, craft the set you want.',
  'Item upgrades': 'Slots on gear you already have, filled with a choice you make once.',
}

export default function CraftingPanel() {
  const [systems, setSystems] = useState<CraftingSystemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<CraftingSystemDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    api.crafting()
      .then(res => { if (!cancelled) setSystems(res) })
      .catch(() => { if (!cancelled) setError('Could not load the crafting catalogue. Try again in a moment.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // The detail payload is the whole recipe list for one system, so it is
  // fetched only when a system is opened (and memoised by the api layer, so
  // flipping back and forth costs nothing).
  useEffect(() => {
    if (!openKey) { setDetail(null); setDetailError(null); return }
    let cancelled = false
    setDetail(null)
    setDetailError(null)
    api.craftingSystem(openKey)
      .then(res => { if (!cancelled) setDetail(res) })
      .catch(() => { if (!cancelled) setDetailError('Could not load this system\'s recipes.') })
    return () => { cancelled = true }
  }, [openKey])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return systems
    return systems.filter(s =>
      s.name.toLowerCase().includes(q)
      || s.blurb.toLowerCase().includes(q)
      || s.source.toLowerCase().includes(q)
      || s.category.toLowerCase().includes(q))
  }, [systems, query])

  const grouped = useMemo(() => CATEGORY_ORDER
    .map(category => ({ category, entries: matches.filter(s => s.category === category) }))
    .filter(group => group.entries.length > 0), [matches])

  if (openKey) {
    const summary = systems.find(s => s.key === openKey)
    return (
      <CraftingSystemView
        summary={summary}
        detail={detail}
        error={detailError}
        onBack={() => setOpenKey(null)}
      />
    )
  }

  return (
    <div className={styles.page}>
      <section className={styles.intro}>
        <div className={styles.introText}>
          <h2 className={styles.introTitle}>Crafting</h2>
          <p className={styles.introBlurb}>
            Every crafting system in DDO, with the recipes each one offers read
            straight out of the game data. This is a reference and a planner —
            it is separate from the builder, so nothing you do here touches the
            character you have open.
          </p>
          <p className={styles.introHint}>
            Pick a system to see its slots and every effect that fits them.
            Cannith Crafting has its own planner tab, because its values change
            with the level you craft at.
          </p>
        </div>
        <a
          className={styles.wikiLink}
          href="https://ddowiki.com/page/Crafting"
          target="_blank"
          rel="noreferrer"
        >
          Crafting on DDO wiki ↗
        </a>
      </section>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search systems — greensteel, raid, Shroud, augment…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search crafting systems"
        />
        {systems.length > 0 && (
          <span className={styles.count}>
            {matches.length} of {systems.length} systems
          </span>
        )}
      </div>

      {loading && <p className={styles.status}>Loading the crafting catalogue…</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!loading && !error && matches.length === 0 && (
        <p className={styles.status}>Nothing matches “{query}”.</p>
      )}

      {grouped.map(({ category, entries }) => (
        <section key={category} className={styles.categoryBlock}>
          <h3 className={styles.categoryTitle}>{category}</h3>
          <p className={styles.categoryBlurb}>{CATEGORY_BLURB[category]}</p>
          <div className={styles.grid}>
            {entries.map(system => (
              <SystemCard key={system.key} system={system} onOpen={() => setOpenKey(system.key)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function SystemCard({ system, onOpen }: { system: CraftingSystemSummary; onOpen: () => void }) {
  return (
    <article className={styles.card}>
      <button type="button" className={styles.cardOpen} onClick={onOpen}>
        <h4 className={styles.cardTitle}>{system.name}</h4>
        <p className={styles.cardBlurb}>{system.blurb}</p>
      </button>
      <dl className={styles.cardFacts}>
        <div><dt>From</dt><dd>{system.source}</dd></div>
        <div><dt>Costs</dt><dd>{system.ingredients}</dd></div>
      </dl>
      <div className={styles.cardFoot}>
        <span className={styles.tags}>
          <span className={styles.tag}>{system.recipeCount} recipes</span>
          <span className={styles.tag}>{system.slotCount} slots</span>
          {system.minLevel != null && (
            <span className={styles.tag}>
              {system.minLevel === system.maxLevel
                ? `ML ${system.minLevel}`
                : `ML ${system.minLevel}–${system.maxLevel}`}
            </span>
          )}
        </span>
        <button type="button" className={styles.openBtn} onClick={onOpen}>
          Open →
        </button>
      </div>
    </article>
  )
}
