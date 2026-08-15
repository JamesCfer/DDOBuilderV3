import { useMemo, useState } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import type { Spell, DDOClass } from '../../types/ddo'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import {
  computeSpellDC, computeCasterLevel, computeMaxCasterLevel,
  computeSpellCost, computeMaxSpellLevel, availableMetamagics, METAMAGIC_KEYS,
  knownSpellCount,
} from '../../lib/spells/spellMath'
import DdoIcon from '../DdoIcon'
import HoverCard, { useHoverCard } from '../common/HoverCard'
import { SpellCardContent, type SpellCardStats } from './SpellHoverCard'
import styles from './SpellsPanel.module.css'

interface ClassTab {
  className: string
  classLevel: number
  cls: DDOClass | undefined
  byLevel: Record<number, Spell[]>
  cap: number
}

function buildClassTabs(
  classes: { name: string; levels: number }[],
  allClasses: DDOClass[],
  allSpells: Spell[],
): ClassTab[] {
  const result: ClassTab[] = []
  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    const cap = computeMaxSpellLevel(cls, bc.levels)
    if (cap === 0) continue
    const byLevel: Record<number, Spell[]> = {}
    // The catalogue lists Dominate Person and Dominate Animal twice. The row
    // key is the spell name and training is stored by name, so a duplicate is
    // both a React key collision and two rows that toggle as one — keep the
    // first and drop the repeat.
    const seen = new Set<string>()
    for (const spell of allSpells) {
      const lvl = spell.Level?.[bc.name]
      if (lvl == null || lvl < 1 || lvl > cap) continue
      if (seen.has(spell.Name)) continue
      seen.add(spell.Name)
      if (!byLevel[lvl]) byLevel[lvl] = []
      byLevel[lvl].push(spell)
    }
    if (Object.keys(byLevel).length > 0) {
      result.push({ className: bc.name, classLevel: bc.levels, cls, byLevel, cap })
    }
  }
  return result
}

export default function SpellsPanel() {
  const { build, dispatch } = useCharacter()

  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const { allClasses, allSpells } = bundle
  const loading = !bundle.loaded
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const card = useHoverCard<{ spell: Spell; className: string; stats: SpellCardStats }>()

  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)

  const tabs = buildClassTabs(build.classes, allClasses, allSpells)
  const tabNames = tabs.map(t => t.className)
  const resolvedTab = tabNames.includes(activeTab ?? '') ? activeTab! : (tabNames[0] ?? null)
  const activeTabData = tabs.find(t => t.className === resolvedTab)

  const heightenActive = build.activeBuffs.includes('Heighten Spell') ||
    build.activeBuffs.includes('Heighten')

  // V2 BreakdownItemCasterLevel.cpp:77-100: the "Mixed Magics" enhancement
  // (Wild Mage tree WMUnstableSorcery / Arcane Trickster tree ATMoreMagicMoreFun)
  // raises that class's caster level to min(20, character level). The selection
  // value "Mixed Magics" is stored under the owning archetype tree, so we map
  // the trained selection back to its class and pass min(20, totalLevel) to
  // computeCasterLevel for that class only.
  const mixedMagicsClasses = useMemo(() => {
    const set = new Set<string>()
    const treeToClass: Record<string, string> = {
      'Wild Mage': 'Wild Mage',
      'Arcane Trickster': 'Arcane Trickster',
    }
    for (const [treeName, sels] of Object.entries(build.enhancementSelections ?? {})) {
      const cls = treeToClass[treeName]
      if (!cls) continue
      if (Object.values(sels).includes('Mixed Magics')) set.add(cls)
    }
    return set
  }, [build.enhancementSelections])
  const characterLevel = Math.min(20, build.totalLevel ?? 0)

  function isTrained(className: string, lvl: number, name: string): boolean {
    return (build.trainedSpells[className]?.[lvl] ?? []).includes(name)
  }
  function toggleTrain(className: string, lvl: number, name: string) {
    if (isTrained(className, lvl, name)) {
      dispatch({ type: 'REVOKE_SPELL', className, spellLevel: lvl, spellName: name })
    } else {
      dispatch({ type: 'TRAIN_SPELL', className, spellLevel: lvl, spellName: name })
    }
  }
  function isMetamagicEnabled(className: string, spellName: string, mm: string): boolean {
    return (build.spellMetamagics[className]?.[spellName] ?? []).includes(mm)
  }
  function toggleMetamagic(className: string, spellName: string, mm: string) {
    dispatch({ type: 'TOGGLE_SPELL_METAMAGIC', className, spellName, metamagic: mm })
  }

  return (
    <div className="panel">
      <div className="panel-header">Spells</div>
      <div className="panel-body">
        {loading ? (
          <p className={styles.empty}>Loading spells…</p>
        ) : tabs.length === 0 ? (
          <p className={styles.empty}>No spellcasting classes selected.</p>
        ) : (
          <>
            {tabNames.length > 1 && (
              <div className={styles.tabs}>
                {tabNames.map(name => (
                  <button
                    key={name}
                    className={`${styles.tab} ${name === resolvedTab ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {activeTabData && (
              <div className={styles.spellList}>
                {Object.keys(activeTabData.byLevel)
                  .map(Number).sort((a, b) => a - b)
                  .map(lvl => {
                    const trainedCount = (build.trainedSpells[activeTabData.className]?.[lvl] ?? []).length
                    const cap = knownSpellCount(activeTabData.cls, activeTabData.classLevel, lvl)
                    const hasCap = Number.isFinite(cap)
                    const atCap = hasCap && trainedCount >= cap
                    return (
                      <div key={lvl} className={styles.levelGroup}>
                        <div className={styles.levelHeader}>
                          Level {lvl} <span className={styles.levelCount}>
                            {hasCap ? `(${trainedCount}/${cap} trained)` : `(${trainedCount} trained)`}
                          </span>
                        </div>
                        {activeTabData.byLevel[lvl]
                          .slice().sort((a, b) => a.Name.localeCompare(b.Name))
                          .map(spell => {
                            const trained = isTrained(activeTabData.className, lvl, spell.Name)
                            const enabledMM = build.spellMetamagics[activeTabData.className]?.[spell.Name] ?? []
                            const dcs = Array.isArray(spell.SpellDC) ? spell.SpellDC : (spell.SpellDC ? [spell.SpellDC] : [])
                            const dcValues = dcs.map(d => computeSpellDC(spell, d, activeTabData.cls, activeTabData.classLevel, stats, { heightenActive }))
                            const cl = computeCasterLevel(
                              spell, activeTabData.cls, activeTabData.classLevel, stats,
                              mixedMagicsClasses.has(activeTabData.className)
                                ? { mixedMagicsCharacterLevel: characterLevel }
                                : {},
                            )
                            const mcl = computeMaxCasterLevel(spell, activeTabData.cls, activeTabData.classLevel, stats)
                            const cost = computeSpellCost(spell, activeTabData.cls, activeTabData.classLevel, stats, enabledMM)
                            const mmList = availableMetamagics(spell)
                            const cardStats: SpellCardStats = {
                              spellLevel: lvl,
                              casterLevel: cl,
                              maxCasterLevel: mcl,
                              cost,
                              dc: dcValues.length > 0 ? Math.max(...dcValues) : undefined,
                            }
                            return (
                              <div
                                key={spell.Name}
                                className={styles.spellRow}
                                // Anchored on the row's right edge: the list
                                // fills the panel, so a card opening left
                                // would sit on top of the names.
                                onMouseEnter={card.show(
                                  { spell, className: activeTabData.className, stats: cardStats },
                                  'right',
                                )}
                                onMouseLeave={card.hide}
                              >
                                <input type="checkbox" checked={trained} onChange={() => toggleTrain(activeTabData.className, lvl, spell.Name)} className={styles.trainCheckbox} disabled={!trained && atCap} title={trained ? 'Untrain' : atCap ? `Spell slots full (${cap}/${cap})` : 'Train'} />
                                <DdoIcon
                                  category="SpellImages"
                                  name={spell.Icon ?? spell.Name}
                                  size={18}
                                  className={styles.spellIcon}
                                />
                                <span className={styles.spellName}>{spell.Name}</span>
                                {spell.School && <span className={styles.spellSchool}>{Array.isArray(spell.School) ? spell.School.join('/') : spell.School}</span>}
                                <span className={styles.spellStat} title="Caster Level">CL {cl}{mcl !== Infinity ? `/${mcl}` : ''}</span>
                                <span className={styles.spellStat} title="Spell Point cost">SP {cost}</span>
                                {dcValues.length > 0 && (
                                  <span className={styles.spellStat} title="Spell DC">DC {Math.max(...dcValues)}</span>
                                )}
                                {trained && mmList.length > 0 && (
                                  <span className={styles.metamagic}>
                                    {mmList.map(mm => (
                                      <button
                                        key={mm}
                                        type="button"
                                        className={`${styles.mmToggle} ${isMetamagicEnabled(activeTabData.className, spell.Name, mm) ? styles.mmActive : ''}`}
                                        onClick={() => toggleMetamagic(activeTabData.className, spell.Name, mm)}
                                        title={`Toggle ${mm} metamagic`}
                                      >
                                        {mm[0]}
                                      </button>
                                    ))}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    )
                  })}
              </div>
            )}
            {/* Reference key for metamagic letters */}
            {activeTabData && (
              <div className={styles.mmLegend}>
                {METAMAGIC_KEYS.map(k => (
                  <span key={k}><kbd>{(k as string)[0]}</kbd> {k as string}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {card.hover && (
        <HoverCard x={card.hover.x} y={card.hover.y} openLeft={card.hover.openLeft}>
          <SpellCardContent
            spell={card.hover.data.spell}
            className={card.hover.data.className}
            stats={card.hover.data.stats}
          />
        </HoverCard>
      )}
    </div>
  )
}
