/*
 * Internal HR task board helpers.
 *
 * Storage: src/data/hr_tasks.json (array of HrTask). Mutations write via
 * atomicUpdateJson (NOT the queue) with an auditLog entry per write, matching
 * the admin / offboarding surfaces. Internal staff only.
 *
 * Pure helpers (group, filter, apply update, advance stage, summarise) so the
 * board logic is unit-testable without the filesystem.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  HR_TASK_STATUSES,
  type HrTask,
  type HrTaskDependency,
  type HrTaskStage,
  type HrTaskStatus,
  type SessionClaims,
} from './types'

const FILE = path.join(process.cwd(), 'src', 'data', 'hr_tasks.json')

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

export function loadHrTasks(): HrTask[] {
  return readJsonArray<HrTask>(FILE)
}

export function findHrTask(id: string): HrTask | undefined {
  return loadHrTasks().find((t) => t.id === id)
}

// --- Permissions ---------------------------------------------------------

/** Visible to all staff (Admin/HR/HOD/Leadership); never employees/candidates. */
export function canViewHrTasks(session: SessionClaims | null): boolean {
  if (!session) return false
  return (
    session.role === 'Admin' ||
    session.role === 'HR' ||
    session.role === 'HOD' ||
    session.role === 'Leadership'
  )
}

/** Create / edit is HR + Admin (HOD + Leadership are read-only), matching the
 *  app's edit-gate posture. */
export function canEditHrTasks(session: SessionClaims | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}

// --- Grouping / filtering / summary --------------------------------------

export function groupByStatus(tasks: HrTask[]): Record<HrTaskStatus, HrTask[]> {
  const out = {} as Record<HrTaskStatus, HrTask[]>
  for (const s of HR_TASK_STATUSES) out[s] = []
  for (const t of tasks) {
    const bucket = HR_TASK_STATUSES.includes(t.status) ? t.status : 'Not started'
    out[bucket].push(t)
  }
  return out
}

export interface HrTaskFilter {
  ownerUserId?: string
  blockedOnly?: boolean
  /** Matches the current stage's name (case-insensitive substring). */
  stageQuery?: string
}

export function currentStageName(task: HrTask): string | null {
  if (!task.currentStageId) return null
  return task.stages.find((s) => s.id === task.currentStageId)?.name ?? null
}

export function filterHrTasks(tasks: HrTask[], filter: HrTaskFilter): HrTask[] {
  const q = filter.stageQuery?.trim().toLowerCase()
  return tasks.filter((t) => {
    if (filter.ownerUserId && t.ownerUserId !== filter.ownerUserId) return false
    if (filter.blockedOnly && !t.blocked) return false
    if (q) {
      const name = currentStageName(t)?.toLowerCase() ?? ''
      if (!name.includes(q)) return false
    }
    return true
  })
}

export interface HrTaskSummary {
  total: number
  byStatus: Record<HrTaskStatus, number>
  blocked: number
  open: number
}

export function summariseHrTasks(tasks: HrTask[]): HrTaskSummary {
  const byStatus = {} as Record<HrTaskStatus, number>
  for (const s of HR_TASK_STATUSES) byStatus[s] = 0
  let blocked = 0
  for (const t of tasks) {
    byStatus[HR_TASK_STATUSES.includes(t.status) ? t.status : 'Not started']++
    if (t.blocked) blocked++
  }
  return { total: tasks.length, byStatus, blocked, open: tasks.length - byStatus.Done }
}

// --- Mutation (pure) -----------------------------------------------------

export interface HrTaskPatch {
  title?: string
  description?: string
  status?: HrTaskStatus
  ownerUserId?: string | null
  stages?: HrTaskStage[]
  currentStageId?: string | null
  dependency?: HrTaskDependency | null
  blocked?: boolean
  blockerNote?: string
  dueDate?: string | null
  nextStep?: string | null
}

const PATCHABLE_KEYS: (keyof HrTaskPatch)[] = [
  'title',
  'description',
  'status',
  'ownerUserId',
  'stages',
  'currentStageId',
  'dependency',
  'blocked',
  'blockerNote',
  'dueDate',
  'nextStep',
]

/** Apply a patch, append an audit entry capturing the changed fields, bump
 *  updatedAt. Only keys present in the patch are touched. */
export function applyHrTaskUpdate({
  task,
  patch,
  by,
  now,
}: {
  task: HrTask
  patch: HrTaskPatch
  by: string
  now: string
}): HrTask {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const next: HrTask = { ...task }
  for (const key of PATCHABLE_KEYS) {
    if (patch[key] === undefined) continue
    before[key] = task[key as keyof HrTask]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(next as any)[key] = patch[key]
    after[key] = patch[key]
  }
  next.updatedAt = now
  next.auditLog = [
    ...task.auditLog,
    { timestamp: now, user: by, action: 'hr-task.update', before, after },
  ]
  return next
}

/** Mark the current stage done and move the next pending stage to current.
 *  When there is no next stage, currentStageId clears and the task is left for
 *  the caller to mark Done. */
export function advanceStage(task: HrTask, by: string, now: string): HrTask {
  if (task.stages.length === 0) return task
  const ordered = [...task.stages].sort((a, b) => a.order - b.order)
  const currentIdx = ordered.findIndex((s) => s.id === task.currentStageId)
  const idx = currentIdx === -1 ? ordered.findIndex((s) => s.status !== 'done') : currentIdx
  if (idx === -1) return task

  const stages = ordered.map((s, i) => {
    if (i === idx) return { ...s, status: 'done' as const }
    if (i === idx + 1) return { ...s, status: 'current' as const }
    return s
  })
  const nextCurrent = stages[idx + 1]?.id ?? null

  return {
    ...task,
    stages,
    currentStageId: nextCurrent,
    updatedAt: now,
    auditLog: [
      ...task.auditLog,
      {
        timestamp: now,
        user: by,
        action: 'hr-task.advance-stage',
        before: { currentStageId: task.currentStageId },
        after: { currentStageId: nextCurrent, completedStage: ordered[idx]?.name },
      },
    ],
  }
}
