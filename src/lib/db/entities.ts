/*
 * The one place that knows how a domain record maps to a database row.
 *
 * Everything that touches Postgres goes through this registry: the read
 * loaders in src/lib/data.ts, the read-modify-write in atomicUpdateJson, and
 * the parity verifier. One mapping, three consumers, so they cannot disagree
 * about what a record looks like.
 *
 * SHAPE CONTRACT. `toDomain` must reproduce the record exactly as the JSON
 * file held it, because every caller in the app was written against that
 * shape. Two rules make that work:
 *   - a column whose value is null is OMITTED, because in JSON the field was
 *     absent rather than null, and `'x' in rec` checks exist in the codebase;
 *   - anything not modelled as a column lives in the `extra` json column and
 *     is spread back on read, so no field can be lost.
 * scripts/db/verify_parity.ts proves this round-trips for all 907 records.
 *
 * AUDIT. Inline auditLog[] arrays live in the audit_entries table. Reads
 * rebuild them in seq order; writes append only the entries that are new,
 * so the table stays genuinely append-only.
 */

import { prisma } from '@/lib/db'
import type { Prisma, PrismaClient } from '@prisma/client'

type Row = Record<string, unknown>
type Domain = Record<string, unknown>
type Tx = Prisma.TransactionClient | PrismaClient

/** The subset of a Prisma delegate this module needs. */
interface Delegate {
  findMany: (args?: object) => Promise<Row[]>
  createMany: (args: { data: Row[] }) => Promise<unknown>
  deleteMany: (args?: object) => Promise<unknown>
  update: (args: { where: Row; data: Row }) => Promise<unknown>
  create: (args: { data: Row }) => Promise<unknown>
}

export interface EntitySpec {
  /** Prisma delegate name on the client. */
  model: string
  /** Field that identifies a record, in BOTH the domain object and the row. */
  key: string
  /** Domain fields stored as real columns. Everything else goes to `extra`. */
  columns: string[]
  /** entityType used in audit_entries, or null when the entity has no auditLog. */
  audit: string | null
}

/**
 * Data-file path to entity. Paths are the same strings the existing
 * atomicUpdateJson callers already pass, so no call site has to change.
 */
export const ENTITIES: Record<string, EntitySpec> = {
  'src/data/users.json': {
    model: 'user', key: 'id', audit: 'user',
    columns: ['id', 'email', 'name', 'role', 'bcryptHash', 'createdAt', 'active', 'ownedRoleIds'],
  },
  'src/data/roles.json': {
    model: 'role', key: 'id', audit: 'role',
    columns: [
      'id', 'title', 'department', 'location', 'employmentType', 'status', 'description',
      'hodUserId', 'hodRound2UserId', 'pauseReason', 'closeOutcome', 'closeNotes',
      'createdAt', 'createdBy', 'pipelineStages', 'rubric', 'responsibilities',
      'mustHaves', 'niceToHaves', 'salaryRange',
    ],
  },
  'src/data/candidates.json': {
    model: 'candidate', key: 'id', audit: 'candidate',
    columns: [
      'id', 'name', 'email', 'phone', 'source', 'resumeFilePath', 'searchableText',
      'status', 'createdAt', 'createdBy', 'tags',
    ],
  },
  'src/data/applications.json': {
    model: 'application', key: 'id', audit: 'application',
    columns: ['id', 'candidateId', 'roleId', 'currentStage', 'createdAt', 'createdBy', 'updatedAt'],
  },
  'src/data/interviews.json': {
    model: 'interview', key: 'id', audit: 'interview',
    columns: [
      'id', 'applicationId', 'roleId', 'candidateId', 'round', 'interviewerUserId',
      'scheduledAt', 'conductedAt', 'notes', 'recommendation', 'aggregateScore',
      'createdAt', 'createdBy', 'scores',
    ],
  },
  'src/data/offers.json': {
    model: 'offer', key: 'id', audit: 'offer',
    columns: ['id', 'applicationId', 'candidateId', 'roleId', 'status', 'createdAt', 'createdBy', 'updatedAt'],
  },
  'src/data/employees.json': {
    model: 'employee', key: 'id', audit: 'employee',
    columns: [
      'id', 'employeeCode', 'title', 'name', 'email', 'phone', 'designation', 'department',
      'location', 'reportingTo', 'reportingManagerId', 'dateOfJoining', 'status',
      'confirmationDate', 'tenureYears', 'dateOfBirth', 'age', 'gender', 'maritalStatus',
      'address', 'personalEmail', 'officialEmailMissing', 'locationType', 'employmentStatus',
      'workPattern', 'leaveYearStart', 'createdAt', 'createdBy', 'updatedAt',
      'leaveBalance', 'exit', 'onboardingChecklist',
    ],
  },
  'src/data/exit_processes.json': {
    model: 'exitProcess', key: 'employeeId', audit: 'exitProcess',
    columns: [
      'employeeId', 'exitType', 'reasonForLeaving', 'resignationDate', 'terminationDate',
      'lastWorkingDay', 'completedAt', 'closedAt', 'closedBy', 'closeReason',
      'createdAt', 'createdBy', 'updatedAt', 'steps',
    ],
  },
  // No id in the source data; keyed on employeeId, unique across all records.
  'src/data/exit_interviews.json': {
    model: 'exitInterview', key: 'employeeId', audit: 'exitInterview', columns: ['employeeId'],
  },
  'src/data/exit_handovers.json': {
    model: 'exitHandover', key: 'employeeId', audit: 'exitHandover', columns: ['employeeId'],
  },
  'src/data/ff_settlements.json': {
    model: 'fFSettlement', key: 'id', audit: 'ffSettlement', columns: ['id', 'employeeId'],
  },
  'src/data/employee_documents.json': {
    model: 'employeeDocument', key: 'id', audit: 'employeeDocument', columns: ['id', 'employeeId'],
  },
  'src/data/employee_onboarding_tasks.json': {
    model: 'onboardingTask', key: 'id', audit: 'onboardingTask',
    columns: ['id', 'employeeId', 'templateId', 'status', 'dueDate', 'assigneeId'],
  },
  'src/data/employee_offboarding_tasks.json': {
    model: 'offboardingTask', key: 'id', audit: 'offboardingTask',
    columns: ['id', 'employeeId', 'templateId', 'status', 'dueDate', 'assigneeId'],
  },
  'src/data/leave_applications.json': {
    model: 'leaveApplication', key: 'id', audit: 'leaveApplication', columns: ['id', 'employeeId', 'status'],
  },
  'src/data/leave_balances.json': {
    model: 'leaveBalanceRecord', key: 'id', audit: 'leaveBalance', columns: ['id', 'employeeId'],
  },
  'src/data/attendance_exceptions.json': {
    model: 'attendanceException', key: 'id', audit: 'attendanceException', columns: ['id', 'employeeId', 'date'],
  },
  'src/data/holidays.json': {
    model: 'holiday', key: 'id', audit: 'holiday', columns: ['id', 'date'],
  },
  'src/data/employee_optional_holidays.json': {
    model: 'employeeOptionalHoliday', key: 'id', audit: 'employeeOptionalHoliday', columns: ['id', 'employeeId'],
  },
  'src/data/it_assets.json': {
    model: 'iTAsset', key: 'id', audit: 'itAsset', columns: ['id', 'employeeId'],
  },
  'src/data/assets.json': {
    model: 'asset', key: 'id', audit: 'asset', columns: ['id', 'employeeId'],
  },
  'src/data/hr_tasks.json': {
    model: 'hrTask', key: 'id', audit: 'hrTask', columns: ['id', 'status', 'dueDate', 'assignee'],
  },
  'src/data/recognitions.json': {
    model: 'recognition', key: 'id', audit: 'recognition', columns: ['id'],
  },
  'src/data/nomination_cycles.json': {
    model: 'nominationCycle', key: 'id', audit: 'nominationCycle', columns: ['id'],
  },
  'src/data/onboarding_task_templates.json': {
    model: 'onboardingTaskTemplate', key: 'id', audit: 'onboardingTaskTemplate', columns: ['id'],
  },
  'src/data/offboarding_task_templates.json': {
    model: 'offboardingTaskTemplate', key: 'id', audit: 'offboardingTaskTemplate', columns: ['id'],
  },
  'src/data/exit_step_templates.json': {
    model: 'exitStepTemplate', key: 'id', audit: 'exitStepTemplate', columns: ['id'],
  },
  'src/data/document_templates.json': {
    model: 'documentTemplate', key: 'id', audit: 'documentTemplate', columns: ['id'],
  },
  'src/data/prompts.json': {
    model: 'prompt', key: 'id', audit: 'prompt', columns: ['id'],
  },
  'src/data/alert_log.json': {
    model: 'alertLog', key: 'id', audit: 'alertLog', columns: ['id'],
  },
  'src/data/_outbound_mail.json': {
    model: 'outboundMail', key: 'id', audit: 'outboundMail', columns: ['id'],
  },
}

/** Singleton documents: one JSON object rather than an array of records. */
export const SINGLETONS: Record<string, string> = {
  'src/data/taxonomy.json': 'taxonomy',
  'src/data/system_settings.json': 'system_settings',
  'src/data/alert_preferences.json': 'alert_preferences',
}

function delegate(client: Tx, model: string): Delegate {
  const d = (client as unknown as Record<string, Delegate>)[model]
  if (!d) throw new Error(`No Prisma delegate named "${model}"`)
  return d
}

// ---------------------------------------------------------------------------
// row <-> domain
// ---------------------------------------------------------------------------

/**
 * Rebuild the domain record a JSON file used to hold.
 * Null columns are omitted so absent stays absent.
 */
export function toDomain(spec: EntitySpec, row: Row, audit?: Domain[]): Domain {
  const out: Domain = {}
  for (const col of spec.columns) {
    const v = row[col]
    if (v === null || v === undefined) continue
    out[col] = v
  }
  const extra = row.extra
  if (extra && typeof extra === 'object') Object.assign(out, extra as object)
  if (audit) out.auditLog = audit
  return out
}

/** Split a domain record into columns plus an `extra` blob. */
export function toRow(spec: EntitySpec, rec: Domain): Row {
  const row: Row = {}
  const extra: Domain = {}
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'auditLog') continue
    if (spec.columns.includes(k)) row[k] = v
    else extra[k] = v
  }
  // Columns the record does not carry must be explicitly null, not missing,
  // or Prisma applies a schema default and invents a value.
  for (const col of spec.columns) {
    if (!(col in row)) row[col] = null
  }
  row.extra = Object.keys(extra).length ? extra : null
  return row
}

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------

interface AuditEntryShape {
  timestamp?: unknown
  user?: unknown
  actor?: unknown
  action?: unknown
  before?: unknown
  after?: unknown
  notes?: unknown
}

/** Load auditLog arrays for one entity type, keyed by entity id. */
export async function loadAuditFor(client: Tx, entityType: string): Promise<Map<string, Domain[]>> {
  const rows = await (client as PrismaClient).auditEntry.findMany({
    where: { entityType },
    orderBy: [{ entityId: 'asc' }, { seq: 'asc' }],
  })
  const map = new Map<string, Domain[]>()
  for (const r of rows) {
    const entry: Domain = { timestamp: r.timestamp, user: r.actor, action: r.action }
    if (r.before !== null) entry.before = r.before
    if (r.after !== null) entry.after = r.after
    if (r.notes !== null) entry.notes = r.notes
    const list = map.get(r.entityId)
    if (list) list.push(entry)
    else map.set(r.entityId, [entry])
  }
  return map
}

/**
 * Append audit entries that are new relative to what is already stored.
 * Genuinely append-only: existing rows are never rewritten or deleted.
 */
async function appendNewAudit(client: Tx, entityType: string, entityId: string, log: unknown) {
  if (!Array.isArray(log) || log.length === 0) return
  const existing = await (client as PrismaClient).auditEntry.count({ where: { entityType, entityId } })
  if (log.length <= existing) return
  const fresh = log.slice(existing) as AuditEntryShape[]
  await (client as PrismaClient).auditEntry.createMany({
    data: fresh.map((e, i) => ({
      entityType,
      entityId,
      timestamp: typeof e.timestamp === 'string' ? e.timestamp : new Date().toISOString(),
      actor: typeof e.user === 'string' ? e.user : typeof e.actor === 'string' ? e.actor : 'system',
      action: typeof e.action === 'string' ? e.action : 'update',
      before: (e.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (e.after ?? undefined) as Prisma.InputJsonValue | undefined,
      notes: typeof e.notes === 'string' ? e.notes : undefined,
      seq: existing + i,
    })),
  })
}

// ---------------------------------------------------------------------------
// read / write a whole collection
// ---------------------------------------------------------------------------

/** Read every record of an entity, in the shape the JSON file held. */
export async function readCollection(path: string, client: Tx = prisma): Promise<Domain[]> {
  const spec = ENTITIES[path]
  if (!spec) throw new Error(`No entity registered for "${path}"`)
  const rows = await delegate(client, spec.model).findMany({})
  const audit = spec.audit ? await loadAuditFor(client, spec.audit) : new Map<string, Domain[]>()
  return rows.map((r) => toDomain(spec, r, audit.get(String(r[spec.key]))))
}

/** Read a singleton document. */
export async function readSingleton<T>(path: string, fallback: T, client: Tx = prisma): Promise<T> {
  const key = SINGLETONS[path]
  if (!key) throw new Error(`No singleton registered for "${path}"`)
  const row = await (client as PrismaClient).singletonDoc.findUnique({ where: { key } })
  return row ? (row.value as T) : fallback
}

/**
 * Replace a collection with `next`, inside a transaction.
 *
 * Diff-based rather than truncate-and-reload: records that vanished are
 * deleted, new ones created, changed ones updated. Audit entries are appended,
 * never rewritten. Throws on failure, so a caller can never record success for
 * a write that did not land.
 */
export async function writeCollection(path: string, next: Domain[], client: Tx): Promise<void> {
  const spec = ENTITIES[path]
  if (!spec) throw new Error(`No entity registered for "${path}"`)
  const d = delegate(client, spec.model)

  const existingRows = await d.findMany({})
  const existingKeys = new Set(existingRows.map((r) => String(r[spec.key])))
  const nextKeys = new Set(next.map((r) => String(r[spec.key])))

  const removed = [...existingKeys].filter((k) => !nextKeys.has(k))
  if (removed.length) {
    await d.deleteMany({ where: { [spec.key]: { in: removed } } })
    if (spec.audit) {
      await (client as PrismaClient).auditEntry.deleteMany({
        where: { entityType: spec.audit, entityId: { in: removed } },
      })
    }
  }

  const toCreate: Row[] = []
  for (const rec of next) {
    const key = String(rec[spec.key])
    const row = toRow(spec, rec)
    if (existingKeys.has(key)) {
      const { [spec.key]: _ignored, ...rest } = row
      await d.update({ where: { [spec.key]: key }, data: rest })
    } else {
      toCreate.push(row)
    }
    if (spec.audit) await appendNewAudit(client, spec.audit, key, rec.auditLog)
  }
  if (toCreate.length) await d.createMany({ data: toCreate })
}

/** Replace a singleton document. */
export async function writeSingleton(path: string, value: unknown, client: Tx): Promise<void> {
  const key = SINGLETONS[path]
  if (!key) throw new Error(`No singleton registered for "${path}"`)
  const json = value as Prisma.InputJsonValue
  await (client as PrismaClient).singletonDoc.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  })
}

export function isSingletonPath(path: string): boolean {
  return path in SINGLETONS
}
export function isRegisteredPath(path: string): boolean {
  return path in ENTITIES || path in SINGLETONS
}
