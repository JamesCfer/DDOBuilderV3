// Recovering a tab that outlived a deploy.
//
// Every workspace window is its own lazily loaded script file, named by a
// content hash (Skills-pj4waipe.js). The live server pulls and rebuilds
// itself after each merge, which replaces those files with new hashes. A tab
// opened before the rebuild still asks for the old names, the server no longer
// has them, and every window it had not opened yet fails with "Failed to fetch
// dynamically imported module". To a tester that looks like "everything is
// failing to load".
//
// The fix is to reload into the new version. The working document is already
// kept in the browser (lib/sessionStore), so a reload picks up where the user
// left off. A short guard stops a reload loop if the files are missing for
// some other reason.

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RELOAD_KEY = 'ddo-builder-stale-bundle-reload'
const RELOAD_GUARD_MS = 60_000

/** True for the errors browsers raise when a script file of the app cannot be loaded. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(msg)
}

/**
 * Reload the page to pick up the current build, unless that was already tried
 * in the last minute. Returns true when a reload was started.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // No sessionStorage: reloading without a guard could loop, so don't.
    return false
  }
  window.location.reload()
  return true
}

/** React.lazy that reloads into the new build when the panel's file is gone. */
export function lazyPanel<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      // Never settle while the page reloads, so the panel shows "Loading…"
      // rather than flashing an error first.
      if (isChunkLoadError(err) && reloadForNewVersion()) return new Promise<{ default: T }>(() => {})
      throw err
    }),
  )
}

/** Vite fires this when a preloaded dependency of a lazy file fails to load. */
export function installStaleBundleHandler(): void {
  window.addEventListener('vite:preloadError', event => {
    if (reloadForNewVersion()) event.preventDefault()
  })
}
