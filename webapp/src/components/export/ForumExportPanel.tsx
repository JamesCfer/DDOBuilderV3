import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import { findActiveLife } from '../../lib/multiLife'
import { DEFAULT_SECTIONS, emitForumExport, type SectionDef } from '../../lib/export/sections'
import type { Feat, Stance } from '../../types/ddo'
import styles from './ForumExportPanel.module.css'

export default function ForumExportPanel() {
  const { build } = useCharacter()
  const { doc } = useDocument()
  const [copied, setCopied] = useState(false)
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(DEFAULT_SECTIONS.map(s => s.id)))

  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const { allClasses, allRaces, allSelfBuffs, allFeats } = bundle

  // Panel-specific data not part of the shared bundle
  const [allStances, setAllStances] = useState<Stance[]>([])
  const [epicPastLifeFeats, setEpicPastLifeFeats] = useState<Feat[]>([])

  useEffect(() => {
    api.stances().then(setAllStances).catch(() => setAllStances([]))
    api.feats({ acquire: 'EpicPastLife' }).then(setEpicPastLifeFeats).catch(() => setEpicPastLifeFeats([]))
  }, [])

  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)
  const specialFeats = findActiveLife(doc)?.specialFeats

  const sections: SectionDef[] = useMemo(
    () => DEFAULT_SECTIONS.filter(s => enabled.has(s.id)),
    [enabled],
  )
  const exportText = useMemo(
    () => emitForumExport(
      { build, stats, allClasses, allRaces, allStances, allSelfBuffs, epicPastLifeFeats, allFeats, specialFeats },
      sections,
    ),
    [build, stats, sections, allClasses, allRaces, allStances, allSelfBuffs, epicPastLifeFeats, allFeats, specialFeats],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback: user can select manually */ }
  }

  function toggleSection(id: string) {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="panel">
      <div className="panel-header">Forum Export</div>
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <span className={styles.hint}>Paste into DDO forums or any BBCode-compatible board.</span>
        </div>
        <div className={styles.sectionsRow}>
          {DEFAULT_SECTIONS.map(s => (
            <label key={s.id} className={styles.sectionToggle}>
              <input type="checkbox" checked={enabled.has(s.id)} onChange={() => toggleSection(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
        <textarea
          className={styles.textarea}
          value={exportText}
          readOnly
          spellCheck={false}
        />
      </div>
    </div>
  )
}
