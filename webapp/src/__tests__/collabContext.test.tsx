// @vitest-environment jsdom
//
// CollabProvider — the join between the open character document and a shared
// editing session.
//
// The two directions that have to work: a document arriving from the server
// becomes the character on screen (without dragging this viewer to whatever
// build the sender happens to be looking at), and an edit made here reaches the
// server without the incoming document bouncing straight back.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { emptyBuild, type CharacterDocument } from '../types/ddo'

const collabOpen = vi.fn()
const collabUpdate = vi.fn()
const collabPresence = vi.fn(async () => ({ version: 1, participants: [] }))

vi.mock('../lib/community/api', () => ({
  communityApi: {
    collabOpen: (...args: unknown[]) => collabOpen(...args),
    collabUpdate: (...args: unknown[]) => collabUpdate(...args),
    collabPresence: (...args: unknown[]) => collabPresence(),
    me: () => Promise.resolve({ user: null }),
  },
  getToken: () => null,
  setToken: () => {},
}))

/** EventSource does not exist in jsdom; the stream is not what this file is
 *  about, so it is a stub that records the handlers and never fires. */
class FakeEventSource {
  static last: FakeEventSource | undefined
  onerror: (() => void) | null = null
  private readonly handlers = new Map<string, (e: MessageEvent) => void>()
  closed = false
  constructor(readonly url: string) { FakeEventSource.last = this }
  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    this.handlers.set(event, handler)
  }
  emit(event: string, data: unknown) {
    this.handlers.get(event)?.({ data: JSON.stringify(data) } as MessageEvent)
  }
  close() { this.closed = true }
}
;(globalThis as Record<string, unknown>).EventSource = FakeEventSource
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function documentWith(name: string, guildLevel: number): CharacterDocument {
  const build = { ...emptyBuild(), id: 'b1', name }
  return {
    id: 'doc1',
    name,
    guildLevel,
    applyGuildBuffs: true,
    characterTomes: {},
    contentIDontOwn: [],
    lives: [{
      id: 'l1',
      name: 'Life 1',
      race: build.race,
      alignment: build.alignment,
      abilityTomes: {},
      skillTomes: {},
      selfBuffs: [],
      specialFeats: [],
      monitoredBonuses: [],
      builds: [build],
    }],
    activeLifeId: 'l1',
    activeBuildId: 'b1',
    _v: 2,
  }
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  vi.clearAllMocks()
})

/** Mounts the provider stack and exposes the pieces a test drives. */
async function mount() {
  const { CharacterProvider } = await import('../context/CharacterContext')
  const { DocumentProvider, useDocument } = await import('../context/DocumentContext')
  const { AuthProvider } = await import('../context/AuthContext')
  const { BuildLogProvider } = await import('../context/BuildLogContext')
  const { CollabProvider, useCollab } = await import('../context/CollabContext')

  const seen: {
    doc?: CharacterDocument
    setDoc?: (doc: CharacterDocument) => void
    collab?: ReturnType<typeof useCollab>
  } = {}
  function Probe() {
    const { doc, setDoc } = useDocument()
    seen.doc = doc
    seen.setDoc = setDoc
    seen.collab = useCollab()
    return <div data-name={doc.name} />
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.push({ root, container })
  await act(async () => {
    root.render(
      <BuildLogProvider>
        <CharacterProvider>
          <DocumentProvider>
            <AuthProvider>
              <CollabProvider><Probe /></CollabProvider>
            </AuthProvider>
          </DocumentProvider>
        </CharacterProvider>
      </BuildLogProvider>,
    )
  })
  return seen
}

describe('CollabProvider', () => {
  beforeEach(() => {
    collabOpen.mockResolvedValue({
      buildId: 'b1',
      name: 'Thundercleave',
      owner: 'alice',
      version: 1,
      document: documentWith('Thundercleave', 100),
      participants: [{ id: 'other', name: 'Bob', color: '#4f9ae8', isOwner: false }],
    })
    collabUpdate.mockImplementation(async (_token: string, payload: { document: unknown }) => ({
      buildId: 'b1', name: 'Thundercleave', version: 2,
      document: payload.document, participants: [],
    }))
  })

  it('loads the shared document and reports who is in the build', async () => {
    const seen = await mount()
    await act(async () => { await seen.collab!.join('tok') })

    expect(seen.doc!.name).toBe('Thundercleave')
    expect(seen.doc!.guildLevel).toBe(100)
    expect(seen.collab!.token).toBe('tok')
    expect(seen.collab!.owner).toBe('alice')
    expect(seen.collab!.participants.map(p => p.name)).toEqual(['Bob'])
  })

  it('applies a document that arrives on the stream', async () => {
    const seen = await mount()
    await act(async () => { await seen.collab!.join('tok') })

    await act(async () => {
      FakeEventSource.last!.emit('sync', {
        buildId: 'b1', name: 'Thundercleave', version: 2,
        document: documentWith('Thundercleave', 175), participants: [],
      })
    })

    expect(seen.doc!.guildLevel).toBe(175)
  })

  it('keeps this viewer on the build they were looking at', async () => {
    const seen = await mount()
    await act(async () => { await seen.collab!.join('tok') })

    // The sender was on a life that does not exist here; the pointers in the
    // incoming document must not move this client anywhere.
    const incoming = documentWith('Thundercleave', 175)
    incoming.activeLifeId = 'l1'
    incoming.activeBuildId = 'b1'
    await act(async () => {
      FakeEventSource.last!.emit('sync', {
        buildId: 'b1', name: 'Thundercleave', version: 2, document: incoming, participants: [],
      })
    })

    expect(seen.doc!.activeLifeId).toBe('l1')
    expect(seen.doc!.activeBuildId).toBe('b1')
  })

  it('does not push a document that came from the server straight back', async () => {
    const seen = await mount()
    await act(async () => { await seen.collab!.join('tok') })
    collabUpdate.mockClear()

    await act(async () => {
      FakeEventSource.last!.emit('sync', {
        buildId: 'b1', name: 'Thundercleave', version: 2,
        document: documentWith('Thundercleave', 175), participants: [],
      })
    })
    await act(async () => { await new Promise(r => setTimeout(r, 600)) })

    expect(collabUpdate).not.toHaveBeenCalled()
  })

  it('sends a local edit to the server', async () => {
    const seen = await mount()
    await act(async () => { await seen.collab!.join('tok') })
    collabUpdate.mockClear()

    // A plain document edit, of the kind the Character page makes.
    await act(async () => { seen.setDoc!({ ...seen.doc!, guildLevel: 42 }) })
    await act(async () => { await new Promise(r => setTimeout(r, 600)) })

    expect(collabUpdate).toHaveBeenCalledTimes(1)
    const payload = collabUpdate.mock.calls[0][1] as { document: CharacterDocument }
    expect(payload.document.guildLevel).toBe(42)
  })

  it('leaving ends the session and closes the stream', async () => {
    const seen = await mount()
    await act(async () => { await seen.collab!.join('tok') })
    const stream = FakeEventSource.last!

    await act(async () => { seen.collab!.leave() })

    expect(stream.closed).toBe(true)
    expect(seen.collab!.token).toBeNull()
  })

  it('surfaces a revoked link instead of joining', async () => {
    collabOpen.mockRejectedValue(new Error('This share link is no longer valid'))
    const seen = await mount()

    await act(async () => {
      await seen.collab!.join('gone').catch(() => {})
    })

    expect(seen.collab!.token).toBeNull()
    expect(seen.collab!.error).toMatch(/no longer valid/)
  })
})
