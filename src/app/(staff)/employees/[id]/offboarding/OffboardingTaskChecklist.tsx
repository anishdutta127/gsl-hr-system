'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TASK_STATUSES,
  type OffboardingTaskTemplate,
  type TaskStatus,
} from '@/lib/types'

interface TaskRow {
  id: string
  templateId: string
  status: TaskStatus
  assignedTo: string | null
  dueDate: string
  notes: string
  blockers: string
}

interface UserRef {
  id: string
  name: string
  role: string
}

const STATUS_TONE: Record<TaskStatus, string> = {
  'Not Started': 'bg-surface text-ink-2',
  'In Progress': 'bg-info-bg text-info',
  Completed: 'bg-success-bg text-success',
  Blocked: 'bg-warning-bg text-warning',
  'N/A': 'bg-line text-ink-3',
}

export function OffboardingTaskChecklist({
  tasks,
  templates,
  users,
  canEdit,
  isHrOrAdmin,
}: {
  tasks: TaskRow[]
  templates: OffboardingTaskTemplate[]
  users: UserRef[]
  canEdit: boolean
  isHrOrAdmin: boolean
}) {
  const tplById = new Map(templates.map((t) => [t.id, t]))
  const userById = new Map(users.map((u) => [u.id, u]))
  const tplOrder = new Map(templates.map((t, i) => [t.id, i]))
  const sorted = [...tasks].sort((a, b) => {
    const oa = tplOrder.get(a.templateId) ?? 999
    const ob = tplOrder.get(b.templateId) ?? 999
    if (oa !== ob) return oa - ob
    return a.dueDate.localeCompare(b.dueDate)
  })

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
            <th className="px-5 py-2">Task</th>
            <th className="px-3 py-2 w-[140px]">Status</th>
            <th className="px-3 py-2 w-[110px]">Due</th>
            <th className="px-3 py-2 w-[180px]">Assignee</th>
            <th className="px-5 py-2 text-right w-[180px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <Row
              key={t.id}
              task={t}
              tpl={tplById.get(t.templateId)}
              users={users}
              userById={userById}
              canEdit={canEdit}
              isHrOrAdmin={isHrOrAdmin}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  task,
  tpl,
  users,
  userById,
  canEdit,
  isHrOrAdmin,
}: {
  task: TaskRow
  tpl: OffboardingTaskTemplate | undefined
  users: UserRef[]
  userById: Map<string, UserRef>
  canEdit: boolean
  isHrOrAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [notes, setNotes] = useState(task.notes)
  const [blockers, setBlockers] = useState(task.blockers)
  const [assignedTo, setAssignedTo] = useState(task.assignedTo ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const router = useRouter()

  function notify(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 8000)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        status,
        notes,
        blockers: status === 'Blocked' ? blockers : '',
      }
      if (isHrOrAdmin) body.assignedTo = assignedTo || null
      const res = await fetch(`/api/admin/offboarding/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Save failed: ${res.status}`)
      notify(data.note ?? 'Saved.')
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const dueDate = task.dueDate
  const isOverdue =
    task.status !== 'Completed' &&
    task.status !== 'N/A' &&
    new Date(`${dueDate}T00:00:00Z`) < new Date()

  const assignee = task.assignedTo ? userById.get(task.assignedTo) : null
  const assigneeLabel = assignee
    ? `${assignee.name}`
    : task.assignedTo
      ? `(${task.assignedTo})`
      : '— unassigned —'

  return (
    <tr className="border-b border-line/50 align-top">
      <td className="px-5 py-3">
        <div className="font-medium text-ink">{tpl?.name ?? '(unknown task)'}</div>
        {tpl?.description && (
          <div className="mt-0.5 text-xs text-ink-3">{tpl.description}</div>
        )}
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-ink-3">
          {tpl && <span className="rounded-sm bg-surface px-1.5 py-0.5">{tpl.category}</span>}
          {tpl?.isMandatory && (
            <span className="rounded-sm bg-orange-light px-1.5 py-0.5 text-orange-dark">Mandatory</span>
          )}
        </div>
        {task.notes && !editing && (
          <p className="mt-1 text-xs text-ink-2 whitespace-pre-wrap">{task.notes}</p>
        )}
        {task.blockers && task.status === 'Blocked' && !editing && (
          <p className="mt-1 text-xs text-warning">⚠ {task.blockers}</p>
        )}
      </td>
      <td className="px-3 py-3">
        {editing ? (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            disabled={busy}
            className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s} disabled={s === 'N/A' && !isHrOrAdmin}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_TONE[task.status]}`}>
            {task.status}
          </span>
        )}
      </td>
      <td className="px-3 py-3 tabular text-sm">
        <span className={isOverdue ? 'text-danger font-medium' : 'text-ink-2'}>{dueDate}</span>
      </td>
      <td className="px-3 py-3 text-sm">
        {editing && isHrOrAdmin ? (
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">— unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        ) : (
          <span className="text-ink-2">{assigneeLabel}</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          {editing ? (
            <>
              {status === 'Blocked' && (
                <textarea
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  rows={2}
                  placeholder="Why is this blocked?"
                  className="w-full rounded border border-line-strong bg-card px-2 py-1 text-xs"
                  disabled={busy}
                />
              )}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notes (optional)"
                className="w-full rounded border border-line-strong bg-card px-2 py-1 text-xs"
                disabled={busy}
              />
              <div className="flex gap-1">
                <button
                  onClick={save}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    setStatus(task.status)
                    setNotes(task.notes)
                    setBlockers(task.blockers)
                    setAssignedTo(task.assignedTo ?? '')
                    setError(null)
                  }}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm text-ink-2 hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : canEdit ? (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
            >
              Edit
            </button>
          ) : (
            <span className="text-xs text-ink-3">Read-only</span>
          )}
          {error && <span className="text-xs text-danger">{error}</span>}
          {statusMsg && (
            <span role="status" aria-live="polite" className="text-xs text-ink-2">
              {statusMsg}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
