# Upstream V2 Data Sync

DDOBuilderV3 (this repo) is a web port of the C++ project
[Maetrim/DDOBuilderV2](https://github.com/Maetrim/DDOBuilderV2). The game data the
webapp serves lives in `Output/DataFiles/` (see `webapp/server.ts`,
`DATA_FILES_PATH`, default `../Output/DataFiles`), and upstream keeps the same
files at the same relative path (`Output/DataFiles/`). When upstream ships data
fixes (feats, spells, items, enhancement trees, ...), we want to pull them in.

`webapp/scripts/syncUpstreamV2.ts` automates this. It uses plain `git` (blobless
clone: `--filter=blob:none --no-checkout`, so the ~17k upstream image files are
never downloaded) plus Node `fs` — no extra npm dependencies. Sync state is kept
in `UPSTREAM_SYNC.json` at the repo root:

```json
{
  "upstream": "https://github.com/Maetrim/DDOBuilderV2.git",
  "lastSyncedCommit": "<sha or null>",
  "lastChecked": "<ISO timestamp>",
  "dataPathUpstream": "Output/DataFiles",
  "notes": "..."
}
```

**Scope:** only `.xml` and `.item` files under `Output/DataFiles` are compared and
copied (both are XML; DDO items use the `.item` extension). Images (`*.png`) are
excluded. Files that exist only locally are always preserved — the script never
deletes anything.

## Commands

Run from `webapp/`:

```bash
npx tsx scripts/syncUpstreamV2.ts check        # default command
npx tsx scripts/syncUpstreamV2.ts pull-data
npx tsx scripts/syncUpstreamV2.ts mark-synced
```

### `check` (default)

- `git ls-remote` upstream HEAD and compares it to `lastSyncedCommit`.
- If they match: prints "in sync", updates `lastChecked`, **exits 0**.
- If they differ: does a blobless clone/fetch into a cached temp dir
  (`$TMPDIR/ddobuilderv2-upstream-sync`, override with `SYNC_UPSTREAM_TMPDIR`),
  prints the new upstream commits (`git log --oneline` since `lastSyncedCommit`,
  or the last 20 when no baseline exists), prints which data files differ from
  `Output/DataFiles` (git blob-hash comparison: changed / new-upstream /
  local-only), updates `lastChecked`, and **exits 1** — so a scheduler can branch
  on the exit code.

### `pull-data`

Copies every changed or new upstream data file into `Output/DataFiles`
(printing each file), preserves local-only files, sets `lastSyncedCommit` to the
upstream HEAD, and reminds you to run the test suite. Exits 0.

### `mark-synced`

Sets `lastSyncedCommit` to the current upstream HEAD **without copying
anything**. Use this once to acknowledge the current baseline, or after
deciding a set of upstream changes should be skipped.

If git or the network is unavailable (e.g. a sandboxed session whose proxy
returns HTTP 403 for out-of-scope hosts), the script exits 2 with a diagnostic
message; note that plain `git ls-remote`/`git clone` of the upstream URL works
in environments where the GitHub REST API is blocked.

## Recommended workflow (scheduled)

The repo owner runs a daily Claude routine:

1. `cd webapp && npx tsx scripts/syncUpstreamV2.ts check`
2. If it exits **0** — nothing to do.
3. If it exits **1**:
   ```bash
   cd webapp
   npx tsx scripts/syncUpstreamV2.ts pull-data
   ./node_modules/.bin/vitest run
   ```
4. **Only if the tests are green**, commit `Output/DataFiles` +
   `UPSTREAM_SYNC.json` on a branch and open a PR (include the upstream commit
   range from the `check` output in the PR description). If tests fail, do not
   open a PR; file the failures for manual review instead.
5. Once the PR merges, the deployed server picks the change up automatically:
   `webapp/server.ts` runs an auto-update loop (`scheduleAutoUpdate`, backing
   the `/api/update/check` and `/api/update/apply` endpoints) that pulls the
   latest merged data on its own — no manual deploy step for data updates.

## Manual usage

```bash
# See whether upstream moved and what would change
cd webapp && npx tsx scripts/syncUpstreamV2.ts check

# Apply the data updates
npx tsx scripts/syncUpstreamV2.ts pull-data

# Validate
./node_modules/.bin/vitest run

# Accept upstream HEAD without copying (baseline only)
npx tsx scripts/syncUpstreamV2.ts mark-synced
```
