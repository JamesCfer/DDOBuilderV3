// parityClient — fire-and-forget V2 parity verification for uploaded builds.
//
// Whenever the user imports a V2 .DDOBuild file, the raw XML is posted to
// POST /api/parity-check in the background. The server runs the v2calc
// oracle (DDOBuilder V2's own compiled C++ math) and V3's stat engine over
// the same build and diffs every stat. The result is broadcast as a
// `v2parity` window event so the ParityBadge (TopNav) can surface it without
// coupling the import path to any UI.

import type { ParityRow } from './oracleParityRows'

export const PARITY_EVENT = 'v2parity'

export interface ParityCheckResult {
  fileName: string
  /** False while the check is in flight (the badge shows a spinner state). */
  done: boolean
  available?: boolean
  pass?: boolean
  compared?: number
  mismatches?: ParityRow[]
  reason?: string
}

function broadcast(detail: ParityCheckResult): void {
  window.dispatchEvent(new CustomEvent<ParityCheckResult>(PARITY_EVENT, { detail }))
}

/**
 * Kicks off the background check. Never throws and never blocks the import —
 * network/server failures degrade to a "check unavailable" badge state.
 */
export function runBackgroundParityCheck(xml: string, fileName: string): void {
  broadcast({ fileName, done: false })
  fetch('/api/parity-check', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: xml,
  })
    .then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const report = await res.json() as Omit<ParityCheckResult, 'fileName' | 'done'>
      broadcast({ fileName, done: true, ...report })
    })
    .catch(err => {
      broadcast({
        fileName, done: true, available: false,
        reason: `parity check unreachable: ${err instanceof Error ? err.message : String(err)}`,
      })
    })
}
