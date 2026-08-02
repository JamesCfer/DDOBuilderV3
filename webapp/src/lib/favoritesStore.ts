// favoritesStore — shared, app-wide store for the starred ("favorited")
// breakdown rows. Every host that shows them (the Breakdowns panel's own
// ★ Favorites section, and anything else that adopts it) reads and writes the
// same list, so a star toggled in one place updates everywhere immediately.
// Persisted per-browser (not per-build) in localStorage under the same key the
// Breakdowns panel has always used, so existing favorites carry over.

import { useSyncExternalStore, useCallback } from 'react'

const FAVORITES_KEY = 'ddo-breakdown-favorites'

function load(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
  } catch {
    return []
  }
}

let favorites: string[] = load()
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

// Keep multiple tabs in sync — storage events only fire in *other* tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === FAVORITES_KEY) {
      favorites = load()
      emit()
    }
  })
}

export function getFavorites(): string[] {
  return favorites
}

export function toggleFavorite(key: string): void {
  favorites = favorites.includes(key)
    ? favorites.filter(k => k !== key)
    : [...favorites, key]
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)) } catch { /* ignore */ }
  emit()
}

export function subscribeFavorites(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** React hook: current favorites list plus the shared toggle function. */
export function useFavorites(): [string[], (key: string) => void] {
  const favs = useSyncExternalStore(subscribeFavorites, getFavorites)
  const toggle = useCallback((key: string) => toggleFavorite(key), [])
  return [favs, toggle]
}
