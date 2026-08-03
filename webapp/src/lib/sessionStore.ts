// Session restore — the document you were last working on, kept in the
// browser so a refresh (or coming back tomorrow) picks up where you left off.
//
// This is deliberately NOT the saves list. `usePersistence` keeps named
// documents that the user chose to save; this keeps the ONE working document,
// saved or not, whether or not the auto-save setting is on. Losing an
// unsaved hour of build planning to an accidental refresh is not a setting
// anyone should have to have found first.
//
// Stored in localStorage rather than a cookie: cookies are capped around 4 KB
// and ride along on every request, and a document with gear runs to tens of
// kilobytes. Same lifetime and same per-browser scope, without either problem.

import type { CharacterDocument } from '../types/ddo'

const SESSION_KEY = 'ddo-builder-session'

/** Snapshot the working document. Cheap enough to call on every edit (debounced). */
export function saveSession(doc: CharacterDocument): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(doc))
  } catch {
    // Quota exceeded (a very large document, or a full origin). Losing the
    // restore point is not worth breaking the edit that triggered it.
  }
}

/**
 * The document to restore on startup, or undefined when there is nothing
 * usable. Anything unparseable is discarded rather than crashing the app into
 * a blank page it cannot recover from.
 */
export function readSession(): CharacterDocument | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as CharacterDocument
    if (!parsed || !Array.isArray(parsed.lives) || parsed.lives.length === 0) return undefined
    if (!parsed.lives.some(l => Array.isArray(l.builds) && l.builds.length > 0)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

/** Forget the restore point (used when starting a new character). */
export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}
