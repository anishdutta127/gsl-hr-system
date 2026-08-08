/*
 * Admin-only bulk salary structure import.
 *
 * Accepts a CSV upload mapping employee_code -> salary fields. xlsx is not
 * supported directly to avoid a heavy SheetJS dep on the serverless function;
 * "Save As CSV" from Excel is the documented path.
 *
 * Expected columns (header row required, case-insensitive):
 *   employee_code, ctc, basic, hra, conveyance, other_allowances,
 *   pf_employee, pt_monthly, net_take_home
 *
 * Rows whose employee_code does not match an existing employee are reported
 * back as `notFound` and skipped (do NOT create employees here - that path
 * exists separately and would mask typos).
 */

import { NextResponse } from 'next/server'
import { loadEmployees } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

interface ParsedRow {
  employeeCode: string
  ctc: number
  basic: number
  hra: number
  conveyance: number
  otherAllowances: number
  pfEmployee: number
  ptMonthly: number
  netTakeHome: number
}

const COLUMN_ALIASES: Record<keyof ParsedRow, string[]> = {
  employeeCode: ['employee_code', 'employeecode', 'code', 'emp_code', 'empcode'],
  ctc: ['ctc', 'annual_ctc', 'ctc_annual'],
  basic: ['basic', 'basic_annual'],
  hra: ['hra', 'hra_annual'],
  conveyance: ['conveyance', 'conveyance_annual'],
  otherAllowances: ['other_allowances', 'otherallowances', 'other'],
  pfEmployee: ['pf_employee', 'pf', 'pf_annual'],
  ptMonthly: ['pt_monthly', 'pt', 'professional_tax'],
  netTakeHome: ['net_take_home', 'net', 'net_annual', 'nettakehome'],
}

function parseCsv(text: string): string[][] {
  // Minimal CSV: handles double-quoted fields with embedded commas / newlines
  // and "" escapes. Sufficient for HR's exported salary sheet.
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim().length > 0)) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    if (row.some((c) => c.trim().length > 0)) rows.push(row)
  }
  return rows
}

function toRupees(v: string): number | null {
  const cleaned = (v ?? '').toString().replace(/[,_\s]/g, '').replace(/^Rs\.?/i, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin') {
    return NextResponse.json({ message: 'Admin only.' }, { status: 403 })
  }

  let csvText: string
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ message: 'Upload a CSV file under the field name "file".' }, { status: 400 })
    }
    csvText = await file.text()
  } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    csvText = await request.text()
  } else {
    return NextResponse.json(
      { message: 'Send CSV via multipart/form-data (file=) or text/csv body.' },
      { status: 400 },
    )
  }

  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return NextResponse.json({ message: 'CSV needs a header row and at least one data row.' }, { status: 400 })
  }

  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const indexFor: Partial<Record<keyof ParsedRow, number>> = {}
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<[keyof ParsedRow, string[]]>) {
    const idx = header.findIndex((h) => aliases.includes(h))
    if (idx >= 0) indexFor[field] = idx
  }
  const missingColumns = Object.entries(COLUMN_ALIASES)
    .filter(([f]) => !(f in indexFor))
    .map(([f]) => f)
  if (missingColumns.length > 0) {
    return NextResponse.json(
      { message: `Missing required columns: ${missingColumns.join(', ')}` },
      { status: 400 },
    )
  }

  const employees = await loadEmployees()
  const codeIndex = new Map(employees.map((e) => [e.employeeCode.toLowerCase(), e]))

  const accepted: Array<{ employeeCode: string }> = []
  const notFound: string[] = []
  const invalid: Array<{ row: number; reason: string }> = []

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!
    const codeRaw = (row[indexFor.employeeCode!] ?? '').trim()
    if (!codeRaw) {
      invalid.push({ row: r + 1, reason: 'employee_code blank' })
      continue
    }
    const employee = codeIndex.get(codeRaw.toLowerCase())
    if (!employee) {
      notFound.push(codeRaw)
      continue
    }

    type NumericField = Exclude<keyof ParsedRow, 'employeeCode'>
    const numericFields: NumericField[] = [
      'ctc', 'basic', 'hra', 'conveyance', 'otherAllowances', 'pfEmployee', 'ptMonthly', 'netTakeHome',
    ]
    const numeric: Partial<ParsedRow> = { employeeCode: codeRaw }
    let badField: string | null = null
    for (const f of numericFields) {
      const v = toRupees(row[indexFor[f]!] ?? '')
      if (v === null) {
        badField = f
        break
      }
      numeric[f] = v
    }
    if (badField) {
      invalid.push({ row: r + 1, reason: `${badField} not a non-negative number` })
      continue
    }

    const grossAnnual = numeric.basic! + numeric.hra! + numeric.conveyance! + numeric.otherAllowances!
    const deductionsAnnual = numeric.pfEmployee! + numeric.ptMonthly! * 12
    if (deductionsAnnual > grossAnnual) {
      invalid.push({ row: r + 1, reason: 'deductions exceed gross' })
      continue
    }

    try {
      await enqueueUpdate({
        queuedBy: session.email,
        entity: 'employee',
        operation: 'update',
        payload: {
          id: employee.id,
          operation: 'salary-structure.import',
          before: { salaryStructure: employee.salaryStructure ?? null, ctcAnnual: employee.ctcAnnual ?? null },
          after: {
            salaryStructure: {
              ctc: numeric.ctc!,
              basic: numeric.basic!,
              hra: numeric.hra!,
              conveyance: numeric.conveyance!,
              otherAllowances: numeric.otherAllowances!,
              pfEmployee: numeric.pfEmployee!,
              ptMonthly: numeric.ptMonthly!,
              netTakeHome: numeric.netTakeHome!,
            },
            ctcAnnual: numeric.ctc!,
          },
          notes: `Bulk salary import by ${session.email} (row ${r + 1}, code ${codeRaw}).`,
        },
      })
      accepted.push({ employeeCode: codeRaw })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'queue failed'
      invalid.push({ row: r + 1, reason: `queue: ${message}` })
    }
  }

  return NextResponse.json({
    ok: true,
    accepted: accepted.length,
    notFound,
    invalid,
    message:
      `Imported ${accepted.length} salary structure${accepted.length === 1 ? '' : 's'}.` +
      (notFound.length ? ` ${notFound.length} code${notFound.length === 1 ? '' : 's'} not found, will need creation first.` : '') +
      (invalid.length ? ` ${invalid.length} row${invalid.length === 1 ? '' : 's'} skipped.` : ''),
  })
}
