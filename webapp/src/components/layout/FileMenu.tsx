// File ▾ menu.
//
// Two clearly separate jobs:
//  - Save keeps the character inside DDO Builder (this browser, plus your
//    account when signed in). Open lists everything saved either way.
//  - Export downloads a file for elsewhere (DDO Builder V2, a backup) and
//    leaves your saves alone; Import reads such a file back in.

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { CharacterDocument } from '../../types/ddo'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { useOptionalUser } from '../../context/AuthContext'
import { usePersistence, migrateDocument } from '../../hooks/usePersistence'
import { useSave } from '../../hooks/useSave'
import {
  emptyDocument, syncBuildIntoDocument, findActiveBuild, isCharacterDocument,
} from '../../lib/multiLife'
import { communityApi, type MyBuildSummary } from '../../lib/community/api'
import styles from './FileMenu.module.css'

export interface FileMenuProps {
  /** Called with the character to make the working one. */
  onLoad: (doc: CharacterDocument) => void
}

type Status = { text: string; tone: 'ok' | 'warn' } | null

export function SaveLoadBar({ onLoad }: FileMenuProps) {
  const { build, dispatch } = useCharacter()
  const { doc, setDoc } = useDocument()
  const user = useOptionalUser()
  const { docs, loadBackup, importFile, exportJSON, exportDDOBuild, saveDocument } = usePersistence()
  const save = useSave()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>(null)
  const [accountBuilds, setAccountBuilds] = useState<MyBuildSummary[]>([])

  useEffect(() => {
    if (!user) { setAccountBuilds([]); return }
    let cancelled = false
    communityApi.myBuilds()
      .then(list => { if (!cancelled) setAccountBuilds(list) })
      .catch(() => { /* the browser saves still list */ })
    return () => { cancelled = true }
  }, [user])

  // An account build that is also saved in this browser is listed once.
  const localAccountIds = new Set(docs.map(d => d.accountBuildId).filter(Boolean))
  const accountOnly = accountBuilds.filter(b => !localAccountIds.has(b.id))

  function syncedDoc(): CharacterDocument {
    const synced = syncBuildIntoDocument(doc, build)
    if (synced !== doc) setDoc(synced)
    return synced
  }

  function handleNew() {
    if (window.confirm('Start a new character? Unsaved changes will be lost.')) {
      const fresh = emptyDocument()
      setDoc(fresh)
      const target = findActiveBuild(fresh)
      if (target) dispatch({ type: 'LOAD_BUILD', build: target })
    }
  }

  async function handleSave() {
    setStatus({ text: 'Saving…', tone: 'ok' })
    const r = await save()
    if (r.accountError) {
      setStatus({ text: `Saved in this browser. Account save failed: ${r.accountError}`, tone: 'warn' })
    } else {
      setStatus({ text: `Saved "${r.name}" ${r.inAccount ? 'in this browser and your account' : 'in this browser'}`, tone: 'ok' })
    }
  }

  async function handleOpen(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    e.target.value = ''
    if (!value) return
    if (value.startsWith('local:')) {
      const found = docs.find(d => d.id === value.slice(6))
      if (found) onLoad(found)
      return
    }
    const id = value.slice(8)
    try {
      const rec = await communityApi.getMyBuild(id)
      if (!isCharacterDocument(rec.document)) throw new Error('That saved build is not a valid character')
      const loaded = { ...migrateDocument(rec.document, rec.name), accountBuildId: id }
      saveDocument(loaded)
      onLoad(loaded)
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : 'Could not open it', tone: 'warn' })
    }
  }

  function handleRevert() {
    const backup = loadBackup(doc.id)
    if (!backup) window.alert('No earlier save of this character exists yet.')
    else if (window.confirm('Go back to the version before your last save? Current changes will be lost.')) onLoad(backup)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    importFile(file)
      .then(imported => {
        saveDocument(imported)
        onLoad(imported)
        setStatus({ text: `Imported "${imported.name}" and saved it in this browser`, tone: 'ok' })
      })
      .catch((err: unknown) => {
        setStatus({ text: err instanceof Error ? err.message : 'Import failed', tone: 'warn' })
      })
  }

  const saveWhere = user ? 'Saves in this browser and your account' : 'Saves in this browser. Sign in to also save to your account'

  return (
    <div className={styles.menu}>
      <section className={styles.section}>
        <div className={styles.heading}>Save</div>
        <div className={styles.hint}>Keeps your character in DDO Builder so you can open it again.</div>
        <button type="button" onClick={handleNew} title="Start a new character">New character</button>
        <button type="button" onClick={handleSave} title={saveWhere}>
          Save <span className={styles.shortcut}>Ctrl+S</span>
        </button>
        <div className={styles.where}>{saveWhere}.</div>
        <select defaultValue="" onChange={handleOpen} title="Open a saved character">
          <option value="" disabled>{docs.length + accountOnly.length === 0 ? 'No saved characters yet' : 'Open a saved character…'}</option>
          {docs.length > 0 && (
            <optgroup label={user ? 'Saved in this browser' : 'Saved characters'}>
              {docs.map(d => (
                <option key={d.id} value={`local:${d.id}`}>{d.name}{d.accountBuildId ? '  (also in account)' : ''}</option>
              ))}
            </optgroup>
          )}
          {accountOnly.length > 0 && (
            <optgroup label="Saved in your account">
              {accountOnly.map(b => <option key={b.id} value={`account:${b.id}`}>{b.name}</option>)}
            </optgroup>
          )}
        </select>
        <button type="button" onClick={handleRevert} title="Go back to the version before your last save (V2 Revert to Backup)">Revert to last save</button>
      </section>

      <section className={styles.section}>
        <div className={styles.heading}>Export and import files</div>
        <div className={styles.hint}>Downloads a file to share, keep, or open in DDO Builder V2. Exporting does not save.</div>
        <button type="button" onClick={() => exportDDOBuild(syncedDoc())} title="Download a .DDOBuild file that DDO Builder V2 can open (all lives and builds)">
          Export .DDOBuild
        </button>
        <button type="button" onClick={() => exportJSON(syncedDoc())} title="Download this character as a DDO Builder V3 JSON file (all lives and builds)">
          Export JSON
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} title="Open a .DDOBuild (V2) or JSON (V3) file; it is also saved in this browser">
          Import a file…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json,.ddobuild,.DDOBuild,.ddocp,application/xml,text/xml"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </section>

      {status && <div className={status.tone === 'warn' ? styles.warn : styles.ok} role="status">{status.text}</div>}
    </div>
  )
}

export default SaveLoadBar
