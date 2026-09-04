// CollabSession — the browser half of shared editing.
//
// The behaviour worth pinning down: local edits are batched and sent with the
// version they were made against, a document that came FROM the server is never
// echoed back as a local edit, and a revoked link ends the session instead of
// retrying forever.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { CollabSession, type CollabTransport, type CollabStream } from '../lib/collab/session'
import type { CollabSnapshot } from '../lib/community/api'

interface Doc { name: string; guildLevel: number }

const DOC: Doc = { name: 'Thundercleave', guildLevel: 100 }

function snapshot(document: unknown, version: number): CollabSnapshot {
  return { buildId: 'b1', name: 'Thundercleave', version, document, participants: [] }
}

/** A transport that records what was sent and lets a test push stream events. */
function fakeTransport() {
  const handlers = new Map<string, (data: unknown) => void>()
  const sent: Array<{ baseVersion: number; base: unknown; document: unknown }> = []
  let reply: (payload: { document: unknown }) => CollabSnapshot =
    p => snapshot(p.document, 2)
  let failWith: Error | null = null
  let closed = false

  const stream: CollabStream = {
    on(event, handler) { handlers.set(event, handler) },
    onError() { /* the tests drive failures through `update` */ },
    close() { closed = true },
  }

  const transport: CollabTransport = {
    open: () => stream,
    async update(_token, payload) {
      sent.push({ baseVersion: payload.baseVersion, base: payload.base, document: payload.document })
      if (failWith) throw failWith
      return reply({ document: payload.document })
    },
    async presence() { return { version: 1, participants: [] } },
  }

  return {
    transport,
    sent,
    get closed() { return closed },
    emit(event: string, data: unknown) { handlers.get(event)?.(data) },
    replyWith(fn: typeof reply) { reply = fn },
    failNext(err: Error | null) { failWith = err },
  }
}

function session(fake: ReturnType<typeof fakeTransport>) {
  const applied: unknown[] = []
  const statuses: string[] = []
  const s = new CollabSession('tok', 'Alice', 'client-a', fake.transport, {
    onDocument: doc => applied.push(doc),
    onParticipants: () => {},
    onStatus: st => statuses.push(st),
  })
  s.start(snapshot(DOC, 1))
  return { s, applied, statuses }
}

describe('CollabSession', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('sends a local edit with the shared version it was based on', async () => {
    const fake = fakeTransport()
    const { s } = session(fake)

    s.push({ ...DOC, guildLevel: 150 })
    await vi.advanceTimersByTimeAsync(500)

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]).toMatchObject({ baseVersion: 1, base: DOC })
    expect(fake.sent[0].document).toEqual({ ...DOC, guildLevel: 150 })
  })

  it('batches a burst of edits into one request', async () => {
    const fake = fakeTransport()
    const { s } = session(fake)

    s.push({ ...DOC, guildLevel: 110 })
    s.push({ ...DOC, guildLevel: 120 })
    s.push({ ...DOC, guildLevel: 130 })
    await vi.advanceTimersByTimeAsync(500)

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0].document).toEqual({ ...DOC, guildLevel: 130 })
  })

  it('does not send a document identical to the shared one', async () => {
    const fake = fakeTransport()
    const { s } = session(fake)

    s.push({ ...DOC })
    await vi.advanceTimersByTimeAsync(500)

    expect(fake.sent).toHaveLength(0)
  })

  it('applies an incoming document and never echoes it back', async () => {
    const fake = fakeTransport()
    const { s, applied } = session(fake)

    fake.emit('sync', snapshot({ ...DOC, name: 'Stormrage' }, 2))
    expect(applied).toEqual([{ ...DOC, name: 'Stormrage' }])

    // The app now holds exactly what arrived; pushing it back is not an edit.
    s.push({ ...DOC, name: 'Stormrage' })
    await vi.advanceTimersByTimeAsync(500)
    expect(fake.sent).toHaveLength(0)
  })

  it('applies the merged result when the server reshaped the edit', async () => {
    const fake = fakeTransport()
    fake.replyWith(() => snapshot({ name: 'Stormrage', guildLevel: 150 }, 2))
    const { s, applied } = session(fake)

    s.push({ ...DOC, guildLevel: 150 })
    await vi.advanceTimersByTimeAsync(500)

    // Someone else renamed the character while this client was editing.
    expect(applied).toEqual([{ name: 'Stormrage', guildLevel: 150 }])
  })

  it('sends the following edit against the version the server returned', async () => {
    const fake = fakeTransport()
    const { s } = session(fake)

    s.push({ ...DOC, guildLevel: 150 })
    await vi.advanceTimersByTimeAsync(500)
    s.push({ ...DOC, guildLevel: 160 })
    await vi.advanceTimersByTimeAsync(500)

    expect(fake.sent[1].baseVersion).toBe(2)
    expect(fake.sent[1].base).toEqual({ ...DOC, guildLevel: 150 })
  })

  it('ignores a stream frame older than what it already has', () => {
    const fake = fakeTransport()
    const { applied } = session(fake)
    fake.emit('sync', snapshot({ ...DOC, guildLevel: 1 }, 0))
    expect(applied).toHaveLength(0)
  })

  it('keeps a failed edit and retries it', async () => {
    const fake = fakeTransport()
    const { s, statuses } = session(fake)

    fake.failNext(new Error('Failed to fetch'))
    s.push({ ...DOC, guildLevel: 150 })
    await vi.advanceTimersByTimeAsync(500)
    expect(statuses).toContain('offline')

    fake.failNext(null)
    await vi.advanceTimersByTimeAsync(500)
    expect(fake.sent).toHaveLength(2)
    expect(fake.sent[1].document).toEqual({ ...DOC, guildLevel: 150 })
  })

  it('stops for good when the link has been revoked', async () => {
    const fake = fakeTransport()
    const { s, statuses } = session(fake)

    fake.failNext(new Error('This share link is no longer valid'))
    s.push({ ...DOC, guildLevel: 150 })
    await vi.advanceTimersByTimeAsync(500)

    expect(statuses).toContain('revoked')
    expect(fake.closed).toBe(true)

    s.push({ ...DOC, guildLevel: 160 })
    await vi.advanceTimersByTimeAsync(500)
    expect(fake.sent).toHaveLength(1)
  })

  it('closes the stream when the session is stopped', () => {
    const fake = fakeTransport()
    const { s } = session(fake)
    s.stop()
    expect(fake.closed).toBe(true)
  })
})
