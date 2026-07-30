// ParityBadge — TopNav indicator for the background V2 math check.
//
// Listens for `v2parity` events (dispatched by lib/parityClient after every
// .DDOBuild import) and shows the verdict: the v2calc oracle (V2's own C++
// math, run headless server-side) recomputed the uploaded build and every
// compared stat matched V3 — or it didn't, in which case the badge expands
// to list exactly which stats disagree and by how much.

import { useEffect, useState } from 'react'
import styles from './ParityBadge.module.css'
import { PARITY_EVENT, type ParityCheckResult } from '../../lib/parityClient'

export default function ParityBadge() {
  const [result, setResult] = useState<ParityCheckResult | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onParity(e: Event) {
      setResult((e as CustomEvent<ParityCheckResult>).detail)
      setOpen(false)
    }
    window.addEventListener(PARITY_EVENT, onParity)
    return () => window.removeEventListener(PARITY_EVENT, onParity)
  }, [])

  if (!result) return null

  let label: string
  let cls = styles.badge
  if (!result.done) {
    label = '⟳ V2 check…'
    cls += ` ${styles.pending}`
  } else if (!result.available) {
    label = 'V2 check n/a'
    cls += ` ${styles.unavailable}`
  } else if (result.pass) {
    label = `✓ V2 math ${result.compared}/${result.compared}`
    cls += ` ${styles.pass}`
  } else {
    const n = result.mismatches?.length ?? 0
    label = n > 0 ? `⚠ V2 math: ${n} diff${n !== 1 ? 's' : ''}` : '⚠ V2 check failed'
    cls += ` ${styles.fail}`
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={cls}
        title={result.reason ?? `${result.fileName}: uploaded build re-computed with DDOBuilder V2's own math`}
        onClick={() => setOpen(o => !o)}
      >
        {label}
      </button>
      {open && result.done && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{result.fileName}</div>
          {!result.available && (
            <div className={styles.reason}>{result.reason ?? 'V2 oracle not available on this server.'}</div>
          )}
          {result.available && result.pass && (
            <div className={styles.reason}>
              All {result.compared} compared stats match DDOBuilder V2 exactly.
            </div>
          )}
          {result.available && !result.pass && (result.mismatches?.length ?? 0) === 0 && (
            <div className={styles.reason}>{result.reason ?? 'Check failed.'}</div>
          )}
          {(result.mismatches?.length ?? 0) > 0 && (
            <table className={styles.table}>
              <thead>
                <tr><th>Stat</th><th>V2</th><th>V3</th></tr>
              </thead>
              <tbody>
                {result.mismatches!.slice(0, 20).map(m => (
                  <tr key={m.stat}>
                    <td>{m.stat}</td>
                    <td>{m.v2}</td>
                    <td>{m.v3}</td>
                  </tr>
                ))}
                {result.mismatches!.length > 20 && (
                  <tr><td colSpan={3}>… {result.mismatches!.length - 20} more</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
