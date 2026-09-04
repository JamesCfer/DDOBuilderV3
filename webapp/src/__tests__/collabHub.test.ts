// CollabHub — the server side of several people editing one shared build.
//
// The behaviour that matters: two clients editing at once both keep their work,
// everyone else is told about a change without asking, presence reflects who is
// actually there, and the merged document reaches the store.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { CollabHub, sanitizeName, type StreamSink } from '../server/collabHub'
import { CommunityStore } from '../server/communityStore'

interface Doc {
  name: string
  guildLevel: number
  lives: Array<{ id: string; name: string }>
}

const DOC: Doc = {
  name: 'Thundercleave',
  guildLevel: 100,
  lives: [{ id: 'l1', name: 'Life 1' }],
}

const clone = (d: Doc): Doc => JSON.parse(JSON.stringify(d))

/** Collects the SSE frames a subscriber received, parsed back into events. */
function recorder(): StreamSink & { events: Array<{ event: string; data: any }> } {
  const events: Array<{ event: string; data: any }> = []
  return {
    events,
    write(chunk: string) {
      const match = /^event: (\w+)\ndata: (.*)\n\n$/s.exec(chunk)
      if (match) events.push({ event: match[1], data: JSON.parse(match[2]) })
    },
    end() { /* nothing to release in a fake */ },
  }
}

function setup() {
  const store = new CommunityStore(':memory:')
  const owner = store.register('alice', 'alice@example.com', 'password123')
  const build = store.saveBuild(owner.id, { name: 'Thundercleave', document: clone(DOC) })
  const shared = store.shareBuild(build.id, owner.id)
  const hub = new CollabHub(store)
  return { store, owner, build, hub, token: shared.shareToken! }
}

describe('share links', () => {
  it('mints one token and returns the same one on a second call', () => {
    const { store, owner, build } = setup()
    const first = store.shareBuild(build.id, owner.id).shareToken
    const second = store.shareBuild(build.id, owner.id).shareToken
    expect(first).toBeTruthy()
    expect(second).toBe(first)
  })

  it('resolves a build by its token, and stops resolving once revoked', () => {
    const { store, owner, build, hub, token } = setup()
    expect(hub.resolve(token)?.id).toBe(build.id)
    store.unshareBuild(build.id, owner.id)
    expect(hub.resolve(token)).toBeUndefined()
  })

  it('refuses to share a build belonging to someone else', () => {
    const { store, build } = setup()
    const mallory = store.register('mallory', 'm@example.com', 'password123')
    expect(() => store.shareBuild(build.id, mallory.id)).toThrow(/Forbidden/)
  })

  it('never resolves an empty or unknown token', () => {
    const { hub } = setup()
    expect(hub.resolve('')).toBeUndefined()
    expect(hub.resolve('not-a-real-token')).toBeUndefined()
  })
})

describe('CollabHub rooms', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => { ctx = setup() })

  it('seeds a room from the stored document', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    expect(room.snapshot().document).toEqual(DOC)
    expect(room.version).toBe(1)
  })

  it('hands the same room to everyone holding the link', () => {
    const record = ctx.hub.resolve(ctx.token)!
    expect(ctx.hub.roomFor(record)).toBe(ctx.hub.roomFor(record))
  })

  it('keeps both edits when two people change different fields at once', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)

    const a = clone(DOC); a.guildLevel = 150
    room.applyUpdate({ clientId: 'a', baseVersion: 1, base: DOC, document: a })

    // B started from version 1 as well: it never saw A's guild level.
    const b = clone(DOC); b.name = 'Stormrage'
    const after = room.applyUpdate({ clientId: 'b', baseVersion: 1, base: DOC, document: b })

    expect(after.document).toMatchObject({ guildLevel: 150, name: 'Stormrage' })
    expect(after.version).toBe(3)
  })

  it('does not bump the version for an edit that changes nothing', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    const after = room.applyUpdate({ clientId: 'a', baseVersion: 1, base: DOC, document: clone(DOC) })
    expect(after.version).toBe(1)
  })

  it('pushes a new document to the other clients, not to its author', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    const author = recorder()
    const watcher = recorder()
    room.touch('a', 'Alice', true)
    room.touch('b', 'Bob', false)
    room.subscribe('a', author)
    room.subscribe('b', watcher)
    author.events.length = 0
    watcher.events.length = 0

    const edit = clone(DOC); edit.guildLevel = 150
    room.applyUpdate({ clientId: 'a', baseVersion: 1, base: DOC, document: edit })

    expect(watcher.events.map(e => e.event)).toContain('sync')
    expect(watcher.events.at(-1)!.data.document.guildLevel).toBe(150)
    expect(author.events).toHaveLength(0)
  })

  it('sends the current document the moment a client subscribes', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    const sink = recorder()
    room.subscribe('a', sink)
    expect(sink.events[0].event).toBe('sync')
    expect(sink.events[0].data.document).toEqual(DOC)
  })

  it('lists who is in the build, and drops them when they leave', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    room.touch('a', 'Alice', true)
    room.touch('b', 'Bob', false)
    expect(room.present().map(p => p.name)).toEqual(['Alice', 'Bob'])
    expect(room.present().find(p => p.name === 'Alice')!.isOwner).toBe(true)
    // Two people are told apart by colour.
    expect(room.present()[0].color).not.toBe(room.present()[1].color)

    room.leave('b')
    expect(room.present().map(p => p.name)).toEqual(['Alice'])
  })

  it('forgets a participant that stopped reporting in', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    room.touch('a', 'Alice', true)
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 120_000)
      expect(room.present()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('unsubscribing removes the client from presence', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    room.touch('a', 'Alice', true)
    const unsubscribe = room.subscribe('a', recorder())
    expect(room.present()).toHaveLength(1)
    unsubscribe()
    expect(room.present()).toHaveLength(0)
    expect(room.isEmpty).toBe(true)
  })

  it('writes the merged document back to the store', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    const edit = clone(DOC); edit.guildLevel = 150
    room.applyUpdate({ clientId: 'a', baseVersion: 1, base: DOC, document: edit })
    ctx.hub.flushAll()

    const stored = ctx.store.getBuild(ctx.build.id)!
    expect((stored.document as Doc).guildLevel).toBe(150)
    expect(stored.collabVersion).toBe(2)
  })

  it('reopens a room from the last persisted version after a restart', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    const edit = clone(DOC); edit.guildLevel = 150
    room.applyUpdate({ clientId: 'a', baseVersion: 1, base: DOC, document: edit })
    ctx.hub.flushAll()
    ctx.hub.stop()

    const fresh = new CollabHub(ctx.store)
    const reopened = fresh.roomFor(fresh.resolve(ctx.token)!)
    expect(reopened.version).toBe(2)
    expect((reopened.snapshot().document as Doc).guildLevel).toBe(150)
  })

  it('takes the build name from the shared document', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    const edit = clone(DOC); edit.name = 'Renamed'
    expect(room.applyUpdate({ clientId: 'a', baseVersion: 1, base: DOC, document: edit }).name)
      .toBe('Renamed')
  })

  it('closeRoom flushes and drops the room', () => {
    const room = ctx.hub.roomFor(ctx.hub.resolve(ctx.token)!)
    const edit = clone(DOC); edit.guildLevel = 150
    room.applyUpdate({ clientId: 'a', baseVersion: 1, base: DOC, document: edit })
    ctx.hub.closeRoom(ctx.build.id)

    expect((ctx.store.getBuild(ctx.build.id)!.document as Doc).guildLevel).toBe(150)
    expect(ctx.hub.liveRoom(ctx.build.id)).toBeUndefined()
  })
})

describe('sanitizeName', () => {
  it('keeps a normal name and falls back for anything unusable', () => {
    expect(sanitizeName('Bob')).toBe('Bob')
    expect(sanitizeName('   ')).toBe('Guest')
    expect(sanitizeName(undefined)).toBe('Guest')
    expect(sanitizeName(42)).toBe('Guest')
  })

  it('strips the control characters that would break an SSE frame', () => {
    expect(sanitizeName('Bo\nb\r\ndata: x')).toBe('Bo b  data: x')
  })

  it('caps the length so one participant cannot flood the presence list', () => {
    expect(sanitizeName('x'.repeat(200))).toHaveLength(32)
  })
})
