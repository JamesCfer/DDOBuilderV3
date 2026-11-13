// Slider discovery — walks every active source of effects looking for
// Effect_CreateSlider declarations.
//
// V2 source: Effect.h `Effect_CreateSlider` + AmountType `Slider*`. Sliders are
// declared by an effect with Item[0]=name and Amount=[initial, min, max].
//
// In V3 the slider's *current* value is stored on `CharacterBuild.sliderValues`
// keyed by name. The list returned here drives UI rendering (rendering a
// slider only when its parent is active).

import type { Effect, EnhancementTree, OptionalBuff, Feat } from '../../types/ddo'
import type { CharacterBuild } from '../../types/ddo'

export interface SliderDef {
  name: string
  min: number
  max: number
  initial: number
  source: string
  /** When set, the slider should only render when the named stance is active. */
  activeWhen?: { kind: 'stance'; name: string }
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

function parseAmountTuple(raw: unknown): number[] {
  if (raw == null) return []
  if (typeof raw === 'number') return [raw]
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean).map(Number)
  if (Array.isArray(raw)) return raw.map(Number).filter(n => !isNaN(n))
  if (typeof raw === 'object' && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    return typeof t === 'string'
      ? t.split(/\s+/).filter(Boolean).map(Number)
      : [Number(t)]
  }
  return []
}

/** Returns null if the effect is not a CreateSlider declaration. */
function effectToSlider(effect: Effect, source: string): SliderDef | null {
  if (effect.Type !== 'CreateSlider') return null
  const items = toArray(effect.Item)
  if (items.length === 0) return null
  const [initial = 0, min = 0, max = 0] = parseAmountTuple(effect.Amount)
  // Detect a stance gate on the same effect's Requirements.
  let activeWhen: SliderDef['activeWhen']
  const reqs = effect.Requirements?.Requirement
  for (const r of toArray(reqs)) {
    if (r.Type === 'Stance') {
      const its = toArray(r.Item)
      if (its.length > 0) {
        activeWhen = { kind: 'stance', name: its[0] }
        break
      }
    }
  }
  return { name: items[0], initial, min, max, source, activeWhen }
}

function eachEffect(effects: Effect | Effect[] | undefined): Effect[] {
  return toArray(effects)
}

export function collectSliders(
  build: CharacterBuild,
  allSelfBuffs: OptionalBuff[],
  allFeats: Feat[],
  allTrees: EnhancementTree[],
): SliderDef[] {
  const out: SliderDef[] = []

  // Self/party buffs that are toggled on
  const activeBuffNames = new Set(build.activeBuffs)
  for (const b of allSelfBuffs) {
    if (!activeBuffNames.has(b.Name)) continue
    for (const eff of eachEffect((b as { Effect?: Effect | Effect[] }).Effect)) {
      const s = effectToSlider(eff, b.Name)
      if (s) out.push(s)
    }
  }

  // Trained feats
  const trainedFeats = new Set(Object.values(build.featChoices).filter(Boolean))
  for (const f of allFeats) {
    if (!trainedFeats.has(f.Name)) continue
    for (const eff of eachEffect((f as { Effect?: Effect | Effect[] }).Effect)) {
      const s = effectToSlider(eff, f.Name)
      if (s) out.push(s)
    }
  }

  // Enhancements / destinies / reaper trees with non-zero ranks.
  const choices: Array<Record<string, Record<string, number>>> = [
    build.enhancementChoices ?? {},
    build.destinyChoices ?? {},
    build.reaperChoices ?? {},
  ]
  for (const c of choices) {
    for (const [treeName, items] of Object.entries(c)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      for (const [itemName, rank] of Object.entries(items)) {
        if (!rank) continue
        // Choices are keyed by InternalName (display names can repeat in a tree,
        // e.g. Feydark Illusionist's core and tier-3 "Ability I").
        const tItems = tree.EnhancementTreeItem ?? []
        const ti = tItems.find(i => i.InternalName === itemName) ?? tItems.find(i => i.Name === itemName)
        if (!ti) continue
        const tiEffects = (ti as { Effects?: Effect | Effect[]; Effect?: Effect | Effect[] })
        for (const eff of [...eachEffect(tiEffects.Effect), ...eachEffect(tiEffects.Effects)]) {
          const s = effectToSlider(eff, `${treeName}: ${itemName}`)
          if (s) out.push(s)
        }
      }
    }
  }

  // Deduplicate by name keeping the first-seen definition (canonical source).
  const seen = new Set<string>()
  return out.filter(s => {
    if (seen.has(s.name)) return false
    seen.add(s.name)
    return true
  })
}
