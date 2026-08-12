// V2-parity Forum / BBCode export sections.
//
// V2 source: DDOBuilder/ForumExportDlg.cpp:194-278 (driver) + 1454-1735 (per-section emitters).
// Each section is a pure function returning string lines so the panel can pluck
// any subset and re-order them.

import type {
  CharacterBuild, Ability, DDOClass, Race, Stance, OptionalBuff, Feat,
  EnhancementTree, EnhancementTreeItem, EnhancementSelection,
} from '../../types/ddo'
import type { BuildStats } from '../../hooks/useBuildStats'
import { buildAutomaticFeatGroups, automaticAcquisitionFeatGroup } from '../automaticFeats'
import { absorptionTotal } from '../bonus'
import { getLevelClasses, classLevelsAtLevel } from '../levelProgression'
import { buildSlots, getLevelTrainingEntries } from '../levelTraining'
import { computeBonusActionPoints } from '../actionPoints'
import { destinyPoolForBuild } from '../destiny'
import { SKILL_NAMES } from '../gamedata'
import { collectActiveDCs, dcVersusText, dcEvaluationText } from '../dcBreakdown'

const ABILITY_ABBREVS: Record<Ability, string> = {
  Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
  Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
}
const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

function sign(n: number): string { return n >= 0 ? `+${n}` : String(n) }
function abMod(score: number): number { return Math.floor((score - 10) / 2) }
function pctStr(n: number): string { return `${n}%` }

export interface SectionContext {
  build: CharacterBuild
  stats: BuildStats | null
  /** Optional static catalogues — required for sections that derive data from
   *  race/class/stance/feat tables (AutomaticFeats, SelfAndPartyBuffs,
   *  PastLives split, …). */
  allClasses?: DDOClass[]
  allRaces?: Race[]
  allStances?: Stance[]
  allSelfBuffs?: OptionalBuff[]
  /** Feats with Acquire === 'EpicPastLife'. */
  epicPastLifeFeats?: Feat[]
  /** Full feat catalogue — required for the AutomaticAcquisition-derived
   *  entries (Attack/Sneak/Sunder/Trip/Defensive Fighting/Heroic Durability)
   *  in the automaticFeats section. */
  allFeats?: Feat[]
  /**
   * Life-level special feats (V2 `Life::AllSpecialFeats()` — the active
   * Life's own `<SpecialFeats>` plus the Character-level ones), past lives
   * excluded. Not owned by `CharacterBuild`, so callers must resolve it from
   * the active `Life` themselves (see `useBuildStats`'s equivalent
   * resolution for stats).
   */
  specialFeats?: string[]
  /** Full enhancement/destiny/reaper tree catalogue — required to resolve
   *  tier labels and Points-spent totals in the enhancements/epicDestinies/
   *  reaperTrees sections (X17). */
  allTrees?: EnhancementTree[]
}

export interface SectionDef {
  id: string
  label: string
  emit: (ctx: SectionContext) => string[]
}

const characterHeader: SectionDef = {
  id: 'CharacterHeader',
  label: 'Character header',
  // V2 ForumExportDlg.cpp:312-392 (AddCharacterHeader) additionally prints a
  // "vitals block": HP/Displacement, then one row per ability paired with a
  // derived combat stat (Str+UnconsciousRange/Incorporeality, Dex+PRR/AC,
  // Con+MRR/+HealingAmp, Int+Dodge/-HealingAmp, Wis+Fort/RepairAmp,
  // Cha+SR/BAB), then trailing DR/Immunities lines. V3 previously emitted
  // only Name/Race/Alignment/Classes/Total Level.
  emit: ({ build, stats }) => {
    const lines: string[] = []
    lines.push(`[b]Character Name[/b]: ${build.name || '(unnamed)'}`)
    lines.push(`[b]Race[/b]: ${build.race || '(none)'} | [b]Alignment[/b]: ${build.alignment || '(none)'}`)
    const cls = build.classes.filter(c => c.name && c.levels > 0).map(c => `${c.name} ${c.levels}`)
    lines.push(`[b]Classes[/b]: ${cls.length > 0 ? cls.join(' / ') : '(none)'}`)
    lines.push(`[b]Total Level[/b]: ${build.totalLevel}`)
    if (build.epicLevels) lines.push(`[b]Epic Levels[/b]: ${build.epicLevels}`)
    if (build.legendaryLevels) lines.push(`[b]Legendary Levels[/b]: ${build.legendaryLevels}`)

    if (!stats) return lines

    function abilityRow(ab: Ability): string {
      const base = build.baseAbilities[ab] ?? 8
      const tome = build.abilityTomes[ab] ?? 0
      const total = stats!.total(`ability.${ab}`)
      return `${ABILITY_ABBREVS[ab]}: ${base}/+${tome}/${total}`
    }

    lines.push('')
    lines.push(`[b]HP[/b]: ${stats.total('hp')}  [b]Displacement[/b]: ${pctStr(stats.total('displacement'))}`)
    lines.push(`${abilityRow('Strength')}  [b]Unc. Range[/b]: ${stats.total('unconsciousRange')}  [b]Incorporeality[/b]: ${pctStr(stats.total('incorporeality'))}`)
    lines.push(`${abilityRow('Dexterity')}  [b]PRR[/b]: ${stats.total('prr')}  [b]AC[/b]: ${stats.total('ac')}`)

    const mrr = stats.total('mrr')
    const mrrCap = stats.total('mrrCap')
    const mrrDisplay = mrrCap > 0 && mrrCap < mrr ? `${mrr}/${mrrCap}` : String(mrr)
    lines.push(`${abilityRow('Constitution')}  [b]MRR[/b]: ${mrrDisplay}  [b]+Healing Amp[/b]: ${pctStr(stats.total('healAmp'))}`)

    const dodge = stats.total('dodge')
    const dodgeCap = stats.total('dodgeCap')
    const dodgeDisplay = dodgeCap > 0 ? `${dodge}/${dodgeCap}` : String(dodge)
    lines.push(`${abilityRow('Intelligence')}  [b]Dodge[/b]: ${dodgeDisplay}%  [b]-Healing Amp[/b]: ${pctStr(stats.total('negHealAmp'))}`)

    lines.push(`${abilityRow('Wisdom')}  [b]Fort[/b]: ${pctStr(stats.total('fortification'))}  [b]Repair Amp[/b]: ${pctStr(stats.total('repairAmp'))}`)
    lines.push(`${abilityRow('Charisma')}  [b]SR[/b]: ${stats.total('spellResistance')}  [b]BAB[/b]: ${stats.total('bab')}`)

    const drKeys = stats.keys().filter(k => k.startsWith('dr.') && stats!.total(k) > 0)
    const drText = drKeys.map(k => `${stats.total(k)}/${k.slice(3)}`).join(', ')
    lines.push(`[b]DR[/b]: ${drText || 'None'}`)

    const immunityKeys = stats.keys().filter(k => k.startsWith('immunity.') && stats!.total(k) > 0)
    const immunityText = immunityKeys.map(k => k.slice('immunity.'.length)).join(', ')
    lines.push(`[b]Immunities[/b]: ${immunityText || 'None'}`)

    return lines
  },
}

const pastLives: SectionDef = {
  id: 'PastLives',
  label: 'Past lives',
  // V2 ForumExportDlg.cpp:421-435 splits past lives by category before listing.
  emit: ({ build, allClasses, allRaces, epicPastLifeFeats }) => {
    const entries = Object.entries(build.pastLives).filter(([, c]) => c > 0)
    if (entries.length === 0) return []

    const heroicNames = new Set((allClasses ?? []).filter(c => !c.NotHeroic).map(c => c.Name))
    const racialNames = new Set((allRaces ?? []).filter(r => !r.NotHeroic && !r.IsIconic).map(r => r.Name))
    const iconicNames = new Set((allRaces ?? []).filter(r => !r.NotHeroic && r.IsIconic).map(r => r.Name))
    const epicNames   = new Set((epicPastLifeFeats ?? []).map(f => f.Name))

    const buckets: Record<string, Array<[string, number]>> = {
      'Heroic Past Lives': [], 'Iconic Past Lives': [],
      'Epic Past Lives': [],   'Racial Past Lives': [],
      'Other Past Lives': [],
    }
    for (const e of entries) {
      const [src] = e
      if (heroicNames.has(src)) buckets['Heroic Past Lives'].push(e)
      else if (iconicNames.has(src)) buckets['Iconic Past Lives'].push(e)
      else if (epicNames.has(src))   buckets['Epic Past Lives'].push(e)
      else if (racialNames.has(src)) buckets['Racial Past Lives'].push(e)
      else                           buckets['Other Past Lives'].push(e)
    }

    const out = ['[b]Past Lives[/b]:']
    for (const label of Object.keys(buckets)) {
      const bucket = buckets[label]
      if (bucket.length === 0) continue
      const list = bucket.sort(([a], [b]) => a.localeCompare(b))
        .map(([s, c]) => `${s} x${c}`)
        .join(', ')
      out.push(`  ${label}: ${list}`)
    }
    // Pre-catalogue fallback: if no catalogues supplied (everything went into
    // 'Other'), keep the legacy flat output instead of an unhelpful header.
    if (out.length === 2 && buckets['Other Past Lives'].length === entries.length) {
      return [
        '[b]Past Lives[/b]:',
        '  ' + entries.sort(([a], [b]) => a.localeCompare(b)).map(([s, c]) => `${s} x${c}`).join(', '),
      ]
    }
    return out
  },
}

const abilityScores: SectionDef = {
  id: 'AbilityScores',
  label: 'Ability scores',
  emit: ({ build, stats }) => {
    const lines = ['[b]Ability Scores[/b] (Base / Tome / Total):']
    for (const ab of ABILITIES) {
      const base = build.baseAbilities[ab] ?? 8
      const tome = build.abilityTomes[ab] ?? 0
      const total = stats ? stats.total(`ability.${ab}`) : base + tome
      lines.push(`${ABILITY_ABBREVS[ab]}: ${base} / +${tome} / ${total} (${sign(abMod(total))})`)
    }
    return lines
  },
}

const saves: SectionDef = {
  id: 'Saves',
  label: 'Saving throws',
  // V2 ForumExportDlg.cpp:509-528 (AddSaves) wraps every save + sub-save row in
  // a [TABLE], in Fort/Will/Reflex order, and AddTableEntryBreakdown:548-564
  // appends a "*" to any row whose save has a `HasNoFailOn1()` effect
  // (Effect_SaveNoFailOn1), followed by a footnote explaining the marker.
  emit: ({ stats }) => {
    if (!stats) return []
    function noFailOn1(saveKey: string): boolean {
      return (stats!.total(`save.${saveKey}.noFailOn1`) + stats!.total('save.All.noFailOn1')) > 0
    }
    function row(header: string, sub: string, saveKey: string, baseKey: string, subKey?: string): string | null {
      if (sub && subKey && !stats!.total(subKey)) return null
      const total = stats!.total(baseKey) + (subKey ? stats!.total(subKey) : 0)
      const marker = noFailOn1(saveKey) ? '*' : ''
      return `[TR][TD]${header}[/TD][TD]${sub}[/TD][TD]${total}${marker}[/TD][/TR]`
    }
    const rows = [
      row('Fortitude', '', 'Fort', 'save.Fort'),
      row('', 'vs Poison',      'Fort',   'save.Fort',   'save.sub.Poison'),
      row('', 'vs Disease',     'Fort',   'save.Fort',   'save.sub.Disease'),
      row('Will', '', 'Will', 'save.Will'),
      row('', 'vs Enchantment', 'Will',   'save.Will',   'save.sub.Enchantment'),
      row('', 'vs Illusion',    'Will',   'save.Will',   'save.sub.Illusion'),
      row('', 'vs Fear',        'Will',   'save.Will',   'save.sub.Fear'),
      row('', 'vs Curse',       'Will',   'save.Will',   'save.sub.Curse'),
      row('Reflex', '', 'Reflex', 'save.Reflex'),
      row('', 'vs Traps',       'Reflex', 'save.Reflex', 'save.sub.Traps'),
      row('', 'vs Spell',       'Reflex', 'save.Reflex', 'save.sub.Spell'),
      row('', 'vs Magic',       'Reflex', 'save.Reflex', 'save.sub.Magic'),
    ].filter((l): l is string => l !== null)
    return [
      '[b]Saving Throws[/b]:',
      '[TABLE]',
      ...rows,
      '[/TABLE]',
      'Marked with a* is no fail on a 1 if required DC met',
    ]
  },
}

const energyResistances: SectionDef = {
  id: 'EnergyResistances',
  label: 'Energy resistances',
  // V2 ForumExportDlg.cpp:1167-1214 (AddEnergyResistances) always emits a
  // [TABLE] with one row per type, Resistance and Absorbance columns shown
  // even when both are 0. Positive/Repair/Rust are deliberately commented
  // out in V2 and never appear.
  emit: ({ stats }) => {
    if (!stats) return []
    const types = ['Acid', 'Chaos', 'Cold', 'Electric', 'Evil', 'Fire', 'Force',
      'Good', 'Lawful', 'Light', 'Negative', 'Poison', 'Sonic']
    const rows = types.map(t => {
      const resist = Math.trunc(stats.total(`resist.${t}`))
      const abs = Math.trunc(absorptionTotal(stats.resolve(`absorb.${t}`).bonuses))
      return `[TR][TD]${t}:[/TD][TD]${resist}[/TD][TD]${abs}%[/TD][/TR]`
    })
    return [
      '[b]Energy Resistances[/b]:',
      '[TABLE]',
      '[TR][TD]Energy[/TD][TD]Resistance[/TD][TD]Absorbance[/TD][/TR]',
      ...rows,
      '[/TABLE]',
    ]
  },
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * V2 ForumExportDlg.cpp:622-660 (AddFeatSelections) + GetLevelEntries:1992+ —
 * one [TR] per character level: Level | Class(classLevel) | feat/ability/skill
 * lines for that level (multi-line cells continue on their own [TR] with
 * blank Level/Class cells). `includeSkills` mirrors V2's `bIncludeSkills`
 * flag (FES_FeatSelections passes true, FES_FeatSelectionsNoSkills false) —
 * V2 does NOT filter feat slots for the "no skills" variant, it only omits
 * the trailing class/cross-class skill-rank rows.
 */
function featSelectionsTable(ctx: SectionContext, includeSkills: boolean): string[] {
  const { build, allClasses, allRaces } = ctx
  const heroicLevel = Math.min(20, build.totalLevel)
  if (heroicLevel === 0) return []
  const classes = allClasses ?? []
  const races = allRaces ?? []
  const lc = getLevelClasses(build)
  const slots = buildSlots(build, classes, races)

  const lines: string[] = [
    includeSkills ? '[b]Class and Feat Selection[/b]:' : '[b]Class and Feat Selection (no skills)[/b]:',
    '[TABLE]',
    '[TR][TD]Level[/TD][TD]Class[/TD][TD]Feats[/TD][/TR]',
  ]
  for (let charLevel = 1; charLevel <= heroicLevel; charLevel++) {
    const className = lc[charLevel - 1] || 'Unknown'
    const classLevel = classLevelsAtLevel(build, className, charLevel, classes)
    const cellLines: string[] = []

    for (const slot of slots.filter(s => s.level === charLevel)) {
      const choice = build.featChoices[slot.key]
      cellLines.push(`${slot.featType}: ${choice || 'Empty Feat Slot'}`)
    }

    const abilityUp = (build.abilityLevelUps as Record<number, Ability | undefined>)[charLevel]
    if (abilityUp) cellLines.push(`${abilityUp}: +1 Level up`)

    if (includeSkills) {
      const skillRanks = build.skillRanksByLevel?.[charLevel] ?? {}
      const cls = classes.find(c => c.Name === className)
      const classSkills = new Set(toArray(cls?.ClassSkill))
      const classSkillEntries: string[] = []
      const crossClassEntries: string[] = []
      for (const [skill, ranks] of Object.entries(skillRanks)) {
        if (!ranks) continue
        const entry = `${skill}(${ranks})`
        if (classSkills.has(skill)) classSkillEntries.push(entry)
        else crossClassEntries.push(entry)
      }
      if (classSkillEntries.length > 0) cellLines.push(`Class Skills: ${classSkillEntries.join(', ')}`)
      if (crossClassEntries.length > 0) cellLines.push(`Cross Class Skills: ${crossClassEntries.join(', ')}`)
    }

    const classCell = `${className}(${classLevel})`
    if (cellLines.length === 0) {
      lines.push(`[TR][TD]${charLevel}[/TD][TD]${classCell}[/TD][TD][/TD][/TR]`)
    } else {
      lines.push(`[TR][TD]${charLevel}[/TD][TD]${classCell}[/TD][TD]${cellLines[0]}[/TD][/TR]`)
      for (let i = 1; i < cellLines.length; i++) {
        lines.push(`[TR][TD][/TD][TD][/TD][TD]${cellLines[i]}[/TD][/TR]`)
      }
    }
  }
  lines.push('[/TABLE]')
  return lines
}

const featSelections: SectionDef = {
  id: 'FeatSelections',
  label: 'Feat selections',
  emit: ctx => featSelectionsTable(ctx, true),
}

// V2 ForumExportDlg.cpp:889-1027 (AddSkills) — a `[code]` monospace grid: a
// "Skill Points" row (points available per character level), a level-number
// header, one row per skill (ranks trained at each level — cross-class shown
// in ½-rank multiples of the raw per-level spend, V2 `skillRanks[skill]/2` —
// followed by Ranks/Tome/Buffed totals at the build's final level), and a
// trailing "Available Points" row. V3 previously printed only whole-build
// totals ("skill: N ranks (+M)") with no per-level breakdown at all.
const skills: SectionDef = {
  id: 'Skills',
  label: 'Skills',
  emit: ({ build, stats, allClasses, allRaces }) => {
    if (!stats || !allClasses || !allRaces) return []
    const entries = getLevelTrainingEntries(build, allClasses, allRaces)
    const maxHeroicLevel = entries.length
    if (maxHeroicLevel === 0) return []

    const border = '-'.repeat(35) + '---'.repeat(maxHeroicLevel)
    const lines: string[] = ['[code]', border]

    let row = 'Skill Points    '
    for (const e of entries) row += String(e.skillPointsAvailable).padStart(3)
    lines.push(row)

    row = 'Skill Name       '
    for (let li = 0; li < maxHeroicLevel; li++) row += String(li + 1).padStart(2, '0') + ' '
    row += ' Ranks Tome Buffed'
    lines.push(row, border)

    const classSkillSets = new Map<string, Set<string>>()
    const classSkillsFor = (className: string): Set<string> => {
      let s = classSkillSets.get(className)
      if (!s) {
        s = new Set(toArray(allClasses.find(c => c.Name === className)?.ClassSkill))
        classSkillSets.set(className, s)
      }
      return s
    }

    for (const skill of SKILL_NAMES) {
      row = skill.padEnd(16)
      for (const e of entries) {
        const raw = e.skillRanks[skill] ?? 0
        if (raw > 0) {
          let text: string
          if (classSkillsFor(e.className).has(skill)) {
            text = String(raw)
          } else {
            // cross-class: shown in ½-rank multiples of the raw spend
            const fullRanks = Math.floor(raw / 2)
            text = (fullRanks > 0 ? String(fullRanks) : '') + (raw % 2 !== 0 ? '½' : '')
          }
          row += text.padStart(3)
        } else {
          row += '   '
        }
      }
      const bonuses = stats.resolve(`skill.${skill}`).bonuses
      const ranks = bonuses.find(b => b.type === 'Ranks')?.value ?? 0
      const tome = bonuses.find(b => b.type === 'Tome')?.value ?? 0
      const buffed = stats.total(`skill.${skill}`)
      row += ranks.toFixed(1).padStart(7) + String(Math.trunc(tome)).padStart(5) + buffed.toFixed(1).padStart(7)
      lines.push(row)
    }

    lines.push(border)
    row = 'Available Points'
    for (const e of entries) row += String(e.skillPointsAvailable - e.skillPointsSpent).padStart(3)
    lines.push(row, border, '[/code]')
    return lines
  },
}

const stances: SectionDef = {
  id: 'ActiveStances',
  label: 'Active stances',
  emit: ({ build, allStances }) => {
    if (build.activeBuffs.length === 0) return []
    // When stance catalogue is available, only emit names that are actually
    // stances (the rest go to SelfAndPartyBuffs). Without it, fall back to
    // emitting the full activeBuffs list to preserve prior behaviour.
    const list = allStances && allStances.length > 0
      ? build.activeBuffs.filter(n => allStances.some(s => s.Name === n))
      : build.activeBuffs
    if (list.length === 0) return []
    return ['[b]Active Stances[/b]:', '  ' + list.join(', ')]
  },
}

// V2 ForumExportDlg.cpp:1583-1610 (FES_SelfAndPartyBuffs) — lists toggled
// optional/self buffs distinct from stances.
const selfAndPartyBuffs: SectionDef = {
  id: 'SelfAndPartyBuffs',
  label: 'Self & party buffs',
  emit: ({ build, allStances, allSelfBuffs }) => {
    if (build.activeBuffs.length === 0) return []
    let list = build.activeBuffs
    if (allStances && allStances.length > 0) {
      const stanceNames = new Set(allStances.map(s => s.Name))
      list = list.filter(n => !stanceNames.has(n))
    }
    if (allSelfBuffs && allSelfBuffs.length > 0) {
      const buffNames = new Set(allSelfBuffs.map(b => b.Name))
      list = list.filter(n => buffNames.has(n))
    }
    if (list.length === 0) return []
    return ['[b]Self & Party Buffs[/b]:', '  ' + list.join(', ')]
  },
}

// V2 ForumExportDlg.cpp:1454-1530 (FES_AutomaticFeats) — auto-granted feats
// from race + class auto-feat tables + completionist gates.
const automaticFeats: SectionDef = {
  id: 'AutomaticFeats',
  label: 'Automatic feats',
  emit: ({ build, allClasses, allRaces, allFeats }) => {
    if (!allClasses || !allRaces) return []
    const groups = buildAutomaticFeatGroups(build, allClasses, allRaces)
    if (allFeats) {
      const race = allRaces.find(r => r.Name === build.race)
      const autoAcquisitionGroup = automaticAcquisitionFeatGroup(build, allFeats, allClasses, race)
      if (autoAcquisitionGroup) groups.push(autoAcquisitionGroup)
    }
    if (groups.length === 0) return []
    const out = ['[b]Automatic Feats[/b]:']
    for (const g of groups) out.push(`  ${g.source}: ${g.feats.join(', ')}`)
    return out
  },
}

// V2 ForumExportDlg.cpp:1216-1451 (AddEnhancements/AddEpicDestinyTree/
// AddReaperTrees + the shared per-tree AddEnhancementTree/AddEpicDestinyTree/
// AddReaperTree helpers): each top-level section opens with a
// "[COLOR=rgb(184, 49, 47)][SIZE=6]" header (AP/Destiny-Point totals) and
// "[HR][/HR]", then one "[COLOR=rgb(65, 168, 95)][SIZE=5]TreeName - Points
// spent: N[/SIZE][/COLOR]" block per trained tree, each enhancement prefixed
// with its tier ("CoreN "/"Tier1".."Tier6") and (for multi-rank items)
// suffixed " - N Ranks", terminated by its own "[HR][/HR]". V3 previously
// emitted plain "[b]...[/b]:" headers with no AP totals, no tier labels, and
// no Points-spent line.

function itemKey(item: EnhancementTreeItem): string {
  return item.InternalName ?? item.Name
}

function findTreeItem(tree: EnhancementTree, key: string): EnhancementTreeItem | undefined {
  return (tree.EnhancementTreeItem ?? []).find(it => itemKey(it) === key || it.Name === key)
}

function selectorOptions(item: EnhancementTreeItem): EnhancementSelection[] {
  if (!item.Selector || item.Selector.length === 0) return []
  const raw = item.Selector[0].EnhancementSelection
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

// V2 EnhancementTreeItem::YPosition(): 0 = Core row (labelled by XPosition+1),
// 1-6 = Tier1-6.
function tierPrefix(item: EnhancementTreeItem): string {
  const y = item.YPosition ?? 0
  if (y === 0) return `Core${(item.XPosition ?? 0) + 1} `
  if (y >= 1 && y <= 6) return `Tier${y} `
  return ''
}

// V2 DisplayName(selection) = "ItemName" or "ItemName: SelectionName"; the
// export then strips everything up to and including the first ": " so a
// selector item shows only its chosen selection's name.
function enhancementLabel(item: EnhancementTreeItem, selection: string | undefined): string {
  let name = item.Name
  if (item.Selector && item.Selector.length > 0) {
    const opt = selectorOptions(item).find(o => o.Name === selection)
    name = `${item.Name}: ${opt?.Name ?? selection ?? ''}`
  }
  const colon = name.indexOf(':')
  return colon === -1 ? name : name.slice(colon + 2)
}

function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw || '1'
  if (typeof raw === 'object' && !Array.isArray(raw) && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    if (t != null) return String(t) || '1'
  }
  return '1'
}

// Mirrors EnhancementTreePanel.tsx's costUpToRank/computeTreeSpent (V2
// EnhancementTreeItem::Cost / SpendInTree::Spent parity) — duplicated here
// rather than imported since that module is component-scoped.
function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const maxRanks = typeof item.Ranks === 'number' ? item.Ranks : 1
  const str = normalizeCostPerRank(item.CostPerRank)
  const parts = str.trim().split(/\s+/).map(Number).filter(isFinite)
  const costs = parts.length === 0
    ? Array(maxRanks).fill(1)
    : parts.length === 1
    ? Array(maxRanks).fill(parts[0])
    : Array.from({ length: maxRanks }, (_, i) => parts[i] ?? parts[parts.length - 1])
  return costs.slice(0, rank).reduce((a: number, b: number) => a + b, 0)
}

function treeSpent(tree: EnhancementTree, choices: Record<string, number>): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const rank = choices[itemKey(item)] ?? choices[item.Name] ?? 0
    return sum + costUpToRank(item, rank)
  }, 0)
}

// V2's Reaper-tree emitter has one genuine quirk vs the Enhancement/Epic
// Destiny emitters: the Ranks suffix reads the ITEM's max Ranks() instead of
// the trained rank ((*it).Ranks()) — `rankUsesMax` reproduces it verbatim.
function emitTreeBlock(
  lines: string[],
  tree: EnhancementTree,
  choices: Record<string, number>,
  selections: Record<string, string> | undefined,
  rankUsesMax = false,
): void {
  lines.push(`[COLOR=rgb(65, 168, 95)][SIZE=5]${tree.Name} - Points spent: ${treeSpent(tree, choices)}[/SIZE][/COLOR]`)
  for (const [key, rank] of Object.entries(choices)) {
    if (rank <= 0) continue
    const item = findTreeItem(tree, key)
    if (!item) { lines.push('Error - Unknown enhancement'); continue }
    const selection = selections?.[key] ?? selections?.[item.Name]
    let label = tierPrefix(item) + enhancementLabel(item, selection)
    const maxRanks = typeof item.Ranks === 'number' ? item.Ranks : 1
    if (maxRanks > 1) label += ` - ${rankUsesMax ? maxRanks : rank} Ranks`
    lines.push(label)
  }
  lines.push('[HR][/HR]')
}

const enhancements: SectionDef = {
  id: 'Enhancements',
  label: 'Enhancements',
  emit: ({ build, allTrees, allFeats, specialFeats }) => {
    const trees = Object.entries(build.enhancementChoices).filter(([, items]) =>
      Object.values(items).some(r => r > 0))
    if (trees.length === 0) return []
    let header = 'Enhancements: 80 APs'
    if (allFeats) {
      const bonus = computeBonusActionPoints(build, allFeats, specialFeats ?? [])
      if (bonus.racial > 0) header += `, Racial ${bonus.racial}`
      if (bonus.universal > 0) header += `, Universal ${bonus.universal}`
    }
    const lines = [`[COLOR=rgb(184, 49, 47)][SIZE=6]${header}[/SIZE][/COLOR]`, '[HR][/HR]']
    for (const [treeName, choices] of trees) {
      const tree = allTrees?.find(t => t.Name === treeName)
      if (!tree) continue
      emitTreeBlock(lines, tree, choices, build.enhancementSelections[treeName])
    }
    return lines
  },
}

const epicDestinies: SectionDef = {
  id: 'EpicDestinyTree',
  label: 'Epic destinies',
  emit: ({ build, stats, allTrees }) => {
    const trees = Object.entries(build.destinyChoices).filter(([, items]) =>
      Object.values(items).some(r => r > 0))
    if (trees.length === 0) return []
    const fatePoints = stats ? Math.max(0, Math.round(stats.total('fatePoint'))) : 0
    const destinyApBonus = stats ? Math.max(0, Math.round(stats.total('destinyAP'))) : 0
    const destinyPoints = destinyPoolForBuild(build, fatePoints, destinyApBonus)
    const lines = [
      `[COLOR=rgb(184, 49, 47)][SIZE=6]Epic Destinies: ${destinyPoints} Destiny Points[/SIZE][/COLOR]`,
      '[HR][/HR]',
    ]
    if (build.activeEpicDestiny) lines.push(`[b]Active Destiny[/b]: ${build.activeEpicDestiny}`)
    for (const [treeName, choices] of trees) {
      const tree = allTrees?.find(t => t.Name === treeName)
      if (!tree) continue
      emitTreeBlock(lines, tree, choices, build.destinySelections[treeName])
    }
    if (build.twistChoices.some(t => t)) {
      lines.push(`[b]Twists of Fate[/b]: ${build.twistChoices.filter(Boolean).join(', ')}`)
    }
    return lines
  },
}

const reaperTrees: SectionDef = {
  id: 'ReaperTrees',
  label: 'Reaper trees',
  emit: ({ build, allTrees }) => {
    const trees = Object.entries(build.reaperChoices).filter(([, items]) =>
      Object.values(items).some(r => r > 0))
    if (trees.length === 0) return []
    const lines = ['[COLOR=rgb(184, 49, 47)][SIZE=6]Reaper trees:[/SIZE][/COLOR]']
    for (const [treeName, choices] of trees) {
      const tree = allTrees?.find(t => t.Name === treeName)
      if (!tree) continue
      emitTreeBlock(lines, tree, choices, build.reaperSelections?.[treeName], /* rankUsesMax */ true)
      lines.push('')
    }
    return lines
  },
}

// V2 ForumExportDlg.cpp:1453-1520 (AddSpellPowers/AddSpellPowerToTable): fixed
// set of 16 rows, always emitted regardless of value, 15-char-padded labels.
// Deliberately has NO Lawful row (BreakdownsPane tracks a Lawful spell power
// breakdown, but the export table never reads it) and "Force/Untyped" reads
// the Force breakdown, not a Force+Untyped merge — a separate "Untyped" row
// reads the real Untyped breakdown. Both quirks reproduced verbatim.
const V2_SPELL_POWER_ROWS: [label: string, key: string][] = [
  ['Acid           ', 'Acid'],
  ['Light/Alignment', 'LightAlignment'],
  ['Chaos          ', 'Chaos'],
  ['Cold           ', 'Cold'],
  ['Electric       ', 'Electric'],
  ['Evil           ', 'Evil'],
  ['Fire           ', 'Fire'],
  ['Force/Untyped  ', 'Force'],
  ['Negative       ', 'Negative'],
  ['Physical       ', 'Physical'],
  ['Poison         ', 'Poison'],
  ['Positive       ', 'Positive'],
  ['Repair         ', 'Repair'],
  ['Rust           ', 'Rust'],
  ['Sonic          ', 'Sonic'],
  ['Untyped        ', 'Untyped'],
]

const spellPowers: SectionDef = {
  id: 'SpellPowers',
  label: 'Spell powers',
  emit: ({ stats }) => {
    if (!stats) return []
    // V2 has no "Universal" row — BreakdownItemSpellPower::CreateOtherEffects
    // folds the universal spell power/lore/crit-multiplier breakdowns into
    // every concrete type's total instead.
    const universalPower = stats.total('sp.Universal')
    const universalCrit = stats.total('spCrit.Universal')
    const universalMult = stats.total('spCritDmg.Universal') + stats.total('spCritDmg.All')
    const lines: string[] = [
      '[SIZE=3][TABLE]',
      '[TR][TD][COLOR=rgb(65, 168, 95)]Spell Power[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Base[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Critical Chance[/COLOR][/TD]' +
      '[TD][COLOR=rgb(65, 168, 95)]Critical Multiplier[/COLOR][/TD][/COLOR][/TR]',
    ]
    for (const [label, key] of V2_SPELL_POWER_ROWS) {
      const power = stats.total(`sp.${key}`) + universalPower
      const crit = Math.trunc(stats.total(`spCrit.${key}`) + universalCrit)
      const mult = Math.trunc(stats.total(`spCritDmg.${key}`) + universalMult)
      lines.push(`[TR][TD]${label}[/TD][TD]${power}[/TD][TD]${crit}%[/TD][TD]${mult}[/TD][/TR]`)
    }
    lines.push('[/TABLE][/SIZE]')
    return lines
  },
}

const spells: SectionDef = {
  id: 'Spells',
  label: 'Trained spells',
  emit: ({ build }) => {
    const classes = Object.keys(build.trainedSpells).filter(c =>
      Object.values(build.trainedSpells[c] ?? {}).some(arr => arr.length > 0))
    if (classes.length === 0) return []
    const lines = ['[b]Spells[/b]:']
    for (const c of classes) {
      lines.push(`  ${c}:`)
      const byLevel = build.trainedSpells[c]
      for (const lvl of Object.keys(byLevel).map(Number).sort((a, b) => a - b)) {
        const list = byLevel[lvl] ?? []
        if (list.length === 0) continue
        lines.push(`    Level ${lvl}: ${list.join(', ')}`)
      }
    }
    return lines
  },
}

// V2 AddWeaponDamage (ForumExportDlg.cpp:1680-1732) always emits this fixed
// scalar block (unconditional — not gated on gear being equipped), followed
// by a per-weapon effects breakdown (BreakdownItemWeaponEffects::
// AddForumExportData) that V3 does not yet model and omits here.
const weaponDamage: SectionDef = {
  id: 'WeaponDamage',
  label: 'Weapon damage',
  emit: ({ stats }) => {
    if (!stats) return []
    return [
      'Weapon Damage',
      '[HR][/HR]',
      `Melee Power:  ${stats.total('melee.power')}`,
      `Doublestrike: ${Math.trunc(stats.total('melee.doublestrike'))}%`,
      `Strikethrough: ${Math.trunc(stats.total('melee.strikethrough'))}%`,
      `Mainhand damage ability multiplier: ${Math.trunc(stats.total('melee.damageAbilityMult'))}`,
      `Offhand damage ability multiplier: ${Math.trunc(stats.total('offhand.damageAbilityMult'))}`,
      `Off-Hand attack Chance: ${Math.trunc(stats.total('offhand.attack'))}%`,
      `Fortification Bypass: ${Math.trunc(stats.total('fortBypass'))}%`,
      `Dodge Bypass: ${Math.trunc(stats.total('dodgeBypass'))}%`,
      `Helpless Damage bonus: ${Math.trunc(stats.total('helpless'))}%`,
      `Ranged Power: ${stats.total('ranged.power')}`,
      `Doubleshot Chance: ${Math.trunc(stats.total('ranged.doubleshot'))}%`,
      '',
      `Sneak Attack Attack bonus: ${Math.trunc(stats.total('melee.sneakAttack'))}`,
      `Sneak Attack Damage: ${Math.trunc(stats.total('melee.sneakDice'))}d6+${Math.trunc(stats.total('melee.sneakDamage'))}`,
    ]
  },
}

// V2 ForumExportDlg.cpp:1734-1756 (AddTacticalDCs): a [SIZE=3][TABLE] with
// 3 columns (Tactical DC / Value / Evaluation), one row per DC currently
// granted by a trained feat or enhancement (CDCPane's active button list —
// Trip, Sunder, Stunning Blow, Intimidate/Diplomacy/Bluff from the
// universal "Attack" feat, tree-granted tactical DCs, …), each row's Value
// and Evaluation built from DC::DCBreakdown's exact component text. V3
// previously emitted flat "  Label: +N" lines for a fixed 13-entry
// TacticalType enumeration — unrelated to V2's actual per-DC-object list.
const tacticalDCs: SectionDef = {
  id: 'TacticalDCs',
  label: 'Tactical DCs',
  emit: ({ build, stats, allFeats, allTrees, allClasses, allRaces }) => {
    if (!stats || !allFeats || !allTrees || !allClasses || !allRaces) return []
    const active = collectActiveDCs(build, allFeats, allTrees, allClasses, allRaces, stats.grantedFeatsList)
    if (active.length === 0) return []
    const ctx = { build, stats, allClasses }
    const lines = ['[SIZE=3][TABLE]', '[TR][TD]Tactical DC[/TD][TD]Value[/TD][TD]Evaluation[/TD][/TR]']
    for (const { dc, stacks } of active) {
      const versus = dcVersusText(dc, stacks, ctx)
      const evaluation = dcEvaluationText(dc, stacks, ctx)
      lines.push(`[TR][TD]${dc.Name}[/TD][TD]${versus}[/TD][TD]${evaluation}[/TD][/TR]`)
    }
    lines.push('[/TABLE][/SIZE]')
    return lines
  },
}

const gear: SectionDef = {
  id: 'Gear',
  label: 'Gear',
  emit: ({ build }) => {
    const entries = Object.entries(build.gear).filter(([, v]) => v)
    if (entries.length === 0) return []
    const lines = ['[b]Gear[/b]:']
    entries.sort(([a], [b]) => a.localeCompare(b)).forEach(([slot, item]) => {
      lines.push(`  ${slot}: ${item}`)
    })
    return lines
  },
}

const notes: SectionDef = {
  id: 'Notes',
  label: 'Notes',
  emit: ({ build }) => {
    if (!build.notes || !build.notes.trim()) return []
    return ['[b]Notes[/b]:', build.notes.trim()]
  },
}

const slas: SectionDef = {
  id: 'SLAs',
  label: 'Spell-Like Abilities',
  // V2 ForumExportDlg.cpp:1648-1679 (AddSLAs): lists names from CSLAControl,
  // which is auto-populated from SpellLikeAbility effects.  Use stats.slaList
  // when available; fall back to manually-set slaCharges for older callers.
  emit: ({ build, stats }) => {
    const names = stats?.slaList?.length
      ? stats.slaList
      : Object.keys(build.slaCharges).filter(k => (build.slaCharges[k] ?? 0) > 0)
    if (names.length === 0) return []
    const out = ['Spell Like / Special Abilities', '[HR][/HR]']
    for (const name of names) out.push(`  ${name}`)
    out.push('[HR][/HR]')
    return out
  },
}

const grantedFeats: SectionDef = {
  id: 'GrantedFeats',
  label: 'Granted feats',
  // V2 ForumExportDlg.cpp:662-735 AddGrantedFeats() emits feats from the
  // GrantFeat-effect list. BuildStats.grantedFeatsList holds that list.
  emit: ({ stats }) => {
    const grants = stats?.grantedFeatsList ?? []
    if (grants.length === 0) return []
    return ['[b]Granted Feats[/b]:', ...grants.map(name => `  ${name}`)]
  },
}

// V2 ForumExportDlg.cpp:735-844 (AddConsolidatedFeats) — a per-level [TABLE]
// (Level | Class | Feats) with the same row shape as AddFeatSelections, but
// each feat-type slot is color-coded ("[COLOR=rgb(65, 168, 95)]FeatType: [/COLOR]
// [COLOR=rgb(184, 49, 47)]FeatName[/COLOR]", plus a yellow "Alternate: "
// annotation when the slot has one), each character-level ability bump gets
// its own yellow row, and level 1 carries a red warning when the build's
// starting class differs from the race's Iconic class (distinguishing
// "Lesser Reincarnation" for an archetype of that class from "+1 Heart of
// Wood" for anything else). V3's old `consolidatedFeats` just tallied how
// many times each distinct feat choice appeared build-wide — different
// content, not a formatting gap (X12). Two V2 pieces are intentionally not
// reproduced: `TrainedFeat::HasFeatSwapWarning` (a hypothetical-swap
// prerequisite re-check with no V3 model) and the per-level placement of
// automatic feats (V2's `LevelTraining::AutomaticFeats()` interleaves them
// here too, but V3 has no reliable per-level placement for the
// AutomaticAcquisition-derived ones like Attack/Sneak/Heroic Durability —
// they stay in the dedicated `automaticFeats` section instead).
const CONSOLIDATED_TYPE_COLOR = 'rgb(65, 168, 95)'
const CONSOLIDATED_FEAT_COLOR = 'rgb(184, 49, 47)'
const CONSOLIDATED_ALT_COLOR = 'rgb(250, 197, 28)'

const consolidatedFeats: SectionDef = {
  id: 'ConsolidatedFeats',
  label: 'Consolidated feats',
  emit: ({ build, allClasses, allRaces }) => {
    const heroicLevel = Math.min(20, build.totalLevel)
    if (heroicLevel === 0) return []
    const classes = allClasses ?? []
    const races = allRaces ?? []
    const lc = getLevelClasses(build)
    const slots = buildSlots(build, classes, races)

    const lines: string[] = [
      'Class and Feat Selection (Consolidated)',
      '[TABLE]',
      '[TR][TD]Level[/TD][TD]Class[/TD][TD]Feats[/TD][/TR]',
    ]

    for (let charLevel = 1; charLevel <= heroicLevel; charLevel++) {
      const className = lc[charLevel - 1] || 'Unknown'
      const classLevel = classLevelsAtLevel(build, className, charLevel, classes)
      const cells: string[] = []

      if (charLevel === 1) {
        const race = races.find(r => r.Name === build.race)
        if (race?.IconicClass && race.IconicClass !== className) {
          const cls = classes.find(c => c.Name === className)
          const msg = cls?.BaseClass && cls.BaseClass === race.IconicClass
            ? 'Requires a Lesser Reincarnation to switch from Iconic class to Archetype class'
            : 'Requires a +1 Heart of Wood to switch out of Iconic Class'
          cells.push(`[TD][COLOR=${CONSOLIDATED_FEAT_COLOR}]${msg}[/COLOR][/TD]`)
        }
      }

      for (const slot of slots.filter(s => s.level === charLevel)) {
        const choice = build.featChoices[slot.key]
        let cell = `[TD][COLOR=${CONSOLIDATED_TYPE_COLOR}]${slot.featType}: [/COLOR][COLOR=${CONSOLIDATED_FEAT_COLOR}]`
        if (choice) {
          cell += choice
          const alt = build.alternateFeats[slot.key]
          if (alt) {
            cell += `[/COLOR][COLOR=${CONSOLIDATED_ALT_COLOR}] Alternate: [/COLOR][COLOR=${CONSOLIDATED_FEAT_COLOR}]${alt}`
          }
        } else {
          cell += 'Empty Feat Slot'
        }
        cell += '[/COLOR][/TD]'
        cells.push(cell)
      }

      // V2 quirk (ForumExportDlg.cpp:809-811): the ability's plain name is
      // written before the row's [TD] tag opens, leaking outside the cell.
      const abilityUp = (build.abilityLevelUps as Record<number, Ability | undefined>)[charLevel]
      if (abilityUp) {
        cells.push(`${abilityUp}[TD][COLOR=${CONSOLIDATED_ALT_COLOR}]${abilityUp}: +1 Level up[/COLOR][/TD]`)
      }

      const classCell = `${className}(${classLevel})`
      if (cells.length === 0) {
        lines.push(`[TR][TD]${charLevel}[/TD][TD]${classCell}[/TD][TD][/TD][/TR]`)
      } else {
        lines.push(`[TR][TD]${charLevel}[/TD][TD]${classCell}[/TD]${cells[0]}[/TR]`)
        for (let i = 1; i < cells.length; i++) {
          lines.push(`[TR][TD][/TD][TD][/TD]${cells[i]}[/TR]`)
        }
      }
    }
    lines.push('[/TABLE]')
    return lines
  },
}

// V2 canonical slot order mirrors InventorySlotTypes.h enum
// (Inventory_Arrows..Inventory_Weapon2, per ForumExportDlg.cpp:1779).
const V2_SLOT_ORDER = [
  'Arrow', 'Armor', 'Belt', 'Boots', 'Bracers', 'Cloak',
  'Gloves', 'Goggles', 'Helmet', 'Necklace', 'Quiver',
  'Ring', 'Ring2', 'Trinket', 'Main Hand', 'Off Hand',
]

function slotSortKey(slot: string): number {
  const idx = V2_SLOT_ORDER.indexOf(slot)
  return idx === -1 ? V2_SLOT_ORDER.length : idx
}

const simpleGear: SectionDef = {
  id: 'SimpleGear',
  label: 'Gear (simple)',
  emit: ({ build }) => {
    const entries = Object.entries(build.gear).filter(([, v]) => v)
    if (entries.length === 0) return []
    const lines: string[] = ['[b]Gear (simple)[/b]:']
    const sorted = [...entries].sort(([a], [b]) => slotSortKey(a) - slotSortKey(b))
    for (const [slot, item] of sorted) {
      lines.push(`  ${slot}: ${item}`)
      // V2 ForumExportDlg.cpp:1816-1857: emit augment choices per item
      const augPrefix = `${slot}:`
      const augEntries = Object.entries(build.augmentChoices)
        .filter(([k]) => k.startsWith(augPrefix))
      for (const [key, augName] of augEntries) {
        const parts = key.split(':')
        const augType = parts[1] ?? ''
        lines.push(`    ${augType}: ${augName}`)
      }
    }
    return lines
  },
}

/**
 * V2 ForumExportDlg.cpp:435-471 FES_SpecialFeats (AddSpecialFeats/AddFeats) —
 * combines the Life+Character `<SpecialFeats>` list with the Build's own
 * `<FavorFeats>` list, counts duplicate entries, and emits two headed blocks
 * filtered by each entry's `Type` ("Special" / "Favor"). V3 keeps the two
 * pools separate at the data-model level (`ctx.specialFeats`, resolved by the
 * caller from the active `Life`, vs `build.favorFeats`) rather than a
 * per-entry Type string, so each pool is emitted under its own heading
 * directly instead of re-deriving Type from one merged list.
 */
const specialFeats: SectionDef = {
  id: 'SpecialFeats',
  label: 'Special feats',
  emit: ({ build, specialFeats: lifeSpecialFeats }) => {
    const out: string[] = []
    const block = (heading: string, names: string[]) => {
      if (names.length === 0) return
      const counts = new Map<string, number>()
      for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
      out.push(`[b]${heading}[/b]:`)
      Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([n, c]) => {
        out.push(`  ${n}${c > 1 ? `(${c})` : ''}`)
      })
    }
    block('Special Feats', lifeSpecialFeats ?? [])
    block('Favor Feats', build.favorFeats ?? [])
    return out
  },
}

/**
 * V2 ForumExportDlg.cpp FES_FeatSelectionsNoSkills — same table as
 * FES_FeatSelections (`featSelectionsTable`) but built with `bIncludeSkills`
 * false, so the trailing class/cross-class skill-rank rows are omitted.
 */
const featSelectionsNoSkills: SectionDef = {
  id: 'FeatSelectionsNoSkills',
  label: 'Feat selections (no skills)',
  emit: ctx => featSelectionsTable(ctx, false),
}

/**
 * V2 ForumExportDlg.cpp FES_Bonuses — dump every accumulated stat with a
 * non-zero total. Useful as a "what's contributing to my numbers" debug
 * export.
 */
const bonusesDump: SectionDef = {
  id: 'Bonuses',
  label: 'Bonuses',
  emit: ({ stats }) => {
    if (!stats) return []
    const keys = stats.keys().sort()
    const rows: string[] = []
    for (const k of keys) {
      const total = stats.total(k)
      if (total === 0) continue
      rows.push(`  ${k}: ${total >= 0 ? '+' : ''}${total}`)
    }
    return rows.length > 0 ? ['[b]Accumulated Bonuses[/b]:', ...rows] : []
  },
}

const alternateGearLayouts: SectionDef = {
  id: 'AlternateGearLayouts',
  label: 'Alternate gear layouts',
  emit: ({ build }) => {
    const sets = Object.entries(build.namedGearSets ?? {})
    if (sets.length === 0) return []
    const out = ['[b]Alternate Gear Layouts[/b]:']
    const setAugments = build.namedGearAugments ?? {}
    for (const [name, slots] of sets) {
      out.push(`  ${name}:`)
      const sorted = Object.entries(slots).sort(([a], [b]) => slotSortKey(a) - slotSortKey(b))
      for (const [slot, item] of sorted) {
        if (!item) continue
        out.push(`    ${slot}: ${item}`)
        // V2 ForumExportDlg.cpp:1816-1857: emit augment choices per item
        const augPrefix = `${slot}:`
        const augEntries = Object.entries(setAugments[name] ?? {})
          .filter(([k]) => k.startsWith(augPrefix))
        for (const [key, augName] of augEntries) {
          const parts = key.split(':')
          const augType = parts[1] ?? ''
          out.push(`      ${augType}: ${augName}`)
        }
      }
    }
    return out
  },
}

/**
 * V2 SectionOrder default. Mirrors ForumExportDlg.cpp:194-278.
 */
export const DEFAULT_SECTIONS: SectionDef[] = [
  characterHeader,
  pastLives,
  specialFeats,            // V2 FES_SpecialFeats parity
  abilityScores,
  saves,
  energyResistances,
  featSelections,
  featSelectionsNoSkills,  // V2 FES_FeatSelectionsNoSkills parity
  grantedFeats,
  automaticFeats,
  consolidatedFeats,
  skills,
  bonusesDump,             // V2 FES_Bonuses parity
  stances,
  selfAndPartyBuffs,
  enhancements,
  epicDestinies,
  reaperTrees,
  spellPowers,
  spells,
  slas,
  weaponDamage,
  tacticalDCs,
  gear,
  simpleGear,
  alternateGearLayouts,
  notes,
]

export function emitForumExport(
  ctx: SectionContext,
  sections: SectionDef[] = DEFAULT_SECTIONS,
): string {
  const out: string[] = ['[font=courier]']
  for (const s of sections) {
    const lines = s.emit(ctx)
    if (lines.length === 0) continue
    out.push(...lines)
    out.push('')
  }
  out.push('Built with DDO Builder v3')
  out.push('[/font]')
  return out.join('\n')
}
