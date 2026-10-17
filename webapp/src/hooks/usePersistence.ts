import { useState, useCallback, useEffect } from 'react'
import type { CharacterBuild, CharacterDocument, Item } from '../types/ddo'
import { migrateLoad } from '../context/CharacterContext'
import {
  isCharacterDocument,
  flattenDocument,
  emptyDocument,
  characterFileName,
  repairCharacterNames,
} from '../lib/multiLife'
import { importV2Build } from '../lib/v2Import'
import { runBackgroundParityCheck } from '../lib/parityClient'
import { preloadStaticBundle, useStaticBundle } from './useStaticBundle'
import { importV1Build, isV1CharacterXml } from '../lib/v1Import'
import { exportV2DocumentModel } from '../lib/v2Export'
import type { ItemCatalogue } from '../lib/v2Export'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Legacy flat CharacterBuild[] storage (pre-U1). Read-only: migrated into
 *  DOCS_KEY on first load, then left in place as a safety net. */
const STORAGE_KEY = 'ddo-builder-saves'
/** U1 document storage: CharacterDocument[] (Character → Life[] → Build[]). */
const DOCS_KEY = 'ddo-builder-docs'
/** One-deep per-document backups (V2 "Revert to Backup": the app keeps the
 *  previous file contents as a .bak next to the saved file). */
const BACKUP_KEY = 'ddo-builder-docs-backup'

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
function readLegacySaves(): CharacterBuild[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as CharacterBuild[]
    return []
  } catch {
    return []
  }
}

/** Fired after the saved list changes, so every usePersistence copy (File
 *  menu, Ctrl+S, account page) shows the same list. */
const DOCS_CHANGED = 'ddo-builder-docs-changed'

function writeDocs(docs: CharacterDocument[]): void {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs))
    queueMicrotask(() => window.dispatchEvent(new Event(DOCS_CHANGED)))
  } catch {
    console.warn('usePersistence: could not write to localStorage')
  }
}

/**
 * Build-version migration: runs every build of every life through
 * `migrateLoad` so fields added after the save was written get defaults
 * everywhere a stored build is consumed (LifeBuildBar, BuildCompare, export),
 * not only when one is dispatched through LOAD_BUILD. Stamps `_v: 2`.
 *
 * Also repairs never-chosen character names (a build stored as "Life 1" shows
 * the character's name instead); `preferredName` is the name the save is
 * listed under, used when the document itself has no real name either.
 */
export function migrateDocument(doc: CharacterDocument, preferredName?: string): CharacterDocument {
  return repairCharacterNames({
    ...doc,
    lives: doc.lives.map(life => ({
      ...life,
      builds: life.builds.map(migrateLoad),
    })),
    _v: 2,
  }, preferredName)
}

/**
 * Reads the saved Character documents. On first run after the U1 upgrade the
 * legacy flat build list is migrated: each legacy build becomes its own
 * one-life one-build document (named after the build) so every old save shows
 * up in the new picker.
 */
function readDocs(): CharacterDocument[] {
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return (parsed as unknown[]).filter(isCharacterDocument).map(d => migrateDocument(d))
      }
      return []
    }
  } catch {
    return []
  }
  const legacy = readLegacySaves()
  if (legacy.length === 0) return []
  const docs = legacy.map(b => migrateDocument(emptyDocument(b)))
  writeDocs(docs)
  return docs
}

/** Strip a path and extension: "My Builds/Bob.DDOBuild" → "Bob". */
function baseFileName(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim()
}

/** Keep a character name usable as a download file name. */
function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_\- ]/gi, '_')
}

// ---------------------------------------------------------------------------
// usePersistence hook
// ---------------------------------------------------------------------------
export interface PersistenceAPI {
  /** Saved Character documents (U1). */
  docs: CharacterDocument[]
  /** Every build across every saved document, flattened (compare UI, etc.). */
  saves: CharacterBuild[]
  saveDocument: (doc: CharacterDocument) => void
  deleteDocument: (id: string) => void
  /** V2 "Revert to Backup": the version of the document before its last save,
   *  or undefined when it has never been overwritten. */
  loadBackup: (id: string) => CharacterDocument | undefined
  exportJSON: (doc: CharacterDocument) => void
  exportDDOBuild: (doc: CharacterDocument, itemCatalogue?: ItemCatalogue | Item[]) => void
  /** Parses a V3 JSON (document or single build) or V2 .DDOBuild file. */
  importFile: (file: File) => Promise<CharacterDocument>
}

/**
 * Warnings from the most recent `importFile` (V2 tree revocations and the
 * like). Kept module-level rather than threaded through the return type,
 * which every caller would otherwise have to change.
 */
let lastImportWarnings: string[] = []

/** Warnings produced by the last import, if any. */
export function takeLastImportWarnings(): string[] {
  const w = lastImportWarnings
  lastImportWarnings = []
  return w
}

export function usePersistence(): PersistenceAPI {
  const [docs, setDocs] = useState<CharacterDocument[]>(() => readDocs())
  useEffect(() => {
    const reload = () => setDocs(readDocs())
    window.addEventListener(DOCS_CHANGED, reload)
    return () => window.removeEventListener(DOCS_CHANGED, reload)
  }, [])
  // Tree catalogue for the V2 tree-version gate on import (SpendInTree
  // parity: spends in out-of-version trees are revoked at load).
  const { allTrees } = useStaticBundle()

  const saves = docs.flatMap(flattenDocument)

  /** Upsert document by id and flush to localStorage. The overwritten version
   *  becomes the document's backup (V2 writes a .bak before saving). */
  const saveDocument = useCallback((doc: CharacterDocument) => {
    setDocs(() => {
      // Read the stored list fresh: the File menu, Ctrl+S and the account
      // page each hold their own copy, and writing back a stale one would
      // drop characters another of them saved.
      const prev = readDocs()
      const idx = prev.findIndex(d => d.id === doc.id)
      if (idx >= 0) {
        try {
          const raw = localStorage.getItem(BACKUP_KEY)
          const backups = (raw ? JSON.parse(raw) : {}) as Record<string, CharacterDocument>
          backups[doc.id] = prev[idx]
          localStorage.setItem(BACKUP_KEY, JSON.stringify(backups))
        } catch { /* backup is best-effort */ }
      }
      const next = idx >= 0
        ? prev.map((d, i) => (i === idx ? doc : d))
        : [...prev, doc]
      writeDocs(next)
      return next
    })
  }, [])

  const loadBackup = useCallback((id: string): CharacterDocument | undefined => {
    try {
      const raw = localStorage.getItem(BACKUP_KEY)
      const backups = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>
      const doc = backups[id]
      return isCharacterDocument(doc) ? migrateDocument(doc) : undefined
    } catch {
      return undefined
    }
  }, [])

  /** Remove a document from the saves list and from localStorage */
  const deleteDocument = useCallback((id: string) => {
    setDocs(() => {
      const next = readDocs().filter(d => d.id !== id)
      writeDocs(next)
      return next
    })
  }, [])

  /**
   * Trigger a browser download of the Character document as a JSON file.
   */
  const exportJSON = useCallback((doc: CharacterDocument) => {
    try {
      const json = JSON.stringify(doc, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeFileName(characterFileName(doc))}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('usePersistence: exportJSON failed', err)
    }
  }, [])

  /**
   * Trigger a browser download of the whole Character document (every life
   * and build) as a V2-compatible .DDOBuild XML file so it can be re-opened
   * in the V2 MFC application.
   *
   * F2 seam: when `itemCatalogue` (name → Item) is supplied, each equipped
   * item's full V2 definition (Buffs + metadata + SetBonus) is embedded inside
   * <EquippedGear>, matching what V2 writes/trusts on load. The app does not
   * fetch the (large) /api/items catalogue just for export, so the catalogue is
   * optional; pass it from a component that already has the item list loaded
   * (e.g. GearPanel) to enable full-fidelity gear embedding.
   */
  const exportDDOBuild = useCallback((doc: CharacterDocument, itemCatalogue?: ItemCatalogue | Item[]) => {
    try {
      const cat: ItemCatalogue | undefined = Array.isArray(itemCatalogue)
        ? new Map(itemCatalogue.map(i => [i.Name, i]))
        : itemCatalogue
      const xml = exportV2DocumentModel(doc, cat)
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeFileName(characterFileName(doc))}.DDOBuild`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('usePersistence: exportDDOBuild failed', err)
    }
  }, [])

  /**
   * Read a File object and resolve to a full CharacterDocument:
   *  - V2 .DDOBuild XML → every <Life>/<Build> is kept (F1/U1)
   *  - V3 document JSON → as-is
   *  - V3 single-build JSON (legacy) → wrapped in a one-life document
   * Rejects with a descriptive Error on parse failure or missing fields.
   */
  const importFile = useCallback((file: File): Promise<CharacterDocument> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const text = reader.result as string
          // V1 .ddocp XML support — detect by file extension or the V1 root
          // tag <DDOCharacterData> (CDDOBuilderApp::OnFileImport reads these
          // with that expected root, DDOBuilder.cpp:294-325). Must be checked
          // before the generic V2 XML branch below, which would otherwise
          // swallow any '<'-prefixed text.
          lastImportWarnings = []
          const isV1 = file.name.toLowerCase().endsWith('.ddocp') ||
                       isV1CharacterXml(text)
          if (isV1) {
            const { document: v1doc, warnings } = importV1Build(text)
            if (flattenDocument(v1doc).length === 0) {
              reject(new Error(warnings[0] ?? 'V1 import produced no build'))
              return
            }
            resolve(migrateDocument(v1doc))
            return
          }
          // V2 .DDOBuild XML support — detect by file extension or root tag.
          const isXml = file.name.toLowerCase().endsWith('.ddobuild') ||
                        text.trim().startsWith('<')
          if (isXml) {
            // The version gate needs the real catalogue. `allTrees` from the
            // hook can still be empty here (first render, or the bundle is
            // mid-flight), and importing against an empty catalogue used to
            // revoke every tree spend in the file — so wait for the bundle
            // rather than judging the build against nothing.
            const trees = allTrees.length > 0
              ? allTrees
              : await preloadStaticBundle().then(b => b.allTrees).catch(() => [])
            const result = importV2Build(text, {
              allTrees: trees,
              // V2 stores no character name — the file IS the character
              // (Character.h has no Name property), so its base name is the
              // name to show and to save back under.
              characterName: baseFileName(file.name),
            })
            if (result.document.lives.length === 0) {
              reject(new Error('V2 file contained no lives'))
              return
            }
            // Revoking a tree's spends is a real, invisible loss — the build
            // simply arrives with points unspent. Report it rather than
            // leaving the user to notice a 0/75 destiny bar on their own.
            lastImportWarnings = result.warnings
            // Background math verification: the server re-computes this build
            // with V2's own compiled C++ (v2calc oracle) and diffs every stat
            // against V3. Fire-and-forget — the result surfaces in the TopNav
            // ParityBadge and never blocks or fails the import.
            runBackgroundParityCheck(text, file.name)
            resolve(result.document)
            return
          }
          const parsed = JSON.parse(text)
          if (isCharacterDocument(parsed)) {
            if (flattenDocument(parsed).length === 0) {
              reject(new Error('Character document contained no builds'))
              return
            }
            // A .json character carries its own name; the file's base name is
            // the fallback when the stored names are placeholders.
            resolve(migrateDocument(parsed, baseFileName(file.name)))
            return
          }
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            typeof parsed.id !== 'string' ||
            typeof parsed.name !== 'string'
          ) {
            reject(new Error('Invalid build file: missing required id or name fields'))
            return
          }
          resolve(emptyDocument(migrateLoad(parsed as CharacterBuild)))
        } catch {
          reject(new Error('Invalid build file: could not parse JSON or XML'))
        }
      }
      reader.onerror = () => reject(new Error('Could not read file'))
      reader.readAsText(file)
    })
    // `allTrees` MUST be a dependency: with an empty dep list the callback
    // captured the first render's (empty) catalogue for the lifetime of the
    // component, so the version gate never saw a single tree.
  }, [allTrees])

  return { docs, saves, saveDocument, deleteDocument, loadBackup, exportJSON, exportDDOBuild, importFile }
}
