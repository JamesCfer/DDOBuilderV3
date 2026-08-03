// V2 polish parity: keyboard shortcuts (File menu accelerators Ctrl+N /
// Ctrl+O / Ctrl+S, DDOBuilder.rc IDR_MAINFRAME), drag-and-drop file import
// (V2 registers as a .DDOBuild file-association/drop target), and auto-save
// (V2 writes a backup alongside the file — "Revert to Backup").
//
// Renders nothing; installs window-level handlers. The hidden file input is
// the Ctrl+O / drop fallback chooser.

import { useEffect, useRef } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { useSettings } from '../../context/SettingsContext'
import { useBuildLog } from '../../context/BuildLogContext'
import { takeLastImportWarnings, usePersistence } from '../../hooks/usePersistence'
import { emptyDocument, findActiveBuild, syncBuildIntoDocument } from '../../lib/multiLife'
import { clearSession, saveSession } from '../../lib/sessionStore'
import type { CharacterDocument } from '../../types/ddo'

interface AppShortcutsProps {
  onLoad: (doc: CharacterDocument) => void
}

export default function AppShortcuts({ onLoad }: AppShortcutsProps) {
  const { build, dispatch } = useCharacter()
  const { doc, setDoc } = useDocument()
  const { settings } = useSettings()
  const { saveDocument, importFile } = usePersistence()
  const { addLog } = useBuildLog()
  const fileRef = useRef<HTMLInputElement>(null)

  // Refs so the stable window listeners always see current state.
  const state = useRef({ build, doc })
  state.current = { build, doc }

  function save() {
    const synced = syncBuildIntoDocument(state.current.doc, state.current.build)
    setDoc(synced)
    saveDocument(synced)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        save()
      } else if (k === 'o') {
        e.preventDefault()
        fileRef.current?.click()
      } else if (k === 'n') {
        e.preventDefault()
        if (window.confirm('Start a new character? Unsaved changes will be lost.')) {
          const fresh = emptyDocument()
          clearSession()
          setDoc(fresh)
          const b = findActiveBuild(fresh)
          if (b) dispatch({ type: 'LOAD_BUILD', build: b })
        }
      } else if (k === 'p') {
        // Let the browser print; print.css provides the layout.
        return
      }
    }

    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    function onDrop(e: DragEvent) {
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      e.preventDefault()
      importFile(file)
        .then(imported => { saveDocument(imported); onLoad(imported) })
        .catch(() => { /* invalid file dropped — ignore, matching V2's no-op */ })
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save: persist the (synced) document to the SAVES list whenever the
  // build changes, debounced. Off by default like V2 (explicit Save / backup
  // model).
  useEffect(() => {
    if (!settings.autoSave) return
    const t = setTimeout(save, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, settings.autoSave])

  // Session restore: snapshot the working document on every edit, regardless
  // of the auto-save setting. This is not the saves list — it is the single
  // "what I had open" record the app reloads into on next visit, so a refresh
  // never costs unsaved work.
  useEffect(() => {
    const t = setTimeout(() => {
      saveSession(syncBuildIntoDocument(state.current.doc, state.current.build))
    }, 800)
    return () => clearTimeout(t)
  }, [build, doc])

  return (
    <input
      ref={fileRef}
      type="file"
      accept=".json,application/json,.ddobuild,.DDOBuild,.ddocp,application/xml,text/xml"
      style={{ display: 'none' }}
      onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        importFile(f)
          .then(imported => {
            saveDocument(imported)
            onLoad(imported)
            for (const w of takeLastImportWarnings()) addLog(`Import: ${w}`)
          })
          .catch(() => { /* surfaced by SaveLoadBar's own import path */ })
      }}
    />
  )
}
