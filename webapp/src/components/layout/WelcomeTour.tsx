// First-run tutorial. A short, stepped overlay that says what this site is
// and where the things you need live, shown once per browser the first
// time the app is opened and re-openable from Help & About at any time.
//
// Deliberately a modal card rather than an element-anchored spotlight: the
// layout reflows with the page, the window width and the open panels, and a
// highlight that lands on the wrong control teaches the wrong thing. Each
// step instead names the region in words the chrome actually uses.

import { useEffect, useState } from 'react'
import styles from './WelcomeTour.module.css'

/** Bump when the steps change enough that returning users should see them. */
export const TOUR_VERSION = '2'
const TOUR_KEY = 'ddo-builder-tour-seen'

/** True when this browser has not been shown the current tour. */
export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) !== TOUR_VERSION
  } catch {
    // Private mode or blocked storage: show nothing rather than nag on every
    // page load with a tour we cannot remember dismissing.
    return false
  }
}

export function markTourSeen(): void {
  try { localStorage.setItem(TOUR_KEY, TOUR_VERSION) } catch { /* nothing to remember it with */ }
}

interface Step {
  title: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Welcome to DDO Builder',
    body: (
      <>
        <p>
          This is a character planner for <strong>Dungeons &amp; Dragons Online</strong>.
          Build a character here — race, classes, feats, skills, enhancements,
          destinies and gear — and see what the numbers come out as before you
          spend anything in game.
        </p>
        <p>Thirty seconds and you will know where everything is.</p>
      </>
    ),
  },
  {
    title: 'Four pages across the top',
    body: (
      <>
        <ul>
          <li><strong>Character</strong> — the build. Its tabs run from Overview through Skills, Feats, Spells, Enhancements, Destinies and Gear to Combat.</li>
          <li><strong>Crafting</strong>, <strong>Community</strong> and <strong>Plugins</strong> — the tools around the build.</li>
        </ul>
        <p>
          Every page is a workspace: the panels are <strong>windows on a grid</strong>.
          Drag one by its title bar, resize it from any edge, roll it up, or close it.
        </p>
      </>
    ),
  },
  {
    title: 'Make it yours',
    body: (
      <>
        <p>
          <strong>+ Add window</strong> puts any panel on the tab you are looking at — your
          numbers next to your feats, stances next to the damage calculator, whatever you like.
          Windows snap to the grid, the canvas grows as far as you drag, and on a small screen
          the windows stack instead.
        </p>
        <p>
          <strong>Breakdowns</strong>, <strong>DCs</strong> and <strong>Bonuses</strong> recalculate
          as you build; <strong>Stances &amp; Buffs</strong> toggles feed straight into them.
          Add your own tabs with <strong>+</strong>, and <strong>Reset</strong> restores a tab's default layout.
        </p>
      </>
    ),
  },
  {
    title: 'Saving, opening and sharing',
    body: (
      <>
        <p>
          <strong>File</strong> (top right) saves and opens builds, and reads the
          .DDOBuild files the Windows DDOBuilder writes — you can also drop one
          anywhere on the window to import it.
        </p>
        <p>
          Your work is kept in this browser between visits automatically. Sign in
          to keep builds to your account and publish them under
          <strong> Community</strong>.
        </p>
        <p><strong>Lives &amp; Builds</strong> switches between the lives and variants of one character.</p>
      </>
    ),
  },
  {
    title: 'Tell us when something is wrong',
    body: (
      <>
        <p>
          The gold <strong>Feedback</strong> button in the bottom-right corner sends a
          bug, an idea or a question straight to the maintainer. Please use it —
          it is the fastest way anything gets fixed.
        </p>
        <p>
          You can reopen this tour any time from <strong>Tools › Help &amp; About</strong>.
        </p>
      </>
    ),
  },
]

interface WelcomeTourProps {
  /** Called when the tour is finished, skipped or dismissed. */
  onClose: () => void
}

export default function WelcomeTour({ onClose }: WelcomeTourProps) {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  function finish() {
    markTourSeen()
    onClose()
  }

  // Escape leaves the tour; arrows step through it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, STEPS.length - 1))
      else if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.overlay} onClick={finish}>
      <div
        className={styles.card}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Getting started"
      >
        <div className={styles.header}>
          <span className={styles.step}>Step {index + 1} of {STEPS.length}</span>
          <button type="button" className={styles.skip} onClick={finish}>
            {last ? 'Close' : 'Skip tour'}
          </button>
        </div>

        <h2 className={styles.title}>{step.title}</h2>
        <div className={styles.body}>{step.body}</div>

        <div className={styles.footer}>
          <div className={styles.dots} aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.title} className={`${styles.dot} ${i === index ? styles.dotActive : ''}`} />
            ))}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setIndex(i => Math.max(i - 1, 0))}
              disabled={index === 0}
            >
              Back
            </button>
            <button
              type="button"
              className={styles.nextBtn}
              onClick={() => (last ? finish() : setIndex(i => i + 1))}
            >
              {last ? 'Start building' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
