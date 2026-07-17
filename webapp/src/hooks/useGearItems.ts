// Shared resolver for equipped gear: slot → full Item object.
// Replaces the identical per-panel useEffect blocks in BreakdownsPanel /
// CombatPanel / DCPanel / ForumExportPanel / SpellsPanel / AutomaticFeats /
// EpicDestiniesPanel / BuildCompare. Item lookups are cached by name at
// module level so switching tabs doesn't refetch the same items.

import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Item } from '../types/ddo'

const itemCache = new Map<string, Item | null>()

async function resolveItem(name: string): Promise<Item | null> {
  if (itemCache.has(name)) return itemCache.get(name)!
  const item = await api.item(name).catch(() => null)
  itemCache.set(name, item)
  return item
}

/** Test-only: clear the module-level item cache. */
export function resetGearItemCacheForTests(): void {
  itemCache.clear()
}

export function useGearItems(gear: Record<string, string>): Record<string, Item> {
  const [gearItems, setGearItems] = useState<Record<string, Item>>({})

  useEffect(() => {
    const slots = Object.entries(gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        resolveItem(name).then(item => item ? [slot, item] as [string, Item] : null),
      ),
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [gear])

  return gearItems
}
