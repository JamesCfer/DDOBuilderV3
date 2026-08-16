// Dynamic stance toggles — V2 CStancesPane parity.
//
// V2 surfaces a toggle for every <Stance> block hosted on something the build
// has acquired: trained enhancement/destiny/reaper tree items (destiny
// MANTLES like "Holy Mantle" / "Mantle of Fury", Warchanter toggles, …),
// equipped items (directly or via their ItemBuffs.xml template, e.g.
// "Enhanced Bloodrage"), trained spells, and trained feats
// (Build::ApplyEnhancementEffects → GetStances → NotifyNewStance,
// Build::ApplySpellEffects → s.Stances(), StancesPane::UpdateNewStance).
// V3 previously showed only the static Stances.xml list, so none of these
// build-specific toggles could be tested from the UI.
//
// Group semantics (V2 StancesPane.cpp:388 + StanceGroup.cpp:16-19): every
// named group other than "User" is single-selection — activating one stance
// deactivates its group siblings — EXCEPT "Metamagics", which is
// multi-select.

import type { CharacterBuild, EnhancementTree, Feat, Item, Spell, Stance } from '../../types/ddo'
import { enhancementRank, enhancementSelection, getSelectorOptions } from '../buildStats'

export interface DynamicStance {
  name: string
  description?: string
  /** V2 stance group ("User", "Mantle", "Metamagics", …). */
  group: string
  /** Human-readable origin, e.g. "Divine Crusader: Holy Mantle". */
  source: string
  autoControlled: boolean
}

/**
 * True for a stance the pane controls automatically (V2 `<AutoControlled/>`).
 *
 * It is an XML FLAG, not a value: fast-xml-parser turns `<AutoControlled/>`
 * into the empty string, so `s.AutoControlled === true` — and plain
 * truthiness with it — was false for every one of the 30 entries in
 * Stances.xml. The whole catalogue was therefore treated as hand-toggled, the
 * pane's "Automatic" section was always empty, and stances the build already
 * qualified for (Single Weapon Fighting, Light Armor, …) showed as off. Same
 * present-means-set rule as effectParser's `flagSet`.
 */
export function isAutoControlled(s: { AutoControlled?: unknown }): boolean {
  const v = s.AutoControlled
  return v !== undefined && v !== null && v !== false
}

/** V2: named groups are single-selection except "User" and "Metamagics". */
export function isSingleSelectionGroup(group: string): boolean {
  return group !== 'User' && group !== 'Metamagics' && group !== 'Auto'
}

/**
 * The XML parser is configured with `Group` in its always-array list (feats
 * use <Group> repeatedly), so a Stance's Group arrives as `['Mantle']`.
 * Normalize to the first entry.
 */
export function normalizeStanceGroup(group: string | string[] | undefined): string {
  if (Array.isArray(group)) return group[0] ?? 'User'
  return group ?? 'User'
}

type StanceCarrier = { Stance?: Stance | Stance[] }

function stancesOf(node: unknown): Stance[] {
  const s = (node as StanceCarrier | undefined)?.Stance
  if (!s) return []
  return Array.isArray(s) ? s : [s]
}

export interface DynamicStanceInputs {
  allTrees: EnhancementTree[]
  allFeats: Feat[]
  allSpells: Spell[]
  /** ItemBuffs.xml templates keyed by Type (for flavour-named item buffs). */
  itemBuffTemplates?: Map<string, unknown>
  /** Equipped items: slot → resolved Item. */
  gearItems: Record<string, Item>
}

export function collectDynamicStances(
  build: CharacterBuild,
  inputs: DynamicStanceInputs,
): DynamicStance[] {
  const out: DynamicStance[] = []
  const seen = new Set<string>()

  function push(s: Stance, source: string): void {
    if (!s?.Name || seen.has(s.Name)) return
    seen.add(s.Name)
    out.push({
      name: s.Name,
      description: s.Description,
      group: normalizeStanceGroup(s.Group as string | string[] | undefined),
      source,
      autoControlled: isAutoControlled(s),
    })
  }

  // ── Trained tree items (enhancement + selected destiny + reaper) ─────────
  const selectedDestinySet = new Set((build.selectedDestinyTrees ?? []).filter(Boolean))
  function scanTree(
    treeName: string,
    choices: Record<string, number>,
    selections: Record<string, string>,
  ): void {
    const tree = inputs.allTrees.find(t => t.Name === treeName)
    if (!tree) return
    for (const item of tree.EnhancementTreeItem ?? []) {
      if (enhancementRank(choices, item) <= 0) continue
      const source = `${tree.Name}: ${item.Name}`
      for (const s of stancesOf(item)) push(s, source)
      const selectedOption = enhancementSelection(selections, item)
      if (selectedOption) {
        const opt = getSelectorOptions(item).find(o => o.Name === selectedOption)
        for (const s of stancesOf(opt)) push(s, `${source} (${selectedOption})`)
      }
    }
  }
  for (const [treeName, choices] of Object.entries(build.enhancementChoices)) {
    scanTree(treeName, choices, build.enhancementSelections[treeName] ?? {})
  }
  for (const [treeName, choices] of Object.entries(build.destinyChoices)) {
    if (!selectedDestinySet.has(treeName)) continue
    scanTree(treeName, choices, build.destinySelections?.[treeName] ?? {})
  }
  for (const [treeName, choices] of Object.entries(build.reaperChoices ?? {})) {
    scanTree(treeName, choices, {})
  }

  // ── Equipped items (own Stance blocks + ItemBuffs.xml template stances) ──
  for (const item of Object.values(inputs.gearItems)) {
    for (const s of stancesOf(item)) push(s, item.Name)
    const buffs = Array.isArray(item.Buff) ? item.Buff : item.Buff ? [item.Buff] : []
    for (const buff of buffs) {
      const tpl = inputs.itemBuffTemplates?.get((buff as { Type?: string }).Type ?? '')
      for (const s of stancesOf(tpl)) push(s, item.Name)
    }
  }

  // ── Trained spells (V2 Build::ApplySpellEffects → s.Stances()) ───────────
  for (const byLevel of Object.values(build.trainedSpells ?? {})) {
    for (const names of Object.values(byLevel)) {
      for (const spellName of names) {
        const spell = inputs.allSpells.find(sp => sp.Name === spellName)
        for (const s of stancesOf(spell)) push(s, `Spell: ${spellName}`)
      }
    }
  }

  // ── Trained feats ────────────────────────────────────────────────────────
  for (const featName of new Set(Object.values(build.featChoices).filter(Boolean))) {
    const feat = inputs.allFeats.find(f => f.Name === featName)
    for (const s of stancesOf(feat)) push(s, `Feat: ${featName}`)
  }

  // ── Iconic past lives ────────────────────────────────────────────────────
  // Each race file's `Acquire=IconicPastLife` feat hosts a Group="Iconic"
  // stance ("Bladeforged ", "Aasimar Scourge " — the trailing space is V2's,
  // see restoreIconicStanceNames) that gates that past life's bonus: +2/4/6%
  // Doublestrike, +10/20/30 spell power, and so on, per stack. V2 surfaces it
  // as a toggle once the past life is acquired (Life::AllSpecialFeats →
  // NotifyNewStance), and the "Iconic" group is single-selection, so only one
  // can be lit at a time. V3 recorded the past lives but offered no toggle, so
  // none of those bonuses could ever be applied.
  for (const [source, count] of Object.entries(build.pastLives ?? {})) {
    if (!count) continue
    // Two key conventions reach `pastLives`: the panel writes the race name,
    // the V2 importer writes the whole feat name.
    const feat = inputs.allFeats.find(f => f.Name === `Past Life: ${source}`)
      ?? inputs.allFeats.find(f => f.Name === source)
    if (!feat || (feat as { Acquire?: string }).Acquire !== 'IconicPastLife') continue
    const race = feat.Name.replace(/^Past Life:\s*/, '')
    for (const s of stancesOf(feat)) {
      push(s, `Iconic past life: ${race}${count > 1 ? ` ×${count}` : ''}`)
    }
  }

  return out
}
