/*
 * Exit cockpit helpers - the six-step exit process.
 *
 * Storage:
 *   - src/data/exit_step_templates.json : editable ordered default steps.
 *   - src/data/exit_processes.json      : one ExitProcess per exiting employee.
 *
 * All ExitProcess mutations write via atomicUpdateJson (NOT the queue), each
 * appending an auditLog entry. The employee.status -> 'Exited' flip stays on
 * the existing exit.initiate queue op. Pure helpers here so the engine
 * (instantiation, completion, migration merge, permissions) is unit-testable.
 *
 * Role gates (unchanged from the legacy offboarding surfaces):
 *   - HR + Admin: full view + edit + letter generation.
 *   - Leadership: read-only; financial steps (No Dues figures + F&F) hidden.
 *   - HOD: read-only and ONLY for their own direct reports; financial steps
 *     hidden; exit interview never visible (canViewExitInterview stays false).
 */

import fs from 'node:fs'
import path from 'node:path'
import { amountToWordsIndian } from './preOnboardingEmails/amountInWords'
import type { CompanyConfig } from './company'
import type {
  AuditEntry,
  Employee,
  ExitProcess,
  ExitProcessStep,
  ExitStepData,
  ExitStepKind,
  ExitStepStatus,
  ExitStepTemplate,
  ExitType,
  SessionClaims,
} from './types'

const TEMPLATES_FILE = path.join(process.cwd(), 'src', 'data', 'exit_step_templates.json')
const PROCESSES_FILE = path.join(process.cwd(), 'src', 'data', 'exit_processes.json')

function readJsonArray<T>(file: string): T[] {
  try {
    if (!fs.existsSync(file)) return []
    const text = fs.readFileSync(file, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function loadExitStepTemplates(): ExitStepTemplate[] {
  return readJsonArray<ExitStepTemplate>(TEMPLATES_FILE).sort((a, b) => a.order - b.order)
}

export function loadExitProcesses(): ExitProcess[] {
  return readJsonArray<ExitProcess>(PROCESSES_FILE)
}

export function findExitProcess(employeeId: string): ExitProcess | undefined {
  return loadExitProcesses().find((p) => p.employeeId === employeeId)
}

// --- Instantiation -------------------------------------------------------

/** A fresh step from a template - everything Not Started, no data. */
export function emptyStep(tpl: ExitStepTemplate): ExitProcessStep {
  return {
    templateId: tpl.id,
    name: tpl.name,
    kind: tpl.kind,
    isMandatory: tpl.isMandatory,
    status: 'Not Started',
    data: {},
    notes: '',
    completedAt: null,
    completedBy: null,
  }
}

export function instantiateSteps(templates: ExitStepTemplate[]): ExitProcessStep[] {
  return [...templates].sort((a, b) => a.order - b.order).map(emptyStep)
}

export interface CreateExitProcessInput {
  employee: Employee
  templates: ExitStepTemplate[]
  exitType: ExitType
  reasonForLeaving: string
  resignationDate: string | null
  terminationDate: string | null
  lastWorkingDay: string
  by: string
  now?: string
}

/** Build a new ExitProcess with the six steps instantiated and the first
 *  step (Exit initiated) already marked Completed - initiation IS that step. */
export function createExitProcessRecord(input: CreateExitProcessInput): ExitProcess {
  const now = input.now ?? new Date().toISOString()
  const steps = instantiateSteps(input.templates)
  for (const s of steps) {
    if (s.kind === 'initiate') {
      s.status = 'Completed'
      s.completedAt = now
      s.completedBy = input.by
    }
  }
  const process: ExitProcess = {
    employeeId: input.employee.id,
    exitType: input.exitType,
    reasonForLeaving: input.reasonForLeaving,
    resignationDate: input.resignationDate,
    terminationDate: input.terminationDate,
    lastWorkingDay: input.lastWorkingDay,
    steps,
    completedAt: null,
    createdAt: now,
    createdBy: input.by,
    updatedAt: now,
    auditLog: [
      {
        timestamp: now,
        user: input.by,
        action: 'exit.initiate',
        after: {
          exitType: input.exitType,
          reasonForLeaving: input.reasonForLeaving,
          lastWorkingDay: input.lastWorkingDay,
        },
        notes: `Exit initiated for ${input.employee.name}.`,
      },
    ],
  }
  return recomputeCompletion(process, now)
}

// --- Completion / summary ------------------------------------------------

export interface ExitSummary {
  total: number
  completed: number
  mandatoryRemaining: number
  isComplete: boolean
  percent: number
}

export function summariseExit(process: ExitProcess | undefined): ExitSummary {
  if (!process) {
    return { total: 0, completed: 0, mandatoryRemaining: 0, isComplete: false, percent: 0 }
  }
  let completed = 0
  let mandatoryRemaining = 0
  let mandatoryTotal = 0
  for (const s of process.steps) {
    if (s.status === 'Completed' || s.status === 'N/A') completed++
    if (s.isMandatory) {
      mandatoryTotal++
      if (s.status !== 'Completed' && s.status !== 'N/A') mandatoryRemaining++
    }
  }
  const isComplete = process.steps.length > 0 && mandatoryRemaining === 0
  const percent = mandatoryTotal === 0 ? 0 : Math.round(((mandatoryTotal - mandatoryRemaining) / mandatoryTotal) * 100)
  return { total: process.steps.length, completed, mandatoryRemaining, isComplete, percent }
}

/** Stamp completedAt when all mandatory steps are Completed/NA; clear it if a
 *  step regresses. Idempotent; preserves the original completion timestamp. */
export function recomputeCompletion(process: ExitProcess, now: string): ExitProcess {
  const { isComplete } = summariseExit(process)
  if (isComplete && !process.completedAt) {
    return { ...process, completedAt: now }
  }
  if (!isComplete && process.completedAt) {
    return { ...process, completedAt: null }
  }
  return process
}

// --- Step mutation (pure) ------------------------------------------------

export interface StepPatch {
  status?: ExitStepStatus
  notes?: string
  data?: Partial<ExitStepData>
}

/** Apply a patch to one step by templateId. Returns a NEW process with the
 *  step updated, completion recomputed, and an auditLog entry appended. */
export function applyStepPatch({
  process,
  templateId,
  patch,
  by,
  now,
  action = 'exit.step.update',
}: {
  process: ExitProcess
  templateId: string
  patch: StepPatch
  by: string
  now: string
  action?: string
}): ExitProcess {
  let touched: { before: unknown; after: unknown } | null = null
  const steps = process.steps.map((s) => {
    if (s.templateId !== templateId) return s
    const before = { status: s.status, notes: s.notes, data: s.data }
    const status = patch.status ?? s.status
    const next: ExitProcessStep = {
      ...s,
      status,
      notes: patch.notes ?? s.notes,
      data: patch.data ? { ...s.data, ...patch.data } : s.data,
      completedAt: status === 'Completed' ? (s.completedAt ?? now) : null,
      completedBy: status === 'Completed' ? (s.completedBy ?? by) : null,
    }
    touched = { before, after: { status: next.status, notes: next.notes, data: next.data } }
    return next
  })
  const updated: ExitProcess = {
    ...process,
    steps,
    updatedAt: now,
    auditLog: [
      ...process.auditLog,
      {
        timestamp: now,
        user: by,
        action,
        before: touched ? (touched as { before: unknown }).before : undefined,
        after: touched ? (touched as { after: unknown }).after : { templateId, ...patch },
      },
    ],
  }
  return recomputeCompletion(updated, now)
}

// --- Letters -------------------------------------------------------------

/** Map a step kind to the letter template id it generates, or null when the
 *  step has no letter (initiate / handover / ff / custom). */
export function letterTemplateIdForKind(kind: ExitStepKind): string | null {
  if (kind.startsWith('letter:')) return kind.slice('letter:'.length)
  return null
}

export function isFinancialStep(kind: ExitStepKind): boolean {
  return kind === 'ff' || kind === 'letter:NO-DUES-v1'
}

// --- Permissions ---------------------------------------------------------

export function canViewExitProcess(
  session: SessionClaims | null,
  employee: Pick<Employee, 'reportingManagerId'>,
): boolean {
  if (!session) return false
  if (session.role === 'Admin' || session.role === 'HR' || session.role === 'Leadership') return true
  if (session.role === 'HOD') return employee.reportingManagerId === session.sub
  return false
}

export function canEditExitProcess(session: SessionClaims | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}

/** Financial step content (F&F amounts, No Dues settlement figures) is
 *  HR/Admin-only - Leadership and HOD never see it, matching the F&F rule. */
export function canViewExitFinancials(session: SessionClaims | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}

/** Whether this viewer may see a step's detail (its inline action + data).
 *  Non-financial steps follow canViewExitProcess; financial steps are
 *  HR/Admin-only. Everyone who can view the process still sees the step's
 *  name + status in the progress rail. */
export function canViewStepDetail(session: SessionClaims | null, kind: ExitStepKind): boolean {
  if (!session) return false
  if (isFinancialStep(kind)) return canViewExitFinancials(session)
  return session.role === 'Admin' || session.role === 'HR' || session.role === 'Leadership' || session.role === 'HOD'
}

// --- Handover email builder (pure) --------------------------------------

export interface HandoverEmail {
  toName: string
  toEmail: string | null
  ccEmails: string[]
  subject: string
  body: string
  checklist: string[]
}

/** Build the handover email + checklist. Same template for everyone; only the
 *  reporting manager and department vary. Accounts and HR are always CC'd. */
export function buildHandoverEmail({
  employee,
  reportingManagerName,
  reportingManagerEmail,
  company,
}: {
  employee: Pick<Employee, 'name' | 'designation' | 'department' | 'employeeCode'>
  reportingManagerName: string | null
  reportingManagerEmail: string | null
  company: CompanyConfig
}): HandoverEmail {
  const rmName = reportingManagerName?.trim() || 'Reporting Manager'
  const dept = employee.department || 'the team'
  const cc = [company.hrContact?.email, company.accountsContact?.email]
    .map((e) => (e ?? '').trim())
    .filter(Boolean)

  const subject = `Handover and exit formalities: ${employee.name} (${employee.employeeCode || dept})`

  const checklist = [
    'Knowledge transfer document submitted and reviewed',
    'Outstanding work and pending tasks documented',
    'Ongoing client / school relationships transitioned',
    'Logins, shared drives and system access listed for revocation',
    'Company assets to be returned: laptop, ID card, SIM, email access',
    'Final attendance and leave to be reconciled',
  ]

  const body = [
    `Dear ${rmName},`,
    '',
    `This is to confirm that ${employee.name} (${employee.designation || 'employee'}, ${dept}) is exiting ${company.tagline}. Please complete the handover for this exit.`,
    '',
    'Handover checklist:',
    ...checklist.map((c) => `- ${c}`),
    '',
    'Accounts and HR are copied so the full and final settlement and access revocation can proceed in parallel.',
    '',
    'Please reply to confirm the handover is complete and we are clear to go ahead with the relieving formalities.',
    '',
    'Thank you,',
    company.hrContact?.name || 'HR Team',
    `${company.name} HR`,
  ].join('\n')

  return {
    toName: rmName,
    toEmail: reportingManagerEmail?.trim() || null,
    ccEmails: cc,
    subject,
    body,
    checklist,
  }
}

/** Default settlement-in-words from a rupee figure, for pre-filling the No
 *  Dues step. HR can override. */
export function settlementWordsDefault(figures: number | null | undefined): string {
  if (figures === null || figures === undefined || !Number.isFinite(figures) || figures <= 0) return ''
  return `${amountToWordsIndian(figures)} only`
}

// --- Migration merge (idempotent) ---------------------------------------

export interface ExitSignals {
  relievingLetterIssued?: boolean
  experienceLetterIssued?: boolean
  ffPaidAt?: string | null
  ffAmount?: number | null
  handoverReviewed?: boolean
}

/**
 * Backfill / merge an ExitProcess for an in-flight exit WITHOUT clobbering
 * steps already completed. If `existing` is undefined a fresh process is
 * built from the employee's exit header; known completion signals from the
 * legacy offboarding records map onto step status. Re-running is a no-op for
 * any step already Completed. New default steps (e.g. No Dues + F&F) are
 * appended if missing.
 */
export function mergeExitProcess({
  existing,
  templates,
  employee,
  signals,
  now,
  by = 'system',
}: {
  existing: ExitProcess | undefined
  templates: ExitStepTemplate[]
  employee: Employee
  signals: ExitSignals
  now: string
  by?: string
}): ExitProcess {
  const base: ExitProcess =
    existing ??
    {
      employeeId: employee.id,
      exitType: 'Voluntary',
      reasonForLeaving: employee.exit?.reason ?? '',
      resignationDate: null,
      terminationDate: null,
      lastWorkingDay: employee.exit?.lastWorkingDay ?? '',
      steps: [],
      completedAt: null,
      createdAt: now,
      createdBy: by,
      updatedAt: now,
      auditLog: [
        {
          timestamp: now,
          user: by,
          action: 'exit.migrate.create',
          notes: `Backfilled exit process for in-flight exit of ${employee.name}.`,
        },
      ],
    }

  // Ensure every default template has a step; append missing ones (No Dues +
  // F&F on processes that predate this reshape) without disturbing existing.
  const byTemplateId = new Map(base.steps.map((s) => [s.templateId, s]))
  const mergedSteps: ExitProcessStep[] = []
  let appended = 0
  for (const tpl of [...templates].sort((a, b) => a.order - b.order)) {
    const current = byTemplateId.get(tpl.id)
    if (current) {
      mergedSteps.push(current)
    } else {
      mergedSteps.push(emptyStep(tpl))
      appended++
    }
  }
  // Keep any custom steps HR added that aren't in the templates.
  for (const s of base.steps) {
    if (!templates.some((t) => t.id === s.templateId)) mergedSteps.push(s)
  }

  // Map legacy completion signals onto steps - only ever ADVANCE, never reset.
  function markCompletedIf(kind: ExitStepKind, when: boolean, data?: Partial<ExitStepData>) {
    if (!when) return
    const step = mergedSteps.find((s) => s.kind === kind)
    if (!step || step.status === 'Completed') return
    step.status = 'Completed'
    step.completedAt = step.completedAt ?? now
    step.completedBy = step.completedBy ?? by
    if (data) step.data = { ...step.data, ...data }
  }

  // Exit initiated is implicitly done for an in-flight exit (LWD is set).
  markCompletedIf('initiate', Boolean(base.lastWorkingDay))
  markCompletedIf('handover', Boolean(signals.handoverReviewed))
  markCompletedIf('letter:RELIEVING-v1', Boolean(signals.relievingLetterIssued), {
    letterIssuedAt: now,
    letterIssuedBy: by,
  })
  markCompletedIf('letter:EXPERIENCE-v1', Boolean(signals.experienceLetterIssued), {
    letterIssuedAt: now,
    letterIssuedBy: by,
  })
  markCompletedIf('ff', Boolean(signals.ffPaidAt), {
    paidAt: signals.ffPaidAt ?? now,
    ffAmount: signals.ffAmount ?? null,
  })

  const merged: ExitProcess = {
    ...base,
    steps: mergedSteps,
    updatedAt: now,
    auditLog:
      appended > 0
        ? [
            ...base.auditLog,
            {
              timestamp: now,
              user: by,
              action: 'exit.migrate.backfill',
              after: { appendedSteps: appended },
              notes: `Backfilled ${appended} missing step(s).`,
            },
          ]
        : base.auditLog,
  }
  return recomputeCompletion(merged, now)
}

/** Build the audit-friendly action verb for a step kind (used in commit
 *  messages + logs). */
export function stepActionLabel(kind: ExitStepKind): string {
  switch (kind) {
    case 'handover':
      return 'handover'
    case 'ff':
      return 'ff-settlement'
    case 'letter:NO-DUES-v1':
      return 'no-dues'
    case 'letter:RELIEVING-v1':
      return 'relieving'
    case 'letter:EXPERIENCE-v1':
      return 'experience'
    case 'initiate':
      return 'initiate'
    default:
      return 'custom'
  }
}

export type { AuditEntry }
