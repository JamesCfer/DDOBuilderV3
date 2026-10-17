// @vitest-environment jsdom
//
// Since #256 the saved-character list read back empty whenever anything was
// saved: `.map(migrateDocument)` passed the array index as the preferred
// name, which threw, and the catch returned []. The File menu showed "No
// saves" and the next save overwrote the list. Saves must read back.

import { describe, it, expect } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { usePersistence } from '../hooks/usePersistence'
import { emptyDocument } from '../lib/multiLife'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('saved characters', () => {
  it('lists every character saved in this browser', () => {
    const a = { ...emptyDocument(), name: 'Tank' }
    const b = { ...emptyDocument(), name: 'Healer' }
    localStorage.setItem('ddo-builder-docs', JSON.stringify([a, b]))
    let names: string[] = []
    function Probe() { names = usePersistence().docs.map(d => d.name); return null }
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<Probe />))
    expect(names).toEqual(['Tank', 'Healer'])
    act(() => root.unmount())
  })
})
