import React, { createContext, useContext, useEffect, useState } from 'react'
import type { CharacterDocument } from '../types/ddo'
import { applyCharacterName, emptyDocument } from '../lib/multiLife'
import { useCharacter } from './CharacterContext'

// U1 — V2 Character → Life → Build document layer.
//
// The active build's canonical state lives in CharacterContext (the heavy
// reducer); this context holds the surrounding document — the other lives and
// builds plus the active life/build pointers — mirroring V2 where the active
// build is edited in place and siblings are stored snapshots. The stored copy
// of the active build may be stale between edits; callers must run
// syncBuildIntoDocument(doc, build) before any document read (switch, save,
// export). All mutations are pure functions in lib/multiLife.ts composed by
// the UI, so this provider is just shared state.

interface DocumentContextValue {
  doc: CharacterDocument
  setDoc: React.Dispatch<React.SetStateAction<CharacterDocument>>
}

const DocumentContext = createContext<DocumentContextValue | null>(null)

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  // Must be nested inside CharacterProvider: the initial document wraps the
  // already-mounted active build so the two contexts agree on its id.
  const { build } = useCharacter()
  const [doc, setDoc] = useState<CharacterDocument>(() => emptyDocument(build))
  // The document is named after the character, so typing in CharacterInfo's
  // Name field renames the save and its auto-named life tabs straight away
  // rather than waiting for the next save/switch sync. applyCharacterName
  // returns the same object when nothing changes, so this settles in one pass.
  const characterName = build.name
  useEffect(() => {
    setDoc(d => applyCharacterName(d, characterName))
  }, [characterName])
  return (
    <DocumentContext.Provider value={{ doc, setDoc }}>
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocument() {
  const ctx = useContext(DocumentContext)
  if (!ctx) throw new Error('useDocument must be used inside DocumentProvider')
  return ctx
}
