// Build History Log — V2 LogPane parity.
// actionToLogMessage maps significant build action types to human-readable log
// strings. High-frequency / noisy actions (notes, buff toggles, sliders) return
// null so the log stays useful. Only one-time or infrequent mutations are logged.

export interface LogEntry {
  timestamp: string
  message: string
}

// Minimal action-shape mirror — we only need the discriminant + fields we read.
// (The real Action union lives in CharacterContext.tsx; we mirror just enough
//  here to keep buildLog.ts free of React/context imports.)
type LoggableAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RACE'; race: string }
  | { type: 'SET_ALIGNMENT'; alignment: string }
  | { type: 'SET_CLASS'; index: number; name: string }
  | { type: 'SET_CLASS_LEVELS'; index: number; levels: number }
  | { type: 'SET_LEVEL_CLASS'; level: number; name: string }
  | { type: 'SET_EPIC_LEVELS'; levels: number }
  | { type: 'SET_LEGENDARY_LEVELS'; levels: number }
  | { type: 'SET_ABILITY'; ability: string; score: number }
  | { type: 'SET_ABILITY_LEVELUP'; level: number; ability: string }
  | { type: 'SET_FEAT'; slotKey: string; featName: string }
  | { type: 'SET_SKILL_RANK'; skill: string; rank: number }
  | { type: 'SET_GEAR'; slot: string; itemName: string }
  | { type: 'CLEAR_GEAR'; slot: string }
  | { type: 'SET_AUGMENT'; key: string; augmentName: string }
  | { type: 'SET_PAST_LIFE'; source: string; count: number }
  | { type: 'SET_DESTINY_CHOICE'; treeName: string; itemName: string; rank: number }
  | { type: 'RESET_DESTINY_TREE'; treeName: string }
  | { type: 'SET_ACTIVE_DESTINY'; name: string }
  | { type: 'SET_REAPER_CHOICE'; treeName: string; itemName: string; rank: number }
  | { type: 'RESET_ENH_TREE'; treeName: string }
  | { type: 'SET_ENH_CHOICES'; treeName: string; choices: Record<string, number> }
  | { type: 'TRAIN_SPELL'; className: string; spellLevel: number; spellName: string }
  | { type: 'REVOKE_SPELL'; className: string; spellLevel: number; spellName: string }
  | { type: 'LOAD_BUILD'; build: { name?: string } }
  | { type: 'RESET' }
  | { type: 'SAVE_GEAR_SET'; setName: string }
  | { type: 'LOAD_GEAR_SET'; setName: string }
  | { type: 'SET_GUILD_LEVEL'; level: number }
  | { type: string }

export function actionToLogMessage(action: LoggableAction): string | null {
  switch (action.type) {
    case 'SET_NAME':
      return `Name changed to "${action.name}"`

    case 'SET_RACE':
      return `Race changed to "${action.race}"`

    case 'SET_ALIGNMENT':
      return `Alignment changed to "${action.alignment}"`

    case 'SET_CLASS':
      return `Class ${action.index + 1} changed to "${action.name}"`

    case 'SET_CLASS_LEVELS':
      return `Class ${action.index + 1} levels set to ${action.levels}`

    case 'SET_LEVEL_CLASS':
      return `Level ${action.level + 1} class changed to "${action.name}"`

    case 'SET_EPIC_LEVELS':
      return `Epic levels changed to ${action.levels}`

    case 'SET_LEGENDARY_LEVELS':
      return `Legendary levels changed to ${action.levels}`

    case 'SET_ABILITY':
      return `${action.ability} set to ${action.score}`

    case 'SET_ABILITY_LEVELUP':
      return `Ability level-up at level ${action.level} assigned to ${action.ability}`

    case 'SET_FEAT':
      return `Feat trained: "${action.featName}" (slot: ${action.slotKey})`

    case 'SET_SKILL_RANK':
      return `Skill "${action.skill}" ranks set to ${action.rank}`

    case 'SET_GEAR':
      return `${action.slot}: equipped "${action.itemName}"`

    case 'CLEAR_GEAR':
      return `${action.slot}: unequipped`

    case 'SET_AUGMENT':
      return `Augment set: ${action.key} → "${action.augmentName}"`

    case 'SET_PAST_LIFE':
      return `Past life "${action.source}" set to ×${action.count}`

    case 'SET_DESTINY_CHOICE':
      return `Epic destiny "${action.treeName}" — "${action.itemName}" rank ${action.rank}`

    case 'RESET_DESTINY_TREE':
      return `Epic destiny tree "${action.treeName}" reset`

    case 'SET_ACTIVE_DESTINY':
      return `Active destiny changed to "${action.name}"`

    case 'SET_REAPER_CHOICE':
      return `Reaper tree "${action.treeName}" — "${action.itemName}" rank ${action.rank}`

    case 'RESET_ENH_TREE':
      return `Enhancement tree "${action.treeName}" reset`

    case 'SET_ENH_CHOICES':
      return `Enhancement tree "${action.treeName}" updated`

    case 'TRAIN_SPELL':
      return `Trained ${action.className} spell "${action.spellName}" at spell level ${action.spellLevel}`

    case 'REVOKE_SPELL':
      return `Revoked ${action.className} spell "${action.spellName}" at spell level ${action.spellLevel}`

    case 'LOAD_BUILD':
      return `Build loaded: "${action.build?.name ?? '(unnamed)'}"`

    case 'RESET':
      return 'Build reset to new character'

    case 'SAVE_GEAR_SET':
      return `Gear set saved: "${action.setName}"`

    case 'LOAD_GEAR_SET':
      return `Gear set loaded: "${action.setName}"`

    case 'SET_GUILD_LEVEL':
      return `Guild level set to ${action.level}`

    // Deliberately suppressed — too high-frequency or already visible elsewhere:
    case 'SET_NOTES':
    case 'TOGGLE_BUFF':
    case 'TOGGLE_STANCE':
    case 'SET_STANCE_OVERRIDE':
    case 'CLEAR_STANCE_OVERRIDES':
    case 'SET_SLIDER':
    case 'TOGGLE_QUEST':
    case 'SET_CLICKIE_CHARGES':
    case 'RESET_ALL_CLICKIES':
    case 'SET_SLA_CHARGES':
    case 'RESET_ALL_SLA_CHARGES':
    case 'SET_SKILL_RANK_AT_LEVEL':
    case 'SET_ABILITY_TOME':
    case 'SET_SKILL_TOME':
    case 'SET_FILIGREE':
    case 'SET_FILIGREE_RARE':
    case 'SET_ARTIFACT_FILIGREE':
    case 'SET_ARTIFACT_FILIGREE_RARE':
    case 'SET_QUEST_DIFFICULTY':
      return null

    default:
      return null
  }
}

export function makeLogEntry(message: string): LogEntry {
  return { timestamp: new Date().toISOString(), message }
}
