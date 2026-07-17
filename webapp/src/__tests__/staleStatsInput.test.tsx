// @vitest-environment jsdom
/**
 * Regression: useBuildStats must recompute when late-arriving catalogues
 * (allGuildBuffs / allSpells / allItemBuffs / allWeaponGroups) land.
 *
 * Every stats panel fires its catalogue fetches independently, so these four
 * optional inputs can resolve AFTER the tracked ones. The statMap memo in
 * useBuildStats.ts previously omitted them from its dependency list — if e.g.
 * the guild-buff catalogue arrived last, the computed stats permanently missed
 * its contributions until some other build/catalogue change forced a
 * recompute. User-visible symptom: the Analysis page computes without all the
 * info, with numbers depending on network response ordering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { CharacterProvider } from '../context/CharacterContext'
import { DocumentProvider } from '../context/DocumentContext'
import { useBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, GuildBuff } from '../types/ddo'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function baseInput(): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [],
    allFeats: [],
    allTrees: [],
    gearItems: {},
    allSelfBuffs: [],
    allAugments: [],
    allSetBonuses: [],
    allFiligreeBonuses: [],
    allFiligrees: [],
  }
}

const guildBuild: CharacterBuild = {
  ...emptyBuild(),
  guildLevel: 10,
  applyGuildBuffs: true,
}

const guildBuffs: GuildBuff[] = [
  {
    Name: 'Test Guild HP',
    Level: 5,
    Effect: { Type: 'Hitpoints', Bonus: 'Guild', AType: 'Simple', Amount: '20' },
  } as unknown as GuildBuff,
]

function Probe({ input }: { input: BuildStatsInput }) {
  const stats = useBuildStats(input, guildBuild)
  return React.createElement('div', { id: 'hp-probe' }, String(stats.total('hp')))
}

describe('useBuildStats recomputes when late catalogues arrive', () => {
  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    container.remove()
  })

  it('guild-buff catalogue arriving after all tracked inputs still applies', async () => {
    const first = baseInput()
    await act(async () => {
      root = createRoot(container)
      root.render(
        React.createElement(CharacterProvider, null,
          React.createElement(DocumentProvider, null,
            React.createElement(Probe, { input: first }),
          ),
        ),
      )
    })
    const before = Number(container.querySelector('#hp-probe')!.textContent)

    // Simulate the guild-buff fetch resolving last: a new input object where
    // ONLY allGuildBuffs changed — every tracked array keeps its identity.
    const second: BuildStatsInput = { ...first, allGuildBuffs: guildBuffs }
    await act(async () => {
      root.render(
        React.createElement(CharacterProvider, null,
          React.createElement(DocumentProvider, null,
            React.createElement(Probe, { input: second }),
          ),
        ),
      )
    })
    const after = Number(container.querySelector('#hp-probe')!.textContent)

    expect(after).toBe(before + 20)
  })
})
