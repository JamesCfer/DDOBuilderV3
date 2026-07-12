# v2calc — Linux console port of DDOBuilder V2's calculation core

`v2calc` compiles DDOBuilder **V2's own unmodified C++ calculation core**
(`DDOBuilder/` + `XmlLib/`, no GUI) into a native Linux console tool. It is the
**parity oracle** for the V2-parity effort (Track B): it loads V2 data files and
a `.DDOBuild` through V2's real reader/model code and prints stat values as JSON
for exact comparison against the webapp (V3).

## Status (this session)

**It builds, links, runs, and emits its first ground-truth stats.** It loads all
V2 game data, parses a V2-authored `.DDOBuild` through the real
`CDDOBuilderDoc` → `Character` → `Life` → `Build` stack, and prints V2's own
**base ability scores**:

```
$ make -C v2calc run     # -> Output/Example Builds/YingsMonk.DDOBuild
{
  "build": "Output/Example Builds/YingsMonk.DDOBuild",
  "name": "Ying Monk",
  "race": "Aasimar",
  "level": 34,
  "classes": ["Monk", "Unknown", "Unknown"],
  "abilityBase": { "STR": 17, "DEX": 22, "CON": 25, "INT": 16, "WIS": 36, "CHA": 16 },
  "baseAttackBonus": 20
}
```

These are computed by V2's own `Build::AbilityAtLevel(...)` / `BaseAttackBonus(...)`
on real parsed data, so they are exact V2 numbers.

## JSON schema (exact keys emitted today)

| key | meaning | source |
|-----|---------|--------|
| `build` | path parsed | argv |
| `name` | build name | `Build::Name()` |
| `race` | race name | `Build::Race()` |
| `level` | total character level | `Build::Level()` |
| `classes` | `[Class1, Class2, Class3]` | `Build::Class(i)` |
| `abilityBase.{STR,DEX,CON,INT,WIS,CHA}` | **base** ability = point buy + racial + level-ups + tomes | `Build::AbilityAtLevel(a, level-1, true)` |
| `baseAttackBonus` | base attack bonus (fractions dropped) | `Build::BaseAttackBonus(level)` |

`abilityBase` is the ability score **before** feat/enhancement/item effects. The
final displayed total (base + effects) needs the breakdown/effect graph — see
"Compute-path decision" and "Next stats".

Usage:

```
make -C v2calc                                   # build build/v2calc
make -C v2calc run                               # run against YingsMonk.DDOBuild
./v2calc/build/v2calc <build.DDOBuild> [dataDir] # dataDir defaults to Output/DataFiles
make -C v2calc clean
```
Diagnostic `[AfxMessageBox] ...` notices go to **stderr**; stdout is pure JSON.

## Compute-path decision (KEY FINDING)

The task was to choose between (A) instantiating V2's `BreakdownItem*` classes
headless, or (B) computing via `Build`'s own accessors. **We use (B) for the
values emitted so far**, for these reasons discovered in the code:

- V2's displayed stats come from a `BreakdownItem` **observer graph**. That graph
  is **constructed and fed effects by the UI** (`CBreakdownsPane::CreateBreakdowns`
  news up ~60 breakdown objects; `CBreakdownsPane::UpdateFeatEffectApplied` &c.
  forward every effect to them). The global `FindBreakdown(type)` even routes
  through `AfxGetApp()->m_pMainWnd → CMainFrame → CBreakdownsPane`.
- A `BreakdownItem` **can** be built headless — `Populate()`/`Total()` guard on a
  null tree-list pointer, so the compute path never dereferences the UI control.
  But feeding it requires replicating `CBreakdownsPane`'s `BuildChanged` +
  effect-forwarding wiring, i.e. re-implementing the pane. That is the larger
  next step, not a this-session task.
- `Build::AbilityAtLevel()` / `BaseAbilityValue()` compute the real base score
  directly, with no breakdown graph. That yields exact V2 base numbers now.

So: **base abilities via Build accessors now; total-with-effects via a headless
breakdown-feed harness next.**

To keep the linker's `--gc-sections` able to drop the UI-coupled code, `main.cpp`
deliberately does **not** call `Character::LoadComplete()`,
`Character::SetActiveBuild()`, or `Build::BuildNowActive()` (the effect-apply +
pane-notification path). It reaches the build through the **const** accessors
(`GetLife(...).GetBuildPointer(...)`) and calls only const stat methods. Base
abilities do not depend on any of the skipped steps for a modern V2 file.

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
   (pure-logic ones verbatim; data-driven `Find*` as not-found singletons).
7. **`shim/UIPaneStub.cpp`** — inert vtable/typeinfo anchors for the 4 UI classes
   `Build` reaches only through `dynamic_cast` (`CMainFrame`, `CStancesPane`,
   `CGrantedFeatsPane`, `CDDOBuilderApp`). Never executed headless
   (`AfxGetMainWnd()` is null); present only so the link resolves.
8. **`-fpermissive`** for MSVC-isms g++ rejects.

## Source edits (unavoidable; all documented)

- `XmlLib/SaxWriter.h` — `inline` on a header-defined explicit specialization
  (`V2CALC_LINUX`-guarded).
- `DDOBuilder/Class.h` + `Class.cpp` — a `V2CALC_LINUX`-guarded `Class(size_t)`
  constructor. `ClassFile::StartElement` constructs `Class(m_loadedClasses.size())`;
  MSVC instantiates that call lazily, g++ needs the overload declared. It sets
  `m_index` to the load-order index (matches the UI-only `CreateClassImageLists`
  reindex that never runs headless).
- `DDOBuilder/resource.h` — re-encoded **UTF-16 → UTF-8/ASCII in place** (BOM-free).
  It is pulled by `DDOBuilder.h` via includer-relative `#include "resource.h"`,
  which the farm cannot redirect. Content is pure ASCII resource IDs, so the
  Windows RC compiler and MSVC are unaffected. (Not `V2CALC_LINUX`-guardable — an
  encoding change, not code.)

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

`BaseAttackBonus` is already emitted: `Build::BaseAttackBonus` reads
`m_cachedClassLevels`, which the constructor builds from an *empty* level list
(before parse), so `main.cpp` rebuilds it post-parse via the `V2CALC_LINUX`
hook `Build::V2CalcRebuildClassCache()` (calls `UpdateCachedClassLevels()`, which
only touches `m_Levels`/the cache — no UI).

1. **Ability totals with effects, Hitpoints, Saves (Fort/Reflex/Will)** — require
   the `BreakdownItem` graph fed with effects. Build a headless harness that:
   constructs the needed `BreakdownItem*` subclasses with a null tree-list, and
   replicates `CBreakdownsPane::BuildChanged` + effect forwarding (or calls
   `Build::BuildNowActive()` after providing real, non-inert versions of the
   currently-stubbed `Find*`/pane hooks). This also means porting the item/
   enhancement/spell data-file loaders (`ItemsFile`, `EnhancementsFile`,
   `SpellsFile`, …) so effects actually resolve.
3. Then wire the JSON into CI to diff against the V3 webapp.
