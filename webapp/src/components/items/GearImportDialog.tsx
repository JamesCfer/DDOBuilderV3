// Gear-set import dialog (V2 EquipmentPane "Import .gearset file..." /
// "Import gear set from clipboard" + GearSetNameDialog).
//
// The user pastes gear-planner website text (or picks a .gearset file); the
// text is parsed via lib/gearPlannerImport, each item is resolved against the
// item catalogue, augments are first-fit placed (V2 algorithm), and on Apply
// the gear is equipped and saved as a named gear set (which becomes active —
// V2 SetActiveGearSet behaviour).

import { useRef, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Augment, Item } from '../../types/ddo'
import {
  parseGearPlannerText,
  parseGearSetFileText,
  placeImportedAugments,
  type GearImportParse,
} from '../../lib/gearPlannerImport'
import styles from './GearPanel.module.css'
import ModalPortal from '../common/ModalPortal'

interface ResolvedEntry {
  slot: string
  itemName: string
  item: Item | null
  placements: Array<{ key: string; augmentName: string }>
}

interface GearImportDialogProps {
  onClose: () => void
}

export default function GearImportDialog({ onClose }: GearImportDialogProps) {
  const { build, dispatch } = useCharacter()
  const [text, setText] = useState('')
  const [setName, setSetName] = useState('Imported Set')
  const [resolved, setResolved] = useState<ResolvedEntry[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function resolve(parse: GearImportParse, format: 'file' | 'clipboard') {
    setBusy(true)
    try {
      const allAugments: Augment[] = await api.augments().catch(() => [])
      const out: ResolvedEntry[] = []
      const warn = [...parse.warnings]
      for (const entry of parse.entries) {
        const item: Item | null = await api.item(entry.itemName).catch(() => null)
        if (!item) {
          warn.push(`Item not found: "${entry.itemName}" (${entry.slot})`)
          out.push({ slot: entry.slot, itemName: entry.itemName, item: null, placements: [] })
          continue
        }
        const placed = placeImportedAugments(entry.slot, item, entry.augmentTexts, allAugments, format)
        warn.push(...placed.warnings)
        out.push({ slot: entry.slot, itemName: entry.itemName, item, placements: placed.placements })
      }
      setResolved(out)
      setWarnings(warn)
    } finally {
      setBusy(false)
    }
  }

  function handleParseText() {
    const isClipboard = /(^|\n) - /.test(text)
    void resolve(parseGearPlannerText(text), isClipboard ? 'clipboard' : 'file')
  }

  function handleFile(file: File) {
    // V2 rejects import files over 20k (EquippedGear.cpp:643).
    if (file.size >= 20 * 1024) {
      setWarnings([`The import file "${file.name}" is too large to process`])
      return
    }
    file.text().then(t => {
      setText(t)
      void resolve(parseGearSetFileText(t), 'file')
    })
  }

  function handleApply() {
    if (!resolved) return
    const name = setName.trim()
    if (!name) return
    // V2: a gear set must have a unique name.
    if (build.namedGearSets[name]) {
      setWarnings([`A gear set named "${name}" already exists. Choose another name.`])
      return
    }
    for (const entry of resolved) {
      if (!entry.item) continue
      dispatch({ type: 'SET_GEAR', slot: entry.slot, itemName: entry.itemName })
      for (const p of entry.placements) {
        dispatch({ type: 'SET_AUGMENT', key: p.key, augmentName: p.augmentName })
      }
    }
    dispatch({ type: 'SAVE_GEAR_SET', setName: name })
    onClose()
  }

  return (
    <ModalPortal>
    <div className={styles.dialogOverlay ?? ''} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div className="panel" style={{ width: 'min(640px, 92vw)', maxHeight: '85vh', overflow: 'auto' }}>
        <div className="panel-header">
          Import Gear Set
          <button type="button" style={{ float: 'right' }} onClick={onClose}>×</button>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea
            rows={8}
            placeholder={'Paste gear-planner website text here…\n\nWeapon: Handwraps of the Hound\n - Red Augment Slot: Acid Damage [d6] +9 Enhancement (ML 32)\n…'}
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px' }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={handleParseText} disabled={busy || !text.trim()}>
              {busy ? 'Parsing…' : 'Parse pasted text'}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
              Import .gearset file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".gearset,text/plain"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f) }}
            />
          </div>
          {warnings.length > 0 && (
            <ul style={{ color: 'var(--color-red, #d66)', fontSize: '11px', margin: 0, paddingLeft: '16px' }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {resolved && (
            <>
              <table style={{ fontSize: '12px', width: '100%' }}>
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>Slot</th><th style={{ textAlign: 'left' }}>Item</th><th style={{ textAlign: 'left' }}>Augments placed</th></tr>
                </thead>
                <tbody>
                  {resolved.map((r, i) => (
                    <tr key={i} style={r.item ? undefined : { opacity: 0.5 }}>
                      <td>{r.slot}</td>
                      <td>{r.itemName}{r.item ? '' : ' (not found)'}</td>
                      <td>{r.placements.map(p => p.augmentName).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label>
                  Gear set name:{' '}
                  <input value={setName} onChange={e => setSetName(e.target.value)} />
                </label>
                <button type="button" onClick={handleApply} disabled={!setName.trim()}>
                  Equip &amp; save as gear set
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
