// The one place the arrangement of every page lives. Reads the per-account
// layout on mount (and again when the account changes), hands out functional
// updaters, and writes the result back on every COMMITTED change — a drag in
// progress updates state on every pointer move but only persists on release.
//
// Every mutation is a functional update on the previous state. Window
// handlers are created during a render and can fire after that render is
// stale (a ResizeObserver callback in particular arrives asynchronously); a
// handler that wrote its captured array back used to resurrect windows that
// had been closed in between. Reading `prev` makes that impossible.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  defaultWorkspace, defaultWorkspaces, newId, readLayout, writeLayout,
  type LayoutState, type PageId, type Workspace,
} from '../lib/workspace'

export interface WorkspaceLayoutApi {
  layout: LayoutState
  /** Replace one workspace of one page. `commit` persists the result. */
  updateWorkspace: (page: PageId, id: string, fn: (prev: Workspace) => Workspace, commit?: boolean) => void
  addTab: (page: PageId, name: string) => string
  renameTab: (page: PageId, id: string, name: string) => void
  removeTab: (page: PageId, id: string) => void
  /** Restore a built-in tab to its shipped layout, or empty a custom one. */
  resetTab: (page: PageId, id: string) => void
  /** Restore every tab of a page. */
  resetPage: (page: PageId) => void
}

export function useWorkspaceLayout(userId: string | null): WorkspaceLayoutApi {
  const [layout, setLayout] = useState<LayoutState>(() => readLayout(userId))

  // Signing in or out swaps which layout is in play.
  const loadedFor = useRef(userId)
  useEffect(() => {
    if (loadedFor.current === userId) return
    loadedFor.current = userId
    setLayout(readLayout(userId))
  }, [userId])

  const update = useCallback((fn: (prev: LayoutState) => LayoutState, commit = true) => {
    setLayout(prev => {
      const next = fn(prev)
      if (next === prev) return prev
      if (commit) writeLayout(userId, next)
      return next
    })
  }, [userId])

  const updateWorkspace = useCallback<WorkspaceLayoutApi['updateWorkspace']>((page, id, fn, commit = true) => {
    update(prev => {
      const list = prev[page]
      const idx = list.findIndex(w => w.id === id)
      if (idx < 0) return prev
      const nextSpace = fn(list[idx])
      if (nextSpace === list[idx]) return prev
      const nextList = list.slice()
      nextList[idx] = nextSpace
      return { ...prev, [page]: nextList }
    }, commit)
  }, [update])

  const addTab = useCallback<WorkspaceLayoutApi['addTab']>((page, name) => {
    const id = newId('tab')
    update(prev => ({ ...prev, [page]: [...prev[page], { id, name: name.trim() || 'New tab', windows: [] }] }))
    return id
  }, [update])

  const renameTab = useCallback<WorkspaceLayoutApi['renameTab']>((page, id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    updateWorkspace(page, id, w => (w.name === trimmed ? w : { ...w, name: trimmed }))
  }, [updateWorkspace])

  const removeTab = useCallback<WorkspaceLayoutApi['removeTab']>((page, id) => {
    update(prev => {
      const target = prev[page].find(w => w.id === id)
      // Built-in tabs are the app's navigation; they can be emptied, not removed.
      if (!target || target.builtin) return prev
      return { ...prev, [page]: prev[page].filter(w => w.id !== id) }
    })
  }, [update])

  const resetTab = useCallback<WorkspaceLayoutApi['resetTab']>((page, id) => {
    updateWorkspace(page, id, w => defaultWorkspace(page, id) ?? { ...w, windows: [] })
  }, [updateWorkspace])

  const resetPage = useCallback<WorkspaceLayoutApi['resetPage']>(page => {
    update(prev => ({ ...prev, [page]: defaultWorkspaces(page) }))
  }, [update])

  return { layout, updateWorkspace, addTab, renameTab, removeTab, resetTab, resetPage }
}
