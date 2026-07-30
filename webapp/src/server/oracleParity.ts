// oracleParity — server-side V2↔V3 math verification for uploaded builds.
//
// Runs the v2calc oracle (DDOBuilder V2's own C++ calculation core, compiled
// headless — see v2calc/README.md) on a .DDOBuild XML, computes V3's stats for
// the same build, and diffs every stat the oracle emits via the shared
// lib/oracleParityRows mapping. Used by:
//   - POST /api/parity-check (background check on every .DDOBuild upload)
//   - scripts/oracleDiff.ts (the CLI referee sweep)
//
// The oracle binary is optional at runtime: when it is absent (e.g. a deploy
// that never ran `make -C v2calc`) checks report { available: false } instead
// of failing the upload.

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats, type BuildStats } from '../lib/buildStats'
import { initBonusTypes } from '../lib/bonus'
import { findActiveLife } from '../lib/multiLife'
import {
  buildParityRows, diffParityRows, type OracleJson, type ParityRow,
} from '../lib/oracleParityRows'
import type { loadAllCatalogues } from './dataLoaders'
import type { CharacterBuild, Item } from '../types/ddo'

export type Catalogues = ReturnType<typeof loadAllCatalogues>

export interface ParityReport {
  /** False when the oracle binary is not present/executable on this host. */
  available: boolean
  /** True when every compared stat matches (only meaningful when available). */
  pass: boolean
  /** Number of stats compared. */
  compared: number
  /** Rows whose truncated values differ (V2 oracle value is the reference). */
  mismatches: ParityRow[]
  /** Non-fatal reason when a check could not run (oracle missing/crashed). */
  reason?: string
}

/** Default oracle binary location: <repo root>/v2calc/build/v2calc.
 *  Probed at two depths because the compiled server runs from dist-server/
 *  (webapp/dist-server/src/server vs webapp/src/server in dev). Override
 *  with V2CALC_PATH. */
export function defaultOraclePath(): string {
  if (process.env.V2CALC_PATH) return process.env.V2CALC_PATH
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'v2calc', 'build', 'v2calc'),
    path.resolve(__dirname, '..', '..', '..', '..', 'v2calc', 'build', 'v2calc'),
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

/**
 * V3 side of the comparison: import the V2 XML and compute stats with the
 * exact catalogue wiring the live webapp uses (embedded gear items included —
 * V2 Build::GetLatestVersionOfItem falls back to the file's own item
 * definitions for Cannith-crafted/challenge gear absent from the catalogue).
 */
export function computeV3ForXml(
  xml: string,
  cat: Catalogues,
): { stats: BuildStats; build: CharacterBuild; gearItems: Record<string, Item> } {
  // Bonus-stacking rules are module-global state — make sure they reflect
  // BonusTypes.xml before computing (idempotent, same as communitySnapshot).
  if (cat.allBonusTypes.length > 0) initBonusTypes(cat.allBonusTypes)
  const { build, document } = importV2Build(xml, { allTrees: cat.allTrees }) as unknown as {
    build: CharacterBuild & { embeddedGearItems?: Record<string, Item> }
    document?: Parameters<typeof findActiveLife>[0]
  }
  const gearItems: Record<string, Item> = {}
  const embedded = build.embeddedGearItems ?? {}
  for (const [slot, name] of Object.entries(build.gear ?? {})) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name) ?? embedded[slot]
    if (item) gearItems[slot] = item
  }
  const specialFeats = document ? findActiveLife(document)?.specialFeats : undefined
  const stats = computeBuildStats({
    allClasses: cat.allClasses, allRaces: cat.allRaces, allFeats: cat.allFeats,
    allTrees: cat.allTrees, allSelfBuffs: cat.allSelfBuffs, allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses, allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees, allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells, allGuildBuffs: cat.allGuildBuffs,
    allItemBuffs: cat.allItemBuffs, allStances: cat.allStances, specialFeats, gearItems,
  }, build)
  return { stats, build, gearItems }
}

/** Runs the oracle binary on a .DDOBuild file already on disk. */
export function runOracleOnFile(
  buildPath: string,
  dataDir: string,
  oraclePath = defaultOraclePath(),
): Promise<OracleJson> {
  return new Promise((resolve, reject) => {
    execFile(
      oraclePath, [buildPath, dataDir],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
      (err, stdout) => {
        if (err) { reject(err); return }
        try { resolve(JSON.parse(stdout.toString()) as OracleJson) }
        catch (e) { reject(e) }
      },
    )
  })
}

/**
 * Full background check for an uploaded .DDOBuild: oracle vs V3, one report.
 * Never throws — every failure mode lands in the report's `reason`.
 */
export async function runParityCheck(
  xml: string,
  cat: Catalogues,
  dataDir: string,
  oraclePath = defaultOraclePath(),
): Promise<ParityReport> {
  if (!existsSync(oraclePath)) {
    return {
      available: false, pass: false, compared: 0, mismatches: [],
      reason: `oracle binary not found at ${oraclePath} (build it: make -C v2calc)`,
    }
  }
  // The oracle reads a file path; stage the upload in a private temp dir.
  const dir = mkdtempSync(path.join(tmpdir(), 'ddob-parity-'))
  const file = path.join(dir, 'upload.DDOBuild')
  try {
    writeFileSync(file, xml, 'utf-8')
    const oracle = await runOracleOnFile(file, dataDir, oraclePath)
    const { stats, build, gearItems } = computeV3ForXml(xml, cat)
    const rows = buildParityRows(oracle, stats, build, gearItems)
    const mismatches = diffParityRows(rows)
    return { available: true, pass: mismatches.length === 0, compared: rows.length, mismatches }
  } catch (e) {
    return {
      available: true, pass: false, compared: 0, mismatches: [],
      reason: `parity check failed: ${(e as Error).message?.slice(0, 200)}`,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
