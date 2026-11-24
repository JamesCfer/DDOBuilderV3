// How the web app names itself to testers: the DDO Builder (V2) release its
// data is synced to, V3's own build (merged PR) number, and when that build
// landed. "#346" alone told testers nothing about how current the app is.

export interface BuildLabelInfo {
  /** V3 build: most recently merged PR, e.g. "#346". */
  version?: string
  /** DDO Builder V2 release the data is synced to, e.g. "2.0.0.86". */
  release?: string
  /** ISO time the deployed build was committed. */
  updated?: string
}

function clean(v: string | undefined): string | undefined {
  const t = v?.trim()
  return t && t !== 'unknown' ? t : undefined
}

/** What vite baked into this bundle (see vite.config.ts). */
export function bakedBuildInfo(): BuildLabelInfo {
  return {
    version: typeof __BUILDER_VERSION__ !== 'undefined' ? clean(__BUILDER_VERSION__) : undefined,
    release: typeof __BUILDER_RELEASE__ !== 'undefined' ? clean(__BUILDER_RELEASE__) : undefined,
    updated: typeof __BUILDER_UPDATED__ !== 'undefined' ? clean(__BUILDER_UPDATED__) : undefined,
  }
}

/** Prefer the server's answer field by field, keeping baked values it lacks. */
export function mergeBuildInfo(base: BuildLabelInfo, live: BuildLabelInfo | undefined): BuildLabelInfo {
  return {
    version: clean(live?.version) ?? base.version,
    release: clean(live?.release) ?? base.release,
    updated: clean(live?.updated) ?? base.updated,
  }
}

function validDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** "Nov 24, 2026, 4:46 PM" in the viewer's own time zone. */
export function formatUpdatedLocal(iso: string | undefined, locale?: string, timeZone?: string): string | undefined {
  const d = validDate(iso)
  if (!d) return undefined
  return d.toLocaleString(locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
  })
}

/** "2026-11-24 16:46 UTC": unambiguous for reports read by someone else. */
export function formatUpdatedUtc(iso: string | undefined): string | undefined {
  const d = validDate(iso)
  if (!d) return undefined
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** Short badge text, e.g. "2.0.0.86 · #346". */
export function buildBadgeText(info: BuildLabelInfo): string {
  return [info.release, info.version].filter(Boolean).join(' · ')
}

/** Hover text spelling the badge out. */
export function buildBadgeTitle(info: BuildLabelInfo, locale?: string, timeZone?: string): string {
  const parts: string[] = []
  if (info.release) parts.push(`Synced to DDO Builder release ${info.release}`)
  if (info.version) parts.push(`V3 build ${info.version}`)
  const when = formatUpdatedLocal(info.updated, locale, timeZone)
  if (when) parts.push(`Last updated ${when}`)
  return parts.join('\n')
}
