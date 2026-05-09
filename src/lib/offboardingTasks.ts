/*
 * Offboarding workflow helpers.
 *
 * Mirrors onboardingTasks.ts in shape; differs in two ways:
 *   - Tasks are pegged either to noticeStartDate + offset OR to
 *     lastWorkingDay - daysBeforeLwd (template.pegToLwd flag)
 *   - Adds Accounts as a defaultAssignee (no Accounts role yet; falls
 *     back to first HR user)
 *
 * Generation triggers: employmentStatus -> 'On Notice' OR -> 'Exited'.
 * The /api/admin/offboarding/generate route exposes idempotent creation.
 */

import fs from 'node:fs'
import path from 'node:path'
import { addDaysIso } from './onboardingTasks'
import type {
  Employee,
  ExitInterview,
  FFSettlement,
  OffboardingTask,
  OffboardingTaskTemplate,
  OnboardingDefaultAssignee,
  TaskStatus,
  User,
} from './types'

const TEMPLATES_FILE = path.join(process.cwd(), 'src', 'data', 'offboarding_task_templates.json')
const TASKS_FILE = path.join(process.cwd(), 'src', 'data', 'employee_offboarding_tasks.json')
const INTERVIEWS_FILE = path.join(process.cwd(), 'src', 'data', 'exit_interviews.json')
const FF_FILE = path.join(process.cwd(), 'src', 'data', 'ff_settlements.json')

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

export function loadOffboardingTemplates(): OffboardingTaskTemplate[] {
  return readJsonArray<OffboardingTaskTemplate>(TEMPLATES_FILE)
}

export function loadOffboardingTasks(): OffboardingTask[] {
  return readJsonArray<OffboardingTask>(TASKS_FILE)
}

export function loadExitInterviews(): ExitInterview[] {
  return readJsonArray<ExitInterview>(INTERVIEWS_FILE)
}

export function loadFFSettlements(): FFSettlement[] {
  return readJsonArray<FFSettlement>(FF_FILE)
}

/** Per-employee offboarding context. The notice start date defaults to
 *  today; the last working day comes from employee.exit.lastWorkingDay
 *  if set; both can be passed explicitly when calling generation. */
export interface OffboardingContext {
  noticeStartDate: string
  lastWorkingDay: string
}

export function resolveOffboardingAssignee({
  defaultAssignee,
  employee,
  users,
}: {
  defaultAssignee: OnboardingDefaultAssignee | 'Accounts'
  employee: Employee
  users: User[]
}): string | null {
  switch (defaultAssignee) {
    case 'ReportingManager':
      return employee.reportingManagerId ?? null
    case 'Employee':
      return employee.id
    case 'HR':
    case 'Admin':
    case 'IT':
    case 'Accounts': {
      const target =
        defaultAssignee === 'Admin'
          ? users.find((u) => u.active && u.role === 'Admin')
          : users.find((u) => u.active && u.role === 'HR')
      return target?.id ?? null
    }
  }
}

/**
 * Generate offboarding tasks. Idempotent. Returns existing tasks if any.
 * Tasks pegged to LWD use lastWorkingDay - daysFromNoticeStart; others
 * use noticeStartDate + daysFromNoticeStart.
 */
export function generateOffboardingTasksForEmployee({
  employee,
  templates,
  users,
  existing,
  context,
  now = new Date(),
}: {
  employee: Employee
  templates: OffboardingTaskTemplate[]
  users: User[]
  existing: OffboardingTask[]
  context: OffboardingContext
  now?: Date
}): OffboardingTask[] {
  const alreadyMine = existing.filter((t) => t.employeeId === employee.id)
  if (alreadyMine.length > 0) return alreadyMine

  const out: OffboardingTask[] = []
  for (const tpl of templates) {
    const dueDate = tpl.pegToLwd
      ? addDaysIso(context.lastWorkingDay, -tpl.daysFromNoticeStart)
      : addDaysIso(context.noticeStartDate, tpl.daysFromNoticeStart - 1)
    out.push({
      id: `offtask-${employee.id}-${tpl.id}`,
      employeeId: employee.id,
      templateId: tpl.id,
      status: 'Not Started',
      assignedTo: resolveOffboardingAssignee({
        defaultAssignee: tpl.defaultAssignee,
        employee,
        users,
      }),
      dueDate,
      completedAt: null,
      completedBy: null,
      notes: '',
      blockers: '',
      auditLog: [
        {
          timestamp: now.toISOString(),
          user: 'system',
          action: 'offboarding.task.create',
          after: { templateId: tpl.id, dueDate, status: 'Not Started' },
          notes: 'Generated from default offboarding template.',
        },
      ],
    })
  }
  return out
}

export function summariseOffboarding({
  templates,
  tasks,
}: {
  templates: OffboardingTaskTemplate[]
  tasks: OffboardingTask[]
}): {
  total: number
  completed: number
  notApplicable: number
  inProgress: number
  blocked: number
  notStarted: number
  mandatoryRemaining: number
  isOffboarded: boolean
} {
  const tplById = new Map(templates.map((t) => [t.id, t]))
  let completed = 0
  let notApplicable = 0
  let inProgress = 0
  let blocked = 0
  let notStarted = 0
  let mandatoryRemaining = 0
  for (const t of tasks) {
    switch (t.status) {
      case 'Completed':
        completed++
        break
      case 'N/A':
        notApplicable++
        break
      case 'In Progress':
        inProgress++
        break
      case 'Blocked':
        blocked++
        break
      case 'Not Started':
        notStarted++
        break
    }
    const tpl = tplById.get(t.templateId)
    if (tpl?.isMandatory && t.status !== 'Completed' && t.status !== 'N/A') {
      mandatoryRemaining++
    }
  }
  return {
    total: tasks.length,
    completed,
    notApplicable,
    inProgress,
    blocked,
    notStarted,
    mandatoryRemaining,
    isOffboarded: tasks.length > 0 && mandatoryRemaining === 0,
  }
}

/** Permission for offboarding tasks. Reporting Manager sees only their
 *  team's HANDOVER tasks; exit interview content stays HR/Admin/
 *  allowlisted-Leadership only (enforced at the page + API level for
 *  exit interview specifically). */
export function canUserSeeOffboardingTask({
  task,
  template,
  user,
  employee,
}: {
  task: OffboardingTask
  template: OffboardingTaskTemplate | undefined
  user: { id: string; role: string }
  employee: Employee
}): boolean {
  if (user.role === 'Admin' || user.role === 'HR' || user.role === 'Leadership') return true
  if (user.role === 'HOD') {
    // HOD never sees the exit interview task content; mark visible only
    // if they are the assignee, which is rare for the interview.
    if (template?.id === 'off-exit-interview') return false
    if (employee.reportingManagerId === user.id) return true
    if (task.assignedTo === user.id) return true
  }
  return false
}

export function applyOffboardingTaskStatusChange({
  task,
  status,
  byUser,
  notes,
  blockers,
  now,
}: {
  task: OffboardingTask
  status: TaskStatus
  byUser: string
  notes?: string
  blockers?: string
  now: string
}): OffboardingTask {
  const before = {
    status: task.status,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
    notes: task.notes,
    blockers: task.blockers,
  }
  const next: OffboardingTask = {
    ...task,
    status,
    completedAt: status === 'Completed' ? now : null,
    completedBy: status === 'Completed' ? byUser : null,
    notes: notes ?? task.notes,
    blockers: blockers ?? (status === 'Blocked' ? task.blockers : ''),
  }
  next.auditLog = [
    ...task.auditLog,
    {
      timestamp: now,
      user: byUser,
      action: 'offboarding.task.update',
      before,
      after: {
        status: next.status,
        completedAt: next.completedAt,
        notes: next.notes,
        blockers: next.blockers,
      },
    },
  ]
  return next
}

/** Permission gate for the exit interview. HR + Admin always; Leadership
 *  per the testing-vs-production access posture (see CLAUDE.md).
 *
 *  HOD never sees the exit interview content even for their direct
 *  reports — that's a role-correctness gate that STAYS enforced
 *  regardless of TESTING_OPEN_ACCESS or GSL_INTERVIEW_VIEWERS.
 *
 *  TESTING DEFAULT: open access for HR + Admin + Leadership.
 *  Set TESTING_OPEN_ACCESS=false on production to enforce strict
 *  allowlists. When GSL_INTERVIEW_VIEWERS is unset/empty, every
 *  Leadership user is implicitly on the allowlist; set it to a
 *  comma-separated email list to lock down. */
export function canViewExitInterview(session: {
  role: string
  email: string
} | null): boolean {
  if (!session) return false
  if (session.role === 'Admin' || session.role === 'HR') return true
  if (session.role === 'Leadership') {
    const flag = process.env.TESTING_OPEN_ACCESS
    const testingOpen = flag === undefined || flag === '' ? true : flag !== 'false'
    if (testingOpen) return true
    // GSL_INTERVIEW_VIEWERS unset = treat every Leadership user as on the
    // allowlist. Set explicitly on production to lock down.
    const raw = process.env.GSL_INTERVIEW_VIEWERS
    if (raw === undefined || raw.trim() === '') return true
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(session.email.toLowerCase())
  }
  return false
}

export function canEditExitInterview(session: {
  role: string
  email: string
} | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}
