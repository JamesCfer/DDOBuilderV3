# Random-Build Parity Fuzzer (V2 vs V3)

Generates **legal random characters**, exports them as V2 `.DDOBuild` files,
and diffs V3's computed stats against numbers captured from the real V2
application. Every mismatch is a concrete V3 parity bug with a reproducible
build attached.

## What a generated build contains

- Random non-iconic heroic **race**
- **1–3 classes** (never `Unknown`; at most one archetype, never with its own
  base class) with a random level split to 20 and a random per-level order
- Random legal **28-point ability buy** + ability level-ups at 4/8/12/16/20
- Every **feat slot** filled through `lib/featEligibility` — the *same*
  engine the Feats UI uses, so every choice is an offered, prerequisite-met
  option at that slot's exact per-level snapshot
- **Enhancement AP** spent through the same rules TreeGrid enforces: tier
  `MinSpent` gates, per-rank costs, core sequencing, per-item `Requirements`,
  the AP budget, selector choices, single-Tier-5-tree
- Random **gear** in every slot (`MinLevel` ≤ character level; both rings
  distinct)

`validateBuild()` replays all of those rules *independently* of the
generator, and `src/__tests__/fuzzBuilds.test.ts` keeps five seeds legal,
deterministic, `.DDOBuild`-round-trippable, and computable in CI.

## Workflow

1. **Generate** (Linux/anywhere):

   ```sh
   cd webapp
   npx tsx scripts/randomBuildFuzzer.ts generate --count 10 --seed 9000
   ```

   Writes to `Output/FuzzBuilds/`: per seed a `.DDOBuild`, a
   `fuzz-<seed>.v3stats.json` (V3's numbers), a `fuzz-<seed>.golden.json`
   (template to fill), and a `.log.txt` of every random decision.

2. **Capture V2's numbers** (Windows): open each `fuzz-<seed>.DDOBuild` in
   DDOBuilder V2, read the BreakdownsPane totals, and replace the values in
   `fuzz-<seed>.golden.json` with V2's. Set `"capturedAt"` to today's date.
   (Existing golden files are never overwritten by re-running `generate`.)

3. **Compare**:

   ```sh
   npx tsx scripts/randomBuildFuzzer.ts compare
   ```

   Re-imports each `.DDOBuild`, recomputes V3 stats, and prints a per-key
   diff table (`lib/goldenCompare`). Exit 1 on any mismatch. Golden files
   still identical to their V3 template (nothing captured yet) are skipped.

4. **Investigate** each failing stat key in V3 — the `.log.txt` lists the
   exact feats/enhancements/gear involved, and the seed reproduces the build
   exactly.

## Notes

- Same seed + same data catalogues ⇒ byte-identical build (`build.id` is
  `fuzz-<seed>`). Data updates (see `docs/UPSTREAM_SYNC.md`) can change what
  a seed produces — regenerate after pulling upstream data.
- The stat-key reference for golden files is `webapp/scripts/golden/README.md`.
- V2 is a Windows MFC application; it cannot run in the Linux dev
  environment, which is why the V2 side is a manual capture step. If a
  Windows CI runner is ever available, step 2 is the piece to automate.
