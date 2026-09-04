// CollabSession — the browser half of shared editing.
//
// One session per open tab. It keeps three things in step:
//
//   * the local document, which the user edits through the normal panels,
//   * the shared document on the server, and
//   * everyone else's edits, which arrive on an SSE stream.
//
// Local edits are pushed on a short debounce rather than per keystroke, and are
// sent together with the shared version they were made against so the server
// can merge them (src/lib/collab/merge.ts) instead of overwriting. The reply and
// the stream both carry the merged shared document, which the session hands
// back to the app to apply.
//
// The one thing to be careful about here is the echo: applying a document that
// came from the server must not look like a local edit and bounce straight back.
// `shared` records what the two sides last agreed on, and `echo` the local form
// of it once the app has normalised it; a push equal to either is not an edit.

import { deepEqual } from './merge'
import type { CollabParticipant, CollabSnapshot } from '../community/api'

export type CollabStatus = 'connecting' | 'live' | 'offline' | 'revoked'

export interface CollabTransport {
  open(token: string, query: Record<string, string>): CollabStream
  update(token: string, payload: {
    clientId: string
    baseVersion: number
    base?: unknown
    document: unknown
    name?: string
  }): Promise<CollabSnapshot>
  presence(token: string, payload: {
    clientId: string
    name?: string
    leaving?: boolean
  }): Promise<{ version: number; participants: CollabParticipant[] }>
}

export interface CollabStream {
  on(event: string, handler: (data: unknown) => void): void
  onError(handler: () => void): void
  close(): void
}

export interface CollabCallbacks {
  /** A new shared document to apply locally. Never fired for the client's own
   *  edit unless the server reshaped it by merging someone else's in. */
  onDocument(document: unknown, version: number): void
  onParticipants(participants: CollabParticipant[]): void
  onStatus(status: CollabStatus): void
  onError?(message: string): void
}

/** Local edits are batched for this long. Long enough that dragging a slider
 *  is one push, short enough that a collaborator sees it as it happens. */
const PUSH_DEBOUNCE_MS = 400
/** Presence heartbeat. Comfortably inside the server's 45s expiry. */
const HEARTBEAT_MS = 20_000

export class CollabSession {
  private stream: CollabStream | undefined
  private pushTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  /** The document both sides last agreed on, and its version. This is what a
   *  push is measured against, so it must stay exactly what the server holds. */
  private shared: unknown
  private version = 0
  /** The local form of the shared document, when the app normalises what it
   *  adopts (migration, syncing the live build back in). Equal in content, not
   *  byte for byte, so it needs its own echo guard. */
  private echo: unknown
  /** The most recent local document, waiting to be pushed. */
  private pending: unknown
  private inFlight = false
  private stopped = false

  constructor(
    readonly token: string,
    private name: string,
    readonly clientId: string,
    private readonly transport: CollabTransport,
    private readonly callbacks: CollabCallbacks,
  ) {}

  /** Adopts the snapshot the app fetched when it opened the link, then opens
   *  the live stream. */
  start(snapshot: CollabSnapshot): void {
    this.shared = snapshot.document
    this.version = snapshot.version
    this.callbacks.onParticipants(snapshot.participants)
    this.connect()
    this.heartbeat = setInterval(() => { void this.sendPresence() }, HEARTBEAT_MS)
  }

  private connect(): void {
    if (this.stopped) return
    this.callbacks.onStatus('connecting')
    const stream = this.transport.open(this.token, { client: this.clientId, name: this.name })
    this.stream = stream
    stream.on('sync', data => {
      const snap = data as CollabSnapshot
      this.callbacks.onStatus('live')
      this.callbacks.onParticipants(snap.participants)
      this.adopt(snap)
    })
    stream.on('presence', data => {
      this.callbacks.onStatus('live')
      this.callbacks.onParticipants((data as { participants: CollabParticipant[] }).participants)
    })
    stream.onError(() => {
      // EventSource reconnects on its own; the app only needs to know that the
      // view may be stale until it does.
      this.callbacks.onStatus('offline')
    })
  }

  /** Applies a shared document, unless it is one this client already has. */
  private adopt(snapshot: CollabSnapshot): void {
    if (snapshot.version < this.version) return
    if (deepEqual(snapshot.document, this.shared)) {
      this.version = snapshot.version
      return
    }
    this.shared = snapshot.document
    this.version = snapshot.version
    this.echo = undefined
    this.callbacks.onDocument(snapshot.document, snapshot.version)
  }

  /**
   * Records the local form of the document the app just adopted. Applying an
   * incoming document normally reshapes it a little (schema migration, writing
   * the live build back into it), and that reshaping is not an edit anyone else
   * needs to hear about.
   */
  suppress(document: unknown): void {
    this.echo = document
  }

  /** Called whenever the local document changes. Cheap to call often. */
  push(document: unknown): void {
    if (this.stopped) return
    // The echo guard: neither the shared document nor the local form of it is
    // an edit.
    if (deepEqual(document, this.shared) || deepEqual(document, this.echo)) {
      this.pending = undefined
      return
    }
    this.pending = document
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = undefined
      void this.flush()
    }, PUSH_DEBOUNCE_MS)
  }

  /** Sends the pending edit now. Serialised: one request at a time, and
   *  anything that piled up meanwhile goes in the next one. */
  async flush(): Promise<void> {
    if (this.stopped || this.inFlight) return
    const document = this.pending
    if (document === undefined) return
    this.pending = undefined
    this.inFlight = true
    try {
      const snapshot = await this.transport.update(this.token, {
        clientId: this.clientId,
        baseVersion: this.version,
        base: this.shared,
        document,
      })
      // The merged result may differ from what was sent, when someone else
      // edited the same fields; that difference is applied locally.
      this.version = snapshot.version
      const previous = this.shared
      this.shared = snapshot.document
      if (!deepEqual(snapshot.document, document) && !deepEqual(snapshot.document, previous)) {
        this.callbacks.onDocument(snapshot.document, snapshot.version)
      }
      this.callbacks.onParticipants(snapshot.participants)
      this.callbacks.onStatus('live')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/no longer valid/i.test(message)) {
        this.callbacks.onStatus('revoked')
        this.stop()
        return
      }
      // Keep the edit: the next push retries it along with whatever follows.
      if (this.pending === undefined) this.pending = document
      this.callbacks.onStatus('offline')
      this.callbacks.onError?.(message)
    } finally {
      this.inFlight = false
      if (this.pending !== undefined && !this.pushTimer && !this.stopped) {
        this.pushTimer = setTimeout(() => {
          this.pushTimer = undefined
          void this.flush()
        }, PUSH_DEBOUNCE_MS)
      }
    }
  }

  private async sendPresence(leaving = false): Promise<void> {
    try {
      const res = await this.transport.presence(this.token, {
        clientId: this.clientId, name: this.name, leaving,
      })
      if (leaving) return
      this.callbacks.onParticipants(res.participants)
    } catch {
      // A missed heartbeat only costs this client its place in the presence
      // list for a few seconds; the next one puts it back.
    }
  }

  /** Renames this participant (used when the viewer signs in mid-session). */
  setName(name: string): void {
    if (name === this.name) return
    this.name = name
    void this.sendPresence()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.pushTimer) clearTimeout(this.pushTimer)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.stream?.close()
    this.stream = undefined
    void this.sendPresence(true)
    this.callbacks.onStatus('offline')
  }
}

/** The browser transport: SSE for the live channel, fetch for everything else. */
export function browserTransport(api: {
  collabUpdate: CollabTransport['update']
  collabPresence: CollabTransport['presence']
}): CollabTransport {
  return {
    open(token, query) {
      const qs = new URLSearchParams(query).toString()
      const source = new EventSource(`/api/collab/${encodeURIComponent(token)}/stream?${qs}`)
      return {
        on(event, handler) {
          source.addEventListener(event, (e: MessageEvent) => {
            try {
              handler(JSON.parse(e.data))
            } catch {
              // A frame we cannot parse is not worth tearing the stream down.
            }
          })
        },
        onError(handler) { source.onerror = () => handler() },
        close() { source.close() },
      }
    },
    update: api.collabUpdate,
    presence: api.collabPresence,
  }
}

/** A stable id for this tab, so a reload rejoins as the same participant
 *  instead of leaving a ghost behind. */
export function tabClientId(): string {
  const KEY = 'ddo-collab-client-id'
  try {
    const existing = sessionStorage.getItem(KEY)
    if (existing) return existing
    const fresh = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    return Math.random().toString(36).slice(2)
  }
}
