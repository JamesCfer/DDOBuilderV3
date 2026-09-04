// CollabContext — joins the open character document to a shared editing
// session, so several people can work on one build at the same time.
//
// The plumbing is deliberately one-directional in each direction:
//
//   local edit  →  syncBuildIntoDocument  →  CollabSession.push  →  server merge
//   server sync →  setDoc + LOAD_BUILD    →  the panels re-render
//
// Two details are worth knowing.
//
// The active life/build pointers are NOT followed across clients. They live in
// the same document as the data, but they are a view, not content: making
// everyone jump to the build the last person clicked would be unusable. An
// incoming document keeps this client's own pointers whenever they still
// resolve.
//
// Applying an incoming document re-seeds the reducer through LOAD_BUILD, which
// is a heavy operation, so it is skipped when the active build is untouched by
// the change (someone editing a different life should not disturb this one).

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { useCharacter } from './CharacterContext'
import { useDocument } from './DocumentContext'
import { useAuth } from './AuthContext'
import { communityApi, type CollabParticipant } from '../lib/community/api'
import {
  CollabSession, browserTransport, tabClientId, type CollabStatus,
} from '../lib/collab/session'
import { deepEqual } from '../lib/collab/merge'
import { findActiveBuild, isCharacterDocument, syncBuildIntoDocument } from '../lib/multiLife'
import { migrateDocument } from '../hooks/usePersistence'
import type { CharacterDocument } from '../types/ddo'

export interface CollabContextValue {
  /** The share token of the session in progress, if any. */
  token: string | null
  status: CollabStatus
  participants: CollabParticipant[]
  /** Name of the shared build, as the server knows it. */
  buildName: string
  /** Username of the account that owns the shared build. */
  owner: string
  error: string | null
  /** Joins a shared build by its link token. Resolves once the document is
   *  loaded, or rejects with a message to show the user. */
  join(token: string): Promise<void>
  /** Leaves the session. The document stays open locally. */
  leave(): void
}

const CollabContext = createContext<CollabContextValue | null>(null)

/** Keeps this client's own active life/build when adopting a shared document,
 *  so other people's navigation does not drag the view around. */
function keepLocalPointers(
  incoming: CharacterDocument, local: CharacterDocument,
): CharacterDocument {
  const life = incoming.lives.find(l => l.id === local.activeLifeId)
  if (!life) return incoming
  const build = life.builds.find(b => b.id === local.activeBuildId)
  if (!build) return incoming
  if (incoming.activeLifeId === local.activeLifeId
    && incoming.activeBuildId === local.activeBuildId) return incoming
  return { ...incoming, activeLifeId: local.activeLifeId, activeBuildId: local.activeBuildId }
}

export function CollabProvider({ children }: { children: React.ReactNode }) {
  const { build, dispatch } = useCharacter()
  const { doc, setDoc } = useDocument()
  const { user } = useAuth()

  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<CollabStatus>('offline')
  const [participants, setParticipants] = useState<CollabParticipant[]>([])
  const [buildName, setBuildName] = useState('')
  const [owner, setOwner] = useState('')
  const [error, setError] = useState<string | null>(null)

  const session = useRef<CollabSession | null>(null)
  // The live document and build, read inside callbacks that must not re-bind
  // on every keystroke.
  const latest = useRef({ doc, build })
  latest.current = { doc, build }
  // The document identity most recently adopted from the server. Applying one
  // sets `doc` immediately but seeds the reducer through a dispatch, so for one
  // render the new document is paired with the OLD build; pushing then would
  // send that stale build back and undo the incoming edit. Local edits are held
  // until the two agree again.
  const adopted = useRef<CharacterDocument | null>(null)

  const applyRemote = useCallback((incoming: unknown) => {
    if (!isCharacterDocument(incoming)) return
    const migrated = migrateDocument(incoming as CharacterDocument)
    const next = keepLocalPointers(migrated, latest.current.doc)
    adopted.current = next
    setDoc(next)
    // Re-seed the editor only when the build on screen actually moved: someone
    // editing a different life must not disturb this one.
    const active = findActiveBuild(next)
    if (active && !deepEqual(active, latest.current.build)) {
      dispatch({ type: 'LOAD_BUILD', build: active })
    }
    // Migrating the incoming document, and keeping this client's own pointers,
    // both reshape it. That is not an edit, so it must not be pushed back.
    session.current?.suppress(next)
  }, [dispatch, setDoc])

  const leave = useCallback(() => {
    session.current?.stop()
    session.current = null
    setToken(null)
    setParticipants([])
    setStatus('offline')
  }, [])

  const join = useCallback(async (shareToken: string) => {
    session.current?.stop()
    setError(null)
    setStatus('connecting')
    let snapshot
    try {
      snapshot = await communityApi.collabOpen(shareToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('offline')
      setError(message)
      throw err
    }
    setToken(shareToken)
    setBuildName(snapshot.name)
    setOwner(snapshot.owner)
    applyRemote(snapshot.document)

    const next = new CollabSession(
      shareToken,
      user?.username ?? '',
      tabClientId(),
      browserTransport(communityApi),
      {
        onDocument: applyRemote,
        onParticipants: setParticipants,
        onStatus: setStatus,
        onError: setError,
      },
    )
    session.current = next
    next.start(snapshot)
  }, [applyRemote, user])

  // Push local edits. The document is synced from the live build first: the
  // stored copy of the active build is stale between edits by design.
  useEffect(() => {
    const live = session.current
    if (!live) return
    if (adopted.current === doc) {
      // Still mid-adoption: wait for LOAD_BUILD to land before pushing again.
      const active = findActiveBuild(doc)
      if (active && !deepEqual(active, build)) return
      adopted.current = null
    }
    live.push(syncBuildIntoDocument(doc, build))
  }, [doc, build])

  // The presence list should show the name people know the editor by, which
  // changes if they sign in halfway through.
  useEffect(() => {
    session.current?.setName(user?.username ?? '')
  }, [user])

  // A tab that is closed should not linger in the presence list.
  useEffect(() => {
    const stop = () => session.current?.stop()
    window.addEventListener('pagehide', stop)
    return () => {
      window.removeEventListener('pagehide', stop)
      session.current?.stop()
      session.current = null
    }
  }, [])

  const value = useMemo<CollabContextValue>(() => ({
    token, status, participants, buildName, owner, error, join, leave,
  }), [token, status, participants, buildName, owner, error, join, leave])

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>
}

export function useCollab(): CollabContextValue {
  const ctx = useContext(CollabContext)
  if (!ctx) throw new Error('useCollab must be used inside CollabProvider')
  return ctx
}
