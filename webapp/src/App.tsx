import { useEffect, useMemo, useState } from 'react'
import { preloadStaticBundle } from './hooks/useStaticBundle'
import { CharacterProvider, useCharacter } from './context/CharacterContext'
import { BuildLogProvider } from './context/BuildLogContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import { SaveLoadBar } from './hooks/usePersistence'
import { DocumentProvider, useDocument } from './context/DocumentContext'
import { CollabProvider, useCollab } from './context/CollabContext'
import CollabBar from './components/collab/CollabBar'
import { SettingsProvider } from './context/SettingsContext'
import AppShortcuts from './components/layout/AppShortcuts'
import FeedbackWidget from './components/layout/FeedbackWidget'
import WelcomeTour, { shouldShowTour } from './components/layout/WelcomeTour'
import ErrorBoundary from './components/common/ErrorBoundary'
import LifeBuildBar from './components/layout/LifeBuildBar'
import Workspace from './components/workspace/Workspace'
import ToolWindow from './components/workspace/ToolWindow'
import { WorkspaceHostContext, type WorkspaceHost } from './components/workspace/WorkspaceHostContext'
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout'
import { PAGES, type PageId } from './lib/workspace'
import { findActiveBuild } from './lib/multiLife'
import { readSession } from './lib/sessionStore'
import type { CharacterDocument } from './types/ddo'
import GearVerifier from './components/builder/GearVerifier'
import styles from './App.module.css'

// ---------------------------------------------------------------------------
// Page model — four pages, each a workspace of windows on a snapping grid.
//
// Character is the build: its tabs (Overview, Skills, Feats, Spells, Level
// Plan, Enhancements, Destinies, Reaper, Past Lives, Favor, Gear, Combat,
// Optimizer, Notes & Export) are workspaces the user can rearrange, and any
// panel — stances, breakdowns, DCs, the damage calculator — can be placed on
// any of them. Crafting, Community and Plugins are the tools around the
// build. Settings, Content and Help open from the Tools menu as floating
// windows over whatever page is showing.
// ---------------------------------------------------------------------------

/** Utility panels that open over the page rather than living on it. */
const TOOL_WINDOWS = ['Settings', 'Content I Own', 'Help & About', 'Build Log'] as const
type ToolWindowName = (typeof TOOL_WINDOWS)[number]

const PAGE_KEY = 'ddo-builder-page'

function readPage(): PageId {
  try {
    const stored = localStorage.getItem(PAGE_KEY)
    if (stored && (PAGES as string[]).includes(stored)) return stored as PageId
  } catch { /* fall through */ }
  return 'Character'
}

export default function App() {
  return (
    <BuildLogProvider>
      <CharacterProvider>
        <DocumentProvider>
          <SettingsProvider>
            <AuthProvider>
              <CollabProvider>
                <AppInner />
              </CollabProvider>
            </AuthProvider>
          </SettingsProvider>
        </DocumentProvider>
      </CharacterProvider>
    </BuildLogProvider>
  )
}

function AccountButton({ onGoToAccount }: { onGoToAccount: () => void }) {
  const { user } = useAuth()
  return (
    <button
      type="button"
      className={styles.accountBtn}
      onClick={onGoToAccount}
      title={user ? 'Your account and saved builds' : 'Sign in to save and share builds'}
    >
      {user ? `⚔ ${user.username}` : 'Sign in'}
    </button>
  )
}

/** The share token in the address bar, when the page was opened from a
 *  collaboration link (`?share=…`). */
function shareTokenFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('share')
  } catch {
    return null
  }
}

function AppInner() {
  const { dispatch } = useCharacter()
  const { setDoc } = useDocument()
  const { user } = useAuth()
  const [page, setPageState] = useState<PageId>(readPage)
  // First visit in this browser gets the tutorial; afterwards it only opens
  // from Help. Read once on mount so a re-render never re-triggers it.
  const [tourOpen, setTourOpen] = useState(() => shouldShowTour())
  const [tool, setTool] = useState<ToolWindowName | null>(null)

  const layoutApi = useWorkspaceLayout(user?.id ?? null)

  function setPage(next: PageId) {
    setPageState(next)
    try { localStorage.setItem(PAGE_KEY, next) } catch { /* ignore */ }
  }

  // Warm the shared catalogue bundle at startup so every window — especially
  // the analysis ones — has the complete dataset ready instead of each
  // fetching its own copy on first render.
  useEffect(() => { preloadStaticBundle() }, [])

  // Restore the document that was open last time. Opening the app on an empty
  // level-1 character when you spent yesterday on a 34-life build — with the
  // real one sitting in localStorage the whole time — is a needless loss.
  useEffect(() => {
    // A collaboration link brings its own document; restoring the last local
    // session first would flash the wrong character and then be pushed at the
    // people already in the shared build.
    if (shareTokenFromUrl()) return
    const restored = readSession()
    if (!restored) return
    setDoc(restored)
    const build = findActiveBuild(restored)
    if (build) dispatch({ type: 'LOAD_BUILD', build })
    // Once, on mount, before any edit can overwrite the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Opened from a share link: join the shared build instead of the last local
  // character. The token stays in the address bar so a reload rejoins.
  const { join: joinCollab } = useCollab()
  const [joinError, setJoinError] = useState<string | null>(null)
  useEffect(() => {
    const token = shareTokenFromUrl()
    if (!token) return
    joinCollab(token).catch((err: unknown) => {
      setJoinError(err instanceof Error ? err.message : 'That share link could not be opened')
    })
    // Once, on mount: joining twice would leave a duplicate stream open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLoad(doc: CharacterDocument) {
    setDoc(doc)
    const build = findActiveBuild(doc)
    if (build) dispatch({ type: 'LOAD_BUILD', build })
    setPage('Character')
  }

  const host = useMemo<WorkspaceHost>(() => ({
    loadDocument: handleLoad,
    startTour: () => { setTool(null); setTourOpen(true) },
    // handleLoad closes over stable context setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const toolsMenu = (
    <>
      {TOOL_WINDOWS.map(name => (
        <button key={name} type="button" className={styles.menuItem} data-closes-menu onClick={() => setTool(name)}>
          {name}
        </button>
      ))}
    </>
  )

  return (
    <WorkspaceHostContext.Provider value={host}>
      <AppShortcuts onLoad={handleLoad} />
      <GearVerifier />
      <CollabBar />
      {joinError && <div className={styles.joinError} role="alert">{joinError}</div>}
      <Layout
        pages={PAGES}
        activePage={page}
        onNavigate={p => setPage(p as PageId)}
        fileMenu={<SaveLoadBar onLoad={handleLoad} />}
        toolsMenu={toolsMenu}
        account={<AccountButton onGoToAccount={() => setPage('Community')} />}
        livesBar={<LifeBuildBar />}
      >
        {/* One window throwing is caught inside that window; this boundary
            is for the workspace chrome itself. The key resets it when the
            user changes page, so a bad page is never sticky. */}
        <ErrorBoundary key={page} label={page}>
          <Workspace page={page} api={layoutApi} />
        </ErrorBoundary>
      </Layout>
      {tool && <ToolWindow panel={tool} onClose={() => setTool(null)} />}
      <FeedbackWidget page={page} />
      {tourOpen && <WelcomeTour onClose={() => setTourOpen(false)} />}
    </WorkspaceHostContext.Provider>
  )
}
