# V3 ↔ V2 Parity TODO

Tracking the remaining gaps between the V2 MFC application (`DDOBuilder/`,
~244 `.cpp` files, ~100k lines C++) and the V3 React webapp
(`webapp/`, ~97 source files, ~17k lines TS). Updated as gaps close.

Status legend:
- ✅ Done
- 🟡 In progress / partial
- ❌ Not started
- ➖ Not applicable to a webapp port

When closing an item, move it under the **Done** section near the top with
the PR number, so this file doubles as a changelog.

---

## Done

| # | Area | PR |
|---|---|---|
| 1 | Per-level class progression (`build.levelClasses`, V2 `m_Levels`) | #53 |
| 24 | BonusTypes stacking rules driven by `BonusTypes.xml` — `initBonusTypes()` replaces hard-coded `EXCLUSIVE` set; `useStaticBundle` and CLI wire it at startup | #56 |
| 2 | Feat-slot prerequisite snapshot uses exact per-level state | #53 |
| 3 | Builder version line in sidebar | #53 |
| 4 | Shared `lib/requirements.ts` engine (FeatSlots + EnhancementTreePanel both use it) | #53 |
| 5 | Per-item enhancement Requirement checks | #53 |
| 6 | Epic / Legendary HP at half hit-die per level | #53 |
| 7 | CON-mod HP applied at total-character-level scope | #53 |
| 8 | Fate-point HP / SP @ L20+; negative-level HP / save penalty | #53 |
| 9 | StatsPanel BAB sums full per-class table | #53 |
| 10 | Skills first-level ×4 multiplier reads `levelClasses[0]` | #53 |
| 11 | Tome cap unified through `tomeCapAtLevel` (uses overall level) | #53 |
| 12 | AbilityLevelUps unlock through L40 (heroic + epic + legendary) | #53 |
| 13 | TomesPanel skill tomes go to +7 | #53 |
| 14 | Forum export: SpecialFeats / FeatSelectionsNoSkills / Bonuses sections | #53 |
| 15 | V2 `.DDOBuild` XML importer | #53 |
| 16 | Pure `computeBuildStats` (CLI-callable) | #53 |
| 17 | `scripts/v2DiffReport.ts` side-by-side diff CLI | #53 |
| 18 | Shared `dataLoaders.ts` module (server + CLI + tests share it) | #54 |
| 19 | Data-aware diff CLI (loads real XML catalogues) | #54 |
| 20 | Round-trip tests against `YingsMonk.DDOBuild` fixture | #54 |
| 21 | Per-character-level skill rank UI (Per Level grid view) | #55 |
| 22 | New XML loaders: AttackRates / BonusTypes / Challenges / ItemBuffs / ItemClickies | #55 |
| 23 | Challenges wired into Favor panel | #55 |
| 25 | Ki / Turn Undead / Song breakdowns — `BaseClassLevel`/`ClassLevel` AType uses `Amount[classLevel]` (array index) not `Amount[0]*classLevel`; Centered stance derived for cloth-armor Monk; Turn Undead base level from Cleric/Paladin class levels added to `turnUndead.levelBonus` and `turnUndead.diceBonus` | #57 |
| 26 | ExclusionGroup enforcement — `computeExclusionGroups()` derives group→claimant map from trained enhancements; `Exclusive` requirement type in `requirements.ts` now evaluates against that map (passes for owner or unclaimed group, fails for conflicts); conservative pass preserved when map is not provided | #62 |
| 27 | SaveBonusAbility ability substitution — `parseEffect` now correctly emits `save.{Fort\|Reflex\|Will}.ability.{Ability}` markers for feats like Force of Personality (CHA→Will) and Insightful Reflexes (INT→Reflex); `useBuildStats` Phase 2 picks the highest-modifier ability per save (V2 `LargestStatBonus()` parity) | #63 |
| 28 | Per-level cross-class skill .5-rank display — `lib/skillDisplay.ts` exports `perLevelRankDisplay`, `perLevelRankCap`, and `displayRankToTrained`; `PerLevelGrid` in `Skills.tsx` now shows 0.5-increment displayed ranks, correct `(N+3)/2` cap, and `step=0.5` inputs for cross-class skills (V2 BreakdownItemSkill parity) | #64 |
| 29 | SimpleGear forum export slot order + augments — `simpleGear` section now sorts slots in V2's canonical `Inventory_Arrows..Inventory_Weapon2` enum order and emits augment choices (type: name) per item slot, matching V2 `ForumExportDlg.cpp::ExportGear` | #65 |
| 30 | Spell DC multi-source stacking — `parseItemBuff` now handles `SchoolFocusNumber` (school-specific DC bonus, e.g. "+3 Insightful Enchantment DC") and `SpellFocusNumber` (universal DC bonus, e.g. "+1 Profane all DCs") item buff types; both were silently dropped (default: return []). DCPanel double-count removed: `spellFocusBonus` manual feat-name lookup eliminated; DC bonuses now come solely from `stats.total('dc.*')` (V2 `SpellDC.cpp:119-128` parity). | #66 |
| 31 | Caster level universal item bonuses — `computeCasterLevel` now adds `cl.All` and `computeMaxCasterLevel` now adds `maxCl.All`; equipment that grants "+N Caster Levels" with no class/school restriction (emits `cl.All` via `parseEffect`/`parseItemBuff`) was previously silently discarded (V2 `Spell.cpp:174-228` parity). | #67 |
| 32 | Eldritch blast dice scaling — `resolveBonus` now tracks `fromGear` on each `RawBonus` and applies "Highest Only" stacking only to gear contributions; feat/enhancement contributions always stack (V2 `BreakdownItem.cpp::m_effects` vs `m_itemEffects` parity). Auto-feats granted multiple times (e.g. `Warlock: Eldritch Blast Damage` ×5 at L4/8/12/16/20) and Pact Damage (×10) now correctly accumulate their full dice totals (6d8 + 10d6 at L20). | #68 |
| 33 | AlternateGearLayouts forum export — slots now sort in V2 canonical inventory order (not alphabetical); augments stored per named gear set in new `namedGearAugments` field and emitted per item slot matching V2 `ForumExportDlg.cpp::ExportGear`; V2 import populates `namedGearAugments` for each gear set; `SAVE_GEAR_SET`/`LOAD_GEAR_SET` context actions persist and restore augments with each named set. | #69 |
| 34 | AttackRates in Combat panel — `lib/combat/attackRate.ts` exports `lookupAttacksPerMinute` (scans backward through the sparse BAB table) and `pickCombatStyleName` (maps TWF/THF/SWF/Shield/Unarmed setup to V2 style strings); `CombatPanel` now fetches `/api/attack-rates` and passes `attacksPerRound = APM / 10` to `buildAttackEntry`, replacing the hardcoded default of 5. | #70 |
| 35 | Stance requirement evaluation against activeBuffs — `RequirementContext` gains an optional `activeBuffs?: string[]` field; the `Stance` case in `meetsSingleRequirement` now checks `ctx.activeBuffs.includes(item)` when the field is provided, and passes conservatively when it is absent (V2 `Requirement.cpp:1062-1072 EvaluateStance` parity). | #71 |
| 36 | Reaper XP required for n RAPs — `reaperXpRequired(n)` in `lib/v2Formulas.ts` implements V2 `ReaperEnhancementsPane.cpp:248-255` loop (sum of first n odd numbers = n²); `ReaperPanel` now shows "Requires Nk Reaper XP" next to RAPs spent, matching V2's panel title. | #72 |
| 37 | Player-toggled stances in effect-context stances — `buildStatMap` now merges `build.activeBuffs` into `ctxStances` so all 1 000+ enhancement effects gated on non-armor stances (Mountain Stance, Favored Weapon, Power Attack, Rage, Two Handed Fighting, Action Boost, …) correctly fire or not based on the player's current stance selection (V2 `Build::IsStanceActive` parity). | #73 |
| 38 | SLA list auto-derived from SpellLikeAbility effects — `parseEffect` now emits `sla.<spellName>` markers for `SpellLikeAbility` effects (feats, race grants, enhancements, augments); `BuildStats.slaList` exposes the sorted list of derived SLA names; forum export `slas` section now uses `stats.slaList` instead of the manual `build.slaCharges` fallback, matching V2 `CSLAControl`/`ForumExportDlg::AddSLAs` parity. | #74 |
| 39 | **V2 `.DDOBuild` exporter** — new `lib/v2Export.ts` `exportV2Build()` serialises a V3 build back to V2 `<DDOBuilderCharacterData>/<Character>/<Life>/<Build>` XML so builds edited in V3 can be re-opened in V2. Wired into `usePersistence` as an "Export .DDOBuild" button. Element-name fidelity per `Character.h`/`Life.h`/`Build.h` `*_PROPERTIES` macros (tomes, `AbilitySpend` reconstructed from scores via `POINT_BUY_COSTS`, per-level `LevelTraining` with `TrainedFeat`/`TrainedSkill`, `EnhancementName`/`Selection`/`Ranks`, `*_SelectedTrees`, `EquippedGear` with index-preserving augment padding). Before this, V3 could read V2 files but never write them. | this PR |
| 40 | **Genuine round-trip test** — `__tests__/v2RoundTripExport.test.ts` imports a real `.DDOBuild`, exports it, re-imports, and asserts every V3-modeled field survives (identity, classes, abilities, tomes, feats, per-level skills, enhancement/destiny/reaper spend, gear + augments + named sets, stances, notes, guild, past lives). The old `v2RoundTrip*` tests only imported + computed stats — they never re-serialised. | this PR |
| 41 | **`CompletedQuests` import node-bug fix** — V2 stores `<CompletedQuests>` on the `Build` node (`Build.h`), but `v2Import.ts` read it from the `Life` node, so quest completions never imported. Now reads from `buildNode`. | this PR |
| 42 | **AC dex cap includes `Effect_MaxDexBonus`** — V2 `BreakdownItemMDB` sums the armor's printed `MaximumDexterityBonus` AND every `Effect_MaxDexBonus` (armor-mastery enhancements, etc.) into one `Breakdown_MaxDexBonus->Total()`. V3 only used the printed item value, so enhancements that raise the dex-to-AC cap were ignored. Now adds the resolved `mdb` stat to the armor cap (no double-count — the printed field is not part of the `mdb` stat). | this PR |
| 43 | **N1 — AC percentage armor/shield bonuses + armor enchantment** — `Effect_ArmorACBonus`/`Effect_ACBonusShield` now route to dedicated `armorACPercent`/`shieldACPercent` stats; `useBuildStats` applies them as a **percentage** of (armor + armor-enchantment) / shield AC (`trunc()` per V2 `BreakdownItemAC.cpp:115-157`), gating the shield % on an equipped shield. Also folds the armor enchantment (`armor.enchantment`, previously a dangling unused stat) into AC — V2 registers `Effect_EnchantArmor` directly on the AC breakdown. Was: flat AC points + dropped enchantment. | this PR |
| 44 | **N2 (partial) — combat to-hit penalties** — `useBuildStats` now emits the −1/neg-level and armor-check-penalty to-hit penalties into `melee.attack`/`ranged.attack`; `attackEntry.ts` adds the −4 non-proficiency penalty and the per-hand Two Weapon Fighting penalty (−4 with TWF feat else −6 main / −10 off, +2 for a light off-hand or Oversized TWF), and the off-hand now rolls against its own (larger-penalty) attack bonus. `CombatPanel` wires the off-hand weapon, light-weapon detection (weapon groups) and Oversized TWF. Matches V2 `BreakdownItemWeaponAttackBonus.cpp:70-191`. Remaining: weapon-proficiency *detection* (the `nonProficient` flag is plumbed but `CombatPanel` assumes proficiency — needs the proficiency-group engine). | this PR |
| 45 | **N4 — FvS/Sorcerer SP multiplier scope** — the `1 + (FvS+Sorc)/min(level,20)` multiplier now applies **only to gear-sourced** spell points (`fromGear` SP), matching V2 `BreakdownItem::Total` which calls `SumItems(m_itemEffects, /*bApplyMultiplier*/ true)` while class/casting-ability/feat SP use `false`. The Sorc/FvS class SP tables are already larger than Wizard/Cleric (base doubling baked into the data). V3 had been multiplying the whole subtotal, over-counting class + ability SP. | this PR |
| 46 | **N3 — corrected, not a bug** — re-reading `BreakdownItem::Total` (line 207, `SumItems(m_effects, false)`) shows V2 applies `RemoveNonStacking` **only** to `m_itemEffects` (gear); feat/enhancement effects always stack. That is exactly V3's `fromGear` model, so V3's False Life handling already matches V2. The old "highest-only across ALL sources" claim misread the C++; no change made. | this PR |
| 47 | **BAB override** — `BreakdownItemBAB.cpp:43-55`: an `OverrideBAB` effect boosts BAB up to the character level (capped at `MAX_BAB`=25). V3 parsed it into `babOverride` but never applied it; now folds the positive boost back into `bab`. | this PR |
| 48 | **Maximum Ki base** — `BreakdownItemMaximumKi.cpp:31-58`: Max Ki = base 40 + WIS mod × 5 (plus `KiMaximum` effects). V3 surfaced only the effect-sourced `ki.max`; now adds the base + WIS contribution. | this PR |
| 49 | **Ability-driven AType resolution** — `Effect.cpp:1316-1416`: `AbilityValue`/`AbilityTotal`/`AbilityTotalIndex`/`AbilityMod`/`HalfAbilityMod`/`ThirdAbilityMod` read the ability from `StackSource` (e.g. `SnapshotCharisma`), **not** `Item` (which holds the target list), and return the ability total/mod directly, ignoring `Amount`. V3 read `Item[0]` and multiplied by `Amount[0]`, so effects with no `Amount` + a `StackSource` ability resolved to 0. **Broad impact: 32 effects across the data used this pattern** — Monk **AC Bonus: Wisdom** (WIS→AC, class-inline feat), Sacred Fist **AC Bonus: Charisma**, Warpriest **Divine Might** (CHA mod/2 → tactical DCs + attack/damage), and many "stat-to-X" enhancements — all were silently 0. Now reads `StackSource` (strips `Snapshot`) and returns the value/mod. | this PR |
| 50 | **Percentage effects** (`<Percent/>`) — `BreakdownItem::DoPercentageEffects`: ~186 effects (86 Hitpoints, 63 ACBonus, 17 Weapon_Attack, 10 SpellPoints, …) tag their amount as a **percentage of the stat base total** (e.g. Frenzied Berserker +25% HP). V3 ignored the flag and added them flat. Now `ParsedBonus`/`RawBonus` carry a `percent` flag (set from `effect.Percent`/`buff.Percent`), and a post-pass in `buildStatMap` replaces each stat's percent markers with `trunc(base × Σpercent / 100)` (gear percents still obey Highest-Only via the `fromGear` split). | this PR |
| 51 | **Auto-acquired feat effects** (`Build::AutomaticFeats` via `<AutomaticAcquisition>`) — V2 grants some feats purely through the per-feat acquisition mechanism (not class `AutomaticFeats` / race `GrantedFeat`), so V3 never applied their **effects**: **Heroic Durability** (`SpecificLevel 1` → **+30 HP for every character** — universal HP under-count) and **Completionist / Racial Completionist** (`AbilityBonus Item="All"` +2 → +2 all abilities for fully past-lifed builds, which V3 listed for display but never applied). Added a targeted pass in `buildStatMap` that applies these (Attack and Defensive Fighting deliberately excluded — already modeled as hardcoded defaults / a stance). Also fixed `Item="All"` `AbilityBonus`/`AbilityScore`/`SkillBonus` to expand to all six abilities / all skills (were dead `ability.All`/`skill.All` keys). | this PR |
| 52 | **Universal combat base values from the "Attack" feat** — the universal `Attack` feat (no stance gating) grants base **+50% helpless damage** and **+20% strikethrough**. V3 parsed `HelplessDamage`/`Strikethrough` effects but had no base, so the combat estimator under-stated helpless and two-handed multi-target DPS. Added both as base contributions (Attack's base AC 10 / dodge cap 25 / shield PRR / damage multipliers remain modeled as hardcoded defaults, so only these two non-conflicting combat values were added). | this PR |
| 53 | **Gear-derived weapon / fighting-style stances** — V2's StancesPane auto-activates weapon-type and fighting-style stances from the equipped weapons (default ON when wielded). V3 treated all stances as player-toggled, so effects gated on **"Two Handed Fighting"** (43), **"Two Weapon Fighting"** (29), **"Single Weapon Fighting"** (19), the weapon type itself ("Quarterstaff", "Dwarven Axe", "Handwraps", …), or **"Shield"** (56) never fired unless manually toggled. `buildStatMap` now derives these from `gearItems` (main/off-hand weapon type, two-handed/one-handed via weapon groups, shield presence) and merges them into `ctxStances` alongside the player toggles. | this PR |
| 54 | **Section C file-compat F1–F5** — see the "File compatibility" section below; F1 (multi-life/multi-build document import + export), F3 (FavorFeats / TrainedSpells / AttackChains / GearSetSnapshot+Snapshot\*), F4 (ContentIDontOwn + Life SpecialFeats), F5 (past-life Type round-trip), F2 (gear-effect embedding seam) all closed. | this PR |
| 55 | **Reaper AP budget persisted (U3)** — `reaperAP: number` added to `CharacterBuild` and `emptyBuild()` (default 0); `SET_REAPER_AP` action added to the reducer; `migrateLoad` defaults old saves to 0; `ReaperPanel` slider now dispatches `SET_REAPER_AP` and reads `build.reaperAP` instead of local `useState`, so the budget survives page refresh like V2. | #75 |
| 56 | **Weapon proficiency detection (N2 complete)** — `buildRuntimeGroupAdds()` collects `AddGroupWeapon`/`MergeGroups` effects from all trained feats (player + auto + race grants) and enhancements into `RuntimeGroupAdd[]`; `BuildStats.isWeaponProficient(weaponType)` calls `deriveWeaponClasses(...).has('Proficiency')`; `CombatPanel` passes `nonProficient: !stats.isWeaponProficient(weaponType)` to `buildAttackEntry` so non-proficient characters take the V2 −4 to-hit penalty. Also improves `ctxWeaponClassMain`/`ctxWeaponClassOff` in `buildStatMap` with the runtime adds so weapon-class requirement gates are accurate for Kensei focus weapons, etc. (V2 `Build::IsWeaponInGroup("Proficiency")` / `BreakdownItemWeaponAttackBonus.cpp:70-79` parity). | this PR |
| 57 | **U4 — Spells known-per-level limit** — `knownSpellCount(cls, classLevel, spellLevel)` added to `lib/spells/spellMath.ts`; reads `Level${classLevel}` row on the DDOClass (the same `Level1`–`Level20` XML fields already used by `computeMaxSpellLevel`) and returns the slot count for the requested spell level, `Infinity` when no row exists (no cap). `SpellsPanel` now shows `(N/max trained)` per spell level and disables the train checkbox for untrained spells once the level is full, matching V2 `SpellsControl.cpp:425-433` / `SpellsPane.cpp:248` which renders exactly N spell slots per spell level. | this PR |
| 58 | **U2 — Twists of Fate editor** — `lib/twists.ts` exports `availableTwistItems(trees)` returning all non-Tier5 `EnhancementTreeItem`s from the provided epic destiny trees (Tier-5 abilities are exclusively bound to the active destiny and cannot be twisted, matching V2 `TwistsOfFateDlg`). `EpicDestiniesPanel` now renders a "Twists of Fate (up to 5)" section with 5 labeled dropdowns grouped by destiny tree; each dispatches `SET_TWIST_CHOICE` (already wired in the reducer) and persists to `build.twistChoices`. Forum export of twists was already complete (`sections.ts:268-270`). | this PR |
| 59 | **GrantFeat effects applied to build stats** — `parseEffect` now emits `grantedFeat.<FeatName>` markers for `GrantFeat` effects (gated by the optional `<Rank>` field on the effect — e.g. Bard Spellsinger "Magical Studies" rank 3 grants "Magical Training" only at rank ≥ 3); `parseItemBuff` emits the same markers for item-buff `GrantFeat` types; a new post-pass in `buildStatMap` collects all `grantedFeat.*` stat-map entries, looks up each feat in `allFeats`, and applies its effects via `accumulateFeat` (skipping feats already in `ctxFeats` to prevent double-counting). Impact: 143+ `GrantFeat` effects across enhancement trees + item buffs now apply their granted feats' stat contributions — e.g. Bard Spellsinger "Magical Studies" rank 3 correctly adds +80 SP and +5% spell crit from "Magical Training", Barbarian Frenzied Berserker grants "Diehard", Bard Swashbuckler grants "Evasion" and "Uncanny Dodge", etc. `Effect.Rank?: number` added to the `Effect` interface in `types/ddo.ts`. V2 source: `Build::ApplyFeatEffects` / `RevokeFeatEffects`. | this PR |
| 60 | **U5 (complete) — Granted Feats subsection in Automatic Feats panel** — `BuildStats` gains `grantedFeatsList: string[]` (parallel to `slaList`), populated from `grantedFeat.*` stat-map keys in both `computeBuildStats` and `useBuildStats`. `AutomaticFeats.tsx` now loads full stats data, calls `useBuildStats`, and renders a separate "Granted Feats" collapsible group below the race/class automatic feats when any effect-granted feats are active (e.g. Bard "Magical Training" from Spellsinger, Barbarian "Diehard" from Frenzied Berserker). Matches V2 `GrantedFeatsPane` parity. | this PR |
| 61 | **G1 — Real V2-golden comparison harness** — `lib/goldenCompare.ts` exports `compareAgainstGolden()` (diffs V3 stat totals against a `GoldenFile` JSON snapshot of V2 BreakdownsPane values), `captureTemplate()` (generates a template populated with V3's current values for user to fill in with V2 actuals), and `formatReport()` (terminal-formatted diff table). CLI `scripts/v2GoldenCompare.ts` wraps these: diff mode compares a `.DDOBuild` + `.golden.json` and exits 1 on mismatch; `--capture` mode writes a template next to the build file. `scripts/golden/README.md` documents the workflow and stat-key reference. Replaces the one-sided `v2DiffReport.ts` print-only tool — parity claims are now verifiable numbers, not self-referential assertions. | this PR |
| 62 | **U7 — Per-level training UI** — `lib/levelTraining.ts` exports `SlotEntry`, `buildSlots()` (extracted from `FeatSlots.tsx` so both the flat Feats panel and the new level panel share the same slot-construction logic), and `getLevelTrainingEntries()` (returns one `LevelTrainingEntry` per heroic level with class, feat slot keys + choices, skill-point budget, and skill ranks). `LevelTrainingPanel.tsx` renders each level as a collapsible card showing class, feat choices, and skills allocated — matching V2 `LevelTrainingPane`. Added "Level Training" to the Character sidebar group. 14 regression tests in `__tests__/levelTraining.test.ts` verify slot placement, multiclass shifting, skill-point computation, and per-level data grouping. | this PR |
| 63 | **N5 — Multi-Type effect expansion (hireling stat passthrough + broad)** — V2 data places multiple `<Type>` elements inside a single `<Effect>` block (e.g. `["PRR","MRR"]`, `["MeleePower","RangedPower"]`, `["DodgeBonus","DodgeCapBonus"]`, `["Doublestrike","Doubleshot"]`, `["HirelingPRR","HirelingMRR"]`). fast-xml-parser promotes duplicate child elements to an array, so `effect.Type` became `string[]`; `parseEffect`'s switch fell through every case and returned `[]` — **464+ effects in enhancement trees and 3 in GuildBuffs.xml were silently dropped**. Fixed: an array-type guard at the top of `parseEffect` fans out to one recursive call per type (V2's multi-type expansion parity). Regression tests in `__tests__/parityPassN5.test.ts` cover all common combinations. | this PR |
| 64 | **U9 (partial) — Find-Gear-by-effect dialog** — `lib/findGear.ts` exports `findGearByEffect(items, query)` (pure function; supports exact/partial buff-type match, min buff value, level range, name search; returns `FindGearResult[]` sorted by level then name). `FindGearDialog.tsx` is a cross-slot search modal (V2 `FindGearDialog` parity): loads all items on open, filters client-side, shows results in a table with item name / level / slot / matched effects / Equip buttons; ring items get two Equip buttons (Ring 1 / Ring 2). Wired into `GearPanel` via a "Find Gear by Effect…" button at the top of the Gear panel. 14 regression tests in `__tests__/findGear.test.ts` cover all filter combinations. | #76 |
| 65 | **U1 — Multi-life / multi-build document UI** — the running app now holds the full V2 Character → Life[] → Build[] document. `DocumentContext.tsx` stores the `CharacterDocument` beside the active-build reducer (active build edited in place, siblings stored — V2's model); pure transforms in `lib/multiLife.ts` (`emptyDocument`, `syncBuildIntoDocument`, `setActiveBuild`, `addLifeToDocument`, `addBuildToLife`, `deleteLifeFromDocument`, `deleteBuildFromDocument`, `renameLife`, `findActiveBuild`/`findActiveLife`); `LifeBuildBar.tsx` renders life + build tab rows in the sidebar (switch, add life, add build-snapshot, delete with last-one guards, double-click rename). Persistence rewritten to document storage (`ddo-builder-docs` localStorage key; legacy flat saves auto-migrate, one document per legacy build); Save/Load/Export JSON/Export .DDOBuild/Import all operate on whole documents, so importing a multi-build V2 file (Maetrim, 35 builds) **keeps every life/build** and exports them all back via `exportV2DocumentModel`. Also fixes a runtime crash: `SaveLoadBar`'s "Export .DDOBuild" button referenced `exportDDOBuild` out of scope (never returned from `usePersistence`) — clicking it threw `ReferenceError`; the client tsconfig (`tsconfig.client.json`) had flagged it but only the server tsconfig gates the build. 17 regression tests in `__tests__/parityPassU1.test.ts`. | #93 |
| 66 | **U6 + build migration + gearset import** — BuildCompare offers every build of the current document grouped per life (V2 simultaneously-active builds); `migrateDocument` runs every stored/imported build through `migrateLoad` (build-version migration); `lib/gearPlannerImport.ts` ports V2 `EquippedGear::ImportFromFile/ImportFromClipboard` (both text formats, first-fit augment placement incl. ChooseLevel value-match) with `GearImportDialog` UI; V2-faithful tests against the real `Example Gear PLanner Website Set.txt`. | #93 |
| 67 | **V2 Settings menu** — `SettingsContext` + `SettingsPanel`: Show only Epic feats for Epic feat slots (`Build.cpp:1539-1549`), Show Unavailable Feats (`Build::TrainableFeats:1455-1459`), Ignore Lists Active (+ `/api/ignored-list` from `IgnoredList.xml` with user add/remove), Auto Select Single Option Enhancements (`EnhancementTreeDialog::GetAutoSelection`); wired into FeatSlots + TreeGrid. Lamannia/DPI/theme are desktop-only (➖). | #93 |
| 68 | **ContentPane ownership filtering** — `/api/adventure-packs` (union of Quests+Challenges `<AdventurePack>`, `DDOBuilder.cpp:1193-1246`); `ContentPanel` per-pack toggles writing document-level `contentIDontOwn`; GearPanel pickers + FindGearDialog hide items from unowned packs (`ItemSelectDialog.cpp:312-318`). Gear-import dialog wired into GearPanel. | #93 |
| 69 | **Polish** — Ctrl+N/O/S accelerators, window drag-and-drop import, auto-save Settings toggle (debounced), print stylesheet, Help & About panel. E1 remainder verified not-a-gap: V2 `SLAControl` tracks no charges. | #93 |
| 70 | **Attack-chain combat simulator** — `lib/combat/attackChain.ts` ports the V2 model: Attack data from Feats.xml + tree items/selections (`DPSPane.cpp:253-326`), same-name stacking (`:380-419`), timeline with ExecutionTime / 60-per-APM basic swings (`:577-634`), strict buff expiry (`AttackBuff.cpp:18-22`), stance→style mapping, chain mutations (`AttackChain.cpp:62-81`); CombatPanel chain editor UI. **Key finding:** V2's six per-style DPS evaluators are stubs returning 0 (`DPSPane.cpp:990-1060`) — kept verbatim as `evaluateAttackV2` for parity; the UI's damage numbers use a clearly-marked V3 estimator built on the single-weapon baseline. `SET_ACTIVE_ATTACK_CHAIN` action added; `activeAttackChain` no longer dropped on rehydrate. 32 tests. | #93 |
| 71 | **Gear data edge cases** — Cosmetic slots: picker slot-name map fixed, `stripCosmeticSlots()` excludes their buffs/set-bonuses/augments from stats (V2 loops only to `Inventory_Count`, `Build.cpp:4824-4834`), and they round-trip `.DDOBuild`. Filigree conditional set-bonus tiers correctly gate on toggleable stances — Attack-feat user stances (Action Boost/Reaper/Blocking) now appear in the Stances panel; **fixed a real bug: filigree set bonuses never fired with real catalogue data** (`SetBonus` array used as a map key). Ring1/Ring2 verified. **Not-a-gap findings:** sentient-gem personalities carry no effects in V2 (`Gem.h:31-34`, zero `<Effect>` in Sentient.gems.xml); no trinket-via-augment mechanic exists in V2 (`Augment.h:35-56`). 18 tests. | #93 |
| 72 | **Fixed-point ability resolution** — closes the long-standing "known approximation": `buildStatMap` iterates with fully-resolved ability totals fed back into ability-mod ATypes and ability-gated Requirements (V2 BreakdownItem observer parity). | #93 |
| 73 | **V2-exact runtime gates** — `EnemyType` requirements are NEVER met in the planner (V2 `Requirement.cpp:467/:513` `met = false`; V3 had been over-applying all 229 favored-enemy-gated effects); `MaterialType` evaluates the equipped item's Material per V2 slot (`:1083-1100`); `Skill` compares the resolved skill total to Value (`:1040-1048`, via the fixed point). | #93 |
| 74 | **Gear Copy/Paste + Revert to Backup** — `exportGearSetXml`/`importGearSetXml` round-trip the V2 `<EquippedGear>` clipboard payload (`EquipmentPane::OnGearCopy/OnGearPaste`); SaveLoadBar Revert restores the pre-save version (one-deep backup, V2 .bak model). | #93 |
| 75 | **V1 `.ddocp` importer** — `lib/v1Import.ts` ports `CDDOBuilderApp::OnFileImport` + `ConvertToNewDataStructure` (`DDOBuilder.cpp:294-325, 1793-1949`): full Legacy* schema, ability-spend table, per-level LevelTraining replay, Tier5Tree folding, and ALL name-migration tables (4 trees, 30+ feats incl. cleric domains/Warlock pacts/archetype past lives, 6 filigrees, Legendary Green Steel items); auto-detected in Import by `.ddocp` extension or `DDOCharacterData` root. 33 tests against a schema-accurate fixture. | #93 |
| 76 | **FiligreePanel crash fix + app-wide render smoke harness** — `Filigree.SetBonus` parses as an ARRAY with real data; keying the set-bonus Map on it crashed the whole page (`a.localeCompare`) the moment any filigree was slotted. Fixed; `panelRenderSmoke.test.tsx` now mounts all 35 panels in jsdom with REAL catalogue data + the imported Maetrim build (fetch mocked to mirror server.ts), catching the whole "real XML shape crashes a page" class. | #93 |
| 77 | **V2-exact spell cost & max caster level** — `TotalCost` (Spell.cpp:354-448) ends after metamagic surcharges (SpellCostReduction is a display-only breakdown); `ActualMaxCasterLevel` (:199-228) has no class-level floor. V3's invented reductions/floor removed. | #93 |
| 78 | **Per-weapon-class effect family** (200+ effects) — WeaponAttackBonusClass / WeaponDamageBonusClass / *Critical* / Multiplier / Range / Alacrity / Enchantment(Class) / Weapon_BaseDamage / Weapon_(Attack\|Damage)Ability(+Class) all returned []. Now gated on the wielded weapon's classes (V2 Build::IsWeaponInGroup) and routed to the combat keys; CombatPanel picks the LARGEST candidate attack ability (V2 LargestStatBonus). Residual: ~20 damage-type-gated/Stat variants still unmodeled (tracked below as N6). | #93 |
| 79 | **Marker effects past the null-Amount guard** (260+ effects) — Immunity / DRBypass / GrantSpell / SpellListAddition (AType NotNeeded/SpellInfo) and SLACharge were silently dropped; now emit immunity.* / drBypass.<Value> / grantSpell.<Class>.<Spell> / slaCharge.* matching V2's consumers. End-to-end probe of all 8 301 data effects: drops 728 → 102 (≈30 documented residual + correctly-gated rest). | #93 |
| 82 | **L1 — Build history log (V2 `LogPane`)** — `lib/buildLog.ts` exports `actionToLogMessage` mapping key reducer action types to human-readable log strings; `BuildLogContext.tsx` wraps `CharacterProvider` dispatch to capture a session-only (non-persisted) `LogEntry[]`; `BuildHistoryPanel.tsx` renders entries in reverse-chronological order with Copy-to-Clipboard and Clear buttons (V2 `CLogPane::OnCopyLogToClipboard`/`OnClearLog` parity). Registered in Sidebar and Dashboard. 14 regression tests. | #101 |
| 81 | **N2 — Weapon damage-type-gated attack/damage effects** — `parseEffect` now handles `WeaponAttackBonusDamageType` → `melee.toHit`, `WeaponAttackBonusCriticalDamageType` → `melee.crit.toHit`, `WeaponDamageBonusDamageType` → `melee.damage`, `WeaponDamageBonusCriticalDamageType` → `melee.crit.damage`, and `WeaponKeenDamageType` → `weapon.keen` (value=1 "Improved Critical active" flag), all gated on `ctx.weaponClassMain`. The damage-type group names (Bludgeoning, Slashing, Piercing, Ranged) are regular weapon groups in `WeaponGroupings.xml` and are already present in `ctxWeaponClassMain` via `deriveWeaponClasses` — no new context field needed. Fixes ~30 silently-dropped effects: Fighter `Greater Weapon Focus` / `Superior Weapon Focus` feats (+1/+2 Feat to-hit for weapons of a damage type) and `Improved Critical` feats (keen flag for weapons of a damage type). V2 source: `BreakdownItemWeaponEffects.cpp:306-323`. | #100 |
| 80 | **N1 — `SkillBonusAbility` fan-out** — `expandSkillsByAbility()` added to `effectParser.ts`; both `parseEffect` and `parseItemBuff` `SkillBonusAbility` cases now fan out to actual `skill.<Name>` keys for all skills governed by the given ability (e.g. Charisma → Bluff/Diplomacy/Haggle/Intimidate/Perform/UMD), replacing the dead `skill.<Ability>.ability` keys. `Item="All"` expands to all 21 skills. Fixes ~68 silently-dropped occurrences: Bard Past Life (+1 CHA skills), Artificer Past Life (+1 INT skills), Greensteel augments (+2 Exceptional skill sets), Command/Persuasion item buffs. (V2 `BreakdownItemSkill` parity). | #99 |
| 83 | **X2 — Save sub-saves in forum export** — `sections.ts` `saves` section now emits 9 sub-save rows (vs Poison, vs Disease under Fort; vs Traps, vs Spell, vs Magic under Reflex; vs Enchantment, vs Illusion, vs Fear, vs Curse under Will) when the sub-bonus is non-zero. Total = `stats.total(baseKey) + stats.total(subKey)`, matching V2 `ForumExportDlg.cpp:514-524` and V3's own `BreakdownsPanel.tsx` sub-save formula. 5 regression tests in `parityPassX2.test.ts`. | #104 |
| 84 | **X3 — Energy absorbance in forum export** — `energyResistances` section now also emits indented `${t} Absorption: X.X%` rows for energy types with non-zero absorbance. Uses the same multiplicative stacking formula (`100 − Π((100−x)/100)·100`) as `BreakdownsPanel.tsx:400-404`, reading `stats.resolve('absorb.*').bonuses` and filtering to active-only contributions (V2 `ForumExportDlg.cpp:1183-1200` parity). 8 regression tests in `parityPassX3.test.ts`. | #105 |
| 85 | **X5 — Forum export `grantedFeats` section uses `stats.grantedFeatsList`** — `sections.ts:grantedFeats` now reads `stats?.grantedFeatsList` (parallel to how `slas` reads `stats?.slaList`) instead of the stale heuristic that filtered `build.featChoices` for keys starting with `"granted:"` (a pattern that never matched real slot keys). When stats are available, the section emits one indented line per granted feat name, matching V2 `ForumExportDlg.cpp:662-735 AddGrantedFeats`. 5 regression tests in `parityPassX5.test.ts`. | this PR |
| 86 | **X4 — Forum export `tacticalDCs` section fixed** — `sections.ts:tacticalDCs` was calling `stats.total('tacticalDC')` which is always 0 (parseEffect routes to `tacticalDC.All`/`tacticalDC.{Type}`, never the bare key). Now iterates all 13 V2 canonical tactical types from `TacticalTypes.h` (Assassinate, Trap, Trip, Stun, Sunder, StunningShield, General, Wands, Fear, InnateAttack, BreathWeapon, Poison, RuneArm), computes `total = tacticalDC.All + tacticalDC.{Type}`, and emits one row per non-zero type, matching V2 `ForumExportDlg.cpp:1735-1757`. 9 regression tests in `parityPassX4.test.ts`. | #108 |
| 87 | **U10 — BreakdownsPanel tactical DC sub-types complete** — `BreakdownsPanel.tsx` hardcoded only 4 tactical DC sub-type rows (Trip, Stun, Sunder, Assassinate); now dynamically renders all 13 V2 types from `TacticalTypes.h`, matching V2 `BreakdownsPane.cpp::AddTacticalItem` which registers all 13. Users can now see Fear (Warlock Tainted Scholar), InnateAttack (Dragonborn enhancements), and all other types. | #108 |
| 88 | **N6 — WeaponProficiencyClass grants class-based weapon proficiency** — `buildRuntimeGroupAdds()` now handles `WeaponProficiencyClass` effects (e.g. "Half-Elf Dilettante: Ranger" `<Item>Ranged</Item>`, Spells.xml "Master's Touch" `<Item>Simple</Item>`/`<Item>Martial</Item>`) by emitting a `RuntimeGroupMerge { baseGroup: 'Proficiency', mergedGroup: <className> }`. The existing `deriveWeaponClasses` transitive-merge logic then makes any weapon in the named static group (e.g. Longbow in Ranged) gain 'Proficiency' membership, so `isWeaponProficient('Longbow')` returns true. The other three types in the N6 stub — `WeaponOtherDamageBonus` (bane dice, EnemyType-gated, commented out in V2), `WeaponDamageBonusStat`/`WeaponDamageBonusCriticalStat` (Rogue Crippling Strike enemy STR drain, not a character damage bonus) — correctly return `[]` matching V2's own unhandled behavior. (V2 source: `BreakdownItemWeaponEffects.cpp:56/329-344`, `HalfElf.race.xml`, `Spells.xml`.) | this PR |
| 89 | **X6 — Missing alignment/physical spell power types in forum export** — `sections.ts:spellPowers` replaced hardcoded 13-type list with `SPELL_POWER_TYPES` from `gamedata.ts` (all 17 V2 types: Acid, LightAlignment, Chaos, Cold, Electric, Evil, Fire, Force, Lawful, Negative, Physical, Poison, Positive, Repair, Rust, Sonic, Untyped, plus Universal). Fixed wrong stat key `sp.crit.*` → `spCrit.*`; removed non-existent `sp.critMult.*`; uses `SPELL_POWER_LABELS` for display names (e.g. `LightAlignment` → `Light/Alignment`). Previously `Chaos`, `Evil`, `Lawful`, `Physical`, `Poison`, `Untyped` spell power bonuses (confirmed in Cleric Divine Disciple + Warlock Tainted Scholar trees) were silently absent from the forum export. `BreakdownsPanel.tsx` already used the full `SPELL_POWER_TYPES` list — no change needed there. V2 source: `BreakdownsPane.cpp:1764-1780`. | #109 |

### Known approximation — RESOLVED (#93)

`ctx.abilityTotals` previously used the *inherent* total (base + racial +
level-ups) for effect requirement gating and the ability-mod ATypes.
`buildStatMap` now iterates to a bounded fixed point: pass 1 resolves with
inherent totals, subsequent passes feed the fully-resolved ability totals
(tomes/gear/enhancements included) back into the EffectContext until stable —
matching V2's BreakdownItem observer propagation. Regression tests in
`parityPassFixedPoint.test.ts` (tome→mod, self-granted ability→mod feedback,
ability-gated requirement thresholds).

### BreakdownItem* suite review (this PR) — verified matching, no change needed

`Save` (class saves, divine-grace cap, half-elf lesser grace, neg-levels, ability
substitution), `PRR`/`MRR`/`MRRCap` (armor BAB×mult + caps), `Dodge` (dodge-cap +
armor/tower-shield MDB caps), `MDB`, `DR`, `SpellPower`/`UniversalSpellPower`
(universal added per element), `SpellPoints`, `CasterLevel`, `Ability`, `Skill`
(ranks + ability + tomes + armor/shield ACP + neg-levels), `DestinyAps`
(fate/3 + epic×4 + legendary×4), `TurnUndeadLevel`/`HitDice` (max Cleric/DA/Pal-3
+ CHA), `BAB` class-sum. Minor edge cases intentionally **not** changed (niche /
non-build): greater↔half-elf divine-grace mutual exclusivity, `Mixed Magics`
caster-level boost, `UniversalSpellPower` Implement-in-hands bonus, and off-hand
doublestrike derived from main-hand (combat-sim detail — V3's combat is a
documented simplified estimator).

---

## ⚠️ Methodology caveat (read before trusting "Done")

The `parityPass*` unit tests and `scripts/v2DiffReport.ts` assert V3's **own**
computed numbers — they are self-consistency checks, **not** golden values
captured from the running C++ app. `v2DiffReport.ts` prints a single V3 column,
not a V2-vs-V3 diff. So "verified via regression tests" means "stable and
internally consistent," not "byte-for-byte equal to V2." A real V2-golden
comparison harness (item **G1** above) is the highest-leverage way to make all
future parity claims trustworthy.

---

## File compatibility with V2 `.DDOBuild` files

The user's headline requirement: V3 must read **and write** V2 files and behave
like V2. Import + a build-skeleton exporter now exist (Done #15, #38–#41).
Remaining read/write-fidelity gaps:

- ✅ **F1 — Multi-life / multi-build import (DATA layer).** `importV2Document`
  (`v2Import.ts`) now imports EVERY `<Life>` and its EVERY `<Build>` into the
  `CharacterDocument` model, preserving `ActiveLifeIndex`/`ActiveBuildIndex`
  (verified against Maetrim's 35-build life, ActiveBuildIndex=34).
  `exportV2Document`/`exportV2DocumentModel` emit all of them. `importV2Build`
  still returns the active build (back-compat) and now also exposes the full
  `document`. The life-picker UI (**U1**) is done (#65) — `LifeBuildBar` sits
  on this data layer.
- ✅ **F2 — Gear-effect embedding in the exporter.** The exporters accept an
  optional `ItemCatalogue` (name → Item); when supplied, each equipped item's
  full V2 definition (Icon/Description/DropLocation/MinLevel, `<EquipmentSlot>`,
  `<Material>`, every `<Buff>`, `<SetBonus>`) is embedded inside
  `<EquippedGear>`, matching what V2 writes/trusts on load. `usePersistence.
  exportDDOBuild` accepts an optional catalogue as a clean seam — the app does
  not fetch the large `/api/items` list solely for export, so embedding is
  opt-in (pass items from a component that already loaded them).
- ✅ **F3 — Dropped Build fields.** `<FavorFeats>` (→ `build.favorFeats`),
  `<TrainedSpell>` (→ `build.trainedSpells`), `<AttackChain>`/
  `<ActiveAttackChain>` (→ `build.attackChains`/`activeAttackChain`), and
  `<GearSetSnapshot>` + per-set `<Snapshot{Ability}>` (→ `build.gearSetSnapshot`
  / `gearSetSnapshots`) all import + export + round-trip. **Note:** stance
  slider values are **NOT persisted by V2** — `Build::StanceSliderChanged` only
  notifies the runtime `StancesPane` (slider `m_position` lives in
  `StancesPane.h`, never in `Build_PROPERTIES`). So there is no `.DDOBuild`
  source for `build.sliderValues`; the field remains a V3-runtime stat input
  only (the F3 line above mis-described it as persisted).
- ✅ **F4 — `ContentIDontOwn` + Life-level `SpecialFeats`.** Character-level
  `<ContentIDontOwn>` (DL_STRING_LIST, `Character.h:114`) →
  `CharacterDocument.contentIDontOwn`; Life-level `<SpecialFeats>` beyond past
  lives (`Life.h:120`) → `Life.specialFeats`. Both round-trip via
  `exportV2Document`.
- ✅ **F5 — Past-life Type round-trip.** The importer captures each past-life
  feat's original V2 `<Type>` (`build.pastLifeTypes`) so the exporter
  reproduces HeroicPastLife/RacialPastLife/EpicPastLife/IconicPastLife exactly
  (Iconic vs Epic are otherwise name-ambiguous); falls back to name-based
  class/race inference for V3-authored builds.

---

## Previously-tracked items — all closed

Every item that used to live in the three "High-priority remaining" sections
(forum export, numerical correctness, effect parser coverage), the UI
features section (U1–U10), and the medium/low sections below is now ✅ or ➖
— see the **Done** table above (items 1–89) for details. This section is
replaced by the fresh gap list below, found during the 2026-07 (fourth pass)
full V2↔V3 re-scan.

---

## High-priority remaining — numerical correctness

All previously-tracked `Breakdown*.cpp` classes were re-verified as matching
(Hitpoints, EnergyAbsorption/Resistance, Immunities, SpellSchool,
SchoolCasterLevel, Tactical, Simple, Duration, Dice, PactDice,
WeaponVorpalRange, WeaponOtherDamageEffects, WeaponDRBypass). Three real gaps
found this pass, all in the weapon crit/attack-speed pipeline feeding the DPS
combat estimator:

- ❌ **N7 — Keen / Improved Critical doesn't widen crit threat range in the DPS
  calculator.** V2 (`BreakdownItemWeaponCriticalThreatRange.cpp:131-170`)
  doubles the weapon's base critical threat range once Keen or an
  Improved-Critical-for-this-damage-type bonus is present, and folds that
  into the attack math. V3's `effectParser.ts` emits a `weapon.keen` marker
  (value=1) but it is **display-only** (`BreakdownsPanel.tsx:503-504`) —
  `lib/combat/attackEntry.ts:109,157` computes `threatFaces` from
  `weapon.critThreatRange + baseCrit` and never reads `weapon.keen`. A Keen
  scimitar (15-20 threat) is estimated as if it still only threatens 18-20.
- ❌ **N8 — Non-class-gated `Weapon_CriticalMultiplier` / `Weapon_CriticalRange`
  effects are orphaned from DPS math.** V2's `BreakdownItemWeaponCriticalMultiplier`
  / `BreakdownItemWeaponCriticalThreatRange` (`:70-95`, `:52-75`) sum **both**
  the plain effect and the `*Class` (weapon-class-gated) variant into one
  total. V3's `effectParser.ts:1413-1418,1447-1452` splits them into separate
  stat keys — `weapon.critMultiplier`/`weapon.critRange` (plain, display-only)
  vs. `melee.crit.multiplier`/`melee.crit.range` (class-gated, read by
  `attackEntry.ts:109-110,165`). Live enhancement trees (`Fighter_Kensei`,
  `LegendaryDreadnought`, `Cleric_Warpriest`) use the non-class AType, so
  their crit bonuses show correctly in Breakdowns but silently don't affect
  estimated DPS.
- ❌ **N9 — Weapon Alacrity never applied to attacks-per-round in the DPS
  calculator.** `CombatPanel.tsx:125-127` derives `attacksPerRound` purely
  from the static `lookupAttacksPerMinute` table; no code path adds
  `weapon.alacrity`/`melee.alacrity` (parsed from `Weapon_Alacrity`/
  `WeaponAlacrityClass`, `effectParser.ts:1407-1408,1453-1455`, currently
  display-only in `BreakdownsPanel.tsx:501`) into the attack-speed rate. V2's
  `BreakdownItemWeaponAttackSpeed.cpp:42-66` folds Alacrity directly into the
  breakdown that scales swings/round. Common itemization (Alacrity gear,
  Haste-line twists) is entirely absent from estimated DPS.

Low-priority companion finding: `EnergyAbsorption`'s rare `<Percent/>`-tagged
bonuses use V2's additive-after-invert semantics
(`BreakdownItemEnergyAbsorption.cpp:86-97`) which `BreakdownsPanel.tsx:390-406`'s
pure-multiplicative loop doesn't replicate; likely no live data exercises
this path (flagged for completeness only, not tracked with a number).

---

## High-priority remaining — effect parser coverage

✅ **Verified complete this pass, no gaps.** All 213 V2 `EffectType` XML
values (`DDOBuilder/Effect.h` `effectTypeMap`) have a corresponding case in
`parseEffect` (`effectParser.ts:519-1564`). `parseItemBuff`
(`:1626-2412`) is functionally complete: its `default:` case falls back to
`parseItemBuffViaTemplate` against `ItemBuffs.xml`, so even the two nominal
misses (`DodgeBonusTowerShield`, `Strikethrough` as raw `<Buff><Type>` values)
resolve correctly — and in practice neither occurs as real ItemBuff data
(both only appear as nested `<Effect>` blocks, which already route through
`parseEffect`).

---

## Medium-priority remaining — UI features / subsystems

- ❌ **U11 — BonusesPane bonus-type breakdown matrix.** V2's `BonusesPane`
  (`DDOBuilder/BonusesPane.cpp:80-91`) shows a user-configurable table of
  monitored stats broken out by bonus *type* column (Enhancement/Insightful/
  Artifact/Quality/Profane/Equipment/Competence/Exceptional/Festive/Fortune/
  Legendary) with a right-click "Add Breakdown" menu (`:199-252`). V3's
  `components/bonuses/BonusesPanel.tsx` is a fixed summary (feats/buffs/gear/
  ability totals) with no per-bonus-type matrix and no user-configurable
  monitored-stat list.
- ❌ **U12 — Single enhancement/destiny tree save/load.** V2 lets a user
  export one trained tree's spend pattern to a standalone file and reload it
  into another build (`EnhancementsPane.cpp:932` `OnSaveTree`, `:1174`
  `OnLoadTree`; mirrored in `DestinyPane.cpp:984,1074`). No equivalent
  single-tree export/import exists in `components/enhancements/` or
  `components/epicdestinies/` — only whole-build export/import.

---

## Medium-priority remaining — data edge cases

- ❌ **D1 — Synthetic augment slots not derived (Mythic / Reaper / Deck
  Curse).** V2 programmatically adds a "Mythic" slot, a slot-type-specific
  "Reaper" slot, and a "Deck Curse" slot to every named item at runtime — none
  of this is in the raw `.item` XML. V2: `GlobalSupportFunctions.cpp:1881-1962`
  (`AddSpecialSlots`), called from `Build.cpp:4411/4420/4498`. V3:
  `server/dataLoaders.ts` parses items verbatim with no equivalent synthesis
  (zero hits for "Mythic"/"Reaper Boot"/"Deck Curse" in `webapp/src`).
  Affects nearly every named item (~8185 of 8487).
- ❌ **D2 — Item-specific augment choice lists shown as fixed text, not
  selectable.** 283 `<ItemAugment>` slots embed multiple item-specific
  `<Augment>` options that should be a picker (V2
  `GlobalSupportFunctions.cpp:2353-2359`, `CompatibleAugments`). V3's
  `components/items/GearPanel.tsx:227-233` treats `augment.Augment` as a
  single value, but since `Augment` is in `dataLoaders.ts:35`'s forced-array
  list it actually parses as an array — `.Name`/`.Description` read
  `undefined` for these slots.
- ❌ **D3 — Multi-`<Type>` augments unmatched by exact-string filter.** 539
  augments declare more than one compatible slot `<Type>` (V2:
  `Augment::IsCompatibleWithSlot`, `Augment.cpp:63-90`, list-based). V3:
  `webapp/server.ts:152-159` filters via `a['Type'] === type`; since
  fast-xml-parser turns repeated siblings into an array, `Type` becomes an
  array for these 539 augments and never strict-equals the query string, so
  they never appear in any slot's picker.
- ❌ **D4 — Cannith "user sets item level" (`UserSetsLevel`) unimplemented.**
  64 items let the player pick the item's effective/crafted level (V2:
  `Item.h:66`, `Build.cpp:4409-4451`, `FindGearDialog.cpp:176/1278`,
  `ItemSelectDialog.cpp:227/1432`). V3 has no `UserSetsLevel` field in
  `types/ddo.ts`/`dataLoaders.ts`; item level is always the catalogue's
  static `MinLevel`.
- ❌ **D5 — Minor Artifact single-equip restriction not enforced.** V2
  auto-unequips any other Minor Artifact when a new one is equipped
  (`EquippedGear.cpp:345-370`). V3 has no `MinorArtifact` handling in
  `GearPanel.tsx`/`useBuildStats.ts` — two can be equipped and stack.
- ❌ **D6 — `RestrictedSlots` / two-handed-blocks-off-hand not enforced.** V2
  blocks equipping an off-hand item when the main-hand weapon precludes it,
  and honors per-item `RestrictedSlots` (e.g. Platinum Knuckles).
  (`EquippedGear.cpp:281-310` `IsSlotRestricted`, `:371-381`). V3's
  `accumulateGear` in `useBuildStats.ts` sums every equipped slot
  unconditionally.
- ❌ **D7 — Skill-tome bonus not level-capped.** V2 caps applied skill-tome
  value by character level (2 base, +1 at 3/7/11/15/19/23/27/31), separately
  from the ability-tome cap V3 already ports (`Character.cpp:459-478`
  `SkillTomeValue`). V3's `useBuildStats.ts:1241-1244` applies
  `build.skillTomes[skill]` uncapped; `lib/levelProgression.ts`'s
  `tomeCapAtLevel` only covers ability tomes.
- ❌ **D8 — "Dark Bargainer" race rename missing from the `.DDOBuild` import
  path.** V2 migrates old saves in `Life::LoadComplete` (`Life.cpp:95-98`).
  V3 only handles this rename in the V1 `.ddocp` importer
  (`lib/v1Import.ts:114`); `lib/v2Import.ts` (`.DDOBuild` path) does no
  rename, so old V2 files with `Race=Dark Bargainer` silently lose racial
  data on import.
- ❌ **D9 — "FavoredWeapon" stance not gated by Favored Soul level.** V2
  special-cases this stance: even toggled on, it's forced inactive unless the
  character has at least half total levels in Favored Soul
  (`Build.cpp:3865-3876` `IsStanceActive`), gating Grace/Knowledge of Battle
  enhancement bonuses. V3's stance handling in `useBuildStats.ts` treats it
  as a plain toggle with no FvS-level check.

Confirmed **not** gaps this pass: item SetBonus stacking, `Improved Heroic
Durability` synthesis, Cannith `SelectedLevelIndex` migration (handled in
`v1Import.ts`), all `MAX_*` constants, and V2's `Build.cpp` has no additional
`UpdateVersion`/fixup logic worth porting.

---

## Low-priority remaining — forum export

`DDOBuilder/ForumExportDlg.cpp` vs `webapp/src/lib/export/sections.ts`,
section by section (beyond what X2/X3/X4/X5/X6 already fixed):

- ❌ **X7 — `CharacterHeader` missing the full defensive stat block.** V2
  exports Start/Tome/Final ability table, HP, Displacement%, Unc. Range,
  Incorporeality%, PRR, AC, MRR(+cap), Healing Amp ±, Dodge/Dodge Cap,
  Fortification%, Repair Amp, SR, BAB, DR list, Immunities list
  (`ForumExportDlg.cpp:312-392`). V3's `sections.ts:43-57` only has
  Name/Race/Alignment/Classes/Total Level.
- ❌ **X8 — `featSelections` missing per-level table context.** V2 is a
  per-level `[TABLE]` with Level/Class(level)/Feats columns, heart-of-wood
  swap warnings, and colored ability-level-up rows
  (`GetLevelEntries:1992-2126`, `AddFeatSelections:622-660`). V3's
  `featSelections` (`sections.ts:178-193`) is a flat `slot: value` dump.
- ❌ **X9 — `consolidatedFeats` is a different feature than V2's.** V2 merges
  the per-level trainable+automatic feat table with heart-of-wood/ability-up
  rows (`:736-845`). V3's `consolidatedFeats` (`sections.ts:461-477`) instead
  counts duplicate feat-name occurrences across the whole build.
- ❌ **X10 — `skills` section missing the per-level point/rank matrix.** V2
  renders a full per-heroic-level skill-point table (points available,
  ranks, cross-class ½-point notation, tome column, running total) inside a
  `[code]` block (`:890-1028`). V3's `skills` (`sections.ts:195-208`) only
  lists total ranks + buffed total per skill.
- ❌ **X11 — Enhancement/Destiny/Reaper tree sections missing AP totals and
  tier labels.** V2 headers show AP/Destiny-Point totals (with racial/
  universal-bonus callouts, `:1219-1232`) and each tree prints "TreeName -
  Points spent: N" plus per-enhancement Core#/Tier1-6 labels
  (`AddEnhancementTree`/`AddEpicDestinyTree`/`AddReaperTree:1309-1452`). V3's
  versions (`sections.ts:262-319`) omit all of this.
- ❌ **X12 — `spells` section missing school/CL/DC/damage columns.** V2's
  table has Level/Name/School/CL-MCL/DC/Average Damage/Critical Damage
  columns plus a separate fixed-spells list (`:1523-1646`). V3's `spells`
  (`sections.ts:339-358`) only lists spell names grouped by level.
- ❌ **X13 — `weaponDamage` section missing most V2 fields.** V2 exports
  Melee/Ranged Power, Doublestrike%, Strikethrough%, per-hand damage-ability
  multipliers, off-hand attack chance%, fortification/dodge-bypass%,
  helpless-damage%, doubleshot%, sneak-attack, and per-weapon-effect list
  (`:1681-1733`). V3's `weaponDamage` (`sections.ts:360-374`) only has name/
  dice/crit range/multiplier/to-hit/damage/doublestrike.
- ❌ **X14 — `gear` (full/non-simple) section is a stub.** V2's
  `ExportGear(bSimple=false)` (`:1759-1929`) includes buff descriptions,
  augment values, set-bonus lines with suppression strikethrough,
  artifact/weapon filigrees, sentient-weapon personality, drop locations, and
  restricted-slot notices in canonical slot order. V3's `gear` section
  (`sections.ts:408-420`, distinct from the already-fixed `simpleGear`) is
  alphabetically-sorted `slot: item` pairs only.
- ❌ **X15 — `saves` footnote + ordering.** V2 adds a footnote "Marked with
  a* is no fail on a 1 if required DC met" (`:527`) and orders Fort→Will→
  Reflex; V3 (`sections.ts:122-150`) has neither the footnote nor that order
  (Fort→Reflex→Will).
- ❌ **X16 — `energyResistances` type list mismatch.** V2 exports Acid/
  Chaos/Cold/Electric/Evil/Fire/Force/Good/Lawful/Light/Negative/Poison/
  Sonic (Positive/Repair/Rust explicitly excluded, `:1196-1198`). V3's list
  (`sections.ts:160`) has Positive/Repair instead but is missing Chaos/Evil/
  Good/Lawful.
- ❌ **X17 — `activeStances` collapses to one line.** V2 prints one line per
  active stance prefixed by its `StanceGroup` name (`:847-873`). V3
  (`sections.ts:210-224`) joins all active stances into a single comma list,
  losing group context.
- ❌ **X18 — Section order + extra `notes` section.** V2's default order ends
  `...Gear, AlternateGearLayouts, SimpleGear`; V3's `DEFAULT_SECTIONS`
  (`sections.ts:635-638`) ends `...gear, simpleGear, alternateGearLayouts,
  notes` — reordered, plus a `notes` section V2 doesn't have.

### Editor tools (intentionally out of parity scope)
- ➖ **Item / enhancement-tree / spell / race / class editors** — V3 reads V2's
  XML directly; not on the parity path.

---

## Methodology — how to close a parity gap

1. Pick an item from the list above (favour user-reported numerical
   mismatches).
2. Add a regression test: load `YingsMonk.DDOBuild` (or the user-supplied
   build) via `importV2Build`, run `computeBuildStats`, assert the
   expected V2-parity number.
3. Run the test → see it fail.
4. Fix the v3 implementation.
5. Run the test → see it pass.
6. Move the item to the **Done** table with the PR number.

The CLI helper for running V3 against a V2 build:

```sh
cd webapp
npx tsx scripts/v2DiffReport.ts ../Output/Example\ Builds/YingsMonk.DDOBuild
```

Open the same `.DDOBuild` file in V2 (Windows) and diff visually. **Note:**
`v2DiffReport.ts` currently prints only V3's own numbers — until item **G1**
lands, you must compare against V2 by eye. For file-format work, prefer the
round-trip guard `webapp/src/__tests__/v2RoundTripExport.test.ts`
(import → `exportV2Build` → re-import → field equality).

---

## Out-of-scope by design

These V2 features won't be ported because they don't make sense in a webapp:

- ➖ Native MFC dialogs (replaced by React UI)
- ➖ Windows registry settings (replaced by `localStorage`)
- ➖ DPI scaling (CSS handles this for free)
- ➖ Win32 file-association handlers
- ➖ Data-authoring editors (V3 is a player tool, not a content tool)

---

*Maintained by the parity-pass series. See PRs #53–#109 and the Done table
above for completed items. Last full V2↔V3 review: 2026-07 (fourth pass) —
re-scan of all `Breakdown*.cpp` classes vs. `useBuildStats.ts`/combat pipeline,
all 213 V2 `EffectType` values vs. `effectParser.ts` (found fully covered, no
gaps), all V2 Pane/Dialog classes vs. V3 components, all 24 V2 forum export
sections vs. `sections.ts`, and V2 data-loading/slot-handling logic vs.
`dataLoaders.ts`. New gaps found: N7–N9 (Keen/crit-multiplier/alacrity not
wired into the DPS calculator), U11–U12 (BonusesPane bonus-type matrix,
single-tree save/load), D1–D9 (synthetic augment slots, augment Type-array
matching, Cannith user-set item level, Minor Artifact/RestrictedSlots
enforcement, skill-tome level cap, Dark Bargainer rename, FavoredWeapon
stance gating), X7–X18 (CharacterHeader defensive block, per-level feat/skill
tables, tree AP totals, spell/weapon-damage/gear section richness, saves/
energy-resistance/stances formatting).*
