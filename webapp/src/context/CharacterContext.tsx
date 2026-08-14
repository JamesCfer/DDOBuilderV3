import React, { createContext, useCallback, useContext, useReducer } from 'react'
import type { CharacterBuild, Ability, FiligreeSlot, QuestDifficulty } from '../types/ddo'
import { emptyBuild, migrateSentientGem } from '../types/ddo'
import { aggregateLevelClasses, getLevelClasses, HEROIC_CAP } from '../lib/levelProgression'
import { EPIC_MAX_LEVELS, LEGENDARY_MAX_LEVELS } from '../lib/gamedata'
import { useBuildLog } from './BuildLogContext'
import { trainSpecialFeat, revokeSpecialFeat, trainFavorFeat, revokeFavorFeat } from '../lib/specialFeats'

type Action =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RACE'; race: string }
  | { type: 'SET_ALIGNMENT'; alignment: string }
  | { type: 'SET_CLASS'; index: 0 | 1 | 2; name: string }
  | { type: 'SET_CLASS_LEVELS'; index: 0 | 1 | 2; levels: number }
  | { type: 'SET_LEVEL_CLASS'; level: number; name: string }
  | { type: 'SET_LEVEL_CLASSES'; levels: string[] }
  | { type: 'SET_EPIC_LEVELS'; levels: number }
  | { type: 'SET_LEGENDARY_LEVELS'; levels: number }
  | { type: 'SET_ABILITY'; ability: Ability; score: number }
  | { type: 'SET_ABILITY_LEVELUP'; level: 4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40; ability: Ability }
  | { type: 'SET_FEAT'; slotKey: string; featName: string }
  | { type: 'SET_SKILL_RANK'; skill: string; rank: number }
  | { type: 'SET_SKILL_RANK_AT_LEVEL'; level: number; skill: string; rank: number }
  | { type: 'SET_GEAR'; slot: string; itemName: string }
  | { type: 'CLEAR_GEAR'; slot: string }
  | { type: 'SET_AUGMENT'; key: string; augmentName: string; levelIndex?: number }
  | { type: 'CLEAR_AUGMENT'; key: string }
  | { type: 'SET_AUGMENT_LEVEL'; key: string; levelIndex: number }
  | { type: 'SET_SLOT_UPGRADE'; key: string; upgradeType: string }
  | { type: 'SET_PAST_LIFE'; source: string; count: number }
  | { type: 'TRAIN_SPECIAL_FEAT'; featName: string }
  | { type: 'REVOKE_SPECIAL_FEAT'; featName: string }
  | { type: 'TRAIN_FAVOR_FEAT'; featName: string }
  | { type: 'REVOKE_FAVOR_FEAT'; featName: string }
  | { type: 'SET_FILIGREE'; slotIndex: number; name: string }
  | { type: 'SET_FILIGREE_COUNT'; count: number }
  | { type: 'SET_ARTIFACT_FILIGREE_COUNT'; count: number }
  | { type: 'SET_FILIGREE_RARE'; slotIndex: number; rare: boolean }
  | { type: 'SET_ARTIFACT_FILIGREE'; slotIndex: number; name: string }
  | { type: 'SET_ARTIFACT_FILIGREE_RARE'; slotIndex: number; rare: boolean }
  | { type: 'SET_DESTINY_CHOICE'; treeName: string; itemName: string; rank: number }
  | { type: 'SET_DESTINY_SELECTIONS'; treeName: string; selections: Record<string, string> }
  | { type: 'RESET_DESTINY_TREE'; treeName: string }
  | { type: 'SET_ACTIVE_DESTINY'; name: string }
  | { type: 'SET_SELECTED_DESTINY'; slot: 0 | 1 | 2; name: string }
  | { type: 'TOGGLE_UNLOCKED_DESTINY'; name: string }
  | { type: 'SET_TWIST_CHOICE'; slot: number; value: string }
  | { type: 'SET_REAPER_CHOICE'; treeName: string; itemName: string; rank: number }
  | { type: 'SET_REAPER_AP'; ap: number }
  | { type: 'SET_ABILITY_TOME'; ability: Ability; bonus: number }
  | { type: 'SET_SKILL_TOME'; skill: string; bonus: number }
  | { type: 'TOGGLE_BUFF'; buffName: string }
  | { type: 'TOGGLE_STANCE'; stanceName: string; incompatible?: string[] }
  | { type: 'TOGGLE_QUEST'; questName: string }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'SET_SENTIENT_GEM_NAME'; name: string }
  | { type: 'SET_SENTIENT_GEM_PERSONALITY'; personality: string }
  | { type: 'SET_SENTIENT_GEM_AUGMENT'; slot: 'major' | 'minor'; name: string }
  | { type: 'SET_ENH_CHOICES'; treeName: string; choices: Record<string, number> }
  | { type: 'SET_ENH_SELECTIONS'; treeName: string; selections: Record<string, string> }
  | { type: 'SET_ENH_PINNED'; pinned: string[] }
  | { type: 'RESET_ENH_TREE'; treeName: string }
  | { type: 'SAVE_GEAR_SET'; setName: string }
  | { type: 'LOAD_GEAR_SET'; setName: string }
  | { type: 'DELETE_GEAR_SET'; setName: string }
  | { type: 'LOAD_BUILD'; build: CharacterBuild }
  | { type: 'RESET' }
  // V2 parity actions
  | { type: 'SET_SLIDER'; name: string; value: number }
  | { type: 'TRAIN_SPELL'; className: string; spellLevel: number; spellName: string }
  | { type: 'REVOKE_SPELL'; className: string; spellLevel: number; spellName: string }
  | { type: 'TOGGLE_SPELL_METAMAGIC'; className: string; spellName: string; metamagic: string }
  | { type: 'CLEAR_SPELL_METAMAGICS'; className: string }
  | { type: 'SET_CLICKIE_CHARGES'; key: string; remaining: number }
  | { type: 'RESET_ALL_CLICKIES' }
  // Audit-fix V2 parity actions
  | { type: 'SET_GUILD_LEVEL'; level: number }
  | { type: 'TOGGLE_APPLY_GUILD_BUFFS' }
  | { type: 'SET_QUEST_DIFFICULTY'; questName: string; difficulty: QuestDifficulty | null }
  | { type: 'SET_SLA_CHARGES'; name: string; charges: number }
  | { type: 'RESET_ALL_SLA_CHARGES' }
  | { type: 'SET_ALTERNATE_FEAT'; slotKey: string; featName: string }
  | { type: 'CLEAR_ALTERNATE_FEAT'; slotKey: string }
  | { type: 'SET_ATTACK_CHAIN'; chainName: string; attacks: string[] }
  | { type: 'DELETE_ATTACK_CHAIN'; chainName: string }
  | { type: 'SET_ACTIVE_ATTACK_CHAIN'; chainName: string }

/** V2 MAX_FILIGREE (stdafx.h:61) — both weapon and artifact slot counts. */
export const MAX_FILIGREE_SLOTS = 20

/**
 * Normalise a stored filigree slot array.
 *
 * The array's LENGTH is the build's chosen slot count (V2
 * EquippedGear::SetNumFiligrees, EquippedGear.cpp:466, keeps the list sized
 * exactly to the count, blank entries included), so a saved count is data to
 * preserve — not a default to re-apply. `defaultCount` fills in only for a
 * build saved before the slots existed.
 */
function migrateFiligreeSlots(raw: unknown, defaultCount: number): FiligreeSlot[] {
  const arr: FiligreeSlot[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') arr.push({ name: item, rare: false })
      else if (item && typeof item === 'object' && 'name' in item) arr.push(item as FiligreeSlot)
    }
  }
  if (arr.length === 0) {
    return Array.from({ length: defaultCount }, () => ({ name: '', rare: false }))
  }
  return arr.slice(0, MAX_FILIGREE_SLOTS)
}

function migrateLevelClasses(raw: CharacterBuild): string[] {
  const explicit = (raw as unknown as { levelClasses?: unknown }).levelClasses
  if (Array.isArray(explicit) && explicit.every(v => typeof v === 'string')) {
    return (explicit as string[]).slice(0, HEROIC_CAP)
  }
  // Derive from existing aggregate totals so legacy saves continue to render.
  return getLevelClasses(raw)
}

/**
 * Normalises a build loaded from storage / import to the current shape:
 * every field added since the save was written gets its default. Exported so
 * document persistence can migrate every build in a CharacterDocument (not
 * just the one passed through LOAD_BUILD) — the V3 "build version migration"
 * path (V2 `Build version="1"` analogue).
 */
export function migrateLoad(raw: CharacterBuild): CharacterBuild {
  return {
    ...raw,
    levelClasses: migrateLevelClasses(raw),
    epicLevels: raw.epicLevels ?? 10,
    enhancementChoices: raw.enhancementChoices ?? {},
    enhancementSelections: raw.enhancementSelections ?? {},
    enhancementPinned: raw.enhancementPinned ?? [],
    legendaryLevels: raw.legendaryLevels ?? 4,
    skillRanks: raw.skillRanks ?? {},
    skillRanksByLevel: (raw as unknown as { skillRanksByLevel?: Record<number, Record<string, number>> }).skillRanksByLevel ?? {},
    gear: raw.gear ?? {},
    augmentChoices: raw.augmentChoices ?? {},
    slotUpgradeChoices: raw.slotUpgradeChoices ?? {},
    pastLives: raw.pastLives ?? {},
    filigreeSlots: migrateFiligreeSlots(raw.filigreeSlots as unknown, 6),
    artifactFiligreeSlots: migrateFiligreeSlots((raw as unknown as { artifactFiligreeSlots?: unknown }).artifactFiligreeSlots, 10),
    destinyChoices: raw.destinyChoices ?? {},
    destinySelections: (raw as unknown as { destinySelections?: CharacterBuild['destinySelections'] }).destinySelections ?? {},
    reaperChoices: raw.reaperChoices ?? {},
    reaperAP: raw.reaperAP ?? 0,
    activeEpicDestiny: raw.activeEpicDestiny ?? '',
    selectedDestinyTrees: raw.selectedDestinyTrees ?? ['', '', ''],
    unlockedDestinyTrees: raw.unlockedDestinyTrees ?? [],
    twistChoices: (() => {
      const t = (raw as unknown as { twistChoices?: unknown }).twistChoices
      const arr = Array.isArray(t) ? t.filter(v => typeof v === 'string') : []
      while (arr.length < 5) arr.push('')
      return arr.slice(0, 5)
    })(),
    abilityTomes: raw.abilityTomes ?? {},
    skillTomes: raw.skillTomes ?? {},
    activeBuffs: raw.activeBuffs ?? [],
    selfBuffs: raw.selfBuffs ?? [],
    reaperSelections: raw.reaperSelections ?? {},
    augmentLevelChoices: raw.augmentLevelChoices ?? {},
    augmentValueChoices: raw.augmentValueChoices ?? {},
    completedQuests: raw.completedQuests ?? {},
    notes: raw.notes ?? '',
    sentientGem: migrateSentientGem(raw.sentientGem as unknown),
    namedGearSets: raw.namedGearSets ?? {},
    namedGearAugments: (raw as unknown as { namedGearAugments?: Record<string, Record<string, string>> }).namedGearAugments ?? {},
    namedSlotUpgrades: (raw as unknown as { namedSlotUpgrades?: Record<string, Record<string, string>> }).namedSlotUpgrades ?? {},
    activeGearSetName: raw.activeGearSetName ?? '',
    sliderValues: (raw as unknown as { sliderValues?: Record<string, number> }).sliderValues ?? {},
    trainedSpells: (raw as unknown as { trainedSpells?: Record<string, Record<number, string[]>> }).trainedSpells ?? {},
    spellMetamagics: (raw as unknown as { spellMetamagics?: Record<string, Record<string, string[]>> }).spellMetamagics ?? {},
    clickieCharges: (raw as unknown as { clickieCharges?: Record<string, number> }).clickieCharges ?? {},
    guildLevel: (raw as unknown as { guildLevel?: number }).guildLevel ?? 0,
    applyGuildBuffs: (raw as unknown as { applyGuildBuffs?: boolean }).applyGuildBuffs ?? false,
    questDifficulty: (raw as unknown as { questDifficulty?: Record<string, QuestDifficulty> }).questDifficulty ?? {},
    slaCharges: (raw as unknown as { slaCharges?: Record<string, number> }).slaCharges ?? {},
    alternateFeats: (raw as unknown as { alternateFeats?: Record<string, string> }).alternateFeats ?? {},
    attackChains: (raw as unknown as { attackChains?: Record<string, string[]> }).attackChains ?? {},
    activeAttackChain: (raw as unknown as { activeAttackChain?: string }).activeAttackChain ?? '',
    favorFeats: raw.favorFeats ?? [],
  }
}

function resizeFiligreeSlots(
  slots: ReadonlyArray<{ name: string; rare: boolean }>,
  count: number,
): { name: string; rare: boolean }[] {
  const next = slots.slice(0, count).map(s => ({ ...s }))
  while (next.length < count) next.push({ name: '', rare: false })
  return next
}

export function reducer(state: CharacterBuild, action: Action): CharacterBuild {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name }
    case 'SET_RACE':
      return { ...state, race: action.race }
    case 'SET_ALIGNMENT':
      return { ...state, alignment: action.alignment }
    case 'SET_CLASS': {
      // Renaming a slot: replace every per-level entry that matched the old
      // class name so the aggregate and per-level views stay consistent.
      const oldName = state.classes[action.index]?.name ?? ''
      const classes = [...state.classes] as CharacterBuild['classes']
      classes[action.index] = { ...classes[action.index], name: action.name }
      let levelClasses = state.levelClasses ? [...state.levelClasses] : getLevelClasses(state)
      if (oldName && oldName !== action.name) {
        levelClasses = levelClasses.map(c => (c === oldName ? action.name : c))
      }
      // If the slot was just cleared, remove its levels from the per-level array
      if (oldName && !action.name) {
        levelClasses = levelClasses.map(c => (c === oldName ? '' : c))
      }
      return { ...state, classes, levelClasses }
    }
    case 'SET_CLASS_LEVELS': {
      const classes = [...state.classes] as CharacterBuild['classes']
      const oldLevels = classes[action.index]?.levels ?? 0
      const targetLevels = Math.max(0, Math.min(HEROIC_CAP, action.levels))
      classes[action.index] = { ...classes[action.index], levels: targetLevels }
      const className = classes[action.index].name
      // Reconcile levelClasses: append/strip entries of `className` to match the
      // new total. We append at the end (as the user added more of this class
      // without picking specific levels); we remove from the end on shrinkage.
      let levelClasses = state.levelClasses ? [...state.levelClasses] : getLevelClasses(state)
      if (className && targetLevels !== oldLevels) {
        const delta = targetLevels - oldLevels
        if (delta > 0) {
          // Pad to make room then fill empty slots from the front, falling back to append.
          while (levelClasses.length < HEROIC_CAP) levelClasses.push('')
          let added = 0
          for (let i = 0; i < levelClasses.length && added < delta; i++) {
            if (!levelClasses[i]) { levelClasses[i] = className; added++ }
          }
          while (added < delta) { levelClasses.push(className); added++ }
        } else if (delta < 0) {
          let toRemove = -delta
          for (let i = levelClasses.length - 1; i >= 0 && toRemove > 0; i--) {
            if (levelClasses[i] === className) { levelClasses[i] = ''; toRemove-- }
          }
        }
      }
      const totalLevel = levelClasses.filter(Boolean).length
      // Trim trailing empty slots beyond the heroic cap so the array stays tidy.
      while (levelClasses.length > HEROIC_CAP) levelClasses.pop()
      return { ...state, classes, levelClasses, totalLevel }
    }
    case 'SET_LEVEL_CLASS': {
      const lc = state.levelClasses ? [...state.levelClasses] : getLevelClasses(state)
      while (lc.length <= action.level) lc.push('')
      lc[action.level] = action.name
      const trimmed = lc.slice(0, HEROIC_CAP)
      const classes = aggregateLevelClasses(trimmed)
      const totalLevel = trimmed.filter(Boolean).length
      return { ...state, levelClasses: trimmed, classes, totalLevel }
    }
    case 'SET_LEVEL_CLASSES': {
      const lc = action.levels.slice(0, HEROIC_CAP)
      const classes = aggregateLevelClasses(lc)
      const totalLevel = lc.filter(Boolean).length
      return { ...state, levelClasses: lc, classes, totalLevel }
    }
    case 'SET_EPIC_LEVELS':
      return { ...state, epicLevels: Math.max(0, Math.min(EPIC_MAX_LEVELS, action.levels)) }
    case 'SET_LEGENDARY_LEVELS':
      // Was hard-clamped at 4 (level 34) — the game cap is 36 and the data
      // files define legendary class levels through 40 (V2 MAX_BUILDER_LEVEL).
      return { ...state, legendaryLevels: Math.max(0, Math.min(LEGENDARY_MAX_LEVELS, action.levels)) }
    case 'SET_ABILITY':
      return { ...state, baseAbilities: { ...state.baseAbilities, [action.ability]: action.score } }
    case 'SET_ABILITY_LEVELUP':
      return { ...state, abilityLevelUps: { ...state.abilityLevelUps, [action.level]: action.ability } }
    case 'SET_FEAT':
      return { ...state, featChoices: { ...state.featChoices, [action.slotKey]: action.featName } }
    case 'SET_SKILL_RANK':
      return { ...state, skillRanks: { ...state.skillRanks, [action.skill]: action.rank } }
    case 'SET_SKILL_RANK_AT_LEVEL': {
      // V2 parity: this action *only* mutates the per-level view. The legacy
      // total view (state.skillRanks) is left untouched so callers that
      // dispatch both SET_SKILL_RANK and SET_SKILL_RANK_AT_LEVEL together can
      // keep them consistent without one stomping the other.
      const byLevel = { ...(state.skillRanksByLevel ?? {}) }
      const lvl = action.level | 0
      const at = { ...(byLevel[lvl] ?? {}) }
      if (action.rank <= 0) delete at[action.skill]
      else at[action.skill] = action.rank
      if (Object.keys(at).length === 0) delete byLevel[lvl]
      else byLevel[lvl] = at
      return { ...state, skillRanksByLevel: byLevel }
    }
    case 'SET_GEAR':
      return {
        ...state,
        gear: { ...state.gear, [action.slot]: action.itemName },
        augmentChoices: Object.fromEntries(
          Object.entries(state.augmentChoices).filter(([k]) => !k.startsWith(action.slot + ':')),
        ),
        augmentLevelChoices: Object.fromEntries(
          Object.entries(state.augmentLevelChoices ?? {}).filter(([k]) => !k.startsWith(action.slot + ':')),
        ),
        slotUpgradeChoices: Object.fromEntries(
          Object.entries(state.slotUpgradeChoices).filter(([k]) => !k.startsWith(action.slot + ':')),
        ),
      }
    case 'CLEAR_GEAR': {
      const gear = { ...state.gear }
      delete gear[action.slot]
      const augmentChoices = Object.fromEntries(
        Object.entries(state.augmentChoices).filter(([k]) => !k.startsWith(action.slot + ':')),
      )
      const augmentLevelChoices = Object.fromEntries(
        Object.entries(state.augmentLevelChoices ?? {}).filter(([k]) => !k.startsWith(action.slot + ':')),
      )
      const slotUpgradeChoices = Object.fromEntries(
        Object.entries(state.slotUpgradeChoices).filter(([k]) => !k.startsWith(action.slot + ':')),
      )
      return { ...state, gear, augmentChoices, augmentLevelChoices, slotUpgradeChoices }
    }
    case 'SET_AUGMENT': {
      // A stored tier belongs to the augment that was in the slot; swapping
      // the augment drops it (the caller passes levelIndex for a replacement
      // that has selectable tiers of its own).
      const augmentLevelChoices = { ...(state.augmentLevelChoices ?? {}) }
      if (action.levelIndex != null) augmentLevelChoices[action.key] = action.levelIndex
      else delete augmentLevelChoices[action.key]
      return {
        ...state,
        augmentChoices: { ...state.augmentChoices, [action.key]: action.augmentName },
        augmentLevelChoices,
      }
    }
    case 'CLEAR_AUGMENT': {
      const augmentChoices = { ...state.augmentChoices }
      delete augmentChoices[action.key]
      const augmentLevelChoices = { ...(state.augmentLevelChoices ?? {}) }
      delete augmentLevelChoices[action.key]
      return { ...state, augmentChoices, augmentLevelChoices }
    }
    case 'SET_AUGMENT_LEVEL':
      // V2 ItemAugment::SelectedLevelIndex — indexes the augment's LevelValue
      // table (OnAugmentLevelSelect, ItemSelectDialog.cpp:799-808).
      return {
        ...state,
        augmentLevelChoices: { ...(state.augmentLevelChoices ?? {}), [action.key]: action.levelIndex },
      }
    case 'SET_SLOT_UPGRADE':
      // V2 parity: irreversible once chosen (ItemSelectDialog.cpp:847-881
      // OnUpgradeSelect) — the only way back is re-equipping the item
      // (SET_GEAR/CLEAR_GEAR above already clear this slot's choices).
      return { ...state, slotUpgradeChoices: { ...state.slotUpgradeChoices, [action.key]: action.upgradeType } }
    case 'SET_PAST_LIFE':
      return { ...state, pastLives: { ...state.pastLives, [action.source]: action.count } }
    case 'TRAIN_SPECIAL_FEAT':
      return { ...state, ...trainSpecialFeat(state, action.featName) }
    case 'REVOKE_SPECIAL_FEAT':
      return { ...state, ...revokeSpecialFeat(state, action.featName) }
    case 'TRAIN_FAVOR_FEAT':
      return { ...state, favorFeats: trainFavorFeat(state, action.featName) }
    case 'REVOKE_FAVOR_FEAT':
      return { ...state, favorFeats: revokeFavorFeat(state, action.featName) }
    case 'SET_FILIGREE': {
      const filigreeSlots = [...state.filigreeSlots] as CharacterBuild['filigreeSlots']
      filigreeSlots[action.slotIndex] = { ...(filigreeSlots[action.slotIndex] ?? { name: '', rare: false }), name: action.name }
      return { ...state, filigreeSlots }
    }
    case 'SET_FILIGREE_RARE': {
      const filigreeSlots = [...state.filigreeSlots] as CharacterBuild['filigreeSlots']
      filigreeSlots[action.slotIndex] = { ...(filigreeSlots[action.slotIndex] ?? { name: '', rare: false }), rare: action.rare }
      return { ...state, filigreeSlots }
    }
    case 'SET_ARTIFACT_FILIGREE': {
      const artifactFiligreeSlots = [...(state.artifactFiligreeSlots ?? [])] as CharacterBuild['artifactFiligreeSlots']
      artifactFiligreeSlots[action.slotIndex] = { ...(artifactFiligreeSlots[action.slotIndex] ?? { name: '', rare: false }), name: action.name }
      return { ...state, artifactFiligreeSlots }
    }
    case 'SET_ARTIFACT_FILIGREE_RARE': {
      const artifactFiligreeSlots = [...(state.artifactFiligreeSlots ?? [])] as CharacterBuild['artifactFiligreeSlots']
      artifactFiligreeSlots[action.slotIndex] = { ...(artifactFiligreeSlots[action.slotIndex] ?? { name: '', rare: false }), rare: action.rare }
      return { ...state, artifactFiligreeSlots }
    }
    // V2 EquipmentPane "Num Filigrees" combo (0..MAX_FILIGREE=20, stdafx.h):
    // the slot arrays resize in place — existing selections are kept, slots
    // past the new count are dropped.
    case 'SET_FILIGREE_COUNT': {
      const count = Math.max(1, Math.min(MAX_FILIGREE_SLOTS, action.count))
      const filigreeSlots = resizeFiligreeSlots(state.filigreeSlots ?? [], count)
      return { ...state, filigreeSlots }
    }
    case 'SET_ARTIFACT_FILIGREE_COUNT': {
      const count = Math.max(1, Math.min(MAX_FILIGREE_SLOTS, action.count))
      const artifactFiligreeSlots = resizeFiligreeSlots(state.artifactFiligreeSlots ?? [], count)
      return { ...state, artifactFiligreeSlots }
    }
    case 'SET_DESTINY_CHOICE': {
      const treeChoices = { ...(state.destinyChoices[action.treeName] ?? {}), [action.itemName]: action.rank }
      return { ...state, destinyChoices: { ...state.destinyChoices, [action.treeName]: treeChoices } }
    }
    case 'SET_DESTINY_SELECTIONS':
      return { ...state, destinySelections: { ...state.destinySelections, [action.treeName]: action.selections } }
    case 'RESET_DESTINY_TREE': {
      const destinyChoices = { ...state.destinyChoices }
      delete destinyChoices[action.treeName]
      const destinySelections = { ...state.destinySelections }
      delete destinySelections[action.treeName]
      return { ...state, destinyChoices, destinySelections }
    }
    case 'SET_ACTIVE_DESTINY':
      return { ...state, activeEpicDestiny: action.name }
    case 'SET_SELECTED_DESTINY': {
      const selectedDestinyTrees = [...state.selectedDestinyTrees] as CharacterBuild['selectedDestinyTrees']
      selectedDestinyTrees[action.slot] = action.name
      // If the replaced tree was the active destiny, clear the active selection
      const activeEpicDestiny = selectedDestinyTrees.includes(state.activeEpicDestiny) ? state.activeEpicDestiny : ''
      return { ...state, selectedDestinyTrees, activeEpicDestiny }
    }
    case 'TOGGLE_UNLOCKED_DESTINY': {
      const unlockedDestinyTrees = state.unlockedDestinyTrees.includes(action.name)
        ? state.unlockedDestinyTrees.filter(n => n !== action.name)
        : [...state.unlockedDestinyTrees, action.name]
      return { ...state, unlockedDestinyTrees }
    }
    case 'SET_TWIST_CHOICE': {
      const twistChoices = [...(state.twistChoices ?? ['', '', '', '', ''])]
      twistChoices[action.slot] = action.value
      return { ...state, twistChoices }
    }
    case 'SET_REAPER_CHOICE': {
      const treeChoices = { ...(state.reaperChoices[action.treeName] ?? {}), [action.itemName]: action.rank }
      return { ...state, reaperChoices: { ...state.reaperChoices, [action.treeName]: treeChoices } }
    }
    case 'SET_REAPER_AP':
      return { ...state, reaperAP: action.ap }
    case 'SET_ABILITY_TOME':
      return { ...state, abilityTomes: { ...state.abilityTomes, [action.ability]: action.bonus } }
    case 'SET_SKILL_TOME':
      return { ...state, skillTomes: { ...state.skillTomes, [action.skill]: action.bonus } }
    case 'TOGGLE_BUFF': {
      // Self/party buffs are their own list (V2 Life::SelfAndPartyBuffs) —
      // separate from active stances.
      const cur = state.selfBuffs ?? []
      const next = cur.includes(action.buffName)
        ? cur.filter(b => b !== action.buffName)
        : [...cur, action.buffName]
      return { ...state, selfBuffs: next }
    }
    case 'TOGGLE_STANCE': {
      const isOn = state.activeBuffs.includes(action.stanceName)
      let active: string[]
      if (isOn) {
        active = state.activeBuffs.filter(b => b !== action.stanceName)
      } else {
        // Turning a stance on auto-disables every incompatible stance
        // (V2 ActiveStances::AddActiveStance behavior).
        const banned = new Set([action.stanceName, ...(action.incompatible ?? [])])
        active = [
          ...state.activeBuffs.filter(b => !banned.has(b) || b === action.stanceName),
          action.stanceName,
        ].filter((b, i, a) => a.indexOf(b) === i) // dedupe
        active = active.filter(b => !(action.incompatible ?? []).includes(b))
        active.push(action.stanceName)
        // dedupe again
        active = active.filter((b, i, a) => a.indexOf(b) === i)
      }
      return { ...state, activeBuffs: active }
    }
    case 'TOGGLE_QUEST':
      return { ...state, completedQuests: { ...state.completedQuests, [action.questName]: !state.completedQuests[action.questName] } }
    case 'SET_NOTES':
      return { ...state, notes: action.notes }
    case 'SET_SENTIENT_GEM_NAME':
      return { ...state, sentientGem: { ...state.sentientGem, name: action.name } }
    case 'SET_SENTIENT_GEM_PERSONALITY':
      return { ...state, sentientGem: { ...state.sentientGem, personality: action.personality } }
    case 'SET_SENTIENT_GEM_AUGMENT': {
      const sentientGem = { ...state.sentientGem }
      if (action.slot === 'major') sentientGem.majorAugment = action.name
      else sentientGem.minorAugment = action.name
      return { ...state, sentientGem }
    }
    case 'SET_SLIDER': {
      const sliderValues = { ...state.sliderValues, [action.name]: action.value }
      return { ...state, sliderValues }
    }
    case 'TRAIN_SPELL': {
      const cls = state.trainedSpells[action.className] ?? {}
      const cur = cls[action.spellLevel] ?? []
      if (cur.includes(action.spellName)) return state
      const next = [...cur, action.spellName]
      return {
        ...state,
        trainedSpells: { ...state.trainedSpells, [action.className]: { ...cls, [action.spellLevel]: next } },
      }
    }
    case 'REVOKE_SPELL': {
      const cls = state.trainedSpells[action.className] ?? {}
      const cur = cls[action.spellLevel] ?? []
      const next = cur.filter(n => n !== action.spellName)
      const clsNext = { ...cls, [action.spellLevel]: next }
      // Also revoke metamagic toggles for this spell
      const mm = state.spellMetamagics[action.className] ?? {}
      const mmNext = { ...mm }
      delete mmNext[action.spellName]
      return {
        ...state,
        trainedSpells: { ...state.trainedSpells, [action.className]: clsNext },
        spellMetamagics: { ...state.spellMetamagics, [action.className]: mmNext },
      }
    }
    case 'TOGGLE_SPELL_METAMAGIC': {
      const cls = state.spellMetamagics[action.className] ?? {}
      const cur = cls[action.spellName] ?? []
      const next = cur.includes(action.metamagic)
        ? cur.filter(m => m !== action.metamagic)
        : [...cur, action.metamagic]
      return {
        ...state,
        spellMetamagics: { ...state.spellMetamagics, [action.className]: { ...cls, [action.spellName]: next } },
      }
    }
    case 'CLEAR_SPELL_METAMAGICS': {
      const next = { ...state.spellMetamagics }
      delete next[action.className]
      return { ...state, spellMetamagics: next }
    }
    case 'SET_CLICKIE_CHARGES':
      return { ...state, clickieCharges: { ...state.clickieCharges, [action.key]: action.remaining } }
    case 'RESET_ALL_CLICKIES':
      return { ...state, clickieCharges: {} }
    case 'SET_GUILD_LEVEL':
      return { ...state, guildLevel: Math.max(0, Math.min(200, action.level)) }
    case 'TOGGLE_APPLY_GUILD_BUFFS':
      return { ...state, applyGuildBuffs: !state.applyGuildBuffs }
    case 'SET_QUEST_DIFFICULTY': {
      const next = { ...state.questDifficulty }
      if (action.difficulty == null) delete next[action.questName]
      else next[action.questName] = action.difficulty
      // Keep boolean record in sync for back-compat consumers.
      const completedQuests = { ...state.completedQuests }
      if (action.difficulty == null) delete completedQuests[action.questName]
      else completedQuests[action.questName] = true
      return { ...state, questDifficulty: next, completedQuests }
    }
    case 'SET_SLA_CHARGES':
      return { ...state, slaCharges: { ...state.slaCharges, [action.name]: action.charges } }
    case 'RESET_ALL_SLA_CHARGES':
      return { ...state, slaCharges: {} }
    case 'SET_ALTERNATE_FEAT':
      return { ...state, alternateFeats: { ...state.alternateFeats, [action.slotKey]: action.featName } }
    case 'CLEAR_ALTERNATE_FEAT': {
      const next = { ...state.alternateFeats }
      delete next[action.slotKey]
      return { ...state, alternateFeats: next }
    }
    case 'SET_ATTACK_CHAIN':
      return { ...state, attackChains: { ...state.attackChains, [action.chainName]: action.attacks } }
    case 'DELETE_ATTACK_CHAIN': {
      const next = { ...state.attackChains }
      delete next[action.chainName]
      // V2 Build::DeleteAttackChain (Build.cpp:6592-6602): only the active
      // chain can be deleted; the active chain becomes the first remaining
      // chain, or '' when none are left.
      const remaining = Object.keys(next)
      const active = state.activeAttackChain === action.chainName
        ? (remaining[0] ?? '')
        : state.activeAttackChain
      return { ...state, attackChains: next, activeAttackChain: active }
    }
    // V2 Build::Set_ActiveAttackChain (Build.cpp:6566) — select live chain.
    case 'SET_ACTIVE_ATTACK_CHAIN':
      return { ...state, activeAttackChain: action.chainName }
    case 'SET_ENH_CHOICES':
      return { ...state, enhancementChoices: { ...state.enhancementChoices, [action.treeName]: action.choices } }
    case 'SET_ENH_SELECTIONS':
      return { ...state, enhancementSelections: { ...state.enhancementSelections, [action.treeName]: action.selections } }
    case 'SET_ENH_PINNED':
      return { ...state, enhancementPinned: action.pinned }
    case 'RESET_ENH_TREE': {
      const enhancementChoices = { ...state.enhancementChoices }
      const enhancementSelections = { ...state.enhancementSelections }
      delete enhancementChoices[action.treeName]
      delete enhancementSelections[action.treeName]
      return { ...state, enhancementChoices, enhancementSelections }
    }
    case 'SAVE_GEAR_SET': {
      const augments = { ...(state.namedGearAugments ?? {}), [action.setName]: { ...state.augmentChoices } }
      const slotUpgrades = { ...(state.namedSlotUpgrades ?? {}), [action.setName]: { ...state.slotUpgradeChoices } }
      return {
        ...state,
        namedGearSets: { ...state.namedGearSets, [action.setName]: { ...state.gear } },
        namedGearAugments: augments,
        namedSlotUpgrades: slotUpgrades,
        activeGearSetName: action.setName,
      }
    }
    case 'LOAD_GEAR_SET': {
      const gearSet = state.namedGearSets[action.setName]
      if (!gearSet) return state
      const setAugments = (state.namedGearAugments ?? {})[action.setName] ?? {}
      const setSlotUpgrades = (state.namedSlotUpgrades ?? {})[action.setName] ?? {}
      return {
        ...state,
        gear: { ...gearSet },
        augmentChoices: { ...setAugments },
        slotUpgradeChoices: { ...setSlotUpgrades },
        activeGearSetName: action.setName,
      }
    }
    case 'DELETE_GEAR_SET': {
      const sets = { ...state.namedGearSets }
      delete sets[action.setName]
      const augs = { ...(state.namedGearAugments ?? {}) }
      delete augs[action.setName]
      const slotUpgrades = { ...(state.namedSlotUpgrades ?? {}) }
      delete slotUpgrades[action.setName]
      return {
        ...state,
        namedGearSets: sets,
        namedGearAugments: augs,
        namedSlotUpgrades: slotUpgrades,
        activeGearSetName: state.activeGearSetName === action.setName ? '' : state.activeGearSetName,
      }
    }
    case 'LOAD_BUILD':
      return migrateLoad(action.build)
    case 'RESET':
      return emptyBuild()
    default:
      return state
  }
}

interface CharacterContextValue {
  build: CharacterBuild
  dispatch: React.Dispatch<Action>
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const [build, rawDispatch] = useReducer(reducer, undefined, emptyBuild)
  const { logAction } = useBuildLog()
  const dispatch = useCallback((action: Action) => {
    rawDispatch(action)
    logAction(action as never)
  }, [rawDispatch, logAction])
  return (
    <CharacterContext.Provider value={{ build, dispatch }}>
      {children}
    </CharacterContext.Provider>
  )
}

export function useCharacter() {
  const ctx = useContext(CharacterContext)
  if (!ctx) throw new Error('useCharacter must be used inside CharacterProvider')
  return ctx
}
