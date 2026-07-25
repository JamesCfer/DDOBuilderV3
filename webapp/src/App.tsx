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
import BreakdownsPanel from './components/breakdowns/BreakdownsPanel'
import FavoritesDock from './components/breakdowns/FavoritesDock'
import CombatPanel from './components/combat/CombatPanel'
import BuildCompare from './components/layout/BuildCompare'
import PastLivesPanel from './components/pastlives/PastLivesPanel'
import GuildBuffsPanel from './components/guildbuffs/GuildBuffsPanel'
import SetBonusesPanel from './components/setbonuses/SetBonusesPanel'
import StancesPanel from './components/stances/StancesPanel'
import FiligreePanel from './components/filigree/FiligreePanel'
import DCPanel from './components/dc/DCPanel'
import TomesPanel from './components/builder/TomesPanel'
import SelfBuffsPanel from './components/buffs/SelfBuffsPanel'
import BonusesPanel from './components/bonuses/BonusesPanel'
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
import LifeBuildBar from './components/layout/LifeBuildBar'
import { findActiveBuild } from './lib/multiLife'
import type { CharacterDocument } from './types/ddo'
import styles from './App.module.css'

// ---------------------------------------------------------------------------
// Page model — five destinations plus a utility page, each with sub-tabs
// (HeroForge-style consolidation of the old 30-item sidebar).
// ---------------------------------------------------------------------------

type Page = 'Character' | 'Progression' | 'Equipment' | 'Analysis' | 'Community' | 'More'

const PAGES: Page[] = ['Character', 'Progression', 'Equipment', 'Analysis', 'Community', 'More']

const PAGE_TABS: Record<Page, string[]> = {
  Character:   ['Overview', 'Skills', 'Feats', 'Spells', 'Tomes', 'Level Plan'],
  Progression: ['Enhancements', 'Epic Destinies', 'Reaper', 'Past Lives', 'Favor'],
  Equipment:   ['Gear', 'Filigrees', 'Set Bonuses', 'Clickies'],
  Analysis:    ['Breakdowns', 'Combat', 'DCs', 'Stances', 'Bonuses', 'Buffs', 'Compare'],
  Community:   ['Browse', 'My Builds'],
  More:        ['Windows', 'Notes', 'Forum Export', 'Content', 'Settings', 'Help', 'Build Log'],
}

/** Tabs whose content wants the full viewport width (trees, tables). */
const WIDE_TABS = new Set([
  'Enhancements', 'Epic Destinies', 'Reaper', 'Gear', 'Combat',
  'Breakdowns', 'Compare', 'Windows', 'Level Plan', 'Filigrees',
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
            </div>
            <div className={styles.overviewCol}>
              <StatsPanel />
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
      case 'Equipment/Gear':        return <GearPanel />
      case 'Equipment/Filigrees':   return <FiligreePanel />
      case 'Equipment/Set Bonuses': return <SetBonusesPanel />
      case 'Equipment/Clickies':    return <ClickiesPanel />

      // ── Analysis ─────────────────────────────────────────────────────────
      case 'Analysis/Breakdowns':   return <BreakdownsPanel />
      case 'Analysis/Combat':       return <CombatPanel />
      case 'Analysis/DCs':          return <DCPanel />
      case 'Analysis/Stances':      return <StancesPanel />
      case 'Analysis/Bonuses':      return <BonusesPanel />
      case 'Analysis/Buffs':
        return (
          <div className={styles.twoCol}>
            <SelfBuffsPanel />
            <GuildBuffsPanel />
          </div>
        )
      case 'Analysis/Compare':      return <BuildCompare />

      // ── Community ────────────────────────────────────────────────────────
      case 'Community/Browse':      return <CommunityPanel onLoad={handleLoad} />
      case 'Community/My Builds':   return <AccountPanel onLoad={handleLoad} />

      // ── More ─────────────────────────────────────────────────────────────
      case 'More/Windows':      return <Dashboard />
      case 'More/Notes':        return <NotesPanel />
      case 'More/Forum Export': return <ForumExportPanel />
      case 'More/Content':      return <ContentPanel />
      case 'More/Settings':     return <SettingsPanel />
      case 'More/Help':         return <HelpPanel />
      case 'More/Build Log':    return <BuildHistoryPanel />

      default: return null
    }
  }

  return (
    <>
      <AppShortcuts onLoad={handleLoad} />
      <Layout
        pages={PAGES}
        activePage={page}
        onNavigate={p => setPage(p as Page)}
        subTabs={PAGE_TABS[page]}
        activeSubTab={tab}
        onSubTab={t => setTabs(prev => ({ ...prev, [page]: t }))}
        fileMenu={<SaveLoadBar onLoad={handleLoad} />}
        account={<AccountButton onGoToAccount={goToAccount} />}
        livesBar={<LifeBuildBar />}
      >
        <div className={styles.contentRow}>
          <div className={`${styles.tabArea} ${WIDE_TABS.has(tab) ? styles.wide : styles.narrow}`}>
            {renderTab()}
          </div>
          <FavoritesDock />
        </div>
      </Layout>
    </>
  )
}
