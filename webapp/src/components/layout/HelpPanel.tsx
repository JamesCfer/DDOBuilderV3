// V2 Help menu parity ("Help Topics" / "About DDOBuilder..."). The webapp
// folds both into one panel: version/build info, the data-file provenance,
// keyboard shortcuts, and pointers to the upstream V2 project.

import { useEffect, useState } from 'react'
import { api } from '../../api'

interface HelpPanelProps {
  /** Re-opens the first-run tutorial. */
  onStartTour?: () => void
}

export default function HelpPanel({ onStartTour }: HelpPanelProps = {}) {
  const [version, setVersion] = useState('')

  useEffect(() => {
    api.version()
      .then(v => setVersion(v.version && v.version !== 'unknown' ? v.version : ''))
      .catch(() => setVersion(''))
  }, [])

  return (
    <div className="panel">
      <div className="panel-header">Help &amp; About</div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
        <section>
          <strong>About</strong>
          <p style={{ margin: '4px 0' }}>
            DDOBuilder V3 — a web port of Maetrim's DDOBuilder (V2) character
            planner for Dungeons &amp; Dragons Online.
            {version ? ` Version: ${version} (the most recently merged PR).` : ''}
          </p>
          <p style={{ margin: '4px 0' }}>
            All game data (classes, races, feats, enhancement trees, items,
            spells…) is read from the same XML data files the V2 Windows
            application ships, so numbers and content stay in lock-step with
            V2 releases.
          </p>
        </section>

        <section>
          <strong>New here?</strong>
          <p style={{ margin: '4px 0' }}>
            The short tour that runs on your first visit explains where the
            build, the numbers and the save controls live.
          </p>
          {onStartTour && (
            <button type="button" onClick={onStartTour} style={{ marginTop: '4px' }}>
              Take the tour
            </button>
          )}
        </section>

        <section>
          <strong>Keyboard shortcuts</strong>
          <table style={{ marginTop: '4px' }}>
            <tbody>
              <tr><td style={{ paddingRight: '16px' }}><kbd>Ctrl</kbd>+<kbd>N</kbd></td><td>New character</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>O</kbd></td><td>Open / import a build file (.DDOBuild, .ddocp, JSON)</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save the current character</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>P</kbd></td><td>Print (print-friendly layout applied automatically)</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <strong>Tips</strong>
          <ul style={{ margin: '4px 0 0 16px' }}>
            <li>Drop a .DDOBuild file anywhere on the window to import it.</li>
            <li>Lives and builds within a character are managed from the bar under Save/Load.</li>
            <li>Found a bug or have an idea? The gold <em>Feedback</em> button in the bottom-right corner sends it straight to the maintainer.</li>
            <li>Hide content you don't own under <em>Content</em>; tune feat list filters under <em>Settings</em>.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
