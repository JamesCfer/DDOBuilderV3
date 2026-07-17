// V2-parity attack-chain combat simulator.
//
// Mirrors the V2 per-swing rotation model spread across:
//   - DDOBuilder/AttackChain.{h,cpp}  — named ordered list of attack names
//   - DDOBuilder/Attack.{h,cpp}       — attack definition (cooldown vector,
//     execution time, ThisAttack / FollowOn bonus blocks, stack counting)
//   - DDOBuilder/AttackBonus.{h,cpp}  — per-attack bonus block fields
//   - DDOBuilder/AttackBuff.{h,cpp}   — timed buff applied to the chain
//   - DDOBuilder/DPSPane.cpp          — sequencing/timeline + DPS scoring
//
// Everything here is pure (no React, no fs) so it can be unit tested. Attack
// definitions are extracted from the same Feats.xml / *.tree.xml data the V2
// app ships (Feat::Attacks, EnhancementTreeItem::Attacks and
// EnhancementSelection::Attacks — see DPSPane.cpp:253-326 which walks exactly
// these three sources to build its available-attack image map).

import { parseAmount } from '../effectParser'

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/** V2 AttackBonus.h:22-34 — one <ThisAttack> or <FollowOn> bonus block. */
export interface AttackBonusSpec {
  /** Buff duration in seconds (FollowOn only), indexed by stacks-1. */
  duration: number[]
  /** Extra [W] weapon-dice multiples for this attack. */
  bonusW: number[]
  /** Flat to-hit bonus. */
  bonusAttackBonus: number[]
  /** Flat damage bonus. */
  bonusDamage: number[]
  /** Extra critical-threat-range faces. */
  bonusThreatRange: number[]
  /** Extra critical multiplier. */
  bonusCriticalMultiplier: number[]
  /** Percentage damage bonus (e.g. Cleave +20%). */
  bonusDamagePercent: number[]
  /** Attack-speed (alacrity) percentage bonus. */
  bonusAlacrity: number[]
  bonusMeleePower: number[]
  bonusRangedPower: number[]
  /** Target fortification loss percentage. */
  fortificationLoss: number[]
  /** Attack bluffs the target, enabling sneak attacks (Improved Feint). */
  allowSneakAttack: boolean
}

/** V2 Attack.h:30-37 — one <Attack> definition from the game data files. */
export interface AttackDef {
  name: string
  description: string
  icon: string
  /** Cooldown vector, indexed by stacks-1 (DPSPane.cpp:606). */
  cooldown?: number[]
  /** Seconds the special animation takes. Optional; see timeline rules. */
  executionTime?: number
  /** Bonuses applying to this swing only. */
  thisAttack?: AttackBonusSpec
  /** Buff applied after the swing, for `duration` seconds. */
  followOn?: AttackBonusSpec
}

/** An attack the build has trained, with its stack count (V2 Attack::Stacks). */
export interface AvailableAttack {
  def: AttackDef
  /** Number of times granted (= enhancement ranks). Min 1 when present. */
  stacks: number
}

// ---------------------------------------------------------------------------
// Parsing helpers (fast-xml-parser node shapes → AttackDef)
// ---------------------------------------------------------------------------

function vec(raw: unknown): number[] {
  return parseAmount(raw)
}

function str(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number') return String(raw)
  if (raw && typeof raw === 'object') {
    const t = (raw as Record<string, unknown>)['#text']
    if (t !== undefined) return str(t)
  }
  return ''
}

function parseBonusBlock(raw: unknown): AttackBonusSpec | undefined {
  if (raw === undefined || raw === null) return undefined
  // `<ThisAttack>` containing only comments parses to '' — V2 still treats it
  // as present (Basic Attack has an empty ThisAttack, Feats.xml:458-460).
  const node = (typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    duration: vec(node.Duration),
    bonusW: vec(node.BonusW),
    bonusAttackBonus: vec(node.BonusAttackBonus),
    // Kensei: Attack Boost uses <BonusAttack> (Fighter_Kensei.tree.xml:878);
    // fold it into the same to-hit/damage field the description states.
    bonusDamage: vec(node.BonusDamage).length ? vec(node.BonusDamage) : vec(node.BonusAttack),
    bonusThreatRange: vec(node.BonusThreatRange),
    bonusCriticalMultiplier: vec(node.BonusCriticalMultiplier),
    bonusDamagePercent: vec(node.BonusDamagePercent),
    bonusAlacrity: vec(node.BonusAlacrity),
    bonusMeleePower: vec(node.BonusMeleePower),
    bonusRangedPower: vec(node.BonusRangedPower),
    fortificationLoss: vec(node.FortificationLoss),
    allowSneakAttack: 'AllowSneakAttack' in node,
  }
}

/** Parses one raw `<Attack>` XML node (fast-xml-parser shape) to AttackDef. */
export function parseAttackDef(raw: unknown): AttackDef | null {
  if (!raw || typeof raw !== 'object') return null
  const node = raw as Record<string, unknown>
  const name = str(node.Name)
  if (!name) return null
  const cooldown = vec(node.Cooldown)
  const execution = vec(node.ExecutionTime)
  return {
    name,
    description: str(node.Description),
    icon: str(node.Icon),
    cooldown: cooldown.length ? cooldown : undefined,
    executionTime: execution.length ? execution[0] : undefined,
    thisAttack: parseBonusBlock(node.ThisAttack),
    followOn: parseBonusBlock(node.FollowOn),
  }
}

// ---------------------------------------------------------------------------
// Available-attack collection (V2 DPSPane::UpdateNewAttack / UpdateRevokeAttack)
// ---------------------------------------------------------------------------

interface RawAttackCarrier {
  Name?: unknown
  Acquire?: unknown
  Attack?: unknown
  Selector?: unknown
  EnhancementTreeItem?: unknown
}

function attacksOf(node: unknown): AttackDef[] {
  if (!node || typeof node !== 'object') return []
  const raw = (node as RawAttackCarrier).Attack
  if (raw === undefined) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list.map(parseAttackDef).filter((a): a is AttackDef => a !== null)
}

function addStacks(out: Map<string, AvailableAttack>, defs: AttackDef[], stacks: number) {
  for (const def of defs) {
    const existing = out.get(def.name)
    // V2 DPSPane.cpp:380-399 — same-named attack adds a stack, else new entry.
    if (existing) existing.stacks += stacks
    else out.set(def.name, { def, stacks })
  }
}

export interface CollectAvailableAttacksInput {
  /** Full feat catalogue (raw parsed Feats.xml entries). */
  allFeats: unknown[]
  /** Full enhancement-tree catalogue (raw parsed *.tree.xml entries). */
  allTrees: unknown[]
  /** Names of feats the build has trained (featChoices values). */
  trainedFeatNames: string[]
  /** treeName → itemName → ranks trained. */
  enhancementChoices: Record<string, Record<string, number>>
  /** treeName → itemName → chosen selection name. */
  enhancementSelections: Record<string, Record<string, string>>
}

/**
 * Collects the attacks the current build has access to, with stack counts.
 *
 * V2 calls Build::NotifyNewAttack per feat/enhancement training event
 * (Build.cpp:6546-6559) and the DPS pane accumulates stacks per attack name
 * (DPSPane.cpp:380-399). Feats with Acquire=Automatic (the "Attack" feat that
 * grants "Basic Attack", Feats.xml:441-461) are always trained.
 */
export function collectAvailableAttacks(input: CollectAvailableAttacksInput): AvailableAttack[] {
  const out = new Map<string, AvailableAttack>()
  const trained = new Map<string, number>()
  for (const n of input.trainedFeatNames) {
    if (n) trained.set(n, (trained.get(n) ?? 0) + 1)
  }
  for (const feat of input.allFeats) {
    const f = feat as RawAttackCarrier
    const fname = str(f.Name)
    const isAutomatic = str(f.Acquire) === 'Automatic'
    const count = isAutomatic ? 1 : trained.get(fname) ?? 0
    if (count > 0) addStacks(out, attacksOf(feat), count)
  }
  for (const tree of input.allTrees) {
    const t = tree as RawAttackCarrier
    const tname = str(t.Name)
    const choices = input.enhancementChoices[tname]
    if (!choices) continue
    const selections = input.enhancementSelections[tname] ?? {}
    const items = Array.isArray(t.EnhancementTreeItem) ? t.EnhancementTreeItem : []
    for (const item of items) {
      const it = item as RawAttackCarrier
      const itemName = str(it.Name)
      // Choices are keyed by InternalName (V2 imports, TreeGrid) with a
      // display-Name fallback for legacy saves.
      const internalName = str((it as Record<string, unknown>).InternalName as string | undefined)
      const ranks = (internalName ? choices[internalName] : undefined) ?? choices[itemName] ?? 0
      if (ranks <= 0) continue
      // Stacks = ranks trained: the Cooldown/Duration vectors are sized per
      // rank (e.g. Kensei Attack Boost size="3", Fighter_Kensei.tree.xml:875).
      addStacks(out, attacksOf(item), ranks)
      // Attack objects inside the chosen sub-selection (DPSPane.cpp:299-324).
      const selName = (internalName ? selections[internalName] : undefined) ?? selections[itemName]
      if (selName && it.Selector) {
        const selectors = Array.isArray(it.Selector) ? it.Selector : [it.Selector]
        for (const sel of selectors) {
          const subs = (sel as Record<string, unknown>).EnhancementSelection
          const subList = Array.isArray(subs) ? subs : subs ? [subs] : []
          for (const sub of subList) {
            if (str((sub as RawAttackCarrier).Name) === selName) {
              addStacks(out, attacksOf(sub), ranks)
            }
          }
        }
      }
    }
  }
  return [...out.values()]
}

/**
 * V2 DPSPane::FindAttack (DPSPane.cpp:636-647): chain entries that name an
 * attack not in the available list resolve to a "Not Found" dud.
 */
export const NOT_FOUND_ATTACK: AvailableAttack = {
  def: {
    name: 'Not Found',
    description: 'This Attack was not found',
    icon: 'Unknown',
  },
  stacks: 1,
}

export function findAttack(name: string, available: AvailableAttack[]): AvailableAttack {
  let found = NOT_FOUND_ATTACK
  for (const a of available) {
    if (a.def.name === name) found = a
  }
  return found
}

// ---------------------------------------------------------------------------
// Timed buffs (V2 AttackBuff.{h,cpp})
// ---------------------------------------------------------------------------

export interface ChainBuff {
  sourceAttack: string
  bonus: AttackBonusSpec
  stacks: number
  startTime: number
  duration: number
}

/** V2 AttackBuff::Expired (AttackBuff.cpp:18-22): strict `<` comparison. */
export function buffExpired(buff: ChainBuff, timePoint: number): boolean {
  return buff.startTime + buff.duration < timePoint
}

/** V2 DPSPane::DropTimedOutBuffs (DPSPane.cpp:1062-1078). */
export function dropTimedOutBuffs(buffs: ChainBuff[], timePoint: number): ChainBuff[] {
  return buffs.filter(b => !buffExpired(b, timePoint))
}

// ---------------------------------------------------------------------------
// Attack-style detection (V2 DPSPane::CalculateAttackChainDPS, 922-949)
// ---------------------------------------------------------------------------

export type AttackChainStyle =
  | 'Unknown' | 'TWF' | 'THF' | 'SWF' | 'Ranged' | 'Handwraps' | 'SwordAndBoard'

/** Maps V2 stance names to the AttackType enum (DPSPane.cpp:926-949). */
export function pickAttackChainStyle(activeStances: Iterable<string>): AttackChainStyle {
  const s = new Set(activeStances)
  if (s.has('Two Weapon Fighting')) return 'TWF'
  if (s.has('Two Handed Fighting')) return 'THF'
  if (s.has('Single Weapon Fighting')) return 'SWF'
  if (s.has('Ranged Combat')) return 'Ranged'
  if (s.has('Unarmed')) return 'Handwraps'
  if (s.has('Sword and Board')) return 'SwordAndBoard'
  return 'Unknown'
}

// ---------------------------------------------------------------------------
// Timeline (V2 DPSPane::PopulateAttackChain, 577-634)
// ---------------------------------------------------------------------------

/**
 * V2 DPSPane::SetBasicAttackCooldown (DPSPane.cpp:671-686): the Basic Attack
 * cooldown is 60 / attacksPerMinute. V2 hardcodes attacksPerMinute = 100
 * (marked TBD); callers may pass the real value from the AttackRates.xml table.
 */
export function basicAttackCooldown(attacksPerMinute = 100): number {
  return 60.0 / attacksPerMinute
}

export interface ChainTimelineEntry {
  name: string
  attack: AvailableAttack
  /** Cooldown()[stacks-1] when the attack defines one (DPSPane.cpp:604-608). */
  cooldown?: number
  /** Chain-relative time at which this attack starts. */
  timePoint: number
}

export interface ChainTimeline {
  entries: ChainTimelineEntry[]
  /** Total chain duration (V2's "Total Attack Chain Duration" row). */
  totalDuration: number
}

/** Indexes a per-stack vector the way V2 does: vector[stacks-1], clamped. */
function atStacks(v: number[] | undefined, stacks: number): number | undefined {
  if (!v || v.length === 0) return undefined
  return v[Math.min(Math.max(stacks, 1), v.length) - 1]
}

/**
 * Builds the chain timeline. Per V2 PopulateAttackChain (DPSPane.cpp:592-620):
 * each attack occupies its ExecutionTime when defined, otherwise the time of
 * one Basic Attack swing.
 */
export function buildChainTimeline(
  chainAttacks: string[],
  available: AvailableAttack[],
  attacksPerMinute = 100,
): ChainTimeline {
  const baCooldown = basicAttackCooldown(attacksPerMinute)
  const entries: ChainTimelineEntry[] = []
  let timePoint = 0
  for (const name of chainAttacks) {
    const attack = findAttack(name, available)
    entries.push({
      name,
      attack,
      cooldown: atStacks(attack.def.cooldown, attack.stacks),
      timePoint,
    })
    timePoint += attack.def.executionTime !== undefined ? attack.def.executionTime : baCooldown
  }
  return { entries, totalDuration: timePoint }
}

// ---------------------------------------------------------------------------
// V2-faithful DPS scoring
// ---------------------------------------------------------------------------

/**
 * V2 per-style attack evaluation. NOTE: all six style evaluators in V2 are
 * unimplemented stubs returning 0.0 (DPSPane.cpp:990-1060 — EvaluateTWF,
 * EvaluateTHF, EvaluateSWF, EvaluateRanged, EvaluateHandwraps,
 * EvaluateSwordAndBoard all `return dps = 0.0`), and AT_Unknown scores 0
 * (DPSPane.cpp:979). Kept verbatim so the parity surface is explicit.
 */
export function evaluateAttackV2(
  _style: AttackChainStyle,
  _attack: AvailableAttack,
  _buffs: ChainBuff[],
  _timePoint: number,
): number {
  return 0.0
}

export interface ChainDPSEntry extends ChainTimelineEntry {
  /** Per-attack DPS score (V2 CI_DPSScore column). */
  dpsScore: number
}

export interface ChainDPSResult {
  entries: ChainDPSEntry[]
  totalDuration: number
  /** Sum of per-attack scores (V2 totalDPS, DPSPane.cpp:917-965). */
  totalDPS: number
}

/**
 * V2 DPSPane::CalculateAttackChainDPS (DPSPane.cpp:911-968), faithfully:
 * walk the chain, score each attack via the style evaluator, accumulate
 * timed buffs and drop expired ones. NOTE the V2 DPS loop advances timePoint
 * by ExecutionTime() unconditionally (DPSPane.cpp:960) — i.e. by 0 for
 * attacks without one — unlike the timeline loop; mirrored here.
 *
 * `evaluate` defaults to the V2 stub (all zeros); the UI passes
 * `estimateAttackSwing`-based scoring instead (V3 extension).
 */
export function computeChainDPS(
  chainAttacks: string[],
  available: AvailableAttack[],
  style: AttackChainStyle,
  attacksPerMinute = 100,
  evaluate: (
    style: AttackChainStyle,
    attack: AvailableAttack,
    buffs: ChainBuff[],
    timePoint: number,
  ) => number = evaluateAttackV2,
): ChainDPSResult {
  const timeline = buildChainTimeline(chainAttacks, available, attacksPerMinute)
  let buffs: ChainBuff[] = []
  let timePoint = 0
  let totalDPS = 0
  const entries: ChainDPSEntry[] = []
  for (let i = 0; i < timeline.entries.length; i++) {
    const te = timeline.entries[i]
    const dpsScore = evaluate(style, te.attack, buffs, timePoint)
    totalDPS += dpsScore
    // FollowOn block with a Duration starts a timed buff at this point.
    const fo = te.attack.def.followOn
    const foDuration = fo ? atStacks(fo.duration, te.attack.stacks) : undefined
    if (fo && foDuration !== undefined && foDuration > 0) {
      buffs.push({
        sourceAttack: te.attack.def.name,
        bonus: fo,
        stacks: te.attack.stacks,
        startTime: timePoint,
        duration: foDuration,
      })
    }
    timePoint += te.attack.def.executionTime ?? 0
    buffs = dropTimedOutBuffs(buffs, timePoint)
    entries.push({ ...te, dpsScore })
  }
  return { entries, totalDuration: timeline.totalDuration, totalDPS }
}

// ---------------------------------------------------------------------------
// V3 extension: per-swing damage estimation
// ---------------------------------------------------------------------------
//
// V2's style evaluators were never implemented (see evaluateAttackV2 above),
// so for a usable display V3 scores each chain attack by adjusting the
// single-weapon expected-swing baseline (lib/combat/attackEntry.ts) with the
// attack's ThisAttack bonuses and any active FollowOn buffs. This is a V3
// extension, not a V2 port.

export interface SwingBaseline {
  /** Probability a baseline swing hits (attackEntry hitChance). */
  hitChance: number
  /** Expected non-crit damage of one baseline swing. */
  hitDamage: number
  /** Expected crit damage of one baseline confirmed crit. */
  critDamage: number
  /** Average roll of one [W] of the main-hand weapon. */
  weaponDieAvg: number
  /** Baseline threat faces on the d20 (e.g. 3 for 18-20). */
  threatFaces: number
  /** Baseline critical multiplier. */
  critMultiplier: number
}

/**
 * Expected damage of a single chain attack against the baseline swing.
 * ThisAttack adjustments:
 *   - BonusAttackBonus shifts hit chance by +n/20 (d20 faces), clamped 5-95%.
 *   - BonusThreatRange adds threat faces proportionally to crit chance.
 *   - BonusW adds W × avg([W]) to hit damage (and ×multiplier on crits).
 *   - BonusDamage adds flat damage; BonusDamagePercent scales the total.
 *   - BonusCriticalMultiplier adds hitDamage × n on crits.
 * Active FollowOn buffs apply their BonusDamage / BonusMeleePower /
 * BonusAttackBonus to the swing (alacrity is handled by the caller via the
 * timeline, since it shortens basic-swing time rather than adding damage).
 */
export function estimateAttackSwing(
  baseline: SwingBaseline,
  attack: AvailableAttack,
  buffs: ChainBuff[],
): number {
  const s = attack.stacks
  const ta = attack.def.thisAttack
  const get = (v: number[] | undefined) => (ta ? atStacks(v, s) ?? 0 : 0)

  let attackBonus = get(ta?.bonusAttackBonus)
  let flatDamage = get(ta?.bonusDamage)
  let meleePowerBonus = 0
  for (const b of buffs) {
    attackBonus += atStacks(b.bonus.bonusAttackBonus, b.stacks) ?? 0
    flatDamage += atStacks(b.bonus.bonusDamage, b.stacks) ?? 0
    meleePowerBonus += atStacks(b.bonus.bonusMeleePower, b.stacks) ?? 0
  }

  const hitChance = Math.min(0.95, Math.max(0.05, baseline.hitChance + attackBonus / 20))
  const extraFaces = get(ta?.bonusThreatRange)
  const threatFaces = Math.min(20, baseline.threatFaces + extraFaces)
  const critChance = Math.min(hitChance, (threatFaces / 20) * hitChance)

  const wBonus = get(ta?.bonusW) * baseline.weaponDieAvg
  const hitDamage = baseline.hitDamage + wBonus + flatDamage
  const critDamage =
    baseline.critDamage +
    wBonus * baseline.critMultiplier +
    flatDamage +
    baseline.hitDamage * get(ta?.bonusCriticalMultiplier)

  const pctScale = 1 + get(ta?.bonusDamagePercent) / 100
  const powerScale = 1 + meleePowerBonus / 100
  const expected = (hitChance - critChance) * hitDamage + critChance * critDamage
  return expected * pctScale * powerScale
}

export interface EstimateChainOptions {
  attacksPerMinute?: number
}

/**
 * Estimated whole-chain damage and DPS (V3 extension). Uses the V2 timeline
 * (buildChainTimeline) for sequencing/cooldowns and estimateAttackSwing for
 * per-attack damage; FollowOn BonusAlacrity shortens subsequent basic swings.
 * Chain DPS = total expected damage / total chain duration.
 */
export function estimateChainDamage(
  chainAttacks: string[],
  available: AvailableAttack[],
  baseline: SwingBaseline,
  opts: EstimateChainOptions = {},
): ChainDPSResult {
  const apm = opts.attacksPerMinute ?? 100
  const baCooldown = basicAttackCooldown(apm)
  let buffs: ChainBuff[] = []
  let timePoint = 0
  let totalDamage = 0
  const entries: ChainDPSEntry[] = []
  for (const name of chainAttacks) {
    const attack = findAttack(name, available)
    buffs = dropTimedOutBuffs(buffs, timePoint)
    const damage = estimateAttackSwing(baseline, attack, buffs)
    totalDamage += damage
    // Alacrity from active buffs speeds up basic swings.
    let alacrity = 0
    for (const b of buffs) alacrity += atStacks(b.bonus.bonusAlacrity, b.stacks) ?? 0
    const swingTime =
      attack.def.executionTime !== undefined
        ? attack.def.executionTime
        : baCooldown / (1 + alacrity / 100)
    entries.push({
      name,
      attack,
      cooldown: atStacks(attack.def.cooldown, attack.stacks),
      timePoint,
      dpsScore: damage,
    })
    // Start the FollowOn buff after the swing.
    const fo = attack.def.followOn
    const foDuration = fo ? atStacks(fo.duration, attack.stacks) : undefined
    if (fo && foDuration !== undefined && foDuration > 0) {
      buffs.push({
        sourceAttack: attack.def.name,
        bonus: fo,
        stacks: attack.stacks,
        startTime: timePoint,
        duration: foDuration,
      })
    }
    timePoint += swingTime
  }
  return {
    entries,
    totalDuration: timePoint,
    totalDPS: timePoint > 0 ? totalDamage / timePoint : 0,
  }
}

// ---------------------------------------------------------------------------
// Chain mutation helpers (V2 AttackChain.cpp:62-81)
// ---------------------------------------------------------------------------

/** V2 AttackChain::AddAttack — inserts at `insertLoc` (clamped). */
export function chainWithAttackAdded(
  attacks: string[],
  attackName: string,
  insertLoc: number,
): string[] {
  const next = [...attacks]
  const loc = Math.max(0, Math.min(insertLoc, next.length))
  next.splice(loc, 0, attackName)
  return next
}

/** V2 AttackChain::RemoveAttackAt. */
export function chainWithAttackRemoved(attacks: string[], loc: number): string[] {
  if (loc < 0 || loc >= attacks.length) return attacks
  const next = [...attacks]
  next.splice(loc, 1)
  return next
}

/** Move the attack at `loc` up/down one slot (V2 move up/down buttons). */
export function chainWithAttackMoved(attacks: string[], loc: number, delta: -1 | 1): string[] {
  const to = loc + delta
  if (loc < 0 || loc >= attacks.length || to < 0 || to >= attacks.length) return attacks
  const next = [...attacks]
  const [item] = next.splice(loc, 1)
  next.splice(to, 0, item)
  return next
}
