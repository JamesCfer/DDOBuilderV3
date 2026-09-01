// Encounter damage calculator.
//
// Wraps the NicDamageCalc simulation engine (lib/combat/damageSim.ts) around
// the current build. The original calculator asks the player to type in forty
// fields; this one derives them from the character and then lets the player
// correct anything it got wrong.
//
// The panel keeps two images of the inputs: `auto`, recomputed from the build
// on every change, and `edits`, the player's overrides. Editing any field
// forks the whole image so a later build change does not silently discard the
// player's work; "Resync from build" drops the fork.

import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type {
  DDOClass, Race, Feat, EnhancementTree, Item, Augment, SetBonus,
  FiligreeSetBonus, Filigree, OptionalBuff,
} from '../../types/ddo'
import type { AttackRate, ItemBuffSpec } from '../../server/dataLoaders'
import { useBuildStats } from '../../hooks/useBuildStats'
import {
  lookupAttacksPerMinute, pickCombatStyleName, twoWeaponFightingTier,
} from '../../lib/combat/attackRate'
import { acquiredFeatNames } from '../../lib/automaticFeats'
import type { WeaponGroupSpec } from '../../lib/weapons/groups'
import {
  simulateDamage, TRIGGERS,
  type CoreParams, type SimLists, type SimResult, type ListKey,
} from '../../lib/combat/damageSim'
import {
  buildAutoDamage, isRangedWeapon,
  type AuditEntry,
} from '../../lib/combat/autoDamage'
import DamageHistogram from './DamageHistogram'
import BreakdownTip, { type BreakdownTipState } from '../common/BreakdownTip'
import { sourceShareRows, bucketSourceRows } from '../../lib/combat/damageRows'
import { fmtDamage as fmt, fmtPercentValue } from '../../lib/combat/format'
import styles from './DamageCalcPanel.module.css'

// ---------------------------------------------------------------------------
// Field descriptors -- label, key, and widget kind for the scalar inputs.
// ---------------------------------------------------------------------------

type FieldKind = 'num' | 'bool' | 'text' | 'choice'

interface Field {
  key: keyof CoreParams
  label: string
  kind: FieldKind
  choices?: readonly string[]
  title?: string
}

const SECTIONS: Array<{ title: string; fields: Field[] }> = [
  {
    title: 'To-hit',
    fields: [
      { key: 'atk', label: 'Attack bonus', kind: 'num', title: 'BAB + to-hit bonuses + ability modifier' },
      { key: 'prof', label: 'Proficiency %', kind: 'num', title: 'Flat percentage added to hit chance. Seeded at 20% when proficient.' },
      { key: 'prec', label: 'Precision %', kind: 'num' },
      { key: 'seeker', label: 'Seeker (confirm only)', kind: 'num' },
      { key: 'threat', label: 'Threat range low', kind: 'num', title: '17 means the weapon threatens on 17-20' },
      { key: 'critMult', label: 'Crit multiplier', kind: 'num' },
      { key: 'crit19', label: 'Extra mult on 19-20', kind: 'num' },
      { key: 'confPrec', label: 'Precision in confirm', kind: 'bool' },
    ],
  },
  {
    title: 'Critable bucket',
    fields: [
      { key: 'wMult', label: '[W] multiplier', kind: 'num' },
      { key: 'wFlat', label: 'Flat inside brackets', kind: 'num' },
      { key: 'deadly', label: 'Flat damage, normal hit', kind: 'num' },
      { key: 'deadlyCrit', label: 'Flat damage, crit', kind: 'num' },
      { key: 'coreTag', label: 'Damage tag', kind: 'text' },
    ],
  },
  {
    title: 'Sneak attack',
    fields: [
      { key: 'sneakPct', label: 'Attacks that sneak %', kind: 'num' },
      { key: 'decHit', label: 'Deception to-hit', kind: 'num' },
      { key: 'decDmg', label: 'Deception damage', kind: 'num' },
      { key: 'sneakDice', label: 'Sneak dice (d6)', kind: 'num' },
      { key: 'sneakTag', label: 'Damage tag', kind: 'text' },
    ],
  },
  {
    title: 'Imbue',
    fields: [
      { key: 'imbBonus', label: 'Bonus dice (rolls N+1)', kind: 'num' },
      { key: 'imbSides', label: 'Die size', kind: 'num' },
      { key: 'imbRate', label: 'Scaling rate %', kind: 'num' },
      { key: 'imbSrc', label: 'Scales with', kind: 'choice', choices: ['RP', 'SP'] },
      { key: 'imbSP', label: 'Spell Power', kind: 'num' },
      { key: 'imbMRR', label: 'Reduced by MRR', kind: 'bool' },
      { key: 'imbTag', label: 'Damage tag', kind: 'text' },
    ],
  },
  {
    title: 'Scaling',
    fields: [
      { key: 'rp', label: 'Melee / Ranged Power', kind: 'num' },
      { key: 'ds', label: 'Doublestrike / shot %', kind: 'num' },
      { key: 'apm', label: 'Attacks per minute', kind: 'num' },
    ],
  },
  {
    title: 'Target',
    fields: [
      { key: 'ac', label: 'Armor Class', kind: 'num' },
      { key: 'fort', label: 'Fortification %', kind: 'num' },
      { key: 'bypass', label: 'Fort bypass %', kind: 'num' },
      { key: 'prr', label: 'PRR', kind: 'num' },
      { key: 'mrr', label: 'MRR', kind: 'num' },
    ],
  },
  {
    title: 'Simulation',
    fields: [
      { key: 'dur', label: 'Encounter seconds', kind: 'num' },
      { key: 'trials', label: 'Trials', kind: 'num' },
      { key: 'seed', label: 'Seed', kind: 'num' },
    ],
  },
]

/** Editable fields per effect list, mirroring the engine's specs. */
const LIST_FIELDS: Record<ListKey, Array<{ key: string; label: string; kind: FieldKind; choices?: readonly string[] }>> = {
  procs: [
    { key: 'trigger', label: 'Trigger', kind: 'choice', choices: TRIGGERS },
    { key: 'chance', label: 'Chance %', kind: 'num' },
    { key: 'icd', label: 'ICD (s)', kind: 'num' },
    { key: 'dice', label: 'Dice', kind: 'num' },
    { key: 'sides', label: 'Die size', kind: 'num' },
    { key: 'flat', label: 'Flat damage', kind: 'num' },
    { key: 'rpRate', label: 'RP rate %', kind: 'num' },
    { key: 'dsScale', label: 'Doubleshot scales', kind: 'bool' },
    { key: 'tag', label: 'Damage tag', kind: 'text' },
  ],
  dots: [
    { key: 'trigger', label: 'Trigger', kind: 'choice', choices: TRIGGERS },
    { key: 'chance', label: 'Chance %', kind: 'num' },
    { key: 'icd', label: 'ICD (s)', kind: 'num' },
    { key: 'cap', label: 'Stack cap', kind: 'num' },
    { key: 'perTick', label: 'Flat per stack', kind: 'num' },
    { key: 'dice', label: 'Dice per stack', kind: 'num' },
    { key: 'sides', label: 'Die size', kind: 'num' },
    { key: 'tick', label: 'Tick interval (s)', kind: 'num' },
    { key: 'dur', label: 'Stack duration (s)', kind: 'num' },
    { key: 'decayAll', label: 'Drop all on expiry', kind: 'bool' },
    { key: 'rpRate', label: 'RP rate %', kind: 'num' },
    { key: 'tag', label: 'Damage tag', kind: 'text' },
  ],
  buffs: [
    { key: 'trigger', label: 'Trigger', kind: 'choice', choices: TRIGGERS },
    { key: 'chance', label: 'Chance %', kind: 'num' },
    { key: 'icd', label: 'ICD (s)', kind: 'num' },
    { key: 'dur', label: 'Duration (s)', kind: 'num' },
    { key: 'cap', label: 'Stack cap', kind: 'num' },
    { key: 'decayAll', label: 'Drop all on expiry', kind: 'bool' },
    { key: 'target', label: 'Affects', kind: 'choice', choices: ['rp', 'ds', 'toHit', 'critable'] },
    { key: 'value', label: 'Value per stack', kind: 'num' },
  ],
  debuffs: [
    { key: 'trigger', label: 'Trigger', kind: 'choice', choices: TRIGGERS },
    { key: 'chance', label: 'Chance %', kind: 'num' },
    { key: 'icd', label: 'ICD (s)', kind: 'num' },
    { key: 'stacks', label: 'Stacks applied', kind: 'num' },
    { key: 'cap', label: 'Stack cap', kind: 'num' },
    { key: 'decay', label: 'Decay interval (s)', kind: 'num' },
    { key: 'decayAll', label: 'Drop all on expiry', kind: 'bool' },
    {
      key: 'target', label: 'Affects', kind: 'choice',
      choices: ['vulnerability', 'PRR', 'MRR', 'fortification', 'AC', 'saves'],
    },
    { key: 'value', label: 'Value per stack', kind: 'num' },
    { key: 'tag', label: 'Applies to tag', kind: 'text' },
  ],
  specials: [
    { key: 'cd', label: 'Cooldown (s)', kind: 'num' },
    { key: 'displaced', label: 'Attacks displaced', kind: 'num' },
    { key: 'hits', label: 'Hits delivered', kind: 'num' },
    { key: 'pct', label: 'Bonus damage %', kind: 'num' },
    { key: 'toHit', label: 'Bonus to-hit', kind: 'num' },
    { key: 'dmg', label: 'Bonus damage', kind: 'num' },
    { key: 'threatMod', label: 'Threat range widen', kind: 'num' },
    { key: 'multMod', label: 'Crit multiplier bonus', kind: 'num' },
  ],
  cdbuffs: [
    { key: 'cd', label: 'Cooldown (s)', kind: 'num' },
    { key: 'dur', label: 'Duration (s)', kind: 'num' },
    { key: 'displaced', label: 'Attacks displaced', kind: 'num' },
    { key: 'target', label: 'Affects', kind: 'choice', choices: ['rp', 'ds', 'toHit', 'critable'] },
    { key: 'value', label: 'Value', kind: 'num' },
  ],
}

const LIST_LABELS: Record<ListKey, string> = {
  procs: 'Procs',
  dots: 'Damage over time',
  buffs: 'Self buffs',
  debuffs: 'Debuffs',
  specials: 'Special attacks',
  cdbuffs: 'Cooldown buffs',
}

/** Blank entry used by the "+ add" buttons. */
function blankEntry(key: ListKey, index: number): Record<string, unknown> {
  const o: Record<string, unknown> = { name: `${LIST_LABELS[key].replace(/s$/, '')} ${index + 1}` }
  for (const f of LIST_FIELDS[key]) {
    o[f.key] = f.kind === 'bool' ? false : f.kind === 'text' ? '' : f.kind === 'choice' ? f.choices![0] : 0
  }
  return o
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function DamageCalcPanel() {
  const { build } = useCharacter()

  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [allFeats, setAllFeats] = useState<Feat[]>([])
  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])
  const [allSelfBuffs, setAllSelfBuffs] = useState<OptionalBuff[]>([])
  const [allAugments, setAllAugments] = useState<Augment[]>([])
  const [allSetBonuses, setAllSetBonuses] = useState<SetBonus[]>([])
  const [allFiligreeBonuses, setAllFiligreeBonuses] = useState<FiligreeSetBonus[]>([])
  const [allFiligrees, setAllFiligrees] = useState<Filigree[]>([])
  const [gearItems, setGearItems] = useState<Record<string, Item>>({})
  const [allAttackRates, setAllAttackRates] = useState<AttackRate[]>([])
  const [allWeaponGroups, setAllWeaponGroups] = useState<WeaponGroupSpec[]>([])
  const [allItemBuffs, setAllItemBuffs] = useState<ItemBuffSpec[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats().then(setAllFeats)
    api.enhancements().then(setAllTrees)
    api.selfbuffs().then(setAllSelfBuffs)
    api.augments().then(setAllAugments)
    api.setbonuses().then(setAllSetBonuses)
    api.filigreeSetBonuses().then(setAllFiligreeBonuses)
    api.filigree().then(setAllFiligrees)
    api.attackRates().then(setAllAttackRates)
    api.weaponGroups().then(setAllWeaponGroups)
    api.itemBuffs().then(setAllItemBuffs).catch(() => setAllItemBuffs([]))
  }, [])

  useEffect(() => {
    const slots = Object.entries(build.gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        api.item(name).then(item => (item ? ([slot, item] as [string, Item]) : null)),
      ),
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [build.gear])

  const statsInput = useMemo(() => ({
    allClasses, allRaces, allFeats, allTrees, gearItems,
    allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
    allItemBuffs,
  }), [allClasses, allRaces, allFeats, allTrees, gearItems,
    allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees, allItemBuffs])
  const stats = useBuildStats(statsInput)

  // --- Auto-derived inputs -------------------------------------------------

  const auto = useMemo(() => {
    if (!stats.weapon) return null

    // Attack ability: the largest of the weapon's default and any
    // Weapon_AttackAbility markers, matching CombatPanel.
    const defaultAb = stats.weapon.attackModifier
    const candidates = new Set<string>([defaultAb])
    for (const key of stats.keys()) {
      const m = /^melee\.(attackAbility|damageAbility)\.(.+)$/.exec(key)
      if (m && stats.total(key) !== 0) candidates.add(m[2])
    }
    let ab = defaultAb
    for (const c of candidates) {
      if (stats.total(`ability.${c}`) > stats.total(`ability.${ab}`)) ab = c
    }
    const abilityScore = stats.total(`ability.${ab}`)
    const bab = Math.min(25, stats.total('bab'))

    // Granted feats count: a Dark Hunter is given Two Weapon Fighting at class
    // level 2 and Improved at 6 without ever training them.
    const twfTier = twoWeaponFightingTier(acquiredFeatNames(build, allClasses, allRaces))
    const twoHanded = stats.weapon.diceNum >= 2
    const isUnarmed = stats.weapon.name.toLowerCase().includes('handwrap') ||
      stats.weapon.slot === 'Handwraps'
    const style = pickCombatStyleName({
      twfTier, twoHanded, hasOffhand: !!build.gear['Weapon2'], isUnarmed,
    })
    const apm = lookupAttacksPerMinute(allAttackRates, style, bab) || 120

    return buildAutoDamage(
      stats, stats.weapon, abilityScore, bab, gearItems, allItemBuffs,
      { ranged: isRangedWeapon(stats.weapon.weaponType), attacksPerMinute: apm },
      allSetBonuses,
      Object.values(build.gear).filter(Boolean) as string[],
    )
  }, [stats, build, allClasses, allRaces, gearItems, allAttackRates, allItemBuffs, allSetBonuses])

  // --- Player overrides ----------------------------------------------------

  const [edits, setEdits] = useState<{ core: CoreParams; lists: SimLists } | null>(null)
  const [result, setResult] = useState<SimResult | null>(null)
  const [status, setStatus] = useState('')
  const [io, setIo] = useState('')
  const [tip, setTip] = useState<BreakdownTipState | null>(null)

  const core = edits?.core ?? auto?.core ?? null
  const lists = edits?.lists ?? auto?.lists ?? null

  /** Forks the auto image on first edit so build changes stop overwriting it. */
  const fork = (): { core: CoreParams; lists: SimLists } | null => {
    if (edits) return edits
    if (!auto) return null
    const copy = JSON.parse(JSON.stringify({ core: auto.core, lists: auto.lists }))
    return copy
  }

  const setCoreField = (key: keyof CoreParams, value: unknown): void => {
    const base = fork()
    if (!base) return
    setEdits({ ...base, core: { ...base.core, [key]: value } as CoreParams })
  }

  const setListField = (listKey: ListKey, index: number, field: string, value: unknown): void => {
    const base = fork()
    if (!base) return
    const arr = (base.lists[listKey] as unknown as Array<Record<string, unknown>>).slice()
    arr[index] = { ...arr[index], [field]: value }
    setEdits({ ...base, lists: { ...base.lists, [listKey]: arr } as SimLists })
  }

  const removeListEntry = (listKey: ListKey, index: number): void => {
    const base = fork()
    if (!base) return
    const arr = (base.lists[listKey] as unknown as Array<Record<string, unknown>>).slice()
    arr.splice(index, 1)
    setEdits({ ...base, lists: { ...base.lists, [listKey]: arr } as SimLists })
  }

  const addListEntry = (listKey: ListKey): void => {
    const base = fork()
    if (!base) return
    const arr = (base.lists[listKey] as unknown as Array<Record<string, unknown>>).slice()
    arr.push(blankEntry(listKey, arr.length))
    setEdits({ ...base, lists: { ...base.lists, [listKey]: arr } as SimLists })
  }

  const run = (seedOverride?: number): void => {
    if (!core || !lists) return
    setStatus('Running…')
    // Yield a frame so the status paints before the simulation blocks.
    setTimeout(() => {
      try {
        const p = seedOverride === undefined ? core : { ...core, seed: seedOverride }
        if (seedOverride !== undefined) setCoreField('seed', seedOverride)
        const r = simulateDamage(p, lists)
        setResult(r)
        setStatus(`${r.trials.toLocaleString()} trials · ${(r.atk / r.trials).toFixed(1)} attacks each`)
      } catch (e) {
        setStatus(`Failed: ${(e as Error).message}`)
      }
    }, 10)
  }

  const exportBuild = (): void => {
    if (!core || !lists) return
    setIo(JSON.stringify({ v: 1, core, lists }, null, 1))
  }

  const importBuild = (): void => {
    try {
      const o = JSON.parse(io) as { core?: CoreParams; lists?: SimLists }
      if (!o?.core || !o?.lists) throw new Error('no build data')
      setEdits({ core: o.core, lists: o.lists })
      setStatus('Loaded. Press Run to simulate.')
    } catch (e) {
      setStatus(`Could not load: ${(e as Error).message}`)
    }
  }

  if (!stats.weapon) {
    return <p className={styles.empty}>Equip a weapon to model encounter damage.</p>
  }
  if (!core || !lists || !auto) {
    return <p className={styles.empty}>Loading game data…</p>
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.card}>
        {SECTIONS.map(section => (
          <div key={section.title}>
            <h3 className={styles.sectionHead}>{section.title}</h3>
            {section.title === 'Critable bucket' && (
              <div className={styles.row}>
                <label>Weapon dice</label>
                <span className={styles.pair}>
                  <input
                    type="number" step="any" value={core.wCount}
                    onChange={e => setCoreField('wCount', Number(e.target.value) || 0)}
                  />
                  <span>d</span>
                  <input
                    type="number" step="any" value={core.wSides}
                    onChange={e => setCoreField('wSides', Number(e.target.value) || 0)}
                  />
                </span>
              </div>
            )}
            {section.fields.map(f => (
              <div className={styles.row} key={String(f.key)} title={f.title}>
                <label>{f.label}</label>
                {f.kind === 'bool' ? (
                  <input
                    type="checkbox" checked={Boolean(core[f.key])}
                    onChange={e => setCoreField(f.key, e.target.checked)}
                  />
                ) : f.kind === 'choice' ? (
                  <select
                    value={String(core[f.key])}
                    onChange={e => setCoreField(f.key, e.target.value)}
                  >
                    {f.choices!.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : f.kind === 'text' ? (
                  <input
                    type="text" value={String(core[f.key] ?? '')} placeholder="any"
                    onChange={e => setCoreField(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    type="number" step="any" value={Number(core[f.key])}
                    onChange={e => setCoreField(f.key, Number(e.target.value) || 0)}
                  />
                )}
              </div>
            ))}
          </div>
        ))}

        {(Object.keys(LIST_FIELDS) as ListKey[]).map(listKey => (
          <div key={listKey}>
            <h3 className={styles.sectionHead}>
              {LIST_LABELS[listKey]} ({lists[listKey].length})
            </h3>
            {(lists[listKey] as unknown as Array<Record<string, unknown>>).map((entry, i) => (
              <div className={styles.entry} key={`${listKey}-${i}`}>
                <div className={styles.entryHead}>
                  <input
                    value={String(entry.name ?? '')}
                    onChange={e => setListField(listKey, i, 'name', e.target.value)}
                  />
                  {entry.confidence === 'estimated' && (
                    <span className={`${styles.tag} ${styles.tagEstimated}`} title={String(entry.source ?? '')}>
                      est
                    </span>
                  )}
                  <button
                    className={styles.iconBtn} title="Remove"
                    onClick={() => removeListEntry(listKey, i)}
                  >
                    ×
                  </button>
                </div>
                {LIST_FIELDS[listKey].map(f => (
                  <div className={styles.field} key={f.key}>
                    <label>{f.label}</label>
                    {f.kind === 'bool' ? (
                      <input
                        type="checkbox" checked={Boolean(entry[f.key])}
                        onChange={e => setListField(listKey, i, f.key, e.target.checked)}
                      />
                    ) : f.kind === 'choice' ? (
                      <select
                        value={String(entry[f.key])}
                        onChange={e => setListField(listKey, i, f.key, e.target.value)}
                      >
                        {f.choices!.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : f.kind === 'text' ? (
                      <input
                        type="text" value={String(entry[f.key] ?? '')} placeholder="any"
                        onChange={e => setListField(listKey, i, f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        type="number" step="any" value={Number(entry[f.key] ?? 0)}
                        onChange={e => setListField(listKey, i, f.key, Number(e.target.value) || 0)}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <button className={styles.addBtn} onClick={() => addListEntry(listKey)}>+ add</button>
          </div>
        ))}

        <div className={styles.actions}>
          <button onClick={() => run()}>Run simulation</button>
        </div>
        <div className={styles.actions}>
          <button onClick={() => run(Math.floor(Math.random() * 1e6))}>New seed</button>
          <button
            onClick={() => { setEdits(null); setStatus('Resynced from build.') }}
            disabled={!edits}
            title="Discard manual edits and re-read every field from the current build"
          >
            Resync from build
          </button>
        </div>
        <div className={styles.status}>{status}</div>

        <h3 className={styles.sectionHead}>Save &amp; load</h3>
        <textarea
          className={styles.io} value={io} onChange={e => setIo(e.target.value)}
          placeholder="Press Export to write this setup here, or paste one in and press Load."
        />
        <div className={styles.actions}>
          <button onClick={exportBuild}>Export</button>
          <button onClick={importBuild}>Load</button>
        </div>
      </aside>

      <main>
        <div className={styles.card}>
          <h3 className={styles.sectionHead}>Encounter damage</h3>
          {result ? (
            <>
              <ResultStats result={result} onTip={setTip} onHide={() => setTip(null)} />
              <DamageHistogram result={result} />
            </>
          ) : (
            <p className={styles.empty}>Press “Run simulation” to model this build.</p>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.sectionHead}>
            What the calculator read from this build ({auto.audit.length})
          </h3>
          <AuditList audit={auto.audit} unmodelled={auto.unmodelled} />
        </div>

        {result && (
          <>
            <div className={styles.card}>
              <h3 className={styles.sectionHead}>Where the damage came from</h3>
              <p className={styles.hoverHint}>
                Hover Procs or Damage over time to see which item each share came from.
              </p>
              <BucketTable result={result} onTip={setTip} onHide={() => setTip(null)} />
            </div>
            <div className={styles.card}>
              <h3 className={styles.sectionHead}>Attack diagnostics</h3>
              <DiagnosticsTable result={result} />
            </div>
          </>
        )}

        <div className={styles.card}>
          <h3 className={styles.sectionHead}>Model notes</h3>
          <ModelNotes />
        </div>

        {tip && <BreakdownTip tip={tip} onHide={() => setTip(null)} openLeft />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result sub-views
// ---------------------------------------------------------------------------

function ResultStats({ result, onTip, onHide }: {
  result: SimResult
  onTip: (t: BreakdownTipState) => void
  onHide: () => void
}) {
  const { sorted, mean } = result
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]
  // Mean and DPS are the same distribution scaled by encounter length, so both
  // decompose the same way. Median and spread describe the shape of the
  // distribution rather than its sources, so they carry no breakdown.
  const cells: Array<{ key: string; value: string; sub: string; rows?: boolean }> = [
    { key: 'Mean damage', value: fmt(mean), sub: 'per encounter', rows: true },
    { key: 'DPS', value: fmt(mean / result.dur), sub: 'per second', rows: true },
    { key: 'Median', value: fmt(q(0.5)), sub: '' },
    { key: 'Spread', value: `${fmt(q(0.05))} – ${fmt(q(0.95))}`, sub: '5th–95th' },
  ]
  return (
    <div className={styles.statGrid}>
      {cells.map(c => (
        <div
          className={`${styles.stat} ${c.rows ? styles.statHoverable : ''}`}
          key={c.key}
          tabIndex={c.rows ? 0 : undefined}
          onMouseEnter={c.rows ? e => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onTip({
              label: c.key, display: c.value, rows: sourceShareRows(result),
              subtitle: 'Share of raw damage, before mitigation',
              x: r.right, y: r.top,
            })
          } : undefined}
          onFocus={c.rows ? e => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onTip({
              label: c.key, display: c.value, rows: sourceShareRows(result),
              subtitle: 'Share of raw damage, before mitigation',
              x: r.right, y: r.top,
            })
          } : undefined}
          onMouseLeave={c.rows ? onHide : undefined}
          onBlur={c.rows ? onHide : undefined}
        >
          <div className={styles.statKey}>{c.key}</div>
          <div className={styles.statValue}>{c.value}</div>
          {c.sub && <div className={styles.statSub}>{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function BucketTable({ result, onTip, onHide }: {
  result: SimResult
  onTip: (t: BreakdownTipState) => void
  onHide: () => void
}) {
  const b = result.buckets
  const total = Object.values(b).reduce((a, v) => a + v, 0) || 1
  // Procs and DoTs are the two categories that can hold several named effects,
  // so those are the two worth expanding into their sources on hover.
  const rows: Array<{ label: string; value: number; kind?: 'proc' | 'dot' }> = [
    { label: 'Critable bucket', value: b.critable },
    { label: 'Sneak dice', value: b.sneak },
    { label: 'Imbue', value: b.imbue },
    { label: 'Procs', value: b.proc, kind: 'proc' },
    { label: 'Damage over time', value: b.dot, kind: 'dot' },
  ]
  return (
    <table className={styles.table}>
      <tbody>
        {rows.map(r => {
          const pct = (r.value / total) * 100
          const show = (e: React.SyntheticEvent) => {
            if (!r.kind) return
            const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onTip({
              label: r.label,
              display: fmtPercentValue(pct),
              rows: bucketSourceRows(result, r.kind),
              subtitle: 'Share of raw damage within this category',
              x: box.right, y: box.top,
            })
          }
          return (
            <tr
              key={r.label}
              className={r.kind ? styles.hoverRow : ''}
              tabIndex={r.kind ? 0 : undefined}
              onMouseEnter={show}
              onFocus={show}
              onMouseLeave={r.kind ? onHide : undefined}
              onBlur={r.kind ? onHide : undefined}
            >
              <td>
                {r.label}
                <div className={styles.bar}><i style={{ width: `${pct.toFixed(1)}%` }} /></div>
              </td>
              <td>{fmtPercentValue(pct)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function DiagnosticsTable({ result: R }: { result: SimResult }) {
  const per = (n: number) => (n / R.trials).toFixed(1)
  const pct = (n: number, d: number) => (d ? `${(n / d * 100).toFixed(1)}%` : '—')
  const rows: Array<[string, string]> = [
    ['Hit chance from formula', `${(R.baseHitDie.p * 100).toFixed(0)}%  (miss on 1–${R.baseHitDie.miss})`],
    ['Attacks resolved per encounter', per(R.atk)],
    ['Hit rate', pct(R.hits, Math.max(1, R.atk))],
    ['Threats per encounter', per(R.threats)],
    ['Threats stopped by fortification', pct(R.fortStop, R.threats)],
    ['Threats failing confirmation', pct(R.confFail, R.threats)],
    ['Threats becoming crits', pct(R.crits, R.threats)],
    ['Crits from natural 20 (vorpal)', pct(R.nat20, R.crits)],
    ['Crit rate of all attacks', pct(R.crits, Math.max(1, R.atk))],
    ['Average vulnerability bonus', `+${R.vulnAvg.toFixed(1)}%`],
    ['Special attack uses per encounter', per(R.specialUses)],
    ['Coefficient of variation', `${(R.sd / Math.max(1e-9, R.mean) * 100).toFixed(1)}%`],
  ]
  return (
    <table className={styles.table}>
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
      </tbody>
    </table>
  )
}

function AuditList({ audit, unmodelled }: { audit: AuditEntry[]; unmodelled: string[] }) {
  if (audit.length === 0 && unmodelled.length === 0) {
    return (
      <p className={styles.empty}>
        No on-hit procs, damage-over-time effects, or debuffs were found on the equipped gear.
      </p>
    )
  }
  return (
    <>
      {audit.map((a, i) => (
        <div className={styles.auditRow} key={`${a.name}-${i}`}>
          <span className={`${styles.tag} ${styles.tagKind}`}>{a.kind}</span>
          <span className={`${styles.tag} ${a.confidence === 'exact' ? styles.tagExact : styles.tagEstimated}`}>
            {a.confidence}
          </span>
          <span className={styles.auditName}>{a.name}</span>
          <span className={styles.auditNote}>{a.note}</span>
          <span className={styles.auditSource}>{a.source}</span>
        </div>
      ))}
      {unmodelled.length > 0 && (
        <p className={`${styles.empty} ${styles.warn}`} style={{ marginTop: '0.6rem' }}>
          Not modelled — these effects mention damage but state no numbers the parser could read:{' '}
          {unmodelled.join(', ')}. Add them by hand in the Procs or Damage-over-time lists.
        </p>
      )}
    </>
  )
}

function ModelNotes() {
  const notes: string[] = [
    'Hit chance is <b>(AB + 10.5) / (AC × 2) + proficiency + precision</b>, rounded to the nearest 5% and clamped to 5–95% so a natural 1 always misses. Misses occupy the low faces, so threats always land on faces that hit.',
    'A natural 20 crits outright — vorpal skips both fortification and confirmation.',
    'Other threats subtract bypass from fortification, floored at zero, and roll d100 to demote. Survivors confirm on a die built with seeker added.',
    'The critable bucket is the [W] dice sum plus flat damage, crit-multiplied, then scaled by Melee/Ranged Power, doublestrike, and any special-attack percentage — all multiplicative.',
    'Fractional [W] rolls an extra independent set of dice and scales that roll only, so 5.8[1d2+3] is six rolls, not one stretched roll.',
    'Sneak dice scale at 150% Ranged Power. Procs never crit. Vulnerability multiplies last.',
    'Mitigation is <b>100/(100+PRR or MRR)</b>, and negative values amplify. Effective values floor at −80, so damage taken caps at 5×.',
    '<b>Where the numbers come from:</b> scalars are read off the same stat map the Breakdowns tab uses. Procs, DoTs, and debuffs come from each equipped item’s effect text, because DDO ships most of them as prose with no mechanical data behind it. Where the text states no numbers at all, they come from DDO wiki, which documents them from datamining and large-sample testing.',
    '<b>Exact vs estimated:</b> an <i>exact</i> entry has its dice and proc rate documented, either in the item text or on DDO wiki. “Dripping with Magma” reads only “a high chance to deal very strong fire damage over time” in game, but the wiki records it as 10d20 per stack, five stacks, five seconds, on a one-second cooldown — so it counts as exact. An <i>estimated</i> row is one where part of the figure is still inferred, such as a lower bound or a stated range; treat those as a starting point and correct them.',
    '<b>Effects with no published numbers</b> are listed as not modelled rather than guessed at. Overwhelming Incineration and Legendary Magma Surge are the notable ones — the wiki names them but publishes no damage figure. Add them by hand if you know the values.',
    '<b>Proficiency and precision</b> are flat percentage adders to hit chance with no DDO stat behind them; they exist because this model derives hit chance from an AB/AC ratio rather than a d20 target number. Proficiency seeds at 20% when you are proficient. Tune both to match observed hit rates.',
    '<b>Guards are excluded.</b> Effects that damage <i>your</i> attacker rather than your target never enter the totals, and ability damage (“3d6 Constitution damage”) is not hit-point damage and is dropped.',
    '<b>Saving throws are ignored.</b> An effect whose text says a successful save halves it is counted in full, so those rows read as an upper bound.',
    '<b>Editing:</b> changing any field forks the whole setup so later build changes stop overwriting it. “Resync from build” discards the fork.',
  ]
  return (
    <ul className={styles.notes}>
      {notes.map((n, i) => <li key={i} dangerouslySetInnerHTML={{ __html: n }} />)}
    </ul>
  )
}
