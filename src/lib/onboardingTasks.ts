/*
 * Onboarding workflow helpers.
 *
 * Templates seed which tasks every new joinee gets; per-employee tasks are
 * generated when the employee is created (or when the system retroactively
 * activates onboarding for someone who joined within the 6-month window).
 *
 * Pure helpers (this file) — file I/O is in the data layer; route handlers
 * generate, update, and complete tasks via these primitives.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  Employee,
  OnboardingTask,
  OnboardingTaskTemplate,
  OnboardingDefaultAssignee,
  TaskStatus,
  User,
} from './types'

const TEMPLATES_FILE = path.join(process.cwd(), 'src', 'data', 'onboarding_task_templates.json')
const TASKS_FILE = path.join(process.cwd(), 'src', 'data', 'employee_onboarding_tasks.json')

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

export function loadOnboardingTemplates(): OnboardingTaskTemplate[] {
  return readJsonArray<OnboardingTaskTemplate>(TEMPLATES_FILE)
}

export function loadOnboardingTasks(): OnboardingTask[] {
  return readJsonArray<OnboardingTask>(TASKS_FILE)
}

/** Add `days` calendar days to a YYYY-MM-DD date (UTC math). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`addDaysIso: invalid date ${iso}`)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days))
  return target.toISOString().slice(0, 10)
}

/** Pick the user id for a default-assignee role. Falls back to a literal
 *  string token ('ReportingManager' / 'Employee') when there is no resolved
 *  user — the UI shows the literal token and HR re-assigns later. */
export function resolveAssignee({
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
      // No 'IT' or 'Accounts' role exists in our system yet (see TODOs).
      // Fall back to the first active HR user; Admin grabs the first
      // active Admin. Phase-future RBAC pass replaces with real role
      // enums.
      const target =
        defaultAssignee === 'Admin'
          ? users.find((u) => u.active && u.role === 'Admin')
          : users.find((u) => u.active && u.role === 'HR')
      return target?.id ?? null
    }
  }
}

export interface BuildTasksOptions {
  /** Cap the auto-status for tasks that are already past their due date.
   *  Useful when retro-onboarding an existing employee whose joining date
   *  is in the past — pre-joining tasks come back N/A instead of overdue. */
  now?: Date
}

/**
 * Generate a per-employee onboarding task list from the seed templates.
 * Idempotent: returns the existing tasks for `employeeId` if any are
 * already in the list, instead of duplicating.
 *
 * Edge cases handled:
 *   - Employee with no joining date         -> returns empty
 *   - Employee already past 6 months        -> returns empty
 *     (caller decides to mark Onboarding completed for these)
 *   - Pre-joining tasks past their due date -> auto-status 'N/A'
 *     (we never made it to those tasks; HR can still flip back if she wants)
 */
export function generateOnboardingTasksForEmployee({
  employee,
  templates,
  users,
  existing,
  now = new Date(),
}: {
  employee: Employee
  templates: OnboardingTaskTemplate[]
  users: User[]
  existing: OnboardingTask[]
  now?: Date
} & BuildTasksOptions): OnboardingTask[] {
  if (!employee.dateOfJoining) return []
  const joiningTime = new Date(`${employee.dateOfJoining}T00:00:00Z`).getTime()
  if (Number.isNaN(joiningTime)) return []

  const monthsSinceJoin = (now.getTime() - joiningTime) / (1000 * 60 * 60 * 24 * 30)
  if (monthsSinceJoin > 6) return [] // already onboarded

  // Idempotency: if any task for this employee already exists, return that
  // subset — caller filters & merges as needed.
  const alreadyMine = existing.filter((t) => t.employeeId === employee.id)
  if (alreadyMine.length > 0) return alreadyMine

  const todayIso = now.toISOString().slice(0, 10)
  const out: OnboardingTask[] = []
  for (const tpl of templates) {
    const dueDate = addDaysIso(employee.dateOfJoining, tpl.daysFromJoining)
    // Pre-joining tasks already past for back-dated joiners are marked N/A.
    const isPastPreJoin = tpl.daysFromJoining < 0 && dueDate < todayIso
    out.push({
      id: `obtask-${employee.id}-${tpl.id}`,
      employeeId: employee.id,
      templateId: tpl.id,
      status: isPastPreJoin ? 'N/A' : 'Not Started',
      assignedTo: resolveAssignee({
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
          action: 'onboarding.task.create',
          after: { templateId: tpl.id, dueDate, status: isPastPreJoin ? 'N/A' : 'Not Started' },
          notes: isPastPreJoin
            ? 'Auto-marked N/A: pre-joining task generated after the joining date passed.'
            : 'Generated from default onboarding template.',
        },
      ],
    })
  }
  return out
}

/** Compute progress + onboarded-flag for an employee's task list. */
export function summariseOnboarding({
  templates,
  tasks,
}: {
  templates: OnboardingTaskTemplate[]
  tasks: OnboardingTask[]
}): {
  total: number
  completed: number
  notApplicable: number
  inProgress: number
  blocked: number
  notStarted: number
  mandatoryRemaining: number
  isOnboarded: boolean
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
    isOnboarded: tasks.length > 0 && mandatoryRemaining === 0,
  }
}

/** Compute days-until-due for a task. Negative when overdue. */
export function daysUntilDue(task: OnboardingTask, now: Date = new Date()): number {
  const due = new Date(`${task.dueDate}T00:00:00Z`).getTime()
  return Math.ceil((due - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function isTaskOverdue(task: OnboardingTask, now: Date = new Date()): boolean {
  if (task.status === 'Completed' || task.status === 'N/A') return false
  return daysUntilDue(task, now) < 0
}

/** Permission check: can `userId` see task? Reporting manager-class users
 *  see only tasks where they are the assignee or where they are the
 *  reporting manager of the employee. HR/Admin see all. */
export function canUserSeeTask({
  task,
  user,
  employee,
}: {
  task: OnboardingTask
  user: { id: string; role: string }
  employee: Employee
}): boolean {
  if (user.role === 'Admin' || user.role === 'HR' || user.role === 'Leadership') return true
  // HOD = Reporting Manager class
  if (user.role === 'HOD') {
    if (employee.reportingManagerId === user.id) return true
    if (task.assignedTo === user.id) return true
  }
  return false
}

/** Apply a status change. Pure: returns a new task with audit appended. */
export function applyTaskStatusChange({
  task,
  status,
  byUser,
  notes,
  blockers,
  now,
}: {
  task: OnboardingTask
  status: TaskStatus
  byUser: string
  notes?: string
  blockers?: string
  now: string
}): OnboardingTask {
  const before = {
    status: task.status,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
    notes: task.notes,
    blockers: task.blockers,
  }
  const next: OnboardingTask = {
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
      action: 'onboarding.task.update',
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
