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
| 165 | **X19 — CLOSED (for `AddGear`/`AddSimpleGear`): forum-export Gear section now reproduces V2's real per-slot `[TABLE]`, not a bare slot list.** V2 `ForumExportDlg.cpp:1758-1943 ExportGear` (shared by `AddGear`/`AddSimpleGear`) emits a colored `[SIZE=6]` gear-set-name header, a `[SIZE=3][TABLE]` with colored per-slot rows, a "Drops in: <location>" cell, a red "Restricted by another item" row for slot conflicts, per-item buff-description lines (`AddGear` only), augment-slot lines (a yellow "Empty augment slot" warning on an unfilled slot whose type names both Mythic and Reaper, and a selectable-level `+N` suffix), set-bonus lines (struck through + "(Suppressed)" when an augment on the item suppresses them), and minor-artifact/weapon filigree lines (sentient weapon personality first). V3's `gear`/`simpleGear` sections (`sections.ts`) previously emitted only a bare `[b]Gear[/b]:`/`[b]Gear (simple)[/b]:` heading with flat `  slot: item` lines. New shared `exportGearTable()` reproduces V2's exact row shape for both, driven by a new `SectionContext.gearItems` (the resolved gear `Item` catalogue, same shape as the existing `useGearItems(build.gear)` hook, now also passed by `ForumExportPanel.tsx`) and `SectionContext.allAugments` (from `useStaticBundle`) — reusing `gearSlotUpgrades.ts`'s already-exact `resolveAugmentSlots`/`effectiveAugmentChoice` (D2/D9) for the augment-slot list and `itemDisplay.ts`'s already-exact `describeBuff`/`hasSelectableLevels`/`augmentValueAtIndex` (gear hover cards) for buff descriptions and augment tier values — no new stat computation needed. Residual, left out of this pass: `AddAlternateGear` (V3's `alternateGearLayouts` section) shares the same `bSimple=true` exporter per non-active named gear setup in V2, but V3 has no resolved `Item` catalogue for named gear sets yet (only the active `build.gear` is resolved) — `alternateGearLayouts` keeps its pre-existing slot-order + augment-line behaviour (#33) unchanged. 18 new regression tests in `parityPassX19Gear.test.ts`; `forumExport.test.ts`'s SimpleGear-format assertions updated to the new table row shape. | this PR |
| 164 | **U12 — CLOSED: standalone per-tree save/load files.** V2 (`EnhancementsPane.cpp::OnSaveTree`/`OnLoadTree`, ~932-1200; `DestinyPane.cpp::OnSaveTree`/`OnLoadTree`, ~984-1120) lets a player export just the currently-selected Enhancement tree's spend to a standalone `<DDOBuilderTree>` file (`SpendInTree::Write`, `SpendInTree.cpp:165-170`), or a Destiny tree's spend to a standalone `<DDOBuilderDestinyTree>` file — separate from the full-build `.DDOBuild` export and distinct from gear's "named set" clipboard export/import. V3 had no equivalent: `EnhancementTreePanel.tsx`/`EpicDestiniesPanel.tsx` could only ever share a tree as part of a whole build. New `lib/treeFileIO.ts` reuses the exact `<TreeName>`/`<TreeVersion>`/`<TrainedEnhancement>` element vocabulary `v2Export.ts`'s `emitSpendInTree`/`v2Import.ts`'s `parseEnhancements` already write/read for the full-build format, so an exported file round-trips through V2 itself and a real V2-authored `.DDOETree`/`.DDODestinyTree` file loads here. Wired into both panels via new "💾 Save" buttons per tree column and a "Load Tree…" file picker in each panel's toolbar, dispatching new `LOAD_ENH_TREE_FILE`/`LOAD_DESTINY_TREE_FILE` reducer actions that replace the tree's spend and claim an empty slot if it isn't already pinned/selected. 6 new regression tests in `parityPassU12TreeFileIO.test.ts`, including a hand-authored file matching V2's exact `SpendInTree::Write` output shape. | 164 |
| 163 | **X20 — CLOSED: forum-export "Bonuses" section now reproduces V2's `Life::MonitoredBonuses`-driven per-bonus-type table instead of a generic accumulated-stat dump.** V2 (`ForumExportDlg.cpp:1093-1165 AddBonuses`) emits a `[TABLE]` with a fixed 10-column header (Statistic / Enhancement / Insightful / Artifact / Quality / Profane / Equipment / Competence / Exceptional / Festive / Fortune) and one row per name in the active Life's `MonitoredBonuses()` list (`CBonusesPane`'s small, user-curated watch list — real V2 saves populate it, e.g. `Maetrim_EndGameHandwrapsMonk.DDOBuild`'s 23-entry list) that resolves against `breakdownNameMap` (`BreakdownTypes.h:338-464`, ~127 fixed names). Each cell is `BreakdownItem::GetEffectValue(bonusType, /*bItemEffectsOnly*/true)` — deliberately GEAR-sourced contributions only (post Highest-Only stacking), matching that all 10 named types are ones DDO items carry. V3's old `bonusesDump` instead printed every non-zero accumulated stat key with its raw total — an unrelated, V3-invented debug listing with no V2 equivalent, and `Life.monitoredBonuses` didn't exist at all so there was nowhere to store the watch list on import. Fixed: `Life` gains `monitoredBonuses: string[]` (parsed/exported round-trip in `v2Import.ts`/`v2Export.ts`, defaulted to `[]` at every other Life-construction site in `multiLife.ts`/`v1Import.ts`); new `lib/bonusesTable.ts` hand-maps all ~127 `breakdownNameMap` display names to their V3 stat keys (reusing the same key conventions already verified by the X11/X14/X15/X16 export passes — `skill.*`, `resist.*`/`absorb.*`, `sp.*`/`spCrit.*`, `dc.*`, `tacticalDC.*`, …) and reproduces two verbatim V2 quirks: "Dodge Cap" aliases the *same* breakdown as "Dodge" (V2 has no separately-tracked dodge-cap breakdown, unlike MRR) and "Spell Craft"'s display name maps to V3's `skill.Spellcraft` key. `sections.ts`'s `bonusesDump` section now reads `SectionContext.monitoredBonuses` (resolved by `ForumExportPanel.tsx` from the active Life, same pattern as X10's `specialFeats`) and emits V2's exact table. 9 new regression tests in `parityPassX20Bonuses.test.ts`; `parityPass5.test.ts`'s stale "Accumulated Bonuses" assertion (written against the old debug-dump format) updated to match. | this PR |
| 162 | **D9 — an augment's cascading extra-slot fields (`AddAugment`/`GrantAugment`/`GrantConditionalAugment`) now unlock further augment slots.** V2 (`Augment.h:41-44`, applied via the shared `AddAugment()` helper in `GlobalSupportFunctions.cpp:1967-2010`, called from `ItemSelectDialog.cpp:730-760`/`FindGearDialog.cpp:608-635`) lets selecting certain augments append one or more *new* augment slots to the host item — the mechanic behind Legendary Alchemical crafting (`Alchemical.Augments.xml`: picking a material in the "Legendary Alchemical Material" slot adds a "Legendary Alchemical Tier 1" slot, which cascades to Tier 2), Thunderforged (`GrantConditionalAugment` gates a bonus Red slot on Two Handed weapons via `WeaponClass`), and Legendary Green Steel Heroic. `gearSlotUpgrades.ts`'s `resolveAugmentSlots` only implemented the unrelated `<SlotUpgrade>` mechanism (D2) — no consumer of `AddAugment`/`GrantAugment`/`GrantConditionalAugment` existed anywhere in `webapp/`, so any Alchemical/Thunderforged/Greensteel-Heroic item exposed only its native slot(s) and could never reach its higher-tier slots or effects. Fixed: `Augment` gains `AddAugment`/`GrantAugment`/`GrantConditionalAugment`/`WeaponClass` fields (parsed automatically — `loadAugments` already casts the raw XML directly); `resolveAugmentSlots` now takes the build's `augmentChoices` + the Augments/WeaponGroups catalogues and, after computing the native + SlotUpgrade slots, iterates every already-resolved slot's currently-chosen augment and appends one synthetic slot per `AddAugment` entry / `GrantAugment` / weapon-class-gated `GrantConditionalAugment` not already present on the item — looping over its own growing result so a cascade (Material → Tier 1 → Tier 2) resolves in one pass, matching V2's insert-before-Mythic-else-append ordering (V3 models no Mythic slot, so this is always append). `GearPanel.tsx` passes the new context through; since `AugmentSlot` already renders generically from whatever `resolveAugmentSlots` returns (same mechanism the D2 SlotUpgrade slots use), no new UI code was needed — the picker's existing `/api/augments?type=X` lookup already matches synthetic tier-slot type strings generically. 10 new regression tests in `parityPassD9AugmentCascade.test.ts`. | this PR |
| 161 | **D10 — augment `Effect_AddGroupWeapon`'s `ReplacedDynamically` placeholder is now substituted with the host item's weapon type.** V2 (`Build.cpp:5024-5031`/`5210-5217`) substitutes the trailing `ReplacedDynamically` `<Item>` of an augment's `AddGroupWeapon` effect with the augmented item's own weapon type at apply time — the mechanism behind `DeckOfManyCurses.Augments.xml`'s "Curse of Divine Fortune" ("considered a Favored Weapon"). `buildRuntimeGroupAdds` never scanned augment effects at all (only feats/enhancements), so this silently did nothing. Fixed by scanning `build.augmentChoices` alongside feats/enhancements and substituting the placeholder with `gearItems[slot].Weapon` before parsing. 4 new tests in `parityPassD10AugmentGroupWeapon.test.ts`. | this PR |
| 160 | **D8 — `Build::VerifyGear` item-revocation pass** — V2 (`Build.cpp:2623-2665`) force-unequips any equipped item whose `MinLevel` exceeds the build's character level or whose `<Requirements>` (race/class/feat/alignment gates) are no longer met, stripping its effects/augments/set-bonus contributions too. V3 had no equivalent; a race/level-restricted item (e.g. an imported V2 save, or one reachable via a race/level change) kept contributing forever. New `buildStats.ts` block reuses the `gearSlotsRemovedByV2` mechanism (same pattern as D3/D4/D7) and the shared `meetsRequirements` engine. 5 new tests in `parityPassD8VerifyGear.test.ts`. | this PR |
| 159 | **N15 — `Effect_SpellPowerReplacement` was parsed but never consumed, so cross-element spell power substitution never happened** — V2 (`BreakdownItemSpellPower.cpp:68-79,296-333` `ReplacementTotal()`/`IterateList()`) lets a trained effect declare that one spell-power element substitutes for another whenever the alternate is higher (Tiefling's "Infernal Sovereign" — "use Fire Spell Power in place of Acid if it is higher, and vice versa"), and only the raw spell-power breakdown is affected (crit chance/multiplier breakdowns never register the replacement listener in V2, so they are untouched). Two bugs: (1) real V2 data always tags this effect `AType=NotNeeded`, so `resolveValue` returned `null` and the effect was dropped before ever reaching the `SpellPowerReplacement` case in `effectParser.ts`'s switch — it never even parsed. (2) the parsing itself collapsed each effect's `Item[0]` (the type this effect is declared under) and `Item[1]` (its alternate) into two independent `spellPowerReplacement.<element>` markers with no pairing, so even if reached there was no way to know which element could substitute for which. Fixed by intercepting `SpellPowerReplacement` before the AType-null gate (matching the pattern already used for `SaveBonusAbility`/`GrantFeat`/etc.) and emitting a paired `spellPowerReplacement.<self>.<alt>` marker; added `replacementSpellPower()` (`lib/spellPowerRow.ts`, exported) that takes `max(own, ...alternates) + Universal` and is now used by both the Breakdowns panel (`spellPowerRowValues`) and the forum export's `SpellPowers` section (`sections.ts`), replacing their previous identical-but-incomplete `sp.<key> + sp.Universal` inline math. 9 new regression tests across `effectParser.test.ts`, `spellPowerRow.test.ts`, `parityPassX15SpellPowers.test.ts`. | this PR |
| 158 | **AP spent in a tree the build can no longer reach stayed on the books** — swap a class out (a Rogue/Alchemist rebuilt into Monk / Sacred Fist) and the points spent in Assassin and Vile Chemist have nowhere to live. V2 refunds them the moment `CEnhancementsPane::DetermineTrees` (EnhancementsPane.cpp:340-374) re-determines the tree list — any selected tree that no longer meets its requirements gets `Build::Enhancement_ResetEnhancementTree`, "no user confirmation for this as they have already changed the base requirement that included the tree. All APs spent in this tree have to be returned to the pool of those available." V3's panel pruned only the PINNED list, so the spend survived in the document: invisible (no tree on screen owned it), still counted in the panel's "N / 80 AP" header (a user-reported build read 16 AP spent with nothing to show for it — Assassin 9 + Vile Chemist 7), and still feeding its effects into the engine (that build kept the Assassin sneak-attack die). New `lib/enhancementSpend.ts` holds the one copy of the AP-cost arithmetic that `EnhancementTreePanel`/`EpicDestiniesPanel`/`ReaperPanel` had each duplicated (and which the engine could not see at all); new `treeAvailability.orphanedEnhancementTrees` reports trees holding spend the build cannot reach, evaluated with account-unlock feats assumed and returning nothing when the tree or class catalogue is empty (the #142 guard — a still-loading catalogue must never orphan a whole build). The panel now refunds them exactly as V2 does, logging "…no longer available to this build — N AP refunded", and `buildStats` ignores their effects for a build whose panel has not been opened since the change. 12 new tests in `orphanedEnhancementSpend.test.ts` + `orphanedSpendPanel.test.tsx`. | this PR |
| 157 | **Iconic past-life stances had no toggle, and their name collided with the race auto-stance** — every iconic race file carries an `Acquire=IconicPastLife` feat hosting a `Group="Iconic"` stance (V2 `Life::AllSpecialFeats` → `NotifyNewStance`) whose toggle is what applies that past life's bonus: the effects are gated on `Requirement Type="Stance"` (+2/4/6% Doublestrike for Aasimar Scourge, +10/20/30 spell power for Bladeforged/Morninglord/Deep Gnome, Razorclaw Shifter's attack/damage, Tabaxi's tactical DCs, …). V3 recorded the past lives but `collectDynamicStances` only scanned trees/items/spells/`featChoices`, so no toggle existed and none of those bonuses could ever apply. Worse, V2 names these stances `"<Race> "` with a TRAILING SPACE precisely so they stay distinct from the auto-stance V2 generates for the race itself, and fast-xml-parser's `trimValues` collapsed the two onto one name — so BEING an iconic race silently granted that race's past-life stance bonus with no past life and no toggle. `dataLoaders.restoreIconicStanceNames` puts the space back on the stance and, together with it, on the `Stance` requirement items inside the same feat; `collectDynamicStances` now surfaces one toggle per acquired iconic past life (accepting both `pastLives` key conventions — the panel writes the race name, the V2 importer the whole feat name); and the engine maps a persisted/imported trimmed name onto the iconic stance so existing saves keep their bonus (the build's own race name is still filtered out by `autoFamily`, so being the race grants nothing). V2's "Iconic" group is single-selection, which V3's existing group rule already enforces — lighting one puts the others out. 15 new tests in `iconicPastLifeStances.test.ts` + `iconicStancePanel.test.tsx`. | this PR |
| 156 | **Auto stances never showed as active, and could not be tried on** — `<AutoControlled/>` is an XML FLAG that fast-xml-parser turns into `""`, so `StancesPanel`'s `s.AutoControlled` filter matched none of Stances.xml's 30 entries: the pane's "Automatic" section was permanently empty and every auto stance (Single Weapon Fighting, Light Armor, Sword and Board, …) rendered as an unlit hand-toggle whose clicks the engine's auto-stance families then discarded. Three fixes. (a) `isAutoControlled()` (flag semantics, same rule as `effectParser`'s `flagSet`) classifies them correctly, and `BuildStats.activeStances` publishes the settled stance set — the same one every stance-gated effect is evaluated against — so the pane shows what is actually live, including the derived stances V2 generates buttons for (wielded weapon type, race, Green Steel dominance, alignment). (b) `useStaticBundle` now fetches `/api/stances`, which nothing in the app did: `BuildStatsInput.allStances` was always `undefined` outside tests, so the data-driven `Group=Auto` pass (V2 `CStanceButton::Evaluate`) never ran in the live app at all. With it wired, and with `GroupMember`/`GroupMember2`/`ItemTypeInSlot`/`WeaponTypesEquipped` promoted to honestly-evaluated requirement types (the stance context now carries the per-slot item types, moved ahead of the stance pass), the gear-gated half of the catalogue — Staff, Sword and Board, Axe, Thrown Weapon, Unarmed, Swashbuckling — auto-activates as it does in V2 instead of being skipped as unmodelled. Verified no-change against the golden `exampledps` build/export. (c) New `build.stanceOverrides` (V3-only; V2's Auto buttons are read-only) forces an auto stance on or off for testing — applied both before the fighting-style/Centered derivation, so a forced stance feeds the stances derived from it, and after every auto pass, so a forced-off one stays off. 18 new tests in `autoStanceToggles.test.ts` + `stancesPanelAuto.test.tsx`. | this PR |
| 155 | **X18 — forum-export "Spells" section had no V2 table at all — printed flat "Level N: Name, Name" lines under a `[b]Spells[/b]:` heading** — `ForumExportDlg.cpp:1522-1645 AddSpells`/`AddSpellList` emit, per spellcasting class, `"<Class> Spells\r\n"` followed by a `[SIZE=3][TABLE]` with 7 columns (Level / Spell Name / School / CL/MCL / DC / Average Damage / Critical Damage) — one row per fixed + trained spell, CL/MCL only populated when the spell has `SpellDamageEffects` (else "-"), and DC reading only the *first* `SpellDC` block (`Spell::DC` → `DCs().front()`, unlike the live Spells panel which shows the max across blocks). Rewrote V3's `spells` section (`sections.ts`) to emit V2's table structure, reusing the already-verified `computeSpellDC`/`computeCasterLevel`/`computeMaxCasterLevel` helpers from `lib/spells/spellMath.ts` (the same functions the live Spells panel uses) — no new stat computation needed for School/CL/MCL/DC. `SectionContext` gains an `allSpells?: Spell[]` field, wired from `ForumExportPanel.tsx`'s existing `useStaticBundle()` bundle. Left out, undocumented in V3's data model: fixed/auto-known spells (V2's `Build::FixedSpells`, no V3 equivalent) and the Average Damage / Critical Damage columns (`SpellDamage::AverageDamageText`/`CriticalDamageText`, which need a full Dice-per-caster-level model V3 doesn't have — same scoping decision as X13's per-weapon effects breakdown; both columns always render "-"). 7 new regression tests in `parityPassX18Spells.test.ts`. | this PR |
| 154 | **X16 — forum-export "Tactical DCs" section emitted a flat 13-entry `TacticalType` enumeration instead of V2's real per-DC table** — `ForumExportDlg.cpp:1734-1756 AddTacticalDCs` wraps a `[SIZE=3][TABLE]` (Tactical DC / Value / Evaluation columns) and emits one row per `DC` object currently granted by a trained feat or enhancement (`CDCPane`'s active-button list, built from `DC.h`/`DC.cpp` — Trip, Sunder, Stunning Blow, the universal "Attack" feat's Intimidate/Diplomacy/Bluff, Silver Flame Exorcism, and ~140 tree-granted tactical DCs across Rogue Assassin poisons, Ninja Spy ki strikes, etc.), each row's Value/Evaluation text built from `DC::CalculateDC`/`DC::DCBreakdown`. V3's `tacticalDCs` section instead summed `tacticalDC.All + tacticalDC.<Type>` over a fixed 13-type list with no table and no per-DC identity — an entirely different (and V2-inaccurate) shape, since V2 has no such umbrella listing. Added `types/ddo.ts`'s `DC` interface (+ `DC?` on `Feat`/`EnhancementTreeItem`/`EnhancementSelection`) and new `lib/dcBreakdown.ts`: `collectActiveDCs` reconstructs V2's active-DC list from the build's final trained state (player/auto/granted feats + enhancement/destiny/reaper spends, de-duplicated by Name+Icon with stack counting, mirroring `CDCPane::AddDC`/`DC::operator==`), and `calculateDCValue`/`dcVersusText`/`dcEvaluationText` replicate `DC::CalculateDC`/`DC::DCBreakdown`'s exact arithmetic and text (Max(...)/Max Mod(...) ability composition, `ClassLevel`/`BaseClassLevel`/`HalfClassLevel` scaling via the already-exact `classLevelsAtLevel` helper, the `0.5→½` byte substitution) — including a verbatim V2 quirk where a multi-ability `Max(...)` block that is the first printed component leaves no `" + "` separator before the next one (`DC.cpp`'s `size() > 1` branches never clear the `first` flag). Rewired `sections.ts`'s `tacticalDCs` section onto this new module; the old fixed-enumeration logic and its `V2_TACTICAL_TYPES` table are gone. `parityPassX4.test.ts` (X16's predecessor pass) updated to the new API shape; 10 new regression tests in `parityPassX16TacticalDCs.test.ts`. | this PR |
| 153 | **X12 — forum-export "Consolidated Feats" section had different semantics from V2, not just formatting** — `ForumExportDlg.cpp:735-844 AddConsolidatedFeats` renders a per-level `[TABLE]` (Level | Class | Feats) with color-coded feat-type/name `[COLOR]` pairs, a yellow "Alternate: " annotation, a yellow ability-level-up row per level, and a red level-1 warning when the build's starting class differs from the race's Iconic class. V3's `consolidatedFeats` just tallied how many times each distinct feat choice appeared build-wide — unrelated content. Rewrote to emit V2's per-level table, reusing the already-exact `buildSlots`/`getLevelClasses`/`classLevelsAtLevel` helpers (items U7/X9/X11) and the previously-unwired `build.alternateFeats` state; byte-reproduces a verbatim V2 quirk (the ability-level-up row's plain-text name leaking outside its `[TD]` tag). Feat-swap warnings and per-level automatic-feat placement are left out — genuinely unmodeled in V3, with automatic feats staying visible in the separate `automaticFeats` section. 7 new regression tests in `parityPassX12ConsolidatedFeats.test.ts`. | this PR |
| 152 | **X13 — forum-export "Weapon Damage" section dropped ~10 of its fields, keeping only a V3-invented dice/crit/to-hit/damage/doublestrike summary that has no V2 equivalent** — `ForumExportDlg.cpp:1680-1732 AddWeaponDamage` always emits a fixed scalar block (Melee Power, Doublestrike%, Strikethrough%, Mainhand/Offhand damage-ability multiplier, Off-Hand attack Chance%, Fortification Bypass%, Dodge Bypass%, Helpless Damage bonus%, Ranged Power, Doubleshot Chance%, Sneak Attack Attack bonus, Sneak Attack Damage `Nd6+M`), each numeric/percent field truncated to a whole number via `AddBreakdown`. Rewrote V3's `weaponDamage` section to emit V2's exact block, reusing the already oracle/golden-verified stat keys (`melee.power`, `ranged.power`, `melee.doublestrike`, `melee.strikethrough`, `offhand.attack`, `fortBypass`, `helpless`, `ranged.doubleshot` — items #106/#137) plus three previously-parsed-but-unsurfaced keys (`melee.damageAbilityMult`, `offhand.damageAbilityMult`, `dodgeBypass`) and the sneak-attack triad (`melee.sneakAttack`, `melee.sneakDice`, `melee.sneakDamage`) — no new stat computation needed. The per-weapon effects breakdown (On Hit/Critical damage lines, DR Bypass, Ghost Touch/True Seeing) has no V3 stat model yet and is left for a future pass. 6 new regression tests in `parityPassX13WeaponDamage.test.ts`. | this PR |
| 151 | **X11 — forum-export "Skills" section had no per-level breakdown, only whole-build totals** — `ForumExportDlg.cpp:889-1027 AddSkills` always emits a `[code]`-wrapped monospace grid: a per-level "Skill Points" budget row, a level-number header, one row per V2 skill (raw per-level trained count for class skills, ½-rank multiples for cross-class — reading `LevelTraining::TrainedSkills()`), trailing Ranks/Tome/Buffed columns, and an "Available Points" row. V3's `skills` section only printed non-zero "skill: N ranks (+M)" free-text lines with no per-level data at all. Rewrote to emit V2's exact grid, sourcing per-level data from the existing `getLevelTrainingEntries` helper (Done item U7/#62) and the Ranks/Tome/Buffed columns straight from the already-V2-exact `skill.<Name>` stat (items #21/#64/#106) — no new stat computation needed. 11 new regression tests in `parityPassX11Skills.test.ts`. | this PR |
| 150 | **X17 — Enhancement/Destiny/Reaper tree export sections had plain "[b]...[/b]:" headers, no AP/Destiny-Point totals, no tier labels, no Points-spent line** — `ForumExportDlg.cpp:1216-1451` (`AddEnhancements`/`AddEpicDestinyTree`/`AddReaperTrees` + their per-tree `AddEnhancementTree`/`AddEpicDestinyTree`/`AddReaperTree` helpers) wrap each section in a `[COLOR=rgb(184, 49, 47)][SIZE=6]` header (Enhancements: hardcoded "80 APs" plus Racial/Universal bonus AP when present; Epic Destinies: the Destiny Point total; Reaper: no total), then one `[COLOR=rgb(65, 168, 95)][SIZE=5]TreeName - Points spent: N[/SIZE][/COLOR]` block per trained tree terminated by `[HR][/HR]`, prefixing each enhancement with its tier ("Core1 ".."Core6 " / "Tier1 ".."Tier6 ", from `YPosition`/`XPosition`) and a " - N Ranks" suffix for multi-rank items. V3's `enhancements`/`epicDestinies`/`reaperTrees` sections (`sections.ts`) printed flat `[b]…[/b]:`/`  tree:`/`    name (rank)` lines with no coloring, AP totals, tier labels or spent totals. Rewrote all three to emit V2's exact headers and per-tree blocks, reusing the existing `computeBonusActionPoints` (racial/universal AP) and `destinyPoolForBuild` (Destiny Points) helpers and a tree-cost calculation mirrored from `EnhancementTreePanel.tsx`'s `costUpToRank`. Also reproduces a verbatim V2 quirk: the Reaper-tree Ranks suffix reads the item's max `Ranks()`, not the trained rank, unlike the Enhancement/Epic Destiny emitters. `SectionContext` gains an `allTrees?: EnhancementTree[]` field, wired from `ForumExportPanel.tsx`'s existing `useStaticBundle()` bundle. 7 new regression tests in `parityPassX17TreeHeaders.test.ts`. | this PR |
| 149 | **X15 — forum-export "Spell Powers" section had no table, no Critical Multiplier column, a spurious Universal row, and dropped 5 fixed rows' worth of always-emitted content** — `ForumExportDlg.cpp:1453-1520 AddSpellPowers`/`AddSpellPowerToTable` always emit a `[SIZE=3][TABLE]` with 16 fixed rows (no Lawful row; "Force/Untyped" reads the Force breakdown, a separate "Untyped" row reads Untyped) and 4 columns including a `(int)`-truncated Critical Multiplier; V3's `spellPowers` section only printed non-zero "Label: power / crit X%" lines with its own extra Universal row and no multiplier column. Rewrote to emit V2's exact 16-row table, folding Universal power/crit/crit-multiplier additively into every row instead of a standalone one. 8 new tests in `parityPassX15SpellPowers.test.ts`; `parityPassX6.test.ts` updated to match the corrected row format. | this PR |
| 148 | **X14 — forum-export "Energy Resistances" section used the wrong type list and no table wrapping** — `ForumExportDlg.cpp:1167-1214 AddEnergyResistances` always emits a `[TABLE]` with fixed rows for Acid/Chaos/Cold/Electric/Evil/Fire/Force/Good/Lawful/Light/Negative/Poison/Sonic (Positive/Repair/Rust deliberately excluded), Resistance + Absorbance shown for every row even at 0; V3's `energyResistances` section used an 11-type list missing Chaos/Evil/Good/Lawful and wrongly including Positive/Repair, only printed non-zero rows as free text, and dropped the table entirely. Rewrote to emit V2's exact 13-row table. 6 new tests in `parityPassX14EnergyResistances.test.ts`; `parityPassX3.test.ts` updated to match the corrected row format. | #208 |
| 147 | **D6 — Legendary Green Steel "Dominant" stances never auto-activate** — `StancesPane.cpp:1053-1160 UpdateGreensteelStances` parity: with 2+ equipped Green Steel items, the highest Dominion/Escalation/Opposition Set Bonus stack count (or Ethereal/Material at 4+ items) auto-activates as a mutually-exclusive stance, gating `SetBonuses.xml`'s already-`Requirement Type="Stance"`-gated effects. Added `Item.IsGreensteel`, `deriveGreensteelStances` + shared `computeSetBonusCounts` in `buildStats.ts`, merged into `ctxStances` ahead of gear/set-bonus resolution. 9 regression tests in `parityPassD6Greensteel.test.ts`. | this PR |
| 146 | **X10 — forum-export "Special Feats"/"Favor Feats" section was dead code** — it read a `specialFeats` field that only exists on `Life`, cast off `CharacterBuild` (always `undefined`), so it emitted nothing for every real build; `build.favorFeats` was never read either. `SectionContext` gains a `specialFeats?: string[]` field resolved by the caller from the active `Life` (mirrors `useBuildStats`'s existing pattern); `ForumExportPanel.tsx` wires it via `useDocument()`/`findActiveLife`. Section now emits "Special Feats" (from `ctx.specialFeats`) and "Favor Feats" (from `build.favorFeats`) as two headed blocks with V2's `Name(N)` duplicate-count suffix. 4 regression tests in `parityPassX10SpecialFeats.test.ts`. | this PR |
| 145 | **D7 — item-level `RestrictedSlots` slot exclusion** — an equipped item can force other inventory slots empty while it's worn (V2 `Item.h:73`/`Build::SetGear`/`EquippedGear::IsSlotRestricted`) — e.g. Shining Crescents clears the off hand, Platinum Knuckles clear Gloves. V3 had no such enforcement; the restricted slot's item (and its augments/set bonuses) kept contributing. Added `Item.RestrictedSlots`, wired into `buildStats.ts` through the existing `gearSlotsRemovedByV2` mechanism (same pattern as the D3 Minor Artifact / off-hand two-handed-weapon rules). 4 regression tests in `parityPassD7RestrictedSlots.test.ts`. | this PR |
| 144 | **Optimizer targets every Analysis stat; tooltips stay on screen; Plugins tab** — (a) the optimizer's objective picker offered a hand-written list of 41 stats while Analysis showed far more. Breakdown rows now carry the engine key behind them (`StatRowData.statKey`) and `optimizerStatsFromSections` turns the live sections into objectives, so anything readable in Analysis is targetable — 99 options against the previous 41, and the two cannot drift apart. Composite rows (a base save plus its sub-save, fixed display values) have no single key and are correctly skipped. (b) The breakdown hover tooltip was pinned at cursor + 14px with no regard for the viewport, so every row in the right-hand Analysis rail opened its tooltip off the right edge. It now measures itself, flips side when the preferred one does not fit, slides up off the bottom edge, and caps its height so a long bonus list scrolls inside the box. (c) New top-level **Plugins** page for the dungeon-help plugins, rendering from a data catalogue (`pluginCatalogue.ts`) so adding one is a single entry — shipped empty, since inventing plugin names and download links would be worse than an honest empty state. | this PR |
| 143 | **Session restore, and Custom › Windows layout stops resurrecting closed windows** — (a) the working document is now snapshotted to `localStorage` on every edit (`lib/sessionStore`, debounced, independent of the auto-save setting) and restored on startup, so a refresh no longer drops you onto a fresh level-1 character. It is deliberately separate from the saves list: this is the one "what I had open" record, saved or not. localStorage rather than a cookie — a document with gear is tens of kilobytes, well past the ~4 KB cookie cap, and cookies would ride along on every request. (b) The dashboard rebuilt its window list from the `wins` array captured by the render that created each handler; a `ResizeObserver` callback belonging to a closed window then wrote that stale array back, resurrecting the window and discarding everything since — and three quick closes in a row would undo each other. Every mutation is a functional update now, and a patch for a window that no longer exists is dropped. Also: an empty stored layout is honoured instead of falling through to the six defaults (closing every window used to bring them all back on reload), and layouts are keyed per signed-in account, a fresh account inheriting the signed-out arrangement once as its starting point. | this PR |
| 142 | **V2 import silently revoked every enhancement, destiny and reaper point** — `importFile` is memoised, and its dependency array was empty, so it captured the FIRST render's `allTrees` — the still-loading, empty catalogue — for the lifetime of the component. V2's tree-version gate counts a missing tree as version 0, so with an empty catalogue every tree in every imported file looked missing, every spend version-mismatched, and all three spend pools were revoked. The build arrived with its gear, feats and levels intact and not one point spent anywhere (a 34-life Warlock imported as 0/75 destiny points). Three fixes: `v2Import` refuses to gate on an empty catalogue at all (with no data to judge against, keeping a stale spend is recoverable and wiping a build is not); `importFile` lists `allTrees` as a dependency and awaits `preloadStaticBundle()` when the hook's copy is still empty; and the importer's warnings — which the V2 path had been discarding — now reach the build log, so a genuine revocation is visible instead of silent. Verified against 24 user-supplied V2 saves. | this PR |
| 141 | **Layout pass: analysis rail, one Equipment page, favor-unlocked trees, themed scrollbars** — (a) `AnalysisDock` puts Breakdowns / Combat / DCs / Bonuses / Compare in an always-visible RIGHT rail with a width toggle for the table-heavy sections; the Analysis top-level page is gone, and `FavoritesDock` with it (the Breakdowns panel's own ★ Favorites section covers that, and two right rails cannot coexist). Together with the left stance rail, toggles sit on one side and their consequences on the other. (b) Equipment is one page — gear, filigrees, set bonuses and clickies are all "what am I wearing", and set bonuses only make sense beside the gear granting them; `TopNav` now hides the sub-tab row when a page has a single section. (c) Feydark Illusionist, Falconry, Harper Agent, Horizon Walker, Inquisitive and Vistani Knife Fighter were never listed: they gate on an ACCOUNT unlock (patron favor, or the tree-access feat it grants), which V2 requires the build to record first. `availableEnhancementTrees` now assumes a tree's own `Feat` requirements — and only those, so class and race gating is untouched — with the picker labelling such trees "favor unlock"; `{ assumeUnlockFeats: false }` keeps strict V2 parity for oracle work. (d) Global themed scrollbars (Firefox `scrollbar-*` plus the WebKit pseudo-elements): the default grey OS slab against the navy UI read as a rendering artefact on every scrolling panel. | this PR |
| 140 | **Stances and buffs move to an always-visible left rail** — stances and buffs are the shallowest choices in the app (one click, no cost, no prerequisite) and they move half the numbers on screen, yet they sat on their own Analysis tabs, so checking what a stance did to a breakdown, a DC or a weapon meant navigating away from the thing you were reading. `StanceBuffDock` puts Stances at the top of a sticky left rail with Self &amp; Party Buffs and Guild Buffs directly below it, on every page — mirroring the existing FavoritesDock on the right, and collapsible/remembered the same way. The Analysis `Stances` and `Buffs` tabs are gone rather than duplicated: two places to toggle the same stance is the confusion this removes. The rail hosts the unmodified panel components (the same ones Custom › Windows opens), so there is no second implementation to drift. Below 1100px the row wraps and the rail goes full-width above the page instead of squeezing it. | this PR |
| 139 | **Optimizer: content domains + a long-term plan alongside greedy** — three new domains, all additions-only like the rest: **augments** (empty augment slots on equipped items, level-capped to the host item, fixed slots skipped), **gear upgrades** (a colour for an item's one-time `SlotUpgrade`, which then opens an augment slot the augment domain fills next round — irreversible, as in V2), and **filigrees** (empty weapon and artifact slots; artifact slots gate on an equipped Minor Artifact, and a filigree already slotted is never offered twice so its set-bonus count cannot be multiplied). Second, the search is no longer only greedy: `longTerm.ts` scans the MinSpent-gated items at the tops of every accessible tree (`gatedTreeTargets`, round-robin across trees so the scan is not truncated to whichever tree the generator emits first), evaluates each with its gate waived, keeps the few that would pay off as explicit goals, then runs a beam over several partial builds at once — reserving a share of each expansion for goal-tree moves, tie-breaking equal-scoring branches by points already sunk toward a goal, and judging a branch by where it ENDS UP so a flat climb to a capstone survives. Both strategies now sit on one shared engine (`engine.ts`) so a build scores identically under either, and `plan.ts` runs both on a split budget and reports a winner. On a Fighter/hit-points objective where no single enhancement helps, greedy gains 0 and the long-term plan finds +33; on a melee-power objective greedy's bridge phase still wins — which is the point of showing both. | this PR |
| 138 | **Upstream sync to V2 2.0.0.83 — percent HP/AC re-plumbed** — upstream moved every percentage hitpoints and AC effect off the `<Percent/>` flag onto two new effect types (`Effect_HitpointsPercent`, `Effect_ACPercent`), each feeding its own `BreakdownItemSimple` (`Breakdown_HitpointsPercent`, `Breakdown_TotalACPercent`) whose *total* is then applied to hitpoints / AC as a single percent other-effect; the old hitpoints-only `DoAllPercentsAtOnce()` path is gone and `DoPercentageEffects` now rounds half-up (`+ 0.5` before the int cast), as do the armor/shield AC percent lines. 79 `HitpointsPercent` + 45 `ACPercent` uses landed in the synced data (enhancement trees, filigree sets, augments, SetBonuses, ItemBuffs), so without the V3 side they silently vanished — the golden build lost 645 HP. V3: `effectParser.ts` maps both types to `hp.percent`/`ac.percent` pools, `buildStats.ts` resolves each pool and injects one aggregated percent bonus, drops the hp-combines-first special case, and rounds half-up everywhere. `v2calc`'s headless breakdown host registers the two new breakdowns so the oracle stays authoritative; it confirms the new numbers (golden build hp 2798, fortBypass 85 — the committed 2.0.0.81 forum export is stale for those two and is now overridden with a documented `STALE_EXPORT` map). Data: 73 changed + 268 new files, 37 images; C++: 16 files via `git apply --3way`. | this PR |
| 137 | **Golden-export Weapon Damage section parsed + pinned** — `parseV2Export.ts` never parsed V2's "Weapon Damage" forum-export block (`ForumExportDlg.cpp::AddWeaponDamage`: Melee/Ranged Power, Doublestrike, Strikethrough, Off-Hand attack Chance, Fortification Bypass, Dodge Bypass, Helpless Damage bonus, Doubleshot Chance), so none of those 8 values were ever regression-checked against the real V2 export, and the "2026-07-19 user cc1-gearset export diff" todo item (Fortification Bypass 84 vs V2 71, unexplained MP/PRR/MRR delta) stayed 🟡 with no way to re-verify it. Added label→V3-stat-key maps and parsing for the section's plain `Label: value`/`Label: value%` lines. Re-running the golden test against the committed `exampledps.DDOBuild`/`exampledps.cc1.v2export.txt` fixture (the same save the 🟡 item described) shows all 8 values now match V2 exactly — the underlying bugs were already closed by #117 (fortBypass Highest-Only) and the pass 121-133 stance/PRR/MRR work; the diff item just never got a regression test to confirm it. New pinned assertion in `parityGoldenPass106.test.ts`; item closed below. | this PR |
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
| 41 | **Upload-time V2 math verification** — every V2 `.DDOBuild` import now fires a background check: the raw XML is POSTed to `POST /api/parity-check`, the server runs the `v2calc` oracle (V2's own compiled C++ math, headless) and V3's `computeBuildStats` over the same build, and diffs every stat the oracle emits. The oracle↔V3 stat mapping moved out of `scripts/oracleDiff.ts` into shared `lib/oracleParityRows.ts` + `server/oracleParity.ts` (one source of truth for the CLI referee and the live endpoint). Verdict surfaces in a TopNav `ParityBadge` (✓ N/N stats match, or an expandable V2-vs-V3 diff table). Degrades to "check n/a" when the oracle binary isn't built (`make -C v2calc`). Also fixes a 2.0.0.82-sync oracle regression: upstream's new `VerifyTrainedFeats()` call in `Build::BuildNowActive` revoked valid feats under the headless UI stubs (81/151 corpus builds drifted — style feats, HP, tumble charges); now guarded `#ifndef V2CALC_LINUX`. Known limitation: builds with exotic stance-stack setups can report shim-side diffs the real V2 UI doesn't have (pre-existing `AutoStancesLinux` gap). | this PR |
| 40 | **Level-36 builds (legendary levels 5+)** — importers sliced legendary `LevelTraining` rows at 34 (`slice(30, 34)`), silently dropping levels 35-36 of a level-36 build: 2× Legendary Power (−12 melee/ranged power, −12 universal spell power), 1× Legendary Knowledge (−1 caster/max-caster level for all 20 classes), class HP, and the L36 ability level-up (−1 STR → Jump/Swim/tactical DCs). Fixed to `slice(30, 40)` (V2 `MAX_BUILDER_LEVEL` = 40) in `v2Import`/`v1Import`; `LEGENDARY_MAX_LEVELS` 4 → 10. `destinyPointPool` `BUILD_START_LEVEL` 34 → 36 (verified against upstream Maetrim/DDOBuilderV2 `stdafx.h`). Off-hand doublestrike derived base (50% of main-hand doublestrike, 65% with Perfect Two Weapon Fighting — V2 `BreakdownItemOffhandDoublestrike.cpp:44-77`) now added in `buildStats` phase 2.5 so the stat/breakdown shows it; `attackEntry` consumes the stat instead of re-deriving. Verified against a live V2 BreakdownsPane dump of a L36 Monk 3 / Dragon Lord 5 / Rogue 12: 228/230 stats now match (the 2 remaining are data-file drift vs the user's newer DDO data, confirmed via the v2calc oracle). | this PR |
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
| 117 | **Set bonuses / filigrees / self-buffs / guild buffs bypassed Highest-Only stacking** — V2 `Build::NotifyItemEffect` (`Build.cpp:672-708`) is called by `ApplySetBonus` (`:5267-5276`), `ApplyFiligree` (`:5225-5262`, normal + rare), `NotifyOptionalBuff` (`:6065-6074`, self/party buffs), and `ApplyGuildBuffs` (`:5967-6062`) alike — all four join `m_itemEffects`, the pool `RemoveNonStacking` (`BreakdownItem.cpp:730-789`) applies "Highest Only" bonus-type dedup to, purely by bonus type name (source-agnostic — even two effects on the same item collide). V3's `buildStats.ts` called `addParsed()` for these four accumulators without `fromGear=true`, landing them in the "always stacks" bucket instead — so any Highest-Only type (Enhancement/Insightful/Legendary/Artifact/etc.) granted by a set bonus, filigree, self-buff, or guild buff incorrectly stacked on top of a gear/augment bonus of the same type rather than the higher one winning (matches the reported cc1-gearset Fortification Bypass 84-vs-71 over-count in "Golden-build residue" below). Fixed: `addParsed(..., true)` at the four call sites (`buildStats.ts` `accumulateSetBonuses`/`accumulateFiligreeSlots`/`accumulateFiligrees`/`accumulateSelfBuffs`/`accumulateGuildBuffs`). Also updated `augmentSetBonus.test.ts`'s synthetic rare-filigree fixture to use `Bonus: 'Stacking'` (matching real filigree data, e.g. `Celerity.Filigree.xml`, where same-stat rare/normal pairs always use the "Stacking" bonus type precisely to avoid this collision) since the old fixture's `'Artifact'` pair now correctly dedups under the fix. 2 new regression tests in `parityPassNonGearHighestOnly.test.ts`. | this PR |
| 118 | **Guild Buff `AType="TotalLevel"` always read `Amount[0]`** — `accumulateGuildBuffs` (`buildStats.ts`) hardcoded the `classLevels` parameter passed to `parseEffect` to `0`; `effectParser.ts`'s `TotalLevel` case (`Math.max(1, classLevels)` indexing into the Amount table) therefore always resolved rank 1 regardless of the build's real level. V2 `Effect.cpp:1205-1219` (`Amount_TotalLevel`) indexes by `m_pBuild->Level()`, the total character level (heroic+epic+legendary) — e.g. `GuildBuffs.xml` "Game Hunter" (a 40-entry table: +1 Fortitude at level 1-8, +2 at 9-12, +3 at 13-40) was frozen at +1 for every build no matter how high its level. Root-caused via a temporary `v2calc` per-effect `AllActiveEffects()`/`IsActive()` dump (reverted) against `YingsMonk.DDOBuild`: oracle saveFortitude 84 vs V3 82, traced to "Game Hunter" contributing +1 instead of +3; "Chronoscope" (Reflex) hit the same bug. Fixed by threading `build.totalLevel + epicLevels + legendaryLevels` through as `accumulateGuildBuffs`'s new `totalCharLevel` parameter. `oracleDiff.ts` full-corpus re-run: `saveFortitude` mismatches 30→8 builds, `saveReflex` 37→18, `fortification` 28→1. 2 regression tests in `parityGuildBuffTotalLevel.test.ts`. | #159 |
| 119 | **Saves pass: four root causes from parallel-agent per-effect V2↔V3 reconciliation** (read-only C++ probe over `BreakdownItemSave::AllActiveEffects()` + V3 bonus-list dump; Maetrim −7 uniform, Bardbox +3 uniform, "15 second burn" Reflex −1 all reconciled to 0 residual) — **(A) Feat-sourced `AType=TotalLevel` used heroic-only level**: all 8 `accumulateFeat` call sites passed `build.totalLevel` (≤20) as the TotalLevel index; V2 `Effect.cpp` `Amount_TotalLevel` uses `m_pBuild->Level()` (heroic+epic+legendary) — same class as the #159 guild-buff fix; 74 TotalLevel occurrences in DataFiles (e.g. Dark Bargainer "Echoing Soul" 40-row SaveBonus read row 19 instead of 33). **(B) Stack-merge collapsed singleton ranked effects**: the #113 `AType=Stacks` merge collapsed a SINGLE-source ranked effect (e.g. GoF "The Flow of Water + Ocean Stance" Ranks=3, `Amount="1 2 3"`) to `Amount[g.length-1]`=`Amount[0]`, discarding the already-rank-correct `getAmountAtRank` value — V2 reaches `Amount[rank-1]` by replaying one `AddEffect` per trained rank (`BreakdownItem.cpp:818-836`); singletons now pass through untouched, true multi-source groups still merge. **(C) Two-Item `Enhancement` requirements evaluated as OR**: V2 `Requirement.cpp:839-855` `EvaluateEnhancement` is `IsTrained(Item[0], Item[1])` — trained AND that specific selector option chosen; V3's `checkRequirement` did `its.some(...)` (always true once the item was trained, since Item[0] is the item itself) and `meetsSingleRequirement` dropped `Item[1]` entirely — 330 two-Item Enhancement requirements across 24 data files (e.g. Machrotechnic "Blast Drive + Armor of Legends" +3 all saves fired for every Drive choice). New `ctx.enhancementSelections` map (heroic + selected-destiny + reaper selections, dual-keyed InternalName/Name). **(D) `AType=SliderValue` read the slider name from `Item`**: `Item` holds the effect TARGET (e.g. "Reflex" on Arcane Trickster "Slippery Magic"); the slider name lives in `StackSource` (as `SliderValueLookup` already knew) → resolved 0. `oracleDiff.ts`: saveReflex 18→14, saveFort 8→2, saveWill 6→1, hitpoints 38→31 (TotalLevel fix), ability.CON 4→2; no bucket regressed. Golden `exampledps` hp residue bound 195→213 (expected interim: correct HP added while the separate Reaper-stance-gate over-count — next pass — remains). 9 regression tests in `parityPass119Saves.test.ts`. | #161 |
| 120 | **Hitpoints pass: three root causes, exampledps golden HP residue CLOSED** (parallel-agent per-effect reconciliation of `BreakdownItemHitpoints` on 4 builds — YingsMonk −195 base / YingsMonkU73 +636 / Maetrim +505 / Bardbox +422 — every delta reconciled to 0 residual; the percent engine itself proved EXACT on all 4, retiring the long-standing "percent-HP residue" theory: all real diffs were in the flat base the percents amplify) — **(A) Favor Reward feats never applied**: `build.favorFeats` fed eligibility/AP but `buildStats.ts` never `accumulateFeat`ed them; V2 `Build::SpecialFeats()` (`Build.cpp:1603-1609`) merges FavorFeats into the applied list ("House Deneith Favor Rewards" +5 HP, "Draconic Vitality" +10, plus their non-HP effects). **(B) `AType=TotalLevel` never multiplied by rank**: V2 `Amount_TotalLevel` is `m_Amount[level-1] * m_stacks` — Past Life: Primal Sphere ×3 and retrained Toughness were paying a single stack (the case's own comment said `* m_stacks` but the code omitted it). **(C) Reaper HP bonus not gated on Reaper mode**: V2 `BreakdownItemHitpoints.cpp:168-194` adds the APCount-scaled reaper HP only under `Requirement_Stance "Reaper"`; V3 applied it whenever reaper AP was spent — the single largest HP error (+464 to +856 base on builds without the stance toggled). `oracleDiff.ts`: hitpoints 31→21 builds (was 38 before pass 119). Golden `exampledps` HP residue (tracked since #157 at −78/+195/+213) is now **0** — `hp` moved OUT of `KNOWN_OPEN` in `parityGoldenPass106.test.ts` and is exact-checked. Still open (HP residuals, tracked): GoF destiny selector own-effects (−75 on Maetrim, fix identified in the PRR/MRR pass), FatePoint global stack-count (−24 on 3 monk builds). 6 regression tests in `parityPass120HP.test.ts`. | #162 |
| 121 | **PRR/MRR pass: selector own-effects + tracked armor stances — mrrCap and fortification buckets CLOSED** — **(A) EnhancementTreeItem own `<Effect>` list dropped when a Selector option was chosen**: V2 `EnhancementTreeItem::GetEffects` (`EnhancementTreeItem.cpp:486-522`, verified directly) ALWAYS appends `m_Effects` after the selection's effects; V3's `accumulateEnhancementTree` and `buildRuntimeGroupAdds::collectEnhTree` both `continue`d past `item.Effect` once an option resolved — 70 tree items in the data carry both (GoF "Disciple of Philosophy" core +10 MRRCap → Maetrim's exact −10 mrrCap; GoF cores' +5/+5 Melee/Ranged Power; Unyielding Sentinel "Epic Strike" +10 PRR/MRR). **(B) Armor-gated PRR/MRRCap recomputed the armor stance from equipped gear, ignoring the build's recorded `<ActiveStances>`**: V2 `Build::IsStanceActive` reads the TRACKED stance state, which legitimately diverges from gear (heavy armor equipped without the proficiency feat stays "Cloth Armor" — real corpus examples: Odd tank mrrCap 56 vs V3's 6 + spurious Heavy-Armor-PRR +48; Melee Sorcerer mrrCap 50 vs 100). `deriveArmorStances` now honors an explicit armor stance from `build.activeBuffs` (gear derivation stays as fallback for stance-less builds), applied at both the `ctxStances` and `armorStances` call sites. `oracleDiff.ts`: **mrrCap 4→0, fortification 1→0** (both buckets closed), prr 22→19, mrr 19→17, hitpoints 21→19 (the −75 GoF own-effects HP), meleePower 10→9. Residual prr/mrr (19/17) is a distinct, still-undiagnosed mechanism (Bardbox −2/−2, exampledps −34/−38 family). 4 regression tests in `parityPass121PRR.test.ts`. | #163 |
| 122 | **Dodge pass: dead effect type, cross-class auto-feat dedup, oracle slider default — dodge 16→1** — **(A) `DodgeBonusTowerShield` is a DEAD effect type in V2**: `Effect.h` declares it but NO breakdown registers it (verified by grep — `BreakdownItemDodge` registers only `Effect_DodgeBonus`; the tower-shield dodge cap is fed exclusively by `Effect_MaxDexBonusTowerShield` → `Breakdown_MaxDexBonusShields`). V3 routed it into `dodge`, double-counting Mobility's combined two-Type block (+2 spurious dodge on every Mobility build: YingsMonkU73, New New Inquiz, Raged DPS, STR BOW, Two weaon Simi). Now returns `[]`. **(B) Automatic feats granted once per CLASS instead of once per character**: V2 `Build::AutomaticFeats` (`Build.cpp:2493-2564`) keeps a running cross-class grant count capped at `Feat::MaxTimesAcquire` — default **1** (`Feat.h:65`, verified). "Flurry of Blows" listed by both SacredFist and DragonDisciple class XML applied twice (16 of boomed's 21 raw dodge). V3 now hoists a running `grantedAutoFeatTotals` across the class loop with the V2 default; multi-grant feats are unaffected (real data carries explicit values — Epic Power 10, Eldritch Blast Damage 5, Pact Damage 10; `parityPass32.test.ts` fixtures updated to carry the real values). **(C) ORACLE fix — headless slider stacks defaulted to 1**: `Effect.cpp`'s `Amount_Slider`/`Amount_SliderValue` fall back to `m_stacks` (default 1) when `pStancesPane == NULL` (always, under `V2CALC_LINUX`); a real untouched slider is position **0** (`SliderItem::m_position(0)`, `StancesPane.h:24`). Every trained Slider effect (AT "Slippery Magic" dodge+5/Reflex+1, Epic "Arcane Warrior" MP/RP+1) was oracle-inflated, wrongly flagging V3. `stacks = 0` now under the guard (Windows build untouched). `oracleDiff.ts`: **dodge 16→1, saveReflex 14→4, rangedPower 15→5, meleePower 9→1, prr 19→14, mrr 17→12**; builds with any mismatch 43→32. 4 regression tests in `parityPass122Dodge.test.ts`. | #164 |
| 123 | **Power/abilities pass: stale trained-spell carry-over + like-for-like integer comparison — saveReflex and ability.DEX buckets CLOSED** — **(A) Stale trained spells from a respecced-away class kept applying**: V2 `Build::ApplySpellEffects` (`Build.cpp:2373-2385`) — "we need to ignore this spell if it is a carry over from a class change" — gates on the class still having the slots; V3's `accumulateTrainedSpells` applied every `build.trainedSpells` entry unconditionally (real corpus: Warlocks.DDOBuild had 0 Wizard levels but a Wizard-life "Tenser's Transformation" +4 Alchemical STR/DEX/CON still firing → exactly its −4/−4/−4 ability diffs; "highest Number possible" same via stale Druid "Animal Growth"). Conservative version of the V2 gate: skip when `ctx.classLevels[className] <= 0`. **(B) `oracleDiff.ts` now compares `Math.trunc(v3)`**: the oracle prints V2's running double cast to `(int)` (v2calc `main.cpp` `(int)v`, matching V2's UI display); V3's raw doubles (e.g. Rapid Shot `1.5 × BAB` = 37.5) produced phantom sub-integer mismatches (Nerfer/STR BOW rangedPower `x.5` diffs). `oracleDiff.ts`: **saveReflex 4→0 and ability.DEX 2→0 (closed)**, ability.STR 4→3, ability.CON 2→1, saveFort 2→1, rangedPower 5→3, meleePower 1. Remaining major buckets (hitpoints 19, prr 14, mrr 12) are the next diagnosis round — known leads: FatePoint global stack-count (−24 on 3 monk builds), exampledps-family prr/mrr −34/−38, Maetrim residual hp −35/MP −2. 2 regression tests in `parityPass123Spells.test.ts`. | #165 |
| 124 | **GrantFeat never re-applies the granted feat's own stat effects — ability.CON / saveFortitude / saveWill buckets CLOSED** — verified directly against the compiled V2 source that `Build::ApplyEnhancementEffects`/`ApplyItemEffects` notify a `GrantFeat` effect only to breakdowns registered for `Effect_GrantFeat` (`CGrantedFeatsPane`, tracking the name for the Granted Feats panel / feat-prerequisite checks, and a narrow `BreakdownItemPRR` re-derive trigger) — never `Build::ApplyFeatEffects` (reached only via `TrainFeat`/`AutomaticFeats`/`TrainSpecialFeat`). Pass #59 wrongly assumed GrantFeat re-applies the granted feat's own `<Effect>` list and fed it through `accumulateFeat`; on any build with a stance-gated granted feat whose stance happens to be active (e.g. Fury of the Wild "I'm Always Angry" grants the Barbarian "Rage" feat, whose effects are gated on `Requirement Stance=Rage`) this added phantom stat bonuses V2 never applies. `oracleDiff.ts` (53-build corpus): ability.CON 1→0, saveFortitude 1→0, saveWill 1→0 (all closed), prr 14→10, mrr 12→8, rangedPower 3→2, ability.STR 3→2; builds with any mismatch 31→28. `grantedFeatsList` (#60) is unaffected — the marker is still emitted, only the stat-effect re-application is removed. 3 regression tests in `parityPass124GrantFeat.test.ts`; `parityPass59.test.ts` corrected to match the verified V2 behavior. | #167 |
| 125 | **Straggler pass (round-2 agent): char level from `<Level>`, Centered weapon gate — ability.STR and dodge buckets CLOSED** (the pass's third cause — GrantFeat display-only — landed independently as #167/entry 124 with the same conclusion) — **(B) Character level from the Build's explicit `<Level>` field**: V2 `Build::Level()` (`Build.h:378`) is independent of per-level Class assignment — blank/"Unknown" heroic rows still count. V3 derived `totalLevel` by counting classed rows: raydc (all 20 heroic rows classless, `<Level>34</Level>`) computed char level 14, dropping 5 of 8 STR level-ups (−5 exact) plus HP/tome/TotalLevel-table knock-ons; Virtues-1 (4 blank rows) dropped its Level-32 pick (−1 exact). Importer now trusts `<Level>` when present (`totalLevel = max(derived, min(20, Level − epic − leg))`). **(C) "Centered" requires unarmed or a monk weapon**: WeaponGroupings.xml's "Centered" group (Empty/Kama/Shuriken/Handwraps/Quarterstaff/Unarmed); V3 centered every cloth-armor Monk/Sacred Fist regardless of weapon (speed leveling's Heavy-Crossbow monk got Flurry's +4 dodge). Derivation moved after weapon-class computation and gated on `ctxWeaponClassMain.has('Centered')`. `oracleDiff.ts` after #167 + this: **ability.STR →0, dodge →0** (with #167's CON/Fort/Will closures: five buckets closed this round), hitpoints 18, prr 10, mrr 8, rangedPower 2; builds with any mismatch 26. Open leads recorded: Max imbue rangedPower −10 (Archer's Focus slider — possibly a real persisted slider position the oracle can't see), Maetrim MP/RP −2/−2. 4 regression tests in `parityPass124Stragglers.test.ts`. | #168 |
| 126 | **Cross-feat `AType=Stacks` merge sums RANKS, not sources — hitpoints 18→2** — V2 `Effect::operator==` (`Effect.cpp:959-985`) ignores `Rank`, and `BreakdownItem::AddEffect` bumps `m_stacks` once per training APPLICATION, so `m_stacks` is the running SUM of every sharing source's trained rank; `Amount_Stacks` indexes `Amount[m_stacks−1]`. V3's post-pass merge used the COUNT of contributing sources: the 18 distinct "Epic Past Life" feats (identical `FatePoint` `AType=Stacks` 54-row effect) × rank 3 = 54 applications should index `Amount[53]` = 18 fate points, but V3 indexed `Amount[17]` = 6 — −12 fate points → −24 HP direct (2 HP/FP) plus percent-HP compounding. Full Maetrim reconciliation: +24 direct + 11 (45% of the raised base) = the exact −35 gap, zero residual; same shape verified on 10 more builds. Fix: `RawBonus.stackRank` records each contributor's own rank at parse time; the merge sums `stackRank` for the table index (subsumes pass 119's singleton special case — a singleton degenerates to `Amount[rank−1]`, the value `getAmountAtRank` already resolved). `oracleDiff.ts`: **hitpoints 18→2**; builds with any mismatch 26→14. Remaining HP: "Two weaon Simi" −173 (zero past lives — separate large cause, undiagnosed) and raydc −18 (missing heroic base-HP line + negative CON×34 row — separate importer/ability issue, undiagnosed). 3 regression tests in `parityPass126StackRank.test.ts`. | #169 |
| 127 | **PRR/MRR pass (round-2 agent, line-item diff vs V2's real AllActiveEffects dump): four causes — prr and mrr buckets CLOSED, corpus down to 3 builds / 4 cells** — **(A) Attack feat per-shield-size PRR/MRR never modeled**: Feats.xml "Equipped {Buckler\|Small\|Large\|Tower} Shield PRR/MRR Bonus" (0/5/10/15, `Bonus="Shield"`, stance-gated) — the one Attack base the hardcoded-defaults comment always said was missing; added keyed on the shield stance. Uncovered a broader naming bug on the way: real items tag shields as `<Weapon>Small/Large/Tower Shield</Weapon>` (never `<Armor>`), so V3's shield detection lists ('Heavy/Light Shield') matched NOTHING — Large/Small shields were invisible to the `Shield` stance and shield gating. **(B) `EffectContext.featCounts` declared but never populated**: every `AType=FeatCount` effect (Divine Crusader "Mighty Crusade", item buffs "Temperance of Belief/Spirit", "Druidic Stoneshape") collapsed to its 0-or-1 row. Now wired: trained/past-life/favor/special via `buildFeatCountMap` PLUS class-`AutomaticFeats` grants (Bard grants "Religious Lore" ×9 through its level table — the healer-cluster source), capped at `MaxTimesAcquire`. **(C) `<Weapon>`-tagged off-hand shields (bashing bucklers) wrongly auto-activated "Two Weapon Fighting"**: V2 treats Sword-and-Board as not dual-wielding — James Dodge v8's Kukri + Legendary Alchemical Buckler fired Tempest "Shield of Whirling Steel"'s TWF-gated +2 PRR/MRR. **(D) Missing `<AType>` must contribute 0**: V2 deserializes it to `Amount_Unknown` and `TotalAmount()`'s switch has no case for it — a silent no-op; V3 defaulted to `Stacks` (Shadowstrike Rare filigree's authoring oversight → +4 phantom PRR on Magic missile healer). Maps to the existing 'Unknown' non-numeric path; test-fixture `mk` helpers updated to carry the explicit `AType` real data always has. `oracleDiff.ts`: **prr 10→0, mrr 8→0 (closed)**; "Two weaon Simi" HP −173 also closed (FeatCount-driven); builds with any mismatch 14→**3** (4 stat cells): Maetrim MP/RP −2/−2 (Mythic Power Boost `EnterValue` slot-tier scaling — augment class unmodeled, V2 slot-tier lookup table not yet located), Max imbue rangedPower −10 (suspected feat-level `AType=BAB` staging vs `ctxBAB`, unconfirmed), raydc hitpoints −18 (missing heroic base-HP line + negative CON row, importer-side, undiagnosed). 7 regression tests in `parityPass127PRR.test.ts`. | this PR |
| 128 | **raydc hitpoints −18 CLOSED — "Unknown" pseudo-class never synthesizes Improved Heroic Durability** — `Class::ImprovedHeroicDurabilityFeats()` (`Class.cpp:384-408`) runs for every class without `<NotHeroic/>`, and `Classes/Unknown.class.xml` has no such flag; `Build::ClassAtLevel` (`Build.cpp:1226-1236`) falls back to class name `"Unknown"` for any heroic `<LevelTraining>` row with no `<Class>` element, so its `Requirement_ClassAtLevel("Unknown", 5/10/15)` gates are satisfiable exactly like a real class. `raydc.DDOBuild` (a genuinely classless level-34 build: all 20 heroic rows blank, `<Level>34</Level>`) has 20 "Unknown"-classed heroic levels ≥ all three milestones, so V2 grants +5 HP ×3 = +15 raw HP that then compounds through the combined-HP percent pass (`Math.trunc(287 × 1.15) = 330`, the oracle's exact value). V3's synthesis loop (`buildStats.ts`, added in Section D) iterates `build.classes`, which the importer (`v2Import.ts:519-522`) explicitly excludes blank-named heroic rows from (`if (!c) continue`) — correct for the *named*-class loop, but it meant classless levels never got their own milestone check at all. Fix: a second pass counts blank entries directly in `build.levelClasses` (independent of `build.classes`) and applies the same 5/10/15 milestone logic when `Classes/Unknown.class.xml` isn't `NotHeroic`. `oracleDiff.ts`: **hitpoints 1→0 (closed)**; corpus 3 builds/4 cells → 2 builds/3 cells (remaining: Maetrim MP/RP −2/−2, Max imbue rangedPower −10, both pre-existing and unrelated). 3 regression tests in `sectionDParity.test.ts`. | #171 |
| 129 | **Max imbue rangedPower −10 CLOSED — `ctxBAB` had two compensating bugs: Epic/Legendary double-count AND a missing `OverrideBAB` feed** — confirmed the pass-127 "suspected, unconfirmed" lead directly against the real V2 dump (temporary `AllActiveEffects()` debug hook added to `DDOBuilder/BreakdownItem.h` + `v2calc/shim/BreakdownHostLinux.cpp`/`v2calc/src/main.cpp`, reverted after diagnosis — not part of this fix). **(A) Double-count**: `ctxBAB` (`buildStats.ts`, the value fed to `EffectContext.bab` for `AType=BAB` effect resolution — NOT the same code path as the `bab` stat itself) looped once over `ctxClassLevels` — which already carries `'Epic'`/`'Legendary'` entries seeded a few lines above from `build.epicLevels`/`build.legendaryLevels` — then added `classBAB(epicCls, …)`/`classBAB(legCls, …)` a SECOND time in two redundant follow-up `if` blocks. **(B) Missing override**: V2 `Effect::TotalAmount`'s `Amount_BAB` case (`Effect.cpp:1121-1145`) reads the LIVE, fully-resolved `Breakdown_BAB.Total()`, which already folds in any active `OverrideBAB` boost (Max imbue trains "Tenser's Transformation", boosting real V2 BAB from 15 to 25); `ctxBAB` was computed once, up front, from class tables only, and never saw that boost. On this build the two bugs partly canceled — buggy `ctxBAB` was 15 (correct) + 5 (Epic dup) + 0 (Legendary dup) = 20, vs the true 25, so "Multitude of Missiles"' `RangedPower AType=BAB Amount=2` effect gave `2×20=40` instead of the correct `2×25=50` (−10, matching the observed diff exactly). Fixing only (A) in isolation — an earlier draft of this pass — dropped `ctxBAB` to 15 with the override still missing, making the SAME build worse (`2×15=30`, −20) and newly exposing the identical missing-override gap on "Nerfer.DDOBuild" (previously masked by the same double-count coincidence). Full fix: removed the redundant double-count blocks, AND threaded the fully-resolved `bab` stat (which independently folds in any override) back into `ctxBAB` through the SAME fixed-point iteration `buildStatMap` already runs for ability totals/skills/caster levels (`#93`) — iteration 1 falls back to the raw class-table sum, iteration 2+ uses the previous iteration's resolved `bab`, converging immediately since `bab` doesn't itself depend on `ctxBAB`. `oracleDiff.ts`: **rangedPower 2→0 mismatched builds closed for both Max imbue AND the newly-surfaced Nerfer regression**; corpus-wide down to 1 build / 2 cells (Maetrim MP/RP −2/−2, unrelated pre-existing augment-scaling lead). 2 regression tests in `parityPass129BABDoubleCount.test.ts` (synthetic builds, oracle-independent — one isolates the double-count from the `MAX_BAB=25` cap, one isolates the override feed-through). | #172 |
| 130 | **Maetrim MP/RP −2/−2 CLOSED — `EnterValue` augments (e.g. "Mythic Power Boost") never read the player-entered `ItemAugment::Value`** — confirmed directly against the real V2 dump (temporary `AllActiveEffects()`/`IsActive()` debug hook added to `DDOBuilder/BreakdownItem.h` + `v2calc/shim/BreakdownHostLinux.cpp`/`v2calc/src/main.cpp`, reverted after diagnosis — not part of this fix). V2 `Build::ApplyAugment` (`Build.cpp:4948-4966`) checks `augment.HasEnterValue()` and, when set, replaces EVERY effect's `Amount` with `itemAugment.Value()` — the mechanic behind "Mythic Power Boost" (the Mythic-slot augment the player reforges to raise its rank), completely independent of the already-implemented `ChooseLevel`/`LevelValue` mechanic. `webapp/src/lib/buildStats.ts`'s `accumulateAugments` never read `EnterValue`/`Value` at all, so every such augment always contributed its catalogue placeholder Amount (`1`) regardless of what the player actually entered. On `Maetrim_EndGameHandwrapsMonk.DDOBuild`'s ACTIVE gear set (selected via `<ActiveGear>`, itself already correct in `v2Import.ts`) three "Mythic Power Boost" augments are slotted with `Value` 3/1/1 (Dinosaur Bone Cloak/Waistwrap/Karissa's Goggles); V2 sums all three (Mythic bonus type stacks `Always`) for 5, V3 summed 1+1+1=3 — a flat −2 on both `melee.power` and `ranged.power` (both effects on the same augment), matching the observed diff exactly and closing the corpus's last remaining oracle mismatch. Fix: `v2Import.ts` now captures `<Value>` into a new `build.augmentValueChoices` map (parallel to the existing `augmentLevelChoices`); `accumulateAugments` accepts it and, when the resolved augment has `EnterValue`, overrides every effect's Amount with the stored value before parsing (mirroring the ChooseLevel override path); `v2Export.ts` round-trips `<Value>` back out for `.DDOBuild` re-export. `oracleDiff.ts`: **rangedPower/meleePower 1→0 — 0 of 53 builds mismatch** (down from 46 pre-pass-119). 3 regression tests in `parityPass130EnterValueAugment.test.ts` (synthetic builds, oracle-independent). | #173 |
| 133 | **G-MRR / G-PRR / G-AC golden-build residue CLOSED — closed as a side effect of passes 127-132, just never re-verified** — the "Golden-build residue" section tracked a bounded (not exact) PRR/MRR/AC gap against the real V2 forum export `exampledps.cc1.v2export.txt`, guarded by `parityGoldenPass106.test.ts`'s `KNOWN_OPEN` set + a `gaps: { ac: -4, mrr: -8, prr: -4 }` tolerance test. Re-running the diff directly against that real export (not just the `oracleDiff.ts` synthetic corpus) shows all three now match V2 exactly (diff 0) — the corpus-wide PRR/MRR/armor-stance root causes fixed in passes 121, 127, and 131-132 (Attack-feat per-shield PRR/MRR, `featCounts` wiring, shield/weapon `<Weapon>`-tag naming, tracked + auto-derived armor stances) closed this specific build's residue too, but nobody had re-run this particular test's bounds since #165 to notice they'd hit zero. `KNOWN_OPEN` is now empty; `parityGoldenPass106.test.ts`'s loose bounds check replaced with an exact-match assertion on `ac`/`mrr`/`prr` so a future regression fails immediately instead of silently reopening up to the old bound. No production code changed — this closes stale tracking + tightens regression coverage. | this PR |
| 134 | **D4 — Artifact Filigree slots gate on an equipped Minor Artifact item** — V2 `Build::ApplyGearEffects`/`RevokeGearEffects` (`Build.cpp:4776-4783`, `4852-4859`) only apply/revoke the 10 "Artifact Filigree" slot effects when `gear.HasMinorArtifact()` — some equipped item carries the presence-only `<MinorArtifact/>` flag (`EquippedGear::HasMinorArtifact`, `EquippedGear.cpp:424-435`). `buildStats.ts`'s call to `accumulateFiligrees` always applied `build.artifactFiligreeSlots` unconditionally, so a build with no Minor Artifact equipped still received Artifact Filigree bonuses in V3. Fixed by checking `'MinorArtifact' in item` across `gearItems` (same presence-only-flag pattern as `NoPastLife`/`NotHeroic`) and passing an empty artifact-filigree slot list when no Minor Artifact is equipped. Also corrected a stale D5 marker discovered during this pass — Docent armor-AC feat gating had already shipped (pass 134/#178) but the TODO entry was never flipped to done. 3 regression tests in `parityPassD4ArtifactFiligree.test.ts`. | this PR |
| 135 | **Stale-tracking close: "saves" and "prr/mrr" Oracle-derived-bug-list entries** — both bullets under "High-priority remaining → Oracle-derived mechanical bug list" were still marked 🟡 with residual mismatches (Reflex/Fort/Will; prr/mrr "mixed signs, round-2 diagnosis in flight") describing gaps that passes 119-133 had already closed — the bullets were simply never flipped. No production code change. Verified directly: the real-V2-export golden test (`parityGoldenPass106.test.ts`) already asserts `ac`/`mrr`/`prr` exact (pass 133); added a matching pinned assertion for `save.Fort`/`save.Reflex`/`save.Will` (previously only covered by the generic "every stat" loop check) so a future regression in any of the six values fails loudly and specifically instead of silently or via an undifferentiated failure list. | this PR |
| 136 | **D3 — Minor Artifact single-equip restriction enforced** — V2 `EquippedGear::SetItem` (`EquippedGear.cpp:352-372`) auto-revokes every OTHER item flagged `<MinorArtifact/>` the instant a new one is equipped (`EquippedGear::HasMinorArtifact`), so at most one Minor Artifact can ever be equipped at once. `Item.h:100`'s `MinorArtifact` flag was absent from V3's `Item` interface and nothing enforced the restriction — a build could equip multiple Minor Artifacts and count all of their effects. Added `Item.MinorArtifact?: string` to `types/ddo.ts`; `buildStats.ts` now scans `gearItems` for the presence-only flag (same pattern as the existing D4 check) and, when more than one is equipped, keeps the item in the earliest V2 canonical inventory slot and strips the rest through the existing `gearSlotsRemovedByV2` mechanism (the same one the off-hand two-handed-weapon rule uses), so a revoked artifact's augments and set-bonus contributions die with it too. A static gear snapshot has no equip-order history, so the canonical-slot-order tiebreak is a deterministic approximation of V2's "most-recently-equipped wins" rule. 3 regression tests in `parityPassD3MinorArtifact.test.ts`. | this PR |

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

## Pass 134 — full BreakdownsPane surface at 0/151 (2026-07-29)

The v2calc oracle + `scripts/oracleDiff.ts` referee now cover the complete
BreakdownsPane analytics surface — including AC, the 14 main-hand weapon
lines (attack/damage bonus, crit threat/multiplier, attack speed, ghost
touch, true seeing, …), hirelings, immunities, song durations and spell
crit multipliers — and the full 151-build corpus (Example Builds +
UserBuilds/collection + FuzzBuilds) compares EXACT (tolerance 0) on every
emitted stat. Landed across PR #178 and the follow-up rounds: V2 weapon
attack/damage composition (ability candidates per CreateWeaponBreakdown:
item modifiers, Str+Dex finesseable/thrown, Dex-only Light/crossbow;
damage-ability multiplier with truncation; weapon-enchantment pool;
BAB-in-pool percent base; ACP/TWF/non-proficiency/negative-level
penalties; Keen synthesis), auto-acquired feats' AddGroupWeapon adds
(dwarven-axe proficiency), requirement-gated runtime group adds (Kensei
Exotic Weapon Mastery), the item-effect merge identity (item name +
notify path + stamped content), the Requirements-aware stack-merge
identity, and the literal "Competence " (trailing space) Highest-Only
bonus type.

Remaining known-unmodeled surfaces (oracle emits nothing for these, so
they are NOT covered by the 0/151 claim): weaponOffhand referee rows
(oracle emits them; referee compares main hand only) and metamagic spell
point costs (no dedicated V2 breakdown found — derived in SpellsPane).

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

### Seventh review pass — 2026-08-26 full V2/V3 scan

Five independent parallel scans (numerical correctness across every
`Breakdown*.cpp` class not already named elsewhere in this file, effect
parser coverage re-derived from scratch against `Effect.h`/`Effect.cpp`'s
full `TotalAmount()` switch and `Requirement.cpp`'s ~30 evaluators, UI
panels, forum export, and data-loading edge cases) reconfirmed the
numerical-correctness and effect-parser surfaces as complete — **no new
numerical or effect-parser gaps found**. Two V2-internal bugs were noted as
confirmed-but-not-triggerable with real data (`Effect_AbilityTotalIndex`'s
off-by-one array clamp in `Effect.cpp:1348`, harmless because every real
`Amount` table is sized far beyond any realistic ability score;
`Requirement::EvaluateStance`/`EvaluateAlignment`/`EvaluateAlignmentType`
in `Requirement.cpp` testing only the first `<Item>` of a multi-item list,
harmless because no shipped requirement lists more than one `<Item>` for
those three types) — neither is a V3 parity gap. This pass's real findings
are all in UI/export/data-loading and are filed under Medium/Low-priority
below: **D11–D13** (Quest `DoNotShow`/`IgnoreForTotalFavor` flags never
parsed; an item's own inherent Arcane Spell Failure % never surfaced
anywhere in V3), **U13** (Granted Feats panel missing V2's "Inactive
Granted Feats" section), and **X21–X24** (forum-export
`SelfAndPartyBuffs` reads the wrong build field and likely emits nothing
for real builds; `PastLives`/`ActiveStances`/`AutomaticFeats` formatting
diverges from V2's exact output shape).

### New gaps — 2026-08-16 full V2/V3 scan

Sixth review pass (five parallel scans: `Breakdown*.cpp` vs `buildStats.ts`/
`useBuildStats.ts`, `Effect.cpp`/`Effect.h`'s full 233-value `EffectType` +
24-value `AmountType` enums vs `effectParser.ts`, `*Pane.cpp`/`*Dialog.cpp` vs
`webapp/src/components/`, `ForumExportDlg.cpp` vs `sections.ts`, and
`Item.cpp`/`EquippedGear.cpp`/`Augment.cpp`/`Build.cpp` vs
`dataLoaders.ts`/`buildStats.ts`). Effect Type/AType parser coverage and the
`Breakdown*.cpp` numerical surface are otherwise confirmed still complete —
one new numerical gap found:

- ✅ **N15 — CLOSED (#159): `Effect_SpellPowerReplacement` is now parsed AND
  consumed — spell power substitution applies on cross-element builds.** V2
  (`BreakdownItemSpellPower.cpp:68-79, 296-333`, `ReplacementTotal()`/
  `IterateList()`) lets an effect declare that one spell-power element
  substitutes for another whenever the other is higher (e.g. "use Fire Spell
  Power in place of Cold Spell Power if it is higher, and vice versa"), and
  only the raw spell-power breakdown is affected (crit chance/multiplier
  never register the replacement listener in V2). Two bugs, both fixed:
  (1) real data always tags this effect `AType=NotNeeded`, so the null-Amount
  gate in `effectParser.ts` dropped it before it ever reached the
  `SpellPowerReplacement` case — it never even parsed; now intercepted
  earlier, alongside `SaveBonusAbility`/`GrantFeat`/etc. (2) parsing collapsed
  `Item[0]` (self) and `Item[1]` (alternate) into two independent
  `spellPowerReplacement.<element>` markers with no pairing; now emits a
  paired `spellPowerReplacement.<self>.<alt>` marker. New
  `replacementSpellPower()` (`lib/spellPowerRow.ts`) computes
  `max(own, ...alternates) + Universal` and is used by both the Breakdowns
  panel and the forum export's `SpellPowers` section. Confirmed real-data
  impact: Tiefling's "Infernal Sovereign" racial enhancement line
  (`Output/DataFiles/EnhancementTrees/Tiefling.tree.xml`,
  `TieflingScoundrel.tree.xml`) depends entirely on this mechanic for
  Acid/Cold/Electric/Sonic spell power. 9 new regression tests across
  `effectParser.test.ts`, `spellPowerRow.test.ts`,
  `parityPassX15SpellPowers.test.ts`.

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
- ✅ **G-MRR / G-PRR / G-AC — CLOSED (pass 133)**: MRR Cap was already exact
  (Nystul 5pc via the NumFiligrees import fix); the remaining PRR/MRR/AC
  residue (narrowed −24/−28 → −4/−8/−4 by the ChooseLevel augment fix (#107)
  and passes 121-123) turned out to already be zero by the time passes
  127-132 landed their own PRR/MRR/armor-stance root causes (Attack-feat
  per-shield PRR/MRR, `featCounts` wiring, `<Weapon>`-tagged shield TWF gate,
  missing-`AType`→0, tracked armor stances, shield/weapon `<Weapon>` naming)
  — nobody had re-run this specific real-V2-export diff since #165 to notice.
  Re-diffing `exampledps.cc1.v2export.txt` directly (not just the oracle
  corpus) confirms `ac`/`mrr`/`prr` now match V2 exactly (diff 0, was
  bounded at −4/−8/−4). `parityGoldenPass106.test.ts`'s `KNOWN_OPEN` set is
  now empty — every stat in the real export is exact-checked, closing the
  last item in "Golden-build residue". The old "Legendary Bulwark" lead was
  already RULED OUT (instrumented `accumulateSetBonuses` end-to-end: the set
  fires correctly inside the combined hp percent row).
- ✅ **G-HP — CLOSED in pass 120 (#162)**: the +195/+213 exampledps residue
  was favor feats + TotalLevel×rank + the Reaper stance gate; `hp` is now
  exact-checked in `parityGoldenPass106.test.ts` (out of `KNOWN_OPEN`).
  Historical detail of the four #157 bugs kept below.
- 🟡 **(historical) G-HP — four real bugs fixed (#157), residue was +195 —
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
- ✅ **2026-07-19 user cc1-gearset export diff — CLOSED (pass 137)**: this
  bullet's Will/Fort/Reflex/Fortification-Bypass/Dodge/Unconscious-Range
  claims were never re-verifiable because (a) `parseV2Export.ts` didn't parse
  the export's "Weapon Damage" section at all (no `fortBypass`/`melee.power`/
  etc. keys ever reached the golden test) and (b) the file was assumed
  unreproducible. The committed `exampledps.DDOBuild` +
  `exampledps.cc1.v2export.txt` fixture turns out to BE this exact save —
  its `<ActiveStances>` list contains Power Attack / Enhanced Bloodrage /
  Mantle of Fury and its export text has the same HP 2797 / Unc Rng −360 /
  Dodge 18/25 / Fort 75 / Will 53 / Fortification-Bypass-71 numbers quoted
  above. `saves are exact` (added in pass 135) already pins Will/Fort/Reflex
  as exact; pass 137 parses the Weapon Damage section and pins
  meleePower/rangedPower/doublestrike/doubleshot/strikethrough/
  offhandAttack/fortBypass/helpless as exact too — all 8 match V2 with zero
  diff. So the stance-restoration-from-import concern was unfounded (it
  already works — `v2Import.ts` reads `<ActiveStances>` into
  `build.activeBuffs`, and `buildStats.ts`'s persisted-stance merge applies
  them), and every numeric claim in this bullet is now regression-pinned
  and V2-exact. No remaining residue.
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
(V2 oracle value is correct; the number is how many builds mismatch).

**Current scoreboard after pass 133 (2026-07-29, UNIFIED 151-build corpus =
53 curated + 98 fuzz): 0 builds with any mismatch on the FULL analytics
surface.** The compared surface now covers everything the BreakdownsPane
exports: abilities, saves + sub-saves, all 21 skills, HP family, PRR/MRR,
dodge (+cap), doublestrike/doubleshot, sneak attack (dice/attack/damage),
tactical DCs, Ki (max/passive/hit/crit), spell points, per-class and
per-school caster levels, spell pen, per-type spell POWERS and CRIT
CHANCES (universal + Item=All + per-type composition), school DCs,
per-type energy RESISTANCES and multiplicative ABSORPTIONS, movement
speed, healing/repair/negative amps, threat, fate points, destiny APs,
tumble charges, and ~50 more scalars. Not yet emitted headless (documented
oracle gaps, not V3 gaps): AC total, weapon to-hit/damage lines, buff
Durations, Immunities.

Pass-131 scoreboard (2026-07-28, same corpus, 3 residuals): `oracleDiff.ts` now
sweeps `Output/FuzzBuilds` by default. The fuzz corpus went **79 → 0
mismatching builds** in this pass; the old 98 `fuzz-*.golden.json` /
`.v3stats.json` files were exposed as a CIRCULAR baseline (byte-identical
copies of V3's own output, `capturedAt` always empty — V3 validated against
V3) and are deleted; `randomBuildFuzzer.ts` no longer writes them. Two
critical prerequisites were **oracle-side** fixes (both previously masked by
`.DDOBuild` files that persist `<ActiveStances>`): the headless oracle never
ran `CStancesPane`'s AUTO-stance evaluation (armor/shield/weapon-type/race/
fighting-style/Greensteel stances — new `v2calc/shim/AutoStancesLinux.cpp`
replicates `CStanceButton::Evaluate` + `UpdateStanceStates` +
`UpdateGreensteelStances` verbatim), and the pane-derived stances in V3 had
compensating bugs (see pass 131 below). Residual 3 builds:
`Nerfer.DDOBuild` (7 stats, mixed signs), `Odd tank.DDOBuild` (3 saves −3,
persisted stale "Cloth Armor" on heavy armor — V3 now agrees with the
re-derivation but its save deltas remain), `New New Inquiz build Ranged
DPS.DDOBuild` (hp +66: V2 ignores the off-hand's "Melancholic False Life"
augment via a mechanism not yet identified — its stale "(Accessory)" slot
type was DISPROVEN as the cause by direct oracle experiment; V2 CopyUserSet-
Values keeps original augments wholesale, so the match-by-type theory is
also out).

Previous scoreboard (passes 119-130, 53-build corpus, 0 mismatching): every tracked stat is now
V2-exact across the full corpus. CLOSED buckets: mrrCap, fortification,
saveReflex, ability.DEX, ability.CON, saveFortitude, saveWill, hitpoints,
prr, mrr, dodge, ability.STR, and (as of #172) the "Max imbue" AND "Nerfer"
rangedPower mismatches (`ctxBAB` double-counted Epic/Legendary AND never saw
an active `OverrideBAB` boost — see pass 129 above), and (as of #173) the
last "Maetrim" rangedPower/meleePower mismatch (`EnterValue` augments like
"Mythic Power Boost" never read the player-entered `ItemAugment::Value` —
see pass 130 above). Historical per-bucket notes below are kept for the
evidence trail; where a note conflicts with this scoreboard,
the scoreboard wins.

- ✅ **Pass 133 — full-analytics widening: the oracle now emits (and the
  referee compares) the entire BreakdownsPane surface (this PR).**
  Oracle side: `BreakdownHostLinux.cpp` registers ~150 additional breakdowns
  (21 `BreakdownItemSkill` wired to their ability breakdowns, 13
  `BreakdownItemTactical`, universal + 17×3 `BreakdownItemSpellPower`
  (power/lore/crit-multiplier), 13×2 energy resistance/absorption,
  SpellPoints/MaximumKi/SneakAttackDice/OffhandDoublestrike/PactDice/
  TurnUndead, and a ~90-entry simple-breakdown table); `main.cpp` emits new
  JSON objects `skills`, `tacticalDC`, `spellPower`, `spellCritChance`,
  `energyResistance`, `energyAbsorption` plus ~50 scalars. Referee:
  `oracleDiff.ts` composes V2 display semantics (sub-save = base+sub;
  school DC = dc.All + dc.school; per-type spell power/crit = universal +
  Item=All + per-type; absorption recombined MULTIPLICATIVELY from resolved
  winners; maxDexBonus 999 sentinel; movementSpeed −100 base; destinyAPs
  from epic/legendary levels + FatePoints/3). V3 fixes found by the wider
  net, each oracle-verified on YingsMonk:
  - **Snapshot abilities**: `Snapshot*` StackSources (Henshin Mystic "Clear
    Your Mind" Wis/2 → tactical DCs +3) read the persisted per-gear-set
    ability snapshot (`Build::SnapshotAbilityValue`) when `GearSetSnapshot`
    names an existing set — missing tags default 0; live totals only as
    fallback. New `EffectContext.snapshotAbilities`.
  - **SpellFocusMastery → dc.All** (was mis-mapped to spell penetration;
    its ItemBuffs.xml template is SpellDC Item=All).
  - **ItemBuff Value1/Value2 split** (`Buff::UpdatedEffects`): with both
    values, template effect[0] gets Value1, effect[1] Value2 (Deception
    "+12 to hit / +18 sneak damage" — Ophael's Cincture).
  - **Tumble charges**: V2's universal "Attack" feat carries them (base 2 +
    1 @10 Tumble ranks + 1 @20, cloth/light only).
  - **Absorption bonus types**: V3 stamped every `absorb.*` bonus with a
    fake "Absorption" type, defeating same-type Highest-Only stacking
    (guild Stormreaver Memorial II/III/IV all counted; V2 keeps only IV).
    Real bonus types restored; UI/export multiplicative math now matches V2.
  - **Auto-stance race filter narrowed** to the build's OWN race — the
    catalogue-wide filter swallowed persisted iconic past-life stances
    whose trimmed names collide with race names ("Aasimar Scourge ").
  Full-corpus rounds (the widened referee took the corpus 136 → 0
  mismatching builds over four more fix rounds):
  - **Skill tomes**: V2 `<SkillTomes>` element names map to display names
    (DisableDevice → "Disable Device", SpellCraft → "Spellcraft", UMD →
    "Use Magic Device") — multi-word tomes were dropped from every skill
    total and the Spellcraft-fed spell powers; plus the
    `Character::SkillTomeValue` level cap (2, +1 at 3/7/…/31).
  - **Skill requirements gate on TRAINED ranks + capped tome**
    (`Requirement::EvaluateSkill`), not resolved totals — item skill
    bonuses wrongly passed Tumble rank gates. New
    `EffectContext.skillRanks`.
  - **Absorption identical-effect merge** (`absorptionTotal`, shared by
    referee/UI/export): group by (v2Name, value) so five Arcane-sphere
    "+1% Energy Absorbance" ×3 passives form ONE (1−0.15) factor while
    the same-named 10%/stack "Block Energy" stays separate; and absorb.*
    bonuses keep their REAL types so guild tiers compete Highest-Only.
  - **Item=All spell power/lore fan-out** into the 17 concrete types so
    All-typed items compete Highest-Only per type with per-element items
    (V2 pools them together); school DCs re-resolve the UNION of dc.All +
    dc.school pools for the same reason. Bare 'Light'/'Alignment' Items
    are DEAD in V2 (spellPowerTypeMap has only "Light/Alignment").
  - **GroupMember/GroupMember2 requirements** = V2
    EvaluateWeaponGroupMember on main/off hand ("Favored Weapon" gates —
    Divine Crusader implement, ranged doublestrike/doubleshot);
    `ItemTypeInSlot` and `WeaponTypesEquipped` (main-hand-only Item[0])
    evaluated honestly via new gear context fields.
  - **Effect identity includes StackSource** (`Effect::operator==`): two
    "Spell: Jump" casts from different classes compete Highest-Only
    instead of merging ×2; effect Item lists dedupe (V2 notifies each
    breakdown once per effect — Dolorous Combat Mastery lists Stun twice).
  - **Mixed Magics** raises ClassCasterLevel-driven amounts to
    min(20, char level) (Bless at CL 27) and the referee's per-class
    caster levels compose class levels + Mixed Magics + cl pools.
  - **SpellPoints**: casting-stat pick replicates V2's observer graph
    (early pick by base+racial+levelup+tome TOTALS; re-pick with final
    totals only when an OBSERVED stat changes); FvS/Sorc item multiplier
    excludes percent effects and truncates; "Purity of Heart" and 89
    other legacy feat names translate at import
    (`TrainedFeat::TranslateOldFeatNames`).
  - **Embedded gear fallback**: items not in the catalogue (Cannith
    crafted, leveled challenge items) use the .DDOBuild's embedded
    definition, matching `Build::GetLatestVersionOfItem`.
  - **ItemBuffs.xml duplicate Types**: V2 FindBuff returns the FIRST
    match; the catalogue Map now keeps first-wins ("Silent Moves" has a
    5 and a 0 variant).
  - **Misc**: `<NegativeValues/>` item-buff templates negate stamped
    values (Undying = negative UnconsciousRange); shield ACP routes to
    the shield pool; implement bonus (main-hand MinLevel → sp.Universal);
    destinyAPs/maxDexBonus referee composition (+1 level offset; cloth =
    999 "No limit"); Energy_All includes the alignment energies; V2's
    universal "Attack" feat grants Tumble charges.
  Regression tests: `parityPass133.test.ts` (16 tests).

- ✅ **Pass 132 — residuals closed: 151/151 builds oracle-exact (PR #175).**
  New tooling: `BreakdownItem::V2CalcDumpEffects` (V2CALC_LINUX-guarded) +
  `V2CALC_DUMP_EFFECTS=<key>` in the oracle prints a breakdown's per-effect
  pools (other/char/item, with active/inactive/non-stacking state) — the
  per-effect referee that localised every fix below. Also fixed an
  `oracleDiff.ts` arg bug that silently DROPPED the first file argument
  (`i !== tolIdx+1` with tolIdx=-1) — single-file runs were falling through
  to the full sweep, which had masked one unverified "fix" during pass 131.
  - **Off-hand removal** (Inquiz hp +66): V2 `EquippedGear::SetItem` removes
    the off-hand item when the main hand cannot have one
    (`CanEquipTo2ndWeapon`: two-handed melee/bows/handwraps/quarterstaff
    never; the five crossbows only with "Artificer Rune Arm Use" trained or
    granted). The item AND its slotted augments contribute nothing.
  - **Persisted stance semantics** (Nerfer): AUTO-family stances are never
    read from `<ActiveStances>` (armor/shield, weapon types, fighting
    styles, Ranged Combat, Centered, races, alignments — all re-derived);
    persisted USER stances are revoked when their stance definition's
    Requirements fail at load (`CStanceButton::Evaluate` → `DisableStance`)
    — stance defs indexed from `allFeats[].Stance`.
  - **Data-driven AUTO stances** (Odd tank saves −3): Stances.xml Auto
    entries (e.g. "Aura of Good"/"Aura of Courage", BaseClassMinLevel-
    gated) now auto-activate; `loadStances` is part of `loadAllCatalogues`
    and `BuildStatsInput.allStances`. Feat-granted Group=Auto stance defs
    self-activate too. A whitelist keeps the pass honest: stances whose
    requirements use types `requirementsMet` only conservatively passes
    (GroupMember/ItemTypeInSlot/…) are left to the dedicated derivations.
  - **Centered is class-free** ("lowest hp possible" dodge, "Max imbue"
    6-stat cluster): V2's Centered stance requires only Cloth Armor + both
    hands in the "Centered" weapon group (Empty counts) — the old
    monk-level requirement was wrong; it had been masked by the stale
    persisted-stance merge.
  - **UI import tree gate**: `usePersistence` passes `allTrees` from
    `useStaticBundle` into `importV2Build`.
  Regression tests: `parityPass132.test.ts` (8 tests). Full suite 1083.

- ✅ **Pass 131 — fuzz-corpus alignment (fuzz 79→0, PR #174).** Root causes,
  each verified by direct oracle diff (all in V3 unless marked oracle):
  - **(oracle) headless auto-stance evaluation** — new
    `v2calc/shim/AutoStancesLinux.cpp` (see scoreboard note above). Fuzz
    builds write an empty `<ActiveStances/>`, so the oracle computed
    no armor/shield/weapon/race stances at all (mrrCap=0 everywhere, no
    armor PRR, …). The pane logic is now replicated headless; V2-authored
    files with persisted stances are unaffected (evaluation is idempotent).
  - **Armor stances re-derive from gear, ALWAYS** (`deriveArmorStances`):
    the old "recorded stance wins" rule was disproven — V2's armor stances
    are `<AutoControlled/>` and recomputed on load ("Odd tank" persists
    "Cloth Armor" while wearing heavy armor; V2 recomputes Heavy). Also:
    Docent→Cloth, Mithral Body→Light, Adamantine Body→Heavy, and an
    armor-slot item with NO `<Armor>` field yields NO armor stance
    (`Requirement::EvaluateItemInSlot`: "Empty" matches only an empty slot).
  - **Shield stances read `<Weapon>`** — real shield items are tagged
    `<Weapon>Buckler/Small Shield/Large Shield/Tower Shield</Weapon>`,
    never `<Armor>`; V2's stance names are per-type + umbrella "Shield" +
    "Orb"/"Rune Arm". The old `.Armor`-based detection ('Heavy/Light
    Shield' names) never matched anything.
  - **`Item.Weapon` was parsed as an ARRAY** (`dataLoaders.ts` had 'Weapon'
    in the global isArray list for WeaponGroupings' sake), so every
    `item.Weapon === '…'` comparison was silently false — scoped the array
    rule to WeaponGroup paths. This had disabled shield/weapon-type stance
    derivation and `weaponInfoFromItem.weaponType` with real catalogue data;
    persisted `<ActiveStances>` had been masking it on the curated corpus.
  - **Fighting-style stances follow Stances.xml requirements** — THF = main
    in "Two Handed" group; Ranged Combat = "All Ranged"; TWF = BOTH hands in
    "One Handed" (no animal form); SWF = main in "Single Weapon"/"Thrown"
    AND off-hand Empty/Buckler/Orb/Rune Arm. The old heuristic SWF'd any
    single weapon (a repeating crossbow is neither group → V2 never SWFs).
  - **Gear pool: ONE winner per bonus type by |value|**
    (`RemoveNonStacking` compares `fabs`): a −2 Resistance penalty is a
    "lesser version" of a +7 Resistance and is DROPPED, not applied
    alongside (old rule kept best-positive AND most-negative).
  - **Identical duplicate gear effects stack-merge** (`AddEffect`: one
    entry × stacks, exempt from Highest-Only) — Epic Ring of the Buccaneer
    carries GoodLuck +1 Luck twice → +2. Approximated by (source, value,
    percent) within the per-type gear pool; augment sources now include the
    host slot (V2 names them `<item> : <slot type> : <augment>`), so the
    same augment in two items stays DISTINCT and competes instead.
  - **Item buff bonus types honor the item's `<BonusType>`** — the Dodge
    and FalseLife cases in `parseItemBuff`/`parseEffect` hardcoded
    'Dodge'/'False Life', so dodge items stacked unconditionally
    (fuzz-5034: 9+8→17, V2 keeps 9) and tiered FalseLife
    (Enhancement/Insightful/Quality, Indomitable Wrappings 12+5+2=19)
    collapsed into one pool. A buff with NO `<Value1>` now resolves through
    the ItemBuffs.xml template (template's own Amount — Nightforge Docent's
    bare `<FalseLife>` → +10) instead of parsing as 0.
  - **Anonymous `AType=Stacks` effects merge by the owner's stamped name**:
    V2 stamps every DisplayName-less effect with its owner at load
    (`Feat::EndElement` → feat name; `EnhancementTreeItem::GetEffects` →
    `Name(selection)`), and `Effect::operator==` compares that stamp. So
    Shifter + Razorclaw Shifter "Shifter: Self Reliant" (same display name
    in both trees) merge to `Amount[Σranks−1]`, while "Past Life: Elf" vs
    "Past Life: Halfling" (identical anonymous tables) never merge.
    `parseEffect` gained a `stampName` param; the merge is also scoped per
    effect pool (gear vs character, V2 `m_effects` vs `m_itemEffects`).
  - **V2's tree-version gate on import** (`SpendInTree::EndElement`): a
    spend whose `<TreeVersion>` mismatches the catalogue tree's `<Version>`
    is revoked wholesale (headless answer = "No"); legacy tree names carry
    a LEADING SPACE in V2 that our trimming parsers lose, so
    `importV2Build`/`importV2Document` accept an `allTrees` catalogue, spot
    spaced names in the raw XML, and drop trimmed-name legacy spends the
    way V2 does (fuzz-5009's "Ninja Spy" v1 spend → revoked; a real
    V2-authored " Ninja Spy V1" spend survives).
  Regression tests: `parityPass131.test.ts` (12 tests) + updated
  `bonus.test.ts` / `parityPass121PRR` / `parityPass127PRR` /
  `parityPass39` / `parityPass45` / `weaponSlotDetection` specs whose old
  assertions encoded the disproven behaviors.

- ✅ **GrantFeat never re-applies the granted feat's own stat effects (#124)
  — ability.CON / saveFortitude / saveWill CLOSED, prr 14→10, mrr 12→8,
  rangedPower 3→2, ability.STR 3→2, builds-with-mismatch 31→28**: pass 59
  assumed V2 `Build::ApplyFeatEffects` fires whenever any source grants a
  feat via `Effect_GrantFeat` and fed the granted feat's own `<Effect>` list
  through `accumulateFeat`. Verified directly against the compiled V2
  source: `Build::ApplyEnhancementEffects`/`ApplyItemEffects` notify a
  GrantFeat effect only to breakdowns registered for `Effect_GrantFeat` —
  that is `CGrantedFeatsPane` (`OnInitialUpdate`:
  `RegisterBuildCallbackEffect(Effect_GrantFeat, this)`, used only to track
  the name for the Granted Feats panel / feat-prerequisite `IsGrantedFeat`
  checks) and a narrow `BreakdownItemPRR` re-derive trigger
  (`EnhancementEffectApplied`/`Revoked`: `if (effect.IsType(Effect_GrantFeat))
  CreateOtherEffects()`, recomputing armor-derived PRR, not applying the
  feat). `Build::ApplyFeatEffects` (`Build.cpp:2683`) is reached only via
  `TrainFeat`/`AutomaticFeats`/`TrainSpecialFeat` — never from a GrantFeat
  notification. Real-corpus symptom (oracle-diffed "highest Number
  possible.DDOBuild"): Epic Destiny "Fury of the Wild: I'm Always Angry"
  grants the Barbarian "Rage" feat outright via GrantFeat (no stance check
  on the grant itself); Rage's `AbilityBonus`/`SaveBonus`/`ACBonus` effects
  are each gated on `Requirement Stance=Rage` — on this non-Barbarian build
  with the Rage stance toggled, V3 added a phantom +4 STR / +4 CON / +2
  Will-morale / −2 AC that V2 (per the compiled oracle) never applies.
  `grantedFeat.<Name>` markers are still emitted and still populate
  `grantedFeatsList` (unchanged, #60 parity) — only the stat-effect
  re-application is removed. 3 regression tests in
  `parityPass124GrantFeat.test.ts`; `parityPass59.test.ts` corrected to
  match the verified V2 behavior.

- ✅ **hitpoints — CLOSED (49→38 #116, →31 #161, →21 #162, →19 #163, →2 #169,
  →0 #171)** — passes 116/119/120/121 closed epic/legendary halving,
  Combat-Style double-count, CON-delta scope, Reaper AP-cap scope, feat
  TotalLevel indexing, favor feats, the Reaper stance gate, and GoF selector
  own-effects; #169 closed the cross-feat `AType=Stacks` FatePoint
  global-stack merge; #171 closed the last builder (raydc, a classless
  build) — the "Unknown" pseudo-class never synthesized Improved Heroic
  Durability's 5/10/15 milestones. The old "percent-HP residue" theory is
  RETIRED — pass 120's reconciliation proved the percent engine exact; the
  exampledps golden HP residue is 0 and exact-checked.
- ✅ **saves: Reflex 37→18 / Fort 30→8 / Will 6 — CLOSED (this PR)** — root cause #1 fixed:
  `accumulateGuildBuffs` hardcoded the `classLevels` param passed to
  `parseEffect` to `0`, so every Guild Buff effect with `AType="TotalLevel"`
  (V2 `Effect.cpp:1205-1219`, indexed by `m_pBuild->Level()` — the total
  character level) always resolved to `Amount[0]` instead of the value for
  the build's actual level (e.g. GuildBuffs.xml "Game Hunter", a 40-entry
  table giving +1 Fortitude at level 1-8 up to +3 at level 13+, was frozen at
  +1 for every build regardless of level). Root-caused via a temporary
  `v2calc` per-effect `AllActiveEffects()`/`IsActive()` oracle dump (reverted)
  against `YingsMonk.DDOBuild`: V2 saveFortitude 84 vs V3 82, traced to
  "Game Hunter" contributing +1 instead of +3; same bug hit "Chronoscope"
  (Reflex) and every other `TotalLevel`-scaled guild buff — this also explains
  most of the `fortification` bucket (28→1). Fixed by threading
  `build.totalLevel + epicLevels + legendaryLevels` through as the
  `classLevels` arg. 2 regression tests in `parityGuildBuffTotalLevel.test.ts`.
  Residual: closed by passes 119 (feat TotalLevel + selector requirements +
  SliderValue), 122 (oracle slider default) and 123 (stale trained spells).
  This bullet was left marked 🟡 after #165 even though the residual it
  described was already gone; re-verified against the real
  `exampledps.cc1.v2export.txt` export (`parityGoldenPass106.test.ts`) —
  `save.Fort`/`save.Reflex`/`save.Will` are exact. New pinned assertion
  added directly to that test so a future regression fails loudly instead
  of silently reopening.
- ✅ **dodge (35→16 by #122's diagnosis, →1 after #164)** — the long-standing
  "armor-MDB secondary cap" hypothesis was STALE/WRONG (the cap never bound
  on the reconciled builds; `v2Formulas.ts` already applied it correctly).
  Real causes: dead `DodgeBonusTowerShield` type double-counting Mobility
  (+2 on 5 builds) and the ORACLE's headless slider defaulting to 1 stack
  instead of 0 ("Slippery Magic" +5 phantom on 6 builds) — both fixed in
  pass 122 (#164).
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
- ✅ **prr 22→14 / mrr 19→12 (rounds 121-122); mrrCap 4→0 and
  fortification 28→0 CLOSED (#163); rangedPower 15→3 / meleePower 10→1
  (#163/#164/#165) — CLOSED (this PR).** Selector own-effects + tracked
  armor stances (#163), auto-feat dedup + oracle slider (#164),
  trained-spell carry-over + truncation (#165). The "round-2 diagnosis in
  flight" note was stale: pass 133's full-analytics oracle widening
  (151/151 builds, 0 mismatches) and the real-export golden test
  (`parityGoldenPass106.test.ts`'s `ac`/`mrr`/`prr` exact-match assertion,
  already passing since #177) already closed the mixed-sign residue this
  bullet described; nobody had flipped its marker.

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

### Pass-131 follow-ups — ALL CLOSED by pass 132 (see the pass-132 entry
### in the oracle-derived bug list; the referee is now 151/151 exact)
- ✅ **UI import `allTrees`** — `usePersistence.ts` now reads the tree
  catalogue from `useStaticBundle()` and passes it to `importV2Build`, so
  the tree-version gate fires on UI imports too.
- ✅ **"New New Inquiz" hp +66** — mechanism identified with the new
  per-effect oracle dump (`V2CALC_DUMP_EFFECTS`): the off-hand item itself
  is REMOVED by `EquippedGear::SetItem` + `CanEquipTo2ndWeapon`
  (crossbow main hand without "Artificer Rune Arm Use" → no off-hand at
  all, augments included). Replicated in `buildStats` (off-hand removal +
  augments die with the host).
- ✅ **Nerfer / Odd tank** — both were stale-persisted-stance artifacts:
  Nerfer persisted "Wind Stance" that V2 revokes at load (its stance
  definition requires Centered, and a longbow isn't a centering weapon);
  Odd tank was missing the Stances.xml AUTO stances "Aura of Good"/"Aura
  of Courage" (Sacred Defender "Resistance Aura" +saves is gated on one).
  V3 now models V2's full stance load semantics (pass 132).

### Data-file edge cases
- ✅ **Item slot edge cases** — done (#71); trinket-via-augment not a V2 mechanic.
- ✅ **Cosmetic gear effects** — done (#71).
- ✅ **Sentient gem personality buffs** — not a gap (#71).
- ✅ **Filigree set bonuses with conditional triggers** — done (#71).
- ✅ **D1 — Legacy enhancement trees filtered from the picker** — done (#97).
- ✅ **D2 — `<SlotUpgrade>` (item augment-slot color upgrades)** — done (#98).
- ✅ **D3 — Minor Artifact single-equip restriction enforced** — done (#136,
  this pass). `Item.MinorArtifact?: string` added to `types/ddo.ts`;
  `buildStats.ts` strips every equipped Minor Artifact past the first
  (V2 canonical slot order tiebreak, no equip-order history in a static
  snapshot) through the existing `gearSlotsRemovedByV2` off-hand-rule
  mechanism, so augments/set-bonus contributions of the revoked item(s)
  are dropped too (V2 `EquippedGear::SetItem`, `EquippedGear.cpp:352-372`).
- ✅ **D4 — Artifact Filigree slots now gate on an equipped Minor Artifact
  item** — done (#134, this pass). V2 `Build.cpp:4767-4771`/`4843-4849`
  only applies/revokes the 10 "Artifact Filigree" slot effects when
  `gear.HasMinorArtifact()` is true. `buildStats.ts`'s call to
  `accumulateFiligrees` always applied `build.artifactFiligreeSlots` with
  no such gate — a build with no Minor Artifact equipped still got Artifact
  Filigree bonuses in V3. Fixed: `buildStatMapOnce` now checks whether any
  `gearItems` entry carries the presence-only `<MinorArtifact/>` flag
  (`'MinorArtifact' in item`, same pattern as the existing `NoPastLife`/
  `NotHeroic` flag normalisation) and passes an empty artifact-filigree
  slot list when none is equipped. 3 regression tests in
  `parityPassD4ArtifactFiligree.test.ts`.
- ✅ **D5 — Docent (Mithral/Adamantine Body) armor AC gated on the matching
  feat** — already done (stale marker; verified fixed in `buildStats.ts`'s
  `accumulateGear`, landed with pass 134/#178 but this TODO entry was never
  flipped). An item with a `MithralBody` value only contributes its base
  `ArmorBonus` when "Composite Plating" is trained and its Mithral Body
  bonus when "Mithral Body" is trained; `AdamantineBody` similarly requires
  "Adamantine Body" — matching V2 `Build.cpp:5779-5822` `ApplyArmorEffects`.
- ✅ **D6 — Legendary Green Steel "Dominant" stances never auto-activate —
  done (#147, this pass).** V2 `StancesPane.cpp:1053-1160`
  (`UpdateGreensteelStances`): with 2+ equipped Green Steel items, V2
  compares each item's Dominion/Escalation/Opposition set-bonus stack
  counts and auto-activates one of 5 mutually-exclusive stances
  (Dominion/Escalation/Opposition/Ethereal(4+)/Material(4+)), gating
  further set-bonus effects. `Item.h`'s `IsGreensteel` flag was unused in
  `webapp/src/lib` (only referenced in `v1Import.ts`'s name-migration
  tables) — a build with 2+ Green Steel items never got these auto-
  stances or their downstream effects in V3. Added `Item.IsGreensteel`
  (presence-only flag, mirrors `MinorArtifact`); `buildStats.ts` gains
  `deriveGreensteelStances` (counts non-weapon-slot `IsGreensteel` items,
  applies V2's exact dominance rules including Opposition's odd
  "only when Dominion and Escalation are tied" clause) and a shared
  `computeSetBonusCounts` helper (extracted from `accumulateSetBonuses` so
  both consult the same Set Bonus stack counts); the derived stances merge
  into `ctxStances` before gear/set-bonus effects resolve, so the existing
  `SetBonuses.xml` Dominion/Escalation/Opposition/Ethereal/Material blocks
  (already `Requirement Type="Stance"`-gated) fire correctly for the first
  time. 9 regression tests in `parityPassD6Greensteel.test.ts`.
- ✅ **D7 — `RestrictedSlots` item-level slot exclusion** — done (#145,
  this pass). V2 `Item.h:73` + `Build::SetGear` (`Build.cpp:4674-4692`) +
  `EquippedGear::IsSlotRestricted` (`EquippedGear.cpp:308-309`): an
  equipped item can declare arbitrary *other* inventory slots that must be
  cleared while it's worn (distinct from the already-ported two-handed/
  off-hand check) — e.g. "Shining Crescents" (Weapon1) restricts Weapon2,
  "Platinum Knuckles"/"Legendary Platinum Knuckles" (Weapon1) restrict
  Gloves. Added `Item.RestrictedSlots?: Record<string, boolean>` (same
  shape/parsing as the existing `EquipmentSlot` field); `buildStats.ts`
  now scans `gearItems` for it and clears every restricted display slot
  (via `gearSlots.ts`'s `displaySlotsForItemKey`) through the existing
  `gearSlotsRemovedByV2` mechanism, so a cleared slot's augments/set-bonus
  contributions die with it too — same pattern as D3/D4.
- ✅ **D8 — CLOSED (#160): `Build::VerifyGear`'s item-revocation pass now has
  a V3 equivalent.** V2 (`Build.cpp:2623-2665`) re-checks every equipped item
  on every level-up, race/class change, or feat-training event, and force-
  unequips (with a log entry) any item whose `item.MinLevel() > Level()` OR
  whose `<Requirements>` block (race/class/feat/alignment gates) is no longer
  met. 1,473 of the shipped `.item` files carry a `<Requirements>` block
  (top-level Requirement types in real data: `Race`/`NotConstruct`/
  `RaceConstruct`/`FeatAnySource`, all already handled by
  `meetsSingleRequirement`), and `dataLoaders.ts` parses `item.Requirements`
  fine, but nothing in `buildStats.ts` gated on it before applying the item's
  effects (only `GearPanel.tsx` read it, for display) — a build could equip,
  or import from a V2 save, or reach via level-down/race-swap, a race/class/
  feat-restricted or too-high-level item and V3 would keep applying its full
  effects/set-bonus/augment contributions forever, where V2 silently strips
  them. Fixed with a new block in `buildStats.ts` (same `gearSlotsRemovedByV2`
  mechanism as D3/D4/D7) that evaluates `item.MinLevel` against the build's
  character level (heroic+epic+legendary, matching the existing `Level`/
  `SpecificLevel` requirement-type convention) and `item.Requirements` via the
  shared `meetsRequirements` engine, stripping any item that fails either —
  its augments and set-bonus contributions die with it, same as the other
  three rules. 5 new regression tests in `parityPassD8VerifyGear.test.ts`.
- ✅ **D9 — CLOSED (#240): `Augment`'s cascading extra-slot fields now unlock
  further augment slots.** V2 (`Augment.h:41-44`, applied via the shared
  `AddAugment()` helper in `GlobalSupportFunctions.cpp:1967-2010`, called from
  `FindGearDialog.cpp:589-638`/`ItemSelectDialog.cpp`) lets selecting certain
  augments append one or more *new* augment slots to the host item — the
  mechanic behind Legendary Alchemical crafting (`Alchemical.Augments.xml`,
  62 uses — e.g. picking "Adamantine" in the Material slot adds a "Legendary
  Alchemical Tier 1" slot, cascading further), Thunderforged (32 uses, via
  `GrantConditionalAugment`+`WeaponClass`), and Legendary Green Steel Heroic
  (147 uses). `resolveAugmentSlots` (`gearSlotUpgrades.ts`) now resolves
  these alongside the existing `<SlotUpgrade>` mechanism (D2), so
  `GearPanel.tsx`'s already-generic per-slot rendering surfaces the new tiers
  with no UI changes needed. Note: a V2-imported save with tiered augments
  already chosen was ALREADY fine — `v2Import.ts` reads every `<ItemAugment>`
  child of the embedded item generically by array position, cascaded or not
  — the gap was purely that V3 could never reach a higher tier by editing
  gear directly. 10 new regression tests in `parityPassD9AugmentCascade.test.ts`.
- ✅ **D10 — CLOSED (#239): augment `ReplacedDynamically` weapon-type
  substitution now handled.** One augment (`DeckOfManyCurses.Augments.xml`,
  "Curse of Divine Fortune" — "If this item is a weapon, it is considered a
  Favored Weapon") uses `Effect_AddGroupWeapon` with a trailing
  `<Item>ReplacedDynamically</Item>` that V2 substitutes with the host item's
  actual weapon type at apply time (`Build.cpp:5024-5031` `ApplyAugment` /
  `5210-5217` `RevokeAugment`). `buildRuntimeGroupAdds` (`buildStats.ts`) only
  ever scanned trained feats and enhancements for `AddGroupWeapon` effects —
  augment effects were never scanned at all, so this augment silently did
  nothing (no downstream `GroupMember`/`GroupMember2`-gated effect, e.g. the
  Divine Crusader implement bonus, could ever see the host weapon as a member
  of the "Favored Weapon" group). Fixed: `buildRuntimeGroupAdds` now also
  iterates `build.augmentChoices`, resolves each via the existing
  `resolveAugment` helper, and — for any `AddGroupWeapon` effect whose Item
  list ends in the literal `"ReplacedDynamically"` placeholder — substitutes
  it with the host item's own `Weapon` type (or the literal `"Unknown"` when
  the host isn't a weapon, matching V2's `Weapon_Unknown` fallback) before
  feeding it through the same `extractFromEffects` path already used for
  feats/enhancements. 4 new regression tests in
  `parityPassD10AugmentGroupWeapon.test.ts`.
- ❌ **D11 — `Quest.DoNotShow` never normalized, so the V3 filter meant to
  hide placeholder quests is a no-op.** V2 `Quest.h:59` (`DL_FLAG(_,
  DoNotShow)`) marks 7 placeholder `Quests.xml` entries (e.g. "Land of
  Lamordia", "Ruins of Myth Drannor", "Ritual Table" — all `Favor=0`)
  hidden from every quest list. `loadQuests` (`webapp/src/server/
  dataLoaders.ts:565-571`) spreads the raw XML with no presence-flag
  promotion (unlike the already-fixed `NoPastLife`/`NotHeroic`/
  `MinorArtifact`/`IsGreensteel` flags — same bug class), so
  `quest.DoNotShow` parses to `""` instead of `true`; `FavorPanel.tsx:227`'s
  `quests.filter(quest => !quest.DoNotShow)` is therefore always true and
  never filters anything, so those 7 zero-favor placeholder quests show up
  in the Favor panel where V2 hides them. No favor-total impact (all are
  0-favor), but a genuine data-normalization gap of the exact class already
  fixed elsewhere.
- ❌ **D12 — `Quest.IgnoreForTotalFavor` not parsed at all, inflating the
  Favor panel's max-favor totals on duplicate quest entries.** V2
  `Quest.h:62` + `DDOBuilder.cpp:1136-1142` (`CDDOBuilderApp::LoadQuests`)
  excludes `IgnoreForTotalFavor`-flagged duplicate entries from both the
  per-patron and grand "Total Favor" max-favor tallies, to avoid
  double-counting quests that appear more than once (`Quests.xml` has
  "Devil Assault (Normal)" and "Devil Assault (Hard)", each `Favor=5`, both
  flagged). V3's `Quest` type (`types/ddo.ts:496-503`) has no
  `IgnoreForTotalFavor` field, `loadQuests` doesn't parse it, and
  `FavorPanel.tsx`'s `totalAvailable`/`totalFavor` reducers sum every
  quest's `Favor` unconditionally — overstating the Coin Lords'/grand-total
  favor denominator (and overstating achieved favor too, if both entries
  get ticked complete).
- ❌ **D13 — an item's own inherent `<ArcaneSpellFailure>` is parsed onto
  `Item` but never turned into a stat.** V2 `Build::ApplyArmorEffects`/
  `ApplyWeaponEffects` (`Build.cpp:5944-5951` armor, `Build.cpp:5660-5668`
  shields) synthesizes `Effect_ArcaneSpellFailure`/
  `Effect_ArcaneSpellFailureShields` from the equipped item's own
  `<ArcaneSpellFailure>` field (e.g. plate armor's inherent ASF%) whenever
  `item.HasArcaneSpellFailure()`. `effectParser.ts:1284-1288`/`2323-2326`
  already map those effect *types* to stat keys `arcaneSpellFailure`/
  `arcaneSpellFailureShield` for feat/enhancement-granted ASF effects, but
  `buildStats.ts`'s `accumulateGear` (alongside its already-handled
  `ArmorCheckPenalty`/`ShieldBonus`/`ArmorBonus` synthesis) never reads
  `item.ArcaneSpellFailure` at all, so an item's own inherent ASF% never
  reaches either stat key — and neither key is read anywhere else in
  `webapp/src` (not the Breakdowns panel, not any export section), so V3
  has no Arcane Spell Failure % surfaced anywhere for an armored/shielded
  arcane caster.

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
- ✅ **U12 — CLOSED (#164): per-tree save/load to a standalone file.** See the
  Done-table entry above for the full writeup. `ReaperEnhancementsPane.cpp`
  has no such feature in V2 either, so no gap there.
- ❌ **U13 — Granted Feats panel is missing V2's "Inactive Granted Feats"
  section.** V2 `CGrantedFeatsPane::PopulateGrantedFeatsList()`
  (`GrantedFeatsPane.cpp:250-360`) keeps every feat ever granted by an
  effect (`m_grantedFeats`) and, re-run on every stat/stance change (it
  explicitly hooks `StanceActivated`/`StanceDeactivated`), splits them into
  two displayed sections: "Granted Feats" (activation requirement
  currently met) and "Inactive Granted Feats" (granted by some source but
  not currently active — e.g. gated behind a stance the player hasn't
  toggled on). V3's `webapp/src/components/builder/AutomaticFeats.tsx`
  (lines 52-63) renders only a single "Granted Feats" list sourced from
  `stats.grantedFeatsList` (`buildStats.ts:3516-3519`), derived purely from
  which `grantedFeat.<Name>` keys resolved in the current stat pass — there
  is no code path anywhere that tracks or surfaces inactive/potential
  granted feats. A player with a stance-gated feat grant (the same
  `Effect_GrantFeat` class already shown to be stance-conditioned in real
  builds by Done item #124, e.g. Fury of the Wild's Rage grant) has no way
  to see that potential feat until they actually activate the stance.

### Forum export gaps

Fifth review pass diffed every `Add*` method in `DDOBuilder/ForumExportDlg.cpp`
against `webapp/src/lib/export/sections.ts`. X1–X9 (see Done table) are
already closed; these are new, some content gaps (not just formatting):

- ✅ **X10 — `specialFeats` forum-export section is dead code — done (#146,
  this pass).** V2 `AddSpecialFeats` (`ForumExportDlg.cpp:435-473`) filters
  `Build::SpecialFeats()` (Life+Character `<SpecialFeats>` plus the Build's
  own `<FavorFeats>`) by `Type=="Special"`/`"Favor"` into two headed blocks.
  V3's `specialFeats` section read `(build as any).specialFeats` — but
  `specialFeats: string[]` only exists on the `Life` type (`types/ddo.ts`),
  not `CharacterBuild`, and `ForumExportPanel.tsx`'s `SectionContext` never
  passed `Life` or `build.favorFeats`; the cast was always `undefined`, so
  this section emitted nothing for every real build (U11's Special/Favor
  Feats training UI writes to the right fields — this was purely an
  export-plumbing miss). Fixed: `SectionContext` gains a `specialFeats?:
  string[]` field (mirroring `useBuildStats`'s existing per-call resolution
  of `Life.specialFeats` from the active Life); `ForumExportPanel.tsx` now
  reads `useDocument()` + `findActiveLife(doc)?.specialFeats` and passes it
  through. The section emits two `[b]Heading[/b]:` blocks — "Special Feats"
  from `ctx.specialFeats`, "Favor Feats" from `build.favorFeats` — each with
  V2's duplicate-count suffix (`Name(N)`). V3 keeps the two pools separate
  by data-model source rather than re-deriving a per-entry `Type` string, a
  reasonable approximation of V2's Type-based filter since real V2 saves
  populate the `<SpecialFeats>` node with Type="Special" entries and the
  `<FavorFeats>` node with Type="Favor" entries. 4 regression tests in
  `parityPassX10SpecialFeats.test.ts`; `parityPass5.test.ts`'s stale
  assertion (which forced the dead legacy cast to exercise the section)
  updated to pass `specialFeats` via context instead.
- ✅ **X11 — `AddSkills` has no V3 equivalent — done (#209, this pass).** V2
  (`ForumExportDlg.cpp:889-1027`) emits a `[code]` monospace grid: skill
  points available per level, per-skill per-level ranks (½ for
  cross-class), Ranks/Tome/Buffed-total columns, and an "Available Points"
  row. V3's `skills` (`sections.ts:312-325`) only printed total ranks + stat
  bonus per skill — the whole per-level breakdown was missing. Rewrote the
  section to emit V2's exact `[code]` grid: a "Skill Points" row (per-level
  budget from `getLevelTrainingEntries`), a zero-padded level-number header
  (byte-identical to V2's misaligned "Skill Name       " label + " Ranks
  Tome Buffed" suffix), all 21 `SKILL_NAMES` rows in V2 enum order (raw
  per-level trained count for class skills, `floor(raw/2)` + a literal "½"
  — V2's 0xBD byte — for cross-class, reusing `build.skillRanksByLevel` via
  `getLevelTrainingEntries`), Ranks/Tome/Buffed columns read straight off
  the existing `skill.<Name>` stat's `Ranks`/`Tome` bonus rows and
  `stats.total()` (already V2-exact per items #21/#64/#106 — no new stat
  computation needed), and a trailing "Available Points" row. 11 regression
  tests in `parityPassX11Skills.test.ts`.
- ✅ **X12 — `AddConsolidatedFeats` has different semantics, not just
  formatting — done (#153, this pass).** V2 (`ForumExportDlg.cpp:735-844`)
  renders a per-level `[TABLE]` (Level | Class | Feats) with color-coded
  slot labels, "(Requires Feat Swap with Fred)"/"Alternate:" annotations,
  ability level-ups, automatic feats, and a red level-1 warning for
  Iconic/Archetype mismatches. V3's `consolidatedFeats`
  (`sections.ts:578-594`) just tallied how many times each distinct
  feat-choice value appears build-wide ("FeatName xN") — different content,
  not a formatting gap. Rewrote to emit V2's per-level table, reusing the
  already-exact `buildSlots`/`getLevelClasses`/`classLevelsAtLevel` helpers
  (Done items U7/X9/X11): color-coded `FeatType: FeatName` cells (V2's
  green/red `[COLOR]` pair), a yellow "Alternate: " annotation from
  `build.alternateFeats` (same slot-keyed shape V2's `AlternateFeatName`
  has, previously unused dead state — this is its first real consumer), a
  yellow ability-level-up row per `build.abilityLevelUps` entry (byte-exact
  reproduction of a verbatim V2 quirk: the ability's plain name leaks
  outside the row's `[TD]` tag before the colored cell opens), and a red
  level-1 warning (`Race.IconicClass` vs the level-1 class, distinguishing
  "Lesser Reincarnation" for one of the Iconic class's own `BaseClass`
  archetypes from "+1 Heart of Wood" for anything else) — no new data
  model needed. Two V2 pieces are intentionally left out, both undocumented
  in V3's data model: `TrainedFeat::HasFeatSwapWarning` (a hypothetical-swap
  prerequisite re-check with no V3 equivalent) and per-level placement of
  automatic feats (V2 interleaves `LevelTraining::AutomaticFeats()` into
  this same table, but V3 has no reliable per-level placement for the
  AutomaticAcquisition-derived ones like Attack/Sneak/Heroic Durability —
  they stay visible in the separate, already-correct `automaticFeats`
  section instead). 7 new regression tests in
  `parityPassX12ConsolidatedFeats.test.ts`.
- ✅ **X13 — `AddWeaponDamage` drops most fields — done (#152, this pass).**
  V2 (`ForumExportDlg.cpp:1680-1732`) always emits a fixed scalar block: Melee
  Power, Doublestrike%, Strikethrough%, Mainhand/Offhand damage-ability
  multiplier, Off-Hand attack Chance%, Fortification Bypass%, Dodge Bypass%,
  Helpless Damage bonus%, Ranged Power, Doubleshot Chance%, then (after a
  blank line) Sneak Attack Attack bonus and Sneak Attack Damage (`Nd6+M`) —
  each numeric/percent field via `AddBreakdown`, which truncates to a whole
  number. V3's `weaponDamage` (`sections.ts`) only showed a V3-invented
  dice/crit/to-hit/damage/doublestrike% summary that has no V2 equivalent in
  this section at all, and dropped every field above. Rewrote the section to
  emit V2's exact block, reading the already oracle/golden-verified stat keys
  `melee.power`/`ranged.power`/`melee.doublestrike`/`melee.strikethrough`/
  `offhand.attack`/`fortBypass`/`helpless`/`ranged.doubleshot` (Done items
  #106/#137) plus the previously-parsed-but-unsurfaced
  `melee.damageAbilityMult`/`offhand.damageAbilityMult`/`dodgeBypass`/
  `melee.sneakAttack`/`melee.sneakDice`/`melee.sneakDamage` keys — no new
  stat computation needed. Remaining gap, not closed in this pass: the
  per-weapon effects breakdown (`BreakdownItemWeaponEffects::
  AddForumExportData` — On Hit/Critical/Critical 19-20 damage lines, DR
  Bypass, Ghost Touch/True Seeing notes) has no V3 stat model yet (per-weapon
  DR bypass, ghost touch and true seeing flags aren't tracked at all) and is
  intentionally left out; a future pass should add it as its own item if
  needed. 6 new regression tests in `parityPassX13WeaponDamage.test.ts`.
- ✅ **X14 — `AddEnergyResistances` wrong type list + no `[TABLE]` — done
  (#208).** V2 (`ForumExportDlg.cpp:1167-1214`) always emits a
  `[TABLE]` with a header row and exactly 13 fixed type rows — Acid, Chaos,
  Cold, Electric, Evil, Fire, Force, Good, Lawful, Light, Negative, Poison,
  Sonic (Positive/Repair/Rust are deliberately commented out in the C++) —
  each row showing both Resistance and Absorbance (truncated to int,
  `%`-suffixed) even when both are 0. V3's `energyResistances`
  (`sections.ts`) used a different 11-type list (missing Chaos/Evil/Good/
  Lawful, wrongly including Positive/Repair), only emitted a row when
  non-zero, used a "Type Absorption: NN.N%" free-text line instead of a
  table row, and returned an empty section when every value was 0. Rewrote
  the section to always emit the full 13-row `[TABLE]`/`[TR][TD]…[/TD][/TR]`
  in V2's exact type order, with `Math.trunc` on both resistance and
  absorbance (absorbance still computed via the existing multiplicative
  `absorptionTotal` helper). 6 new regression tests in
  `parityPassX14EnergyResistances.test.ts`; `parityPassX3.test.ts`'s stale
  assertions (written against the old conditional-row, decimal-percentage
  format) updated to match the corrected V2-parity row format.
- ✅ **X15 — `AddSpellPowers` missing Critical Multiplier column + table
  wrap — done (this pass).** V2 (`ForumExportDlg.cpp:1453-1520`) always
  wraps `[SIZE=3][TABLE]` around 16 fixed, unconditionally-emitted rows
  (Acid, Light/Alignment, Chaos, Cold, Electric, Evil, Fire, Force/Untyped,
  Negative, Physical, Poison, Positive, Repair, Rust, Sonic, Untyped) with
  4 columns (Spell Power/Base/Critical Chance/Critical Multiplier — the
  Critical Multiplier and Critical Chance columns are `(int)`-truncated,
  the Base/power column is not). Two verbatim V2 quirks reproduced: there
  is no Lawful row at all (`BreakdownsPane` tracks a Lawful spell-power
  breakdown, but the export table never reads it), and "Force/Untyped"
  reads the Force breakdown (not a Force+Untyped merge) while a separate
  "Untyped" row reads the real Untyped breakdown. V3's `spellPowers`
  (`sections.ts`) emitted flat "Label: power / crit X%" lines only for
  non-zero types, had its own extra "Universal" row (added in pass X6),
  and had no Critical Multiplier column at all. Fixed: rewrote the section
  to emit V2's exact 16-row `[SIZE=3][TABLE]`, folding `sp.Universal`/
  `spCrit.Universal`/`spCritDmg.Universal`+`spCritDmg.All` additively into
  every row instead of a standalone row (`BreakdownItemSpellPower::
  CreateOtherEffects` parity — the same composition already verified by
  the oracle referee's `spellCritMultiplier` check, see pass 133). 8 new
  regression tests in `parityPassX15SpellPowers.test.ts`; `parityPassX6.
  test.ts`'s 5 stale assertions (written against the old conditional-row,
  no-table, Universal-has-its-own-row format) updated to match.
- ✅ **X16 — `AddTacticalDCs` missing table wrap + Evaluation column — done
  (#154, this pass).** V2 (`ForumExportDlg.cpp:1734-1756`) wraps
  `[SIZE=3][TABLE]` with 3 columns (Tactical DC/Value/Evaluation — the DC
  formula breakdown text) and one row per currently-granted `DC` object.
  V3's `tacticalDCs` (`sections.ts`) used to sum a fixed 13-entry
  `TacticalType` enumeration with no table and no breakdown text — see the
  Done-table entry above for the full rewrite (new `lib/dcBreakdown.ts`
  replicating `DC::CalculateDC`/`DC::DCBreakdown`).
- ✅ **X17 — Enhancement/Destiny/Reaper tree export sections missing
  headers + tier labels — done (#150, this pass).** V2 (`ForumExportDlg.cpp:1216-1451`)
  wraps each in a colored `[COLOR][SIZE=6]` header with AP totals ("Enhancements: 80
  APs, Racial N, Universal N" / "Epic Destinies: N Destiny Points"), then
  per-tree `[COLOR][SIZE=5]` "TreeName - Points spent: N" with `[HR][/HR]`
  separators, and prefixes each enhancement with its tier ("Core1 "/
  "Tier1".."Tier6") plus "- N Ranks". V3's `enhancements`/`epicDestinies`/
  `reaperTrees` (`sections.ts:379-436`) use plain "[b]…[/b]:" headers — no
  AP totals, tier labels, coloring, or "Points spent" line. Rewrote all
  three to emit V2's exact headers/tier labels/Points-spent totals,
  reusing `computeBonusActionPoints`/`destinyPoolForBuild` and a tree-cost
  calculation mirrored from `EnhancementTreePanel.tsx`. Also reproduces a
  verbatim V2 quirk: the Reaper-tree Ranks suffix reads the item's max
  `Ranks()` instead of the trained rank. 7 new regression tests in
  `parityPassX17TreeHeaders.test.ts`.

- ✅ **X18 — `AddSpells` had no V3 table (School/CL-MCL/DC columns) — done
  (#155, this pass).** See the Done-table entry above for the full rewrite.
  Fixed/auto-known spells and the Average/Critical Damage dice-formula
  columns remain out, both undocumented in V3's data model — noted in the
  Done entry as a future-pass candidate.

2026-08-16 scan diffed every remaining `Add*`/`Export*` method against
`sections.ts`; two new gaps beyond X1–X18:

- ✅ **X19 — CLOSED (this pass) for `AddGear`/`AddSimpleGear`;
  `AddAlternateGear` left as a documented residual.**
  `ForumExportDlg.cpp:1758-1943`'s shared `ExportGear`
  (`bSimple=false` for `AddGear`, `bSimple=true` for `AddSimpleGear`/
  `AddAlternateGear`) emits a colored `[SIZE=6]` gear-set-name header, a
  `[SIZE=3][TABLE]` with colored per-slot rows, a "Drops in: <location>"
  cell, a red "Restricted by another item" row for slot conflicts, per-item
  buff-description lines (`bSimple=false` only), augment-slot lines
  (including a yellow "Empty augment slot" warning on an unfilled slot whose
  type names both Mythic and Reaper, and a selectable-level `+N` suffix),
  set-bonus lines (`[S]…[/S]` strikethrough + "(Suppressed)" when an
  augment on the item suppresses them), and minor-artifact/weapon filigree
  lines (sentient weapon personality first). V3's `gear`/`simpleGear`
  sections previously emitted only a bare `[b]Gear[/b]:`/`[b]Gear
  (simple)[/b]:` heading with flat `  slot: item` lines (`simpleGear` did
  add slot-sorted augment lines from #33/pass 29, but nothing else). Fixed:
  new shared `exportGearTable()` (`sections.ts`) reproduces V2's exact
  `ExportGear` row shape for both, driven by the resolved gear `Item`
  catalogue (`SectionContext.gearItems`, same shape as the existing
  `useGearItems(build.gear)` hook, now also passed by `ForumExportPanel.tsx`)
  and the augment catalogue (`SectionContext.allAugments`, from
  `useStaticBundle`) — reusing `gearSlotUpgrades.ts`'s `resolveAugmentSlots`/
  `effectiveAugmentChoice` (already exact per D2/D9) for the augment-slot
  list and `itemDisplay.ts`'s `describeBuff`/`hasSelectableLevels`/
  `augmentValueAtIndex` (already exact per the gear hover cards) for buff
  descriptions and augment tier values — no new stat computation needed.
  Residual, intentionally left out of this pass: `AddAlternateGear` (V3's
  `alternateGearLayouts` section) calls the same `bSimple=true` exporter per
  non-active named gear setup, but V3 has no resolved `Item` catalogue for
  named gear sets (only the active `build.gear` is resolved today) — giving
  it the same table treatment needs a second `useGearItems`-style resolver
  keyed per named set, left for a future pass. `alternateGearLayouts` keeps
  its pre-existing slot-order + augment-line behaviour (#33) unchanged.
  18 new regression tests in `parityPassX19Gear.test.ts`; `forumExport.
  test.ts`'s SimpleGear-format assertions (written against the old flat
  list) updated to the new table row shape.
- ✅ **X20 — CLOSED (#163, this pass): `AddBonuses` now reproduces V2's
  `Life::MonitoredBonuses`-driven per-bonus-type table.** See the Done-table
  entry above for the full rewrite (`Life.monitoredBonuses` + new
  `lib/bonusesTable.ts` name→stat-key catalogue, gear-only `GetEffectValue`
  semantics, and the "Dodge Cap"/"Spell Craft" V2 quirks reproduced
  verbatim).

2026-08-26 scan diffed every remaining `Add*` method against `sections.ts`
once more; four new gaps beyond X1–X20:

- ❌ **X21 — `SelfAndPartyBuffs` reads the wrong build field — likely emits
  nothing for real builds.** V2 `ForumExportDlg.cpp:874-887
  AddSelfAndPartyBuffs` prints `Life::SelfAndPartyBuffs()`, the list the
  dedicated Buffs pane toggles. V3's `sections.ts:444-460`
  (`selfAndPartyBuffs`) instead reads `build.activeBuffs` — the *Stances*
  toggle array written by `TOGGLE_STANCE` — filtered to exclude catalogued
  stance names. The real self/party-buffs list lives in the separate
  `build.selfBuffs` field (written by `TOGGLE_BUFF` in
  `CharacterContext.tsx:473-480`, consumed by `SelfBuffsPanel.tsx`/
  `buildStats.ts`'s `accumulateSelfBuffs`), which this section never reads.
  Done item #107(e) split `selfBuffs` out of `activeBuffs` for the *stats
  engine* but never updated the exporter, so this bug survived that fix.
  Since the two arrays are populated by disjoint UI panels, the section
  will almost always render empty (or print stance names) for a real
  build.
- ❌ **X22 — `PastLives` doesn't reproduce V2's per-feat-line format, and
  invents an "Other Past Lives" bucket.** V2 `ForumExportDlg.cpp:393-433
  AddPastLives` calls the shared `AddFeats` helper (`:475-507`) once per
  category (Heroic, Racial, Iconic, Epic, in that order), each producing
  one line per feat as `FeatName(Count)` under a plain heading + `[HR][/HR]`.
  V3's `sections.ts:146-191` instead comma-joins all entries per bucket on
  a single line as `Name x2`, reorders the buckets (Heroic, Iconic, Epic,
  Racial), and adds a catch-all "Other Past Lives" bucket V2 has no
  equivalent for (V2 silently drops anything not matching one of the 4
  known `<Type>`s). The sibling `SpecialFeats`/`FavorFeats` section
  (`sections.ts:1174-1191`, closed under X10) already reproduces V2's
  `Name(N)` per-line convention off the same `AddFeats` V2 function —
  `PastLives` should have gotten the same treatment but didn't.
- ❌ **X23 — `ActiveStances` drops V2's per-group label.** V2
  `ForumExportDlg.cpp:846-872 AddActiveStances` emits one line per selected
  stance as `GroupName: StanceName`, iterating `CStancesPane::Groups()`.
  V3's `sections.ts:426-439` instead comma-joins all active stance names
  onto a single line with no group prefix. The catalogue data needed to
  reproduce this is already present (`Stance.Group`, `types/ddo.ts:354`,
  exposed via `SectionContext.allStances`) but unused for this purpose.
- ❌ **X24 — `AutomaticFeats` uses a grouped-by-source list, not V2's
  per-level table (lower confidence — may be an accepted design choice, see
  Done item #111).** V2 `ForumExportDlg.cpp:691-733 AddAutomaticFeats`
  emits a `[TABLE]` with one row per character level (Level | Class |
  Feats), the same shape as `FeatSelections`/`ConsolidatedFeats`. V3's
  `sections.ts:465-480` instead reuses `buildAutomaticFeatGroups` (shared
  with the live Automatic Feats panel per #111) to print
  `  Source: Feat1, Feat2` with no level/class columns. #111 frames this
  sharing as intentional, so this may not be a real gap — flagged here for
  a maintainer decision rather than closed outright.

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

*Maintained by the parity-pass series. See PRs #53–#249 and the Done table
above for completed items. Last full V2↔V3 review: 2026-08-26 (seventh
pass) — five independent parallel scans covering numerical correctness
(`Breakdown*.cpp` vs. `useBuildStats.ts`/`buildStats.ts`), effect parser
coverage (`Effect.cpp`/`Effect.h`'s full `EffectType`/`AmountType` enums +
`Requirement.cpp`'s evaluators vs. `effectParser.ts`), UI features
(`*Pane.cpp`/`*Dialog.cpp` vs. `webapp/src/components/`), forum export
(`ForumExportDlg.cpp` vs. `sections.ts`), and data-loading edge cases
(`Quest.h`/`Item.h`/`Build.cpp` vs. `dataLoaders.ts`/`buildStats.ts`).
Numerical correctness and effect-parser Type/AType/Requirement coverage
were both reconfirmed complete with **no new gaps** (two V2-internal bugs
noted as confirmed-but-not-triggerable with any real data file — see the
"Seventh review pass" note under High-priority remaining). New gaps found,
all in UI/export/data-loading: D11–D12 (`Quest.DoNotShow`/
`IgnoreForTotalFavor` flags never parsed — a dead favor-list filter and an
inflated max-favor total), D13 (an item's own inherent Arcane Spell
Failure % is parsed but never turned into a stat), U13 (Granted Feats panel
missing V2's "Inactive Granted Feats" section), and X21–X24 (forum-export
`SelfAndPartyBuffs` reads the wrong build field and likely emits nothing for
real builds; `PastLives`/`ActiveStances`/`AutomaticFeats` formatting
diverges from V2's exact output shape, the last of these lower-confidence).*
