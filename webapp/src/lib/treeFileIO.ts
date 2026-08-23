// Standalone per-tree save/load files (V2 parity item U12).
//
// V2 lets a player export just the currently-selected Enhancement tree's
// spend to a standalone file, separate from the full-build `.DDOBuild`
// export:
//   EnhancementsPane.cpp::OnSaveTree/OnLoadTree (~932-1200) — root element
//     `DDOBuilderTree` wrapping a single `<EnhancementSpendInTree>`
//     (`SpendInTree::Write`, `SpendInTree.cpp:165-170`).
//   DestinyPane.cpp::OnSaveTree/OnLoadTree (~984-1120) — root element
//     `DDOBuilderDestinyTree` wrapping a single `<DestinySpendInTree>`
//     (`DestinySpendInTree::Write`, same shape).
// Both wrap the same `<TreeName>`/`<TreeVersion>`/`<TrainedEnhancement>*`
// shape v2Export.ts's `emitSpendInTree` already writes for the full-build
// export, and v2Import.ts's `parseEnhancements` already reads — this module
// reuses that exact element vocabulary so a file this exports round-trips
// through V2 itself, and a real V2-authored `.DDOETree`/`.DDODestinyTree`
// file loads here.
//
// Note: V2's `SpendInTree::EndElement` compares the file's `<TreeVersion>`
// against the CURRENT catalogue tree's version and revokes the whole spend
// on a mismatch (`PARITY_TODO.md`'s `V2TreeVersionPolicy`, used for full-
// build import). This standalone loader always writes/accepts version 1 —
// the same "always current" behaviour the full-build exporter already uses
// — so that gate is not reproduced here.

import { XMLParser } from 'fast-xml-parser'

type AnyRec = Record<string, unknown>

function arr<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function asStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return ''
}

function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type TreeFileKind = 'enhancement' | 'destiny'

const ROOT_TAG: Record<TreeFileKind, string> = {
  enhancement: 'DDOBuilderTree',
  destiny: 'DDOBuilderDestinyTree',
}
const SPEND_TAG: Record<TreeFileKind, string> = {
  enhancement: 'EnhancementSpendInTree',
  destiny: 'DestinySpendInTree',
}

export interface TreeSpend {
  treeName: string
  choices: Record<string, number>
  selections: Record<string, string>
}

function exportTreeFile(kind: TreeFileKind, spend: TreeSpend): string {
  const rootTag = ROOT_TAG[kind]
  const spendTag = SPEND_TAG[kind]
  const lines = [
    '<?xml version="1.0"?>',
    `<${rootTag}>`,
    `  <${spendTag}>`,
    `    <TreeName>${esc(spend.treeName)}</TreeName>`,
    '    <TreeVersion>1</TreeVersion>',
  ]
  for (const [name, ranks] of Object.entries(spend.choices)) {
    if (!ranks) continue
    lines.push('    <TrainedEnhancement>')
    lines.push(`      <EnhancementName>${esc(name)}</EnhancementName>`)
    if (spend.selections[name]) {
      lines.push(`      <Selection>${esc(spend.selections[name])}</Selection>`)
    }
    lines.push(`      <Ranks>${ranks}</Ranks>`)
    lines.push('    </TrainedEnhancement>')
  }
  lines.push(`  </${spendTag}>`)
  lines.push(`</${rootTag}>`)
  return lines.join('\n') + '\n'
}

/** V2's per-tree export for `EnhancementsPane::OnSaveTree`. */
export function exportEnhancementTreeFile(spend: TreeSpend): string {
  return exportTreeFile('enhancement', spend)
}

/** V2's per-tree export for `DestinyPane::OnSaveTree`. */
export function exportDestinyTreeFile(spend: TreeSpend): string {
  return exportTreeFile('destiny', spend)
}

const parser = new XMLParser({
  ignoreAttributes: true,
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
  isArray: name => name === 'TrainedEnhancement',
})

export type ParsedTreeFile = { kind: TreeFileKind } & TreeSpend

/**
 * Parses a standalone tree file (`.DDOETree`/`.DDODestinyTree`), V2- or
 * V3-authored. Returns `{ error }` for anything that isn't one — an
 * unrelated XML file, a full `.DDOBuild`, or a corrupt document.
 */
export function parseTreeFile(xmlText: string): ParsedTreeFile | { error: string } {
  let doc: AnyRec
  try {
    doc = parser.parse(xmlText) as AnyRec
  } catch (e) {
    return { error: `Not a valid XML file: ${e instanceof Error ? e.message : String(e)}` }
  }

  let kind: TreeFileKind
  if (doc[ROOT_TAG.enhancement]) kind = 'enhancement'
  else if (doc[ROOT_TAG.destiny]) kind = 'destiny'
  else {
    return {
      error: 'Not a DDOBuilder tree file (expected a '
        + `<${ROOT_TAG.enhancement}> or <${ROOT_TAG.destiny}> root element).`,
    }
  }

  const root = doc[ROOT_TAG[kind]] as AnyRec
  const spend = root[SPEND_TAG[kind]] as AnyRec | undefined
  if (!spend) return { error: `Missing <${SPEND_TAG[kind]}> in tree file.` }

  const treeName = asStr(spend.TreeName)
  if (!treeName) return { error: 'Tree file has no <TreeName>.' }

  const choices: Record<string, number> = {}
  const selections: Record<string, string> = {}
  for (const e of arr(spend.TrainedEnhancement as AnyRec | AnyRec[] | undefined)) {
    const er = e as AnyRec
    const name = asStr(er.EnhancementName)
    if (!name) continue
    const ranks = asNum(er.Ranks)
    if (ranks > 0) choices[name] = ranks
    const sel = asStr(er.Selection)
    if (sel) selections[name] = sel
  }

  return { kind, treeName, choices, selections }
}
