// @vitest-environment jsdom
//
// Saved files take their name from the Character page's Name field.
//
// V2's <Character> has no name of its own (Character.h Character_PROPERTIES) —
// the character IS its file. V3 imported that as `doc.name`, falling back to
// the first LIFE's name, and named every download from `doc.name`: import a
// build whose life is the default "Life 1" and every character you saved came
// out "Life_1.DDOBuild", each one overwriting the last.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { importV2Build } from '../lib/v2Import'
import { characterFileName, syncBuildIntoDocument, emptyDocument } from '../lib/multiLife'
import { emptyBuild } from '../types/ddo'
import { SaveLoadBar } from '../hooks/usePersistence'
import { CharacterProvider, useCharacter } from '../context/CharacterContext'
import { DocumentProvider, useDocument } from '../context/DocumentContext'
import { SettingsProvider } from '../context/SettingsContext'
import type { CharacterDocument } from '../types/ddo'

const FIXTURE = join(__dirname, '..', '..', '..', 'Output', 'Example Builds', 'Maetrim_EndGameHandwrapsMonk.DDOBuild')
const haveFixture = existsSync(FIXTURE)

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('characterFileName', () => {
  it('uses the Character page name of the active build', () => {
    const build = { ...emptyBuild(), name: 'Bob the Barbarian' }
    const doc = { ...emptyDocument(build), name: 'Life 1' }
    expect(characterFileName(doc)).toBe('Bob the Barbarian')
  })

  it('falls back to the document name, then to a generic name', () => {
    const build = { ...emptyBuild(), name: '   ' }
    const doc = { ...emptyDocument(build), name: 'Saved Character' }
    expect(characterFileName(doc)).toBe('Saved Character')
    expect(characterFileName({ ...doc, name: '' })).toBe('Character')
  })
})

describe('renaming on the Character page', () => {
  it('carries a placeholder document name along with the rename', () => {
    const doc = emptyDocument()               // name: "New Character"
    const renamed = { ...emptyBuild(), id: doc.activeBuildId, name: 'Zephyra' }
    expect(syncBuildIntoDocument(doc, renamed).name).toBe('Zephyra')
  })

  it('replaces the life-name fallback a V2 import left behind', () => {
    const base = emptyDocument()
    const doc: CharacterDocument = {
      ...base,
      name: base.lives[0].name,               // "Life 1" — nobody chose this
    }
    const renamed = { ...emptyBuild(), id: doc.activeBuildId, name: 'Zephyra' }
    expect(syncBuildIntoDocument(doc, renamed).name).toBe('Zephyra')
  })

  it('never overwrites a name the user gave the document', () => {
    const doc = { ...emptyDocument(), name: 'My Reaper Main' }
    const renamed = { ...emptyBuild(), id: doc.activeBuildId, name: 'Zephyra' }
    expect(syncBuildIntoDocument(doc, renamed).name).toBe('My Reaper Main')
  })
})

describe.runIf(haveFixture)('importing a V2 file', () => {
  const xml = readFileSync(FIXTURE, 'utf8')

  it('names the character after the file, not after its first life', () => {
    const { document, build } = importV2Build(xml, { characterName: 'Maetrim_EndGameHandwrapsMonk' })
    expect(document.name).toBe('Maetrim_EndGameHandwrapsMonk')
    expect(build.name).toBe('Maetrim_EndGameHandwrapsMonk')
    expect(characterFileName(document)).toBe('Maetrim_EndGameHandwrapsMonk')
    // the life keeps its own name
    expect(document.lives[0].name).toBe('Maetrim Monk')
  })

  it('still falls back to the life name when no file name is given', () => {
    const { document } = importV2Build(xml)
    expect(document.name).toBe('Maetrim Monk')
  })
})

describe('the export button', () => {
  it('downloads under the Character page name', async () => {
    const downloads: string[] = []
    const origClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    }
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = () => 'blob:test'
    URL.revokeObjectURL = () => {}

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    try {
      const build = { ...emptyBuild(), name: 'Zephyra' }
      const doc: CharacterDocument = { ...emptyDocument(build), name: 'Life 1' }
      const Seed = () => {
        const { dispatch } = useCharacter()
        const { setDoc } = useDocument()
        const [ready, setReady] = React.useState(false)
        React.useEffect(() => {
          setDoc(doc)
          dispatch({ type: 'LOAD_BUILD', build })
          setReady(true)
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return ready ? React.createElement(SaveLoadBar, { onLoad: () => {} }) : null
      }
      await act(async () => {
        root = createRoot(container)
        root.render(
          React.createElement(CharacterProvider, null,
            React.createElement(DocumentProvider, null,
              React.createElement(SettingsProvider, null, React.createElement(Seed)),
            ),
          ),
        )
      })
      for (let i = 0; i < 4; i++) {
        await act(async () => { await new Promise(r => setTimeout(r, 10)) })
      }
      const buttons = Array.from(container.querySelectorAll('button'))
      const exportV2 = buttons.find(b => b.textContent === 'Export .DDOBuild')!
      const exportJson = buttons.find(b => b.textContent === 'Export JSON')!
      await act(async () => { exportV2.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      await act(async () => { exportJson.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      expect(downloads).toEqual(['Zephyra.DDOBuild', 'Zephyra.json'])
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      HTMLAnchorElement.prototype.click = origClick
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })
})
