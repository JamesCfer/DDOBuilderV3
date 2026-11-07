// V2 matches an enhancement selection by its exact name. Arcane Archer's
// "Elemental Damage" option is "Elemental Damage " in Elemental Arrows III and
// "Elemental Damage  " in IV (the stray spaces keep the names distinct), but
// V3's parser trims, so V3 exported the trimmed name and V2 silently dropped
// the selection. Fuzz seed 15763: V2 1 imbue die, V3 3.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { exportV2Build } from '../lib/v2Export'
import { exportEnhancementTreeFile } from '../lib/treeFileIO'
import { V2_SELECTION_NAMES } from '../lib/v2SelectionNames'

const ROOT = join(__dirname, '..', '..', '..')

function xmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? xmlFiles(p) : n.endsWith('.xml') ? [p] : []
  })
}

describe('V2 selection names with stray whitespace', () => {
  it('covers every whitespace selection name in the V2 data', () => {
    const found: Record<string, string> = {}
    for (const f of xmlFiles(join(ROOT, 'Output', 'DataFiles'))) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/<EnhancementSelection>\s*<Name>([^<]*)<\/Name>/g)) {
        if (m[1] === m[1].trim()) continue
        const at = s.lastIndexOf('<InternalName>', m.index)
        const internal = s.slice(at + 14, s.indexOf('</InternalName>', at))
        found[internal] = m[1]
      }
    }
    expect(Object.keys(found).length).toBeGreaterThan(0)
    expect(V2_SELECTION_NAMES).toEqual(found)
  })

  it('fuzz-15763: export writes "Elemental Damage " for Elemental Arrows III', () => {
    const xml = readFileSync(join(ROOT, 'Output', 'FuzzBuilds', 'fuzz-15763.DDOBuild'), 'utf8')
    const out = exportV2Build(importV2Build(xml).build)
    expect(out).toMatch(/<EnhancementName>AAElementalArrowsIII<\/EnhancementName>\s*<Selection>Elemental Damage <\/Selection>/)
    expect(out).toMatch(/<Selection>Flaming Arrows<\/Selection>/)
  })

  it('tree file export writes the exact V2 name for Elemental Arrows IV', () => {
    const out = exportEnhancementTreeFile({
      treeName: 'Arcane Archer (Elf)',
      choices: { AAElfElementalArrowsIV: 1 },
      selections: { AAElfElementalArrowsIV: 'Elemental Damage' },
    } as never)
    expect(out).toContain('<Selection>Elemental Damage  </Selection>')
  })
})
