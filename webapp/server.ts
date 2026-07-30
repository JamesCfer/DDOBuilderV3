import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { exec, execSync } from 'child_process'
import dotenv from 'dotenv'
import {
  loadRaces, loadClasses, loadFeats, loadEnhancementTrees, loadSpells,
  loadWeaponGroups, loadStances, loadItems, loadAugments, loadSetBonuses,
  loadGuildBuffs, loadFiligreeSets, loadFiligreeBonuses, loadSelfAndPartyBuffs,
  loadPatrons, loadQuests, loadSentientGems,
  loadAttackRates, loadBonusTypes, loadAdventurePacks, loadChallenges, loadIgnoredList, loadItemBuffs, loadItemClickies,
  loadAllCatalogues,
} from './src/server/dataLoaders'
import { CommunityStore } from './src/server/communityStore'
import { buildSnapshotFromDocument } from './src/server/communitySnapshot'
import type { CharacterDocument } from './src/types/ddo'

dotenv.config()

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const DATA_DIR = path.resolve(process.env.DATA_FILES_PATH ?? '../Output/DataFiles')

app.use(cors())
app.use(express.json())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAmount(raw: unknown): number[] {
  if (raw == null) return []
  if (typeof raw === 'number') return [raw]
  if (typeof raw === 'string') return raw.split(' ').map(Number)
  if (typeof raw === 'object' && raw !== null && '#text' in raw) {
    const text = (raw as Record<string, unknown>)['#text']
    return typeof text === 'string' ? text.split(' ').map(Number) : [Number(text)]
  }
  return []
}

// Simple in-memory cache
const cache = new Map<string, unknown>()

function cached<T>(key: string, loader: () => T): T {
  if (!cache.has(key)) cache.set(key, loader())
  return cache.get(key) as T
}

// ---------------------------------------------------------------------------
// Data loader thunks (each closes over DATA_DIR so the shared module remains
// stateless and pure functions of dataDir).
// ---------------------------------------------------------------------------
const races = () => loadRaces(DATA_DIR)
const classes = () => loadClasses(DATA_DIR)
const feats = () => loadFeats(DATA_DIR)
const enhancementTrees = () => loadEnhancementTrees(DATA_DIR)
const spells = () => loadSpells(DATA_DIR)
const weaponGroups = () => loadWeaponGroups(DATA_DIR)
const stances = () => loadStances(DATA_DIR)
const items = () => loadItems(DATA_DIR)
const augments = () => loadAugments(DATA_DIR)
const setBonusesData = () => loadSetBonuses(DATA_DIR)
const guildBuffs = () => loadGuildBuffs(DATA_DIR)
const filigreeSets = () => loadFiligreeSets(DATA_DIR)
const filigreeBonuses = () => loadFiligreeBonuses(DATA_DIR)
const selfAndPartyBuffs = () => loadSelfAndPartyBuffs(DATA_DIR)
const patrons = () => loadPatrons(DATA_DIR)
const quests = () => loadQuests(DATA_DIR)
const sentientGems = () => loadSentientGems(DATA_DIR)
const attackRates = () => loadAttackRates(DATA_DIR)
const bonusTypes = () => loadBonusTypes(DATA_DIR)
const challenges = () => loadChallenges(DATA_DIR)
const ignoredList = () => loadIgnoredList(DATA_DIR)
const adventurePacks = () => loadAdventurePacks(DATA_DIR)
const itemBuffs = () => loadItemBuffs(DATA_DIR)
const itemClickies = () => loadItemClickies(DATA_DIR)
const allCatalogues = () => loadAllCatalogues(DATA_DIR)

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', dataDir: DATA_DIR })
})

app.get('/api/version', (_req, res) => {
  // V3's version is the most recently MERGED PR number — every merge to main
  // is a squash commit whose subject ends in "(#NNN)". Scan recent history so
  // work-in-progress commits on a feature branch don't hide it. Falls back to
  // the repo-root VERSION file (V2's data version) for non-git deployments.
  let version = 'unknown'
  try {
    const subjects = execSync('git log -50 --pretty=%s', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
    const m = subjects.match(/\(#(\d+)\)/)
    if (m) version = `#${m[1]}`
  } catch { /* not a git checkout — fall through */ }
  if (version === 'unknown') {
    // The VERSION file lives at the repo root. __dirname differs between dev
    // (ts-node from webapp/) and prod (compiled to webapp/dist-server/), and
    // the process cwd may also vary, so try the candidate locations in order.
    const candidates = [
      path.resolve(__dirname, '..', 'VERSION'),        // dev: webapp/../VERSION
      path.resolve(__dirname, '..', '..', 'VERSION'),  // prod: webapp/dist-server/../../VERSION
      path.resolve(process.cwd(), '..', 'VERSION'),    // launched from webapp/
      path.resolve(process.cwd(), 'VERSION'),          // launched from repo root
    ]
    for (const file of candidates) {
      try {
        const v = fs.readFileSync(file, 'utf-8').trim()
        if (v) { version = v; break }
      } catch { /* try next candidate */ }
    }
  }
  res.json({ version })
})

app.get('/api/races', (_req, res) => {
  res.json(cached('races', races))
})

app.get('/api/classes', (_req, res) => {
  res.json(cached('classes', classes))
})

app.get('/api/feats', (_req, res) => {
  const allFeats = cached('feats', feats) as unknown as Array<Record<string, unknown>>
  const { group, acquire } = _req.query
  let result = allFeats
  if (group) result = result.filter(f => {
    const g = f['Group']
    return Array.isArray(g) ? g.includes(group) : g === group
  })
  if (acquire) result = result.filter(f => f['Acquire'] === acquire)
  res.json(result)
})

app.get('/api/enhancements', (_req, res) => {
  res.json(cached('enhancements', enhancementTrees))
})

app.get('/api/spells', (_req, res) => {
  res.json(cached('spells', spells))
})

app.get('/api/stances', (_req, res) => {
  res.json(cached('stances', stances))
})

app.get('/api/weapongroups', (_req, res) => {
  res.json(cached('weapongroups', weaponGroups))
})

app.get('/api/items', (_req, res) => {
  const allItems = cached('items', items) as unknown as Array<Record<string, unknown>>
  const { slot, minLevel, maxLevel } = _req.query
  let result = allItems
  if (slot && typeof slot === 'string') result = result.filter(i => {
    const s = i['EquipmentSlot'] as Record<string, unknown> | undefined
    return s && slot in s
  })
  if (minLevel) result = result.filter(i => Number(i['MinLevel'] ?? 0) >= Number(minLevel))
  if (maxLevel) result = result.filter(i => Number(i['MinLevel'] ?? 0) <= Number(maxLevel))
  res.json(result)
})

app.get('/api/augments', (_req, res) => {
  const allAugments = cached('augments', augments) as unknown as Array<Record<string, unknown>>
  const { type } = _req.query
  if (type) {
    res.json(allAugments.filter(a => a['Type'] === type))
  } else {
    res.json(allAugments)
  }
})

app.get('/api/item', (_req, res) => {
  const { name } = _req.query
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name query parameter required' })
    return
  }
  const allItems = cached('items', items) as unknown as Array<Record<string, unknown>>
  const found = allItems.find(i => i['Name'] === name)
  res.json(found ?? null)
})

app.get('/api/setbonuses', (_req, res) => {
  res.json(cached('setbonuses', setBonusesData))
})

app.get('/api/item-setbonuses', (req, res) => {
  const { names } = req.query
  if (!names || typeof names !== 'string') {
    res.json([])
    return
  }
  const nameList = names.split(',').map(n => n.trim()).filter(Boolean)
  if (nameList.length === 0) {
    res.json([])
    return
  }
  const allItems = cached('items', items) as unknown as Array<Record<string, unknown>>
  // Collect set bonus type counts from matching items
  const counts = new Map<string, number>()
  for (const name of nameList) {
    const item = allItems.find(i => i['Name'] === name)
    if (!item) continue
    const sb = item['SetBonus']
    if (!sb) continue
    const sbList = Array.isArray(sb) ? sb : [sb]
    for (const type of sbList) {
      if (typeof type === 'string') {
        counts.set(type, (counts.get(type) ?? 0) + 1)
      }
    }
  }
  const result = Array.from(counts.entries()).map(([type, count]) => ({ type, count }))
  res.json(result)
})

app.get('/api/guildbuffs', (_req, res) => {
  res.json(cached('guildbuffs', guildBuffs))
})

app.get('/api/filigree', (_req, res) => {
  res.json(cached('filigree', filigreeSets))
})

app.get('/api/filigree-bonuses', (_req, res) => {
  res.json(cached('filigree-bonuses', filigreeBonuses))
})

app.get('/api/selfbuffs', (_req, res) => {
  res.json(cached('selfbuffs', selfAndPartyBuffs))
})

app.get('/api/patrons', (_req, res) => res.json(cached('patrons', patrons)))
app.get('/api/quests', (_req, res) => res.json(cached('quests', quests)))
app.get('/api/gems', (_req, res) => res.json(cached('gems', sentientGems)))

// V2-parity additions exposed to the client (each loaded lazily and cached)
app.get('/api/attack-rates', (_req, res) => res.json(cached('attack-rates', attackRates)))
app.get('/api/bonus-types', (_req, res) => res.json(cached('bonus-types', bonusTypes)))
app.get('/api/challenges', (_req, res) => res.json(cached('challenges', challenges)))
app.get('/api/ignored-list', (_req, res) => res.json(cached('ignored-list', ignoredList)))
app.get('/api/adventure-packs', (_req, res) => res.json(cached('adventure-packs', adventurePacks)))
app.get('/api/item-buffs', (_req, res) => res.json(cached('item-buffs', itemBuffs)))
app.get('/api/item-clickies', (_req, res) => res.json(cached('item-clickies', itemClickies)))

// ---------------------------------------------------------------------------
// Community platform routes (accounts, saved builds, star-to-publish, votes)
// ---------------------------------------------------------------------------

const COMMUNITY_DB_PATH = process.env.COMMUNITY_DB_PATH ?? path.join(__dirname, 'data', 'community.json')
if (COMMUNITY_DB_PATH !== ':memory:') {
  fs.mkdirSync(path.dirname(COMMUNITY_DB_PATH), { recursive: true })
}
const community = new CommunityStore(COMMUNITY_DB_PATH)

/** Extracts the Bearer token from the Authorization header (null if absent). */
function bearerToken(req: express.Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

/** Resolves the authenticated user id from the request, if any. */
function communityUserId(req: express.Request): string | null {
  const token = bearerToken(req)
  return token ? community.getSession(token) : null
}

/** Sends 401 and returns null when the request carries no valid session. */
function requireAuth(req: express.Request, res: express.Response): string | null {
  const userId = communityUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return null
  }
  return userId
}

/** Maps store errors to HTTP: 'Build not found' → 404, 'Forbidden…' → 403, else 400. */
function communityError(res: express.Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  const status = message === 'Build not found' ? 404
    : message.startsWith('Forbidden') ? 403
    : 400
  res.status(status).json({ error: message })
}

// When Google sign-in is configured the site is Google-only: password
// registration and login are rejected. The routes stay functional for dev
// setups that run without a GOOGLE_CLIENT_ID.
function rejectWhenGoogleOnly(res: express.Response): boolean {
  if (!GOOGLE_CLIENT_ID) return false
  res.status(403).json({ error: 'Password sign-in is disabled — use Google sign-in' })
  return true
}

app.post('/api/auth/register', (req, res) => {
  if (rejectWhenGoogleOnly(res)) return
  try {
    const { username, email, password } = req.body ?? {}
    const user = community.register(username, email, password)
    const token = community.createSession(user.id)
    res.json({ token, user: community.publicUser(user) })
  } catch (err) { communityError(res, err) }
})

app.post('/api/auth/login', (req, res) => {
  if (rejectWhenGoogleOnly(res)) return
  const { username, password } = req.body ?? {}
  const user = community.verifyLogin(username, password)
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }
  const token = community.createSession(user.id)
  res.json({ token, user: community.publicUser(user) })
})

// ── Google sign-in (config-gated: set GOOGLE_CLIENT_ID to enable) ──────────
// The client obtains an ID-token credential from Google Identity Services and
// posts it here; we verify it against Google's tokeninfo endpoint and mint a
// normal community session for the linked/created account.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''

app.get('/api/auth/google/config', (_req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID || null })
})

interface GoogleTokenInfo {
  aud?: string
  sub?: string
  email?: string
  email_verified?: string | boolean
  name?: string
  exp?: string
}

async function verifyGoogleIdToken(credential: string): Promise<{ sub: string; email: string; name: string }> {
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  )
  if (!resp.ok) throw new Error('Google rejected the credential')
  const info = await resp.json() as GoogleTokenInfo
  if (info.aud !== GOOGLE_CLIENT_ID) throw new Error('Google credential was issued for a different app')
  if (info.email_verified !== 'true' && info.email_verified !== true) {
    throw new Error('Google account email is not verified')
  }
  if (!info.sub || !info.email) throw new Error('Google credential is missing identity fields')
  return { sub: info.sub, email: info.email, name: info.name ?? '' }
}

app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: 'Google sign-in is not configured on this server' })
    return
  }
  const { credential } = req.body ?? {}
  if (typeof credential !== 'string' || credential.length === 0) {
    res.status(400).json({ error: 'Missing Google credential' })
    return
  }
  try {
    const identity = await verifyGoogleIdToken(credential)
    const user = community.loginWithGoogle(identity.sub, identity.email, identity.name)
    const token = community.createSession(user.id)
    res.json({ token, user: community.publicUser(user) })
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Google sign-in failed' })
  }
})

app.post('/api/auth/logout', (req, res) => {
  if (!requireAuth(req, res)) return
  const token = bearerToken(req)
  if (token) community.deleteSession(token)
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  const user = community.userById(userId)
  if (!user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  res.json({ user: community.publicUser(user) })
})

app.get('/api/my/builds', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  res.json(community.listBuilds(userId).map(b => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    published: b.published,
    score: community.score(b),
  })))
})

app.post('/api/my/builds', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const { id, name, document } = req.body ?? {}
    const build = community.saveBuild(userId, { id, name, document })
    res.json({ id: build.id, name: build.name, updatedAt: build.updatedAt, published: build.published })
  } catch (err) { communityError(res, err) }
})

app.get('/api/my/builds/:id', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  const build = community.getBuild(req.params.id)
  if (!build) {
    res.status(404).json({ error: 'Build not found' })
    return
  }
  if (build.ownerId !== userId) {
    res.status(403).json({ error: 'Forbidden: build belongs to another user' })
    return
  }
  res.json({ ...build, score: community.score(build) })
})

app.delete('/api/my/builds/:id', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    community.deleteBuild(req.params.id, userId)
    res.json({ ok: true })
  } catch (err) { communityError(res, err) }
})

// Star = publish to the community listing. The stat snapshot shown in the
// listing is computed server-side from the saved document so it can't be
// spoofed by the client.
app.post('/api/my/builds/:id/star', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const build = community.getBuild(req.params.id)
    if (!build) throw new Error('Build not found')
    if (build.ownerId !== userId) throw new Error('Forbidden: build belongs to another user')
    const cat = cached('allCatalogues', allCatalogues)
    const snapshot = buildSnapshotFromDocument(build.document as CharacterDocument, cat)
    community.publishBuild(build.id, userId, snapshot)
    res.json({ ok: true, snapshot })
  } catch (err) { communityError(res, err) }
})

app.delete('/api/my/builds/:id/star', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    community.unpublishBuild(req.params.id, userId)
    res.json({ ok: true })
  } catch (err) { communityError(res, err) }
})

app.get('/api/community', (req, res) => {
  const { class: cls, race, sort, order } = req.query
  res.json(community.communityList({
    cls: typeof cls === 'string' && cls ? cls : undefined,
    race: typeof race === 'string' && race ? race : undefined,
    sort: typeof sort === 'string' && sort ? sort : undefined,
    order: order === 'asc' || order === 'desc' ? order : undefined,
    viewerId: communityUserId(req) ?? undefined,
  }))
})

app.get('/api/community/:id', (req, res) => {
  const build = community.getPublishedBuild(req.params.id)
  if (!build) {
    res.status(404).json({ error: 'Build not found' })
    return
  }
  const viewerId = communityUserId(req)
  res.json({
    id: build.id,
    name: build.name,
    author: build.author,
    publishedAt: build.publishedAt,
    snapshot: build.snapshot,
    document: build.document,
    score: community.score(build),
    myVote: (viewerId ? build.votes[viewerId] : undefined) ?? 0,
  })
})

app.post('/api/community/:id/vote', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const { value } = req.body ?? {}
    if (value !== 1 && value !== -1 && value !== 0) {
      res.status(400).json({ error: 'Vote value must be 1, -1 or 0' })
      return
    }
    const score = community.vote(req.params.id, userId, value)
    res.json({ score, myVote: value })
  } catch (err) { communityError(res, err) }
})

// ---------------------------------------------------------------------------
// Auto-update routes
// ---------------------------------------------------------------------------

const REPO_DIR = path.resolve(__dirname, '..', '..') // project root

function runGit(args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`git -C "${REPO_DIR}" ${args}`, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message)
      else resolve(stdout.trim())
    })
  })
}

app.get('/api/update/check', async (_req, res) => {
  try {
    const branch = await runGit('rev-parse --abbrev-ref HEAD')
    await runGit(`fetch origin ${branch}`)
    const behind = await runGit(`rev-list HEAD..origin/${branch} --count`)
    const count = parseInt(behind, 10) || 0
    if (count === 0) {
      res.json({ upToDate: true, commits: [] })
      return
    }
    const log = await runGit(`log HEAD..origin/${branch} --oneline`)
    const commits = log.split('\n').filter(Boolean)
    res.json({ upToDate: false, commits })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/update/apply', async (_req, res) => {
  res.json({ started: true })
  try {
    const branch = await runGit('rev-parse --abbrev-ref HEAD')
    exec(
      `git -C "${REPO_DIR}" pull origin ${branch} && cd "${path.join(REPO_DIR, 'webapp')}" && npm run build`,
      (err, _stdout, stderr) => {
        if (err) {
          console.error('Update failed:', stderr)
        } else {
          console.log('Update complete — restarting…')
          setTimeout(() => process.exit(0), 500)
        }
      }
    )
  } catch (err) {
    console.error('Update apply failed:', err)
  }
})

// ---------------------------------------------------------------------------
// Auto-update cron (every 15 minutes)
// ---------------------------------------------------------------------------
function scheduleAutoUpdate() {
  setInterval(async () => {
    try {
      const branch = await runGit('rev-parse --abbrev-ref HEAD')
      await runGit(`fetch origin ${branch}`)
      const behind = await runGit(`rev-list HEAD..origin/${branch} --count`)
      const count = parseInt(behind, 10) || 0
      if (count > 0) {
        console.log(`[auto-update] ${count} commit(s) behind — pulling and rebuilding…`)
        exec(
          `git -C "${REPO_DIR}" pull origin ${branch} && cd "${path.join(REPO_DIR, 'webapp')}" && npm run build`,
          (err, _stdout, stderr) => {
            if (err) console.error('[auto-update] failed:', stderr)
            else { console.log('[auto-update] done — restarting…'); setTimeout(() => process.exit(0), 500) }
          }
        )
      }
    } catch { /* network error or not a git repo — ignore */ }
  }, 15 * 60 * 1000)
}

if (process.env.NODE_ENV === 'production') {
  scheduleAutoUpdate()
}

// Serve image assets from the DDO data directory
const IMAGE_DIRS = ['FeatImages', 'EnhancementImages', 'ClassImages', 'UIImages', 'AugmentImages', 'FiligreeImages', 'ItemImages', 'SetBonusImages', 'SpellImages', 'SentientGemImages']
for (const dir of IMAGE_DIRS) {
  const imgPath = path.join(DATA_DIR, dir)
  if (fs.existsSync(imgPath)) {
    app.use(`/images/${dir}`, express.static(imgPath))
  }
}

// Flat ItemImages lookup: /images/ItemImages/<name>.png searches all subdirectories
const itemImagesDir = path.join(DATA_DIR, 'ItemImages')
if (fs.existsSync(itemImagesDir)) {
  const itemImageSubdirs = fs.readdirSync(itemImagesDir)
    .filter(d => fs.statSync(path.join(itemImagesDir, d)).isDirectory())
  app.get('/images/ItemImages/:name', (req, res, next) => {
    const name = req.params.name
    for (const sub of itemImageSubdirs) {
      const fp = path.join(itemImagesDir, sub, name)
      if (fs.existsSync(fp)) return res.sendFile(fp)
    }
    next()
  })
}

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`DDO Builder API running on http://localhost:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
})

export default app
