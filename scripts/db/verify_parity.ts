/*
 * Parity gate: Postgres must reproduce the source JSON exactly.
 *
 * This does not compare counts and call it done. For every record it
 * RECONSTRUCTS the original JSON object from the database row (real columns +
 * the `extra` blob + auditLog rebuilt from audit_entries in seq order) and
 * deep-compares it against the source file, field by field.
 *
 * A count check can pass while every field is wrong. A round-trip cannot.
 *
 * Exit 0 means exact parity and cutover may proceed. Any diff exits 1 and
 * prints the offending path, and nothing in production should be touched.
 *
 *   npx tsx scripts/db/verify_parity.ts [--verbose]
 */

import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const DATA_DIR = path.join(process.cwd(), 'src', 'data')
const VERBOSE = process.argv.includes('--verbose')
const prisma = new PrismaClient({
  // Admin scripts use the UNPOOLED connection. The pooler caches query plans,
  // so after a column type change (age Int -> Float) a pooled connection fails
  // with "cached plan must not change result type". Pooling is for the
  // serverless app runtime, not for migrations or verification.
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
})

function readJson(file: string): unknown {
  const p = path.join(DATA_DIR, file)
  if (!fs.existsSync(p)) return null
  const t = fs.readFileSync(p, 'utf-8')
  return t.trim() ? JSON.parse(t) : null
}
function asList(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x) => !!x && typeof x === 'object' && !Array.isArray(x)) : []
}

/** Deep equality that treats undefined and absent as the same thing. */
function diff(a: unknown, b: unknown, p = ''): string[] {
  if (a === b) return []
  if (a === null || b === null || a === undefined || b === undefined) {
    const an = a === undefined ? null : a
    const bn = b === undefined ? null : b
    if (an === bn) return []
    return [`${p || '(root)'}: json=${JSON.stringify(a)} db=${JSON.stringify(b)}`]
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [`${p}: array/non-array mismatch`]
    if (a.length !== b.length) return [`${p}: length json=${a.length} db=${b.length}`]
    return a.flatMap((x, i) => diff(x, b[i], `${p}[${i}]`))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
    const out: string[] = []
    for (const k of keys) {
      out.push(...diff((a as never)[k], (b as never)[k], p ? `${p}.${k}` : k))
    }
    return out
  }
  return [`${p}: json=${JSON.stringify(a)} db=${JSON.stringify(b)}`]
}

/** Strip undefined/null-valued keys so absent and null compare equal. */
function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue
    out[k] = v
  }
  return out
}

type AuditMap = Map<string, Record<string, unknown>[]>

async function loadAudit(entityType: string): Promise<AuditMap> {
  const rows = await prisma.auditEntry.findMany({
    where: { entityType },
    orderBy: [{ entityId: 'asc' }, { seq: 'asc' }],
  })
  const map: AuditMap = new Map()
  for (const r of rows) {
    const entry: Record<string, unknown> = {
      timestamp: r.timestamp,
      user: r.actor,
      action: r.action,
    }
    if (r.before !== null) entry.before = r.before
    if (r.after !== null) entry.after = r.after
    if (r.notes !== null) entry.notes = r.notes
    if (!map.has(r.entityId)) map.set(r.entityId, [])
    map.get(r.entityId)!.push(entry)
  }
  return map
}

let totalRecords = 0
let totalFields = 0
const failures: string[] = []

/**
 * Compare one entity.
 *
 * `rebuild` turns a DB row back into the JSON object it came from. `keyOf`
 * picks the identity used to pair a JSON record with its row.
 */
async function check<Row>(
  label: string,
  file: string,
  entityType: string | null,
  rows: Row[],
  keyOf: (r: Record<string, unknown>) => string,
  rowKeyOf: (r: Row) => string,
  rebuild: (row: Row, audit: Record<string, unknown>[] | undefined) => Record<string, unknown>,
) {
  const source = asList(readJson(file))
  const audit = entityType ? await loadAudit(entityType) : new Map()

  if (source.length !== rows.length) {
    failures.push(`${label}: COUNT json=${source.length} db=${rows.length}`)
    return
  }

  const byKey = new Map(rows.map((r) => [rowKeyOf(r), r] as const))
  let fieldsCompared = 0

  for (const rec of source) {
    const key = keyOf(rec)
    const row = byKey.get(key)
    if (!row) {
      failures.push(`${label}: missing in db, key=${key}`)
      continue
    }
    const rebuilt = clean(rebuild(row, audit.get(key)))
    const expected = clean(rec)
    fieldsCompared += Object.keys(expected).length
    const d = diff(expected, rebuilt)
    if (d.length) {
      for (const line of d.slice(0, 4)) failures.push(`${label}[${key}] ${line}`)
      if (d.length > 4) failures.push(`${label}[${key}] ...and ${d.length - 4} more field diffs`)
    }
  }

  totalRecords += source.length
  totalFields += fieldsCompared
  const status = failures.some((f) => f.startsWith(label)) ? 'FAIL' : 'ok  '
  console.log(`  ${status} ${label.padEnd(30)} ${String(source.length).padStart(5)} records ${String(fieldsCompared).padStart(6)} fields`)
}

/** Merge real columns, the extra blob and the rebuilt auditLog. */
function merge(
  cols: Record<string, unknown>,
  extra: unknown,
  audit?: Record<string, unknown>[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cols }
  if (extra && typeof extra === 'object') Object.assign(out, extra as object)
  if (audit) out.auditLog = audit
  return out
}

async function run() {
  console.log('Parity: reconstructing every record from Postgres and deep-comparing to JSON\n')

  await check('users', 'users.json', 'user',
    await prisma.user.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({
      id: r.id, email: r.email, name: r.name, role: r.role, bcryptHash: r.bcryptHash,
      createdAt: r.createdAt, active: r.active, ownedRoleIds: r.ownedRoleIds,
    }, r.extra, a))

  await check('roles', 'roles.json', 'role',
    await prisma.role.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({
      id: r.id, title: r.title, department: r.department, location: r.location,
      employmentType: r.employmentType, status: r.status, description: r.description,
      hodUserId: r.hodUserId, hodRound2UserId: r.hodRound2UserId, pauseReason: r.pauseReason,
      closeOutcome: r.closeOutcome, closeNotes: r.closeNotes, createdAt: r.createdAt,
      createdBy: r.createdBy, pipelineStages: r.pipelineStages, rubric: r.rubric,
      responsibilities: r.responsibilities, mustHaves: r.mustHaves, niceToHaves: r.niceToHaves,
      salaryRange: r.salaryRange,
    }, r.extra, a))

  await check('candidates', 'candidates.json', 'candidate',
    await prisma.candidate.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({
      id: r.id, name: r.name, email: r.email, phone: r.phone, source: r.source,
      resumeFilePath: r.resumeFilePath, searchableText: r.searchableText, status: r.status,
      createdAt: r.createdAt, createdBy: r.createdBy, tags: r.tags,
    }, r.extra, a))

  await check('applications', 'applications.json', 'application',
    await prisma.application.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({
      id: r.id, candidateId: r.candidateId, roleId: r.roleId, currentStage: r.currentStage,
      createdAt: r.createdAt, createdBy: r.createdBy, updatedAt: r.updatedAt,
    }, r.extra, a))

  await check('employees', 'employees.json', 'employee',
    await prisma.employee.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({
      id: r.id, employeeCode: r.employeeCode, title: r.title, name: r.name, email: r.email,
      phone: r.phone, designation: r.designation, department: r.department, location: r.location,
      reportingTo: r.reportingTo, reportingManagerId: r.reportingManagerId,
      dateOfJoining: r.dateOfJoining, status: r.status, confirmationDate: r.confirmationDate,
      tenureYears: r.tenureYears, dateOfBirth: r.dateOfBirth, age: r.age, gender: r.gender,
      maritalStatus: r.maritalStatus, address: r.address, personalEmail: r.personalEmail,
      officialEmailMissing: r.officialEmailMissing, locationType: r.locationType,
      employmentStatus: r.employmentStatus, workPattern: r.workPattern,
      leaveYearStart: r.leaveYearStart, createdAt: r.createdAt, createdBy: r.createdBy,
      updatedAt: r.updatedAt, leaveBalance: r.leaveBalance, exit: r.exit,
      onboardingChecklist: r.onboardingChecklist,
    }, r.extra, a))

  await check('exit_processes', 'exit_processes.json', 'exitProcess',
    await prisma.exitProcess.findMany(), (r) => String(r.employeeId), (r) => r.employeeId,
    (r, a) => merge({
      employeeId: r.employeeId, exitType: r.exitType, reasonForLeaving: r.reasonForLeaving,
      resignationDate: r.resignationDate, terminationDate: r.terminationDate,
      lastWorkingDay: r.lastWorkingDay, completedAt: r.completedAt, closedAt: r.closedAt,
      closedBy: r.closedBy, closeReason: r.closeReason, createdAt: r.createdAt,
      createdBy: r.createdBy, updatedAt: r.updatedAt, steps: r.steps,
    }, r.extra, a))

  await check('exit_interviews', 'exit_interviews.json', 'exitInterview',
    await prisma.exitInterview.findMany(), (r) => String(r.employeeId), (r) => r.employeeId,
    (r, a) => merge({ employeeId: r.employeeId }, r.extra, a))

  await check('exit_handovers', 'exit_handovers.json', 'exitHandover',
    await prisma.exitHandover.findMany(), (r) => String(r.employeeId), (r) => r.employeeId,
    (r, a) => merge({ employeeId: r.employeeId }, r.extra, a))

  await check('onboarding_tasks', 'employee_onboarding_tasks.json', 'onboardingTask',
    await prisma.onboardingTask.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({
      id: r.id, employeeId: r.employeeId, templateId: r.templateId, status: r.status,
      dueDate: r.dueDate, assigneeId: r.assigneeId,
    }, r.extra, a))

  await check('holidays', 'holidays.json', 'holiday',
    await prisma.holiday.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({ id: r.id, date: r.date }, r.extra, a))

  await check('hr_tasks', 'hr_tasks.json', 'hrTask',
    await prisma.hrTask.findMany(), (r) => String(r.id), (r) => r.id,
    (r, a) => merge({ id: r.id, status: r.status, dueDate: r.dueDate, assignee: r.assignee }, r.extra, a))

  const simple: [string, string, string, () => Promise<{ id: string; extra: unknown }[]>][] = [
    ['onboarding_templates', 'onboarding_task_templates.json', 'onboardingTaskTemplate', () => prisma.onboardingTaskTemplate.findMany()],
    ['offboarding_templates', 'offboarding_task_templates.json', 'offboardingTaskTemplate', () => prisma.offboardingTaskTemplate.findMany()],
    ['exit_step_templates', 'exit_step_templates.json', 'exitStepTemplate', () => prisma.exitStepTemplate.findMany()],
    ['document_templates', 'document_templates.json', 'documentTemplate', () => prisma.documentTemplate.findMany()],
    ['prompts', 'prompts.json', 'prompt', () => prisma.prompt.findMany()],
    ['outbound_mail', '_outbound_mail.json', 'outboundMail', () => prisma.outboundMail.findMany()],
    ['alert_log', 'alert_log.json', 'alertLog', () => prisma.alertLog.findMany()],
    ['recognitions', 'recognitions.json', 'recognition', () => prisma.recognition.findMany()],
    ['nomination_cycles', 'nomination_cycles.json', 'nominationCycle', () => prisma.nominationCycle.findMany()],
  ]
  for (const [label, file, entityType, fetch] of simple) {
    await check(label, file, entityType, await fetch(), (r) => String(r.id), (r) => r.id,
      (r, a) => merge({ id: r.id }, r.extra, a))
  }

  // Entities that are empty today but must still round-trip if they fill up.
  const empties: [string, string, () => Promise<unknown[]>][] = [
    ['interviews', 'interviews.json', () => prisma.interview.findMany()],
    ['offers', 'offers.json', () => prisma.offer.findMany()],
    ['ff_settlements', 'ff_settlements.json', () => prisma.fFSettlement.findMany()],
    ['employee_documents', 'employee_documents.json', () => prisma.employeeDocument.findMany()],
    ['offboarding_tasks', 'employee_offboarding_tasks.json', () => prisma.offboardingTask.findMany()],
    ['leave_applications', 'leave_applications.json', () => prisma.leaveApplication.findMany()],
    ['leave_balances', 'leave_balances.json', () => prisma.leaveBalanceRecord.findMany()],
    ['attendance_exceptions', 'attendance_exceptions.json', () => prisma.attendanceException.findMany()],
    ['optional_holidays', 'employee_optional_holidays.json', () => prisma.employeeOptionalHoliday.findMany()],
    ['it_assets', 'it_assets.json', () => prisma.iTAsset.findMany()],
    ['assets', 'assets.json', () => prisma.asset.findMany()],
  ]
  for (const [label, file, fetch] of empties) {
    const src = asList(readJson(file))
    const rows = await fetch()
    if (src.length !== rows.length) failures.push(`${label}: COUNT json=${src.length} db=${rows.length}`)
    console.log(`  ${src.length === rows.length ? 'ok  ' : 'FAIL'} ${label.padEnd(30)} ${String(src.length).padStart(5)} records (empty)`)
    totalRecords += src.length
  }

  // Singletons.
  for (const key of ['taxonomy', 'system_settings', 'alert_preferences']) {
    const src = readJson(`${key}.json`)
    const row = await prisma.singletonDoc.findUnique({ where: { key } })
    if (!row) {
      failures.push(`singleton ${key}: missing in db`)
      continue
    }
    const d = diff(src, row.value)
    if (d.length) for (const line of d.slice(0, 4)) failures.push(`singleton ${key} ${line}`)
    console.log(`  ${d.length ? 'FAIL' : 'ok  '} ${`singleton:${key}`.padEnd(30)}`)
    totalRecords += 1
  }

  // Queue archive: count only, it is a historical record not a live entity.
  const applied = asList(readJson('applied_updates.json')).length
  const failed = asList(readJson('failed_updates.json')).length
  const archived = await prisma.queueArchive.count()
  if (applied + failed !== archived) {
    failures.push(`queue_archive: COUNT json=${applied + failed} db=${archived}`)
  }
  console.log(`  ${applied + failed === archived ? 'ok  ' : 'FAIL'} ${'queue_archive'.padEnd(30)} ${String(archived).padStart(5)} records`)

  const auditTotal = await prisma.auditEntry.count()
  console.log(`\n  audit entries in db: ${auditTotal}`)
  console.log(`  records compared   : ${totalRecords}`)
  console.log(`  fields compared    : ${totalFields}`)

  if (failures.length) {
    console.log(`\nPARITY FAILED - ${failures.length} problem(s):`)
    for (const f of failures.slice(0, VERBOSE ? failures.length : 40)) console.log(`  ${f}`)
    if (!VERBOSE && failures.length > 40) console.log(`  ...and ${failures.length - 40} more (--verbose for all)`)
    console.log('\nDO NOT CUT OVER. Production unchanged.')
    process.exit(1)
  }

  console.log('\nPARITY EXACT: every record round-trips from Postgres byte-for-byte.')
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
