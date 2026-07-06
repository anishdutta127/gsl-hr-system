'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/format'
import { HR_TASK_STATUSES, type HrTask, type HrTaskStatus } from '@/lib/types'

interface UserLite {
  id: string
  name: string
  role: string
}

const STATUS_TONE: Record<HrTaskStatus, string> = {
  'Not started': 'bg-surface text-ink-2',
  'In progress': 'bg-orange-light text-orange-dark',
  Blocked: 'bg-danger-bg text-danger',
  'Waiting on input': 'bg-warning-bg text-warning',
  Done: 'bg-success-bg text-success',
}

const INPUT =
  'rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'

export function HrTaskBoard({
  tasks: initialTasks,
  users,
  canEdit,
}: {
  tasks: HrTask[]
  users: UserLite[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<HrTask[]>(initialTasks)
  const [ownerFilter, setOwnerFilter] = useState('')
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [stageFilter, setStageFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})

  const userName = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name]))
    return (id: string | null | undefined) => (id ? (m.get(id) ?? 'Unknown') : 'Unassigned')
  }, [users])

  const filtered = useMemo(() => {
    const q = stageFilter.trim().toLowerCase()
    return tasks.filter((t) => {
      if (ownerFilter && t.ownerUserId !== ownerFilter) return false
      if (blockedOnly && !t.blocked) return false
      if (q) {
        const stage = t.stages.find((s) => s.id === t.currentStageId)?.name?.toLowerCase() ?? ''
        if (!stage.includes(q)) return false
      }
      return true
    })
  }, [tasks, ownerFilter, blockedOnly, stageFilter])

  const grouped = useMemo(() => {
    const g = {} as Record<HrTaskStatus, HrTask[]>
    for (const s of HR_TASK_STATUSES) g[s] = []
    for (const t of filtered) g[HR_TASK_STATUSES.includes(t.status) ? t.status : 'Not started'].push(t)
    return g
  }, [filtered])

  async function changeStatus(taskId: string, status: HrTaskStatus) {
    const prev = tasks
    setTasks((list) => list.map((t) => (t.id === taskId ? { ...t, status } : t)))
    setSaving((v) => ({ ...v, [taskId]: 'saving' }))
    try {
      const res = await fetch(`/api/hr-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setSaving((v) => ({ ...v, [taskId]: 'saved' }))
      router.refresh()
      window.setTimeout(() => setSaving((v) => ({ ...v, [taskId]: undefined as never })), 2000)
    } catch {
      setTasks(prev)
      setSaving((v) => ({ ...v, [taskId]: 'error' }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters + create */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-4">
        <div>
          <label htmlFor="owner-filter" className="block text-xs font-medium text-ink-2">
            Owner
          </label>
          <select id="owner-filter" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className={`mt-1 text-sm ${INPUT}`}>
            <option value="">All owners</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="stage-filter" className="block text-xs font-medium text-ink-2">
            Stage contains
          </label>
          <input
            id="stage-filter"
            type="search"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            placeholder="e.g., review"
            className={`mt-1 text-sm ${INPUT}`}
          />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={blockedOnly}
            onChange={(e) => setBlockedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong text-orange focus-visible:ring-2 focus-visible:ring-teal"
          />
          Blocked only
        </label>
        {(ownerFilter || blockedOnly || stageFilter) && (
          <button
            type="button"
            onClick={() => {
              setOwnerFilter('')
              setBlockedOnly(false)
              setStageFilter('')
            }}
            className="text-xs font-medium text-ink-2 hover:text-ink"
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="inline-flex min-h-[44px] items-center rounded bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              {showNew ? 'Close' : 'New task'}
            </button>
          )}
        </div>
      </div>

      {showNew && canEdit && (
        <NewTaskForm
          users={users}
          onCreated={(t) => {
            setTasks((list) => [...list, t])
            setShowNew(false)
            router.refresh()
          }}
        />
      )}

      {/* Grouped by status */}
      <div className="space-y-6">
        {HR_TASK_STATUSES.map((status) => (
          <section key={status} aria-labelledby={`col-${status}`}>
            <div className="mb-2 flex items-center gap-2">
              <h2 id={`col-${status}`} className="font-display text-base text-ink">
                {status}
              </h2>
              <span className="rounded-sm bg-surface px-1.5 py-0.5 text-xs tabular text-ink-3">
                {grouped[status].length}
              </span>
            </div>
            {grouped[status].length === 0 ? (
              <p className="rounded-lg border border-dashed border-line bg-card px-4 py-3 text-xs text-ink-3">
                Nothing here.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grouped[status].map((t) => (
                  <li key={t.id}>
                    <TaskCard
                      task={t}
                      ownerName={userName(t.ownerUserId)}
                      pendingWithName={t.dependency?.pendingWithUserId ? userName(t.dependency.pendingWithUserId) : null}
                      canEdit={canEdit}
                      saving={saving[t.id]}
                      onStatus={(s) => changeStatus(t.id, s)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  ownerName,
  pendingWithName,
  canEdit,
  saving,
  onStatus,
}: {
  task: HrTask
  ownerName: string
  pendingWithName: string | null
  canEdit: boolean
  saving?: 'saving' | 'saved' | 'error'
  onStatus: (s: HrTaskStatus) => void
}) {
  const doneStages = task.stages.filter((s) => s.status === 'done').length
  const overdue = task.dueDate && task.status !== 'Done' && task.dueDate < new Date().toISOString().slice(0, 10)
  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/hr-tasks/${task.id}`}
          className="font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {task.title}
        </Link>
        {task.blocked && (
          <span className="shrink-0 rounded-sm bg-danger-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger">
            Blocked
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-2">Owner: {ownerName}</p>

      {task.stages.length > 0 && (
        <p className="mt-2 text-xs text-ink-2">
          Stage {Math.min(doneStages + 1, task.stages.length)} of {task.stages.length}:{' '}
          <span className="text-ink">
            {task.stages.find((s) => s.id === task.currentStageId)?.name ??
              (doneStages === task.stages.length ? 'All stages done' : task.stages[0]?.name)}
          </span>
        </p>
      )}

      {task.dependency && (task.dependency.pendingWith || pendingWithName) && (
        <p className="mt-2 rounded border border-warning/40 bg-warning-bg px-2 py-1 text-xs text-ink-2">
          <span className="font-medium text-ink">Pending with:</span> {pendingWithName ?? task.dependency.pendingWith}
          {task.dependency.reason ? ` — ${task.dependency.reason}` : ''}
        </p>
      )}

      {task.blocked && task.blockerNote && (
        <p className="mt-2 text-xs text-danger">Blocker: {task.blockerNote}</p>
      )}

      <p className="mt-2 text-xs text-ink-2">
        Next step: {task.nextStep ? <span className="text-ink">{task.nextStep}</span> : <span className="italic text-ink-3">none defined</span>}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className={overdue ? 'text-xs font-medium text-danger' : 'text-xs text-ink-3'}>
          {task.dueDate ? `Due ${formatDate(task.dueDate)}${overdue ? ' (overdue)' : ''}` : 'No due date'}
        </span>
        {canEdit ? (
          <span className="flex items-center gap-2">
            {saving === 'saving' && <span className="text-xs text-ink-3">Saving…</span>}
            {saving === 'saved' && <span className="text-xs text-success">Saved</span>}
            {saving === 'error' && <span className="text-xs text-danger">Failed</span>}
            <label className="sr-only" htmlFor={`status-${task.id}`}>
              Status for {task.title}
            </label>
            <select
              id={`status-${task.id}`}
              value={task.status}
              onChange={(e) => onStatus(e.target.value as HrTaskStatus)}
              className="rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              {HR_TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_TONE[task.status]}`}>{task.status}</span>
        )}
      </div>
    </div>
  )
}

function NewTaskForm({
  users,
  onCreated,
}: {
  users: UserLite[]
  onCreated: (task: HrTask) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ownerUserId, setOwnerUserId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [stageNames, setStageNames] = useState('')
  const [pendingWith, setPendingWith] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Title is required.')
    setBusy(true)
    try {
      const res = await fetch('/api/hr-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          ownerUserId: ownerUserId || null,
          dueDate: dueDate || null,
          nextStep: nextStep.trim() || null,
          stageNames: stageNames
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          dependency: pendingWith.trim() ? { pendingWith: pendingWith.trim(), reason: reason.trim() } : null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'Could not create the task.')
        setBusy(false)
        return
      }
      onCreated(body.task as HrTask)
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-card p-5" aria-label="New task">
      <h2 className="font-display text-lg text-ink">New task</h2>
      <div>
        <label htmlFor="nt-title" className="block text-xs font-medium text-ink-2">
          Title *
        </label>
        <input id="nt-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 block w-full text-sm ${INPUT}`} />
      </div>
      <div>
        <label htmlFor="nt-desc" className="block text-xs font-medium text-ink-2">
          Description
        </label>
        <textarea id="nt-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`mt-1 block w-full text-sm ${INPUT}`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="nt-owner" className="block text-xs font-medium text-ink-2">
            Owner
          </label>
          <select id="nt-owner" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} className={`mt-1 block w-full text-sm ${INPUT}`}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nt-due" className="block text-xs font-medium text-ink-2">
            Due date
          </label>
          <input id="nt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`mt-1 block w-full text-sm ${INPUT}`} />
        </div>
      </div>
      <div>
        <label htmlFor="nt-stages" className="block text-xs font-medium text-ink-2">
          Sub-stages (one per line, optional)
        </label>
        <textarea
          id="nt-stages"
          rows={3}
          value={stageNames}
          onChange={(e) => setStageNames(e.target.value)}
          placeholder={'Prepare draft\nManager review\nFinalise'}
          className={`mt-1 block w-full text-sm ${INPUT}`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="nt-pending" className="block text-xs font-medium text-ink-2">
            Pending with (optional)
          </label>
          <input id="nt-pending" type="text" value={pendingWith} onChange={(e) => setPendingWith(e.target.value)} placeholder="Person or team" className={`mt-1 block w-full text-sm ${INPUT}`} />
        </div>
        <div>
          <label htmlFor="nt-reason" className="block text-xs font-medium text-ink-2">
            Reason for delay
          </label>
          <input id="nt-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1 block w-full text-sm ${INPUT}`} />
        </div>
      </div>
      <div>
        <label htmlFor="nt-next" className="block text-xs font-medium text-ink-2">
          Next step (leave blank if none defined)
        </label>
        <input id="nt-next" type="text" value={nextStep} onChange={(e) => setNextStep(e.target.value)} className={`mt-1 block w-full text-sm ${INPUT}`} />
      </div>
      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[44px] items-center rounded bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-60"
      >
        {busy ? 'Creating…' : 'Create task'}
      </button>
    </form>
  )
}
