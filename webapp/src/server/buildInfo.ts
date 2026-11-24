// What a deployed copy of V3 is: the merged PR it was built from, the
// DDO Builder (V2) release its data is synced to, and when that code landed.
// Shared by vite.config.ts (baked into the bundle) and server.ts
// (/api/version), so the badge and the feedback reporter agree.
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export interface BuildInfo {
  /** Most recently merged PR, e.g. "#346" ("unknown" when nothing says). */
  version: string
  /** DDO Builder V2 release V3 is synced to, e.g. "2.0.0.86". */
  release?: string
  /** ISO time the deployed code was committed (HEAD), else when it was built. */
  updated?: string
}

function git(dir: string, args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return undefined
  }
}

/** First readable, non-empty file among `files`. */
function readFirst(files: string[]): string | undefined {
  for (const file of files) {
    try {
      const v = fs.readFileSync(file, 'utf-8').trim()
      if (v) return v
    } catch { /* try next */ }
  }
  return undefined
}

/** Directories to look in for repo files, from webapp/ (dev, vite) or
 *  webapp/dist-server/ (prod), plus the process cwd. */
function searchDirs(dir: string): string[] {
  return [dir, path.resolve(dir, '..'), path.resolve(dir, '..', '..'), process.cwd(), path.resolve(process.cwd(), '..')]
}

/** The V2 release recorded by the last upstream sync (UPSTREAM_SYNC.json). */
export function readUpstreamRelease(dir: string): string | undefined {
  const raw = readFirst(searchDirs(dir).map(d => path.join(d, 'UPSTREAM_SYNC.json')))
  if (!raw) return undefined
  try {
    const sync = JSON.parse(raw) as { upstreamRelease?: unknown; notes?: unknown }
    if (typeof sync.upstreamRelease === 'string' && sync.upstreamRelease.trim()) return sync.upstreamRelease.trim()
    // Older files only name the release in the free-text notes.
    const m = typeof sync.notes === 'string' ? sync.notes.match(/\b\d+\.\d+\.\d+\.\d+\b/) : null
    return m ? m[0] : undefined
  } catch {
    return undefined
  }
}

export function readBuildInfo(dir: string, now: Date = new Date()): BuildInfo {
  // V3's version is the most recently MERGED PR number: every merge to main
  // is a squash commit whose subject ends in "(#NNN)". Scan recent history so
  // work-in-progress commits on a feature branch don't hide it.
  let version = 'unknown'
  const m = git(dir, 'log -50 --pretty=%s')?.match(/\(#(\d+)\)/)
  if (m) {
    version = `#${m[1]}`
  } else {
    // webapp/VERSION is COMMITTED and updated with each PR, so deployments
    // without git metadata still get a real version.
    version = readFirst(searchDirs(dir).map(d => path.join(d, 'VERSION'))) ?? 'unknown'
  }
  const committed = git(dir, 'log -1 --format=%cI')
  const updated = committed && !Number.isNaN(Date.parse(committed))
    ? new Date(committed).toISOString()
    : now.toISOString()
  return { version, release: readUpstreamRelease(dir), updated }
}
