// V2 BreakdownItemCasterLevel.cpp: "Mixed Magics" raises every class's caster
// level to min(20, character level). V2 recognises three sources:
//   - Wild Mage WMUnstableSorcery, selection "Mixed Magics"
//   - Arcane Trickster ATMoreMagicMoreFun, selection "Mixed Magics"
//   - Archmage AMMixedMagics (no selection; added in V2 2.0.0.85)
import type { CharacterBuild } from '../types/ddo'

export const MIXED_MAGICS_SELECTORS = ['WMUnstableSorcery', 'ATMoreMagicMoreFun']
export const MIXED_MAGICS_ENHANCEMENTS = ['AMMixedMagics']

/** True when any Mixed Magics source is trained (rank > 0) on the build. */
export function hasMixedMagics(build: CharacterBuild): boolean {
  const choices = build.enhancementChoices ?? {}
  const selections = build.enhancementSelections ?? {}
  for (const [tree, ranks] of Object.entries(choices)) {
    const r = ranks as Record<string, number>
    for (const n of MIXED_MAGICS_ENHANCEMENTS) if ((r[n] ?? 0) > 0) return true
    for (const n of MIXED_MAGICS_SELECTORS) {
      if ((r[n] ?? 0) > 0
        && (selections[tree] as Record<string, string> | undefined)?.[n] === 'Mixed Magics') return true
    }
  }
  return false
}
