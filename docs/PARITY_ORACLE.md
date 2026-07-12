# The V2 Math Oracle — how V3's numbers get proven against real V2

Goal: every stat V3 computes is checked against numbers produced by the
**real DDOBuilder V2 program**, automatically, with no human in the loop.

Two tracks, both fully autonomous:

## Track A — Windows oracle in GitHub Actions (running now)

Workflow: `.github/workflows/v2-oracle.yml` (manual dispatch; inputs:
`limit`, `release_tag`).

1. A `windows-latest` runner downloads the official
   [Maetrim/DDOBuilderV2](https://github.com/Maetrim/DDOBuilderV2) release
   and places `DDOBuilder.exe` beside this repo's `Output/DataFiles`
   (V2 resolves its data relative to the exe —
   `GlobalSupportFunctions::DataFolder`).
2. `tools/v2-oracle/capture.ps1` + `capture.ahk` (AutoHotkey v2) drive the
   real app for every `Output/FuzzBuilds/*.DDOBuild`:
   launch with the file on the command line (MFC shell open) → dismiss any
   load-time modals → menu *Forum Export → Forum Export*
   (`ID_EDIT_FORUMEXPORT`) → OK on *Configure Forum Export* (all sections
   default ON in a fresh registry; OK copies the export to the clipboard,
   `ForumExportDlg.cpp:306`) → write `fuzz-<seed>.v2export.txt`.
3. Failure screenshots + AHK logs upload as the `oracle-debug` artifact;
   captured exports are force-pushed to the **`v2-oracle-results`** branch.
4. Back on Linux: `webapp/scripts/fillGoldens.ts` parses the exports into
   the `fuzz-<seed>.golden.json` files
   (`webapp/src/lib/export/parseV2Export.ts`), then
   `npx tsx scripts/randomBuildFuzzer.ts compare` diffs V3 against V2 per
   stat key. Every mismatch is a V3 parity bug with a seeded repro.

Trigger: Actions → *v2-oracle* → Run workflow (or via API/MCP
`actions_run_trigger` with `workflow_id: v2-oracle.yml`).

## Track B — native Linux oracle (`v2calc/`, in progress)

V2's calculation core (Breakdown*/Effect/Build/Character — verified to be
almost UI-free) compiled natively on Linux:

- `XmlLib`'s MSXML backend replaced with libxml2/expat behind the same
  `SaxContentElementInterface`, so all `DL_*`-macro readers work unchanged.
- A thin `afx` shim (CString, BOOL, ASSERT, profile no-ops) replaces MFC.
- Output: `v2calc <file.DDOBuild>` → JSON of every breakdown total.

Once validated against Track A's captures, `v2calc` runs inside the vitest
suite: **V2-exact math enforced on every commit, no Windows anywhere.**

## The fix loop

1. `compare` output is triaged by root cause (the same failing key across
   many seeds is one bug, not many).
2. Each mismatch is delta-debugged: strip gear/enhancements/feats from the
   failing build until the diff vanishes → minimal repro naming the exact
   ability/item.
3. Fix V3 (`webapp/src/lib/buildStats.ts` / `effectParser.ts`), add a
   regression test, re-run the oracle.
4. Corpus widens as it goes clean: more seeds, then epic levels, tomes,
   past lives, filigrees, iconics.

Where V2 and the live game disagree (V2 has bugs too): default is *match
V2*, exceptions logged in `PARITY_TODO.md`.

## Status update — Track A set aside, Track B is the path

**Track A (Windows CI GUI oracle): blocked by the environment.** Across 14
runs the pipeline was proven to download+launch the real V2 app, and a
major byproduct landed — the exporter now writes files V2's parser accepts
(required-element fidelity, verified against the live app). BUT DDOBuilder
V2 crashes non-deterministically *during data load* in the non-interactive
GitHub-Actions session — even opening a V2-authored file, before any
automation command (run 11 survived ~10 min; runs 13–14 died in seconds;
3× retry per build still 0/3). This is a known limitation of driving a
complex MFC/GDI app headlessly, not a fixable script bug. The workflow is
kept (it would work on an interactive/self-hosted Windows runner) but is no
longer the active path.

**Track B (native `v2calc`) is now primary.** It computes V2's breakdown
numbers by compiling V2's own calculation core on Linux — no GUI, no CI
flakiness, and it runs inside the vitest suite for continuous parity. The
foundation compiles (expat-backed SaxReader behind the real interface, a
backslash-include farm, MFC shim headers); remaining work is grinding the
data-model + Breakdown* dependency closure through g++.
