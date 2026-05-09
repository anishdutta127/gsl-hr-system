/*
 * Minimal xlsx reader for migration scripts.
 *
 * Built on pizzip (already a dependency for docxtemplater) so we don't pull
 * in a heavy reader for one-shot imports. Handles the subset of xlsx we
 * actually meet in the muster: shared strings, inline strings, numeric
 * cells. Does NOT decode formulas, dates-from-format, or styles — callers
 * convert serial numbers to ISO dates via excelSerialToISO upstream.
 */

import fs from 'node:fs'
import PizZip from 'pizzip'

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

function decode(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
}

/** Read shared strings (xl/sharedStrings.xml) into a positional array. */
function readSharedStrings(zip: PizZip): string[] {
  const file = zip.file('xl/sharedStrings.xml')
  if (!file) return []
  const xml = file.asText()
  const out: string[] = []
  const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g
  let m: RegExpExecArray | null
  while ((m = siRe.exec(xml))) {
    const inner = m[1] ?? ''
    const parts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((tm) => decode(tm[1] ?? ''))
    out.push(parts.join(''))
  }
  return out
}

export interface XlsxCell {
  /** Column letter (A, B, ..., AA). */
  col: string
  /** Resolved value. Strings come from shared / inline strings; numbers come
   *  back as strings to preserve precision. */
  value: string
}

export interface XlsxRow {
  rowNum: number
  cells: Record<string, string>
}

/** Parse the first worksheet of an xlsx file into row records.
 *
 *  Each row is a `{rowNum, cells}` pair where `cells` is keyed by column
 *  letter (A, B, C, ...). Empty cells are absent — callers should guard
 *  with a default. Header row is row 1.
 */
export function readXlsxFirstSheet(filePath: string): XlsxRow[] {
  const buf = fs.readFileSync(filePath)
  const zip = new PizZip(buf)
  const strings = readSharedStrings(zip)

  const sheetFile = zip.file('xl/worksheets/sheet1.xml')
  if (!sheetFile) throw new Error(`No xl/worksheets/sheet1.xml in ${filePath}`)
  const xml = sheetFile.asText()

  const rows: XlsxRow[] = []
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
  // <c r="A1" t="s"><v>0</v></c>  (shared-string)
  // <c r="A1"><v>44197</v></c>     (inline number)
  // <c r="A1" t="inlineStr"><is><t>foo</t></is></c>  (inline string)
  const cellRe =
    /<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)?<\/c>/g

  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml))) {
    const rowNum = Number(rm[1])
    const inner = rm[2] ?? ''
    const cells: Record<string, string> = {}
    cellRe.lastIndex = 0
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(inner))) {
      const col = cm[1] ?? ''
      const type = cm[2] ?? 'n'
      const sharedV = cm[3]
      const inlineV = cm[4]
      const raw = sharedV ?? inlineV
      if (raw === undefined) continue
      let resolved: string
      if (type === 's') {
        const idx = Number(raw)
        resolved = strings[idx] ?? ''
      } else {
        resolved = decode(raw)
      }
      cells[col] = resolved
    }
    rows.push({ rowNum, cells })
  }
  return rows
}

/** Convenience: parse with a column-letter -> field-name map. Returns each
 *  row as an object keyed by the field names. Header row (rowNum === 1) is
 *  skipped automatically. Empty-cell rows are dropped (so address-spillover
 *  rows with only one populated column are kept; callers can filter on a
 *  required-field check).
 */
export function readXlsxAsRecords<TKeys extends string>(
  filePath: string,
  columnMap: Record<string, TKeys>,
): Array<Record<TKeys, string> & { _rowNum: number }> {
  const rows = readXlsxFirstSheet(filePath)
  const out: Array<Record<TKeys, string> & { _rowNum: number }> = []
  for (const row of rows) {
    if (row.rowNum === 1) continue
    const rec = { _rowNum: row.rowNum } as Record<TKeys, string> & { _rowNum: number }
    for (const [col, key] of Object.entries(columnMap)) {
      ;(rec as Record<string, string>)[key as string] = row.cells[col] ?? ''
    }
    out.push(rec)
  }
  return out
}
