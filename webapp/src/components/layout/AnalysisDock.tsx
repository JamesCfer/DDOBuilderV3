// AnalysisDock — always-visible RIGHT rail carrying the analysis panels.
//
// Analysis is not a destination, it is the feedback loop: every choice made on
// the left (a stance, a feat, an enhancement, a weapon) is only interesting
// because of what it does to the numbers. Keeping those numbers on their own
// page meant making a change, navigating to Analysis to see the effect, and
// navigating back — for every single choice. Now they sit on the right of
// whatever page you are working on, permanently, and update live.
//
// Together with StanceBuffDock on the left the two rails frame the page:
// toggles on one side, consequences on the other.
//
// Which analysis section is showing is the rail's own state (persisted), and
// the table-heavy sections can widen the rail rather than be squeezed into
// it — Combat and Compare are genuinely wide, and pretending otherwise would
// make them useless here.

import { useState } from 'react'
import BreakdownsPanel from '../breakdowns/BreakdownsPanel'
import CombatPanel from '../combat/CombatPanel'
import DCPanel from '../dc/DCPanel'
import BonusesPanel from '../bonuses/BonusesPanel'
import BuildCompare from './BuildCompare'
import styles from './AnalysisDock.module.css'

const OPEN_KEY = 'ddo-analysis-dock-open'
const SECTION_KEY = 'ddo-analysis-dock-section'
const WIDE_KEY = 'ddo-analysis-dock-wide'

const SECTIONS = ['Breakdowns', 'Combat', 'DCs', 'Bonuses', 'Compare'] as const
type Section = (typeof SECTIONS)[number]

/** Sections whose content is a wide table — they default the rail to wide. */
const WIDE_SECTIONS = new Set<Section>(['Combat', 'Compare'])

function readSection(): Section {
  try {
    const stored = localStorage.getItem(SECTION_KEY)
    if (stored && (SECTIONS as readonly string[]).includes(stored)) return stored as Section
  } catch { /* fall through */ }
  return 'Breakdowns'
}

export default function AnalysisDock() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true }
  })
  const [section, setSection] = useState<Section>(readSection)
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem(WIDE_KEY) === '1' } catch { return false }
  })

  function toggleOpen() {
    setOpen(v => {
      try { localStorage.setItem(OPEN_KEY, v ? '0' : '1') } catch { /* ignore */ }
      return !v
    })
  }

  function pickSection(next: Section) {
    setSection(next)
    try { localStorage.setItem(SECTION_KEY, next) } catch { /* ignore */ }
    // Switching to a table section widens the rail once, rather than making
    // the user discover the width control after seeing a squeezed table.
    if (WIDE_SECTIONS.has(next) && !wide) setWideState(true)
  }

  function setWideState(next: boolean) {
    setWide(next)
    try { localStorage.setItem(WIDE_KEY, next ? '1' : '0') } catch { /* ignore */ }
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.collapsedBtn}
        onClick={toggleOpen}
        title="Show analysis"
        aria-label="Show analysis"
        aria-expanded={false}
      >
        📊
      </button>
    )
  }

  return (
    <aside
      className={`${styles.dock} ${wide ? styles.dockWide : ''}`}
      aria-label="Analysis"
    >
      <div className={styles.dockHeader}>
        <span className={styles.dockTitle}>Analysis</span>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setWideState(!wide)}
          title={wide ? 'Narrow the analysis rail' : 'Widen the analysis rail'}
          aria-label={wide ? 'Narrow the analysis rail' : 'Widen the analysis rail'}
          aria-pressed={wide}
        >
          {wide ? '⇥' : '⇤'}
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleOpen}
          title="Hide analysis"
          aria-label="Hide analysis"
          aria-expanded
        >
          ›
        </button>
      </div>

      <nav className={styles.sections} aria-label="Analysis sections">
        {SECTIONS.map(s => (
          <button
            key={s}
            type="button"
            className={`${styles.sectionBtn} ${section === s ? styles.sectionBtnOn : ''}`}
            onClick={() => pickSection(s)}
            aria-current={section === s}
          >
            {s}
          </button>
        ))}
      </nav>

      <div className={styles.dockBody}>
        {section === 'Breakdowns' && <BreakdownsPanel />}
        {section === 'Combat' && <CombatPanel />}
        {section === 'DCs' && <DCPanel />}
        {section === 'Bonuses' && <BonusesPanel />}
        {section === 'Compare' && <BuildCompare />}
      </div>
    </aside>
  )
}
