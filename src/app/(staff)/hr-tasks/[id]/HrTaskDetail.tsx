'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, formatRelative } from '@/lib/format'
import { HR_TASK_STATUSES, type HrTask, type HrTaskStatus } from '@/lib/types'

interface UserLite {
  id: string
  name: string
  role: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const INPUT =
  'mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'

const ACTION_LABEL: Record<string, string> = {
  'hr-task.create': 'Task created',
  'hr-task.update': 'Updated',
  'hr-task.advance-stage': 'Advanced stage',
  'hr-task.add-stage': 'Added stage',
  'hr-task.update-stage': 'Updated stage',
  'hr-task.remove-stage': 'Removed stage',
}

export function HrTaskDetail({
  task: initial,
  users,
  canEdit,
  canDelete,
}: {
  task: HrTask
  users: UserLite[]
  canEdit: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [task, setTask] = useState<HrTask>(initial)
  const [save, setSave] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [newStage, setNewStage] = useState('')

  const userName = (id: string | null | undefined) =>
    id ? (users.find((u) => u.id === id)?.name ?? 'Unknown') : 'Unassigned'

  async function patch(body: Record<string, unknown>, optimistic?: Partial<HrTask>) {
    if (!canEdit) return
    const prev = task
    if (optimistic) setTask((t) => ({ ...t, ...optimistic }))
    setSave('saving')
    setError(null)
    try {
      const res = await fetch(`/api/hr-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? 'Save failed. Retry, or WhatsApp Anish.')
      if (data.task) setTask(data.task as HrTask)
      setSave('saved')
      router.refresh()
      window.setTimeout(() => setSave('idle'), 2000)
    } catch (err) {
      setTask(prev)
      setSave('error')
      setError(err instanceof Error ? err.message : 'Save failed.')
    }
  }

  async function remove() {
    if (!window.confirm('Delete this task permanently?')) return
    try {
      const res = await fetch(`/api/hr-tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.push('/hr-tasks')
    } catch {
      setError('Could not delete the task.')
    }
  }

  const orderedStages = [...task.stages].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {canEdit ? (
            <input
              aria-label="Task title"
              defaultValue={task.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && patch({ title: e.target.value.trim() }, { title: e.target.value.trim() })}
              className="w-full max-w-xl rounded border border-transparent bg-transparent px-1 font-display text-2xl text-ink hover:border-line focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
          ) : (
            <h1 className="font-display text-2xl text-ink">{task.title}</h1>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={save} />
          <StatusControl task={task} canEdit={canEdit} onChange={(s) => patch({ status: s }, { status: s })} />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Description */}
          <Field label="Description">
            {canEdit ? (
              <textarea
                rows={3}
                defaultValue={task.description}
                onBlur={(e) => e.target.value !== task.description && patch({ description: e.target.value })}
                className={INPUT}
              />
            ) : (
              <p className="text-sm text-ink-2">{task.description || '-'}</p>
            )}
          </Field>

          {/* Stages */}
          <section className="rounded-lg border border-line bg-card p-5">
            <h2 className="font-display text-base text-ink">Stages</h2>
            {orderedStages.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Single-stage task (no sub-stages).</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {orderedStages.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-3 py-2 text-sm">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                        s.status === 'done'
                          ? 'bg-success text-white'
                          : s.status === 'current'
                            ? 'bg-orange text-white'
                            : 'bg-line text-ink-3'
                      }`}
                      aria-hidden="true"
                    >
                      {s.order}
                    </span>
                    <span className="flex-1 text-ink">{s.name}</span>
                    {canEdit ? (
                      <>
                        <select
                          aria-label={`Status for ${s.name}`}
                          value={s.status}
                          onChange={(e) => patch({ action: 'update-stage', stageId: s.id, stageStatus: e.target.value })}
                          className="rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                        >
                          <option value="pending">pending</option>
                          <option value="current">current</option>
                          <option value="done">done</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => patch({ action: 'remove-stage', stageId: s.id })}
                          className="text-xs text-danger hover:underline"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-ink-3">{s.status}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                {orderedStages.some((s) => s.status !== 'done') && (
                  <button
                    type="button"
                    onClick={() => patch({ action: 'advance-stage' })}
                    className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
                  >
                    Advance to next stage
                  </button>
                )}
                <span className="flex flex-1 gap-2">
                  <input
                    aria-label="New stage name"
                    type="text"
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    placeholder="Add a stage"
                    className="min-w-[160px] flex-1 rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newStage.trim()) {
                        patch({ action: 'add-stage', stageName: newStage.trim() })
                        setNewStage('')
                      }
                    }}
                    disabled={!newStage.trim()}
                    className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
                  >
                    Add
                  </button>
                </span>
              </div>
            )}
          </section>

          {/* Dependency */}
          <section className="rounded-lg border border-line bg-card p-5">
            <h2 className="font-display text-base text-ink">Pending with</h2>
            <p className="mt-1 text-xs text-ink-3">Who the task is waiting on, and why.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Person or team">
                {canEdit ? (
                  <input
                    type="text"
                    defaultValue={task.dependency?.pendingWith ?? ''}
                    onBlur={(e) =>
                      patch({
                        dependency: e.target.value.trim()
                          ? { pendingWith: e.target.value.trim(), pendingWithUserId: task.dependency?.pendingWithUserId ?? null, reason: task.dependency?.reason ?? '' }
                          : null,
                      })
                    }
                    className={INPUT}
                  />
                ) : (
                  <p className="text-sm text-ink-2">{task.dependency?.pendingWith || '-'}</p>
                )}
              </Field>
              <Field label="Linked staff (optional)">
                {canEdit ? (
                  <select
                    value={task.dependency?.pendingWithUserId ?? ''}
                    onChange={(e) =>
                      patch({
                        dependency: {
                          pendingWith: task.dependency?.pendingWith || (e.target.value ? userName(e.target.value) : ''),
                          pendingWithUserId: e.target.value || null,
                          reason: task.dependency?.reason ?? '',
                        },
                      })
                    }
                    className={INPUT}
                  >
                    <option value="">None</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-ink-2">{task.dependency?.pendingWithUserId ? userName(task.dependency.pendingWithUserId) : '-'}</p>
                )}
              </Field>
            </div>
            <Field label="Reason for delay">
              {canEdit ? (
                <textarea
                  rows={2}
                  defaultValue={task.dependency?.reason ?? ''}
                  onBlur={(e) =>
                    patch({
                      dependency: {
                        pendingWith: task.dependency?.pendingWith ?? '',
                        pendingWithUserId: task.dependency?.pendingWithUserId ?? null,
                        reason: e.target.value,
                      },
                    })
                  }
                  className={INPUT}
                />
              ) : (
                <p className="text-sm text-ink-2">{task.dependency?.reason || '-'}</p>
              )}
            </Field>
          </section>

          {/* Activity log */}
          <section className="rounded-lg border border-line bg-card p-5">
            <h2 className="font-display text-base text-ink">Activity</h2>
            <ul className="mt-3 space-y-2">
              {[...task.auditLog].reverse().map((a, i) => (
                <li key={i} className="flex gap-2 border-l-2 border-line pl-3 text-sm">
                  <span className="text-ink">{ACTION_LABEL[a.action] ?? a.action}</span>
                  <span className="text-ink-3">
                    · {a.user} · {formatRelative(a.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Sidebar: owner / due / blocker / next step */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-card p-5">
            <Field label="Owner">
              {canEdit ? (
                <select
                  value={task.ownerUserId ?? ''}
                  onChange={(e) => patch({ ownerUserId: e.target.value || null }, { ownerUserId: e.target.value || null })}
                  className={INPUT}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-ink-2">{userName(task.ownerUserId)}</p>
              )}
            </Field>
            <Field label="Due date">
              {canEdit ? (
                <input
                  type="date"
                  defaultValue={task.dueDate ?? ''}
                  onBlur={(e) => e.target.value !== (task.dueDate ?? '') && patch({ dueDate: e.target.value || null })}
                  className={INPUT}
                />
              ) : (
                <p className="text-sm text-ink-2">{task.dueDate ? formatDate(task.dueDate) : 'None'}</p>
              )}
            </Field>
          </div>

          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="font-display text-base text-ink">Blocker</h2>
            {canEdit ? (
              <>
                <label className="mt-2 flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={task.blocked}
                    onChange={(e) => patch({ blocked: e.target.checked }, { blocked: e.target.checked })}
                    className="h-4 w-4 rounded border-line-strong text-danger focus-visible:ring-2 focus-visible:ring-teal"
                  />
                  Blocked
                </label>
                <textarea
                  aria-label="Blocker note"
                  rows={2}
                  defaultValue={task.blockerNote}
                  onBlur={(e) => e.target.value !== task.blockerNote && patch({ blockerNote: e.target.value })}
                  placeholder="What's blocking it?"
                  className={INPUT}
                />
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-2">
                {task.blocked ? `Blocked: ${task.blockerNote || 'no note'}` : 'Not blocked'}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="font-display text-base text-ink">Next step</h2>
            <p className="mt-1 text-xs text-ink-3">Leave blank if there is no defined next step.</p>
            {canEdit ? (
              <textarea
                aria-label="Next step"
                rows={2}
                defaultValue={task.nextStep ?? ''}
                onBlur={(e) => patch({ nextStep: e.target.value.trim() || null })}
                className={INPUT}
              />
            ) : (
              <p className="mt-2 text-sm text-ink-2">{task.nextStep || 'None defined'}</p>
            )}
          </div>

          {canDelete && (
            <button type="button" onClick={remove} className="text-xs font-medium text-danger hover:underline">
              Delete task
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <span className="block text-xs font-medium text-ink-2">{label}</span>
      {children}
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const map: Record<Exclude<SaveState, 'idle'>, { text: string; cls: string }> = {
    saving: { text: 'Saving…', cls: 'text-ink-3' },
    saved: { text: 'Saved', cls: 'text-success' },
    error: { text: 'Save failed', cls: 'text-danger' },
  }
  const m = map[state]
  return (
    <span className={`text-xs ${m.cls}`} role="status">
      {m.text}
    </span>
  )
}

function StatusControl({
  task,
  canEdit,
  onChange,
}: {
  task: HrTask
  canEdit: boolean
  onChange: (s: HrTaskStatus) => void
}) {
  if (!canEdit) {
    return (
      <span className="rounded-sm bg-surface px-2 py-0.5 text-xs font-medium text-ink-2">{task.status}</span>
    )
  }
  return (
    <select
      aria-label="Task status"
      value={task.status}
      onChange={(e) => onChange(e.target.value as HrTaskStatus)}
      className="rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
    >
      {HR_TASK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}
