// CollabHub — live shared editing of a saved build.
//
// A build carries an optional secret share token (CommunityStore.shareBuild).
// Anyone holding it, signed in or not, may open the build and edit it at the
// same time as everyone else. This class owns what that needs beyond the
// stored record:
//
//   * the authoritative in-memory copy of the document and its version number,
//   * the three-way merge of each incoming edit against it (lib/collab/merge),
//   * the list of who is currently in the build, and
//   * the open SSE streams every change and presence update is pushed to.
//
// Rooms are in-memory and rebuilt from the store on first use, so a restart
// costs the participants a reconnect and nothing else. Merged documents are
// written back to the store on a short debounce: a shared build should survive
// a crash, but not at one disk write per keystroke.

import { randomBytes } from 'crypto'
import { mergeDocuments, deepEqual } from '../lib/collab/merge'
import type { CommunityStore, SavedBuildRecord } from './communityStore'

/** The bit of an HTTP response a stream needs. Kept minimal so rooms can be
 *  driven by a fake in tests without an HTTP server. */
export interface StreamSink {
  write(chunk: string): void
  end?(): void
}

export interface Participant {
  /** Client-generated id: one browser tab. */
  id: string
  name: string
  color: string
  /** True for the build's owner, who is the only one who can revoke the link. */
  isOwner: boolean
  lastSeen: number
}

export type PublicParticipant = Omit<Participant, 'lastSeen'>

export interface CollabSnapshot {
  buildId: string
  name: string
  version: number
  document: unknown
  participants: PublicParticipant[]
}

interface Subscriber {
  clientId: string
  sink: StreamSink
}

/** Presence colours, picked so several editors stay tellable apart. */
const COLORS = [
  '#e3ca4c', '#4f9ae8', '#3fbf72', '#e58c3c',
  '#a878e6', '#e35b5b', '#6fc3d4', '#d47ab0',
]

/** A participant that has not been heard from for this long has closed the tab
 *  (or lost the network) and is dropped from the presence list. */
const PRESENCE_TTL_MS = 45_000
/** How long a merged document may sit in memory before it is written back. */
const PERSIST_DEBOUNCE_MS = 1_500

function colorFor(clientId: string): string {
  let hash = 0
  for (let i = 0; i < clientId.length; i++) hash = (hash * 31 + clientId.charCodeAt(i)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

/** Guest names come from the browser, so they are trimmed, length-capped and
 *  stripped of the control characters that would corrupt an SSE frame. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Guest'
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 32)
  return clean === '' ? 'Guest' : clean
}

class Room {
  readonly buildId: string
  name: string
  version: number
  document: unknown
  private readonly participants = new Map<string, Participant>()
  private readonly subscribers: Subscriber[] = []
  private persistTimer: ReturnType<typeof setTimeout> | undefined
  private dirty = false

  constructor(
    record: SavedBuildRecord,
    private readonly onPersist: (doc: unknown, version: number) => void,
  ) {
    this.buildId = record.id
    this.name = record.name
    this.document = record.document
    this.version = record.collabVersion ?? 1
  }

  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  touch(clientId: string, name: string, isOwner: boolean): Participant {
    const participant: Participant = this.participants.get(clientId) ?? {
      id: clientId,
      name,
      color: colorFor(clientId),
      isOwner,
      lastSeen: Date.now(),
    }
    participant.name = name
    participant.isOwner = isOwner
    participant.lastSeen = Date.now()
    this.participants.set(clientId, participant)
    return participant
  }

  leave(clientId: string): void {
    this.participants.delete(clientId)
  }

  /** Drops participants who stopped reporting in. Returns true when the list
   *  changed, so callers only broadcast presence that actually moved. */
  private reap(): boolean {
    const cutoff = Date.now() - PRESENCE_TTL_MS
    let changed = false
    for (const [id, p] of this.participants) {
      if (p.lastSeen < cutoff) {
        this.participants.delete(id)
        changed = true
      }
    }
    return changed
  }

  present(): PublicParticipant[] {
    this.reap()
    return [...this.participants.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name, color, isOwner }) => ({ id, name, color, isOwner }))
  }

  get isEmpty(): boolean {
    return this.participants.size === 0 && this.subscribers.length === 0
  }

  // -------------------------------------------------------------------------
  // Streams
  // -------------------------------------------------------------------------

  subscribe(clientId: string, sink: StreamSink): () => void {
    this.subscribers.push({ clientId, sink })
    this.send(sink, 'sync', this.snapshot())
    this.broadcastPresence()
    return () => {
      const i = this.subscribers.findIndex(s => s.sink === sink)
      if (i >= 0) this.subscribers.splice(i, 1)
      this.leave(clientId)
      this.broadcastPresence()
    }
  }

  private send(sink: StreamSink, event: string, data: unknown): void {
    try {
      sink.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      // A dead socket is dropped by its own close handler; nothing to do here.
    }
  }

  /** Pushes to everyone except the client that caused the change: that client
   *  already has the result in the reply to its own POST. */
  private broadcast(event: string, data: unknown, exceptClientId?: string): void {
    for (const sub of this.subscribers) {
      if (sub.clientId === exceptClientId) continue
      this.send(sub.sink, event, data)
    }
  }

  broadcastPresence(): void {
    this.broadcast('presence', { participants: this.present() })
  }

  ping(): void {
    // A comment frame: keeps proxies from closing an idle stream, and gives the
    // reaper a chance to run on a room nobody is editing.
    for (const sub of this.subscribers) {
      try {
        sub.sink.write(': ping\n\n')
      } catch {
        // Closed underneath us; its own handler unsubscribes it.
      }
    }
    if (this.reap()) this.broadcastPresence()
  }

  snapshot(): CollabSnapshot {
    return {
      buildId: this.buildId,
      name: this.name,
      version: this.version,
      document: this.document,
      participants: this.present(),
    }
  }

  // -------------------------------------------------------------------------
  // Edits
  // -------------------------------------------------------------------------

  /**
   * Merges one client's proposed document into the shared one.
   *
   * `baseVersion` is the shared version that client last saw. When it matches
   * the current version nothing else has happened since and the merge is
   * trivial; when it is behind, the client's own last-known document (`base`)
   * is what its edit is measured against, so the server needs no history.
   */
  applyUpdate(input: {
    clientId: string
    baseVersion: number
    base?: unknown
    document: unknown
  }): CollabSnapshot {
    const base = input.baseVersion === this.version ? this.document : input.base
    const merged = mergeDocuments(base, this.document, input.document)
    if (deepEqual(merged, this.document)) return this.snapshot()

    this.document = merged
    this.version += 1
    const name = (merged as { name?: unknown } | null)?.name
    if (typeof name === 'string' && name.trim() !== '') this.name = name.trim().slice(0, 80)
    this.broadcast('sync', this.snapshot(), input.clientId)
    this.schedulePersist()
    return this.snapshot()
  }

  private schedulePersist(): void {
    this.dirty = true
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined
      this.flush()
    }, PERSIST_DEBOUNCE_MS)
    // A pending write must never hold the process open on shutdown.
    ;(this.persistTimer as unknown as { unref?: () => void }).unref?.()
  }

  flush(): void {
    if (!this.dirty) return
    this.dirty = false
    this.onPersist(this.document, this.version)
  }

  closeAll(): void {
    this.flush()
    for (const sub of this.subscribers) sub.sink.end?.()
    this.subscribers.length = 0
    this.participants.clear()
  }
}

export class CollabHub {
  private readonly rooms = new Map<string, Room>()
  private readonly pinger: ReturnType<typeof setInterval>

  constructor(private readonly store: CommunityStore) {
    this.pinger = setInterval(() => this.tick(), 20_000)
    ;(this.pinger as unknown as { unref?: () => void }).unref?.()
  }

  /** Resolves a share token to its build, or undefined when the link was
   *  revoked or never existed. */
  resolve(token: string): SavedBuildRecord | undefined {
    return this.store.buildByShareToken(token)
  }

  /** The room for a shared build, created from the stored record on first use.
   *  The stored document seeds the room only once: after that the room's copy
   *  is the authoritative one. */
  roomFor(record: SavedBuildRecord): Room {
    const existing = this.rooms.get(record.id)
    if (existing) return existing
    const room = new Room(record, (doc, version) => {
      try {
        this.store.saveCollabDocument(record.id, doc, version)
      } catch {
        // The build was deleted while people were editing it; the next request
        // against the token 404s and the empty room is dropped by the reaper.
      }
    })
    this.rooms.set(record.id, room)
    return room
  }

  /** The room for a build people are currently editing together, or undefined
   *  when nobody is in it. Unlike `roomFor` this never creates one. */
  liveRoom(buildId: string): Room | undefined {
    return this.rooms.get(buildId)
  }

  /** Drops the room for a build whose link was revoked or which was deleted,
   *  writing its document back first. */
  closeRoom(buildId: string): void {
    const room = this.rooms.get(buildId)
    if (!room) return
    room.closeAll()
    this.rooms.delete(buildId)
  }

  /** Room upkeep: keeps streams alive, expires absent participants and closes
   *  rooms nobody is in (after writing their document back). */
  private tick(): void {
    for (const [id, room] of this.rooms) {
      room.ping()
      if (room.isEmpty) {
        room.closeAll()
        this.rooms.delete(id)
      }
    }
  }

  /** Flushes every pending document, for shutdown and for tests. */
  flushAll(): void {
    for (const room of this.rooms.values()) room.flush()
  }

  stop(): void {
    clearInterval(this.pinger)
    for (const room of this.rooms.values()) room.closeAll()
    this.rooms.clear()
  }
}

/** A fresh client id, used when a caller does not bring its own. */
export function newClientId(): string {
  return randomBytes(8).toString('hex')
}

export type { Room }
