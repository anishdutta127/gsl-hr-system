/*
 * Alerts engine — pure computation of "what alerts need to fire today".
 *
 * Six categories:
 *   - document-expiry        30, 14, 7 days before doc.expiresAt
 *   - probation-review       7 days before probation ends
 *   - onboarding-overdue     onboarding task overdue by 3+ days
 *   - offboarding-lwd        14 days before LWD with pending tasks
 *   - leave-pending-24h      leave Submitted > 24h ago, manager hasn't acted
 *   - daily-hr-digest        single 9am IST summary email
 *
 * Idempotency: each alert has a stable `triggerKey` keyed on
 * (category, target id, trigger window, fire-date). Alerts are
 * deduped by reading the alert_log; firing appends one entry per send.
 *
 * Pure: takes already-loaded entities + alert_log + preferences,
 * returns the list of AlertActions to execute. The cron route does
 * the actual email sends and writes the log.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  AlertCategory,
  AlertLogEntry,
  AlertPreferences,
  EmployeeDocument,
  Employee,
  LeaveApplication,
  OffboardingTask,
  OffboardingTaskTemplate,
  OnboardingTask,
  OnboardingTaskTemplate,
} from './types'

const LOG_PATH = path.join(process.cwd(), 'src', 'data', 'alert_log.json')
const PREFS_PATH = path.join(process.cwd(), 'src', 'data', 'alert_preferences.json')

export function loadAlertLog(): AlertLogEntry[] {
  try {
    if (!fs.existsSync(LOG_PATH)) return []
    const text = fs.readFileSync(LOG_PATH, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as AlertLogEntry[]) : []
  } catch {
    return []
  }
}

export function loadAlertPreferences(): AlertPreferences {
  try {
    if (!fs.existsSync(PREFS_PATH)) {
      return { enabled: {}, extraRecipients: [], globalEnabled: true, updatedAt: '' }
    }
    const text = fs.readFileSync(PREFS_PATH, 'utf-8').trim()
    if (!text) {
      return { enabled: {}, extraRecipients: [], globalEnabled: true, updatedAt: '' }
    }
    const parsed = JSON.parse(text) as Partial<AlertPreferences>
    return {
      enabled: parsed.enabled ?? {},
      extraRecipients: parsed.extraRecipients ?? [],
      globalEnabled: parsed.globalEnabled ?? true,
      updatedAt: parsed.updatedAt ?? '',
    }
  } catch {
    return { enabled: {}, extraRecipients: [], globalEnabled: true, updatedAt: '' }
  }
}

export function isCategoryEnabled(prefs: AlertPreferences, category: AlertCategory): boolean {
  if (!prefs.globalEnabled) return false
  return prefs.enabled[category] !== false
}

export interface AlertAction {
  category: AlertCategory
  triggerKey: string
  recipients: string[]
  subject: string
  body: string
  notes?: string
}

export interface BuildAlertsInput {
  now: Date
  prefs: AlertPreferences
  log: AlertLogEntry[]
  employees: Employee[]
  documents: EmployeeDocument[]
  onboardingTasks: OnboardingTask[]
  onboardingTemplates: OnboardingTaskTemplate[]
  offboardingTasks: OffboardingTask[]
  offboardingTemplates: OffboardingTaskTemplate[]
  leaveApplications: LeaveApplication[]
  /** Default HR mailing list. Used as the routing target for HR-class
   *  alerts and the daily digest. Empty list -> alerts skipped. */
  hrRecipients: string[]
}

export function buildAlertActions(input: BuildAlertsInput): AlertAction[] {
  const alreadyFired = new Set(input.log.map((e) => e.triggerKey))
  const today = input.now.toISOString().slice(0, 10)
  const out: AlertAction[] = []

  function push(action: AlertAction) {
    if (alreadyFired.has(action.triggerKey)) return
    if (action.recipients.length === 0) return
    out.push(action)
  }

  const empById = new Map(input.employees.map((e) => [e.id, e]))

  // 1. Document expiry — 30, 14, 7 days before doc.expiresAt.
  if (isCategoryEnabled(input.prefs, 'document-expiry')) {
    for (const d of input.documents) {
      if (!d.expiresAt) continue
      const days = daysBetween(today, d.expiresAt)
      const window = days === 30 ? '30d' : days === 14 ? '14d' : days === 7 ? '7d' : null
      if (!window) continue
      const emp = empById.get(d.employeeId)
      if (!emp || emp.status === 'Exited') continue
      const recipients = uniq([
        ...input.hrRecipients,
        emp.personalEmail ?? '',
        emp.email ?? '',
        ...input.prefs.extraRecipients,
      ]).filter(Boolean)
      push({
        category: 'document-expiry',
        triggerKey: `document-expiry:${d.id}:${window}:${today}`,
        recipients,
        subject: `Document expiring in ${days} days: ${d.originalFileName}`,
        body: `${emp.name}'s "${d.originalFileName}" expires on ${d.expiresAt}. Refresh before ${d.expiresAt}.`,
        notes: `Doc ${d.id} for ${emp.employeeCode}; ${window} window`,
      })
    }
  }

  // 2. Probation review — 7 days before probation ends.
  if (isCategoryEnabled(input.prefs, 'probation-review')) {
    for (const e of input.employees) {
      if (e.status === 'Exited') continue
      if (!e.dateOfJoining) continue
      if (e.confirmationDate) continue
      const probEnd = monthsLater(e.dateOfJoining, 6)
      const days = daysBetween(today, probEnd)
      if (days !== 7) continue
      const managerEmail = e.reportingManagerId
        ? empById.get(e.reportingManagerId)?.email
        : undefined
      const recipients = uniq([
        ...input.hrRecipients,
        managerEmail ?? '',
        ...input.prefs.extraRecipients,
      ]).filter(Boolean)
      push({
        category: 'probation-review',
        triggerKey: `probation-review:${e.id}:${probEnd}:${today}`,
        recipients,
        subject: `Probation review due in 7 days: ${e.name}`,
        body: `${e.name} (${e.employeeCode})'s probation ends ${probEnd}. Schedule the review with their reporting manager.`,
        notes: `Probation ends ${probEnd}`,
      })
    }
  }

  // 3. Onboarding overdue — task overdue by 3+ days.
  if (isCategoryEnabled(input.prefs, 'onboarding-overdue')) {
    for (const t of input.onboardingTasks) {
      if (t.status === 'Completed' || t.status === 'N/A') continue
      const overdueDays = daysBetween(t.dueDate, today)
      if (overdueDays < 3) continue
      const emp = empById.get(t.employeeId)
      if (!emp || emp.status === 'Exited') continue
      const tpl = input.onboardingTemplates.find((x) => x.id === t.templateId)
      const assigneeEmail = t.assignedTo
        ? empById.get(t.assignedTo)?.email
        : undefined
      const recipients = uniq([
        ...input.hrRecipients,
        assigneeEmail ?? '',
        ...input.prefs.extraRecipients,
      ]).filter(Boolean)
      push({
        category: 'onboarding-overdue',
        triggerKey: `onboarding-overdue:${t.id}:${today}`,
        recipients,
        subject: `Onboarding task overdue: ${tpl?.name ?? t.templateId}`,
        body: `Task "${tpl?.name ?? t.templateId}" for ${emp.name} (${emp.employeeCode}) was due ${t.dueDate} and is ${overdueDays} days overdue.`,
        notes: `Task ${t.id}; assignee ${t.assignedTo ?? 'unassigned'}`,
      })
    }
  }

  // 4. Offboarding LWD approaching — 14 days before LWD with pending tasks.
  if (isCategoryEnabled(input.prefs, 'offboarding-lwd')) {
    // Group offboarding tasks by employee with the soonest pending dueDate.
    const byEmp = new Map<string, OffboardingTask[]>()
    for (const t of input.offboardingTasks) {
      if (t.status === 'Completed' || t.status === 'N/A') continue
      const list = byEmp.get(t.employeeId) ?? []
      list.push(t)
      byEmp.set(t.employeeId, list)
    }
    for (const [empId, tasks] of byEmp) {
      const emp = empById.get(empId)
      if (!emp) continue
      // Identify the LWD-pegged task with the latest dueDate as the proxy
      // for actual LWD. This matches how the offboarding generator works.
      const lwdLikeTasks = tasks.filter((t) => {
        const tpl = input.offboardingTemplates.find((x) => x.id === t.templateId)
        return tpl?.pegToLwd === true
      })
      if (lwdLikeTasks.length === 0) continue
      const latest = lwdLikeTasks.reduce((a, b) => (a.dueDate > b.dueDate ? a : b))
      const days = daysBetween(today, latest.dueDate)
      if (days !== 14) continue
      const managerEmail = emp.reportingManagerId
        ? empById.get(emp.reportingManagerId)?.email
        : undefined
      const recipients = uniq([
        ...input.hrRecipients,
        managerEmail ?? '',
        ...input.prefs.extraRecipients,
      ]).filter(Boolean)
      push({
        category: 'offboarding-lwd',
        triggerKey: `offboarding-lwd:${empId}:${latest.dueDate}:${today}`,
        recipients,
        subject: `Last working day in 14 days: ${emp.name}`,
        body: `${emp.name} (${emp.employeeCode}) is exiting on ${latest.dueDate}. ${tasks.length} offboarding tasks still pending.`,
        notes: `LWD ${latest.dueDate}; ${tasks.length} pending`,
      })
    }
  }

  // 5. Leave pending > 24h — manager hasn't acted.
  if (isCategoryEnabled(input.prefs, 'leave-pending-24h')) {
    const dayAgo = new Date(input.now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    for (const a of input.leaveApplications) {
      if (a.status !== 'Submitted') continue
      const submittedAt = a.submittedAt ?? a.appliedAt
      if (submittedAt > dayAgo) continue // less than 24h old
      const emp = empById.get(a.employeeId)
      if (!emp) continue
      const recipients = uniq([...input.hrRecipients, ...input.prefs.extraRecipients]).filter(Boolean)
      push({
        category: 'leave-pending-24h',
        triggerKey: `leave-pending-24h:${a.id}:${today}`,
        recipients,
        subject: `Leave pending > 24h: ${emp.name}`,
        body: `${emp.name}'s ${a.leaveType} leave from ${a.startDate} to ${a.endDate} has been waiting since ${submittedAt.slice(0, 10)}. Escalating to HR.`,
        notes: `Leave ${a.id}; submitted ${submittedAt}`,
      })
    }
  }

  // 6. Daily HR digest — single per-day summary.
  if (isCategoryEnabled(input.prefs, 'daily-hr-digest')) {
    const dueToday = input.onboardingTasks.filter(
      (t) => t.status !== 'Completed' && t.status !== 'N/A' && t.dueDate === today,
    )
    const overdue = input.onboardingTasks.filter(
      (t) => t.status !== 'Completed' && t.status !== 'N/A' && t.dueDate < today,
    )
    const pendingLeave = input.leaveApplications.filter((a) => a.status === 'Submitted')
    const exitsThisWeek = input.employees.filter((e) => {
      if (!e.exit?.lastWorkingDay) return false
      const days = daysBetween(today, e.exit.lastWorkingDay)
      return days >= 0 && days <= 7
    })
    const expiringDocs = input.documents.filter((d) => {
      if (!d.expiresAt) return false
      const days = daysBetween(today, d.expiresAt)
      return days >= 0 && days <= 30
    })
    const recipients = uniq([...input.hrRecipients, ...input.prefs.extraRecipients]).filter(Boolean)
    if (recipients.length > 0) {
      push({
        category: 'daily-hr-digest',
        triggerKey: `daily-hr-digest:${today}`,
        recipients,
        subject: `HR digest — ${today}`,
        body: [
          `Onboarding tasks due today: ${dueToday.length}`,
          `Onboarding tasks overdue:   ${overdue.length}`,
          `Pending leave applications: ${pendingLeave.length}`,
          `Exits this week:            ${exitsThisWeek.length}`,
          `Documents expiring (30d):   ${expiringDocs.length}`,
          '',
          'Open the dashboard to act.',
        ].join('\n'),
        notes: 'daily digest',
      })
    }
  }

  return out
}

// --- Helpers -------------------------------------------------------------

function uniq(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of list) {
    const k = s.trim().toLowerCase()
    if (!k) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s.trim())
  }
  return out
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

function monthsLater(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}
