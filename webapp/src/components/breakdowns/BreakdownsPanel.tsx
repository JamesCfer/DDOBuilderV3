import { Fragment, useState, useRef, useCallback, useMemo } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import type { ResolvedBonus } from '../../lib/bonus'
import { SPELL_POWER_TYPES, SPELL_POWER_LABELS } from '../../lib/gamedata'
import { useFavorites } from '../../lib/favoritesStore'
import { buildBreakdownSections, indexSectionRows } from './breakdownSections'
import { Tooltip, Section, StatRow, sign, type TipState, type StatRowData } from './statRows'
import styles from './BreakdownsPanel.module.css'

// Row construction lives in ./breakdownSections (shared with FavoritesDock);
// the presentational pieces (Tooltip / Section / StatRow) in ./statRows.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
type Ab = typeof ABILITIES[number]
const AB3: Record<Ab, string> = {
  Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
  Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function abMod(score: number) { return Math.floor((score - 10) / 2) }
function pct(n: number)       { return n + '%' }
function mult(n: number)      { return '×' + n.toFixed(1).replace(/\.0$/, '') }

// ---------------------------------------------------------------------------
// Spell power grid row
// ---------------------------------------------------------------------------

function SpellPowerRow({ name, spKey, stats, onTip }: {
  name: string
  spKey: string
  stats: ReturnType<typeof useBuildStats>
  onTip: (t: TipState | null) => void
}) {
  const power    = stats.total(`sp.${spKey}`) + stats.total('sp.Universal')
  const critPct  = 5 + stats.total(`spCrit.${spKey}`) + stats.total('spCrit.Universal')
  const critMult = 1.5  // base; no data yet for crit mult enhancers

  const spBonuses = [
    ...stats.resolve(`sp.${spKey}`).bonuses,
    ...stats.resolve('sp.Universal').bonuses,
  ]
  const critBonuses: ResolvedBonus[] = [
    { value: 5, type: 'Base', source: 'Base threat (20)', active: true },
    ...stats.resolve(`spCrit.${spKey}`).bonuses,
    ...stats.resolve('spCrit.Universal').bonuses,
  ]
  const multBonuses: ResolvedBonus[] = [
    { value: 1.5, type: 'Base', source: 'Base critical multiplier', active: true },
  ]

  function cell(display: string, label: string, bonuses: ResolvedBonus[]) {
    return (
      <td
        className={`${styles.spCell} ${power === 0 && bonuses.length <= 1 ? styles.spCellDim : ''}`}
        onMouseEnter={e => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          onTip({ label: `${name} — ${label}`, display, bonuses, x: r.right, y: r.top })
        }}
        onMouseLeave={() => onTip(null)}
      >
        {display}
      </td>
    )
  }

  return (
    <tr className={styles.spRow}>
      <td className={styles.spName}>{name}</td>
      {cell(String(power),      'Power',       spBonuses)}
      {cell(pct(critPct),       'Crit Chance', critBonuses)}
      {cell(mult(critMult),     'Crit Mult',   multBonuses)}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BreakdownsPanel() {
  const { build } = useCharacter()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const [tip, setTip] = useState<TipState | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Favorite (starred) stat rows, pinned in a section at the top and mirrored
  // in the app-wide FavoritesDock. Keys are "Section/Label"; shared store,
  // persisted per-browser (not per-build) in localStorage.
  const [favorites, toggleFavorite] = useFavorites()

  const hideTip = useCallback(() => setTip(null), [])

  // ── Build stats ──────────────────────────────────────────────────────────
  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)

  // ── Sections (shared builder) ────────────────────────────────────────────
  const sections = buildBreakdownSections(stats, build, bundle.allClasses)
  const rowIndex = indexSectionRows(sections)

  const hasCharacter = build.race || build.classes.some(c => c.name)

  function renderRows(section: string, rows: StatRowData[]) {
    return rows.map(s => {
      const key = `${section}/${s.label}`
      return (
        <StatRow
          key={s.label + (s.indent ? '-sub' : '')}
          stat={s}
          onTip={setTip}
          favKey={key}
          starred={favorites.includes(key)}
          onToggleStar={toggleFavorite}
        />
      )
    })
  }

  const spellPowerSection = (
    <Section title="Spell Powers">
      <div className={styles.spNote}>Hover any value to see sources.</div>
      <table className={styles.spTable}>
        <thead>
          <tr>
            <th className={styles.spName}>Type</th>
            <th className={styles.spHead}>Power</th>
            <th className={styles.spHead}>Crit %</th>
            <th className={styles.spHead}>Crit ×</th>
          </tr>
        </thead>
        <tbody>
          {SPELL_POWER_TYPES.map(spKey => (
            <SpellPowerRow
              key={spKey}
              name={SPELL_POWER_LABELS[spKey] ?? spKey}
              spKey={spKey}
              stats={stats}
              onTip={setTip}
            />
          ))}
        </tbody>
      </table>
    </Section>
  )

  return (
    <div className="panel" ref={panelRef} style={{ position: 'relative' }}>
      <div className="panel-header">Analysis</div>

      {tip && <Tooltip tip={tip} onHide={hideTip} />}

      <div className="panel-body" style={{ padding: '8px 0' }}>
        {!hasCharacter ? (
          <p className={styles.empty}>Select a race and classes to see stats.</p>
        ) : (
          <div className={styles.sections}>

            {favorites.length > 0 && (
              <Section title="★ Favorites">
                {favorites.map(key => {
                  const found = rowIndex.get(key)
                  if (!found) return null
                  const [section, stat] = found
                  return (
                    <StatRow
                      key={key}
                      stat={{ ...stat, label: `${stat.label.trim()} · ${section}` }}
                      onTip={setTip}
                      favKey={key}
                      starred
                      onToggleStar={toggleFavorite}
                    />
                  )
                })}
              </Section>
            )}

            <Section title="Ability Scores">
              <div className={styles.abilityGrid}>
                {ABILITIES.map(ab => {
                  const resolved = stats.resolve(`ability.${ab}`)
                  const score = resolved.total
                  const mod   = abMod(score)
                  const display = `${score}  (${sign(mod)})`
                  return (
                    <div
                      key={ab}
                      className={styles.abilityCell}
                      onMouseEnter={e => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setTip({ label: ab, display, bonuses: resolved.bonuses, x: r.right, y: r.top })
                      }}
                      onMouseLeave={hideTip}
                    >
                      <span className={styles.abLabel}>{AB3[ab]}</span>
                      <span className={styles.abScore}>{score}</span>
                      <span className={styles.abMod}>{sign(mod)}</span>
                    </div>
                  )
                })}
              </div>
            </Section>

            {sections.map(sec => {
              if (sec.hideWhenEmpty && sec.rows.length === 0) return null
              const sectionEl = (
                <Section title={sec.title} defaultOpen={sec.defaultOpen}>
                  {renderRows(sec.title, sec.rows)}
                </Section>
              )
              // The Spell Powers grid sits between Ranged and Spellcasting,
              // matching the panel's historical order.
              if (sec.title === 'Spellcasting') {
                return (
                  <Fragment key={sec.title}>
                    {spellPowerSection}
                    {sectionEl}
                  </Fragment>
                )
              }
              return <Fragment key={sec.title}>{sectionEl}</Fragment>
            })}

          </div>
        )}
      </div>
    </div>
  )
}
