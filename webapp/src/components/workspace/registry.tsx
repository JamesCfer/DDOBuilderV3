// Window registry — every panel that can be placed on a workspace, keyed by
// the title the user sees. The default layouts in lib/workspace.ts refer to
// these keys, and the "+ Add window" menu lists them by group.
//
// Panels load lazily so a tab only pays for what it shows. A few need an
// app-level action (load a build, start the tour); those get a thin wrapper
// that reads it from WorkspaceHostContext.

import React, { lazy } from 'react'
import { useWorkspaceHost } from './WorkspaceHostContext'
import StancesPanel from '../stances/StancesPanel'
import SelfBuffsPanel from '../buffs/SelfBuffsPanel'
import GuildBuffsPanel from '../guildbuffs/GuildBuffsPanel'

export type WindowGroup = 'Build' | 'Progression' | 'Equipment' | 'Combat' | 'Analysis' | 'Stances & Buffs' | 'Tools' | 'Crafting' | 'Community' | 'Plugins'

export interface WindowDefinition {
  group: WindowGroup
  component: React.ComponentType
  /** Default size in pixels when added from the menu. */
  size: { w: number; h: number }
}

// ---------------------------------------------------------------------------
// Wrappers for panels that take props
// ---------------------------------------------------------------------------

const CommunityPanel = lazy(() => import('../community/CommunityPanel'))
const AccountPanel = lazy(() => import('../community/AccountPanel'))
const HelpPanel = lazy(() => import('../layout/HelpPanel'))

function BrowseBuildsWindow() {
  const { loadDocument } = useWorkspaceHost()
  return <CommunityPanel onLoad={loadDocument} />
}

function MyBuildsWindow() {
  const { loadDocument } = useWorkspaceHost()
  return <AccountPanel onLoad={loadDocument} />
}

function HelpWindow() {
  const { startTour } = useWorkspaceHost()
  return <HelpPanel onStartTour={startTour} />
}

/** Stances with the buff toggles directly below — the shallowest choices in
 *  the app, one click each, and they move half the numbers on screen. */
export function StancesAndBuffs() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StancesPanel />
      <SelfBuffsPanel />
      <GuildBuffsPanel />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const S = (w: number, h: number) => ({ w, h })

export const WINDOW_REGISTRY: Record<string, WindowDefinition> = {
  // Build
  'Character Info':    { group: 'Build', component: lazy(() => import('../builder/CharacterInfo')), size: S(360, 280) },
  'Race':              { group: 'Build', component: lazy(() => import('../builder/RaceSelector')), size: S(360, 200) },
  'Classes':           { group: 'Build', component: lazy(() => import('../builder/ClassSelector')), size: S(360, 340) },
  'Ability Scores':    { group: 'Build', component: lazy(() => import('../builder/AbilityScores')), size: S(480, 380) },
  'Ability Level Ups': { group: 'Build', component: lazy(() => import('../builder/AbilityLevelUps')), size: S(480, 200) },
  'Tomes':             { group: 'Build', component: lazy(() => import('../builder/TomesPanel')), size: S(480, 240) },
  'Stats':             { group: 'Build', component: lazy(() => import('../builder/StatsPanel')), size: S(430, 480) },
  'Skills':            { group: 'Build', component: lazy(() => import('../builder/Skills')), size: S(1000, 700) },
  'Feats':             { group: 'Build', component: lazy(() => import('../builder/FeatSlots')), size: S(900, 520) },
  'Automatic Feats':   { group: 'Build', component: lazy(() => import('../builder/AutomaticFeats')), size: S(900, 280) },
  'Spells':            { group: 'Build', component: lazy(() => import('../builder/SpellsPanel')), size: S(900, 700) },
  'Level Training':    { group: 'Build', component: lazy(() => import('../builder/LevelTrainingPanel')), size: S(1400, 800) },

  // Progression
  'Enhancements':      { group: 'Progression', component: lazy(() => import('../enhancements/EnhancementTreePanel')), size: S(1100, 800) },
  'Epic Destinies':    { group: 'Progression', component: lazy(() => import('../epicdestinies/EpicDestiniesPanel')), size: S(1100, 800) },
  'Reaper':            { group: 'Progression', component: lazy(() => import('../reaper/ReaperPanel')), size: S(1100, 700) },
  'Past Lives':        { group: 'Progression', component: lazy(() => import('../pastlives/PastLivesPanel')), size: S(760, 700) },
  'Favor':             { group: 'Progression', component: lazy(() => import('../favor/FavorPanel')), size: S(760, 700) },

  // Equipment
  'Gear':              { group: 'Equipment', component: lazy(() => import('../items/GearPanel')), size: S(1000, 700) },
  'Filigrees':         { group: 'Equipment', component: lazy(() => import('../filigree/FiligreePanel')), size: S(1000, 380) },
  'Set Bonuses':       { group: 'Equipment', component: lazy(() => import('../setbonuses/SetBonusesPanel')), size: S(480, 340) },
  'Clickies':          { group: 'Equipment', component: lazy(() => import('../items/ClickiesPanel')), size: S(480, 380) },

  // Combat
  'Combat':            { group: 'Combat', component: lazy(() => import('../combat/CombatPanel')), size: S(720, 700) },
  'Damage Calc':       { group: 'Combat', component: lazy(() => import('../combat/DamageCalcPanel')), size: S(860, 700) },

  // Analysis
  'Breakdowns':        { group: 'Analysis', component: lazy(() => import('../breakdowns/BreakdownsPanel')), size: S(440, 760) },
  'DCs':               { group: 'Analysis', component: lazy(() => import('../dc/DCPanel')), size: S(560, 480) },
  'Bonuses':           { group: 'Analysis', component: lazy(() => import('../bonuses/BonusesPanel')), size: S(620, 480) },
  'Compare':           { group: 'Analysis', component: lazy(() => import('../layout/BuildCompare')), size: S(720, 700) },

  // Stances & Buffs
  'Stances & Buffs':   { group: 'Stances & Buffs', component: StancesAndBuffs, size: S(340, 800) },
  'Stances':           { group: 'Stances & Buffs', component: StancesPanel, size: S(340, 420) },
  'Self Buffs':        { group: 'Stances & Buffs', component: SelfBuffsPanel, size: S(340, 380) },
  'Guild Buffs':       { group: 'Stances & Buffs', component: GuildBuffsPanel, size: S(340, 300) },

  // Tools
  'Optimizer':         { group: 'Tools', component: lazy(() => import('../optimizer/OptimizerPanel')), size: S(1000, 700) },
  'Notes':             { group: 'Tools', component: lazy(() => import('../notes/NotesPanel')), size: S(620, 480) },
  'Forum Export':      { group: 'Tools', component: lazy(() => import('../export/ForumExportPanel')), size: S(900, 700) },
  'Build Log':         { group: 'Tools', component: lazy(() => import('../layout/BuildHistoryPanel')), size: S(620, 380) },
  'Content I Own':     { group: 'Tools', component: lazy(() => import('../layout/ContentPanel')), size: S(720, 600) },
  'Settings':          { group: 'Tools', component: lazy(() => import('../layout/SettingsPanel')), size: S(560, 600) },
  'Help & About':      { group: 'Tools', component: HelpWindow, size: S(620, 600) },

  // Crafting
  'Crafting Systems':  { group: 'Crafting', component: lazy(() => import('../crafting/CraftingPanel')), size: S(800, 800) },
  'Cannith Planner':   { group: 'Crafting', component: lazy(() => import('../crafting/CannithPlanner')), size: S(800, 800) },

  // Community
  'Browse Builds':     { group: 'Community', component: BrowseBuildsWindow, size: S(900, 800) },
  'My Builds':         { group: 'Community', component: MyBuildsWindow, size: S(680, 800) },

  // Plugins
  'Dungeon Help':      { group: 'Plugins', component: lazy(() => import('../plugins/PluginsPanel')), size: S(1400, 800) },
}

export const WINDOW_GROUPS: WindowGroup[] = [
  'Build', 'Progression', 'Equipment', 'Combat', 'Analysis', 'Stances & Buffs', 'Tools', 'Crafting', 'Community', 'Plugins',
]

/** Registry keys grouped for a menu, in registry order within each group. */
export function windowsByGroup(): Array<{ group: WindowGroup; panels: string[] }> {
  return WINDOW_GROUPS
    .map(group => ({ group, panels: Object.keys(WINDOW_REGISTRY).filter(k => WINDOW_REGISTRY[k].group === group) }))
    .filter(g => g.panels.length > 0)
}
