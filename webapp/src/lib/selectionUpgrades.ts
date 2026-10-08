// V2 TrainedEnhancement::UpgradeSelections: enhancement selector options that
// were renamed in the game data. Saved builds that still name the old option
// are moved to the new name on load.
const OLD_TO_NEW: Record<string, string> = {
  'Light: Enlightening Philosophy': 'Disciple of Philosophy: Light',
  'Dark: Forbidden Philosophy': 'Disciple of Philosophy: Dark',
  'Expeditious Chant': 'Fleeting Footsteps',
  "Queen's Diplomacy": "Otto's Whistler",   // V2 2.0.0.85 (Shiradi Strike Upgrade I)
}

export function upgradeSelection(selection: string): string {
  return OLD_TO_NEW[selection] ?? selection
}

/** Renames old selector options in a tree → item → selection map. */
export function upgradeSelections<T extends Record<string, Record<string, string>> | undefined>(
  selections: T,
): T {
  if (!selections) return selections
  let changed = false
  const out: Record<string, Record<string, string>> = {}
  for (const [tree, sels] of Object.entries(selections)) {
    const next: Record<string, string> = {}
    for (const [item, sel] of Object.entries(sels ?? {})) {
      next[item] = upgradeSelection(sel)
      if (next[item] !== sel) changed = true
    }
    out[tree] = next
  }
  return (changed ? out : selections) as T
}
