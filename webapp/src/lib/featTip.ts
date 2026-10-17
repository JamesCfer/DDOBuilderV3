// Tooltip content for a feat: name, description and its effects with bonus
// types, the same card the enhancement trees show.

import type { Feat } from '../types/ddo'
import type { TipContent } from '../components/common/HoverTip'
import { summarizeEffects } from './effectSummary'

export function featTip(
  name: string,
  feat: Feat | undefined,
  extra: Partial<TipContent> = {},
): TipContent {
  return {
    title: name,
    description: feat?.Description,
    effects: summarizeEffects(feat?.Effect),
    ...extra,
  }
}
