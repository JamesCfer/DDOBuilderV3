import { describe, it, expect } from 'vitest'
import path from 'path'
import {
  buildBadgeText, buildBadgeTitle, formatUpdatedLocal, formatUpdatedUtc, mergeBuildInfo,
} from '../lib/buildLabel'
import { readBuildInfo, readUpstreamRelease } from '../server/buildInfo'

const WEBAPP = path.resolve(__dirname, '..', '..')

describe('build label (tester-facing version)', () => {
  const info = { version: '#346', release: '2.0.0.86', updated: '2026-11-24T16:46:00.000Z' }

  it('leads with the DDO Builder release, keeping the build number', () => {
    expect(buildBadgeText(info)).toBe('2.0.0.86 · #346')
    expect(buildBadgeText({ version: '#346' })).toBe('#346')
    expect(buildBadgeText({})).toBe('')
  })

  it('spells out release, build and local update time on hover', () => {
    const title = buildBadgeTitle(info, 'en-US', 'America/New_York')
    expect(title).toContain('Synced to DDO Builder release 2.0.0.86')
    expect(title).toContain('V3 build #346')
    expect(title).toContain('Last updated Nov 24, 2026, 11:46 AM')
  })

  it('formats update times, ignoring junk', () => {
    expect(formatUpdatedLocal(info.updated, 'en-US', 'UTC')).toBe('Nov 24, 2026, 4:46 PM')
    expect(formatUpdatedUtc(info.updated)).toBe('2026-11-24 16:46 UTC')
    expect(formatUpdatedLocal('nope')).toBeUndefined()
    expect(formatUpdatedUtc(undefined)).toBeUndefined()
  })

  it('prefers the live server answer but keeps baked fields it lacks', () => {
    const baked = { version: '#340', release: '2.0.0.86', updated: '2026-11-20T00:00:00.000Z' }
    expect(mergeBuildInfo(baked, { version: '#346', updated: info.updated }))
      .toEqual({ version: '#346', release: '2.0.0.86', updated: info.updated })
    expect(mergeBuildInfo(baked, { version: 'unknown' }).version).toBe('#340')
  })
})

describe('readBuildInfo (server and vite)', () => {
  it('reads the synced V2 release from UPSTREAM_SYNC.json', () => {
    expect(readUpstreamRelease(WEBAPP)).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  })

  it('reports build number, release and a commit time for this checkout', () => {
    const b = readBuildInfo(WEBAPP)
    expect(b.version).not.toBe('unknown')
    expect(b.release).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    expect(Number.isNaN(Date.parse(b.updated ?? ''))).toBe(false)
  })

  it('falls back to the given time when there is no git history', () => {
    const now = new Date('2026-01-02T03:04:05.000Z')
    const b = readBuildInfo('/', now)
    expect(b.updated).toBe(now.toISOString())
  })
})
