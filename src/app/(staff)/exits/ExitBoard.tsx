'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/format'
import { CloseExitDialog } from './CloseExitDialog'

export interface BoardRow {
  employeeId: string
  name: string
  designation: string | null
  department: string | null
  lastWorkingDay: string | null
  percent: number
  isComplete: boolean
  group: 'in-progress' | 'alumni' | 'legacy'
  /** Whether an ExitProcess (checklist) backs this row. Legacy rows: false. */
  hasChecklist: boolean
  closedAt: string | null
  closeReason: string | null
  /** Sort key for the Alumni group (close or completion time). */
  archivedAt: string | null
  /** Mandatory steps still outstanding, shown in the close confirmation. */
  outstandingSteps: string[]
  canReopen: boolean
}

const byName = (a: BoardRow, b: BoardRow) => a.name.localeCompare(b.name)
const byArchivedDesc = (a: BoardRow, b: BoardRow) =>
  (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')

export function ExitBoard({
  rows: initialRows,
  canEdit,
}: {
  rows: BoardRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = useState<BoardRow[]>(initialRows)
  const [closing, setClosing] = useState<BoardRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)

  // Adopt fresh server truth after each router.refresh(); local optimistic
  // edits hold until then because initialRows only changes on a server render.
  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  const inProgress = useMemo(() => rows.filter((r) => r.group === 'in-progress').sort(byName), [rows])
  const legacy = useMemo(() => rows.filter((r) => r.group === 'legacy').sort(byName), [rows])
  const alumni = useMemo(() => rows.filter((r) => r.group === 'alumni').sort(byArchivedDesc), [rows])

  async function confirmClose(reason: string) {
    const row = closing
    if (!row) return
    setBusyId(row.employeeId)
    setCloseError(null)
    try {
      const res = await fetch(`/api/admin/exits/${row.employeeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Could not close the exit.')
      const nowIso = new Date().toISOString()
      // Optimistic: the row leaves the active list and lands in Alumni now.
      setRows((list) =>
        list.map((r) =>
          r.employeeId === row.employeeId
            ? {
                ...r,
                group: 'alumni',
                hasChecklist: true,
                closedAt: nowIso,
                closeReason: reason || null,
                archivedAt: nowIso,
                canReopen: canEdit,
              }
            : r,
        ),
      )
      setClosing(null)
      router.refresh()
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Could not close the exit.')
    } finally {
      setBusyId(null)
    }
  }

  async function reopen(row: BoardRow) {
    if (!window.confirm(`Reopen the exit for ${row.name}? It returns to the active board.`)) return
    setBusyId(row.employeeId)
    try {
      const res = await fetch(`/api/admin/exits/${row.employeeId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Could not reopen the exit.')
      setRows((list) =>
        list.map((r) =>
          r.employeeId === row.employeeId
            ? { ...r, group: 'in-progress', closedAt: null, closeReason: null, archivedAt: null, canReopen: false }
            : r,
        ),
      )
      router.refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not reopen the exit.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="In progress" value={inProgress.length} tone={inProgress.length > 0 ? 'warning' : 'ok'} />
        <Stat label="Alumni" value={alumni.length} tone="ok" />
        <Stat label="No checklist" value={legacy.length} tone={legacy.length > 0 ? 'muted' : 'ok'} />
      </div>

      <Section title={`In progress (${inProgress.length})`}>
        {inProgress.length === 0 ? (
          <Empty>No exits in progress.</Empty>
        ) : (
          <List>
            {inProgress.map((row) => (
              <ExitRow
                key={row.employeeId}
                row={row}
                canEdit={canEdit}
                busy={busyId === row.employeeId}
                onClose={() => setClosing(row)}
                onReopen={() => reopen(row)}
              />
            ))}
          </List>
        )}
      </Section>

      {legacy.length > 0 && (
        <Section title={`Exited, no checklist (${legacy.length})`}>
          <List>
            {legacy.map((row) => (
              <ExitRow
                key={row.employeeId}
                row={row}
                canEdit={canEdit}
                busy={busyId === row.employeeId}
                onClose={() => setClosing(row)}
                onReopen={() => reopen(row)}
              />
            ))}
          </List>
        </Section>
      )}

      {alumni.length > 0 && (
        <Section title={`Alumni (${alumni.length})`}>
          <List>
            {alumni.map((row) => (
              <ExitRow
                key={row.employeeId}
                row={row}
                canEdit={canEdit}
                busy={busyId === row.employeeId}
                onClose={() => setClosing(row)}
                onReopen={() => reopen(row)}
              />
            ))}
          </List>
        </Section>
      )}

      {closing && (
        <CloseExitDialog
          employeeName={closing.name}
          outstandingSteps={closing.outstandingSteps}
          busy={busyId === closing.employeeId}
          error={closeError}
          onConfirm={confirmClose}
          onCancel={() => {
            setClosing(null)
            setCloseError(null)
          }}
        />
      )}
    </>
  )
}

function ExitRow({
  row,
  canEdit,
  busy,
  onClose,
  onReopen,
}: {
  row: BoardRow
  canEdit: boolean
  busy: boolean
  onClose: () => void
  onReopen: () => void
}) {
  const archived = row.group === 'alumni'
  const isLegacy = row.group === 'legacy'
  return (
    <li className="flex items-stretch">
      <Link
        href={`/exits/${row.employeeId}`}
        className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{row.name}</span>
          <span className="block text-xs text-ink-2">
            {[row.designation, row.department].filter(Boolean).join(' · ')}
            {row.lastWorkingDay ? ` · LWD ${formatDate(row.lastWorkingDay)}` : ''}
          </span>
          {archived && row.closeReason && (
            <span className="mt-0.5 block text-xs text-ink-3">Closed: {row.closeReason}</span>
          )}
        </span>
        {isLegacy ? (
          <span className="shrink-0 text-xs font-medium text-orange-dark">
            {canEdit ? 'Start checklist →' : 'View →'}
          </span>
        ) : (
          <span className="flex w-40 items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-line" aria-hidden="true">
              <span
                className={row.isComplete ? 'block h-full bg-success' : 'block h-full bg-orange'}
                style={{ width: `${row.percent}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-xs tabular text-ink-2">{row.percent}%</span>
          </span>
        )}
      </Link>
      {canEdit && (
        <div className="flex shrink-0 items-center border-l border-line px-3">
          {archived ? (
            row.closedAt ? (
              row.canReopen ? (
                <button
                  type="button"
                  onClick={onReopen}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded px-2 text-xs font-medium text-navy hover:underline disabled:opacity-60"
                >
                  {busy ? 'Reopening…' : 'Reopen'}
                </button>
              ) : (
                <span className="px-2 text-xs text-ink-3">Closed</span>
              )
            ) : (
              <span className="px-2 text-xs text-ink-3">Complete</span>
            )
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded px-2 text-xs font-medium text-orange-dark hover:underline disabled:opacity-60"
            >
              {busy ? 'Closing…' : 'Close exit'}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">{children}</ul>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8" aria-label={title}>
      <h2 className="mb-3 font-display text-lg text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
      {children}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warning' | 'muted' }) {
  const color = tone === 'warning' ? 'text-orange-dark' : tone === 'muted' ? 'text-ink-3' : 'text-success'
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className={`font-display text-3xl tabular ${color}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}
