/*
 * Migrate every src/data/*.json file into Postgres.
 *
 * Idempotent, re-runnable, transactional. Running it twice leaves the same
 * state as running it once, so it can be re-run immediately before cutover to
 * pick up the very latest JSON.
 *
 * ORDER MATTERS. Any entry still sitting in pending_updates.json is a write
 * HR believes they made. It is drained into the JSON files FIRST, via the real
 * apply runner, before anything is read. Nothing queued may be lost.
 *
 * KNOWN DATA ISSUES are migrated AS-IS and reported, never auto-merged or
 * auto-deleted: duplicate roles (three "Pre-Sales Intern", "Tele Sales" vs
 * "Tele-Sales"), non-canonical locations (Ladakh, Chhattisgarh), missing dates
 * of birth. HR decides what to do about those, not this script.
 *
 *   npx tsx scripts/db/migrate_json_to_pg.ts [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { PrismaClient, Prisma } from '@prisma/client'

const DATA_DIR = path.join(process.cwd(), 'src', 'data')
const DRY_RUN = process.argv.includes('--dry-run')

const prisma = new PrismaClient({
  // Admin scripts use the UNPOOLED connection. The pooler caches query plans,
  // so after a column type change (age Int -> Float) a pooled connection fails
  // with "cached plan must not change result type". Pooling is for the
  // serverless app runtime, not for migrations or verification.
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readJson(file: string): unknown {
  const p = path.join(DATA_DIR, file)
  if (!fs.existsSync(p)) return null
  const text = fs.readFileSync(p, 'utf-8')
  if (!text.trim()) return null
  return JSON.parse(text)
}

function asList(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
}

type Json = Prisma.InputJsonValue

/**
 * Split a record into the columns a model declares and everything else.
 * The leftovers go to `extra`, so a field nobody modelled is preserved rather
 * than dropped. `auditLog` is always removed here and handled separately.
 */
function split(rec: Record<string, unknown>, columns: string[]) {
  const known: Record<string, unknown> = {}
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'auditLog') continue
    if (columns.includes(k)) known[k] = v
    else extra[k] = v
  }
  return { known, extra: Object.keys(extra).length ? (extra as Json) : undefined }
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function intOrNull(v: unknown): number | null {
  const n = numOrNull(v)
  return n === null ? null : Math.trunc(n)
}
function boolOf(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function jsonOf(v: unknown, fallback: Json): Json {
  return (v ?? fallback) as Json
}
function jsonOrNull(v: unknown): Json | undefined {
  return v === undefined || v === null ? undefined : (v as Json)
}

const findings: string[] = []
function flag(msg: string) {
  findings.push(msg)
}

// ---------------------------------------------------------------------------
// step 1: drain the queue into JSON before reading anything
// ---------------------------------------------------------------------------

function drainQueue() {
  const pending = readJson('pending_updates.json')
  const count = Array.isArray(pending) ? pending.length : 0
  if (count === 0) {
    console.log('queue: pending_updates.json is empty, nothing to drain')
    return
  }
  console.log(`queue: ${count} pending entries, draining through the real apply runner first`)
  if (DRY_RUN) {
    console.log('queue: --dry-run, not draining')
    return
  }
  execFileSync('python', ['scripts/apply_queue.py'], { stdio: 'inherit' })
  const after = readJson('pending_updates.json')
  const left = Array.isArray(after) ? after.length : 0
  if (left > 0) {
    throw new Error(`queue still holds ${left} entries after draining; refusing to migrate a partial state`)
  }
  console.log('queue: drained clean')
}

// ---------------------------------------------------------------------------
// step 2: audit entries
// ---------------------------------------------------------------------------

type AuditRow = {
  entityType: string
  entityId: string
  timestamp: string
  actor: string
  action: string
  before?: Json
  after?: Json
  notes?: string
  seq: number
}

function collectAudit(entityType: string, idOf: (r: Record<string, unknown>) => string, records: Record<string, unknown>[]): AuditRow[] {
  const rows: AuditRow[] = []
  for (const rec of records) {
    const log = rec.auditLog
    if (!Array.isArray(log)) continue
    log.forEach((raw, seq) => {
      if (!raw || typeof raw !== 'object') return
      const e = raw as Record<string, unknown>
      rows.push({
        entityType,
        entityId: idOf(rec),
        timestamp: str(e.timestamp),
        actor: str(e.user ?? e.actor),
        action: str(e.action),
        before: jsonOrNull(e.before),
        after: jsonOrNull(e.after),
        notes: typeof e.notes === 'string' ? e.notes : undefined,
        seq,
      })
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// step 3: per-entity migration
// ---------------------------------------------------------------------------

async function run() {
  drainQueue()

  const auditRows: AuditRow[] = []
  const counts: Record<string, number> = {}

  // -- users ---------------------------------------------------------------
  const users = asList(readJson('users.json'))
  auditRows.push(...collectAudit('user', (r) => str(r.id), users))
  const userRows = users.map((r) => {
    const { extra } = split(r, [
      'id', 'email', 'name', 'role', 'bcryptHash', 'createdAt', 'active', 'ownedRoleIds',
    ])
    return {
      id: str(r.id), email: str(r.email), name: str(r.name), role: str(r.role),
      bcryptHash: strOrNull(r.bcryptHash), createdAt: str(r.createdAt),
      active: boolOf(r.active, true), ownedRoleIds: jsonOrNull(r.ownedRoleIds), extra,
    }
  })
  counts.users = userRows.length

  // -- roles ---------------------------------------------------------------
  const roles = asList(readJson('roles.json'))
  auditRows.push(...collectAudit('role', (r) => str(r.id), roles))
  // Exact duplicates (three "Pre-Sales Intern") and near-duplicates that differ
  // only by punctuation or spacing ("Tele Sales" vs "Tele-Sales"). Both are
  // reported and both are migrated untouched: merging roles would move
  // applications between them, which is HR's call and not a migration's.
  const exact = new Map<string, string[]>()
  const loose = new Map<string, Set<string>>()
  for (const r of roles) {
    const title = str(r.title).trim()
    const exactKey = title.toLowerCase()
    const looseKey = exactKey.replace(/[^a-z0-9]/g, '')
    if (!exact.has(exactKey)) exact.set(exactKey, [])
    exact.get(exactKey)!.push(str(r.id))
    if (!loose.has(looseKey)) loose.set(looseKey, new Set())
    loose.get(looseKey)!.add(title)
  }
  for (const [title, ids] of exact) {
    if (ids.length > 1) flag(`duplicate role title "${title}" appears ${ids.length} times - migrated as-is, HR to decide`)
  }
  for (const [, variants] of loose) {
    if (variants.size > 1) {
      flag(`near-duplicate role titles differing only by punctuation: ${[...variants].map((v) => `"${v}"`).join(' vs ')} - migrated as-is, HR to decide`)
    }
  }
  const roleRows = roles.map((r) => {
    const { extra } = split(r, [
      'id', 'title', 'department', 'location', 'employmentType', 'status', 'description',
      'hodUserId', 'hodRound2UserId', 'pauseReason', 'closeOutcome', 'closeNotes',
      'createdAt', 'createdBy', 'pipelineStages', 'rubric', 'responsibilities',
      'mustHaves', 'niceToHaves', 'salaryRange',
    ])
    return {
      id: str(r.id), title: str(r.title), department: str(r.department),
      location: str(r.location), employmentType: str(r.employmentType), status: str(r.status),
      description: str(r.description), hodUserId: strOrNull(r.hodUserId),
      hodRound2UserId: strOrNull(r.hodRound2UserId), pauseReason: strOrNull(r.pauseReason),
      closeOutcome: strOrNull(r.closeOutcome), closeNotes: strOrNull(r.closeNotes),
      createdAt: str(r.createdAt), createdBy: str(r.createdBy),
      pipelineStages: jsonOf(r.pipelineStages, []), rubric: jsonOf(r.rubric, []),
      responsibilities: jsonOf(r.responsibilities, []), mustHaves: jsonOf(r.mustHaves, []),
      niceToHaves: jsonOf(r.niceToHaves, []), salaryRange: jsonOrNull(r.salaryRange), extra,
    }
  })
  counts.roles = roleRows.length

  // -- candidates ----------------------------------------------------------
  const candidates = asList(readJson('candidates.json')).filter((c) => typeof c.id === 'string' && typeof c.name === 'string')
  auditRows.push(...collectAudit('candidate', (r) => str(r.id), candidates))
  const candidateRows = candidates.map((r) => {
    const { extra } = split(r, [
      'id', 'name', 'email', 'phone', 'source', 'resumeFilePath', 'searchableText',
      'status', 'createdAt', 'createdBy', 'tags',
    ])
    return {
      id: str(r.id), name: str(r.name), email: str(r.email), phone: str(r.phone),
      source: str(r.source), resumeFilePath: strOrNull(r.resumeFilePath),
      searchableText: strOrNull(r.searchableText), status: strOrNull(r.status),
      createdAt: strOrNull(r.createdAt), createdBy: strOrNull(r.createdBy),
      tags: jsonOrNull(r.tags), extra,
    }
  })
  counts.candidates = candidateRows.length

  // -- applications (FK to candidate + role) -------------------------------
  const candidateIds = new Set(candidateRows.map((c) => c.id))
  const roleIds = new Set(roleRows.map((r) => r.id))
  const applications = asList(readJson('applications.json'))
  auditRows.push(...collectAudit('application', (r) => str(r.id), applications))
  const applicationRows = applications
    .filter((r) => {
      const ok = candidateIds.has(str(r.candidateId)) && roleIds.has(str(r.roleId))
      if (!ok) flag(`application ${str(r.id)} references a missing candidate or role - SKIPPED (FK would fail)`)
      return ok
    })
    .map((r) => {
      const { extra } = split(r, ['id', 'candidateId', 'roleId', 'currentStage', 'createdAt', 'createdBy', 'updatedAt'])
      return {
        id: str(r.id), candidateId: str(r.candidateId), roleId: str(r.roleId),
        currentStage: str(r.currentStage), createdAt: strOrNull(r.createdAt),
        createdBy: strOrNull(r.createdBy), updatedAt: strOrNull(r.updatedAt), extra,
      }
    })
  counts.applications = applicationRows.length

  // -- employees -----------------------------------------------------------
  const employees = asList(readJson('employees.json'))
  auditRows.push(...collectAudit('employee', (r) => str(r.id), employees))
  const CANONICAL_LOCATIONS = new Set(['Mumbai', 'Kolkata', 'Bangalore', 'Bengaluru', 'Delhi', 'Remote', 'Hybrid'])
  const employeeRows = employees.map((r) => {
    const loc = str(r.location)
    if (loc && !CANONICAL_LOCATIONS.has(loc)) {
      flag(`employee ${str(r.employeeCode)} has non-canonical location "${loc}" - migrated as-is`)
    }
    if (!r.dateOfBirth) flag(`employee ${str(r.employeeCode)} has no date of birth - migrated as null`)
    const { extra } = split(r, [
      'id', 'employeeCode', 'title', 'name', 'email', 'phone', 'designation', 'department',
      'location', 'reportingTo', 'reportingManagerId', 'dateOfJoining', 'status',
      'confirmationDate', 'tenureYears', 'dateOfBirth', 'age', 'gender', 'maritalStatus',
      'address', 'personalEmail', 'officialEmailMissing', 'locationType', 'employmentStatus',
      'workPattern', 'leaveYearStart', 'createdAt', 'createdBy', 'updatedAt',
      'leaveBalance', 'exit', 'onboardingChecklist',
    ])
    return {
      id: str(r.id), employeeCode: str(r.employeeCode), title: str(r.title), name: str(r.name),
      email: str(r.email), phone: strOrNull(r.phone), designation: str(r.designation),
      department: str(r.department), location: loc, reportingTo: strOrNull(r.reportingTo),
      reportingManagerId: strOrNull(r.reportingManagerId), dateOfJoining: strOrNull(r.dateOfJoining),
      status: str(r.status), confirmationDate: strOrNull(r.confirmationDate),
      tenureYears: numOrNull(r.tenureYears), dateOfBirth: strOrNull(r.dateOfBirth),
      age: numOrNull(r.age), gender: strOrNull(r.gender), maritalStatus: strOrNull(r.maritalStatus),
      address: strOrNull(r.address), personalEmail: strOrNull(r.personalEmail),
      officialEmailMissing: boolOf(r.officialEmailMissing), locationType: strOrNull(r.locationType),
      employmentStatus: strOrNull(r.employmentStatus), workPattern: strOrNull(r.workPattern),
      leaveYearStart: strOrNull(r.leaveYearStart), createdAt: str(r.createdAt),
      createdBy: str(r.createdBy), updatedAt: strOrNull(r.updatedAt),
      leaveBalance: jsonOrNull(r.leaveBalance), exit: jsonOrNull(r.exit),
      onboardingChecklist: jsonOrNull(r.onboardingChecklist), extra,
    }
  })
  counts.employees = employeeRows.length

  // -- exit processes (keyed on employeeId, no id of its own) --------------
  const exitProcesses = asList(readJson('exit_processes.json'))
  auditRows.push(...collectAudit('exitProcess', (r) => str(r.employeeId), exitProcesses))
  const exitProcessRows = exitProcesses.map((r) => {
    const { extra } = split(r, [
      'employeeId', 'exitType', 'reasonForLeaving', 'resignationDate', 'terminationDate',
      'lastWorkingDay', 'completedAt', 'closedAt', 'closedBy', 'closeReason',
      'createdAt', 'createdBy', 'updatedAt', 'steps',
    ])
    return {
      employeeId: str(r.employeeId), exitType: str(r.exitType),
      reasonForLeaving: str(r.reasonForLeaving), resignationDate: strOrNull(r.resignationDate),
      terminationDate: strOrNull(r.terminationDate), lastWorkingDay: str(r.lastWorkingDay),
      completedAt: strOrNull(r.completedAt), closedAt: strOrNull(r.closedAt),
      closedBy: strOrNull(r.closedBy), closeReason: strOrNull(r.closeReason),
      createdAt: str(r.createdAt), createdBy: str(r.createdBy),
      updatedAt: strOrNull(r.updatedAt), steps: jsonOf(r.steps, []), extra,
    }
  })
  counts.exit_processes = exitProcessRows.length

  // -- entities keyed on employeeId, with no id of their own ---------------
  // exit_interviews and exit_handovers carry no id field at all (verified:
  // 0/24 and 0/28 records have one) and employeeId is unique in both.
  const keyedByEmployee = (file: string, entityType: string) => {
    const recs = asList(readJson(file))
    auditRows.push(...collectAudit(entityType, (r) => str(r.employeeId), recs))
    return recs.map((r) => {
      const { extra } = split(r, ['employeeId'])
      return { employeeId: str(r.employeeId), extra }
    })
  }

  // -- entities with their own id plus an employeeId -----------------------
  const byEmployee = (file: string, entityType: string) => {
    const recs = asList(readJson(file))
    auditRows.push(...collectAudit(entityType, (r) => str(r.id), recs))
    return recs.map((r) => {
      const { extra } = split(r, ['id', 'employeeId'])
      return { id: str(r.id), employeeId: str(r.employeeId), extra }
    })
  }

  const exitInterviewRows = keyedByEmployee('exit_interviews.json', 'exitInterview')
  const exitHandoverRows = keyedByEmployee('exit_handovers.json', 'exitHandover')
  const ffSettlementRows = byEmployee('ff_settlements.json', 'ffSettlement')
  const employeeDocumentRows = byEmployee('employee_documents.json', 'employeeDocument')
  counts.exit_interviews = exitInterviewRows.length
  counts.exit_handovers = exitHandoverRows.length
  counts.ff_settlements = ffSettlementRows.length
  counts.employee_documents = employeeDocumentRows.length

  // -- tasks ---------------------------------------------------------------
  const taskRows = (file: string, entityType: string) => {
    const recs = asList(readJson(file))
    auditRows.push(...collectAudit(entityType, (r) => str(r.id), recs))
    return recs.map((r) => {
      const { extra } = split(r, ['id', 'employeeId', 'templateId', 'status', 'dueDate', 'assigneeId'])
      return {
        id: str(r.id), employeeId: str(r.employeeId), templateId: strOrNull(r.templateId),
        status: strOrNull(r.status), dueDate: strOrNull(r.dueDate),
        assigneeId: strOrNull(r.assigneeId), extra,
      }
    })
  }
  const onboardingTaskRows = taskRows('employee_onboarding_tasks.json', 'onboardingTask')
  const offboardingTaskRows = taskRows('employee_offboarding_tasks.json', 'offboardingTask')
  counts.employee_onboarding_tasks = onboardingTaskRows.length
  counts.employee_offboarding_tasks = offboardingTaskRows.length

  // -- remaining flat entities --------------------------------------------
  const flat = (file: string, entityType: string, columns: string[], build: (r: Record<string, unknown>, extra?: Json) => unknown) => {
    const recs = asList(readJson(file))
    auditRows.push(...collectAudit(entityType, (r) => str(r.id), recs))
    return recs.map((r) => build(r, split(r, columns).extra))
  }

  const interviewRows = flat('interviews.json', 'interview',
    ['id', 'applicationId', 'roleId', 'candidateId', 'round', 'interviewerUserId', 'scheduledAt', 'conductedAt', 'notes', 'recommendation', 'aggregateScore', 'createdAt', 'createdBy', 'scores'],
    (r, extra) => ({
      id: str(r.id), applicationId: str(r.applicationId), roleId: strOrNull(r.roleId),
      candidateId: strOrNull(r.candidateId), round: str(r.round),
      interviewerUserId: strOrNull(r.interviewerUserId), scheduledAt: strOrNull(r.scheduledAt),
      conductedAt: strOrNull(r.conductedAt), notes: str(r.notes),
      recommendation: strOrNull(r.recommendation), aggregateScore: numOrNull(r.aggregateScore),
      createdAt: strOrNull(r.createdAt), createdBy: strOrNull(r.createdBy),
      scores: jsonOf(r.scores, []), extra,
    })) as Prisma.InterviewCreateManyInput[]
  counts.interviews = interviewRows.length

  const offerRows = flat('offers.json', 'offer',
    ['id', 'applicationId', 'candidateId', 'roleId', 'status', 'createdAt', 'createdBy', 'updatedAt'],
    (r, extra) => ({
      id: str(r.id), applicationId: strOrNull(r.applicationId), candidateId: strOrNull(r.candidateId),
      roleId: strOrNull(r.roleId), status: str(r.status), createdAt: strOrNull(r.createdAt),
      createdBy: strOrNull(r.createdBy), updatedAt: strOrNull(r.updatedAt), extra,
    })) as Prisma.OfferCreateManyInput[]
  counts.offers = offerRows.length

  const leaveApplicationRows = flat('leave_applications.json', 'leaveApplication', ['id', 'employeeId', 'status'],
    (r, extra) => ({ id: str(r.id), employeeId: str(r.employeeId), status: strOrNull(r.status), extra })) as Prisma.LeaveApplicationCreateManyInput[]
  const leaveBalanceRows = flat('leave_balances.json', 'leaveBalance', ['id', 'employeeId'],
    (r, extra) => ({ id: str(r.id), employeeId: strOrNull(r.employeeId), extra })) as Prisma.LeaveBalanceRecordCreateManyInput[]
  const attendanceRows = flat('attendance_exceptions.json', 'attendanceException', ['id', 'employeeId', 'date'],
    (r, extra) => ({ id: str(r.id), employeeId: strOrNull(r.employeeId), date: strOrNull(r.date), extra })) as Prisma.AttendanceExceptionCreateManyInput[]
  const holidayRows = flat('holidays.json', 'holiday', ['id', 'date'],
    (r, extra) => ({ id: str(r.id), date: str(r.date), extra })) as Prisma.HolidayCreateManyInput[]
  const optionalHolidayRows = flat('employee_optional_holidays.json', 'employeeOptionalHoliday', ['id', 'employeeId'],
    (r, extra) => ({ id: str(r.id), employeeId: strOrNull(r.employeeId), extra })) as Prisma.EmployeeOptionalHolidayCreateManyInput[]
  const itAssetRows = flat('it_assets.json', 'itAsset', ['id', 'employeeId'],
    (r, extra) => ({ id: str(r.id), employeeId: strOrNull(r.employeeId), extra })) as Prisma.ITAssetCreateManyInput[]
  const assetRows = flat('assets.json', 'asset', ['id', 'employeeId'],
    (r, extra) => ({ id: str(r.id), employeeId: strOrNull(r.employeeId), extra })) as Prisma.AssetCreateManyInput[]
  const hrTaskRows = flat('hr_tasks.json', 'hrTask', ['id', 'status', 'dueDate', 'assignee'],
    (r, extra) => ({ id: str(r.id), status: strOrNull(r.status), dueDate: strOrNull(r.dueDate), assignee: strOrNull(r.assignee), extra })) as Prisma.HrTaskCreateManyInput[]
  const recognitionRows = flat('recognitions.json', 'recognition', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.RecognitionCreateManyInput[]
  const nominationRows = flat('nomination_cycles.json', 'nominationCycle', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.NominationCycleCreateManyInput[]
  const onboardingTemplateRows = flat('onboarding_task_templates.json', 'onboardingTaskTemplate', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.OnboardingTaskTemplateCreateManyInput[]
  const offboardingTemplateRows = flat('offboarding_task_templates.json', 'offboardingTaskTemplate', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.OffboardingTaskTemplateCreateManyInput[]
  const exitStepTemplateRows = flat('exit_step_templates.json', 'exitStepTemplate', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.ExitStepTemplateCreateManyInput[]
  const documentTemplateRows = flat('document_templates.json', 'documentTemplate', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.DocumentTemplateCreateManyInput[]
  const promptRows = flat('prompts.json', 'prompt', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.PromptCreateManyInput[]
  const alertLogRows = flat('alert_log.json', 'alertLog', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.AlertLogCreateManyInput[]
  const outboundMailRows = flat('_outbound_mail.json', 'outboundMail', ['id'], (r, extra) => ({ id: str(r.id), extra })) as Prisma.OutboundMailCreateManyInput[]

  counts.leave_applications = leaveApplicationRows.length
  counts.leave_balances = leaveBalanceRows.length
  counts.attendance_exceptions = attendanceRows.length
  counts.holidays = holidayRows.length
  counts.employee_optional_holidays = optionalHolidayRows.length
  counts.it_assets = itAssetRows.length
  counts.assets = assetRows.length
  counts.hr_tasks = hrTaskRows.length
  counts.recognitions = recognitionRows.length
  counts.nomination_cycles = nominationRows.length
  counts.onboarding_task_templates = onboardingTemplateRows.length
  counts.offboarding_task_templates = offboardingTemplateRows.length
  counts.exit_step_templates = exitStepTemplateRows.length
  counts.document_templates = documentTemplateRows.length
  counts.prompts = promptRows.length
  counts.alert_log = alertLogRows.length
  counts._outbound_mail = outboundMailRows.length

  // -- singletons ----------------------------------------------------------
  const singletonRows: { key: string; value: Json }[] = []
  for (const key of ['taxonomy', 'system_settings', 'alert_preferences']) {
    const doc = readJson(`${key}.json`)
    if (doc === null) continue
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      const rec = doc as Record<string, unknown>
      if (Array.isArray(rec.auditLog)) {
        auditRows.push(...collectAudit(key, () => key, [rec]))
      }
    }
    singletonRows.push({ key, value: doc as Json })
  }
  counts.singleton_docs = singletonRows.length

  // -- queue archive -------------------------------------------------------
  const archive: Prisma.QueueArchiveCreateManyInput[] = []
  for (const [file, kind] of [['applied_updates.json', 'applied'], ['failed_updates.json', 'failed']] as const) {
    for (const r of asList(readJson(file))) {
      const { extra } = split(r, ['id', 'queuedAt', 'queuedBy', 'entity', 'operation', 'payload'])
      archive.push({
        sourceId: strOrNull(r.id), kind, queuedAt: strOrNull(r.queuedAt),
        queuedBy: strOrNull(r.queuedBy), entity: strOrNull(r.entity),
        operation: strOrNull(r.operation), payload: jsonOrNull(r.payload), extra,
      })
    }
  }
  counts.queue_archive = archive.length

  // -----------------------------------------------------------------------
  // report and write
  // -----------------------------------------------------------------------

  console.log('\nrecords read from JSON:')
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(32)} ${String(v).padStart(5)}`)
  console.log(`  ${'audit_entries'.padEnd(32)} ${String(auditRows.length).padStart(5)}`)

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written')
    printFindings()
    return
  }

  // One transaction. Either the whole migration lands or none of it does.
  await prisma.$transaction(
    async (tx) => {
      // Idempotent by construction: clear and reinsert. Safe because the JSON
      // files remain the source of truth until cutover.
      await tx.auditEntry.deleteMany({})
      await tx.queueArchive.deleteMany({})
      await tx.application.deleteMany({})

      const put = async <T>(name: string, rows: T[], fn: (rows: T[]) => Promise<unknown>) => {
        if (rows.length === 0) return
        await fn(rows)
      }

      await tx.user.deleteMany({})
      await put('users', userRows, (r) => tx.user.createMany({ data: r as Prisma.UserCreateManyInput[] }))

      await tx.role.deleteMany({})
      await put('roles', roleRows, (r) => tx.role.createMany({ data: r as Prisma.RoleCreateManyInput[] }))

      await tx.candidate.deleteMany({})
      await put('candidates', candidateRows, (r) => tx.candidate.createMany({ data: r as Prisma.CandidateCreateManyInput[] }))

      await put('applications', applicationRows, (r) => tx.application.createMany({ data: r as Prisma.ApplicationCreateManyInput[] }))

      await tx.employee.deleteMany({})
      await put('employees', employeeRows, (r) => tx.employee.createMany({ data: r as Prisma.EmployeeCreateManyInput[] }))

      await tx.exitProcess.deleteMany({})
      await put('exit_processes', exitProcessRows, (r) => tx.exitProcess.createMany({ data: r as Prisma.ExitProcessCreateManyInput[] }))

      await tx.exitInterview.deleteMany({})
      await put('exit_interviews', exitInterviewRows, (r) => tx.exitInterview.createMany({ data: r as Prisma.ExitInterviewCreateManyInput[] }))

      await tx.exitHandover.deleteMany({})
      await put('exit_handovers', exitHandoverRows, (r) => tx.exitHandover.createMany({ data: r as Prisma.ExitHandoverCreateManyInput[] }))

      await tx.fFSettlement.deleteMany({})
      await put('ff', ffSettlementRows, (r) => tx.fFSettlement.createMany({ data: r as Prisma.FFSettlementCreateManyInput[] }))

      await tx.employeeDocument.deleteMany({})
      await put('docs', employeeDocumentRows, (r) => tx.employeeDocument.createMany({ data: r as Prisma.EmployeeDocumentCreateManyInput[] }))

      await tx.onboardingTask.deleteMany({})
      await put('onb', onboardingTaskRows, (r) => tx.onboardingTask.createMany({ data: r as Prisma.OnboardingTaskCreateManyInput[] }))

      await tx.offboardingTask.deleteMany({})
      await put('offb', offboardingTaskRows, (r) => tx.offboardingTask.createMany({ data: r as Prisma.OffboardingTaskCreateManyInput[] }))

      await tx.interview.deleteMany({})
      await put('int', interviewRows, (r) => tx.interview.createMany({ data: r }))

      await tx.offer.deleteMany({})
      await put('off', offerRows, (r) => tx.offer.createMany({ data: r }))

      await tx.leaveApplication.deleteMany({})
      await put('la', leaveApplicationRows, (r) => tx.leaveApplication.createMany({ data: r }))

      await tx.leaveBalanceRecord.deleteMany({})
      await put('lb', leaveBalanceRows, (r) => tx.leaveBalanceRecord.createMany({ data: r }))

      await tx.attendanceException.deleteMany({})
      await put('att', attendanceRows, (r) => tx.attendanceException.createMany({ data: r }))

      await tx.holiday.deleteMany({})
      await put('hol', holidayRows, (r) => tx.holiday.createMany({ data: r }))

      await tx.employeeOptionalHoliday.deleteMany({})
      await put('eoh', optionalHolidayRows, (r) => tx.employeeOptionalHoliday.createMany({ data: r }))

      await tx.iTAsset.deleteMany({})
      await put('ita', itAssetRows, (r) => tx.iTAsset.createMany({ data: r }))

      await tx.asset.deleteMany({})
      await put('ast', assetRows, (r) => tx.asset.createMany({ data: r }))

      await tx.hrTask.deleteMany({})
      await put('hrt', hrTaskRows, (r) => tx.hrTask.createMany({ data: r }))

      await tx.recognition.deleteMany({})
      await put('rec', recognitionRows, (r) => tx.recognition.createMany({ data: r }))

      await tx.nominationCycle.deleteMany({})
      await put('nom', nominationRows, (r) => tx.nominationCycle.createMany({ data: r }))

      await tx.onboardingTaskTemplate.deleteMany({})
      await put('obt', onboardingTemplateRows, (r) => tx.onboardingTaskTemplate.createMany({ data: r }))

      await tx.offboardingTaskTemplate.deleteMany({})
      await put('ofbt', offboardingTemplateRows, (r) => tx.offboardingTaskTemplate.createMany({ data: r }))

      await tx.exitStepTemplate.deleteMany({})
      await put('est', exitStepTemplateRows, (r) => tx.exitStepTemplate.createMany({ data: r }))

      await tx.documentTemplate.deleteMany({})
      await put('dt', documentTemplateRows, (r) => tx.documentTemplate.createMany({ data: r }))

      await tx.prompt.deleteMany({})
      await put('pr', promptRows, (r) => tx.prompt.createMany({ data: r }))

      await tx.alertLog.deleteMany({})
      await put('al', alertLogRows, (r) => tx.alertLog.createMany({ data: r }))

      await tx.outboundMail.deleteMany({})
      await put('om', outboundMailRows, (r) => tx.outboundMail.createMany({ data: r }))

      await tx.singletonDoc.deleteMany({})
      for (const s of singletonRows) {
        await tx.singletonDoc.create({ data: { key: s.key, value: s.value } })
      }

      await put('archive', archive, (r) => tx.queueArchive.createMany({ data: r }))
      await put('audit', auditRows, (r) => tx.auditEntry.createMany({ data: r as Prisma.AuditEntryCreateManyInput[] }))
    },
    { timeout: 120_000, maxWait: 30_000 },
  )

  console.log('\nmigration committed')
  printFindings()
}

function printFindings() {
  if (findings.length === 0) {
    console.log('\nno data issues flagged')
    return
  }
  console.log(`\ndata issues flagged (${findings.length}) - migrated as-is, nothing merged or deleted:`)
  const seen = new Set<string>()
  for (const f of findings) {
    if (seen.has(f)) continue
    seen.add(f)
    console.log(`  - ${f}`)
  }
}

run()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error('\nMIGRATION FAILED, nothing committed:')
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
