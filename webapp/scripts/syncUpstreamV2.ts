/**
 * syncUpstreamV2.ts — keep Output/DataFiles in sync with the upstream C++ project
 * https://github.com/Maetrim/DDOBuilderV2 (which this repo, DDOBuilderV3, is a web port of).
 *
 * Usage (from webapp/):
 *   npx tsx scripts/syncUpstreamV2.ts check        # default: report drift vs upstream (exit 1 if updates exist)
 *   npx tsx scripts/syncUpstreamV2.ts pull-data    # copy changed/new upstream data files into Output/DataFiles
 *   npx tsx scripts/syncUpstreamV2.ts mark-synced  # record current upstream HEAD as the synced baseline
 *
 * State lives in UPSTREAM_SYNC.json at the repo root. Only plain git + node fs are used
 * (blobless clone: `--filter=blob:none --no-checkout`, so only the data blobs we actually
 * need are ever downloaded — the upstream repo contains ~17k files, mostly images).
 *
 * Data files are the .xml AND .item files under Output/DataFiles (upstream keeps them at
 * the same relative path). Images (*.png) are intentionally NOT synced by this script.
 */

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const STATE_FILE = path.join(REPO_ROOT, 'UPSTREAM_SYNC.json')
const LOCAL_DATA_DIR = path.join(REPO_ROOT, 'Output', 'DataFiles')
const DATA_EXTENSIONS = new Set(['.xml', '.item'])
const DEFAULT_UPSTREAM = 'https://github.com/Maetrim/DDOBuilderV2.git'
const DEFAULT_DATA_PATH_UPSTREAM = 'Output/DataFiles'

// Persistent cache of the blobless clone so repeated `check` runs only fetch deltas.
// Override with SYNC_UPSTREAM_TMPDIR if desired.
const CLONE_DIR =
  process.env.SYNC_UPSTREAM_TMPDIR ?? path.join(os.tmpdir(), 'ddobuilderv2-upstream-sync')

const GIT_MAX_BUFFER = 256 * 1024 * 1024

interface SyncState {
  upstream: string
  lastSyncedCommit: string | null
  lastChecked: string
  dataPathUpstream: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function git(args: string[], opts: { cwd?: string; input?: string } = {}): string {
  return execFileSync('git', args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function gitBuffer(args: string[], cwd: string): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: GIT_MAX_BUFFER })
}

function loadState(): SyncState {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      upstream: DEFAULT_UPSTREAM,
      lastSyncedCommit: null,
      lastChecked: '',
      dataPathUpstream: DEFAULT_DATA_PATH_UPSTREAM,
    }
  }
  const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<SyncState>
  return {
    upstream: raw.upstream ?? DEFAULT_UPSTREAM,
    lastSyncedCommit: raw.lastSyncedCommit ?? null,
    lastChecked: raw.lastChecked ?? '',
    dataPathUpstream: raw.dataPathUpstream ?? DEFAULT_DATA_PATH_UPSTREAM,
    ...(raw.notes !== undefined ? { notes: raw.notes } : {}),
  }
}

function saveState(state: SyncState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
}

function isDataFile(relPath: string): boolean {
  return DATA_EXTENSIONS.has(path.extname(relPath).toLowerCase())
}

// ---------------------------------------------------------------------------
// Upstream access
// ---------------------------------------------------------------------------

function lsRemoteHead(upstream: string): string {
  const out = git(['ls-remote', upstream, 'HEAD'])
  const sha = out.split(/\s+/)[0]
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Unexpected ls-remote output: ${out}`)
  }
  return sha
}

/** Blobless clone (or incremental fetch) of upstream into CLONE_DIR. */
function ensureClone(upstream: string): void {
  if (fs.existsSync(path.join(CLONE_DIR, '.git'))) {
    git(['-C', CLONE_DIR, 'fetch', '--quiet', 'origin'])
  } else {
    fs.mkdirSync(path.dirname(CLONE_DIR), { recursive: true })
    git(['clone', '--quiet', '--filter=blob:none', '--no-checkout', upstream, CLONE_DIR])
  }
}

/** Map of relPath (under dataPathUpstream) -> blob sha, for .xml/.item files at `commit`. */
function upstreamDataFiles(commit: string, dataPathUpstream: string): Map<string, string> {
  const out = git(['-C', CLONE_DIR, 'ls-tree', '-r', '-z', commit, '--', dataPathUpstream])
  const files = new Map<string, string>()
  const prefix = dataPathUpstream.replace(/\/$/, '') + '/'
  for (const entry of out.split('\0')) {
    if (!entry) continue
    // format: "<mode> <type> <sha>\t<path>"
    const tab = entry.indexOf('\t')
    if (tab < 0) continue
    const [, type, sha] = entry.slice(0, tab).split(' ')
    if (type !== 'blob') continue
    const fullPath = entry.slice(tab + 1)
    const relPath = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
    if (isDataFile(relPath)) files.set(relPath, sha)
  }
  return files
}

/** Map of relPath -> git blob sha for local .xml/.item files under Output/DataFiles. */
function localDataFiles(): Map<string, string> {
  const relPaths: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile() && isDataFile(entry.name)) {
        relPaths.push(path.relative(LOCAL_DATA_DIR, abs))
      }
    }
  }
  walk(LOCAL_DATA_DIR)
  relPaths.sort()
  if (relPaths.length === 0) return new Map()
  const absPaths = relPaths.map((p) => path.join(LOCAL_DATA_DIR, p))
  const hashes = git(['hash-object', '--stdin-paths'], { input: absPaths.join('\n') + '\n' })
    .trim()
    .split('\n')
  const files = new Map<string, string>()
  relPaths.forEach((p, i) => files.set(p.split(path.sep).join('/'), hashes[i]))
  return files
}

interface Drift {
  changed: string[] // exists both sides, content differs
  newUpstream: string[] // upstream only
  localOnly: string[] // local only (never deleted by this script)
}

function computeDrift(upstream: Map<string, string>, local: Map<string, string>): Drift {
  const changed: string[] = []
  const newUpstream: string[] = []
  const localOnly: string[] = []
  for (const [relPath, sha] of upstream) {
    const localSha = local.get(relPath)
    if (localSha === undefined) newUpstream.push(relPath)
    else if (localSha !== sha) changed.push(relPath)
  }
  for (const relPath of local.keys()) {
    if (!upstream.has(relPath)) localOnly.push(relPath)
  }
  changed.sort()
  newUpstream.sort()
  localOnly.sort()
  return { changed, newUpstream, localOnly }
}

function printRecentCommits(headSha: string, sinceCommit: string | null): void {
  let logArgs: string[]
  if (sinceCommit) {
    // Verify the old commit is still reachable (guards against force-pushes).
    let reachable = true
    try {
      git(['-C', CLONE_DIR, 'cat-file', '-e', `${sinceCommit}^{commit}`])
    } catch {
      reachable = false
    }
    logArgs = reachable
      ? ['-C', CLONE_DIR, 'log', '--oneline', `${sinceCommit}..${headSha}`]
      : ['-C', CLONE_DIR, 'log', '--oneline', '-20', headSha]
    if (!reachable) {
      console.log(`(lastSyncedCommit ${sinceCommit.slice(0, 8)} not found upstream; showing last 20 commits)`)
    }
  } else {
    logArgs = ['-C', CLONE_DIR, 'log', '--oneline', '-20', headSha]
    console.log('(no lastSyncedCommit baseline; showing last 20 upstream commits)')
  }
  const log = git(logArgs).trimEnd()
  console.log('\nUpstream commits:')
  console.log(log.length > 0 ? log : '  (none)')
}

function printDrift(drift: Drift): void {
  console.log(
    `\nData-file drift vs ${path.relative(REPO_ROOT, LOCAL_DATA_DIR)} ` +
      `(${drift.changed.length} changed, ${drift.newUpstream.length} new upstream, ${drift.localOnly.length} local-only):`,
  )
  for (const f of drift.changed) console.log(`  M ${f}`)
  for (const f of drift.newUpstream) console.log(`  A ${f}`)
  for (const f of drift.localOnly) console.log(`  L ${f} (local-only, preserved)`)
  if (drift.changed.length + drift.newUpstream.length + drift.localOnly.length === 0) {
    console.log('  (no differences)')
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdCheck(state: SyncState): number {
  const headSha = lsRemoteHead(state.upstream)
  state.lastChecked = new Date().toISOString()

  console.log(`Upstream:          ${state.upstream}`)
  console.log(`Upstream HEAD:     ${headSha}`)
  console.log(`lastSyncedCommit:  ${state.lastSyncedCommit ?? '(none — never synced)'}`)

  if (state.lastSyncedCommit === headSha) {
    saveState(state)
    console.log('\nIn sync: upstream HEAD matches lastSyncedCommit. Nothing to do.')
    return 0
  }

  console.log('\nUpstream has moved. Fetching (blobless) to inspect changes...')
  ensureClone(state.upstream)
  printRecentCommits(headSha, state.lastSyncedCommit)

  const drift = computeDrift(upstreamDataFiles(headSha, state.dataPathUpstream), localDataFiles())
  printDrift(drift)
  saveState(state)

  if (drift.changed.length + drift.newUpstream.length === 0) {
    console.log(
      '\nNo data-file changes to pull; run `npx tsx scripts/syncUpstreamV2.ts mark-synced` to accept ' +
        `${headSha.slice(0, 8)} as the baseline.`,
    )
  } else {
    console.log('\nRun `npx tsx scripts/syncUpstreamV2.ts pull-data` to copy the changed files.')
  }
  return 1 // updates exist (scheduler branches on this)
}

function cmdPullData(state: SyncState): number {
  const headSha = lsRemoteHead(state.upstream)
  console.log(`Pulling data files from upstream @ ${headSha}`)
  ensureClone(state.upstream)

  const upstreamMap = upstreamDataFiles(headSha, state.dataPathUpstream)
  const drift = computeDrift(upstreamMap, localDataFiles())
  const toCopy = [...drift.changed, ...drift.newUpstream].sort()

  if (toCopy.length === 0) {
    console.log('No changed or new upstream data files — nothing to copy.')
  } else {
    for (const relPath of toCopy) {
      const blobSha = upstreamMap.get(relPath)!
      const content = gitBuffer(['cat-file', 'blob', blobSha], CLONE_DIR)
      const dest = path.join(LOCAL_DATA_DIR, relPath)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, content)
      const tag = drift.newUpstream.includes(relPath) ? 'new    ' : 'updated'
      console.log(`  copied (${tag}) ${relPath}`)
    }
  }
  if (drift.localOnly.length > 0) {
    console.log(`Preserved ${drift.localOnly.length} local-only file(s) (not touched):`)
    for (const f of drift.localOnly) console.log(`  L ${f}`)
  }

  state.lastSyncedCommit = headSha
  state.lastChecked = new Date().toISOString()
  saveState(state)

  console.log(`\nDone: ${toCopy.length} file(s) copied. lastSyncedCommit -> ${headSha}`)
  console.log('REMINDER: run the webapp test suite before committing:')
  console.log('  cd webapp && ./node_modules/.bin/vitest run')
  return 0
}

function cmdMarkSynced(state: SyncState): number {
  const headSha = lsRemoteHead(state.upstream)
  state.lastSyncedCommit = headSha
  state.lastChecked = new Date().toISOString()
  saveState(state)
  console.log(`lastSyncedCommit set to upstream HEAD ${headSha} (no files copied).`)
  return 0
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  const command = process.argv[2] ?? 'check'
  const state = loadState()

  try {
    switch (command) {
      case 'check':
        return cmdCheck(state)
      case 'pull-data':
        return cmdPullData(state)
      case 'mark-synced':
        return cmdMarkSynced(state)
      default:
        console.error(`Unknown command: ${command}`)
        console.error('Usage: npx tsx scripts/syncUpstreamV2.ts [check|pull-data|mark-synced]')
        return 2
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`\nERROR: ${command} failed: ${message}`)
    console.error(
      [
        '',
        'This usually means git could not reach the upstream repository:',
        `  ${state.upstream}`,
        'Possible causes:',
        '  - No network access, or GitHub is unreachable from this environment.',
        '  - Sandboxed/proxied sessions may return HTTP 403 for hosts outside the',
        '    session scope; plain `git ls-remote`/`git clone` of the upstream URL is',
        '    known to work where the GitHub REST API is blocked. If a 403 appears,',
        '    the session proxy scope likely changed — retry from an environment with',
        '    direct git access.',
        '  - git is not installed or not on PATH.',
        `Diagnose with: git ls-remote ${state.upstream} HEAD`,
      ].join('\n'),
    )
    return 2
  }
}

process.exit(main())
