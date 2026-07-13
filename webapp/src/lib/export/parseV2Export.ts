// Parser for DDOBuilder V2 "forum export" text dumps.
//
// Turns the plain-text/BBCode dump produced by DDOBuilder/ForumExportDlg.cpp
// into a map of V3 stat keys → numbers so the golden parity harness
// (lib/goldenCompare.ts) can be filled from a real V2 export instead of by
// hand-copying BreakdownsPane values.
//
// Format grounding (all line refs are DDOBuilder/ForumExportDlg.cpp):
//   - Vitals block:      AddCharacterHeader :311-391
//       "     Start Tome Final      HP: <w10>      Displacement: <w4>%"  :343-346
//       ability rows via AddAbilityValues :530-548 —
//       "Str: <w5:base> <w4:tome> <w5:final>" then a per-row breakdown pair:
//         Str  → "      Unc Rng: <w5>      Incorp: <w10>%"        :348-351
//         Dex  → "      PRR: <w9>      AC: <w15>"                 :353-356
//         Con  → "      MRR: <w9>      +Healing Amp: <w5>"        :358-361
//                MRR renders "N/M" via AddBreakdown :584-603 when the
//                MRRCap breakdown is >0 and below the raw total.
//         Int  → "      Dodge: <w4>/<cap>      -Healing Amp: <w5>" :363-374
//                (the "/cap" is always emitted — DodgeCap or
//                DodgeCapTowerShield; NO trailing % in V2's output)
//         Wis  → "      Fort: <w7>%      Repair Amp:   <w5>"      :376-379
//         Cha  → "      SR: <w10>      BAB: <w14>"                :381-383
//   - Saves:             AddSaves :509-528 + AddTableEntryBreakdown :550-574.
//       "[TABLE][TR][TD]Fortitude[/TD][TD][/TD][TD] 45[/TD][/TR]" rows, value
//       width 3, optional trailing "*" (no-fail-on-1). Sub-save rows carry the
//       TOTAL (base + sub bonus), so the V3 `save.sub.X` value is row − base.
//   - Energy resist:     AddEnergyResistances :1167-1214.
//       Header "[TR][TD]Energy[/TD][TD]Resistance[/TD][TD]Absorbance[/TD][/TR]",
//       rows "[TR][TD]Acid:[/TD][TD]30[/TD][TD]0%[/TD][/TR]".
//   - Spell powers:      AddSpellPowers/AddSpellPowerToTable :1453-1520.
//       Header cells wrapped in [COLOR=…], rows
//       "[TR][TD]Acid           [/TD][TD]150[/TD][TD]25%[/TD][TD]0[/TD][/TR]".
//   - Tactical DCs:      AddTacticalDCs :1734-1756 + DC::DCBreakdown
//       (DDOBuilder/DC.cpp:211-221) — value cell reads "<Versus> vs <N>" or
//       "<Versus> vs <Other> + <N>"; N is the DC total.
//
// Never throws; anything unrecognised inside a known section becomes a warning.

export interface ParsedV2Export {
  stats: Record<string, number>
  warnings: string[]
}

// V2 short ability names (AddAbilityValues resizes to 3 chars) → V3 key names.
const ABILITY_NAMES: Record<string, string> = {
  Str: 'Strength', Dex: 'Dexterity', Con: 'Constitution',
  Int: 'Intelligence', Wis: 'Wisdom', Cha: 'Charisma',
}

// V2 save table layout (ForumExportDlg.cpp:513-524) → V3 keys.
const SAVE_HEADERS: Record<string, string> = {
  Fortitude: 'save.Fort', Will: 'save.Will', Reflex: 'save.Reflex',
}
const SAVE_SUBS: Record<string, string> = {
  'vs Poison': 'Poison', 'vs Disease': 'Disease',
  'vs Enchantment': 'Enchantment', 'vs Illusion': 'Illusion',
  'vs Fear': 'Fear', 'vs Curse': 'Curse',
  'vs Traps': 'Traps', 'vs Spell': 'Spell', 'vs Magic': 'Magic',
}

// V2 spell-power row labels (ForumExportDlg.cpp:1457-1472) → V3 spell element
// keys (effectParser.ts normalizeSpellElement: 'Light/Alignment' →
// 'LightAlignment'; the combined 'Force/Untyped' row is the Force breakdown).
const SPELL_POWER_LABELS: Record<string, string> = {
  'Acid': 'Acid', 'Light/Alignment': 'LightAlignment', 'Chaos': 'Chaos',
  'Cold': 'Cold', 'Electric': 'Electric', 'Evil': 'Evil', 'Fire': 'Fire',
  'Force/Untyped': 'Force', 'Negative': 'Negative', 'Physical': 'Physical',
  'Poison': 'Poison', 'Positive': 'Positive', 'Repair': 'Repair',
  'Rust': 'Rust', 'Sonic': 'Sonic', 'Untyped': 'Untyped',
}

type TableContext = 'none' | 'saves' | 'energy' | 'spellpower' | 'tactical' | 'ignored' | 'unknown'

function stripBBCode(cell: string): string {
  // Remove [COLOR=…]…[/COLOR] and similar inline wrappers, keep the text.
  return cell.replace(/\[\/?[A-Za-z]+(?:=[^\]]*)?\]/g, '')
}

function parseIntStrict(s: string): number | null {
  const m = /^\s*(-?\d+)\s*$/.exec(s)
  return m ? parseInt(m[1], 10) : null
}

/** Extracts the [TD] cells of the (single) [TR]…[/TR] on a line, or null. */
function tableCells(line: string): string[] | null {
  const tr = /\[TR\](.*?)\[\/TR\]/.exec(line)
  if (!tr) return null
  const cells: string[] = []
  const re = /\[TD\](.*?)\[\/TD\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tr[1])) !== null) cells.push(m[1])
  return cells
}

export function parseV2Export(text: string): ParsedV2Export {
  const stats: Record<string, number> = {}
  const warnings: string[] = []
  const lines = text.split(/\r\n|\r|\n/)

  let context: TableContext = 'none'
  let pendingSaves = false
  // Base value of the most recent Fortitude/Will/Reflex row, for sub-saves.
  let currentSaveBase: number | null = null

  const set = (key: string, value: number) => { stats[key] = value }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const trimmed = line.trim()
    if (trimmed === '') continue

    // -----------------------------------------------------------------
    // Vitals block (plain fixed-width text, independent of table state)
    // -----------------------------------------------------------------

    // "     Start Tome Final      HP:       1234      Displacement:    0%"
    if (/^\s*Start Tome Final/.test(line)) {
      const m = /HP:\s*(-?\d+)\s+Displacement:\s*(-?\d+)%/.exec(line)
      if (m) {
        set('hp', parseInt(m[1], 10))
        set('displacement', parseInt(m[2], 10))
      } else {
        warnings.push(`Vitals header line did not match HP/Displacement pattern: "${trimmed}"`)
      }
      continue
    }

    // Ability rows: "Str:     8    0    20      <paired stats>"
    const ab = /^(Str|Dex|Con|Int|Wis|Cha):\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)(.*)$/.exec(line)
    if (ab) {
      const [, short, , , finalStr, rest] = ab
      set(`ability.${ABILITY_NAMES[short]}`, parseInt(finalStr, 10))

      let m: RegExpExecArray | null = null
      switch (short) {
        case 'Str':
          m = /Unc Rng:\s*(-?\d+)\s+Incorp:\s*(-?\d+)%/.exec(rest)
          if (m) {
            set('unconsciousRange', parseInt(m[1], 10))
            set('incorporeality', parseInt(m[2], 10))
          }
          break
        case 'Dex':
          m = /PRR:\s*(-?\d+)\s+AC:\s*(-?\d+)/.exec(rest)
          if (m) {
            set('prr', parseInt(m[1], 10))
            set('ac', parseInt(m[2], 10))
          }
          break
        case 'Con':
          // MRR is "N" or the capped "N/M" form (ForumExportDlg.cpp:584-603).
          m = /MRR:\s*(-?\d+)(?:\/(-?\d+))?\s+\+Healing Amp:\s*(-?\d+)/.exec(rest)
          if (m) {
            set('mrr', parseInt(m[1], 10))
            if (m[2] !== undefined) {
              set('mrrCap', parseInt(m[2], 10))
              warnings.push(`MRR is capped in V2 export: ${m[1]}/${m[2]} (took ${m[1]} as mrr, ${m[2]} as mrrCap)`)
            }
            set('healAmp', parseInt(m[3], 10))
          }
          break
        case 'Int':
          // Dodge always renders "N/M" (cap always emitted, cpp:364-372).
          // Tolerate an optional % in either position (stale V2 comment /
          // V3's own exporter place one).
          m = /Dodge:\s*(-?\d+)%?\/(-?\d+)%?\s+-Healing Amp:\s*(-?\d+)/.exec(rest)
          if (m) {
            set('dodge', parseInt(m[1], 10))
            set('dodgeCap', parseInt(m[2], 10))
            set('negHealAmp', parseInt(m[3], 10))
          }
          break
        case 'Wis':
          m = /Fort:\s*(-?\d+)%\s+Repair Amp:\s*(-?\d+)/.exec(rest)
          if (m) {
            set('fortification', parseInt(m[1], 10))
            set('repairAmp', parseInt(m[2], 10))
          }
          break
        case 'Cha':
          m = /SR:\s*(-?\d+)\s+BAB:\s*(-?\d+)/.exec(rest)
          if (m) {
            set('spellResistance', parseInt(m[1], 10))
            set('bab', parseInt(m[2], 10))
          }
          break
      }
      if (!m && rest.trim() !== '') {
        warnings.push(`Ability row "${short}" had unrecognised trailing stats: "${rest.trim()}"`)
      }
      continue
    }

    // -----------------------------------------------------------------
    // Table state transitions
    // -----------------------------------------------------------------

    // "Saves:" precedes an anonymous [TABLE] (AddSaves :511-512).
    if (trimmed === 'Saves:') {
      pendingSaves = true
      continue
    }

    if (line.includes('[TABLE]')) {
      context = pendingSaves ? 'saves' : 'unknown'
      pendingSaves = false
      currentSaveBase = null
      // fall through — the first row may share the [TABLE] line
    }

    const rawCells = tableCells(line)
    if (rawCells !== null) {
      const cells = rawCells.map(c => stripBBCode(c))

      // Header rows identify the table type.
      if (context === 'unknown') {
        const c0 = cells[0]?.trim() ?? ''
        if (c0 === 'Energy') { context = 'energy' }
        else if (c0 === 'Spell Power') { context = 'spellpower' }
        else if (c0 === 'Tactical DC') { context = 'tactical' }
        else if (c0 === 'Level') { context = 'ignored' } // feat-selection table
        else if (c0 === 'Fortitude') { context = 'saves' } // saves table w/o "Saves:" line
        else { context = 'ignored' }
        if (context !== 'saves') {
          if (line.includes('[/TABLE]')) context = 'none'
          continue // header row itself carries no stats (except saves)
        }
      }

      switch (context) {
        case 'saves': {
          if (cells.length !== 3) {
            warnings.push(`Saves row does not have 3 cells: "${trimmed}"`)
            break
          }
          const header = cells[0].trim()
          const sub = cells[1].trim()
          const valueText = cells[2].trim()
          const vm = /^(-?\d+)\*?$/.exec(valueText)
          if (!vm) {
            warnings.push(`Saves row has non-numeric value "${valueText}": "${trimmed}"`)
            break
          }
          const value = parseInt(vm[1], 10)
          if (header !== '' && SAVE_HEADERS[header]) {
            set(SAVE_HEADERS[header], value)
            currentSaveBase = value
          } else if (sub !== '' && SAVE_SUBS[sub]) {
            if (currentSaveBase === null) {
              warnings.push(`Sub-save "${sub}" appeared before any base save row; skipped`)
            } else {
              // Row shows base+sub total; V3's save.sub.X is the sub bonus.
              set(`save.sub.${SAVE_SUBS[sub]}`, value - currentSaveBase)
            }
          } else {
            warnings.push(`Unrecognised saves row (header "${header}", sub "${sub}")`)
          }
          break
        }

        case 'energy': {
          if (cells.length !== 3) {
            warnings.push(`Energy resistance row does not have 3 cells: "${trimmed}"`)
            break
          }
          const name = cells[0].trim().replace(/:$/, '')
          const resist = parseIntStrict(cells[1])
          const abm = /^\s*(-?\d+)%\s*$/.exec(cells[2])
          if (name === '' || resist === null || !abm) {
            warnings.push(`Unparseable energy resistance row: "${trimmed}"`)
            break
          }
          set(`resist.${name}`, resist)
          set(`absorb.${name}`, parseInt(abm[1], 10))
          break
        }

        case 'spellpower': {
          if (cells.length !== 4) {
            warnings.push(`Spell power row does not have 4 cells: "${trimmed}"`)
            break
          }
          const label = cells[0].trim()
          const key = SPELL_POWER_LABELS[label]
          const power = parseIntStrict(cells[1])
          const critm = /^\s*(-?\d+)%\s*$/.exec(cells[2])
          if (!key) {
            warnings.push(`Unknown spell power type "${label}"`)
            break
          }
          if (power === null || !critm) {
            warnings.push(`Unparseable spell power row for "${label}": "${trimmed}"`)
            break
          }
          set(`sp.${key}`, power)
          set(`spCrit.${key}`, parseInt(critm[1], 10))
          // 4th cell (critical multiplier) has no matching V3 golden key.
          break
        }

        case 'tactical': {
          if (cells.length < 2) {
            warnings.push(`Tactical DC row has too few cells: "${trimmed}"`)
            break
          }
          const name = cells[0].trim()
          // Value cell: "<Versus> vs <N>" / "<Versus> vs <Other> + <N>"
          // (DC.cpp:214-221) — the DC total is the last integer.
          const vm = /(-?\d+)\s*$/.exec(cells[1])
          if (name === '' || !vm) {
            warnings.push(`Unparseable tactical DC row: "${trimmed}"`)
            break
          }
          set(`tacticalDC.${name}`, parseInt(vm[1], 10))
          break
        }

        case 'ignored':
        case 'none':
          break
      }
    }

    if (line.includes('[/TABLE]')) {
      context = 'none'
      currentSaveBase = null
    }
  }

  return { stats, warnings }
}
