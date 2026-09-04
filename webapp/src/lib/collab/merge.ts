// Three-way merge for concurrently edited character documents.
//
// Two people editing the same shared build cannot both send "here is the whole
// document" and have the last one win: whoever saves second would silently
// wipe out the other's work. Every client instead sends the document it is
// proposing together with the shared version it started from, and the server
// merges that against whatever the shared document has become since.
//
//   base   the version the client had when it started editing
//   ours   the current shared document (carries everyone else's edits)
//   theirs the document the client is proposing
//
// The result keeps `ours` everywhere the client changed nothing, and takes
// `theirs` at every leaf the client actually changed. Two people editing
// different fields therefore both keep their edit; two people editing the SAME
// field resolve last-write-wins, which for a build planner is what people
// expect (the ability score shows the number the last person typed).
//
// Arrays of objects with a stable `id` (lives, builds, gear, feats) merge
// element by element instead of wholesale, so adding a life while someone else
// renames another one keeps both. Every other array is a single value: a
// levelClasses list is meaningful only as a whole.

export type JsonValue = unknown

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Structural equality, enough for the JSON-shaped documents we store. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

/** An array is id-keyed when every element is an object carrying a distinct,
 *  non-empty `id`. Those are the collections people edit side by side. */
function keyedIds(arr: unknown[]): string[] | undefined {
  const ids: string[] = []
  for (const el of arr) {
    if (!isPlainObject(el)) return undefined
    const id = el.id
    if (typeof id !== 'string' || id === '') return undefined
    if (ids.includes(id)) return undefined
    ids.push(id)
  }
  return ids
}

function byId(arr: unknown[], ids: string[]): Map<string, unknown> {
  const map = new Map<string, unknown>()
  ids.forEach((id, i) => map.set(id, arr[i]))
  return map
}

function mergeKeyedArrays(
  base: unknown[] | undefined,
  ours: unknown[],
  theirs: unknown[],
  oursIds: string[],
  theirsIds: string[],
): unknown[] | undefined {
  const baseIds = base ? keyedIds(base) : []
  if (baseIds === undefined) return undefined
  const baseMap = base ? byId(base, baseIds) : new Map<string, unknown>()
  const oursMap = byId(ours, oursIds)
  const theirsMap = byId(theirs, theirsIds)

  // The client's removals and additions, measured against the base it saw.
  const removed = new Set(baseIds.filter(id => !theirsMap.has(id)))
  const added = theirsIds.filter(id => !baseMap.has(id))

  // Keep the shared order, drop what the client removed, merge what both hold.
  const out: unknown[] = []
  for (const id of oursIds) {
    if (removed.has(id)) continue
    const mine = oursMap.get(id)
    out.push(theirsMap.has(id)
      ? mergeValues(baseMap.get(id), mine, theirsMap.get(id))
      : mine)
  }
  // Then anything the client added that the shared document has not seen. An
  // id already present was handled above, so nothing is duplicated.
  for (const id of added) {
    if (!oursMap.has(id)) out.push(theirsMap.get(id))
  }
  return out
}

function mergeValues(base: unknown, ours: unknown, theirs: unknown): unknown {
  if (deepEqual(ours, theirs)) return ours
  // The client did not touch this: whatever the shared document says stands.
  if (deepEqual(base, theirs)) return ours
  // Nobody else touched it: the client's edit applies cleanly.
  if (deepEqual(base, ours)) return theirs

  if (isPlainObject(ours) && isPlainObject(theirs)) {
    return mergeObjects(isPlainObject(base) ? base : {}, ours, theirs)
  }
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const oursIds = keyedIds(ours)
    const theirsIds = keyedIds(theirs)
    if (oursIds && theirsIds) {
      const merged = mergeKeyedArrays(
        Array.isArray(base) ? base : undefined, ours, theirs, oursIds, theirsIds,
      )
      if (merged) return merged
    }
  }
  // Both edited the same scalar (or incompatible shapes): last write wins.
  return theirs
}

function mergeObjects(
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])
  for (const key of keys) {
    const inOurs = Object.prototype.hasOwnProperty.call(ours, key)
    const inTheirs = Object.prototype.hasOwnProperty.call(theirs, key)
    const inBase = Object.prototype.hasOwnProperty.call(base, key)

    if (!inTheirs) {
      // Deleted by the client, or never there. A key it deleted goes only if
      // nobody else has since changed it.
      const deletedByThem = inBase
      if (deletedByThem && inOurs && deepEqual(base[key], ours[key])) continue
      if (inOurs) out[key] = ours[key]
      continue
    }
    if (!inOurs) {
      // Added by the client, or deleted by someone else. A key someone else
      // deleted stays deleted unless the client changed it.
      const deletedByUs = inBase
      if (deletedByUs && deepEqual(base[key], theirs[key])) continue
      out[key] = theirs[key]
      continue
    }
    // Absent from the base reads as `undefined`, which equals neither side, so
    // a key both of them added falls through to last-write-wins as it should.
    out[key] = mergeValues(inBase ? base[key] : undefined, ours[key], theirs[key])
  }
  return out
}

/**
 * Merge a client's proposed document into the shared one. Returns `ours`
 * unchanged (by identity) when the client's edit adds nothing, so callers can
 * skip a broadcast with a cheap `===`.
 */
export function mergeDocuments<T>(base: T | undefined, ours: T, theirs: T): T {
  if (base === undefined) return theirs
  const merged = mergeValues(base, ours, theirs)
  return (deepEqual(merged, ours) ? ours : merged) as T
}
