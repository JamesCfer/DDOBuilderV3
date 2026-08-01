// Core DDO types matching the XML data structure

export type Ability = 'Strength' | 'Dexterity' | 'Constitution' | 'Intelligence' | 'Wisdom' | 'Charisma'
export type SaveType = 'Strong' | 'Weak' | 'Type1' | 'Type2'
export type BonusType = 'Enhancement' | 'Competence' | 'Insight' | 'Morale' | 'Sacred' | 'Profane' | 'Luck' | 'Alchemical' | string

export interface AbilityScores {
  Strength: number
  Dexterity: number
  Constitution: number
  Intelligence: number
  Wisdom: number
  Charisma: number
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------
export interface Requirement {
  Type: string
  Item?: string | string[]
  Value?: number
}

export interface RequiresOneOf {
  Requirement: Requirement[]
}

export interface Requirements {
  Requirement?: Requirement | Requirement[]
  RequiresOneOf?: RequiresOneOf | RequiresOneOf[]
  RequiresNoneOf?: RequiresOneOf | RequiresOneOf[]
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
export interface Effect {
  Type: string
  Bonus?: string
  AType?: string
  Amount?: unknown           // number | string | { '#text': unknown } from XML
  Item?: string | string[]
  DisplayName?: string
  Requirements?: Requirements
  StackSource?: string
  ApplyAsItemEffect?: boolean | string  // <ApplyAsItemEffect/> parses as "" — check with flagSet()
  Rare?: boolean             // effect only applies when filigree slot is marked rare
  Cap?: unknown              // V2 Effect Cap() — clamps AbilityTotal/Index amounts
  Percent?: boolean | string    // V2 <Percent/> parses as "" — check with flagSet()
  Rank?: number              // V2 Effect Rank() — minimum enhancement rank required to fire
}

// ---------------------------------------------------------------------------
// Race
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// FeatSlot (used by both Race and Class)
// ---------------------------------------------------------------------------
export interface FeatSlot {
  Level: number
  FeatType: string
  FeatUpdateList?: string | string[]
}

export interface Race {
  Name: string
  ShortName?: string
  Description?: string
  StartingWorld?: string
  BuildPoints?: unknown
  IconicClass?: string
  SkillPoints?: number
  Strength?: number
  Dexterity?: number
  Constitution?: number
  Intelligence?: number
  Wisdom?: number
  Charisma?: number
  GrantedFeat?: string | string[]
  NotHeroic?: boolean
  NoPastLife?: boolean
  IsIconic?: boolean
  FeatSlot?: FeatSlot[]
  Feat?: unknown[]
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export interface AutomaticFeat {
  Level?: number
  Feats?: string | string[]
}

export interface DDOClass {
  Name: string
  Description?: string
  SmallIcon?: string
  LargeIcon?: string
  SkillPoints?: number
  HitPoints?: number
  ClassSkill?: string | string[]
  Alignment?: string | string[]
  Fortitude?: SaveType
  Reflex?: SaveType
  Will?: SaveType
  SpellPointsPerLevel?: string
  BAB?: string
  // V2 Class::ClassCastingStat: classes can list multiple casting stats (e.g.
  // FavoredSoul has CHA + WIS); the highest-mod ability is used.
  CastingStat?: Ability | Ability[]
  BaseClass?: string
  FeatSlot?: FeatSlot[]
  AutomaticFeats?: AutomaticFeat[]
  NotHeroic?: boolean
}

// ---------------------------------------------------------------------------
// Feat
// ---------------------------------------------------------------------------
/**
 * V2 ConditionalGroup (ConditionalGroup.h): a list of additional feat-selection
 * groups a feat is offered under when RequirementsToUse is met (Build.cpp:1528-1538).
 * XML element is <ConditionalGroup> with nested <Group> entries + <Requirements>.
 */
export interface ConditionalGroup {
  Group?: string | string[]
  Requirements?: Requirements
}

export interface Feat {
  Name: string
  Description?: string
  Icon?: string
  Group?: string | string[]
  /** V2 Feat::ConditionalGroups — extra Group memberships gated by Requirements. */
  ConditionalGroup?: ConditionalGroup
  Acquire?: string
  /** V2 Feat::Sphere — used to categorise epic past lives (Arcane / Divine / Martial / Primal). */
  Sphere?: string
  MaxTimesAcquire?: number
  Requirements?: Requirements
  Effect?: Effect | Effect[]
  /** V2 Feat::AutomaticAssignment — Requirements gating automatic (non-trained) acquisition. */
  AutomaticAcquisition?: Requirements
}

// ---------------------------------------------------------------------------
// Enhancement tree
// ---------------------------------------------------------------------------
export interface EnhancementSelection {
  Name: string
  Description?: string
  Icon?: string
  Cost?: number
  Effect?: Effect | Effect[]
}

export interface EnhancementTreeItem {
  Name: string
  InternalName?: string
  Description?: string
  Icon?: string
  XPosition?: number
  YPosition?: number
  CostPerRank?: string
  Ranks?: number
  MinSpent?: number
  ArrowRight?: boolean
  ArrowUp?: boolean
  Clickie?: boolean
  /** Tier-5 enhancement: only one selected destiny tree may train Tier-5s. */
  Tier5?: boolean
  Requirements?: Requirements
  Selector?: { EnhancementSelection: EnhancementSelection[] }[]
  Effect?: Effect | Effect[]
}

export interface EnhancementTree {
  Name: string
  Version?: number
  IsRacialTree?: boolean
  IsEpicDestiny?: boolean
  IsReaperTree?: boolean
  IsUniversalTree?: boolean
  Legacy?: boolean
  Background?: string
  Icon?: string
  Requirements?: Requirements
  EnhancementTreeItem?: EnhancementTreeItem[]
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------
export interface ItemBuff {
  Type: string
  Value1?: number
  /** V2 Buff::UpdatedEffects even/odd split: with BOTH values present,
   *  template effect[0] gets Value1, effect[1] gets Value2 (e.g. Deception
   *  "+12 to hit / +18 damage for sneak attacks"). */
  Value2?: number
  BonusType?: string
  Description1?: string
  Item?: string
  Percent?: boolean | string    // V2 <Percent/> parses as "" — check with flagSet()
}

export interface ItemAugment {
  Type: string
  /**
   * V2 `ItemAugment::ItemSpecificAugments` (ItemAugment.h) — some items (e.g.
   * "Gem of Many Facets") define their own per-slot augment options inline
   * instead of drawing from the global Augments catalogue. V2's
   * `GetSelectedAugment()` checks this list BEFORE falling back to
   * `FindAugmentByName` against the global catalogue.
   */
  Augment?: Augment | Augment[]
}

/**
 * V2 `SlotUpgrade` (SlotUpgrade.h) — a one-time, player-chosen upgrade that
 * lets an item grant one additional augment slot of a color the player
 * picks from `UpgradeType` (e.g. Chains.item: pick Blue/Colorless/Green/
 * Yellow). Once chosen, V2 appends a real `ItemAugment` of that type to the
 * item and discards the `SlotUpgrade` (ItemSelectDialog.cpp:847-881
 * `OnUpgradeSelect`).
 */
export interface SlotUpgrade {
  Type: string
  UpgradeType: string | string[]
}

export interface BaseDice {
  Number: number
  Sides: number
}

export interface Item {
  Name: string
  Icon?: string
  Description?: string
  DropLocation?: string
  MinLevel?: number
  AdventurePack?: string
  EquipmentSlot?: Record<string, boolean>
  Material?: string
  Buff?: ItemBuff | ItemBuff[]
  ItemAugment?: ItemAugment | ItemAugment[]
  SlotUpgrade?: SlotUpgrade | SlotUpgrade[]
  SetBonus?: string | string[]
  Requirements?: Requirements
  /** V2 `Item.h:100` presence-only flag — parses as `""`; check with `'MinorArtifact' in item`.
   *  At most one Minor Artifact may be equipped at a time (`EquippedGear::SetItem`). */
  MinorArtifact?: string
  // Weapon-specific
  Weapon?: string
  AttackModifier?: string | string[]
  DRBypass?: string | string[]
  WeaponDamage?: number
  BaseDice?: BaseDice
  CriticalMultiplier?: number
  CriticalThreatRange?: number
  // Armor-specific
  Armor?: string
  ArmorBonus?: number
  MaximumDexterityBonus?: number
  ArmorCheckPenalty?: number
  ArcaneSpellFailure?: number
  // Shield-specific
  ShieldBonus?: number
}

// ---------------------------------------------------------------------------
// Set Bonuses
// ---------------------------------------------------------------------------
export interface SetBonusBuff {
  EquippedCount: number
  Description?: string
  Effect?: Effect | Effect[]
}

export interface SetBonus {
  Type: string
  Icon?: string
  Buff?: SetBonusBuff | SetBonusBuff[]
}

// ---------------------------------------------------------------------------
// Stance
// ---------------------------------------------------------------------------
export interface Stance {
  Name: string
  Icon?: string
  Description?: string
  Group?: string
  AutoControlled?: boolean
  /** V2 IncompatibleStance — list of stance names mutually exclusive with this one. */
  IncompatibleStance?: string | string[]
  /** V2 Stance ActiveRequirements (<Requirements> on the stance definition) —
   *  evaluated at load; an active user stance failing them is revoked. */
  Requirements?: Requirements
}

// ---------------------------------------------------------------------------
// Augment type (from /api/augments)
// ---------------------------------------------------------------------------
export interface Augment {
  Name: string
  Description?: string
  MinLevel?: number
  Type: string | string[]
  Icon?: string
  Effect?: Effect | Effect[]
  /** Set-bonus names this augment grants (V2 Augment::SetBonus). */
  SetBonus?: string | string[]
  /**
   * V2 Augment::SuppressSetBonus (DL_FLAG): when present, this augment
   * suppresses the host item's NATIVE set bonuses (Item::HasSetBonus).
   * The XML flag parses to "" — treat presence as true.
   */
  SuppressSetBonus?: boolean | string
  /**
   * V2 Augment::ChooseLevel (DL_FLAG, parses to ""): the augment's value is
   * picked per item level from LevelValue. Used by gearset import matching.
   */
  ChooseLevel?: boolean | string
  /** V2 Augment::LevelValue — space-separated values, one per level. */
  LevelValue?: { '#text': string; size?: number } | string
  /**
   * V2 Augment::EnterValue (DL_FLAG, parses to ""): every effect's Amount is
   * REPLACED by the player-entered `ItemAugment::Value` (e.g. "Mythic Power
   * Boost" — the player enters their current Mythic Bonus rank). Distinct
   * from ChooseLevel (Build.cpp:4948-4990 `Build::ApplyAugment`).
   */
  EnterValue?: boolean | string
}

// ---------------------------------------------------------------------------
// Filigree
// ---------------------------------------------------------------------------
export interface FiligreeSetBuff {
  EquippedCount: number
  Description?: string
  Effect?: Effect | Effect[]
}

export interface FiligreeSetBonus {
  Type: string
  Icon?: string
  Buff?: FiligreeSetBuff | FiligreeSetBuff[]
}

export interface Filigree {
  Name: string
  Description?: string
  Icon?: string
  Menu?: string
  Effect?: Effect | Effect[]
  /** the set bonus type name this filigree belongs to */
  SetBonus?: string
}

/** A single filigree slot in the character build — tracks name and whether it is the rare variant */
export interface FiligreeSlot {
  name: string
  rare: boolean
}

// ---------------------------------------------------------------------------
// Optional (Self & Party) Buff
// ---------------------------------------------------------------------------
export interface OptionalBuff {
  Name: string
  Description?: string
  Icon?: string
  Effect?: Effect | Effect[]
}

// ---------------------------------------------------------------------------
// Guild Buff
// ---------------------------------------------------------------------------
export interface GuildBuff {
  Name: string
  Description?: string
  Level?: number  // minimum guild level to unlock this buff
}

// ---------------------------------------------------------------------------
// Patron / Favor
// ---------------------------------------------------------------------------
export interface Patron {
  Name: string
  FavorTiers?: unknown  // "75 150 400 700" with size attr
  AssociatedFavorFeat?: string
}

export interface Quest {
  Name: string
  Patron?: string
  AdventurePack?: string
  Favor?: number
  Levels?: unknown
  DoNotShow?: boolean
}

// ---------------------------------------------------------------------------
// Sentient Gem
// ---------------------------------------------------------------------------
export interface SentientGem {
  Name: string
  Icon?: string
  Description?: string
}

// ---------------------------------------------------------------------------
// Spells (V2 Spell.h parity — used for spell training, DC, CL, cost)
// ---------------------------------------------------------------------------
export interface SpellDC {
  Amount?: number               // base DC (defaults to 10 if omitted)
  CastingStatMod?: boolean      // add casting-stat ability mod + spell level
  ModAbility?: string | string[] // pick max() of these ability mods
  School?: string | string[]    // schools whose dc.<school> contributes
}

export interface SpellDamage {
  School?: string
  Amount?: unknown
  // Allow further fields without strict typing
  [k: string]: unknown
}

/**
 * Spell metadata as parsed from /api/spells. Mirrors V2 DDOBuilder/Spell.h:55-78.
 * Cost defaults to 5*spell-level when omitted. Level is a per-class map.
 */
export interface Spell {
  Name: string
  Icon?: string
  Description?: string
  School?: string | string[]
  Primer?: string                            // damage school for spell power
  Level?: Record<string, number>             // class name → spell level (1-9)
  Cost?: number                              // SP cost override
  Cooldown?: number
  MaxCasterLevel?: number
  // Metamagic flags (Spell.h:67-77 maps these to bool fields)
  Accelerate?: boolean
  Embolden?: boolean
  Empower?: boolean
  EmpowerHealing?: boolean
  Enlarge?: boolean
  EschewMaterials?: boolean
  Extend?: boolean
  Heighten?: boolean
  Intensify?: boolean
  Maximize?: boolean
  Quicken?: boolean
  // Effect lists
  Effect?: Effect | Effect[]
  SpellDC?: SpellDC | SpellDC[]
  SpellDamage?: SpellDamage | SpellDamage[]
}

// ---------------------------------------------------------------------------
// Character build (client-side state)
// ---------------------------------------------------------------------------
export type BuildClass = { name: string; levels: number }

export interface CharacterBuild {
  id: string
  name: string
  race: string
  alignment: string
  classes: [BuildClass, BuildClass, BuildClass]
  /**
   * Authoritative per-heroic-level class assignment (V2 Build::m_Levels parity).
   * Index i (0-based) is the class taken at character level i+1. Length is
   * `totalLevel`. Empty string entries mean "no class assigned" (the level is
   * counted in totalLevel but is awaiting selection). Older saves that lack
   * this field fall back to a deterministic flatten of `classes` in
   * declaration order via `getLevelClasses()`.
   */
  levelClasses?: string[]
  /** Heroic class levels total (max 20) */
  totalLevel: number
  /** Epic progression levels 21–30 (0–10) */
  epicLevels: number
  /** Legendary progression levels 31–34 (0–4) */
  legendaryLevels: number
  baseAbilities: AbilityScores
  abilityLevelUps: Partial<Record<4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40, Ability>>
  purchasedPoints: number
  featChoices: Record<string, string>
  /** skill name → ranks allocated (legacy total view) */
  skillRanks: Record<string, number>
  /**
   * V2 parity: per-character-level skill rank allocation. Outer key is
   * character level (1–20 heroic), inner key is skill name, value is the
   * number of trained levels allocated *at that character level*. The total
   * `skillRanks` is the sum across all character levels but storing the
   * per-level breakdown lets us enforce per-level rank caps and matches V2
   * Build::AdjustSkillSpend.
   */
  skillRanksByLevel?: Record<number, Record<string, number>>
  /** slot name → equipped item name */
  gear: Record<string, string>
  /** augment key (slot:augmentType:index) → augment name */
  augmentChoices: Record<string, string>
  /** ChooseLevel augments: augment key → SelectedLevelIndex (V2 ItemAugment). */
  augmentLevelChoices?: Record<string, number>
  /**
   * EnterValue augments: augment key → the player-entered `ItemAugment::Value`
   * (e.g. Mythic Power Boost's Mythic Bonus rank). V2 `Build::ApplyAugment`
   * replaces every effect's Amount with this value.
   */
  augmentValueChoices?: Record<string, number>
  /** V2 Life::SelfAndPartyBuffs — selected optional buffs (NOT stances). */
  selfBuffs?: string[]
  /**
   * V2 `SlotUpgrade` resolutions (D2): key (slot:slotUpgradeType:index,
   * where index is the SlotUpgrade's position in the item's `SlotUpgrade`
   * list) → the chosen `UpgradeType` color. Once set, the item gains an
   * additional augment slot of that color at `augmentChoices` index
   * `nativeAugmentCount + index` (see `lib/gearSlotUpgrades.ts`).
   */
  slotUpgradeChoices: Record<string, string>
  /** className|raceName → count of past lives */
  pastLives: Record<string, number>
  /**
   * past-life key → V2 <Type> string (HeroicPastLife / RacialPastLife /
   * EpicPastLife / IconicPastLife). Captured on V2 import so the exporter can
   * reproduce the exact Type instead of guessing from the name (F5).
   */
  pastLifeTypes?: Record<string, string>
  /** sentient weapon filigree slots (6 slots) */
  filigreeSlots: FiligreeSlot[]
  /** artifact filigree slots (up to 10) */
  artifactFiligreeSlots: FiligreeSlot[]
  /** epic destiny tree choices: treeName → itemName → ranks */
  destinyChoices: Record<string, Record<string, number>>
  /** epic destiny selector picks: treeName → itemName → chosen option */
  destinySelections: Record<string, Record<string, string>>
  /** reaper enhancement choices: treeName → itemName → ranks */
  reaperChoices: Record<string, Record<string, number>>
  reaperSelections?: Record<string, Record<string, string>>
  /** player's available Reaper Enhancement Points budget (persisted, like V2) */
  reaperAP: number
  /** which of the 3 selected destiny trees is the active (primary) destiny */
  activeEpicDestiny: string
  /** the 3 chosen destiny tree names (empty string = slot unused) */
  selectedDestinyTrees: [string, string, string]
  /** destiny tree names the character has unlocked in-game */
  unlockedDestinyTrees: string[]
  /** twists of fate: enhancement internal names from unlocked destiny trees (5 slots) */
  twistChoices: string[]
  /** ability → tome bonus (+1 to +7) */
  abilityTomes: Partial<Record<Ability, number>>
  /** skill name → tome bonus (+0 to +7) */
  skillTomes: Record<string, number>
  /** names of toggled-on self/party buffs */
  activeBuffs: string[]
  /** quest name → completed */
  completedQuests: Record<string, boolean>
  notes: string
  /**
   * Sentient gem state. V2 parity: per-build personality + per-gem augment slots.
   * Filigree slots themselves live on `filigreeSlots`. Legacy saves stored
   * `sentientGem` as a bare string; the migration in CharacterContext widens it
   * to this object shape automatically.
   */
  sentientGem: SentientGemState
  /** setName → slot → itemName */
  namedGearSets: Record<string, Record<string, string>>
  /** setName → augmentKey (slot:type:index) → augmentName; mirrors augmentChoices but per named gear set */
  namedGearAugments?: Record<string, Record<string, string>>
  /** setName → slotUpgradeKey (slot:upgradeType:index) → chosen color; mirrors slotUpgradeChoices but per named gear set */
  namedSlotUpgrades?: Record<string, Record<string, string>>
  activeGearSetName: string
  /** heroic enhancement choices: treeName → itemName → rank */
  enhancementChoices: Record<string, Record<string, number>>
  /** heroic enhancement selector choices: treeName → itemName → selected option name */
  enhancementSelections: Record<string, Record<string, string>>
  /** ordered list of pinned heroic enhancement tree names */
  enhancementPinned: string[]

  // ── V2 parity additions ────────────────────────────────────────────────────
  /** Slider name → current value (Effect_CreateSlider state). */
  sliderValues: Record<string, number>
  /** Class → spell level (1-9) → list of trained spell names. */
  trainedSpells: Record<string, Record<number, string[]>>
  /** Class → spell name → list of enabled metamagic names. */
  spellMetamagics: Record<string, Record<string, string[]>>
  /** Clickie key (slot:itemName:effectIndex) → remaining charges. */
  clickieCharges: Record<string, number>

  // ── Audit-fix additions (V2 system parity) ────────────────────────────────
  /** Guild level 0–200 (V2 Character::GuildLevel). */
  guildLevel: number
  /** Whether guild-level buffs are applied to the build (V2 Character::ApplyGuildBuffs). */
  applyGuildBuffs: boolean
  /**
   * Quest completion records keyed by quest name. Boolean is preserved for
   * back-compat; the new `questDifficulty` map records the difficulty tier
   * the quest was completed on (V2 CompletedQuest.h).
   */
  questDifficulty: Record<string, QuestDifficulty>
  /** SLA charge counters keyed by SLA name (V2 SLACharge effect). */
  slaCharges: Record<string, number>
  /**
   * Alternate-feat selections: slotKey → alternate-feat name. V2 stores this
   * on TrainedFeat to allow free in-game feat swap.
   */
  alternateFeats: Record<string, string>
  /**
   * Named attack chains for DPS sim (V2 AttackChain). Each chain is an
   * ordered list of attack-action names from `Attacks.xml` (modeled in V3 as
   * free-text labels for now; the Combat panel may consume these).
   */
  attackChains: Record<string, string[]>
  /** Name of the active attack chain (V2 Build::ActiveAttackChain). */
  activeAttackChain?: string
  /**
   * Build-level favor-reward feats (V2 Build::m_FavorFeats FeatsListObject,
   * Type="Favor"/"Granted"/…): House Deneith/Twelve/etc. favor rewards. Stored
   * as a flat name list; folded into the stat engine as granted feats.
   */
  favorFeats?: string[]
  /**
   * Per-gear-set ability snapshots for "what-if" gear swaps
   * (V2 EquippedGear::Snapshot*; setName → ability → value) plus the
   * `gearSetSnapshot` name (V2 Build::GearSetSnapshot). Round-trips only.
   */
  gearSetSnapshots?: Record<string, Partial<Record<Ability, number>>>
  /** Raw embedded gear item nodes from the V2 file (v3 slot → item XML).
   *  V2 keeps the embedded definition when the item name is NOT in the
   *  catalogue (Cannith crafted, leveled challenge items) — fallback data
   *  for stats when catalogue lookup fails. Not persisted by V3. */
  embeddedGearItems?: Record<string, unknown>
  /** Name of the gear set used as the ability snapshot baseline. */
  gearSetSnapshot?: string
}

export interface SentientGemState {
  name: string
  personality: string
  majorAugment: string
  minorAugment: string
}

/** Quest difficulty tiers — mirrors V2 CompletedQuest::Difficulty. */
export type QuestDifficulty =
  | 'Casual' | 'Normal' | 'Hard' | 'Elite' | 'Reaper1' | 'Reaper2' | 'Reaper3'
  | 'Reaper4' | 'Reaper5' | 'Reaper6' | 'Reaper7' | 'Reaper8' | 'Reaper9' | 'Reaper10'

// ---------------------------------------------------------------------------
// V2 Character → Life → Build hierarchy
// ---------------------------------------------------------------------------
export interface Life {
  id: string
  name: string
  race: string
  alignment: string
  abilityTomes: Partial<Record<Ability, number>>
  skillTomes: Record<string, number>
  selfBuffs: string[]
  specialFeats: string[]
  builds: CharacterBuild[]
}

export interface CharacterDocument {
  id: string
  name: string
  guildLevel: number
  applyGuildBuffs: boolean
  characterTomes: Partial<Record<Ability, number>>
  contentIDontOwn: string[]
  lives: Life[]
  activeLifeId: string
  activeBuildId: string
  /** Storage version. */
  _v?: 2
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export function emptyBuild(): CharacterBuild {
  return {
    id: generateId(),
    name: 'New Character',
    race: 'Human',
    alignment: 'True Neutral',
    classes: [
      { name: 'Fighter', levels: 20 },
      { name: '', levels: 0 },
      { name: '', levels: 0 },
    ],
    levelClasses: Array.from({ length: 20 }, () => 'Fighter'),
    totalLevel: 20,
    epicLevels: 10,
    legendaryLevels: 4,
    baseAbilities: { Strength: 8, Dexterity: 8, Constitution: 8, Intelligence: 8, Wisdom: 8, Charisma: 8 },
    abilityLevelUps: {},
    purchasedPoints: 0,
    featChoices: {},
    skillRanks: {},
    skillRanksByLevel: {},
    gear: {},
    augmentChoices: {},
    augmentLevelChoices: {},
    augmentValueChoices: {},
    selfBuffs: [],
    slotUpgradeChoices: {},
    pastLives: {},
    filigreeSlots: Array.from({ length: 6 }, () => ({ name: '', rare: false })),
    artifactFiligreeSlots: Array.from({ length: 10 }, () => ({ name: '', rare: false })),
    destinyChoices: {},
    destinySelections: {},
    reaperChoices: {},
    reaperSelections: {},
    reaperAP: 0,
    activeEpicDestiny: '',
    selectedDestinyTrees: ['', '', ''],
    unlockedDestinyTrees: [],
    twistChoices: ['', '', '', '', ''],
    abilityTomes: {},
    skillTomes: {},
    activeBuffs: [],
    completedQuests: {},
    notes: '',
    sentientGem: { name: '', personality: '', majorAugment: '', minorAugment: '' },
    namedGearSets: {},
    namedGearAugments: {},
    activeGearSetName: '',
    enhancementChoices: {},
    enhancementSelections: {},
    enhancementPinned: [],
    sliderValues: {},
    trainedSpells: {},
    spellMetamagics: {},
    clickieCharges: {},
    guildLevel: 0,
    applyGuildBuffs: false,
    questDifficulty: {},
    slaCharges: {},
    alternateFeats: {},
    pastLifeTypes: {},
    attackChains: {},
    activeAttackChain: '',
    favorFeats: [],
    gearSetSnapshots: {},
    gearSetSnapshot: '',
  }
}

/**
 * Wraps a legacy bare-string sentient-gem value into the modern object shape,
 * or returns the input unchanged if it's already an object.
 */
export function migrateSentientGem(raw: unknown): SentientGemState {
  if (raw && typeof raw === 'object' && 'name' in (raw as object)) {
    const o = raw as Partial<SentientGemState>
    return {
      name: o.name ?? '',
      personality: o.personality ?? '',
      majorAugment: o.majorAugment ?? '',
      minorAugment: o.minorAugment ?? '',
    }
  }
  if (typeof raw === 'string') {
    return { name: raw, personality: '', majorAugment: '', minorAugment: '' }
  }
  return { name: '', personality: '', majorAugment: '', minorAugment: '' }
}

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
}

export function pointBuyCost(score: number): number {
  return POINT_BUY_COSTS[score] ?? 0
}

export function totalPointsSpent(abilities: AbilityScores): number {
  return (Object.values(abilities) as number[]).reduce((sum, s) => sum + pointBuyCost(s), 0)
}
