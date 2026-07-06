/*
 * Server-side employee-upload parser for the in-app HR bulk upload.
 *
 * Parses .xlsx (via pizzip - already a dependency, and not exposed to the
 * xlsx@0.18.5 prototype-pollution CVE) and .csv into the ImportRow shape the
 * shared reconcile service consumes. Columns are matched by HEADER NAME (not
 * position) so a reordered upload still works. Runs entirely server-side; the
 * client never parses the file.
 *
 * Guards: <= MAX_ROWS data rows, and the caller enforces the byte cap before
 * calling. Malformed workbooks throw a friendly Error.
 */

import PizZip from 'pizzip'
import { excelSerialToISO } from './standardise'
import type { ImportRow } from './reconcileImport'

export const MAX_ROWS = 500
export const MAX_BYTES = 5 * 1024 * 1024

/** The canonical template columns, in order. */
export const TEMPLATE_COLUMNS = [
  'Employee Code',
  'Title',
  'Employee Name',
  'Gender',
  'DOB',
  'DOJ',
  'Designation',
  'Department',
  'Reporting Manager',
  'Location',
  'Confirmation Date',
  'Official Email',
] as const

/** Normalised header text -> ImportRow field. */
const HEADER_TO_FIELD: Record<string, keyof ImportRow> = {
  'employee code': 'employeeCode',
  code: 'employeeCode',
  title: 'title',
  'employee name': 'name',
  name: 'name',
  gender: 'gender',
  dob: 'dateOfBirth',
  'date of birth': 'dateOfBirth',
  doj: 'dateOfJoining',
  'date of joining': 'dateOfJoining',
  designation: 'designation',
  department: 'department',
  'reporting manager': 'reportingManager',
  manager: 'reportingManager',
  location: 'location',
  'confirmation date': 'confirmationDate',
  'official email': 'officialEmail',
  email: 'officialEmail',
}

function normHeader(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

function normDate(v: string): string {
  const s = (v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToISO(s) ?? ''
  // dd/mm/yyyy or dd-mm-yyyy -> ISO (best effort; ambiguous formats stay raw
  // and are caught as an error by the reconcile date check).
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    const dd = d!.padStart(2, '0')
    const mm = mo!.padStart(2, '0')
    if (Number(mm) <= 12 && Number(dd) <= 31) return `${y}-${mm}-${dd}`
  }
  return s
}

function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) =>
    ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[m] ?? m,
  )
}

function toRows(headers: string[], dataRows: string[][]): { rows: ImportRow[]; errors: string[] } {
  const errors: string[] = []
  // Build a column-index -> field map from the header row.
  const idxToField = new Map<number, keyof ImportRow>()
  headers.forEach((h, i) => {
    const field = HEADER_TO_FIELD[normHeader(h)]
    if (field) idxToField.set(i, field)
  })
  const mappedFields = new Set(idxToField.values())
  for (const req of ['employeeCode', 'name', 'dateOfJoining', 'designation', 'department'] as const) {
    if (!mappedFields.has(req)) {
      errors.push(`Missing a required column for "${req}". Download the template for the exact headers.`)
    }
  }
  if (errors.length) return { rows: [], errors }

  const blank = (): ImportRow => ({
    employeeCode: '', title: '', name: '', gender: '', dateOfBirth: '', dateOfJoining: '',
    designation: '', department: '', reportingManager: '', location: '', confirmationDate: '',
    officialEmail: '', rowRef: '',
  })
  const dateFields = new Set<keyof ImportRow>(['dateOfBirth', 'dateOfJoining', 'confirmationDate'])
  const rows: ImportRow[] = []
  dataRows.forEach((cells, i) => {
    const row = blank()
    row.rowRef = `Row ${i + 2}` // +2: header is row 1, data starts row 2
    let any = false
    idxToField.forEach((field, col) => {
      let v = (cells[col] ?? '').trim()
      if (v) any = true
      if (dateFields.has(field)) v = normDate(v)
      ;(row as unknown as Record<string, string>)[field] = v
    })
    if (any) rows.push(row)
  })
  if (rows.length > MAX_ROWS) {
    errors.push(`File has ${rows.length} rows; the limit is ${MAX_ROWS}. Split it into smaller uploads.`)
    return { rows: [], errors }
  }
  return { rows, errors }
}

function parseCsv(text: string): { rows: ImportRow[]; errors: string[] } {
  // Minimal CSV: handles quoted fields with commas + escaped quotes.
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { record.push(field); field = '' }
    else if (c === '\n') { record.push(field); records.push(record); record = []; field = '' }
    else field += c
  }
  if (field.length || record.length) { record.push(field); records.push(record) }
  const nonEmpty = records.filter((r) => r.some((c) => c.trim()))
  if (nonEmpty.length < 1) return { rows: [], errors: ['The file is empty.'] }
  const [headers, ...data] = nonEmpty
  return toRows(headers!, data)
}

function parseXlsx(buf: Buffer): { rows: ImportRow[]; errors: string[] } {
  let zip: PizZip
  try {
    zip = new PizZip(buf)
  } catch {
    return { rows: [], errors: ['Could not read the file as a valid .xlsx workbook.'] }
  }
  const shared: string[] = []
  const ssf = zip.file('xl/sharedStrings.xml')
  if (ssf) {
    for (const m of ssf.asText().matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)) {
      const parts = [...(m[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1] ?? ''))
      shared.push(parts.join(''))
    }
  }
  const sheetNames = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const first = sheetNames[0]
  if (!first) return { rows: [], errors: ['The workbook has no worksheets.'] }
  const xml = zip.file(first)!.asText()
  const colIndex = (ref: string) => {
    const letters = ref.replace(/\d+/g, '')
    let n = 0
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
    return n - 1
  }
  const grid: string[][] = []
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cm of (rm[2] ?? '').matchAll(
      /<c r="([A-Z]+\d+)"(?:[^>]*t="([^"]+)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)?<\/c>/g,
    )) {
      const idx = colIndex(cm[1] ?? '')
      const type = cm[2] ?? 'n'
      const raw = cm[3] ?? cm[4]
      cells[idx] = raw === undefined ? '' : type === 's' ? (shared[Number(raw)] ?? '') : decode(raw)
    }
    grid.push(cells)
  }
  const nonEmpty = grid.filter((r) => r.some((c) => (c ?? '').trim()))
  if (nonEmpty.length < 1) return { rows: [], errors: ['The workbook is empty.'] }
  const [headers, ...data] = nonEmpty
  return toRows(headers!.map((h) => h ?? ''), data.map((r) => Array.from(r, (c) => c ?? '')))
}

/** Parse an uploaded employee file (xlsx or csv) into rows. Detects format by
 *  the zip magic bytes (xlsx) with a .csv / text fallback. */
export function parseEmployeeUpload(buf: Buffer, filename: string): { rows: ImportRow[]; errors: string[] } {
  const isZip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b // 'PK'
  const lower = filename.toLowerCase()
  if (isZip || lower.endsWith('.xlsx')) return parseXlsx(buf)
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCsv(buf.toString('utf-8'))
  // Unknown extension: try xlsx (zip) then csv.
  return isZip ? parseXlsx(buf) : parseCsv(buf.toString('utf-8'))
}

/** Build a minimal .xlsx template (header row only) for download. */
export function buildTemplateXlsx(): Buffer {
  const cols = TEMPLATE_COLUMNS
  const sharedStrings = cols
    .map((c) => `<si><t xml:space="preserve">${c.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`)
    .join('')
  const cells = cols
    .map((_, i) => {
      const ref = colRef(i) + '1'
      return `<c r="${ref}" t="s"><v>${i}</v></c>`
    })
    .join('')
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData><row r="1">${cells}</row></sheetData></worksheet>`
  const zip = new PizZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
      `</Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  )
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="Employees" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
      `</Relationships>`,
  )
  zip.file('xl/worksheets/sheet1.xml', sheet)
  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${cols.length}" uniqueCount="${cols.length}">${sharedStrings}</sst>`,
  )
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function colRef(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
