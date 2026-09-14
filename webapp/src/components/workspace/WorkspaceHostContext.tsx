// A few panels need something only the app shell owns: loading a document
// picked from the Community page, or reopening the welcome tour from Help.
// The registry cannot pass props (a window is just a panel key), so those
// actions travel through this context instead.

import { createContext, useContext } from 'react'
import type { CharacterDocument } from '../../types/ddo'

export interface WorkspaceHost {
  loadDocument: (doc: CharacterDocument) => void
  startTour: () => void
}

const noop = () => { /* no host mounted */ }

export const WorkspaceHostContext = createContext<WorkspaceHost>({
  loadDocument: noop,
  startTour: noop,
})

export function useWorkspaceHost(): WorkspaceHost {
  return useContext(WorkspaceHostContext)
}
