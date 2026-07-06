/*
 * Import employees from GSL-employee-import-cleaned.xlsx (two sheets:
 * "New Joinings (Active)" + "To Exit"). Reconciles by Employee Code via the
 * SHARED reconcile service (src/lib/employees/reconcileImport.ts) - the same
 * logic the in-app HR bulk-upload API uses.
 *
 * Writes through the QUEUE, never straight into employees.json: `--enqueue`
 * appends one `employee.create` entry per record to src/data/pending_updates.json
 * (the exact op + shape the UI's create path emits); you then drain it with
 * `python scripts/apply_queue.py`, which runs apply_create -> employees.json.
 * `--onboarding` (run AFTER the drain, once the records exist) generates the
 * Phase-4 onboarding tasks for the imported codes, exactly as the UI's
 * post-create onboarding generation does.
 *
 * Modes:
 *   npx tsx scripts/import_employees.ts               # dry-run report only
 *   npx tsx scripts/import_employees.ts --enqueue      # append creates to the queue
 *   npx tsx scripts/import_employees.ts --onboarding   # generate onboarding (post-drain)
 *
 * The 3 "To Exit" people import as ACTIVE only - exits are NOT initiated here
 * (they need per-person last working day + reason, absent from the file).
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'

import { defaultOnboardingChecklist } from '../src/lib/onboarding'
import { excelSerialToISO } from '../src/lib/employees/standardise'
import {
  buildManagerLookup,
  reconcileEmployeeImport,
  type ImportRow,
  type ReconcileContext,
} from '../src/lib/employees/reconcileImport'
import {
  generateOnboardingTasksForEmployee,
  loadOnboardingTasks,
  loadOnboardingTemplates,
} from '../src/lib/onboardingTasks'
import type { Employee, OnboardingTask, PendingUpdate } from '../src/lib/types'

const ROOT = path.join(__dirname, '..')
const XLSX_PATH = path.join(ROOT, 'phase-5-import-inputs', 'GSL-employee-import-cleaned.xlsx')
const EMPLOYEES_JSON = path.join(ROOT, 'src', 'data', 'employees.json')
const TAXONOMY_JSON = path.join(ROOT, 'src', 'data', 'taxonomy.json')
const QUEUE_JSON = path.join(ROOT, 'src', 'data', 'pending_updates.json')
const ONBOARDING_JSON = path.join(ROOT, 'src', 'data', 'employee_onboarding_tasks.json')
const ACTOR = 'employee-import'

// MTPL/040 Nilabhra Poddar: the source file records Gender "Female" with Title
// "Mr." (a conflict). Anish confirmed the correct gender is MALE (2026-07-06),
// so we import Male + record the correction in the audit rather than the
// erroneous file value. Gender drives letter pronouns.
const GENDER_OVERRIDES: Record<string, { gender: string; note: string }> = {
  'MTPL/040': {
    gender: 'Male',
    note: 'Source file had Gender "Female" with Title "Mr." (conflict); corrected to "Male" per Anish 2026-07-06.',
  },
}

const COLUMN_MAP: Record<string, keyof ImportRow> = {
  A: 'employeeCode',
  B: 'title',
  C: 'name',
  D: 'gender',
  E: 'dateOfBirth',
  F: 'dateOfJoining',
  G: 'designation',
  H: 'department',
  I: 'reportingManager',
  J: 'location',
  K: 'confirmationDate',
  L: 'officialEmail',
}

function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) =>
    ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[m] ?? m,
  )
}

/** Read every sheet of the workbook into rows keyed by column letter. */
function readAllSheets(filePath: string): Array<{ sheet: string; rows: Array<Record<string, string>> }> {
  const zip = new PizZip(fs.readFileSync(filePath))
  const shared: string[] = []
  const ssf = zip.file('xl/sharedStrings.xml')
  if (ssf) {
    for (const m of ssf.asText().matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)) {
      const parts = [...(m[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1] ?? ''))
      shared.push(parts.join(''))
    }
  }
  const names = [...zip.file('xl/workbook.xml')!.asText().matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) =>
    decode(m[1] ?? ''),
  )
  const files = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  return files.map((p, idx) => {
    const xml = zip.file(p)!.asText()
    const rows: Array<Record<string, string>> = []
    for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: Record<string, string> = {}
      for (const cm of (rm[2] ?? '').matchAll(
        /<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)?<\/c>/g,
      )) {
        const col = cm[1] ?? ''
        const type = cm[2] ?? 'n'
        const raw = cm[3] ?? cm[4]
        if (raw === undefined) continue
        cells[col] = type === 's' ? (shared[Number(raw)] ?? '') : decode(raw)
      }
      if (Object.keys(cells).length) rows.push(cells)
    }
    return { sheet: names[idx] ?? p, rows }
  })
}

/** A date cell is ISO text in the cleaned file; fall back to Excel-serial. */
function normDate(v: string): string {
  const s = (v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToISO(s) ?? ''
  return ''
}

function parseRows(): ImportRow[] {
  const sheets = readAllSheets(XLSX_PATH)
  const out: ImportRow[] = []
  for (const { sheet, rows } of sheets) {
    rows.slice(1).forEach((cells, i) => {
      const get = (k: keyof ImportRow) => {
        const col = Object.keys(COLUMN_MAP).find((c) => COLUMN_MAP[c] === k)!
        return (cells[col] ?? '').trim()
      }
      const code = get('employeeCode')
      if (!code) return
      const override = GENDER_OVERRIDES[code]
      out.push({
        employeeCode: code,
        title: get('title'),
        name: get('name'),
        gender: override ? override.gender : get('gender'),
        dateOfBirth: normDate(get('dateOfBirth')),
        dateOfJoining: normDate(get('dateOfJoining')),
        designation: get('designation'),
        department: get('department'),
        reportingManager: get('reportingManager'),
        location: get('location'),
        confirmationDate: normDate(get('confirmationDate')),
        officialEmail: get('officialEmail'),
        rowRef: `${sheet} #${i + 1}`,
      })
    })
  }
  return out
}

function deterministicId(code: string): string {
  const h = crypto.createHash('sha256').update(`gsl-hr-emp:${code}`).digest('hex').slice(0, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

function loadJson<T>(p: string, def: T): T {
  try {
    const t = fs.readFileSync(p, 'utf-8').trim()
    return t ? (JSON.parse(t) as T) : def
  } catch {
    return def
  }
}

function buildContext(employees: Employee[], now: string): ReconcileContext {
  const taxonomy = loadJson<{ departments?: Record<string, unknown>; locations?: Record<string, unknown> }>(
    TAXONOMY_JSON,
    {},
  )
  const { nameToId, idToName } = buildManagerLookup(employees)
  return {
    existingByCode: new Map(employees.filter((e) => e.employeeCode).map((e) => [e.employeeCode, e])),
    existingByEmail: new Map(employees.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e])),
    managerNameToId: nameToId,
    managerIdToName: idToName,
    validDepartments: new Set(Object.keys(taxonomy.departments ?? {})),
    validLocations: new Set(Object.keys(taxonomy.locations ?? {})),
    now,
    actor: ACTOR,
    idFor: deterministicId,
    defaultOnboardingChecklist,
  }
}

function main() {
  const enqueue = process.argv.includes('--enqueue')
  const onboarding = process.argv.includes('--onboarding')
  const now = new Date().toISOString()

  const rows = parseRows()
  const employees = loadJson<Employee[]>(EMPLOYEES_JSON, [])
  const ctx = buildContext(employees, now)
  const results = reconcileEmployeeImport(rows, ctx)

  // --- Report -----------------------------------------------------------
  console.log(`\n=== Employee import: ${rows.length} rows, ${employees.length} existing employees ===\n`)
  const counts: Record<string, number> = {}
  for (const r of results) counts[r.classification] = (counts[r.classification] ?? 0) + 1
  console.log('Classification:', JSON.stringify(counts))
  console.log('')
  console.log('CODE       | CLASS      | DEPT            | MANAGER                | FLAGS')
  console.log('-'.repeat(110))
  for (const r of results) {
    const mgr = r.resolvedManager ? r.resolvedManager.name : '(unset)'
    const flags = [...r.errors.map((e) => 'ERR:' + e), ...r.warnings].join(' | ') || '-'
    console.log(
      `${r.code.padEnd(10)} | ${r.classification.padEnd(10)} | ${(r.resolvedDepartment ?? '-').padEnd(15)} | ${mgr.padEnd(22)} | ${flags}`,
    )
  }

  if (onboarding) {
    return runOnboarding(results, now)
  }

  if (!enqueue) {
    console.log('\nDRY RUN. Re-run with --enqueue to append employee.create ops to the queue.')
    return
  }

  // --- Enqueue employee.create for every non-error row ------------------
  const writable = results.filter((r) => r.classification !== 'error' && r.employee)
  if (writable.length !== results.length) {
    console.log(`\n${results.length - writable.length} row(s) are errors and will NOT be queued.`)
  }
  const queue = loadJson<PendingUpdate[]>(QUEUE_JSON, [])
  const already = new Set(
    queue.filter((q) => q.entity === 'employee').map((q) => (q.payload as { id?: string }).id),
  )
  let added = 0
  for (const r of writable) {
    const emp = r.employee!
    // Attach a gender-correction audit note where we overrode the file value.
    const override = GENDER_OVERRIDES[r.code]
    if (override) {
      emp.auditLog = [
        ...emp.auditLog,
        { timestamp: now, user: ACTOR, action: 'employee.gender.correct', after: { gender: override.gender }, notes: override.note },
      ]
    }
    if (already.has(emp.id)) continue
    queue.push({
      id: crypto.randomUUID(),
      queuedAt: now,
      queuedBy: ACTOR,
      entity: 'employee',
      operation: r.classification === 'create' ? 'create' : 'update',
      payload: emp as unknown as Record<string, unknown>,
    })
    added++
  }
  fs.writeFileSync(QUEUE_JSON, JSON.stringify(queue, null, 2) + '\n', 'utf-8')
  console.log(`\nEnqueued ${added} employee op(s) to ${path.relative(ROOT, QUEUE_JSON)}.`)
  console.log('Next: python scripts/apply_queue.py   (drains -> employees.json)')
  console.log('Then: npx tsx scripts/import_employees.ts --onboarding   (post-drain)')
}

function runOnboarding(results: ReturnType<typeof reconcileEmployeeImport>, now: string) {
  const employees = loadJson<Employee[]>(EMPLOYEES_JSON, [])
  const byCode = new Map(employees.filter((e) => e.employeeCode).map((e) => [e.employeeCode, e]))
  const templates = loadOnboardingTemplates()
  const existing = loadOnboardingTasks()
  const users = loadJson<Array<{ id: string; name: string; role: string; active?: boolean }>>(
    path.join(ROOT, 'src', 'data', 'users.json'),
    [],
  )
  const generated: OnboardingTask[] = []
  const report: string[] = []
  for (const r of results) {
    if (r.classification === 'error') continue
    const emp = byCode.get(r.code)
    if (!emp) {
      report.push(`${r.code}: not found in employees.json - drain the queue first.`)
      continue
    }
    if (existing.some((t) => t.employeeId === emp.id)) {
      report.push(`${r.code}: onboarding already exists - skipped.`)
      continue
    }
    const tasks = generateOnboardingTasksForEmployee({
      employee: emp,
      templates,
      users: users as never,
      existing,
      now: new Date(now),
    })
    generated.push(...tasks)
    report.push(`${r.code}: generated ${tasks.length} onboarding task(s).`)
  }
  if (generated.length) {
    const merged = [...existing, ...generated]
    fs.writeFileSync(ONBOARDING_JSON, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  }
  console.log('\n=== Onboarding generation ===')
  report.forEach((l) => console.log('  ' + l))
  console.log(`\nTotal generated: ${generated.length} task(s) across ${report.length} record(s).`)
}

main()
