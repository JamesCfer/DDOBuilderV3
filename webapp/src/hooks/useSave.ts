// One Save for the whole app.
//
// Save keeps the character inside DDO Builder: always in this browser, and
// in your account as well whenever you are signed in, updating the same
// account copy each time. The File menu, Ctrl+S and the account page all
// call this, so there is one list of saved characters, not two.
//
// Export is a different thing: it downloads a file (a .DDOBuild for DDO
// Builder V2, or a JSON backup) and leaves your saves alone.

import { useCallback } from 'react'
import type { CharacterDocument } from '../types/ddo'
import { useCharacter } from '../context/CharacterContext'
import { useDocument } from '../context/DocumentContext'
import { useOptionalUser } from '../context/AuthContext'
import { usePersistence } from './usePersistence'
import { syncBuildIntoDocument, repairCharacterNames } from '../lib/multiLife'
import { communityApi } from '../lib/community/api'

export interface SaveResult {
  /** Name it was saved under. */
  name: string
  /** True when the account copy was written too. */
  inAccount: boolean
  /** Why the account copy failed, when signed in and it did. */
  accountError?: string
}

/** Writes `doc` to the signed-in account, updating its existing copy. A copy
 *  deleted from the account page is simply created again. */
export async function saveDocToAccount(doc: CharacterDocument, name: string): Promise<string> {
  const payload = { name, document: { ...doc, accountBuildId: undefined } }
  if (doc.accountBuildId) {
    try {
      return (await communityApi.saveBuild({ ...payload, id: doc.accountBuildId })).id
    } catch {
      // Fall through: the account copy is gone (or not ours), make a new one.
    }
  }
  return (await communityApi.saveBuild(payload)).id
}

export function useSave() {
  const { build } = useCharacter()
  const { doc, setDoc } = useDocument()
  const user = useOptionalUser()
  const { saveDocument } = usePersistence()

  return useCallback(async (preferredName?: string): Promise<SaveResult> => {
    let current = repairCharacterNames(syncBuildIntoDocument(doc, build), preferredName ?? build.name)
    const name = (current.name || build.name || 'Unnamed character').trim().slice(0, 80)
    saveDocument(current)
    setDoc(current)
    if (!user) return { name, inAccount: false }
    try {
      const id = await saveDocToAccount(current, name)
      if (id !== current.accountBuildId) {
        current = { ...current, accountBuildId: id }
        saveDocument(current)
        setDoc(current)
      }
      return { name, inAccount: true }
    } catch (err) {
      return { name, inAccount: false, accountError: err instanceof Error ? err.message : 'Account save failed' }
    }
  }, [doc, build, user, saveDocument, setDoc])
}
