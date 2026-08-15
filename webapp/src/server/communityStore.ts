// CommunityStore — accounts, saved builds, star-to-publish and votes for the
// community build-sharing platform.
//
// Pure, dependency-free store class (node builtins only: crypto, fs, path)
// persisting its whole state to a single JSON file. Every mutation is written
// atomically (write to `${path}.tmp`, then rename). The special path
// ':memory:' keeps everything in memory and never touches disk (for tests).
//
// Methods throw Error with a clear message on invalid input; the route layer
// maps those to 400/401/403/404. Ownership violations use a 'Forbidden:'
// message prefix and missing builds use exactly 'Build not found' so the
// route layer can distinguish 403/404 without a custom error hierarchy.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import * as fs from 'fs'

export interface CommunityUser {
  id: string
  username: string
  email: string
  /** Empty string for Google-only accounts (password login always fails). */
  passwordHash: string
  /** Google `sub` claim when the account is linked to a Google identity. */
  googleId?: string
  createdAt: string
  /**
   * Saved appearance: the chosen preset, plus any custom palette the user
   * mixed. Stored on the account so a signed-in user's colours follow them to
   * another browser; signed-out users keep the same shape in localStorage.
   */
  theme?: {
    /** Preset id, or 'custom' when the palette below is in use. */
    id?: string
    /** Preset a custom palette was mixed on top of. */
    base?: string
    /** Token name → CSS colour, e.g. { '--color-gold': '#44ff88' }. */
    custom?: Record<string, string>
  }
}

export interface BuildSnapshot {
  race: string
  classes: string[]
  classesLabel: string
  totalLevel: number
  hp: number
  ac: number
  prr: number
  mrr: number
  meleePower: number
  rangedPower: number
}

export interface SavedBuildRecord {
  id: string
  ownerId: string
  name: string
  document: unknown
  createdAt: string
  updatedAt: string
  published: boolean
  publishedAt?: string
  snapshot?: BuildSnapshot
  votes: Record<string, 1 | -1>
}

export interface CommunityListing {
  id: string
  name: string
  author: string
  publishedAt: string
  snapshot?: BuildSnapshot
  score: number
  myVote: 1 | -1 | 0
}

interface SessionRecord {
  userId: string
  expiresAt: string
}

interface StoreState {
  users: CommunityUser[]
  builds: SavedBuildRecord[]
  sessions: Record<string, SessionRecord>
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const NUMERIC_SORT_KEYS = [
  'hp', 'ac', 'prr', 'mrr', 'meleePower', 'rangedPower', 'totalLevel',
] as const
type NumericSortKey = typeof NUMERIC_SORT_KEYS[number]

function now(): string {
  return new Date().toISOString()
}

export class CommunityStore {
  private readonly filePath: string
  private state: StoreState

  constructor(filePath: string) {
    this.filePath = filePath
    this.state = { users: [], builds: [], sessions: {} }
    if (filePath !== ':memory:' && fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<StoreState>
      this.state = {
        users: raw.users ?? [],
        builds: raw.builds ?? [],
        sessions: raw.sessions ?? {},
      }
    }
  }

  private persist(): void {
    if (this.filePath === ':memory:') return
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8')
    fs.renameSync(tmp, this.filePath)
  }

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------

  register(username: string, email: string, password: string): CommunityUser {
    if (typeof username !== 'string' || username.length < 3 || username.length > 24) {
      throw new Error('Username must be 3-24 characters')
    }
    if (!/^[A-Za-z0-9_]+$/.test(username)) {
      throw new Error('Username may only contain letters, numbers and underscores')
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }
    if (typeof email !== 'string' || !email.includes('@')) {
      throw new Error('A valid email address is required')
    }
    const lowerName = username.toLowerCase()
    const lowerEmail = email.toLowerCase()
    if (this.state.users.some(u => u.username.toLowerCase() === lowerName)) {
      throw new Error('Username is already taken')
    }
    if (this.state.users.some(u => u.email.toLowerCase() === lowerEmail)) {
      throw new Error('Email is already registered')
    }
    const salt = randomBytes(16)
    const hash = scryptSync(password, salt, 64)
    const user: CommunityUser = {
      id: randomBytes(8).toString('hex'),
      username,
      email,
      passwordHash: `${salt.toString('hex')}:${hash.toString('hex')}`,
      createdAt: now(),
    }
    this.state.users.push(user)
    this.persist()
    return user
  }

  verifyLogin(usernameOrEmail: string, password: string): CommunityUser | null {
    if (typeof usernameOrEmail !== 'string' || typeof password !== 'string') return null
    const lower = usernameOrEmail.toLowerCase()
    const user = this.state.users.find(
      u => u.username.toLowerCase() === lower || u.email.toLowerCase() === lower
    )
    if (!user) return null
    const [saltHex, hashHex] = user.passwordHash.split(':')
    if (!saltHex || !hashHex) return null
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
    return timingSafeEqual(actual, expected) ? user : null
  }

  /**
   * Sign in (or up) with a verified Google identity. Resolution order mirrors
   * common OAuth linking rules:
   *   1. an account already linked to this Google `sub` → return it;
   *   2. an account with the same (Google-verified) email → link and return;
   *   3. otherwise create a passwordless account with a unique username
   *      derived from the Google display name / email local part.
   */
  loginWithGoogle(googleId: string, email: string, displayName = ''): CommunityUser {
    if (typeof googleId !== 'string' || googleId.length === 0) {
      throw new Error('Google identity is missing its subject id')
    }
    if (typeof email !== 'string' || !email.includes('@')) {
      throw new Error('Google identity is missing a valid email address')
    }
    const linked = this.state.users.find(u => u.googleId === googleId)
    if (linked) return linked

    const lowerEmail = email.toLowerCase()
    const byEmail = this.state.users.find(u => u.email.toLowerCase() === lowerEmail)
    if (byEmail) {
      byEmail.googleId = googleId
      this.persist()
      return byEmail
    }

    const user: CommunityUser = {
      id: randomBytes(8).toString('hex'),
      username: this.uniqueUsername(displayName || email.split('@')[0]),
      email,
      passwordHash: '',
      googleId,
      createdAt: now(),
    }
    this.state.users.push(user)
    this.persist()
    return user
  }

  /** Sanitizes a display name into a free username (suffixes on collision). */
  private uniqueUsername(base: string): string {
    let sanitized = base.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    if (sanitized.length < 3) sanitized = `user_${sanitized}`.replace(/_$/, '')
    sanitized = sanitized.slice(0, 24)
    const taken = (name: string) =>
      this.state.users.some(u => u.username.toLowerCase() === name.toLowerCase())
    if (!taken(sanitized)) return sanitized
    for (let i = 2; ; i++) {
      const suffix = String(i)
      const candidate = sanitized.slice(0, 24 - suffix.length) + suffix
      if (!taken(candidate)) return candidate
    }
  }

  userById(id: string): CommunityUser | undefined {
    return this.state.users.find(u => u.id === id)
  }

  /** Public projection of a user — safe to send to any client. */
  publicUser(u: CommunityUser): { id: string; username: string } {
    return { id: u.id, username: u.username }
  }

  /** The account's saved appearance, if it has one. */
  themeFor(userId: string): CommunityUser['theme'] | undefined {
    return this.userById(userId)?.theme
  }

  /** Save the account's appearance. Passing undefined clears it. */
  setTheme(userId: string, theme: CommunityUser['theme']): void {
    const user = this.userById(userId)
    if (!user) return
    if (theme === undefined) delete user.theme
    else user.theme = theme
    this.persist()
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  createSession(userId: string): string {
    const token = randomBytes(32).toString('hex')
    this.state.sessions[token] = {
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }
    this.persist()
    return token
  }

  getSession(token: string): string | null {
    this.pruneSessions()
    return this.state.sessions[token]?.userId ?? null
  }

  deleteSession(token: string): void {
    if (this.state.sessions[token]) {
      delete this.state.sessions[token]
      this.persist()
    }
  }

  private pruneSessions(): void {
    const cutoff = now()
    let changed = false
    for (const [token, session] of Object.entries(this.state.sessions)) {
      if (session.expiresAt <= cutoff) {
        delete this.state.sessions[token]
        changed = true
      }
    }
    if (changed) this.persist()
  }

  // -------------------------------------------------------------------------
  // Saved builds
  // -------------------------------------------------------------------------

  saveBuild(
    ownerId: string,
    input: { id?: string; name: string; document: unknown }
  ): SavedBuildRecord {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Build name is required')
    if (name.length > 80) throw new Error('Build name must be 80 characters or fewer')
    const timestamp = now()
    if (input.id !== undefined) {
      const existing = this.requireOwnedBuild(input.id, ownerId)
      existing.name = name
      existing.document = input.document
      existing.updatedAt = timestamp
      this.persist()
      return existing
    }
    const record: SavedBuildRecord = {
      id: randomBytes(8).toString('hex'),
      ownerId,
      name,
      document: input.document,
      createdAt: timestamp,
      updatedAt: timestamp,
      published: false,
      votes: {},
    }
    this.state.builds.push(record)
    this.persist()
    return record
  }

  listBuilds(ownerId: string): SavedBuildRecord[] {
    return this.state.builds
      .filter(b => b.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getBuild(id: string): SavedBuildRecord | undefined {
    return this.state.builds.find(b => b.id === id)
  }

  deleteBuild(id: string, ownerId: string): void {
    const build = this.requireOwnedBuild(id, ownerId)
    this.state.builds = this.state.builds.filter(b => b.id !== build.id)
    this.persist()
  }

  publishBuild(id: string, ownerId: string, snapshot: BuildSnapshot): SavedBuildRecord {
    const build = this.requireOwnedBuild(id, ownerId)
    build.published = true
    if (!build.publishedAt) build.publishedAt = now()
    build.snapshot = snapshot
    this.persist()
    return build
  }

  unpublishBuild(id: string, ownerId: string): SavedBuildRecord {
    const build = this.requireOwnedBuild(id, ownerId)
    build.published = false
    this.persist()
    return build
  }

  private requireOwnedBuild(id: string, ownerId: string): SavedBuildRecord {
    const build = this.getBuild(id)
    if (!build) throw new Error('Build not found')
    if (build.ownerId !== ownerId) throw new Error('Forbidden: build belongs to another user')
    return build
  }

  // -------------------------------------------------------------------------
  // Votes + community listing
  // -------------------------------------------------------------------------

  vote(buildId: string, userId: string, value: 1 | -1 | 0): number {
    const build = this.getBuild(buildId)
    if (!build || !build.published) throw new Error('Build not found')
    if (build.ownerId === userId) {
      throw new Error('Forbidden: you cannot vote on your own build')
    }
    if (value !== 1 && value !== -1 && value !== 0) {
      throw new Error('Vote value must be 1, -1 or 0')
    }
    if (value === 0) delete build.votes[userId]
    else build.votes[userId] = value
    this.persist()
    return this.score(build)
  }

  score(build: SavedBuildRecord): number {
    return Object.values(build.votes).reduce<number>((sum, v) => sum + v, 0)
  }

  communityList(opts: {
    cls?: string
    race?: string
    sort?: string
    order?: 'asc' | 'desc'
    viewerId?: string
  } = {}): CommunityListing[] {
    const { cls, race, sort = 'votes', order = 'desc', viewerId } = opts
    let builds = this.state.builds.filter(b => b.published)
    if (cls) builds = builds.filter(b => b.snapshot?.classes.includes(cls) ?? false)
    if (race) builds = builds.filter(b => b.snapshot?.race === race)

    const dir = order === 'asc' ? 1 : -1
    const isNumericKey = (NUMERIC_SORT_KEYS as readonly string[]).includes(sort)
    builds = [...builds].sort((a, b) => {
      if (sort === 'newest') {
        return dir * (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '')
      }
      if (isNumericKey) {
        // Builds missing a snapshot sort last regardless of direction.
        if (!a.snapshot && !b.snapshot) return 0
        if (!a.snapshot) return 1
        if (!b.snapshot) return -1
        const key = sort as NumericSortKey
        return dir * (a.snapshot[key] - b.snapshot[key])
      }
      // Default: 'votes' (score).
      return dir * (this.score(a) - this.score(b))
    })

    return builds.map(b => ({
      id: b.id,
      name: b.name,
      author: this.userById(b.ownerId)?.username ?? 'unknown',
      publishedAt: b.publishedAt ?? '',
      snapshot: b.snapshot,
      score: this.score(b),
      myVote: (viewerId ? b.votes[viewerId] : undefined) ?? 0,
    }))
  }

  getPublishedBuild(id: string): (SavedBuildRecord & { author: string }) | undefined {
    const build = this.getBuild(id)
    if (!build || !build.published) return undefined
    return { ...build, author: this.userById(build.ownerId)?.username ?? 'unknown' }
  }
}
