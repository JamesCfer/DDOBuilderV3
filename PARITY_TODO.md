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
| 90 | **N8 — `Weapon_CriticalMultiplier` routed to a dead stat key** — V2 (`BreakdownItemWeaponCriticalMultiplier.cpp:70-93`) sums the universal `Effect_Weapon_CriticalMultiplier` into the *same* total as the class-gated `WeaponCriticalMultiplierClass` sibling. `effectParser.ts`'s `parseEffect`/`parseItemBuff` routed the universal effect to `weapon.critMultiplier`, a key nothing reads (the combat estimator — `attackEntry.ts`/`CombatPanel.tsx` — only reads `melee.crit.multiplier`, which is what `WeaponCriticalMultiplierClass` already used). Now both route to `melee.crit.multiplier`, so universal crit-multiplier abilities like Aasimar "Scourge of the Undead: Destroyer of the Dead" actually apply. | this PR |
| 91 | **N7 — `Weapon_CriticalRange` routed to a dead stat key** — V2 (`BreakdownItemWeaponCriticalThreatRange.cpp:52-57`) sums the universal `Effect_Weapon_CriticalRange` into the *same* total as the class-gated `WeaponCriticalRangeClass` sibling. `effectParser.ts`'s `parseEffect`/`parseItemBuff` routed the universal effect to `weapon.critRange`, a key nothing reads (the combat estimator — `attackEntry.ts`/`CombatPanel.tsx` — only reads `melee.crit.range`, which is what `WeaponCriticalRangeClass` already used). Now both route to `melee.crit.range`, so universal threat-range abilities like Fighter Kensei "Keen Edge" actually apply. 3 regression tests in `parityPassN7.test.ts`. | this PR |
| 92 | **N9 — `Life.specialFeats` threaded into stats + AP budget** — Life-level `<SpecialFeats>` (V2 `Life::AllSpecialFeats`, e.g. universal-tree-access grants like "Falconry Tree") were imported into `Life.specialFeats` but only ever read by the exporters — never applied to any stat or the enhancement AP budget, since both `useBuildStats` and `actionPoints.ts` took only `CharacterBuild`, not the owning `Life`. (The separate Character-level `<SpecialFeats>` Chrism feats were already folded into `build.pastLives` by a prior pass and unaffected by this gap.) `BuildStatsInput.specialFeats?: string[]` (`useBuildStats.ts`) is now accumulated via `accumulateFeat` alongside past lives (repeated names count as rank, V2's Chrism re-redemption model); the `useBuildStats` hook defaults it from the active build's own `Life` via `findActiveLife(doc)`. `computeBonusActionPoints`/`enhancementAPBudget` (`actionPoints.ts`) gained an optional `specialFeats` parameter folded into the existing RAPBonus/UAPBonus scan; `EnhancementTreePanel` now passes it through. 5 regression tests in `parityPassN9.test.ts`. | #118 |
| 93 | **X8 — Forum export `saves` section: `[TABLE]` wrapping + no-fail-on-1 marker** — V2 `ForumExportDlg.cpp:509-528` (`AddSaves`) wraps every save/sub-save row in a BBCode `[TABLE]`/`[TR][TD]` block (Fort/Will/Reflex order) and `AddTableEntryBreakdown:548-564` appends a trailing `*` to any row whose `BreakdownItemSave::HasNoFailOn1()` is true, followed by a footnote line. `effectParser.ts` already parsed `Effect_SaveNoFailOn1` into `save.{Fort,Reflex,Will,All}.noFailOn1` stat keys, but nothing ever read them — `sections.ts:saves` emitted a plain indented list with no table and silently dropped the no-fail-on-1 information. `saves` now emits a `[TABLE]` (Fort/Will/Reflex order matching V2), reads `save.<Type>.noFailOn1` + `save.All.noFailOn1` to mark the base save and its sub-save rows with `*`, and appends the "Marked with a* is no fail on a 1 if required DC met" footnote. 5 regression tests in `parityPassX8.test.ts`; `parityPassX2.test.ts` updated for the new table-cell format. | #119 |
| 95 | **X7 — Forum export `characterHeader` vitals block** — `sections.ts:characterHeader` now emits V2's "vitals block" (`ForumExportDlg.cpp:312-392`) after the existing Name/Race/Classes lines: HP + Displacement, then one row per ability paired with its V2 combat stat (Str+Unconscious Range/Incorporeality, Dex+PRR/AC, Con+MRR(/cap)/+Healing Amp, Int+Dodge(/cap)/-Healing Amp, Wis+Fortification/Repair Amp, Cha+Spell Resistance/BAB), then trailing DR and Immunities lines (derived from `dr.*`/`immunity.*` stat keys, matching `BreakdownsPanel.tsx`'s existing convention for those two). Falls back to the pre-existing header-only lines when `stats` is null. 5 regression tests in `parityPassX7.test.ts`. | this PR |
| 94 | **X9 — Forum export `featSelections`/`featSelectionsNoSkills` become a per-level `[TABLE]`** — V2 `ForumExportDlg.cpp:622-660` (`AddFeatSelections`) + `GetLevelEntries` (`:1992+`) iterate every heroic character level and emit one `[TR]` with `Level | Class(classLevel) | Feats`, appending class/cross-class skill-rank rows only when `bIncludeSkills` is set. V3's `sections.ts` previously flattened `build.featChoices` into a sorted `key: value` list with no class-per-level context, and the "no skills" variant used an invented (and never-matching) `"Skill:"`-prefix filter instead of V2's real semantics. New shared `featSelectionsTable()` walks heroic levels 1..min(20,totalLevel) via `buildSlots()` (`lib/levelTraining.ts`) for that level's feat slots and `classLevelsAtLevel()` (`lib/levelProgression.ts`) for the `Class(N)` label, and appends `Class Skills:`/`Cross Class Skills:` rows (from `build.skillRanksByLevel`) only for the skills-included variant. 3 regression tests in `parityPassX9.test.ts`; `parityPass5.test.ts`'s outdated no-skills test updated to the corrected semantics. | this PR |
| 96 | **U11 — Special / Favor feat training UI** — `lib/specialFeats.ts` ports V2 `CFeatSelectionDialog::OnFeatButtonLeftClick`/`RightClick` (`FeatSelectionDialog.cpp:141-191`) train/revoke/cap logic as pure functions. Acquire=Special feats (Chrism reincarnation-cache redemptions, "Tome of Destiny", …) train/revoke against `build.pastLives` + `build.pastLifeTypes` (reuses the N9/F5 plumbing so exports round-trip with the correct V2 `<Type>`); Acquire=Favor feats (House favor rewards) train/revoke against `build.favorFeats` as a flat repeatable list (`Build::m_FavorFeats` parity — training appends a copy, revoke removes the first occurrence), both capped by `Feat::MaxTimesAcquire` (default 1). New reducer actions `TRAIN_SPECIAL_FEAT`/`REVOKE_SPECIAL_FEAT`/`TRAIN_FAVOR_FEAT`/`REVOKE_FAVOR_FEAT` in `CharacterContext.tsx`; `migrateLoad` now also defaults `favorFeats` for old saves. `PastLivesPanel.tsx` (V2's `CSpecialFeatPane` — the same pane the four past-life groups were already ported from) gained "Special Feats" and "Favor Feats" sections fetched via `/api/feats?acquire=Special`/`Favor`, reusing the existing +/− tile UI via new per-group `getCount`/`onIncrement`/`onDecrement`/`canIncrement`/`canDecrement` overrides. Previously these fields were import/export/compute-only — a build authored fresh in V3 could never acquire a Special or Favor feat. 8 regression tests in `parityPassU11.test.ts`. | this PR |
| 97 | **D1 — Legacy enhancement trees now filtered from the picker** — V2 `EnhancementsPane.cpp:332` hides any tree with the `<Legacy/>` flag (`EnhancementTree.h`) from the tree picker unless the build already has it trained; V3's `loadEnhancementTrees` never parsed the flag and the picker showed the legacy " Shintao V1"/"HenshinMystic v1"/"NinjaSpy v1" duplicates alongside the modern trees for every Monk build. `dataLoaders.ts` now normalizes `Legacy: 'Legacy' in tree ? true : undefined` (same pattern as `IsReaperTree`/etc.); `EnhancementTree` type gained a `Legacy?: boolean` field; `EnhancementTreePanel.tsx` exports a new pure `isLegacyTreeVisible(tree, pinned)` predicate (mirrors V2's `SupportLegacyTrees()` check, simplified to "already pinned" since V3 has no modal-dialog session state) wired into the `availableTrees` picker filter. Trees already pinned (e.g. from a V2 import that kept a legacy spend) remain visible and functional — only the *picker* hides unpicked legacy trees. 4 regression tests in `parityPassD1LegacyTrees.test.ts`. | this PR |
| 98 | **D2 — `<SlotUpgrade>` item augment-slot color upgrades** — V2 `Item.h:97`/`SlotUpgrade.h`/`.cpp` lets some items (Chains/Shackles/Five Rings + Legendary variants) grant a one-time player-chosen extra augment slot (`ItemSelectDialog.cpp:462-476` `EnableControls` + `:823-881` `PopulateSlotUpgradeList`/`OnUpgradeSelect`); V3's `Item` type had no `SlotUpgrade` field and `loadItems` did no post-processing, so the Gear panel could never surface the alternate colors. `dataLoaders.ts` adds `SlotUpgrade`/`UpgradeType` to the forced-array XML parser list; `types/ddo.ts` gains a `SlotUpgrade` type + `Item.SlotUpgrade` field and `CharacterBuild.slotUpgradeChoices`/`namedSlotUpgrades` (parallel to `augmentChoices`/`namedGearAugments`). New pure `lib/gearSlotUpgrades.ts` resolves an item's native augment slots plus one synthetic slot per chosen color, appended at index `nativeCount + slotUpgradeIndex` — the same "slot:type:index" convention `buildStats.ts`/`v2Import.ts`/`v2Export.ts` already key augments on generically, so no changes were needed there. `GearPanel.tsx` renders a color picker for each unresolved `SlotUpgrade` (dispatching new `SET_SLOT_UPGRADE`, irreversible like V2 — cleared only by re-equipping the item, matching `SET_GEAR`/`CLEAR_GEAR`'s existing `augmentChoices` reset) and feeds the resolved slot list into the existing `AugmentSlot` picker. Residual: a color picked but not yet filled with an augment doesn't survive an export→V2-reimport round trip (V3's own JSON save/reload is unaffected). 7 regression tests in `parityPassD2SlotUpgrade.test.ts`. | this PR |
| 99 | **User-reported import bugs found via 5 real `.DDOBuild` files** — (1) **Universal "Alter Dark Gift" feat slot** (V2 `Build::TrainableFeatTypeAtLevel`, `Build.cpp:1091`) is granted unconditionally to every build at character level 4 regardless of race/class, with no backing race/class FeatSlot XML data ("you have to be level 4 to go into the Lamordia zone where this feat can be acquired"). `v2Import.ts`'s `buildFeatSlotKey` had no case for it, so it fell through to the class-slot fallback (`${className}-${classLevel}-Alter Dark Gift-${idx}`) — a key `lib/levelTraining.ts`'s `buildSlots()` (the live FeatSlots/LevelTrainingPanel UI) never generates, silently orphaning the trained feat (present in data, invisible in the app). Hit 3 of the 5 uploaded builds. Fixed with a dedicated `alterDarkGift-4` key on both the import and `buildSlots()` sides, plus the matching reverse-mapping case in `v2Export.ts`'s `featsByLevel`. (2) **Item-specific embedded augment options** (V2 `ItemAugment::GetSelectedAugment()`, `ItemAugment.cpp:66-79`, `ItemSpecificAugments`) — items like "Gem of Many Facets" define unique per-slot augment choices (usually set-bonus grants) inline on the item itself rather than in the global `Augments/*.xml` catalogue; V2 checks the item's own list before falling back to the global catalogue. `buildStats.ts`'s `accumulateAugments`/`accumulateSetBonuses` only ever checked the global `allAugments` array, so these item-specific augment selections (and the set-bonus stacks they contribute to) were silently dropped — confirmed on a real build where "Legendary Elder's Knowledge" needed 2 contributing sources to reach its 2pc tier, one of which was invisible to V3. New `resolveAugment()` helper checks the host item's `ItemAugment[].Augment` list first, matching V2's resolution order; `ItemAugment.Augment` widened from a single mistyped object to `Augment \| Augment[]` (its true runtime shape — `Type`/`SetBonus`/`Effect` were already present in parsed XML, just never read). 4 regression tests added (`parityAlterDarkGift.test.ts`, 2 new cases in `augmentSetBonus.test.ts`, 1 new case in `levelTraining.test.ts`). | this PR |
| 100 | **Enhancement-tree availability rewritten on the requirement engine (archetypes / iconic races / universal trees)** — `EnhancementTreePanel`'s `availableTrees` used a tree-name ↔ class/race-name substring heuristic, so archetype classes never saw their base class's trees (Arcane Trickster ↛ Thief-Acrobat/Mechanic, Dragon Lord ↛ Stalwart Defender, Blight Caster ↛ Season's Herald), `RequiresOneOf` class alternatives were ignored (Vanguard for Paladin), iconic races never matched their racial tree ("Aasimar Scourge" ↛ "Aasimar: Scourge of the Undead"), and universal trees gated on Enhancement/Feat requirements never resolved (Arcane Archer (Elf), Harper Agent) — worse, the panel's mount-time prune then silently DROPPED those trees from the imported pinned list. Confirmed against 4 of 5 real user-submitted `.DDOBuild` files ("the trees don't all open"). V2 does no name matching: `CEnhancementsPane::DetermineTrees` (`EnhancementsPane.cpp:316-340`) evaluates each tree's `<Requirements>` through the Requirement engine, where `BaseClass` counts archetype levels toward their base class (`Build::BaseClassLevels`), `Race` is strict equality (an iconic race sees its own tree INSTEAD of the base race's — heuristic was over-granting there), and `Feat` counts special/favor acquisitions against `Value` (`Requirement.cpp:870`). New `lib/treeAvailability.ts` exports `availableEnhancementTrees()` (requirement-engine filter + reaper/destiny/Legacy exclusions) and `buildFeatCountMap()` (featChoices + pastLives counts + favorFeats + Life specialFeats — the "Harper Agent Tree" UniversalTree grant lives in Life-level `<SpecialFeats>`); `RequirementContext` gains optional `featCounts` so `Feat`/`FeatAnySource` honor `Value` (V2 `EvaluateFeat` count semantics) when counts are supplied, preserving the prior set-membership behavior for all existing callers. Panel + TreePicker now consume the shared filter; heuristic helpers deleted. Verified all 17 builds/lives across the 5 user files now keep every spent/pinned tree visible. 7 regression tests in `parityTreeAvailability.test.ts`. | this PR |
| 101 | **N10 — Percent-effect rounding truncates per-effect, not combined** — V2 `BreakdownItem.cpp:474-503` (`DoPercentageEffects`) truncates each active `<Percent/>`-tagged effect's contribution individually and sums the already-truncated amounts; only `BreakdownItemHitpoints` opts into combined truncation (`DoAllPercentsAtOnce()`, `:498-501`). `webapp/src/lib/buildStats.ts`'s percent post-pass previously applied the Hitpoints-only combined-truncation formula to every stat. Fixed: the `hp` stat key keeps combined truncation (`trunc(base * percentSum / 100)`); every other percent-tagged stat (ACBonus, Weapon_Attack, SpellPoints, ...) now truncates each active resolved percent bonus individually and sums the truncated amounts, matching V2. 2 regression tests in `parityPassN10.test.ts`. | this PR |
| 104 | **InternalName choice keys + 4 more golden-build fixes (user golden data, PR #141)** — Diffed V3 against a real V2 breakdown export supplied by the user (Bard 18/Barb 1/Ftr 1 L34, `exampledps.DDOBuild`): 52/55 stats mismatched. Root causes fixed: **(1) InternalName choice keys** — V2 files AND the TreeGrid UI key enhancement/destiny/reaper choices by `InternalName` (`WCCore1`), but `accumulateEnhancementTree`/`computeTreeAP`/`collectEnhTree`/`collectAvailableAttacks`/Half-Elf-dilettante looked up display `item.Name` only → **every tree effect resolved to rank 0 and contributed nothing to stats** (the UI showed spends fine — panels already dual-keyed — which is why builds LOOKED right while Analysis numbers were short). New `enhancementRank()`/`enhancementSelection()` helpers (InternalName first, display-name fallback for legacy saves) used at every site; `ctxEnhancements` now carries both namespaces. **(2) Item-buff template ctx** — `parseItemBuffViaTemplate` called `parseEffect` with no ctx, so stance-gated template effects (e.g. "Enhanced Bloodrage" +8 CON/+10 MP toggle) were conservatively dropped; ctx now threads `accumulateGear → parseItemBuff → template`. **(3) Dodge cap printed MDB** — the dodge cap compared against `mdb` effects only, ignoring the armor's printed `MaximumDexterityBonus` (V2 `Breakdown_MaxDexBonus->Total()` includes it). **(4) BAB override char level** — the OverrideBAB fold used heroic `totalLevel` (20) instead of V2 `Build::Level()` (heroic+epic+legendary=34) → boost was 0 at epic levels. **(5) Trained-spell effects** — V2 `Build::ApplySpellEffects` (Build.cpp:2388-2404) stamps `SetApplyAsItemEffect()` on EVERY trained-spell effect (they join the gear Highest-Only pool) and stamps the spell's class as StackSource for ClassLevel amounts; V3 stacked them fully. Golden-diff: 52/55 → 34/55 mismatching; STR/CON/BAB/SP/Fortification/Doublestrike/Doubleshot/Strikethrough/FortBypass/Helpless/MaxDex/FalseLife/ReaperHP/SongCount/SneakDice/ImbueDice/SpellPen/FatePoints now exact. 4 regression tests in `enhancementInternalNames.test.ts` (real Maetrim fixture). | #141 |
| 103 | **N12 + N13 + empty-element flag bug (the real "numbers don't add up")** — Real catalogue XML writes boolean effect flags as self-closing elements (`<Percent />`, `<ApplyAsItemEffect />`), which fast-xml-parser surfaces as empty strings — but `effectParser.ts` checked `=== true`, so with REAL data **all ~186 percent effects were applied as flat amounts** (unit-test fixtures wrote `Percent: true` and passed; the running app never matched). New `flagSet()` helper treats presence (`""`/`true`) as set; `Effect.Percent`/`ApplyAsItemEffect` types widened to `boolean \| string`. **N12** — central `<Rank>` gate in `parseEffect` (V2 `EnhancementTreeItem::GetEffects` `:509-510`): a Rank-tagged effect fires once, at/after that rank, with a single stack (was: scaled by trained rank, e.g. Dwarf "Child of the Mountain" +5/+10/+15% HP instead of 0/0/+5%; Rogue Assassin "Light Armor Mastery" +75% instead of +25%); the GrantFeat-local gate removed (now redundant). **N13** — `ParsedBonus.asItemEffect` set from the flag; `addParsed` routes flagged effects into the `fromGear` pool so they obey gear-style "Highest Only" stacking (V2 `m_itemEffects`, `BreakdownItem.cpp:623-698`). End-to-end: imported Maetrim monk HP 1663→1895, AC 150→152. Oracle still 98/98 vs compiled V2 math. 4 real-data regression tests in `parityPassN12N13.test.ts` (Dwarf tree, all three bugs meet in one enhancement). | #140 |
| 102 | **N11 — `Bonus="Temporary"` effects no longer inflated by same-stat percentage bonuses** — V2 `BreakdownItem.cpp:793-812` (`RemoveTemporary`) pulls any effect whose bonus type is `"Temporary"` out of the bonus list **before** `baseTotal` is computed for percentage purposes, then adds it back flatly after all percentage effects apply (`:236-238`). `webapp/src/lib/buildStats.ts`'s percent post-pass computed `base` from every non-percent bonus including `Temporary`-typed ones, so a Temporary bonus (e.g. Bard "Inspire Greatness" +20 Temporary HP) inflated the base that a stat's own %-bonuses (e.g. Frenzied Berserker +25% HP) scale against. Fixed: `base` now excludes `type === 'Temporary'` bonuses; the Temporary contribution itself is still added back flatly (unchanged — it was never removed from `rebuilt`). 2 regression tests in `parityPassN11.test.ts`. | this PR |
| 105 | **N14 — Attack feat's base off-hand attack chance** — V2 `Feats.xml`'s universal "Attack" feat (granted automatically to every character, `Acquire: Automatic`) carries an unconditional `OffHandAttackBonus` effect of +20 ("Standard off hand attack chance") alongside the base helpless-damage (+50%) and strikethrough (+20%) values already modeled in Done item #52. `buildStats.ts` added those two but never this third one, so `offhand.attack` was always 0 unless a TWF-style feat/enhancement happened to add to it. Added the base `offhand.attack` +20 alongside the other two Attack-feat base adds. Golden-build diff (`exampledps.DDOBuild`): Off Hand Attack Chance now matches V2 exactly (20/20, was 0/20); 34/55 → 33/55 mismatching overall. 2 regression tests in `parityPassN14.test.ts`. | this PR |
| 106 | **"Feats not showing up" + golden stat engine (user complaints)** — (a) **Feat picker overhaul**: a sweep of 102 real `.DDOBuild` files (1690 trained slots) found 347 feats V2 trained that V3's picker refused to offer or showed locked. Root causes: BAB class tables parse as `{'#text'}` objects → `totalBAB` returned 0 for everyone (every BAB-gated feat locked); `Level` requirements compared heroic-only `totalLevel` (all epic/legendary feats locked — fix also unlocks `Level 25+` destiny-tree gates); `FeatUpdateList` treated as per-slot whitelist instead of V2's load-time Group amendment (`CDDOBuilderApp::UpdateFeats`); automatic class feats and past lives missing from prerequisite sets (V2 `Build::CurrentFeats`); same-level feats couldn't satisfy each other. After: 2/1690 failures, both illegal fuzz artifacts. (b) **Epic/Legendary pseudo-class `AutomaticFeats` applied** (`classesWithEpicPseudo`, 4 sites + `MaxTimesAcquire` clamp): Epic/Legendary Power ×14 = +84 melee/ranged/universal spell power (all three now V2-exact), Epic Skills ×10 = +10 all skills, Epic/Legendary Knowledge = +7 caster levels. (c) **Per-level cross-class skill ranks** (V2 `SkillAtLevel`): 0.5-rank decided by the class trained at each level, not the whole-build union. (d) **Trained-spell `StackSource` stamped unconditionally** (Spells.xml carries literal "Unknown") **+ `ClassCasterLevel` resolves against the caster-level breakdown** via a new fixed-point feedback channel (Merfolk's Blessing → Swim 73 exact). (e) **`<NumFiligrees>` honored on import** (was hardcoded 6, dropping filigrees 7-10: Sanctified Fervor +5 MP, Nystul 5pc +40 MRR Cap — both now exact). (f) **Spell-power governing-skill fold moved after the `skill.All` fan-out** (elemental spell powers ±1). Golden diff 34/55 → 25/55 mismatching. 18 regression tests (`parityFeatEligibility.test.ts`, `parityGoldenPass106.test.ts`). | this PR |
| 107 | **Golden residues: augment values, tomes, stacks, self-buffs (34→9 total journey to 9/55)** — (a) **ChooseLevel augment values** (V2 `Build.cpp:4975-5012`): a ChooseLevel augment's effect Amount is REPLACED by `LevelValue[SelectedLevelIndex]` (`LevelValue2` for the 2nd effect under DualValues; fallback index = host item MinLevel−1). V3 used the printed Amount (the max) — Sapphire of Dodge +17 instead of +14, Sapphire of Defense/Resistance & MRR gems similar. `SelectedLevelIndex` now imports (`augmentLevelChoices`), applies, and round-trips through `.DDOBuild` export. Dodge 18 ✓ exact, PRR −24→−4, MRR −28→−8. (b) **Augment effects join the item pool** (V2 `RemoveNonStacking` operates on `m_itemEffects`, which includes augments): a Resistance augment no longer stacks with an item Resistance bonus (Will −8 overcount). (c) **Tome cap by character level**: `tomeCapAtLevel` was fed heroic `totalLevel` (20) forever — +8 tomes capped at +7. INT/WIS/CHA/CON now exact; Max Ki 65 ✓ (WIS knock-on). (d) **Duplicate `<Type>` stack multiplier** (V2 merges per-Type copies via `m_stacks`, `Effect.cpp:1191`): Fury of the Wild "Primal Scream" declares `<Type>AbilityBonus</Type>` twice with `AType=Stacks Amount="0 2 4"` → 2 stacks → +2; V3's per-type fan-out passed rank 1 → Amount[0]=0. Fan-out now multiplies rank by the duplicate count. (e) **Self/party buffs split from stances** (V2 `Life::SelfAndPartyBuffs`): `accumulateSelfBuffs` consumed `activeBuffs`, so a STANCE named like a catalogue buff ("Primal Scream", "Rage") double-applied the party-buff entry (+4 DEX/STR/CON on top of the stance's +2). New `CharacterBuild.selfBuffs` list: import/TOGGLE_BUFF/panel/stats all use it. (f) Display: Epic/Legendary auto-feat rows in `buildAutomaticFeatGroups` (panel + forum export, V2 table parity); forum-export Skills prints half-rank totals ("32" not "33"). Golden diff 25/55 → **9/55**; DEX/STR/spell-powers/Dodge/Ki all exact. 8 regression tests in `parityGoldenPass107.test.ts`. | this PR |
| 108 | **Current-save golden: 52/56 V2-exact (user-supplied matched pair)** — The user uploaded their CURRENT `exampledps.DDOBuild` (the repo's copy was an older save — several tracked "residues" were phantoms of comparing V3 against a stale V2 capture; HP/AC matched the moment the files matched). With a matched build+export pair, three real bugs closed: **(1) Epic/Legendary base saves** — their class XML declares `<Fortitude>None</Fortitude>` etc.; V2 contributes 0, but V3's `saveBase()` fell through to the poor-progression formula (+3 epic, +1 legendary) → the uniform +4 overcount on all three saves. `None`/empty now returns 0. **(2) Reaper selector picks never applied** — `parseEnhancements` returned reaper `selections` but the importer stored only `choices` and `buildStats` passed `{}` at both accumulation sites; Dread Adversary "Reaper's Offense III: +1 Strength" (UNGATED — counts outside reaper difficulty) was dropped (STR −1). New `reaperSelections` field, wired through import/migrate/stats. **(3) Attack feat base unconscious range** — the fourth base value from the universal Attack feat ("Standard Death at −10"), missing alongside the previously-added helpless/strikethrough/off-hand bases (−350 vs V2 −360). Also: new `scripts/v2ExportDiff.ts` (one command: `.DDOBuild` + V2 forum export → full-stat diff), and `parityGoldenPass106.test.ts` rewritten data-driven against the committed export (52 exact assertions + drift guards on the 4 open residues). | this PR |
| 109 | **50-build user corpus: import/stats/picker all-green** — User-supplied zip of 50 real builds (`Output/UserBuilds/collection/`) swept end-to-end (326 initial failures → 0 modulo documented V2-parity exceptions). Fixes: **(1) MaxTimesAcquire in the picker** (V2 `Build.cpp:1584`: `trainedCount < MaxTimesAcquire`) — Toughness (`MaxTimesAcquire 99`) and other multi-acquire feats were excluded after one training (293 cases). **(2) Alter Dark Gift retrains** — V2 re-offers the slot at later levels; any-level Alter Dark Gift trainings now map to the single V3 slot (latest wins). **(3) AutomaticAcquisition feats in prerequisite sets** — Sunder/Trip/Defensive Fighting (BAB-1 auto-grants) now count via generic `<AutomaticAcquisition>` evaluation, unlocking Improved Sunder etc. **(4) `BaseClass`/`BaseClassMinLevel` bound by the levelClasses array length** — saves with unassigned early levels (Paladin 6 first reached at char level 10) failed class-level checks bounded by the non-blank count. Documented non-bugs: Warlocks.DDOBuild has V2-side save corruption (item text inside TrainedFeat `<Type>`); Mobile Spellcasting / Past Life: Arcane Initiate trained without prereqs are V2 invalid-but-kept (red) feats — V3 keeps them locked, same behavior; "Purity of Heart" + "Dreadful Dimlight (Legendary)" are missing from this repo's DataFiles (user's V2 install ships newer game data — refresh `Output/DataFiles` to close). Corpus committed + `parityUserCollection.test.ts` guards it in CI. | this PR |
| 110 | **Corpus leftovers: corrupted-save salvage + V2 red invalid-feat marker** — (a) **Corrupted-save salvage**: V2's save bug appends unrelated string data to `<Class>`/`<Type>` elements ("Pact AbilityThe blue shine…", `<Class>EpicShieldEnchantment</Class>`). Importer now salvages by known-prefix match: `salvageFeatType()` strips trailing garbage when a known feat-slot type is a strict prefix; `mapClassName()` recovers Epic/Legendary pseudo-class names. Warlocks.DDOBuild: 10 orphaned feats → 6 (the rest have fully-replaced Type/empty fields — unrecoverable for V2 too). (b) **V2 red invalid-feat display**: trained feats whose requirements are not met (V2 keeps them, renders red — Mobile Spellcasting without Combat Casting) now render red in FeatSlots with a tooltip, via new `isChosenFeatValid()`. (c) **Data-gap confirmation**: `syncUpstreamV2.ts check` shows the repo is in sync with upstream Maetrim/DDOBuilderV2 HEAD — "Purity of Heart" and "Dreadful Dimlight (Legendary)" are newer than upstream's git tree; closing them requires the user's V2 install's DataFiles folder. | this PR |
| 111 | **AutomaticAcquisition feats surfaced in the Automatic Feats display** — V2 `Build::AutomaticFeats` (`Build.cpp:2510-2552`) grants Sunder/Trip/Defensive Fighting (BAB 1), Attack/Sneak/Heroic Durability (level 1), and per-class "Improved Heroic Durability (\<Class\> 5/10/15)" (`Class::ImprovedHeroicDurabilityFeats`, `Class.cpp:383-404`) purely through each feat's own `<AutomaticAcquisition>` requirement block — no class `AutomaticFeats` list or race `GrantedFeat` entry names them. `buildStats.ts` already applies their stat effects (Done #51), and `featEligibility.ts` already counts them toward prerequisites (Done #109 item 3), but the display side — `buildAutomaticFeatGroups` (shared by the Automatic Feats panel and the forum export's AutomaticFeats section) — never enumerated them, so V2's own forum export (`AddAutomaticFeats`, `ForumExportDlg.cpp:691-729`, which lists every `LevelTraining::AutomaticFeats()` entry) showed feats V3 silently hid. New `automaticAcquisitionFeatGroup()` in `lib/automaticFeats.ts` evaluates every `Acquire="Automatic"` feat's `AutomaticAcquisition` requirements against the current build (kept separate from `buildAutomaticFeatGroups` so `featEligibility.ts`'s own separate AutomaticAcquisition counting loop isn't double-counted) and synthesizes the per-milestone Improved Heroic Durability names; wired into `AutomaticFeats.tsx` and `sections.ts`'s `automaticFeats` section (new optional `SectionContext.allFeats`, threaded through `ForumExportPanel.tsx`) as an "Automatically Acquired" group. Completionist/Racial Completionist stay excluded (their real V2 gating is the past-life-count logic already in `buildAutomaticFeatGroups`, not the XML placeholder). Also verified the export's Dodge line already renders V2's `dodge/cap` form ("18/25") as of X7 (#95) — that half of the "Display gaps" note was stale. 5 regression tests in `parityAutoAcquisitionDisplay.test.ts`. | this PR |
| 112 | **v2calc oracle complete + automatic referee (the loop-ender)** — Finished the `v2calc/` port: it now loads ALL V2 data (items ~8.5k, enhancement trees, spells, augments, set bonuses, filigrees, bonus types, stances, weapon groups, item buffs) through DDOBuilder's own XmlLib readers and runs V2's real `BreakdownItem` observer graph headless, so gear/enhancement/spell/set/filigree effects apply through V2's actual C++ (YingsMonk HP 1306→4125; exampledps matches the user's forum export exactly on HP/MeleePower/RangedPower/dodge/abilities). `MultiFileObjectLoader` is Windows-only → portable per-file reader in `shim/MultiFileLoaderLinux.cpp`. New `webapp/scripts/oracleDiff.ts` runs the oracle vs V3 across every build and prints per-stat mismatches — **manual gap-reporting is no longer needed**. First fix from it: **base 25% Dodge Cap** (Feats.xml Attack "Base Dodge Cap" `DodgeCapBonus 25`, V2 `BreakdownItemDodge` "25% plus effects") was missing → every no-armor build's dodge clamped ~23 low (YingsMonk 21→46 vs oracle 44). | this PR |
| 113 | **V2 stack-merge for `AType=Stacks` effects (monk-forms ability root cause)** — V2 `BreakdownItem::AddEffect` merges byte-identical `AType=Stacks` effects (`Effect::operator==`) into ONE whose value is `Amount[stackCount-1]`, never the sum (`Effect.cpp` `Amount_Stacks`). V3 summed them: the monk elemental-form STR penalty ("Ocean Stance: Strength Penalty" from Ocean Stance + Adept/Master/Grandmaster of Forms, all `Amount="-2 -2 -2 -2"`) applied 4× = −8 instead of −2; the tier positive bonuses (`Amount="2 2 3 4"` for WIS/dodge/saves/Ki) read `Amount[0]` instead of the tier count. Root cause of the ability gaps that cascade into HP/saves across the monk-heavy corpus. Effects now carry a `stackGroup` identity (DisplayName+Type+Bonus+Item+Amount; non-empty DisplayName + multi-element table required so anonymous gear/set flat bonuses still sum) + `stackAmounts`; a merge pass collapses each group to `Amount[count-1]` **before Phase 2 reads ability totals** (so merged abilities feed saves/HP/skills same-pass). Unifies the pass-107 duplicate-`<Type>` mechanism (Primal Scream) through the same path. Oracle: YingsMonk STR 20→26 exact, Maetrim STR 46→52 (−8→−2). No exampledps regression (4/56). | this PR |
| 114 | **Completionist / Racial Completionist +2 never applied** — three compounding bugs found by re-diffing the golden Maetrim build against `v2calc`'s per-effect `IsActive()` dump: **(1)** `v2Import.ts` only read past lives from `<Character><SpecialFeats>`; V2's `Life::AllSpecialFeats()` (`Life.cpp:709-713`) sums the Life's own `<SpecialFeats>` too, and real saves record some past lives (e.g. "Past Life: Duergar" ×3) at Life scope only — now merged. **(2)** `buildAutomaticFeatGroups`'s class Completionist check required every heroic *class name* (including archetypes as independent entries, e.g. "Stormsinger") at ≥3 past lives, which was unsatisfiable — V2's real dynamic requirement (`DDOBuilder.cpp:494-550`) groups archetypes under their `BaseClass` via a `RequiresOneOf` (base class's own past life OR any archetype's, `"<Base> - <Archetype>"`) at ≥1, and excludes the `Unknown` placeholder class. **(3)** Racial Completionist's race list never excluded `NoPastLife` races (Wood Elf) — `dataLoaders.ts`'s `loadRaces` never normalised the `<NoPastLife/>` presence-only XML flag (same bug class already fixed for class `<NotHeroic/>`), so `!r.NoPastLife` was always true and Wood Elf stayed a permanently-unsatisfiable requirement. Together these zeroed the +2 AbilityBonus/+2 SkillBonus for every fully-past-lifed build. Also fixes the Maetrim AP budget (was under-counting by 1 — Duergar's Tier-3 past life grants +1 Racial AP, `Races/Duergar.race.xml`; `parityPassEnhancementTrees.test.ts` updated 103→104). Surfaced a new, separate, previously-masked bug — logged below as a fresh ❌ (Guild Buff wrongly granting `AbilityBonus`). 8 regression tests in `parityCompletionist.test.ts`. | this PR |
| 115 | **`v2calc` oracle gap: `GuildBuffs.xml` never loaded — retracts the "Guild Buff wrongly applies `AbilityBonus`" lead from #114** — `v2calc/shim/GlobalDataLinux.cpp`'s `V2CalcLoadGameData` never called `GuildBuffsFile`, so `g_guildBuffs` stayed permanently empty and `Build::ApplyGuildBuffs` (real V2 code, correctly invoked via `BuildNowActive`) iterated zero buffs — every guild-buff effect was silently absent from the oracle's JSON, which is why the oracle appeared to show "V2 never applies Guild Buff AbilityBonus" for Maetrim/YingsMonk (GuildLevel 200, ApplyGuildBuffs 1). Confirmed by instrumenting `Build::ApplyGuildBuffs`/`NotifyItemEffect` with temporary probes (reverted): `totalGuildBuffs=0` at runtime. Fixed by adding `GuildBuffsFile` (mirrors `CDDOBuilderApp::LoadGuildBuffs`, `DDOBuilder.cpp:1229-1238`) to the loader and the Makefile's source list. V3's `accumulateGuildBuffs` (`buildStats.ts:824+`) was already correct — GuildLevel=200 legitimately unlocks all three ability-granting guild buildings (Floating Rock Garden, Paradoxical Puzzle Box, Old Sully's Grog Cellar) simultaneously, since V2 has no "only one building selected" mechanic. `oracleDiff.ts` re-run: `ability.STR/CON/DEX/INT/WIS/CHA` mismatches across the 39-build corpus dropped from 22-24 builds each to 0-4. New regression test in `parityCompletionist.test.ts` pins the three per-ability Guild Buff bonus lines directly so this can't silently regress. | #156 |
| 116 | **Four Epic/Legendary hitpoints bugs — the `hitpoints (50)` oracle bucket's biggest root causes** — found by diffing the `v2calc` oracle's per-effect `AllActiveEffects()` dump (temporary debug hooks, reverted) against V3's `stats.resolve('hp')` for YingsMonk.DDOBuild (oracle 4198) and exampledps.DDOBuild (real V2 export 2797). (1) `accumulateClass` halved Epic/Legendary class HP itself; V2 `BreakdownItemHitpoints.cpp:68-83` only halves the *separate* `classHitpoints` accumulator that feeds the Combat Style % bonus, never the class's own HP effect — now full weight, matching V2. (2) The Combat Style `nonEpicHD` loop then double-counted Epic/Legendary (once full via the per-class loop, once again halved) — now skips them in the loop since they're added back explicitly at half weight. (3) The CON-mod HP delta correction (for gear/enhancement CON invisible to the early quick-resolve pass) scaled by heroic `build.totalLevel` instead of heroic+epic+legendary, unlike the base CON HP formula it corrects. (4) `HitpointsReaper` (APCount, V2's separately level-capped `Breakdown_ReaperHitpoints`) was merged into the same bucket as flat, always-uncapped `Hitpoints`-typed Reaper effects (`effectParser.ts` now routes it to a dedicated `hpReaperAP` key), and the cap threshold used heroic level instead of V2's `pBuild->Level() + 1`. YingsMonk oracle diff: 2851→3935 (was 32% low, now 6% low). `oracleDiff.ts` full-corpus re-run: `hitpoints` mismatches 49→38 builds (52→47 builds with any mismatch, of 53). A separate, still-open percent-HP/missing-effect residue remains (now tracked as G-HP in "Golden-build residue" — overshoots exampledps by +195, was -78 before this fix). 5 regression tests in `parityPassEpicLegendaryHP.test.ts` (synthetic builds, oracle-independent). | #157 |

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
documented simplified estimator). Also confirmed genuine V2 dead code needing no
V3 equivalent: `BreakdownItemEnergyCasterLevel` (never instantiated in
`BreakdownsPane.cpp`), `BreakdownItemSchoolCasterLevel`'s `CasterLevel`+
`SpellSchool` combination (no XML effect uses it), `BreakdownItemDice::SumDice()`
(literal `"NYI"` stub in V2).

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

## High-priority remaining — numerical correctness & effect parser coverage

### Golden-build residue (user-supplied V2 breakdown export, 2026-07-17)

A real V2 breakdown export for `exampledps.DDOBuild` (Bard 18/Barb 1/Ftr 1,
L34, SWF dagger build with active mantles/buffs) was diffed against V3 after
PR #141. 21 of 55 tracked stats now match exactly (STR/CON/BAB/SP/
Fortification/Doublestrike/Doubleshot/Strikethrough/Fort-Bypass/Helpless/
Max-Dex/False-Life/Reaper-HP/Song-Count/Sneak-Dice/Imbue-Dice/Spell-Pen/
Fate-Points/Displacement/Incorporeality/Movement-Speed). Remaining
mismatches, largest first — each needs a source-by-source V2 trace:

- ✅ **G-SP / G-MP — melee power, ranged power, universal spell power all
  V2-exact** (#106): Epic/Legendary Power auto-feats ×14 were the missing
  84; elemental spell powers now ±1 (governing-skill fold reordered after
  `skill.All` fan-out; residue is the ±1 ability cluster). The old mantle /
  implement suspicions were investigated and ruled out (mantles grant no
  MP/RP/SP; implement bonus requires Divine Crusader "Strike with Poise"
  rank 3, not trained on the golden build).
- 🟡 **G-MRR — MRR Cap ✅ exact** (Nystul 5pc via the NumFiligrees import
  fix); **PRR still −24, MRR −28**. The "Legendary Bulwark" lead is now
  RULED OUT — instrumented `accumulateSetBonuses` end-to-end: the 3× augment
  counts, the set fires, and its +10% Legendary HP is inside the combined
  hp percent row ("30% of 2172"). PRR suspects worth a trace: Sapphire of
  Defense +36 resolution, and V2-active stances (Power Attack/Enhanced
  Bloodrage) the V3 session may not have on.
- 🟡 **G-HP — four real bugs fixed (this PR), residue now +195 (was −52/−78) —
  root-caused via a `v2calc`-oracle per-effect `AllActiveEffects()` dump**
  (temporary debug hooks added to `DDOBuilder/BreakdownItem.h`/
  `v2calc/src/main.cpp`, reverted after diagnosis — not part of this fix).
  (1) **Epic/Legendary class HP was wrongly halved**
  (`accumulateClass`/`buildStats.ts`): V2 `BreakdownItemHitpoints.cpp:68-83`
  only halves Epic/Legendary HD in the *separate* `classHitpoints`
  accumulator that feeds the Combat Style % bonus — the class's own HP
  effect (`AddOtherEffect("<Class> N Levels", ...)`) is ALWAYS the full,
  un-halved amount. V3 halved the HP effect itself (YingsMonk: Epic 10
  levels 50→100, Legendary 4 levels 20→40). (2) **Combat Style HD
  double-counted Epic/Legendary**: the `nonEpicHD` loop iterated
  `ctxClassLevels` (which already carries Epic/Legendary at full HD)
  *and* separately re-added them at half HD — 1.5× instead of 0.5×
  weight (exampledps: 376 vs V2's 236). Fixed by skipping Epic/Legendary
  in the loop. (3) **CON-mod HP delta mis-scoped**: the correction for
  gear/enhancement CON bonuses invisible to the early "quick resolve"
  pass scaled by heroic `build.totalLevel` instead of heroic+epic+
  legendary, unlike the *base* CON HP formula it corrects (which already
  used the full total) — under-counted CON HP on any epic/legendary
  build where CON changes after the quick pass. (4) **`HitpointsReaper`
  (APCount, V2's separate level-capped `Breakdown_ReaperHitpoints`) was
  merged into the same `hp`-Reaper bucket as flat, always-uncapped
  `Hitpoints`-typed Reaper effects** (V2 "Reaper's Defense I/II/IV"), so
  V3's cap over-applied to both, AND the cap threshold used heroic level
  instead of V2's `pBuild->Level() + 1` (total character level). Now
  routed to a dedicated `hpReaperAP` key, capped separately at the
  correct level. YingsMonk oracle HP 4198: V3 went 2851→4077 (was 32%
  low, now 3% low). exampledps (real V2 export, HP 2797): V3 went
  from −78 under to +195 over — closing these four bugs overshot on
  this build, meaning the true remaining residue is a
  *different*, still-undiagnosed source (likely a percent-HP total or a
  missing effect — V2's `AllActiveEffects()` dump for this build lists
  raw entries summing to 2346, i.e. V2 itself applies ~451 of
  additional percent-scaled HP that isn't enumerated as a separate
  effect line; V3's equivalent percent line came to 690, a genuine
  mismatch worth its own trace. Also spotted but NOT yet fixed:
  V2's dump has "Warchanter: Howl of the North" (Competence +20) and
  "Legendary Bulwark" (Legendary +10) that V3 never applies at all).
  5 new regression tests in `parityPassEpicLegendaryHP.test.ts` (synthetic
  builds, oracle-independent) cover bugs 1-4 directly.
- ❌ **2026-07-19 user cc1-gearset export diff** (fresh V2 vs V3 forum
  exports, different save than the repo fixture — V2's file has 4 gear
  sets, repo fixture only 2, so not directly reproducible here): Will +11
  OVER (biggest single unexplained), Fort +1/Reflex +2 over, Fortification
  Bypass 84 vs 71 (+13 OVER — check Armor-Piercing bonus-type stacking:
  Enhancement 23% + Legendary Armor-Piercing 5% + Insightful 11% + augment),
  Unconscious Range −350 vs −360 (−10; possibly the inactive Enhanced
  Bloodrage toggle), Dodge 21 vs V2 "18/25" (V3 +3 over AND the export
  never renders the V2 `dodge/cap` form). Much of the MP/PRR/MRR delta in
  that session is stance-state: V2 had Power Attack / Enhanced Bloodrage /
  Mantle of Fury / Fallen Bond active; V3's export lists them inactive —
  verify V3 restores ActiveStances from import into the live session.
- ✅ **Display gaps vs V2 export — closed (#111)**: Epic/Legendary auto-feat
  rows and half-rank skill totals done (#107). (1) AutomaticAcquisition
  feats (Attack, Sneak, Heroic Durability, Defensive Fighting, Sunder,
  Trip, Improved Heroic Durability (Class 5/10/15)) now surface in both
  the Automatic Feats panel and the forum export's AutomaticFeats section
  under a new "Automatically Acquired" group — done (#111). (2) the
  export's Dodge line already renders V2's `dodge/cap` form ("18/25") as
  of X7 (#95) — this sub-item was stale, verified via `parityPassX7.test.ts`.
- ✅ **G-SKILL — skills V2-exact except the ±1 ability-mod cluster** (#106):
  Epic Skills ×10 (uniform +10), per-level cross-class half-ranks
  (Balance/Perform), Merfolk's Blessing at caster level 25 (Swim 73 exact).
- ✅ **G-SAVES — closed (#108)**: the uniform +4 was Epic/Legendary base
  saves — their save progression is `None` in the class XML (V2 adds 0);
  V3's `saveBase()` fallback added +3/+1. All three saves + all 9 sub-saves
  now V2-exact against the current export.
- ✅ **G-AB (partial) — Off-Hand Attack Chance −20 fixed (N14)**: the
  universal "Attack" feat (`Feats.xml`, granted automatically to every
  character) carries an unconditional `OffHandAttackBonus` effect of +20
  ("Standard off hand attack chance") alongside the already-modeled base
  helpless-damage (+50%) and strikethrough (+20%) values from Done item #52.
  `buildStats.ts` added the two but missed this third one, so `offhand.attack`
  was always 0 absent a TWF-style feat/enhancement. Added
  `add(map, 'offhand.attack', { value: 20, ... })` next to the other two
  Attack-feat base adds. Golden diff: 20/20 exact now (was 0/20).
- ✅ **G-AB closed (#107/#108)**: all six abilities, Dodge, Max Ki,
  unconscious range V2-exact (tome cap, augment LevelValue, Primal Scream
  stacks, self-buff split, reaper selector picks, Attack-feat −10 base).
### Oracle-derived mechanical bug list (2026-07, `scripts/oracleDiff.ts` vs v2calc across ~90 builds)

The v2calc oracle is now the source of truth. Ranked by builds affected
(V2 oracle value is correct; the number is how many builds mismatch):

- ❌ **hitpoints (49→38, #116)** — four root causes fixed (epic/legendary HP
  halving, Combat Style double-count, CON-delta scope, Reaper AP-cap scope/
  separation — see Done table #116); residual is the still-open percent-HP/
  missing-effect gap tracked as G-HP in "Golden-build residue" above, plus
  whatever remains of the ability-mod cascade.
- ❌ **saves: Reflex 37 / Fort 30 / Will 28** — partly ability-mod cascade.
- ❌ **dodge (35)** — base-25 cap fixed (#111); residual is the armor-MDB
  secondary cap (YingsMonk 46 vs 44) — verify V3 applies `maxDexBonus` as a
  second min() after the dodge cap on non-cloth monks.
- ✅ **abilities: Completionist / Racial Completionist +2 never applied
  (114)** — the monk elemental-form stance-stacking sub-cause noted here was
  already fixed by #113 (`Amount_Stacks` merge); re-diffing the golden
  Maetrim build against the real `v2calc` oracle (per-effect `IsActive()`
  dump) surfaced the actual remaining root cause: `v2Import.ts` only read
  past lives from `<Character><SpecialFeats>`, dropping any past life V2
  records at `<Life><SpecialFeats>` scope instead (V2 sums both —
  `Life::AllSpecialFeats()`, `Life.cpp:709-713`); real saves can and do split
  past lives across both nodes (Maetrim's "Past Life: Duergar" ×3 and "Past
  Life: Rogue - Arcane Trickster" ×3 are Life-scoped only). That alone made
  `pastLives['Duergar']` come back `undefined`, which blocked Racial
  Completionist's "every race at 3" check. Two more independent bugs in
  `buildAutomaticFeatGroups`'s Completionist gating (`DDOBuilder.cpp:494-577`,
  the *dynamic* per-feat Requirements V2 rebuilds at data-load time, not the
  `Feats.xml` placeholder): (a) class Completionist must group archetypes
  under their base class via a `RequiresOneOf` (base class's own past life OR
  any archetype's) at threshold ≥1 — not ≥3, and not each archetype counted
  as an independent "class" (which was unsatisfiable, since archetype past
  lives are recorded as `"<Base> - <Archetype>"`, never a bare archetype
  name); (b) Racial Completionist must skip `NoPastLife` races (Wood Elf) —
  `dataLoaders.ts`'s `loadRaces` never normalised the `<NoPastLife/>`
  presence-only XML flag (same class of bug already fixed for `<NotHeroic/>`
  on classes), so `!r.NoPastLife` was always true and Wood Elf stayed a
  permanently-unsatisfiable requirement. Together these zeroed out
  Completionist/Racial Completionist's +2 AbilityBonus/+2 SkillBonus for
  every fully-past-lifed build in the corpus. Oracle: Maetrim/YingsMonk STR
  now V2-exact once the oracle's own Guild Buff data-loading gap was also
  fixed (see next item — that oracle gap was previously *masking* this one
  via error cancellation on several builds, which is why fixing this alone
  moved net oracle mismatch counts up, not down, on those specific builds).
- ✅ **RETRACTED — "Guild Buff effects wrongly apply an `AbilityBonus`"
  (115)**: this was a false lead, not a V3 bug. The previous entry concluded
  V3's `accumulateGuildBuffs` (`webapp/src/lib/buildStats.ts:824+`) over-
  applies a +2 to every ability because the `v2calc` oracle's per-effect dump
  showed **zero** guild-buff entries for Maetrim/YingsMonk. Root cause traced
  to the *oracle*, not V3: `v2calc/shim/GlobalDataLinux.cpp`'s
  `V2CalcLoadGameData` never called `GuildBuffsFile` to populate
  `g_guildBuffs` (it was left as a deliberately-empty stub — see the old
  comment "Not populated by v2calc... kept as empty backing stores"), so
  `Build::ApplyGuildBuffs` iterated an empty list and every real V2 guild-buff
  effect was silently absent from the oracle's JSON — the oracle was wrong,
  not V2 itself. Fixed `v2calc` to load `GuildBuffs.xml` via `GuildBuffsFile`
  (mirrors `CDDOBuilderApp::LoadGuildBuffs`, `DDOBuilder.cpp:1229-1238`) and
  added it to the Makefile's source list. Re-running `oracleDiff.ts` after the
  fix: `ability.STR/CON/DEX/INT/WIS/CHA` mismatches across the corpus dropped
  from 22-24 builds each to 0-4 (residual unrelated to guild buffs). Maetrim's
  GuildLevel=200 legitimately unlocks all three ability-granting guild
  buildings (Floating Rock Garden Str/Wis L15, Paradoxical Puzzle Box Dex/Int
  L16, Old Sully's Grog Cellar Con/Cha L17) simultaneously — V2 has no
  "only one building selected" mechanic, so +2 to every ability from three
  independent Guild-bonus-type sources is the correct, V2-exact total. New
  regression test in `parityCompletionist.test.ts` asserts the three
  per-ability Guild Buff bonus lines directly.
- ❌ **dodge (25)** — base-25 cap fixed (#111); residual is the armor-MDB
  secondary cap (YingsMonk 46 vs 44) — verify V3 applies `maxDexBonus` as a
  second min() after the dodge cap on non-cloth monks.
- ❌ **prr 22 / mrr 19 / mrrCap 4 / fortification 28 / rangedPower 15 /
  meleePower 10.** meleePower/rangedPower now within ~1-17 (Maetrim 324 vs
  307) — likely a per-reaper or form source.

Workflow: `make -C v2calc` once, then `cd webapp && npx tsx scripts/oracleDiff.ts`
prints the live list; fix, re-run, repeat. `oracleDiff.ts <file>` targets one build.

Fifth review pass (2026-07). A full switch/case diff of `Effect.h`/`Effect.cpp`
against `effectParser.ts` again found **no missing Type/AType cases**
(confirmed `AbilityTotalIndex`, `SliderValueLookup`, `Cap`,
`WeaponOtherDamageBonusClass`, `ImbueDice`, etc. all correctly handled,
including a deliberate V2-bug-for-bug replication in `SliderValueLookup`).
This pass's new gaps are all in **Effect/BreakdownItem fields and rounding
rules** rather than missing cases — four items, all narrow but each affects a
non-trivial number of live effects:

- ✅ **N10 — Percent-effect rounding truncates once globally instead of once
  per effect.** V2 `BreakdownItem.cpp:474-503` (`DoPercentageEffects`)
  truncates **each** `<Percent/>`-tagged effect's contribution individually
  and sums the already-truncated amounts. Only `BreakdownItemHitpoints` opts
  into the alternate "combine all percents first, truncate once" path
  (`DoAllPercentsAtOnce()`, `BreakdownItem.cpp:498-501`) — every other
  percent-tagged stat (ACBonus ~63 effects, Weapon_Attack ~17, SpellPoints
  ~10, per Done-item #50) truncates per-effect in V2. Fixed: the percent
  post-pass in `webapp/src/lib/buildStats.ts` now special-cases the `hp`
  stat key to keep the combined-truncation formula
  (`Math.trunc(base * percentSum / 100)`, verified equivalent to V2's
  discrepancy-correction math for `m_bAllPercentsAtOnce`), while every other
  stat truncates each active resolved percent bonus individually
  (`Math.trunc(base * b.value / 100)`) and sums the truncated amounts. 2
  regression tests in `parityPassN10.test.ts`.
- ✅ **N11 — `Bonus="Temporary"` effects no longer inflated by percentage
  bonuses on the same stat** — done (#102 in Done table above).
- ✅ **N12 — `<Rank>` effect gate now honored for all effect types** —
  done (#103 in Done table above).
- ✅ **N13 — `<ApplyAsItemEffect/>` routes into the gear "Highest Only"
  pool** — done (#103 in Done table above), together with the empty-element
  flag-parsing bug that also disabled ALL `<Percent/>` effects with real data.

`parseItemBuff` correctly has no handling for either `Rank` or
`ApplyAsItemEffect` — neither field ever appears in `ItemBuffs.xml` (0
occurrences confirmed), so no change is needed there.

- ✅ **N7 — `Weapon_CriticalRange` effect parsed into a dead stat key** —
  done (#111 in Done table above).
- ✅ **N8 — `Weapon_CriticalMultiplier` effect parses into a dead stat key** —
  done (#90 in Done table above).
- ✅ **N9 — `Life.specialFeats` now applied to stats + AP budget** — done
  (see Done table).
- ✅ **E1 — `SLA` (Spell-Like Ability)** — done (#74/#69).
- ✅ **Non-stance runtime gates** — done (#73).

---

## Medium-priority remaining

### Subsystems V3 hasn't ported
- ✅ **Combat simulator with attack chains** — done (#70).
- ➖ **Gear optimizer / auto-equip** — phantom: V2 has no such feature.
- ✅ **Settings** — done (#67/#69).
- ✅ **Build version migration** — done (#66).

### Data-file edge cases
- ✅ **Item slot edge cases** — done (#71); trinket-via-augment not a V2 mechanic.
- ✅ **Cosmetic gear effects** — done (#71).
- ✅ **Sentient gem personality buffs** — not a gap (#71).
- ✅ **Filigree set bonuses with conditional triggers** — done (#71).
- ✅ **D1 — Legacy enhancement trees filtered from the picker** — done (#97).
- ✅ **D2 — `<SlotUpgrade>` (item augment-slot color upgrades)** — done (#98).
- ❌ **D3 — Minor Artifact single-equip restriction not enforced (93 items
  in current catalogue).** V2 `EquippedGear.cpp:353-386` (`SetItem`)
  auto-revokes (with a warning) a second item flagged `<MinorArtifact/>`
  when one is already equipped anywhere in the gear set
  (`EquippedGear::HasMinorArtifact`, `Build.cpp:4767`/`4843`). `Item.h:100`'s
  `MinorArtifact` flag isn't declared on V3's `Item` interface
  (`types/ddo.ts`) and nothing in the reducer/`buildStats.ts` checks it — a
  V3 build can equip multiple Minor Artifacts simultaneously, which V2
  forbids.
- ❌ **D4 — Artifact Filigree slots should gate on an equipped Minor
  Artifact item.** V2 `Build.cpp:4767-4771`/`4843-4849` only applies/revokes
  the 10 "Artifact Filigree" slot effects when `gear.HasMinorArtifact()` is
  true. `webapp/src/lib/buildStats.ts:1278`
  (`accumulateFiligrees(map, build.filigreeSlots,
  build.artifactFiligreeSlots ?? [], ...)`) always applies
  `artifactFiligreeSlots` with no such gate — a build with no Minor
  Artifact equipped still gets Artifact Filigree bonuses in V3.
- ❌ **D5 — Docent (Mithral/Adamantine Body) armor AC requires a matching
  feat in V2; V3 applies it unconditionally (201 items).** V2 `Item.h:85-86`
  (`MithralBody`/`AdamantineBody`) + `Build.cpp:5779-5822`
  (`ApplyArmorEffects`): an item with `HasMithralBody()` requires the
  "Composite Plating" feat for its base `ArmorBonus` and the "Mithral Body"
  feat for the bonus's own AC effect (each carries a `Requirement_Feat`
  gate); `HasAdamantineBody()` requires "Adamantine Body" similarly.
  `webapp/src/lib/buildStats.ts:506-507` applies `item.ArmorBonus`
  unconditionally for every item — any race/build (not just
  Warforged/Bladeforged with the racial feat trained) gets full AC from a
  Docent-type item in V3.
- ❌ **D6 — Legendary Green Steel "Dominant" stances never auto-activate
  (48 items flagged `IsGreensteel`).** V2 `StancesPane.cpp:1053-1160`
  (`UpdateGreensteelStances`): with 2+ equipped Green Steel items, V2
  compares each item's Dominion/Escalation/Opposition set-bonus stack
  counts and auto-activates one of 5 mutually-exclusive stances
  (Dominion/Escalation/Opposition/Ethereal(4+)/Material(4+)), gating
  further set-bonus effects. `Item.h`'s `IsGreensteel` flag is unused in
  `webapp/src/lib` (only referenced in `v1Import.ts`'s name-migration
  tables) — a build with 2+ Green Steel items never gets these auto-
  stances or their downstream effects in V3.
- ❌ **D7 — `RestrictedSlots` item-level slot exclusion not modeled
  (minor, 3 items in current catalogue, e.g. "Shining Crescents").** V2
  `Item.h:73` + `Build.cpp:4674-4692` + `EquippedGear.cpp:308-309`: an item
  can declare arbitrary *other* inventory slots that must be cleared when
  it's equipped (distinct from the already-ported two-handed/off-hand
  check). Absent from V3's `Item` interface entirely.

Confirmed **not** gaps: `RaceRequirement`/weapon-proficiency/Cannith-
Crafting-style systems don't exist in V2's data model (no crafting XML
files anywhere in `DDOBuilder/`); `IsAcceptsSentience` (1393 items) is
cosmetic-only even in V2 (never checked in `Build.cpp`/`EquippedGear.cpp`),
consistent with the existing #71 sentient-gem finding.

### Spell power school coverage
- ✅ **X6 — Missing alignment/physical spell power types in export and BreakdownsPanel** — done (#109).

### Editor tools (intentionally out of parity scope)
- ➖ **Item / enhancement-tree / spell / race / class editors** — V3 reads V2's
  XML directly; not on the parity path.

---

## Low-priority remaining

### UI polish
- ✅ **Keyboard shortcuts / print layout / auto-save / drag-and-drop import** —
  done (#69).
- ✅ **L1 — Build history log (V2 `LogPane`)** — done (#101).
- ✅ **UI parity (fifth pass)** — a fresh file-by-file sweep of all 39 V2
  `*Pane.cpp`/`*Dlg.cpp`/`*Dialog.cpp` files against `webapp/src/components/`
  found **no new gaps**: every feature maps to an existing V3 component or a
  legitimate out-of-scope MFC/dev-tool detail (see "Out-of-scope by design"
  below). U1–U11 (see Done table) remain the complete list of ported UI work.

### Forum export gaps

Fifth review pass diffed every `Add*` method in `DDOBuilder/ForumExportDlg.cpp`
against `webapp/src/lib/export/sections.ts`. X1–X9 (see Done table) are
already closed; these are new, some content gaps (not just formatting):

- ❌ **X10 — `specialFeats` forum-export section is dead code.** V2
  `AddSpecialFeats` (`ForumExportDlg.cpp:435-473`) filters
  `Build::SpecialFeats()` by `Type=="Special"`/`"Favor"`. V3's
  `specialFeats` (`sections.ts:639-650`) reads `(build as
  any).specialFeats` — but `specialFeats: string[]` only exists on the
  `Life` type (`types/ddo.ts:631`), not `CharacterBuild`, and
  `ForumExportPanel.tsx`'s `SectionContext` never passes `Life` or
  `build.favorFeats`. The cast is always `undefined`; this section emits
  nothing for every real build (U11's Special/Favor Feats training UI
  writes to the right fields — this is purely an export-plumbing miss).
- ❌ **X11 — `AddSkills` has no V3 equivalent.** V2
  (`ForumExportDlg.cpp:889-1027`) emits a `[code]` monospace grid: skill
  points available per level, per-skill per-level ranks (½ for
  cross-class), Ranks/Tome/Buffed-total columns, and an "Available Points"
  row. V3's `skills` (`sections.ts:312-325`) only prints total ranks + stat
  bonus per skill — the whole per-level breakdown is missing.
- ❌ **X12 — `AddConsolidatedFeats` has different semantics, not just
  formatting.** V2 (`ForumExportDlg.cpp:735-844`) renders a per-level
  `[TABLE]` (Level | Class | Feats) with color-coded slot labels,
  "(Requires Feat Swap with Fred)"/"Alternate:" annotations, ability
  level-ups, automatic feats, and a red level-1 warning for
  Iconic/Archetype mismatches. V3's `consolidatedFeats`
  (`sections.ts:578-594`) just tallies how many times each distinct
  feat-choice value appears build-wide ("FeatName xN") — different content,
  not a formatting gap.
- ❌ **X13 — `AddWeaponDamage` drops most fields.** V2
  (`ForumExportDlg.cpp:1680-1732`) exports Melee Power, Doublestrike%,
  Strikethrough%, main/off-hand damage-ability multiplier, Off-Hand attack
  chance%, Fortification Bypass%, Dodge Bypass%, Helpless Damage%, Ranged
  Power, Doubleshot Chance%, Sneak Attack attack/damage, plus a per-weapon
  effects breakdown. V3's `weaponDamage` (`sections.ts:477-491`) only shows
  dice/crit, to-hit, damage, doublestrike% — roughly 10 fields missing.
- ❌ **X14 — `AddEnergyResistances` wrong type list + no `[TABLE]`.** V2
  (`ForumExportDlg.cpp:1167-1214`) lists Acid/Chaos/Cold/Electric/Evil/
  Fire/Force/Good/Lawful/Light/Negative/Poison/Sonic (Positive/Repair/Rust
  are deliberately commented out), wrapped in `[TABLE]` with one row per
  type always. V3's `energyResistances` (`sections.ts:209-233`) uses
  Fire/Cold/Acid/Electric/Sonic/Force/Light/Negative/Positive/Poison/Repair
  — missing Chaos/Evil/Good/Lawful, wrongly includes Positive/Repair, and
  has no `[TABLE]` wrapping.
- ❌ **X15 — `AddSpellPowers` missing Critical Multiplier column + table
  wrap.** V2 (`ForumExportDlg.cpp:1453-1520`) wraps `[SIZE=3][TABLE]` with
  4 columns (Spell Power/Base/Critical Chance/Critical Multiplier). V3's
  `spellPowers` (`sections.ts:438-454`) still emits flat "Label: power /
  crit X%" lines — no table/size wrap, and Critical Multiplier is dropped
  entirely.
- ❌ **X16 — `AddTacticalDCs` missing table wrap + Evaluation column.** V2
  (`ForumExportDlg.cpp:1734-1756`) wraps `[SIZE=3][TABLE]` with 3 columns
  (Tactical DC/Value/Evaluation — the DC formula breakdown text). V3's
  `tacticalDCs` (`sections.ts:509-523`) still emits flat "  Label: +N"
  lines — no table, no breakdown text.
- ❌ **X17 — Enhancement/Destiny/Reaper tree export sections missing
  headers + tier labels.** V2 (`ForumExportDlg.cpp:1216-1451`) wraps each
  in a colored `[COLOR][SIZE=6]` header with AP totals ("Enhancements: 80
  APs, Racial N, Universal N" / "Epic Destinies: N Destiny Points"), then
  per-tree `[COLOR][SIZE=5]` "TreeName - Points spent: N" with `[HR][/HR]`
  separators, and prefixes each enhancement with its tier ("Core1 "/
  "Tier1".."Tier6") plus "- N Ranks". V3's `enhancements`/`epicDestinies`/
  `reaperTrees` (`sections.ts:379-436`) use plain "[b]…[/b]:" headers — no
  AP totals, tier labels, coloring, or "Points spent" line.

Noted but not itemized above (lower confidence / same shape as X13/X15):
`AddSpells` (`ForumExportDlg.cpp:1522-1645`) has School/CL-MCL/DC/
Average-Critical-Damage table columns and includes fixed (auto-known)
spells; V3's `spells` section (`sections.ts:456-475`) omits both.

---

## Random-build parity fuzzer

`webapp/scripts/randomBuildFuzzer.ts` (see `docs/PARITY_FUZZER.md`) generates
legal random builds (1–3 classes, prereq-valid feats via `lib/featEligibility`,
rule-valid enhancement spends, random gear), exports them as `.DDOBuild`
files with V3 stat snapshots + golden templates, and `compare` diffs V3
against V2 numbers captured on Windows. Use it to *discover* new parity gaps;
each mismatching stat key becomes a todo item here.

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
- ➖ Content-authoring / wiki-crawling dev tools (`CItemImageDialog`,
  `CWeaponImageDialog`, `WikiLinkDlg` — confirmed via `MainFrm.cpp`'s
  "Development" menu handlers, not player-facing)
- ➖ `InventoryDialog`'s paper-doll hit-box gear view — V3's `GearPanel` uses
  a list-based slot layout instead; a visual-paradigm difference, not a
  missing feature

---

*Maintained by the parity-pass series. See PRs #53–#120 and the Done table
above for completed items. Last full V2↔V3 review: 2026-07 (fifth pass) —
five parallel scans covering numerical correctness (`Breakdown*.cpp` vs.
`useBuildStats.ts`/`buildStats.ts`), effect parser coverage (`Effect.cpp` vs.
`effectParser.ts`), UI features (`*Pane.cpp`/`*Dialog.cpp` vs.
`webapp/src/components/`), forum export (`ForumExportDlg.cpp` vs.
`sections.ts`), and data-loading edge cases (`Item.h`/`Build.cpp` vs.
`dataLoaders.ts`/`buildStats.ts`). New gaps found: N10/N11 (percent-effect
rounding mode and `Temporary` bonus-type exclusion in `BreakdownItem.cpp`'s
percentage math), N12/N13 (`<Rank>` gate and `<ApplyAsItemEffect/>` flag on
`Effect` — both honored only at one narrow call site instead of universally),
D3–D7 (Minor Artifact single-equip + gated Artifact Filigree, Docent
Mithral/Adamantine Body armor feat requirement, Legendary Green Steel
auto-stances, `RestrictedSlots`), and X10–X17 (eight forum-export sections
with dead/missing/wrong content: SpecialFeats, Skills grid, Consolidated
Feats semantics, Weapon Damage fields, Energy Resistances type list,
Spell Powers/Tactical DCs table formatting, Enhancement/Destiny/Reaper
section headers). UI-feature parity (U1–U11) and effect-parser Type/AType
switch-case coverage were both reconfirmed complete with no new gaps.*
