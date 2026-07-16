// CommunityStore unit tests — accounts, sessions, saved builds,
// star-to-publish, votes, community listing and JSON-file persistence.

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CommunityStore,
  type BuildSnapshot,
  type CommunityUser,
} from '../server/communityStore'

function snapshot(overrides: Partial<BuildSnapshot> = {}): BuildSnapshot {
  return {
    race: 'Human',
    classes: ['Monk'],
    classesLabel: 'Monk 20',
    totalLevel: 20,
    hp: 1000,
    ac: 60,
    prr: 100,
    mrr: 50,
    meleePower: 120,
    rangedPower: 40,
    ...overrides,
  }
}

/** Internal state shape — used only to fake session expiry in tests. */
type StoreInternals = {
  state: { sessions: Record<string, { userId: string; expiresAt: string }> }
}

describe('CommunityStore — accounts', () => {
  let store: CommunityStore
  beforeEach(() => { store = new CommunityStore(':memory:') })

  it('registers a valid user and hashes the password with scrypt salt:hash', () => {
    const user = store.register('alice', 'alice@example.com', 'password123')
    expect(user.username).toBe('alice')
    expect(user.email).toBe('alice@example.com')
    expect(user.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
    expect(user.passwordHash).not.toContain('password123')
    expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects invalid usernames', () => {
    expect(() => store.register('ab', 'a@b.c', 'password123')).toThrow(/3-24/)
    expect(() => store.register('a'.repeat(25), 'a@b.c', 'password123')).toThrow(/3-24/)
    expect(() => store.register('bad name!', 'a@b.c', 'password123')).toThrow(/letters, numbers/)
  })

  it('rejects short passwords and invalid emails', () => {
    expect(() => store.register('alice', 'a@b.c', 'short')).toThrow(/at least 8/)
    expect(() => store.register('alice', 'not-an-email', 'password123')).toThrow(/email/)
  })

  it('rejects duplicate usernames case-insensitively and duplicate emails', () => {
    store.register('alice', 'alice@example.com', 'password123')
    expect(() => store.register('ALICE', 'other@example.com', 'password123'))
      .toThrow(/already taken/)
    expect(() => store.register('alice2', 'Alice@Example.com', 'password123'))
      .toThrow(/already registered/)
  })

  it('verifies login by username or email, rejects wrong password', () => {
    store.register('alice', 'alice@example.com', 'password123')
    expect(store.verifyLogin('alice', 'password123')?.username).toBe('alice')
    expect(store.verifyLogin('ALICE', 'password123')?.username).toBe('alice')
    expect(store.verifyLogin('alice@example.com', 'password123')?.username).toBe('alice')
    expect(store.verifyLogin('alice', 'wrong-password')).toBeNull()
    expect(store.verifyLogin('nobody', 'password123')).toBeNull()
  })

  it('publicUser exposes only id + username', () => {
    const user = store.register('alice', 'alice@example.com', 'password123')
    expect(store.publicUser(user)).toEqual({ id: user.id, username: 'alice' })
  })
})

describe('CommunityStore — sessions', () => {
  let store: CommunityStore
  let user: CommunityUser
  beforeEach(() => {
    store = new CommunityStore(':memory:')
    user = store.register('alice', 'alice@example.com', 'password123')
  })

  it('creates a 64-hex-char token resolving to the user id', () => {
    const token = store.createSession(user.id)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(store.getSession(token)).toBe(user.id)
  })

  it('deleteSession invalidates the token', () => {
    const token = store.createSession(user.id)
    store.deleteSession(token)
    expect(store.getSession(token)).toBeNull()
  })

  it('expired sessions are pruned on access', () => {
    const token = store.createSession(user.id)
    const internals = store as unknown as StoreInternals
    internals.state.sessions[token].expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(store.getSession(token)).toBeNull()
    expect(internals.state.sessions[token]).toBeUndefined()
  })

  it('unknown tokens resolve to null', () => {
    expect(store.getSession('deadbeef')).toBeNull()
  })
})

describe('CommunityStore — saved builds', () => {
  let store: CommunityStore
  let alice: CommunityUser
  let bob: CommunityUser
  beforeEach(() => {
    store = new CommunityStore(':memory:')
    alice = store.register('alice', 'alice@example.com', 'password123')
    bob = store.register('bob', 'bob@example.com', 'password123')
  })

  it('saves a new build with defaults and trims the name', () => {
    const build = store.saveBuild(alice.id, { name: '  My Monk  ', document: { x: 1 } })
    expect(build.id).toMatch(/^[0-9a-f]{16}$/)
    expect(build.name).toBe('My Monk')
    expect(build.ownerId).toBe(alice.id)
    expect(build.published).toBe(false)
    expect(build.votes).toEqual({})
    expect(build.createdAt).toBe(build.updatedAt)
  })

  it('rejects empty and over-long names', () => {
    expect(() => store.saveBuild(alice.id, { name: '   ', document: {} })).toThrow(/required/)
    expect(() => store.saveBuild(alice.id, { name: 'x'.repeat(81), document: {} }))
      .toThrow(/80 characters/)
  })

  it('upserts by id, keeping createdAt and bumping updatedAt', () => {
    const first = store.saveBuild(alice.id, { name: 'v1', document: { v: 1 } })
    const second = store.saveBuild(alice.id, { id: first.id, name: 'v2', document: { v: 2 } })
    expect(second.id).toBe(first.id)
    expect(second.name).toBe('v2')
    expect(second.document).toEqual({ v: 2 })
    expect(second.createdAt).toBe(first.createdAt)
    expect(store.listBuilds(alice.id)).toHaveLength(1)
  })

  it('rejects upsert of an unknown id or someone else\'s build', () => {
    const build = store.saveBuild(alice.id, { name: 'Mine', document: {} })
    expect(() => store.saveBuild(alice.id, { id: 'nope', name: 'x', document: {} }))
      .toThrow('Build not found')
    expect(() => store.saveBuild(bob.id, { id: build.id, name: 'stolen', document: {} }))
      .toThrow(/Forbidden/)
  })

  it('listBuilds returns only the owner\'s builds', () => {
    store.saveBuild(alice.id, { name: 'A', document: {} })
    store.saveBuild(bob.id, { name: 'B', document: {} })
    expect(store.listBuilds(alice.id).map(b => b.name)).toEqual(['A'])
    expect(store.listBuilds(bob.id).map(b => b.name)).toEqual(['B'])
  })

  it('deleteBuild enforces ownership', () => {
    const build = store.saveBuild(alice.id, { name: 'A', document: {} })
    expect(() => store.deleteBuild(build.id, bob.id)).toThrow(/Forbidden/)
    store.deleteBuild(build.id, alice.id)
    expect(store.getBuild(build.id)).toBeUndefined()
    expect(() => store.deleteBuild(build.id, alice.id)).toThrow('Build not found')
  })
})

describe('CommunityStore — publish + votes', () => {
  let store: CommunityStore
  let alice: CommunityUser
  let bob: CommunityUser
  let carol: CommunityUser
  let buildId: string
  beforeEach(() => {
    store = new CommunityStore(':memory:')
    alice = store.register('alice', 'alice@example.com', 'password123')
    bob = store.register('bob', 'bob@example.com', 'password123')
    carol = store.register('carol', 'carol@example.com', 'password123')
    buildId = store.saveBuild(alice.id, { name: 'Monk', document: {} }).id
  })

  it('publishBuild sets published/publishedAt/snapshot; publishedAt sticks', () => {
    const published = store.publishBuild(buildId, alice.id, snapshot())
    expect(published.published).toBe(true)
    expect(published.publishedAt).toBeDefined()
    const firstPublishedAt = published.publishedAt
    store.unpublishBuild(buildId, alice.id)
    expect(store.getBuild(buildId)!.published).toBe(false)
    const again = store.publishBuild(buildId, alice.id, snapshot())
    expect(again.publishedAt).toBe(firstPublishedAt)
  })

  it('publish/unpublish enforce ownership', () => {
    expect(() => store.publishBuild(buildId, bob.id, snapshot())).toThrow(/Forbidden/)
    expect(() => store.unpublishBuild(buildId, bob.id)).toThrow(/Forbidden/)
  })

  it('rejects votes on unpublished builds', () => {
    expect(() => store.vote(buildId, bob.id, 1)).toThrow('Build not found')
  })

  it('rejects owners voting on their own build', () => {
    store.publishBuild(buildId, alice.id, snapshot())
    expect(() => store.vote(buildId, alice.id, 1)).toThrow(/own build/)
  })

  it('counts, changes and removes votes', () => {
    store.publishBuild(buildId, alice.id, snapshot())
    expect(store.vote(buildId, bob.id, 1)).toBe(1)
    expect(store.vote(buildId, carol.id, 1)).toBe(2)
    expect(store.vote(buildId, carol.id, -1)).toBe(0)   // change vote
    expect(store.vote(buildId, bob.id, 0)).toBe(-1)     // remove vote
    expect(store.score(store.getBuild(buildId)!)).toBe(-1)
  })

  it('getPublishedBuild returns the document + author only when published', () => {
    expect(store.getPublishedBuild(buildId)).toBeUndefined()
    store.publishBuild(buildId, alice.id, snapshot())
    const published = store.getPublishedBuild(buildId)
    expect(published?.author).toBe('alice')
    expect(published?.document).toEqual({})
    store.unpublishBuild(buildId, alice.id)
    expect(store.getPublishedBuild(buildId)).toBeUndefined()
  })
})

describe('CommunityStore — community listing', () => {
  let store: CommunityStore
  let alice: CommunityUser
  let bob: CommunityUser
  let voter: CommunityUser
  let monkId: string
  let wizId: string
  let ftrId: string
  let noSnapId: string

  beforeEach(() => {
    store = new CommunityStore(':memory:')
    alice = store.register('alice', 'alice@example.com', 'password123')
    bob = store.register('bob', 'bob@example.com', 'password123')
    voter = store.register('voter', 'voter@example.com', 'password123')

    monkId = store.saveBuild(alice.id, { name: 'Monk', document: {} }).id
    store.publishBuild(monkId, alice.id, snapshot({
      race: 'Human', classes: ['Monk'], classesLabel: 'Monk 20',
      hp: 1000, ac: 60, prr: 100, mrr: 50, meleePower: 120, rangedPower: 40, totalLevel: 20,
    }))

    wizId = store.saveBuild(bob.id, { name: 'Wizard', document: {} }).id
    store.publishBuild(wizId, bob.id, snapshot({
      race: 'Elf', classes: ['Wizard'], classesLabel: 'Wizard 20',
      hp: 600, ac: 40, prr: 30, mrr: 90, meleePower: 20, rangedPower: 25, totalLevel: 20,
    }))

    ftrId = store.saveBuild(bob.id, { name: 'FtrMonk', document: {} }).id
    store.publishBuild(ftrId, bob.id, snapshot({
      race: 'Dwarf', classes: ['Fighter', 'Monk'], classesLabel: 'Fighter 12 / Monk 8',
      hp: 1400, ac: 55, prr: 160, mrr: 40, meleePower: 90, rangedPower: 10, totalLevel: 20,
    }))

    // Published build with no snapshot (must sort last on numeric keys).
    noSnapId = store.saveBuild(alice.id, { name: 'NoSnap', document: {} }).id
    store.publishBuild(noSnapId, alice.id, snapshot())
    const record = store.getBuild(noSnapId)!
    delete record.snapshot

    // Unpublished builds never appear.
    store.saveBuild(alice.id, { name: 'Draft', document: {} })

    // Votes: Monk +2, Wizard -1, FtrMonk +1.
    store.vote(monkId, bob.id, 1)
    store.vote(monkId, voter.id, 1)
    store.vote(wizId, voter.id, -1)
    store.vote(ftrId, voter.id, 1)
  })

  it('lists only published builds with author + score', () => {
    const listing = store.communityList()
    expect(listing).toHaveLength(4)
    expect(listing.map(l => l.name)).not.toContain('Draft')
    const monk = listing.find(l => l.id === monkId)!
    expect(monk.author).toBe('alice')
    expect(monk.score).toBe(2)
  })

  it('never leaks emails or password hashes', () => {
    const json = JSON.stringify(store.communityList({ viewerId: voter.id }))
    expect(json).not.toContain('@example.com')
    expect(json).not.toContain('passwordHash')
    expect(json).not.toMatch(/[0-9a-f]{32}:[0-9a-f]{128}/) // scrypt salt:hash shape
  })

  it('filters by class membership and by exact race', () => {
    expect(store.communityList({ cls: 'Monk' }).map(l => l.id).sort())
      .toEqual([monkId, ftrId].sort())
    expect(store.communityList({ cls: 'Wizard' }).map(l => l.id)).toEqual([wizId])
    expect(store.communityList({ race: 'Dwarf' }).map(l => l.id)).toEqual([ftrId])
    expect(store.communityList({ cls: 'Monk', race: 'Human' }).map(l => l.id)).toEqual([monkId])
  })

  it('sorts by votes (default, desc) and respects asc order', () => {
    const desc = store.communityList()
    expect(desc.slice(0, 3).map(l => l.id)).toEqual([monkId, ftrId, noSnapId])
    expect(desc[3].id).toBe(wizId)
    const asc = store.communityList({ order: 'asc' })
    expect(asc[0].id).toBe(wizId)
  })

  it('sorts by newest (publishedAt)', () => {
    const store2 = new CommunityStore(':memory:')
    const u = store2.register('user_a', 'u@example.com', 'password123')
    const v = store2.register('user_b', 'v@example.com', 'password123')
    const first = store2.saveBuild(u.id, { name: 'first', document: {} }).id
    const second = store2.saveBuild(u.id, { name: 'second', document: {} }).id
    store2.publishBuild(first, u.id, snapshot())
    store2.publishBuild(second, u.id, snapshot())
    store2.getBuild(first)!.publishedAt = '2026-01-01T00:00:00.000Z'
    store2.getBuild(second)!.publishedAt = '2026-02-01T00:00:00.000Z'
    store2.vote(first, v.id, 1) // votes must not affect 'newest'
    expect(store2.communityList({ sort: 'newest' }).map(l => l.name))
      .toEqual(['second', 'first'])
    expect(store2.communityList({ sort: 'newest', order: 'asc' }).map(l => l.name))
      .toEqual(['first', 'second'])
  })

  it.each([
    ['hp', ['FtrMonk', 'Monk', 'Wizard']],
    ['ac', ['Monk', 'FtrMonk', 'Wizard']],
    ['prr', ['FtrMonk', 'Monk', 'Wizard']],
    ['mrr', ['Wizard', 'Monk', 'FtrMonk']],
    ['meleePower', ['Monk', 'FtrMonk', 'Wizard']],
    ['rangedPower', ['Monk', 'Wizard', 'FtrMonk']],
  ] as const)('sorts by %s desc with missing snapshot last', (key, expected) => {
    const names = store.communityList({ sort: key }).map(l => l.name)
    expect(names).toEqual([...expected, 'NoSnap'])
  })

  it('missing snapshot sorts last even ascending', () => {
    const ids = store.communityList({ sort: 'hp', order: 'asc' }).map(l => l.id)
    expect(ids).toEqual([wizId, monkId, ftrId, noSnapId])
  })

  it('sorts by totalLevel', () => {
    store.getBuild(wizId)!.snapshot!.totalLevel = 12
    const ids = store.communityList({ sort: 'totalLevel', order: 'asc' }).map(l => l.id)
    expect(ids[0]).toBe(wizId)
    expect(ids[3]).toBe(noSnapId)
  })

  it('reports myVote for the viewer and 0 for anonymous', () => {
    const forVoter = store.communityList({ viewerId: voter.id })
    expect(forVoter.find(l => l.id === wizId)?.myVote).toBe(-1)
    expect(forVoter.find(l => l.id === monkId)?.myVote).toBe(1)
    const anonymous = store.communityList()
    expect(anonymous.every(l => l.myVote === 0)).toBe(true)
  })
})

describe('CommunityStore — persistence', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'community-store-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('round-trips users, sessions, builds and votes through the JSON file', () => {
    const file = join(dir, 'community.json')
    const store = new CommunityStore(file)
    const alice = store.register('alice', 'alice@example.com', 'password123')
    const bob = store.register('bob', 'bob@example.com', 'password123')
    const token = store.createSession(alice.id)
    const buildId = store.saveBuild(alice.id, { name: 'Monk', document: { deep: [1, 2] } }).id
    store.publishBuild(buildId, alice.id, snapshot())
    store.vote(buildId, bob.id, 1)

    expect(existsSync(file)).toBe(true)
    expect(existsSync(`${file}.tmp`)).toBe(false) // atomic write leaves no temp file

    const reloaded = new CommunityStore(file)
    expect(reloaded.getSession(token)).toBe(alice.id)
    expect(reloaded.verifyLogin('alice', 'password123')?.id).toBe(alice.id)
    const build = reloaded.getBuild(buildId)!
    expect(build.name).toBe('Monk')
    expect(build.document).toEqual({ deep: [1, 2] })
    expect(build.published).toBe(true)
    expect(reloaded.score(build)).toBe(1)
    expect(reloaded.communityList()[0].author).toBe('alice')
  })

  it('starts empty when the file does not exist and :memory: never writes', () => {
    const file = join(dir, 'missing.json')
    const store = new CommunityStore(file)
    expect(store.communityList()).toEqual([])

    const mem = new CommunityStore(':memory:')
    mem.register('alice', 'alice@example.com', 'password123')
    expect(existsSync(':memory:')).toBe(false)

    // The real-file store persisted nothing yet is created on first mutation.
    store.register('bob', 'bob@example.com', 'password123')
    expect(existsSync(file)).toBe(true)
    const onDisk = JSON.parse(readFileSync(file, 'utf-8'))
    expect(onDisk.users).toHaveLength(1)
  })
})

describe('CommunityStore — Google sign-in', () => {
  let store: CommunityStore
  beforeEach(() => { store = new CommunityStore(':memory:') })

  it('creates a passwordless account with a username derived from the display name', () => {
    const user = store.loginWithGoogle('google-sub-1', 'pepper@example.com', 'Pepper Mill')
    expect(user.googleId).toBe('google-sub-1')
    expect(user.email).toBe('pepper@example.com')
    expect(user.username).toBe('Pepper_Mill')
    expect(user.passwordHash).toBe('')
    // A Google-only account can never password-login.
    expect(store.verifyLogin('Pepper_Mill', 'anything123')).toBeNull()
  })

  it('returns the same account on repeat logins with the same Google sub', () => {
    const first = store.loginWithGoogle('google-sub-1', 'pepper@example.com', 'Pepper')
    const second = store.loginWithGoogle('google-sub-1', 'other-email@example.com', 'Renamed')
    expect(second.id).toBe(first.id)
  })

  it('links to an existing password account with the same email', () => {
    const existing = store.register('alice', 'alice@example.com', 'password123')
    const viaGoogle = store.loginWithGoogle('google-sub-2', 'Alice@Example.com', 'Alice A')
    expect(viaGoogle.id).toBe(existing.id)
    expect(viaGoogle.googleId).toBe('google-sub-2')
    // Password login still works after linking.
    expect(store.verifyLogin('alice', 'password123')?.id).toBe(existing.id)
  })

  it('suffixes the username on collision and sanitizes short/invalid names', () => {
    store.register('Pepper', 'first@example.com', 'password123')
    const clash = store.loginWithGoogle('google-sub-3', 'second@example.com', 'Pepper')
    expect(clash.username).toBe('Pepper2')
    const tiny = store.loginWithGoogle('google-sub-4', 'x@example.com', '阿')
    expect(tiny.username.length).toBeGreaterThanOrEqual(3)
    expect(/^[A-Za-z0-9_]+$/.test(tiny.username)).toBe(true)
  })

  it('rejects identities missing sub or a valid email', () => {
    expect(() => store.loginWithGoogle('', 'a@b.com')).toThrow(/subject/)
    expect(() => store.loginWithGoogle('sub', 'not-an-email')).toThrow(/email/)
  })
})
