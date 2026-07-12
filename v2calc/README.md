# v2calc — Linux console port of DDOBuilder V2's calculation core

`v2calc` compiles DDOBuilder **V2's own unmodified C++ calculation core**
(`DDOBuilder/` + `XmlLib/`, no GUI) into a native Linux console tool. It is the
**parity oracle** for the V2-parity effort (Track B): it loads V2 data files
through V2's real reader code and will eventually print breakdown stat totals as
JSON for exact comparison against the webapp.

## Status (this session)

**It builds, links, and runs.** The binary parses `Output/DataFiles/Feats.xml`
through V2's real SAX stack (`SaxContentElement` + the `DL_*` macro machinery +
the expat-backed `SaxReaderLinux`) and prints:

```
$ make -C v2calc run
{
  "file": "Output/DataFiles/Feats.xml",
  "featCount": 339,
  "firstFeats": [" No Selection", "Accelerate Spell", "Acrobatic"]
}
```

339 matches `grep -c "<Feat>" Output/DataFiles/Feats.xml` exactly. This is the
end-to-end proof: **real V2 SAX code parsing real V2 data on Linux.**

## How it works

The `Makefile` compiles the unmodified sources by:

1. **Shim headers first on the include path** (`v2calc/shim/`) so
   `<windows.h>`, `<afxwin.h>`, `<afxstatusbar.h>`, `<comdef.h>`, and
   `#import <msxml3.dll>` resolve to Linux stand-ins.
2. **A "backslash include farm"** of symlinks (`build/farm/XmlLib\Foo.h`,
   `stdafx.h`/`StdAfx.h`, `Resource.h`) so Windows-style and case-mismatched
   includes resolve on a case-sensitive filesystem.
3. **`shim/SaxReaderLinux.cpp`** — an expat implementation behind the identical
   `SaxReader` interface, replacing the MSXML/COM reader.
4. **`-fpermissive`** to accept MSVC-isms g++ rejects (e.g. extra qualification
   in `Selector.h`).

## What compiles (built sources)

`XmlLib/`: `CriticalSection`, `SaxAttributes`, `SaxContentElement`, `SaxString`,
`SaxWriter`, `VectorConversion` (COM plumbing excluded — see Makefile).

`DDOBuilder/`: `Attack`, `AttackBonus`, `AutomaticAcquisition`, `BaseDice`,
`ConditionalGroup`, `DC`, `Dice`, `Effect`, `Feat`, `FeatsFile`, `Requirement`,
`Requirements`, `RequirementsBase`, `RequiresNoneOf`, `RequiresOneOf`, `Stance`,
`SubItem`.

`v2calc/shim/`: `SaxReaderLinux`, `GlobalsLinux`, `VectorConversionLinux`.

## What is stubbed (shim/, inert — never called on the calc path)

- **CString** — `std::string`-backed, MBCS semantics, with `operator std::string`.
- **MFC UI classes** — `CWnd`/`CView`/`CFormView`/`CDialog...`, GDI (`CDC`,
  `CFont`, `CBitmap`, `CImageList`, `CImage`), controls (`CListCtrl`,
  `CTreeCtrl`, `CSliderCtrl`, `CScrollBar`, `CProgressCtrl`, `CCmdUI`), frames
  and toolbars (`CFrameWndEx`, `CMDIFrameWndEx`, `CMFCMenuBar`, `CMFCToolBar`,
  `CMFCToolBarImages`, `CMFCStatusBar`), runtime-class machinery
  (`CRuntimeClass`, `RUNTIME_CLASS`). All compile-only; none are invoked.
- **Win32 types/macros** — handles (`HTREEITEM`, `HHOOK`, ...), structs
  (`NMHDR`, `MSG`, `CREATESTRUCT`, `POINT`), SAL annotations (`_In_`, `_Out_`,
  ...), `THROW`/`THROW_LAST`, window styles.
- **`VectorConversionLinux.cpp`** — `size_t` specializations of
  `VectorToString`/`StringToVector` (XmlLib only ships int/double/BYTE/bool;
  `size_t` is a distinct type on LP64 and falls through to the uncompilable
  primary template).

## Source edits (all `V2CALC_LINUX`-guarded, unavoidable)

- `XmlLib/SaxWriter.h:108` — the explicit specialization
  `WriteSimpleElement<std::string>` is defined in a header without `inline`.
  MSVC folds it via COMDAT; g++ emits a strong symbol per TU → multiple
  definition at link. Guarded `inline` gives it vague linkage.

No other `DDOBuilder/` or `XmlLib/` source is modified.

## Remaining dependency closure for breakdown totals

The current target parses one data file. Emitting **breakdown stat totals**
requires loading a build and running the `BreakdownItem` tree. That closure is
large and was deliberately **not** attempted this session:

- **~45 `DDOBuilder/Breakdown*.cpp`** — the entire breakdown hierarchy
  (`BreakdownItem.cpp` and all `BreakdownItem*Xxx.cpp` subclasses).
- **Core model loaders** — `Build.cpp`, `Character.cpp`, `Class.cpp`,
  `Bonus.cpp`, `Item.cpp`, `Spell.cpp`, and the various `*File.cpp` data-file
  readers they pull in (`EnhancementsFile.cpp`, item/spell/class files, etc.).
- **Enhancement subsystem** — `EnhancementTree*.cpp`, `Enhancement*.cpp`,
  `EnhancementSelection*.cpp`.

Each new `.cpp` added to `DDO_SRC` in the Makefile will surface a fresh batch of
shim gaps (more MFC surface, more `size_t`/enum vector specializations) and
link-time closure. Expect to iterate: `make -C v2calc 2>&1 | head`, stub, repeat.

## Exact next step

1. Add `DDOBuilder/BreakdownItem.cpp` and `DDOBuilder/Bonus.cpp` to `DDO_SRC` in
   `v2calc/Makefile`, rebuild, and clear the resulting compile/link errors
   (shim-only where possible). This is the smallest extension toward breakdowns.
2. Then bring in `Build.cpp` / `Character.cpp` and a build loader so `main.cpp`
   can load a `.DDOBuild`, walk `FindBreakdown(...)->Total()` for each
   `BreakdownType`, and print `{ "STR": N, "DEX": N, ... }` as JSON.
3. That JSON becomes the parity oracle CI compares against the webapp.

## Usage

```
make -C v2calc            # build build/v2calc
make -C v2calc run        # run against Output/DataFiles/Feats.xml
make -C v2calc clean
./v2calc/build/v2calc <path-to-xml>
```
