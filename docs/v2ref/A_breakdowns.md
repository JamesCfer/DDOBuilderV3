# A. Breakdown / Stat-Computation System

Each character stat in V2 is owned by a `BreakdownItem` subclass. All instances are created in `CBreakdownsPane::AddBreakdownItems` and stored in `m_items` (a flat vector), then looked up by `BreakdownType` via `FindBreakdown()` (`BreakdownsPane.cpp:2971`). A breakdown registers interest in one or more `EffectType`s through `pPane->RegisterBuildCallbackEffect(effect, this)`; when the effect engine (section B) emits a matching `FeatEffectApplied` / `ItemEffectApplied` / `EnhancementEffectApplied`, the breakdown's `AffectsUs()` filters it and routes it into one of three effect buckets. A breakdown's value is computed lazily by `Total()` (the sum of the buckets after non-stacking removal and percentage math) and displayed via `Value()`/`Title()`. Breakdowns are also `BreakdownObserver`s of each other: e.g. Hitpoints observes Constitution, Skills observe their governing ability, so when one stat changes it calls `NotifyTotalChanged()` and every dependent breakdown recomputes (`Populate()`). The whole system is the C++ analogue of the V3 single-pass `useBuildStats.ts` hook, which accumulates `RawBonus[]` into a `StatMap` then resolves on demand.

## File Index

| File | Stat it owns | V3 counterpart |
|------|--------------|----------------|
| BreakdownItem.cpp | base class machinery (buckets, Total, observer) | `hooks/useBuildStats.ts` (StatMap + resolve), `lib/effectResolve` |
| BreakdownItemSimple.cpp | generic "sum one EffectType" stats (speed, ACP, fort, false life, reaper HP, neg levels, fate pts, natural armor, bonus armor/shield AC, MDB shields, healing amp, doublestrike, etc.) | `useBuildStats.ts` generic stat keys |
| BreakdownItemAbility.cpp | the 6 ability scores | `useBuildStats.ts` ability resolution |
| BreakdownItemSave.cpp | Fort/Reflex/Will + sub-saves + no-fail-on-1 | `useBuildStats.ts` save keys |
| BreakdownItemSkill.cpp | the 21 skills | `useBuildStats.ts` skill keys |
| BreakdownItemHitpoints.cpp | Hitpoints | `useBuildStats.ts` hp |
| BreakdownItemSpellPoints.cpp | Spell Points | `useBuildStats.ts` spellPoints |
| BreakdownItemMaximumKi.cpp | Maximum Ki | `useBuildStats.ts` ki.max |
| BreakdownItemBAB.cpp | Base Attack Bonus | `useBuildStats.ts` bab (`v2Bab`) |
| BreakdownItemPRR.cpp | PRR | `useBuildStats.ts` prr |
| BreakdownItemMRR.cpp | MRR (display, applies cap) | `useBuildStats.ts` mrr + mrrCap |
| BreakdownItemMRRCap.cpp | MRR cap (50/100/none) | `useBuildStats.ts` mrrCap |
| BreakdownItemAC.cpp | Armor Class | `useBuildStats.ts` ac |
| BreakdownItemMDB.cpp | Max Dex Bonus | `useBuildStats.ts` mdb / `armorMaxDex` |
| BreakdownItemDodge.cpp | Dodge (capped) | `useBuildStats.ts` dodge + `effectiveDodgeCap` |
| BreakdownItemDR.cpp | Damage Reduction (text "n/type") | `useBuildStats.ts` DR strings |
| BreakdownItemTactical.cpp | Tactical DCs (Trip/Stun/Sunder/…) | `useBuildStats.ts` tacticalDC.* |
| BreakdownItemSneakAttackDice.cpp | Sneak Attack Dice (nD6) | `useBuildStats.ts` melee.sneakDice |
| BreakdownItemDice.cpp | generic dice display (imbue) — **NYI in V2** | ❌ (V2 stub) |
| BreakdownItemPactDice.cpp | Pact dice (nd<size>) | `useBuildStats.ts` pact dice (partial) |
| BreakdownItemTurnUndeadHitDice.cpp | Turn Undead Hit Dice (2d6+n) | `useBuildStats.ts` turnUndead (combined) |
| BreakdownItemTurnUndeadLevel.cpp | Turn Undead Level | `useBuildStats.ts` turnUndead (combined) |
| BreakdownItemCasterLevel.cpp | per-class caster level + max caster level | `useBuildStats.ts` casterLevel.* |
| BreakdownItemSchoolCasterLevel.cpp | per-school caster level bonus | `useBuildStats.ts` (partial) |
| BreakdownItemEnergyCasterLevel.cpp | per-energy caster level bonus | ❌ |
| BreakdownItemSpellPower.cpp | per-element spell power, crit chance, crit mult | `useBuildStats.ts` spellPower.* / `BreakdownsPanel.tsx` SP grid |
| BreakdownItemUniversalSpellPower.cpp | Universal spell power (implement bonus) | `useBuildStats.ts` spellPowerUniversal |
| BreakdownItemSpellSchool.cpp | per-school DC | `useBuildStats.ts` spellDC.* |
| BreakdownItemDuration.cpp | song/effect durations (h:m:s) | ❌ |
| BreakdownItemDestinyAps.cpp | Destiny APs | `useBuildStats.ts` destiny pts |
| BreakdownItemImmunities.cpp | Immunities (text list) | `BreakdownsPanel.tsx` immunities |
| BreakdownItemEnergyResistance.cpp | per-element energy resistance | `BreakdownsPanel.tsx` energy resist |
| BreakdownItemEnergyAbsorption.cpp | per-element % absorption (multiplicative) | `BreakdownsPanel.tsx` energy absorption |
| BreakdownItemOffhandDoublestrike.cpp | Offhand doublestrike (½ or 0.65× main) | `useBuildStats.ts` (partial) |
| BreakdownItemWeaponEffects.cpp | hidden holder routing weapon effects → per-weapon sub-breakdowns | `lib/combat/attackEntry.ts` |
| BreakdownItemWeapon.cpp | hidden per-weapon holder of ~16 sub-breakdowns | `lib/combat/attackEntry.ts` |
| BreakdownItemWeaponAttackBonus.cpp | per-weapon attack bonus | `lib/combat/attackEntry.ts` |
| BreakdownItemWeaponDamageBonus.cpp | per-weapon damage bonus | `lib/combat/attackEntry.ts` |
| BreakdownItemWeaponOtherDamageEffects.cpp | bonus dice/damage effects — **NYI** | ❌ |
| BreakdownItemWeaponCriticalMultiplier.cpp | crit multiplier (base + 19-20 variant) | `lib/combat/attackEntry.ts` |
| BreakdownItemWeaponCriticalThreatRange.cpp | crit threat range | `lib/combat/attackEntry.ts` |
| BreakdownItemWeaponVorpalRange.cpp | vorpal range | `lib/combat/attackEntry.ts` (partial) |
| BreakdownItemWeaponAttackSpeed.cpp | weapon alacrity/attack speed | `lib/combat/attackRate.ts` |
| BreakdownItemWeaponDRBypass.cpp | weapon DR bypass (good/silver/…) | ❌ |
| BreakdownItemWeaponEffects (shield/ghost touch/true seeing sub-breakdowns) | misc weapon flags | partial |

---

## BreakdownItem.cpp (base class)

The base class holds three effect buckets and the math that turns them into a number.

**Three effect buckets** (`BreakdownItem.h`):
- `m_otherEffects` — derived/computed contributions the breakdown synthesizes itself in `CreateOtherEffects()` (class levels, ability mods, base values).
- `m_effects` — feat + enhancement effects (anything not flagged "apply as item").
- `m_itemEffects` — equipment effects (and anything flagged `HasApplyAsItemEffect()`); only this bucket is subject to non-stacking de-duplication and the `Multiplier()`.

**`Total()` — `BreakdownItem.cpp:200`** (the heart of stat math):
1. `total = SumItems(m_otherEffects,false) + SumItems(m_effects,false)`.
2. Copies `m_itemEffects`, then strips inactive (`RemoveInactive`), non-stacking duplicates (`RemoveNonStacking`), and "Temporary"-bonus effects (`RemoveTemporary`); adds `SumItems(itemEffects, true)` **with the multiplier applied**. Saves this as `baseTotal`.
3. Applies percentage effects against `baseTotal`: `DoPercentageEffects` on other/feat/item buckets (`:215-222`). Percentages do **not** stack — each is `int(baseTotal × pct/100 + 0.5)` (half-up since 2.0.0.83) and added.
4. Adds back the temporary effects (`:223`) after percentages.
5. *(Removed in 2.0.0.83)* the HP-only `m_bAllPercentsAtOnce` / `m_discrepancy` path that rounded multiple % bonuses once instead of per-effect. Percent HP now arrives pre-combined as a single effect from `Breakdown_HitpointsPercent`.

**`SumItems()` — `:436`**: iterates a bucket, skipping effects whose `IsActive(char, slot, mainWeapon, offWeapon)` is false and skipping percent effects. Normal stat: straight addition; `StacksByMultiplication()` (overridden by absorption) instead does fractional product `total *= (100-amount)/100`. `bApplyMultiplier` multiplies each item-bucket amount by `Multiplier()`.

**`Multiplier()` — `:500`**: default 1.0. Overridden by `BreakdownItemSpellPoints::Multiplier` (FvS/Sorc up to 2× SP).

**`DoPercentageEffects()` — `:469`**: sums active percent effects, each contributes `int(total × pct/100)`; stores `SetPercentValue` for display. With `m_bAllPercentsAtOnce`, tracks a discrepancy between summed-then-rounded vs rounded-per-item.

**`RemoveNonStacking()` — `:725`**: for effects whose bonus type is `StackingType_HighestOnly`, keeps only the largest of each (Bonus, value, percent) group and pushes the rest to a "Non-Stacking" display list; sets `m_bHasNonStackingEffects` (colors the row red).

**`CreateOtherEffects()` — pure virtual (`:131`)**: each subclass synthesizes its derived contributions here and is re-invoked whenever a dependency changes.

**`AddOtherEffect` / `AddFeatEffect` / `AddEnhancementEffect` / `AddItemEffect` — `:618-657`**: route an `Effect` into the right bucket; if the effect `HasApplyAsItemEffect()` they all divert into `m_itemEffects`. `AddEffect` (`:813`) either bumps an existing identical effect's stack count or appends a new one (handles slider start positions), then calls `Populate()`.

**`GetEffectValue(bonus, bItemEffectsOnly)` — `:1234`**: sums `TotalAmount` of all active effects with a given bonus-type string (used e.g. by AC to read the "Armor"/"Shield" enchant amounts).

**Observer pattern**: `BreakdownItem` is both a `BreakdownObserver` and observable. Subclasses `AttachObserver(this)` on breakdowns they depend on; `NotifyTotalChanged()` (`:924`) fires `UpdateTotalChanged` to observers whenever `Populate()` detects a changed cached total (`:192`). `AddAbility`/`LargestStatBonus` (`:521`,`:581`) auto-attach to the relevant ability breakdowns and pick the highest-modifier eligible ability. The effect-engine callbacks (`FeatEffectApplied` etc., `:1059+`) filter via `AffectsUs()` then add/revoke into a bucket and `Populate()`.

**`Populate()` — `:170`**: recomputes `Total()`, writes `Title()`/`Value()` to the tree, and notifies observers if the total changed. Suppressed while `s_bUpdatesLocked` (bulk-edit batching via `SetLockState`).

## BreakdownItemSimple.cpp
- **Owns**: any stat that is "just sum the effects of one `EffectType`" — speed, armor-check penalty (+shield), fortification, false life, reaper HP, negative levels, fate points, style-bonus feats, natural armor, bonus armor/shield AC %, MDB-shields, unconscious range, healing/repair/neg-heal amp, doublestrike/doubleshot, melee/ranged power, etc.
- **Formula/mechanic**: `CreateOtherEffects()` clears (no derived contributions); the whole value comes from base-class `Total()` summing the buckets. `AffectsUs` = `effect.IsType(m_effect)` (`:51`).
- **Data source**: the single `EffectType` passed to the ctor (registered if `bRegisterCallback`).
- **V3 counterpart**: generic stat keys accumulated in `useBuildStats.ts`.

## BreakdownItemAbility.cpp
- **Owns**: the 6 ability scores; `Value()` shows score + `(Mod %d)` (`:34`).
- **Formula**: `CreateOtherEffects` (`:45`) = `8 + point-buy spend` + racial modifier + tome-at-level + level-up points; all as `Effect_AbilityBonus` "Base/Racial/Inherent/Level Up". Item/feat/enhancement ability bonuses arrive via the bucket.
- **Data source**: `Effect_AbilityBonus`; build point-buy, `Race.RacialModifier`, `Life.TomeAtLevel`, `Build.LevelUpsAtLevel`.
- **V3**: ability resolution in `useBuildStats.ts`.

## BreakdownItemSave.cpp
- **Owns**: Fortitude/Reflex/Will + sub-saves (vs Poison, Disease, Fear, Enchantment, Illusion, Spell, Magic, Traps, Curse) + an embedded "no-fail-on-1" tracker (`m_pNoFailOnOne`).
- **Formula**: main saves (`AddClassSaves`, `:452`) sum `Class.ClassSave(saveType, levels)` per class; add the best governing-ability modifier via `LargestStatBonus`; add Divine Grace (CHA mod capped at `2 + 3×Paladin/SacredFist`, `:476`) or Half-Elf Lesser Divine Grace (cap 2 + dilettante upgrades, `:513`); subtract 1 per negative level. Sub-saves take the **base save Total** as one effect plus their own specific effects (avoids double-counting "All" bonuses — see `AffectsUs` `:168`).
- **Data source**: `Effect_SaveBonus`, `Effect_DivineGrace`, `Effect_SaveBonusAbility`, `Effect_SaveNoFailOn1`; class save tables.
- **V3**: save keys + `divineGraceCap`/`halfElfLesserDivineGraceCap` in `useBuildStats.ts`.

## BreakdownItemSkill.cpp
- **Owns**: the 21 skills. `Value()` is "N/A" if no ranks possible for the level (`:42`).
- **Formula** (`:72`): trained ranks (`Build.SkillAtLevel`) + governing-ability modifier (uses the ability breakdown **Total**, not raw) + skill tome + armor-check penalty × `ArmorCheckPenalty_Multiplier(skill)` for armor and shield (penalty only, `min(0,…)`) − 1 per negative level.
- **Data source**: `Effect_SkillBonus`, `Effect_SkillBonusAbility`; observes its ability breakdown + ACP breakdowns.
- **V3**: skill keys in `useBuildStats.ts`.

## BreakdownItemHitpoints.cpp
- **Owns**: total Hitpoints. Adds a single `"Total Hitpoints % Bonus"` percent other-effect fed by `Breakdown_HitpointsPercent` (`Effect_HitpointsPercent`, 2.0.0.83), so the whole % HP stack rounds once.
- **Formula** (`:47`): Σ over classes of `classLevels × Class.HitPoints()` (Epic/Legendary count half toward the *style-bonus base* only); + Fate-Points×2 at L20+; − negative-levels×5; + CON-mod × character level; + Combat-Style bonus = `0.25 × min(4, styleFeats) × classHitpoints` (25% per style feat, max 100%, heroic HP only); + False Life total; + Reaper HP (level-gated cap 50/100/200/400/800, requires Reaper stance).
- **Data source**: `Effect_Hitpoints`, `Effect_HitpointsPercent`, `Effect_FalseLife`, `Effect_HitpointsStyleBonus`; observes Constitution, FatePoints, NegativeLevels, StyleBonusFeats, FalseLife, ReaperHitpoints, HitpointsPercent.
- **V3**: hp in `useBuildStats.ts` (cites `BreakdownItemHitpoints.cpp:74-83` for the Epic/Legendary half rule).

## BreakdownItemSpellPoints.cpp
- **Owns**: Spell Points.
- **Formula** (`:890`): per class, `Class.SpellPointsAtLevel(levels)` + ability SP = `(classLevels + 9) × castingAbilityMod` (per DDOwiki); + Fate-Points at L20+. `Multiplier()` (`:995`) = `1 + (FvS+Sorc levels)/min(charLevel,20)` (up to 2× from item SP).
- **Data source**: class SP tables, `Class.ClassCastingStat`, observes the casting ability + FatePoints.
- **V3**: spellPoints in `useBuildStats.ts` (`spellPointsAtLevel` 21-entry table).

## BreakdownItemMaximumKi.cpp
- **Owns**: Maximum Ki.
- **Formula** (`:41`): base **40** + (WIS mod × 5) + any `Effect_KiMaximum` effects.
- **Data source**: `Effect_KiMaximum`; observes Wisdom.
- **V3**: ki.max in `useBuildStats.ts`.

## BreakdownItemBAB.cpp
- **Owns**: Base Attack Bonus.
- **Formula** (`:39`): Σ over classes of `floor(Class.BAB()[classLevels])` (per-class fraction truncated then summed); + an OverrideBAB boost that raises BAB to `min(25, charLevel) − currentBab` if any enhancement sets `Breakdown_OverrideBAB`.
- **Data source**: class BAB tables, observes OverrideBAB.
- **V3**: bab in `useBuildStats.ts` (`v2Bab`, `MAX_BAB = 25`).

## BreakdownItemPRR.cpp
- **Owns**: Physical Resistance Rating. `Value()` shows PRR and `% reduction = 100 − 100/(100+PRR)·100` (`:37`).
- **Formula** (`:43`): armor-dependent BAB scaling — Light/Mithral Body = BAB×1, Medium = round-up(BAB×1.5), Heavy/Adamantine Body = BAB×2 (Cloth = 0), gated by armor proficiency + stance. Plus any `Effect_PRR`.
- **Data source**: `Effect_PRR`; observes BAB; stance + feat (Mithral/Adamantine Body).
- **V3**: prr in `useBuildStats.ts` (cites `BreakdownItemPRR.cpp:43-122`).

## BreakdownItemMRR.cpp / BreakdownItemMRRCap.cpp
- **MRR owns**: Magical Resistance Rating display; reads MRRCap and clamps; same `%`-reduction formula as PRR; shows "(Capped)".
- **MRRCap owns**: the cap value — Cloth/no armor = 50, Light = 100, Medium/Heavy = none (`MRRCap.cpp:60`). `Value()` shows "None" unless Cloth/Light stance active.
- **Data source**: `Effect_MRR` / `Effect_MRRCap`; armor stance + Mithral/Adamantine Body feats.
- **V3**: mrr + mrrCap in `useBuildStats.ts` (cites the 50/100/none rule).

## BreakdownItemAC.cpp
- **Owns**: total Armor Class.
- **Formula** (`:45`): DEX bonus capped by `Breakdown_MaxDexBonus` (and `MaxDexBonusShields` when Tower Shield active); + `BonusArmorAC`% applied to (Armor + Armor-Enhancement effect values); + `BonusShieldAC`% of Shield value (when Shield stance); + Natural Armor breakdown. The flat base-10 and armor/shield item AC arrive as bucket effects.
- **Data source**: `Effect_ACBonus`, `Effect_EnchantArmor`; observes Dexterity, MaxDexBonus(/Shields), BonusArmorAC, BonusShieldAC, NaturalArmor, and the weapon shield-enchant breakdown (`LinkUp`, `:187`).
- **V3**: ac in `useBuildStats.ts`.

## BreakdownItemMDB.cpp / BreakdownItemDodge.cpp
- **MDB owns**: Max Dex Bonus; `m_bNoLimit` ("No limit") when Cloth Armor and no Tower Shield (`MDB.cpp:46`).
- **Dodge owns**: Dodge %. `CappedTotal()`/`Value()` (`Dodge.cpp:32`) clamp the summed dodge by `min(DodgeCap, MaxDexBonus[non-cloth], MaxDexBonusShields[tower shield])`, displaying "(Capped from N)".
- **Data source**: `Effect_MaxDexBonus` / `Effect_DodgeBonus`; observes DodgeCap, MaxDexBonus, MaxDexBonusShields.
- **V3**: mdb/`armorMaxDex`, dodge + `effectiveDodgeCap` in `useBuildStats.ts`.

## BreakdownItemDR.cpp
- **Owns**: Damage Reduction; `Value()` concatenates each effect as `amount/type` (`:36`,`AddEffectToString:67`).
- **Data source**: `Effect_DR`.
- **V3**: DR strings in `useBuildStats.ts` / panel.

## BreakdownItemTactical.cpp
- **Owns**: one tactical DC per `TacticalType` (Trip, Stun, Sunder, Trap, Assassinate, General, Wands, Fear, etc.).
- **Formula**: `CreateOtherEffects` is empty — value comes entirely from `Effect_TacticalDC` effects matched by `AffectsUs → effect.HasTacticalType(m_tacticalType)` (`:55`). Observes STR and CHA (their changes drive stat-based DC effects).
- **Data source**: `Effect_TacticalDC`.
- **V3**: tacticalDC.* in `useBuildStats.ts`.

## BreakdownItemSneakAttackDice.cpp / BreakdownItemPactDice.cpp / BreakdownItemDice.cpp
- **SneakAttackDice owns**: sneak dice; `Value()` = `Total()` "D6" (`:31`). Source `Effect_SneakAttackDice` (passed in).
- **PactDice owns**: warlock pact dice; `Value()` = `Total() d<m_diceSize>` (`:33`).
- **Dice owns**: generic dice display (imbue) — **`SumDice()` returns "NYI"** (`Dice.cpp:50`); effectively a stub in V2.
- **Data source**: the `EffectType` passed to ctor.
- **V3**: melee.sneakDice (others ❌/partial).

## BreakdownItemTurnUndeadHitDice.cpp / BreakdownItemTurnUndeadLevel.cpp
- **Owns**: Turn Undead Hit Dice (`Value()` = "2d6 + N") and Turn Undead Level.
- **Formula** (`TurnUndeadHitDice.cpp:42`, `TurnUndeadLevel.cpp:41`): effective level = `max(Cleric CL, Dark Apostate CL, Paladin CL − 3)`; HitDice additionally adds CHA modifier.
- **Data source**: `Effect_TurnDiceBonus` / `Effect_TurnLevelBonus`; observes Cleric/Dark Apostate/Paladin caster-level breakdowns + CHA.
- **V3**: combined `turnUndead` key in `useBuildStats.ts`.

## BreakdownItemCasterLevel.cpp / BreakdownItemSchoolCasterLevel.cpp / BreakdownItemEnergyCasterLevel.cpp
- **ClassCasterLevel owns**: per-class caster level (`Breakdown_CasterLevel_First + classIndex`) and per-class **max** caster level; one instance per class per variant. `Title()` switches on `Effect_CasterLevel` vs max (`:30`).
- **Formula** (`:53`): base = `Build.ClassLevels(class)`; Wild Mage / Arcane Trickster "Mixed Magics" enhancement adds `min(20,charLevel) − classLevels` (treats off-class as your class). Bonuses arrive via the effect bucket. `AffectsUs` matches class name or "All" (`:108`).
- **SchoolCasterLevel / EnergyCasterLevel**: pure pass-through (`CreateOtherEffects` empty); value from `effect.HasSpellSchool(school)` / energy-type match. `Value()` shows signed `%+3d`.
- **Data source**: the per-variant `EffectType`.
- **V3**: casterLevel.* in `useBuildStats.ts` (school partial, energy ❌).

## BreakdownItemSpellPower.cpp / BreakdownItemUniversalSpellPower.cpp
- **SpellPower owns**: per-element spell power **and** (reused with a different `EffectType`) spell critical chance (`Effect_SpellLore`) and crit multiplier (`Effect_SpellCriticalDamage`).
- **Formula** (`:405`): for `Effect_SpellPower`, adds a governing-skill bonus (`SpellPowerBreakdown`, `:374`: Heal→Positive/Negative, Perform→Sonic, Repair→Repair/Rust, else Spellcraft) **plus** the Universal Spell Power total; lore/crit variants add the universal lore/multiplier. `ReplacementTotal()` (`:361`) looks for `Effect_SpellPowerReplacement` and uses a higher alternate element's total if present (e.g. potency-style "use highest"). `Value()` shows the replacement element when it differs.
- **UniversalSpellPower** (subclass of Simple): adds the implement bonus = main-hand weapon `MinLevel` (when an Implement-In-Your-Hands effect is present and no existing Implement bonus), and a Draconic Conduit + Quarterstaff bonus = `weaponPlus × 3` (`UniversalSpellPower.cpp:678`).
- **Data source**: `Effect_SpellPower` / `Effect_SpellLore` / `Effect_SpellCriticalDamage` / `Effect_SpellPowerReplacement` / `Effect_UniversalSpellPower`; observes the governing skill + universal breakdowns.
- **V3**: spellPower.* + spellPowerUniversal in `useBuildStats.ts`; SP grid in `BreakdownsPanel.tsx`.

## BreakdownItemSpellSchool.cpp
- **Owns**: per-school spell DC (Abjuration … Transmutation, plus Fear, GlobalDC, RuneArm).
- **Formula**: pure pass-through; `AffectsUs` = `effect.HasSpellSchool(school, m_bSpecificDCOnly)` (`:838`).
- **Data source**: the `EffectType` passed to ctor.
- **V3**: spellDC.* in `useBuildStats.ts`.

## BreakdownItemEnergyResistance.cpp / BreakdownItemEnergyAbsorption.cpp
- **EnergyResistance owns**: flat resistance per energy element; simple additive `Total()`. `m_bAddEnergies=false`. `AffectsUs` matches `Energy_All`/element.
- **EnergyAbsorption owns**: per-element % absorption — **multiplicative**: `Total()` (`EnergyAbsorption.cpp:64`) starts at 100, multiplies `(100−amount)/100` across each bucket via the overridden `SumItems`, then returns `100 − product` (so two 50% sources → 75%, not 100%).
- **Data source**: per-element `EffectType`.
- **V3**: energy resist/absorption rows in `BreakdownsPanel.tsx` (cites the multiplicative `100 − Π((100−x)/100)·100`).

## BreakdownItemOffhandDoublestrike.cpp
- **Owns**: offhand doublestrike chance.
- **Formula** (`:43`): `mainhandDoublestrike × 0.65` if Perfect Two Weapon Fighting trained, else `× 0.5`; plus own `Effect_DoublestrikeOffhand`.
- **Data source**: `Effect_DoublestrikeOffhand`; observes main-hand DoubleStrike; reacts to PTWF feat.
- **V3**: partial in `useBuildStats.ts`.

## BreakdownItemImmunities.cpp / BreakdownItemDuration.cpp
- **Immunities owns**: text list; concatenates each effect's items comma-separated (`:62`). Source `Effect_Immunity`.
- **Duration owns**: formats seconds → `h:m:s` (`Duration.cpp:31`). Source = ctor `EffectType` (song durations etc.).
- **V3**: Immunities in panel; Duration ❌.

## Weapon family — BreakdownItemWeaponEffects.cpp + BreakdownItemWeapon.cpp + sub-breakdowns
- **WeaponEffects** (`Breakdown_WeaponEffectHolder`): a hidden holder ("This item not displayed"). It registers ~50 weapon `EffectType`s and owns one `BreakdownItemWeapon` for main hand and one for off hand. It routes incoming weapon effects into per-weapon-type vectors (`m_weaponFeatEffects` / `m_weaponItemEffects` / `m_weaponEnhancementEffects`, indexed by `WeaponType`) so each weapon only sees effects for its type, then forwards to its `BreakdownItemWeapon`. `GetWeaponBreakdown(bool mainhand, BreakdownType)` (`:792`) returns a sub-breakdown so other breakdowns (AC, attack/damage) can read weapon enchant/attack/damage totals.
- **BreakdownItemWeapon** (`:18` ctor): hidden per-weapon holder of ~16 child breakdowns — `m_weaponEnchantment`, `m_baseDamage`, `m_attackBonus`, `m_damageBonus`, `m_vorpalRange`, `m_criticalAttackBonus`, `m_criticalDamageBonus`, `m_criticalThreatRange`, `m_criticalMultiplier`, `m_criticalMultiplier19To20`, `m_attackSpeed`, `m_ghostTouch`, `m_trueSeeing`, etc. `GetWeaponBreakdown(bt)` (`:679`) dispatches to the right child. `Value()` formats `dmg[dice]+bonus` (crit parts NYI, `:205`).
- **WeaponAttackBonus** (`:48`): BAB + non-proficiency −4 + (−1×neg levels) + armor-check penalty + weapon enchantment + best governing-ability mod (`LargestStatBonus`) + TWF penalty (−4 with TWF feat, else −6 main/−10 off; +2 if off-hand is light or oversized TWF trained). A `m_bCriticalEffects` variant instead reads the base weapon-effect-holder attack total.
- **WeaponDamageBonus** (`:44`): best governing-ability mod × `Breakdown_DamageAbilityMultiplier` (main) / `…Offhand` (off, typically 0.5) + weapon enchantment.
- **WeaponCriticalMultiplier** (`:47`): `base = m_pBaseTotal->Total()` + crit-multiplier effects (the 19-20 variant chains off the base multiplier).
- **WeaponCriticalThreatRange / VorpalRange / AttackSpeed / DRBypass / OtherDamageEffects**: small holders summing their respective effect types (OtherDamageEffects `Value()` is NYI).
- **Data source**: the `Effect_Weapon_*` family (`:24-68`).
- **V3**: `lib/combat/attackEntry.ts` (attack/damage/crit) and `lib/combat/attackRate.ts` (attack speed); DR bypass / vorpal / other-damage are partial or ❌.

---

## Cross-references
- **Effect engine (Section B)**: breakdowns are passive consumers. The `Effect` struct (`IsActive`, `TotalAmount`, `HasPercent`, `Bonus`, stacking rules) and the dispatch of `FeatEffectApplied`/`ItemEffectApplied`/`EnhancementEffectApplied` through `RegisterBuildCallbackEffect` are documented there. `RemoveNonStacking` relies on `Bonus.Stacking() == StackingType_HighestOnly`.
- **Combat (Section F)**: the entire weapon-breakdown subtree (`BreakdownItemWeaponEffects` / `BreakdownItemWeapon` and children) feeds the attack/damage/crit computation, which in V3 lives in `webapp/src/lib/combat/`.
- **V3 primary counterpart**: `webapp/src/hooks/useBuildStats.ts` collapses the per-breakdown C++ classes into one StatMap+resolve pass; `webapp/src/components/breakdowns/BreakdownsPanel.tsx` is the display layer (analogue of `BreakdownsPane`).
