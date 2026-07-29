# v2calc — Linux console port of DDOBuilder V2's calculation core

`v2calc` compiles DDOBuilder **V2's own unmodified C++ calculation core**
(`DDOBuilder/` + `XmlLib/`, no GUI) into a native Linux console tool. It is the
**parity oracle** for the V2-parity effort (Track B): it loads V2 data files and
a `.DDOBuild` through V2's real reader/model code and prints stat values as JSON
for exact comparison against the webapp (V3).

## Status (this session)

**It builds, links, runs, and emits real V2 breakdown totals.** It loads all
V2 game data, parses a V2-authored `.DDOBuild` through the real
`CDDOBuilderDoc` → `Character` → `Life` → `Build` stack, then **constructs V2's
own `BreakdownItem` observer graph headless**, drives the effect-application
path (`Build::BuildNowActive`), and reads each breakdown's fed
`Total()`/`CappedTotal()`:

```
$ make -C v2calc run     # -> Output/Example Builds/YingsMonk.DDOBuild
{
  "build": "Output/Example Builds/YingsMonk.DDOBuild",
  "name": "Ying Monk", "race": "Aasimar", "level": 34,
  "classes": ["Monk", "Unknown", "Unknown"],
  "abilityBase":  { "STR": 17, "DEX": 22, "CON": 25, "INT": 16, "WIS": 36, "CHA": 16 },
  "baseAttackBonus": 20,
  "abilityTotal": { "STR": 19, "DEX": 26, "CON": 29, "INT": 20, "WIS": 43, "CHA": 20 },
  "breakdowns": {
    "hitpoints": 783, "saveFortitude": 23, "saveReflex": 22, "saveWill": 29,
    "savePoison": 19, ... , "prr": 40, "mrr": 4, "mrrCap": 50, "dodge": 14,
    "dodgeCap": 31, "fortification": 0, "dr": 0, "maxDexBonus": 1001, "bab": 20,
    "meleePower": 4, "rangedPower": 4 },
  "spellDC":    { "abjuration": 0, ... , "globalDC": 0 },
  "casterLevel":{ "Druid": 0, "Wizard": 0, ... }        // Druid build -> "Druid": 20
}
```

### IMPORTANT accuracy caveat — effects applied so far

The breakdown graph is fed by `Build::BuildNowActive`, which applies **feat**,
race, and class effects (these resolve — `FindFeat` is backed by the loaded
`Feats.xml`). It also *calls* the enhancement / gear / spell / set-bonus /
guild-buff apply paths, **but those currently no-op** because their data-file
loaders are not yet ported: `FindItem`, `FindEnhancement`, `GetEnhancementTree`,
`FindSpellByName`, `FindSetBonus`, `FindAugmentByName`, … are not-found stubs
(`shim/UIStub.cpp`). So the emitted totals are **base + feat/race/class**, and
are **missing enhancement, item/gear, filigree, spell, and set-bonus bonuses**.
They will not match V2's final displayed numbers until those loaders land (see
"Next blockers"). They *are* exact for the contributions that do apply, and the
whole graph (sibling dependencies, caps, ability→save/HP propagation) is real
V2 code.

## JSON schema (exact keys emitted today)

Top-level identity keys (`Build` accessors, exact, no effects needed):

| key | meaning | source |
|-----|---------|--------|
| `build` | path parsed | argv |
| `name` / `race` / `level` | build identity | `Build::Name/Race/Level()` |
| `classes` | `[Class1, Class2, Class3]` | `Build::Class(i)` |
| `abilityBase.{STR,DEX,CON,INT,WIS,CHA}` | **base** ability (point buy + racial + level-ups + tomes) | `Build::AbilityAtLevel(a, level-1, true)` |
| `baseAttackBonus` | base attack bonus (fractions dropped) | `Build::BaseAttackBonus(level)` |

Breakdown-graph totals (V2 `BreakdownItem::Total()`/`CappedTotal()`, base+effects
as fed — see caveat above):

| JSON key | BreakdownType | class | Total/Capped |
|----------|---------------|-------|------|
| `abilityTotal.{STR..CHA}` | `Breakdown_Strength..Charisma` | `BreakdownItemAbility` | Total |
| `breakdowns.hitpoints` | `Breakdown_Hitpoints` | `BreakdownItemHitpoints` | Total |
| `breakdowns.saveFortitude/Reflex/Will` | `Breakdown_Save{Fortitude,Reflex,Will}` | `BreakdownItemSave` | Total |
| `breakdowns.save{Poison,Disease,Traps,Spell,Magic,Enchantment,Illusion,Fear,Curse}` | sub-saves | `BreakdownItemSave` | Total |
| `breakdowns.prr` | `Breakdown_PRR` | `BreakdownItemPRR` | Total |
| `breakdowns.mrr` / `mrrCap` | `Breakdown_MRR` / `_MRRCap` | `BreakdownItemMRR` / `MRRCap` | **Capped** / Total |
| `breakdowns.dodge` / `dodgeCap` | `Breakdown_Dodge` / `_DodgeCap` | `BreakdownItemDodge` / `Simple` | **Capped** / Total |
| `breakdowns.fortification` | `Breakdown_Fortification` | `BreakdownItemSimple` | Total |
| `breakdowns.dr` | `Breakdown_DR` | `BreakdownItemDR` | Total |
| `breakdowns.maxDexBonus` | `Breakdown_MaxDexBonus` | `BreakdownItemMDB` | Total |
| `breakdowns.bab` | `Breakdown_BAB` | `BreakdownItemBAB` | **Capped** |
| `breakdowns.meleePower` / `rangedPower` | `Breakdown_MeleePower` / `_RangedPower` | `BreakdownItemSimple` | Total |
| `spellDC.{abjuration..runeArm}` | `Breakdown_SpellSchool*` | `BreakdownItemSpellSchool` | Total |
| `casterLevel.<ClassName>` | `Breakdown_CasterLevel_First+Class::Index()` | `BreakdownItemClassCasterLevel` | Total |

`maxDexBonus` `1001` is V2's "no armor cap" sentinel (1000+1). `casterLevel` lists
only caster classes (spell points at L20); each value is that class's caster
level (e.g. a 20-Druid build → `"Druid": 20`).

### Live vs. still-stubbed breakdowns

**Live** (constructed + fed): abilities, hitpoints (+ FatePoints, NegativeLevels,
StyleBonusFeats, FalseLife, ReaperHitpoints, DestinyPoints), the 3 saves +
9 sub-saves, PRR, MRR(+cap), dodge(+cap), fortification, DR, MaxDexBonus(+shields),
BAB(+override), MeleePower, RangedPower, 11 spell-school DCs, 8 school caster
levels(+max), per-class caster levels.

**Not yet online** (see "Next blockers"): **AC** (deferred — `BreakdownItemAC::LinkUp`
`dynamic_cast`s to `BreakdownItemWeaponEffects`, whose TU drags the weapon-breakdown
+ `ActiveEffect` UI graph); **spell power** per type (`BreakdownItemSpellPower`
`dynamic_cast`s an unguarded skill breakdown → needs the skill breakdowns online);
to-hit / attack breakdowns; spell resistance; energy resistances; skills.

Usage:

```
make -C v2calc                                   # build build/v2calc
make -C v2calc run                               # run against YingsMonk.DDOBuild
./v2calc/build/v2calc <build.DDOBuild> [dataDir] # dataDir defaults to Output/DataFiles
make -C v2calc clean
```
Diagnostic `[AfxMessageBox] ...` notices go to **stderr**; stdout is pure JSON.

Parity debugging: `V2CALC_DUMP_EFFECTS=<key>[,<key>...]` prints the named
breakdowns' per-effect pools to stderr (`[dump]` lines, keys matching the
JSON keys — e.g. `hitpoints`, `saveWill`, `prr`, `DEX`). Each line shows the
pool (other/char/item), resolved state (active / inactive / non-stacking /
temporary / percent), bonus type, amount, stack count and DisplayName —
exactly what `BreakdownItem::Total()` sums (`BreakdownItem::V2CalcDumpEffects`,
V2CALC_LINUX-guarded). `V2CALC_STANCE_DEBUG=1` traces the headless
auto-stance evaluator's activate/deactivate/disable decisions
(`shim/AutoStancesLinux.cpp`).

## Headless breakdown host (KEY DESIGN — `shim/BreakdownHostLinux.cpp`)

V2's displayed stats come from a `BreakdownItem` **observer graph** that the UI
(`CBreakdownsPane`) constructs and feeds. We reproduce that graph headless
instead of re-deriving each formula, so the numbers are V2's own code:

1. **Construct the breakdowns.** `CreateBreakdowns()` `new`s the same
   `BreakdownItem` subclasses `CBreakdownsPane::CreateBreakdowns` does, passing a
   **null tree-list** and **null `HTREEITEM`** (the compute path null-guards both;
   `Populate()`/`Total()` never touch the UI control). Order respects sibling
   dependencies (e.g. `MRRCap` before `MRR`, the ability breakdowns before `HP`).
2. **`FindBreakdown` registry.** The global `::FindBreakdown(BreakdownType)` (which
   normally routes `AfxGetApp()->m_pMainWnd → CMainFrame → CBreakdownsPane`) is
   replaced by a `std::map<BreakdownType, BreakdownItem*>` so siblings resolve
   each other (HP↔Con, MRR↔MRRCap, Dodge↔DodgeCap/MDB, …).
3. **`RegisterBuildCallbackEffect`.** Each breakdown ctor calls
   `pPane->RegisterBuildCallbackEffect(effectType, this)`. We supply a **minimal
   `CBreakdownsPane`** whose only member is that function — the mangled symbol
   matches the real class (mangling ignores base classes/other members), so the
   compiled ctors link against it. It records `(EffectType → breakdown)` into a
   file-scope multimap. (This TU never includes the real `BreakdownsPane.h`, so
   there is no conflicting definition.)
4. **Drive the effect graph.** `HeadlessBreakdownHost` is a
   `BuildObserver`/`LifeObserver` attached to the `Build`/`Life`. It reimplements
   the pane's fan-out (`UpdateFeatEffectApplied` &c. → split effect by `Type()`,
   look up the multimap, call each breakdown's `FeatEffectApplied`/…). Then we
   call `Build::BuildNowActive()`, which applies all feat/enhancement/gear/spell/
   stance effects and `NotifyAll(&BuildObserver::Update…)` — reaching our host and
   thence the breakdowns. Each breakdown then sums its `m_effects`/`m_itemEffects`
   in `Total()`/`CappedTotal()`.

`main.cpp` sets the runtime active life/build indices
(`Character::V2CalcSetActiveIndices`, guarded) so `ActiveLife()`/`ActiveBuild()`
resolve, and rebuilds the class cache (`Build::V2CalcRebuildClassCache`) before
computing. It still does **not** call the UI-coupled `Character::SetActiveBuild()`
(it dereferences the null main window); `BuildNowActive()` is invoked directly by
the host after the observer is attached.

## How the build works

1. **Shim headers first on the include path** (`v2calc/shim/`) so `<windows.h>`,
   `<afxwin.h>`, `<afx*>`, `<comdef.h>`, `#import <msxml3.dll>`,
   `<afxcontextmenumanager.h>`, `boost/static_assert.hpp` resolve to Linux
   stand-ins.
2. **Backslash/​case include farm** (`build/farm/`) for `XmlLib\Foo.h`,
   `stdafx.h`/`StdAfx.h`, and the case-variant `Resource.h`.
3. **`shim/SaxReaderLinux.cpp`** — expat behind the identical `SaxReader`
   interface (replaces MSXML/COM). Also hosts `V2CalcParseFile()`.
4. **`shim/DocStub.cpp`** — a minimal headless `CDDOBuilderDoc` (SAX root that
   hands off to its `Character`; the doc pointer Character needs for its inert
   `SetModifiedFlag`).
5. **`shim/GlobalDataLinux.cpp`** — the game-data globals (`Races()`,
   `Classes()`, `StandardFeats()`, `Find*`, `GetLog()`), backed by data loaded
   directly from the V2 files instead of `theApp`.
6. **`shim/UIStub.cpp`** — the remaining `GlobalSupportFunctions` free functions
   (pure-logic ones verbatim; data-driven `Find*` as not-found singletons; plus
   `FindBonus` and inert `MfcControls::CTreeListCtrl` list/tree stubs the
   compiled `BreakdownItem.cpp` needs at link time — never called headless).
7. **`shim/UIPaneStub.cpp`** — inert vtable/typeinfo anchors for the 4 UI classes
   `Build` reaches only through `dynamic_cast` (`CMainFrame`, `CStancesPane`,
   `CGrantedFeatsPane`, `CDDOBuilderApp`), plus `CStancesPane::GetSlider` (slider
   lookups on the effect path). Never executed headless (`AfxGetMainWnd()` is
   null); present only so the link resolves.
8. **`shim/BreakdownHostLinux.cpp`** — the headless breakdown host (see above):
   the `FindBreakdown` registry, the minimal `CBreakdownsPane`
   (`RegisterBuildCallbackEffect`), `StatToBreakdown`, and the
   `HeadlessBreakdownHost` effect-forwarder. Exposes `v2calc::ComputeBreakdowns`
   / `Total` / `Capped` / `HasBreakdown` (`shim/BreakdownHost.h`) to `main.cpp`.
9. **`-fpermissive`** for MSVC-isms g++ rejects; **`-DNDEBUG`** compiles out the
   `ASSERT`/`assert` calls so V2's own debug asserts (e.g. `Item::Weapon()` on
   edge gear in fuzz builds) behave like the V2 *release* build instead of
   aborting the oracle.

## Source edits (unavoidable; all `V2CALC_LINUX`-guarded unless noted)

- `XmlLib/SaxWriter.h` — `inline` on a header-defined explicit specialization.
- `XmlLib/VectorConversion.h` — declares the `std::vector<size_t>`
  `VectorToString`/`StringToVector` specializations (defined in
  `shim/VectorConversionLinux.cpp`). On LP64 `size_t` is a distinct type with no
  specialization; without the visible declaration a `list<Effect>` copy (in
  `BreakdownItem.cpp`) implicitly instantiates the primary template, which fails
  to compile. Guarded — on MSVC `size_t` is `unsigned long long`, unaffected.
- `DDOBuilder/Class.h` + `Class.cpp` — the `Class(size_t)` constructor (see the
  original note below) **plus** `Class::V2CalcReindex(size_t)`: after the loader
  sorts `Classes()`, this restores `Index() == position in the sorted list` (the
  invariant `CreateClassImageLists` normally maintains and which
  `ClassLevels()`/`ClassFromIndex()`/caster-level breakdowns depend on).
- `DDOBuilder/Character.h` — `Character::V2CalcSetActiveIndices(life, build)`
  points the runtime `m_uiActive*` indices (default 10000 = "none") at the parsed
  values so `ActiveLife()`/`ActiveBuild()` resolve without the UI-coupled
  `SetActiveBuild()`.
- `DDOBuilder/BreakdownItem.cpp` — `SetLockState(false)` skips the pane/stances
  repaint (there is no UI to repaint; `Total()` is computed on demand).
- `DDOBuilder/Effect.cpp` — the two `Amount_Slider*` branches of `TotalAmount`/
  `StacksAsString` skip the `AfxGetMainWnd()->GetPaneView(...)` deref (slider
  stacks fall back to the effect's own `m_stacks`).
- `DDOBuilder/EquippedGear.cpp` — `UpdateImages()` is a no-op (icon indices are a
  UI concern; it deref'd the absent app object's image map).
- `DDOBuilder/resource.h` — re-encoded **UTF-16 → UTF-8/ASCII in place** (BOM-free,
  *not* guardable — an encoding change). Pure ASCII resource IDs, so MSVC/RC are
  unaffected.

Original `Class(size_t)` note: `ClassFile::StartElement` constructs
`Class(m_loadedClasses.size())`; MSVC instantiates that call lazily, g++ needs the
overload declared.

No other `DDOBuilder/`/`XmlLib/` source is modified. `shim/v2calc_stdafx.h`
force-includes `Feat.h` to complete `std::list<Feat>` holders (MSVC instantiates
those special members lazily; g++ needs the type complete).

## What is compiled

`XmlLib/`: the SAX stack (no COM). `DDOBuilder/`: ~80 calc-core `.cpp` — the
model (`Build`, `Character`, `Life`, `Class`, `Race`, `Item`, `EquippedGear`,
`Spell`, `Enhancement*`, `Buff`, `Augment`, `Filigree`, `SetBonus`, `Trained*`,
`*SpendInTree`, `Selector`, `EquipmentSlot`, …) plus the file readers. UI `.cpp`
(`*Pane`, `*Dlg`, `*View`, `*Ctrl`, `MainFrm`, `DDOBuilder.cpp`,
`GlobalSupportFunctions.cpp`) are never compiled — their needed symbols come
from the shims above. Dead files that don't compile on MSVC either
(`ActiveEffect.cpp` typo, `EpicDestinySpendInTree.cpp` & `RequirementBlock.cpp`
stale APIs) are excluded.

## Next stats / next blockers

The breakdown graph is live and fed, so the **single biggest lever now is making
`Build`'s effect-apply calls resolve real data** rather than adding more
breakdowns. In priority order:

1. **Port the data-file loaders so `Find*` return real objects** — the emitted
   totals are currently missing all enhancement / item / spell / set-bonus /
   filigree / augment bonuses because `BuildNowActive` calls their apply paths but
   `shim/UIStub.cpp`'s `FindItem`, `FindEnhancement`, `GetEnhancementTree`,
   `FindSpellByName`, `FindSetBonus`, `FindAugmentByName`, `FindFiligreeByName`,
   `GuildBuffs`, `WeaponGroups` are not-found stubs. Load these from the V2 data
   files in `GlobalDataLinux.cpp` the same way `Races`/`Classes`/`Feats` already
   are (via their V2 SAX `*File` readers — `ItemsFile`, `EnhancementsFile`,
   `SpellsFile`, `SetBonusFile`, `AugmentsFile`, `FiligreeFile`, `GuildBuffsFile`).
   Once these resolve, **every already-live breakdown becomes accurate** with no
   host changes. This is the path to matching V2's displayed numbers.

2. **AC** — needs `BreakdownItemAC`, whose `LinkUp()` `dynamic_cast`s to
   `BreakdownItemWeaponEffects`; compiling that TU drags the weapon-breakdown +
   `ActiveEffect` graph (and `ActiveEffect.cpp` is a known-dead file). Either
   provide a typeinfo/vtable anchor for `BreakdownItemWeaponEffects` (à la
   `UIPaneStub`) so the `dynamic_cast` in the never-called `LinkUp` links, or
   compile a trimmed `BreakdownItemWeaponEffects`. Then add `Breakdown_AC` to the
   host + JSON.

3. **Spell power** per type (`BreakdownItemSpellPower`) — its `CreateOtherEffects`
   `dynamic_cast`s `FindBreakdown(skillBreakdown)` to `BreakdownItemSkill`
   **unguarded**, so the skill breakdowns must be online first (compile
   `BreakdownItemSkill.cpp`, create the ~21 skill breakdowns — each needs its
   governing ability breakdown, which already exist).

4. **To-hit / attack**, spell resistance, energy resistances, turn-undead, etc. —
   more `Create*Breakdowns` groups to mirror; mostly `BreakdownItemSimple` plus a
   few dedicated classes. Add in sibling-dependency order.

5. Wire the JSON into CI to diff against the V3 webapp (`oracleCompare.ts`).

`BaseAttackBonus` (the top-level key) is emitted directly from
`Build::BaseAttackBonus` (reads `m_cachedClassLevels`, rebuilt post-parse via the
`V2CALC_LINUX` hook `Build::V2CalcRebuildClassCache()`); the `breakdowns.bab`
key is the `BreakdownItemBAB` capped total from the graph.
