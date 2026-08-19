// V2 Character → Life → Build hierarchy utilities.
//
// V2 source: DDOBuilder/Character.h:100-117, Life.h:106-124, Build.h.
//
// This module provides:
//   - wrapLegacy(): converts a flat list into a Character document
//   - flattenDocument(): unwraps a Character into its builds
//   - promoteBuildToLife(): clones a build into a fresh Life
//   - document manipulation (U1): syncBuildIntoDocument / setActiveBuild /
//     addLifeToDocument / addBuildToLife / deleteLifeFromDocument /
//     deleteBuildFromDocument / renameLife / findActiveBuild / emptyDocument
//
// The functions are pure so they can be used by usePersistence at load time
// and by the LifeBuildBar UI.

import type { CharacterBuild, Life, CharacterDocument, Ability } from '../types/ddo'
import { emptyBuild } from '../types/ddo'

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ---------------------------------------------------------------------------
// Character naming
//
// A save is identified by the character's name (CharacterInfo's "Name" field,
// stored on every build) — not by a positional "Life N" label. `doc.name` is a
// mirror of the active build's name, and every life the app named itself
// follows it too, so renaming the character renames its save, its life tabs
// and its export filenames. Lives the user renamed by hand are left alone.
// ---------------------------------------------------------------------------

export const DEFAULT_CHARACTER_NAME = 'New Character'

/** The character name carried by a build, or the default when it is blank. */
export function characterNameOf(build?: CharacterBuild | null): string {
  return build?.name?.trim() || DEFAULT_CHARACTER_NAME
}

/**
 * True when a life carries an app-generated name rather than one the user
 * typed. Documents saved before auto-naming have no `autoName` flag: their
 * generated names were "Life 1", "Life 2", … so anything else was user-typed.
 */
export function hasAutoLifeName(life: Life): boolean {
  if (typeof life.autoName === 'boolean') return life.autoName
  const name = life.name.trim()
  return name === '' || /^life \d+$/i.test(name)
}

/**
 * The generated name for the life at `index` of a character with `total`
 * lives: the character's name, with a life number appended only when there is
 * more than one life to tell apart.
 */
export function defaultLifeName(characterName: string, index: number, total: number): string {
  return total > 1 ? `${characterName} \u2014 Life ${index + 1}` : characterName
}

/**
 * Names the document after the character and re-derives the name of every
 * auto-named life. Returns `doc` unchanged when nothing moves, so it is safe
 * to call from an effect.
 */
export function applyCharacterName(doc: CharacterDocument, name: string): CharacterDocument {
  const character = name.trim() || DEFAULT_CHARACTER_NAME
  let changed = doc.name !== character
  const lives = doc.lives.map((life, i) => {
    if (!hasAutoLifeName(life)) return life
    const lifeName = defaultLifeName(character, i, doc.lives.length)
    if (life.name === lifeName && life.autoName === true) return life
    changed = true
    return { ...life, name: lifeName, autoName: true }
  })
  return changed ? { ...doc, name: character, lives } : doc
}

/**
 * Wraps a flat CharacterBuild[] into a single Character with one Life
 * containing all builds. Used to migrate legacy v1 saves.
 */
export function wrapLegacy(builds: CharacterBuild[], characterName?: string): CharacterDocument {
  const name = characterName?.trim() || characterNameOf(builds[0])
  const lifeId = generateId()
  const life: Life = {
    id: lifeId,
    name: defaultLifeName(name, 0, 1),
    autoName: true,
    race: builds[0]?.race ?? '',
    alignment: builds[0]?.alignment ?? 'True Neutral',
    abilityTomes: builds[0]?.abilityTomes ?? {},
    skillTomes: builds[0]?.skillTomes ?? {},
    selfBuffs: builds[0]?.activeBuffs ?? [],
    specialFeats: [],
    builds,
  }
  return {
    id: generateId(),
    name,
    guildLevel: 0,
    applyGuildBuffs: false,
    characterTomes: {},
    contentIDontOwn: [],
    lives: [life],
    activeLifeId: lifeId,
    activeBuildId: builds[0]?.id ?? '',
    _v: 2,
  }
}

/**
 * Returns the flat list of builds inside a CharacterDocument so the legacy
 * save UI can keep working unchanged.
 */
export function flattenDocument(doc: CharacterDocument): CharacterBuild[] {
  const out: CharacterBuild[] = []
  for (const life of doc.lives) {
    for (const b of life.builds) out.push(b)
  }
  return out
}

/**
 * Auto-detect: returns true if the parsed object has the new envelope shape.
 */
export function isCharacterDocument(parsed: unknown): parsed is CharacterDocument {
  return (
    !!parsed && typeof parsed === 'object' &&
    Array.isArray((parsed as CharacterDocument).lives)
  )
}

/**
 * Creates a fresh single-life single-build Character document. When `build`
 * is supplied it becomes the document's active build (used to wrap the
 * already-mounted CharacterContext build at provider init / RESET).
 */
export function emptyDocument(build?: CharacterBuild): CharacterDocument {
  const b = build ?? emptyBuild()
  const name = characterNameOf(b)
  const lifeId = generateId()
  const life: Life = {
    id: lifeId,
    name: defaultLifeName(name, 0, 1),
    autoName: true,
    race: b.race,
    alignment: b.alignment,
    abilityTomes: { ...b.abilityTomes } as Partial<Record<Ability, number>>,
    skillTomes: { ...b.skillTomes },
    selfBuffs: [...b.activeBuffs],
    specialFeats: [],
    builds: [b],
  }
  return {
    id: generateId(),
    name,
    guildLevel: b.guildLevel ?? 0,
    applyGuildBuffs: b.applyGuildBuffs ?? false,
    characterTomes: { ...b.abilityTomes } as Partial<Record<Ability, number>>,
    contentIDontOwn: [],
    lives: [life],
    activeLifeId: lifeId,
    activeBuildId: b.id,
    _v: 2,
  }
}

/** Returns the document's active build (falling back through lives). */
export function findActiveBuild(doc: CharacterDocument): CharacterBuild | undefined {
  const life = doc.lives.find(l => l.id === doc.activeLifeId) ?? doc.lives[0]
  return life?.builds.find(b => b.id === doc.activeBuildId) ?? life?.builds[0]
}

/** Returns the life containing the document's active build. */
export function findActiveLife(doc: CharacterDocument): Life | undefined {
  return doc.lives.find(l => l.id === doc.activeLifeId) ?? doc.lives[0]
}

function cloneBuild(source: CharacterBuild): CharacterBuild {
  const cloned: CharacterBuild = JSON.parse(JSON.stringify(source))
  cloned.id = generateId()
  return cloned
}

/**
 * Writes the (live-edited) active build back into the document at the active
 * position, updating `activeBuildId` to the build's id and refreshing the
 * life-level mirror fields (race / alignment / tomes / self-buffs) from the
 * build — V2 keeps these at Life level but V3's per-build copies are the
 * source of truth. Call this before any document read (switch / save /
 * export) so the stored copy is never stale.
 */
export function syncBuildIntoDocument(doc: CharacterDocument, build: CharacterBuild): CharacterDocument {
  const targetLifeId = doc.lives.some(l => l.id === doc.activeLifeId)
    ? doc.activeLifeId
    : doc.lives[0]?.id
  const lives = doc.lives.map(life => {
    if (life.id !== targetLifeId) return life
    const idx = life.builds.findIndex(b => b.id === doc.activeBuildId)
    const builds = [...life.builds]
    if (idx >= 0) builds[idx] = build
    else if (builds.length > 0) builds[0] = build
    else builds.push(build)
    return {
      ...life,
      race: build.race,
      alignment: build.alignment,
      abilityTomes: { ...build.abilityTomes } as Partial<Record<Ability, number>>,
      skillTomes: { ...build.skillTomes },
      selfBuffs: [...build.activeBuffs],
      builds,
    }
  })
  // The save is named after the character, so the document (and any auto-named
  // life) follows the live build's Name field on every sync.
  return applyCharacterName({ ...doc, lives, activeBuildId: build.id }, build.name)
}

/** Points the document's active life/build at the given ids (if they exist). */
export function setActiveBuild(doc: CharacterDocument, lifeId: string, buildId: string): CharacterDocument {
  const life = doc.lives.find(l => l.id === lifeId)
  if (!life) return doc
  const build = life.builds.find(b => b.id === buildId) ?? life.builds[0]
  if (!build) return doc
  return { ...doc, activeLifeId: life.id, activeBuildId: build.id }
}

/**
 * Appends a brand-new Life (with a fresh level-1 build, V2 "New Life") and
 * makes it active.
 */
export function addLifeToDocument(doc: CharacterDocument): CharacterDocument {
  // A new life is the same character over again: it keeps the character name
  // rather than resetting the build to the "New Character" placeholder.
  const b = { ...emptyBuild(), name: doc.name }
  const total = doc.lives.length + 1
  const life: Life = {
    id: generateId(),
    name: defaultLifeName(doc.name, doc.lives.length, total),
    autoName: true,
    race: b.race,
    alignment: b.alignment,
    abilityTomes: {},
    skillTomes: {},
    selfBuffs: [],
    specialFeats: [],
    builds: [b],
  }
  // Adding a second life makes the existing auto-named lives ambiguous, so
  // re-derive every generated name against the new life count.
  return applyCharacterName(
    { ...doc, lives: [...doc.lives, life], activeLifeId: life.id, activeBuildId: b.id },
    doc.name,
  )
}

/**
 * Appends a build to the given life and makes it active. When `source` is
 * supplied the new build is a clone of it (V2 builds within a life are
 * level snapshots of the same character); otherwise a fresh build is added.
 */
export function addBuildToLife(doc: CharacterDocument, lifeId: string, source?: CharacterBuild): CharacterDocument {
  const lifeIdx = doc.lives.findIndex(l => l.id === lifeId)
  if (lifeIdx < 0) return doc
  const next = source ? cloneBuild(source) : { ...emptyBuild(), name: doc.name }
  if (source) next.name = source.name
  const lives = [...doc.lives]
  lives[lifeIdx] = { ...lives[lifeIdx], builds: [...lives[lifeIdx].builds, next] }
  return { ...doc, lives, activeLifeId: lifeId, activeBuildId: next.id }
}

/**
 * Removes a life. No-op when it is the document's only life. If the active
 * life was removed, the previous (or first) remaining life becomes active.
 */
export function deleteLifeFromDocument(doc: CharacterDocument, lifeId: string): CharacterDocument {
  if (doc.lives.length <= 1) return doc
  const idx = doc.lives.findIndex(l => l.id === lifeId)
  if (idx < 0) return doc
  const lives = doc.lives.filter(l => l.id !== lifeId)
  if (doc.activeLifeId !== lifeId) return applyCharacterName({ ...doc, lives }, doc.name)
  const fallback = lives[Math.max(0, idx - 1)]
  return applyCharacterName({
    ...doc,
    lives,
    activeLifeId: fallback.id,
    activeBuildId: fallback.builds[0]?.id ?? '',
  }, doc.name)
}

/**
 * Removes a build from a life. No-op when it is the life's only build. If
 * the active build was removed, the previous (or first) remaining build in
 * that life becomes active.
 */
export function deleteBuildFromDocument(doc: CharacterDocument, lifeId: string, buildId: string): CharacterDocument {
  const lifeIdx = doc.lives.findIndex(l => l.id === lifeId)
  if (lifeIdx < 0) return doc
  const life = doc.lives[lifeIdx]
  if (life.builds.length <= 1) return doc
  const buildIdx = life.builds.findIndex(b => b.id === buildId)
  if (buildIdx < 0) return doc
  const builds = life.builds.filter(b => b.id !== buildId)
  const lives = [...doc.lives]
  lives[lifeIdx] = { ...life, builds }
  if (doc.activeBuildId !== buildId) return { ...doc, lives }
  const fallback = builds[Math.max(0, buildIdx - 1)]
  return { ...doc, lives, activeLifeId: lifeId, activeBuildId: fallback.id }
}

/**
 * Renames a life. The typed name is the user's own, so it is pinned
 * (`autoName: false`) and no longer follows the character name; clearing it
 * hands the life back to auto-naming.
 */
export function renameLife(doc: CharacterDocument, lifeId: string, name: string): CharacterDocument {
  const trimmed = name.trim()
  if (trimmed === '') {
    const cleared = {
      ...doc,
      lives: doc.lives.map(l => (l.id === lifeId ? { ...l, name: '', autoName: true } : l)),
    }
    return applyCharacterName(cleared, doc.name)
  }
  return {
    ...doc,
    lives: doc.lives.map(l => (l.id === lifeId ? { ...l, name: trimmed, autoName: false } : l)),
  }
}

/**
 * Promotes a build into a brand-new Life within the same Character. Returns
 * the new Life. Race/tomes/special-feats copy over; the build itself is
 * cloned with a fresh id.
 */
export function promoteBuildToLife(
  source: CharacterBuild,
  options: { name?: string } = {},
): Life {
  const cloned: CharacterBuild = JSON.parse(JSON.stringify(source))
  cloned.id = generateId()
  const named = options.name?.trim()
  return {
    id: generateId(),
    name: named || characterNameOf(source),
    autoName: !named,
    race: source.race,
    alignment: source.alignment,
    abilityTomes: { ...source.abilityTomes } as Partial<Record<Ability, number>>,
    skillTomes: { ...source.skillTomes },
    selfBuffs: [...source.activeBuffs],
    specialFeats: [],
    builds: [cloned],
  }
}
