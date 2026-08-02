import { useEffect, useState } from 'react'
import { preloadStaticBundle } from './hooks/useStaticBundle'
import { CharacterProvider, useCharacter } from './context/CharacterContext'
import { BuildLogProvider } from './context/BuildLogContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import BuildHistoryPanel from './components/layout/BuildHistoryPanel'
import Layout from './components/layout/Layout'
import CharacterInfo from './components/builder/CharacterInfo'
import RaceSelector from './components/builder/RaceSelector'
import ClassSelector from './components/builder/ClassSelector'
import AbilityScores from './components/builder/AbilityScores'
import AbilityLevelUps from './components/builder/AbilityLevelUps'
import StatsPanel from './components/builder/StatsPanel'
import FeatSlots from './components/builder/FeatSlots'
import Skills from './components/builder/Skills'
import LevelTrainingPanel from './components/builder/LevelTrainingPanel'
import AutomaticFeats from './components/builder/AutomaticFeats'
import SpellsPanel from './components/builder/SpellsPanel'
import EnhancementTreePanel from './components/enhancements/EnhancementTreePanel'
import EpicDestiniesPanel from './components/epicdestinies/EpicDestiniesPanel'
import ReaperPanel from './components/reaper/ReaperPanel'
import GearPanel from './components/items/GearPanel'
import ClickiesPanel from './components/items/ClickiesPanel'
import StanceBuffDock from './components/layout/StanceBuffDock'
import AnalysisDock from './components/layout/AnalysisDock'
import PastLivesPanel from './components/pastlives/PastLivesPanel'
import SetBonusesPanel from './components/setbonuses/SetBonusesPanel'
import FiligreePanel from './components/filigree/FiligreePanel'
import TomesPanel from './components/builder/TomesPanel'
import FavorPanel from './components/favor/FavorPanel'
import NotesPanel from './components/notes/NotesPanel'
import ForumExportPanel from './components/export/ForumExportPanel'
import CommunityPanel from './components/community/CommunityPanel'
import AccountPanel from './components/community/AccountPanel'
import { SaveLoadBar } from './hooks/usePersistence'
import { DocumentProvider, useDocument } from './context/DocumentContext'
import { SettingsProvider } from './context/SettingsContext'
import SettingsPanel from './components/layout/SettingsPanel'
import ContentPanel from './components/layout/ContentPanel'
import HelpPanel from './components/layout/HelpPanel'
import AppShortcuts from './components/layout/AppShortcuts'
import Dashboard from './components/layout/Dashboard'
import OptimizerPanel from './components/optimizer/OptimizerPanel'
import LifeBuildBar from './components/layout/LifeBuildBar'
import { findActiveBuild } from './lib/multiLife'
import { readSession } from './lib/sessionStore'
import type { CharacterDocument } from './types/ddo'
import styles from './App.module.css'

// ---------------------------------------------------------------------------
// Page model — five destinations plus a utility page, each with sub-tabs
// (HeroForge-style consolidation of the old 30-item sidebar).
// ---------------------------------------------------------------------------

// Analysis is not a page: it is the right-hand rail (AnalysisDock), visible
// on every page, because every choice made here is only interesting for what
// it does to those numbers.
type Page = 'Character' | 'Progression' | 'Equipment' | 'Community' | 'Custom'

const PAGES: Page[] = ['Character', 'Progression', 'Equipment', 'Community', 'Custom']

const PAGE_TABS: Record<Page, string[]> = {
  Character:   ['Overview', 'Skills', 'Feats', 'Spells', 'Tomes', 'Level Plan'],
  Progression: ['Enhancements', 'Epic Destinies', 'Reaper', 'Past Lives', 'Favor'],
  // Equipment is one page: gear, filigrees, set bonuses and clickies are all
  // the same decision ("what am I wearing"), and set bonuses in particular
  // only make sense next to the gear that grants them.
  Equipment:   ['Gear'],
  Community:   ['Browse', 'My Builds'],
  Custom:      ['Windows', 'Optimizer', 'Notes', 'Forum Export', 'Content', 'Settings', 'Help', 'Build Log'],
}

/** Tabs whose content wants the full viewport width (trees, tables). */
const WIDE_TABS = new Set([
  'Enhancements', 'Epic Destinies', 'Reaper', 'Gear', 'Windows',
  'Level Plan', 'Optimizer',
])

export default function App() {
  return (
    <BuildLogProvider>
      <CharacterProvider>
        <DocumentProvider>
          <SettingsProvider>
            <AuthProvider>
              <AppInner />
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

function AppInner() {
  const { dispatch } = useCharacter()
  const { setDoc } = useDocument()
  const [page, setPage] = useState<Page>('Character')

  // Warm the shared catalogue bundle at startup so every tab — especially
  // Analysis — has the complete dataset ready instead of each tab fetching
  // its own copy on first visit.
  useEffect(() => { preloadStaticBundle() }, [])

  // Restore the document that was open last time. Opening the app on an empty
  // level-1 character when you spent yesterday on a 34-life build — with the
  // real one sitting in localStorage the whole time — is a needless loss.
  useEffect(() => {
    const restored = readSession()
    if (!restored) return
    setDoc(restored)
    const build = findActiveBuild(restored)
    if (build) dispatch({ type: 'LOAD_BUILD', build })
    // Once, on mount, before any edit can overwrite the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [tabs, setTabs] = useState<Record<Page, string>>(() => (
    Object.fromEntries(PAGES.map(p => [p, PAGE_TABS[p][0]])) as Record<Page, string>
  ))

  const tab = tabs[page]

  function handleLoad(doc: CharacterDocument) {
    setDoc(doc)
    const build = findActiveBuild(doc)
    if (build) dispatch({ type: 'LOAD_BUILD', build })
  }

  function goToAccount() {
    setPage('Community')
    setTabs(t => ({ ...t, Community: 'My Builds' }))
  }

  function renderTab(): React.ReactNode {
    switch (`${page}/${tab}`) {
      // ── Character ────────────────────────────────────────────────────────
      case 'Character/Overview':
        return (
          <div className={styles.overviewGrid}>
            <div className={styles.overviewCol}>
              <CharacterInfo />
              <RaceSelector />
              <ClassSelector />
            </div>
            <div className={styles.overviewCol}>
              <AbilityScores />
              <AbilityLevelUps />
              {/* Tomes and past lives feed the ability/stat numbers shown on
                  this page, so both editors are reachable here as folded
                  cards instead of only from their own tabs. */}
              <TomesPanel collapsible />
            </div>
            <div className={styles.overviewCol}>
              <StatsPanel />
              <PastLivesPanel collapsible />
            </div>
          </div>
        )
      case 'Character/Skills':      return <Skills />
      case 'Character/Feats':
        return (
          <div className={styles.stack}>
            <FeatSlots />
            <AutomaticFeats />
          </div>
        )
      case 'Character/Spells':      return <SpellsPanel />
      case 'Character/Tomes':       return <TomesPanel />
      case 'Character/Level Plan':  return <LevelTrainingPanel />

      // ── Progression ──────────────────────────────────────────────────────
      case 'Progression/Enhancements':   return <EnhancementTreePanel />
      case 'Progression/Epic Destinies': return <EpicDestiniesPanel />
      case 'Progression/Reaper':         return <ReaperPanel />
      case 'Progression/Past Lives':     return <PastLivesPanel />
      case 'Progression/Favor':          return <FavorPanel />

      // ── Equipment ────────────────────────────────────────────────────────
      case 'Equipment/Gear':
        return (
          <div className={styles.stack}>
            <GearPanel />
            <FiligreePanel />
            <SetBonusesPanel />
            <ClickiesPanel />
          </div>
        )

      // ── Community ────────────────────────────────────────────────────────
      case 'Community/Browse':      return <CommunityPanel onLoad={handleLoad} />
      case 'Community/My Builds':   return <AccountPanel onLoad={handleLoad} />

      // ── Custom ───────────────────────────────────────────────────────────
      case 'Custom/Windows':      return <Dashboard />
      case 'Custom/Optimizer':    return <OptimizerPanel />
      case 'Custom/Notes':        return <NotesPanel />
      case 'Custom/Forum Export': return <ForumExportPanel />
      case 'Custom/Content':      return <ContentPanel />
      case 'Custom/Settings':     return <SettingsPanel />
      case 'Custom/Help':         return <HelpPanel />
      case 'Custom/Build Log':    return <BuildHistoryPanel />

      default: return null
    }
  }

  return (
    <>
      <AppShortcuts onLoad={handleLoad} />
      <Layout
        pages={PAGES}
        activePage={page}
        fullBleed={page === 'Custom' && tab === 'Windows'}
        onNavigate={p => setPage(p as Page)}
        subTabs={PAGE_TABS[page]}
        activeSubTab={tab}
        onSubTab={t => setTabs(prev => ({ ...prev, [page]: t }))}
        fileMenu={<SaveLoadBar onLoad={handleLoad} />}
        account={<AccountButton onGoToAccount={goToAccount} />}
        livesBar={<LifeBuildBar />}
      >
        <div className={styles.contentRow}>
          <StanceBuffDock />
          <div className={`${styles.tabArea} ${WIDE_TABS.has(tab) ? styles.wide : styles.narrow}`}>
            {renderTab()}
          </div>
          <AnalysisDock />
        </div>
      </Layout>
    </>
  )
}
