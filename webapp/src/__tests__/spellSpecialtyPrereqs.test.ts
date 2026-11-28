// Tester report (build #347): "Spell Specialty (Evocation) can be taken
// without its pre-req feats". V2 data (Legendary.class.xml) gives Spell
// Specialty: <school> exactly two rules: character Level 31, and
// RequiresNoneOf Spell Focus: <school> (it is a SECONDARY spell focus).
// These tests pin that V3 enforces both and that the picker now shows the
// "cannot have" rule V2 lists, which V3 used to leave out.
import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadAllCatalogues } from '../server/dataLoaders'
import { buildSlots } from '../lib/levelTraining'
import { featOptionsForSlot } from '../lib/featEligibility'
import { formatPrerequisites } from '../components/builder/FeatSlots'
import { emptyBuild } from '../types/ddo'

const DATA = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const NAME = 'Spell Specialty: Evocation'

describe.skipIf(!existsSync(DATA))('Spell Specialty prerequisites (V2 parity)', () => {
  const cat = loadAllCatalogues(DATA)
  const race = cat.allRaces.find(r => r.Name === 'Human')
  function eligibility(withSpellFocus: boolean): Record<number, boolean> {
    const build = {
      ...emptyBuild(),
      classes: [{ name: 'Wizard', levels: 20 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array(20).fill('Wizard'),
    }
    const slots = buildSlots(build, cat.allClasses, cat.allRaces)
    if (withSpellFocus) build.featChoices = { 'heroic-1': 'Spell Focus: Evocation' }
    const out: Record<number, boolean> = {}
    for (const slot of slots) {
      const hit = featOptionsForSlot(slot, slots, cat.allFeats, build, cat.allClasses, race, {})
        .find(o => o.feat.Name === NAME)
      if (hit) out[slot.level] = hit.prereqsMet
    }
    return out
  }

  it('is locked before character level 31', () => {
    const e = eligibility(false)
    expect(e[22]).toBe(false)
    expect(e[28]).toBe(false)
    expect(e[31]).toBe(true)
  })
  it('is locked when Spell Focus: Evocation is trained', () => {
    const e = eligibility(true)
    expect(e[31]).toBe(false)
    expect(e[34]).toBe(false)
  })
  it('the picker lists both rules', () => {
    const feat = cat.allFeats.find(f => f.Name === NAME)!
    expect(formatPrerequisites(feat)).toBe('Requires: Level 31+. Cannot have: Spell Focus: Evocation')
  })
})
