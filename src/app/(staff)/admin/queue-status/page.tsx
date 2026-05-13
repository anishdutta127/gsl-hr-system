import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { findLastDrainCommit, readRepoFile } from '@/lib/queue/githubQueue'
import type { PendingUpdate } from '@/lib/types'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

interface QueueSnapshot {
  pendingCount: number
  pending: PendingUpdate[]
  applied: AppliedEntry[]
  failed: FailedEntry[]
  lastDrainAt: string | null
  lastDrainSubject: string | null
  source: 'github' | 'local'
}

interface AppliedEntry extends PendingUpdate {
  appliedAt?: string
}

interface FailedEntry extends PendingUpdate {
  failedAt?: string
  failureReason?: string
}

export default async function QueueStatusPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin') redirect('/')

  const snapshot = await loadSnapshot()

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Queue status</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Live view of the apply-queue pipeline. Pending writes are sitting in
          GitHub waiting for the apply runner to drain. Anyone can click Sync
          now from the top-right of the page to dispatch the runner.
        </p>
        {snapshot.source === 'local' && (
          <div
            role="status"
            className="mt-3 inline-block rounded border border-warning bg-warning-bg px-3 py-1.5 text-xs text-ink"
          >
            Reading bundled JSON (no GitHub PAT). Numbers may be stale until
            the next deploy.
          </div>
        )}
      </div>

      <section
        aria-labelledby="kpi-heading"
        className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <h2 id="kpi-heading" className="sr-only">
          At a glance
        </h2>
        <Kpi
          label="Pending writes"
          value={snapshot.pendingCount.toLocaleString('en-IN')}
          tint={snapshot.pendingCount > 0 ? 'warning' : 'success'}
        />
        <Kpi
          label="Last auto-sync"
          value={
            snapshot.lastDrainAt ? formatRelative(snapshot.lastDrainAt) : 'Never'
          }
          tint="neutral"
        />
        <Kpi
          label="Last failed"
          value={snapshot.failed.length > 0 ? snapshot.failed.length.toLocaleString('en-IN') : '0'}
          tint={snapshot.failed.length > 0 ? 'danger' : 'neutral'}
        />
      </section>

      <section aria-labelledby="pending-heading" className="mb-10">
        <h2
          id="pending-heading"
          className="mb-3 font-display text-lg text-ink"
        >
          Pending ({snapshot.pendingCount})
        </h2>
        {snapshot.pending.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            Queue is empty. Latest writes have already drained.
          </div>
        ) : (
          <EntriesTable
            entries={snapshot.pending.map((e) => ({
              id: e.id,
              when: e.queuedAt,
              who: e.queuedBy,
              entity: e.entity,
              operation: payloadOperation(e),
              note: payloadNote(e),
            }))}
          />
        )}
      </section>

      <section aria-labelledby="applied-heading" className="mb-10">
        <h2
          id="applied-heading"
          className="mb-3 font-display text-lg text-ink"
        >
          Recently applied (last 25)
        </h2>
        {snapshot.applied.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No recently applied entries.
          </div>
        ) : (
          <EntriesTable
            entries={snapshot.applied.map((e) => ({
              id: e.id,
              when: e.appliedAt ?? e.queuedAt,
              who: e.queuedBy,
              entity: e.entity,
              operation: payloadOperation(e),
              note: payloadNote(e),
            }))}
          />
        )}
      </section>

      <section aria-labelledby="failed-heading">
        <h2
          id="failed-heading"
          className="mb-3 font-display text-lg text-ink"
        >
          Failed (last {snapshot.failed.length})
        </h2>
        {snapshot.failed.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No failures on record. Apply runner has been clean.
          </div>
        ) : (
          <EntriesTable
            entries={snapshot.failed.map((e) => ({
              id: e.id,
              when: e.failedAt ?? e.queuedAt,
              who: e.queuedBy,
              entity: e.entity,
              operation: payloadOperation(e),
              note: e.failureReason ?? payloadNote(e),
            }))}
            tone="danger"
          />
        )}
      </section>
    </div>
  )
}

function payloadOperation(entry: PendingUpdate): string {
  const inner =
    entry.payload && typeof entry.payload === 'object'
      ? (entry.payload as Record<string, unknown>).operation
      : undefined
  return typeof inner === 'string' && inner ? inner : entry.operation
}

function payloadNote(entry: PendingUpdate): string {
  if (!entry.payload || typeof entry.payload !== 'object') return ''
  const p = entry.payload as Record<string, unknown>
  if (typeof p.notes === 'string' && p.notes) return p.notes
  const after = p.after
  if (after && typeof after === 'object') {
    const a = after as Record<string, unknown>
    if (typeof a.currentStage === 'string') return `→ ${a.currentStage}`
    if (typeof a.status === 'string') return `→ ${a.status}`
  }
  if (typeof p.id === 'string') return p.id.slice(0, 8)
  return ''
}

async function loadSnapshot(): Promise<QueueSnapshot> {
  const [pendingFromRemote, lastDrain] = await Promise.all([
    readRepoFile('src/data/pending_updates.json').catch(() => null),
    findLastDrainCommit().catch(() => null),
  ])

  let pending: PendingUpdate[] = []
  let source: 'github' | 'local' = 'local'

  if (pendingFromRemote !== null) {
    try {
      const parsed = JSON.parse(pendingFromRemote) as PendingUpdate[]
      if (Array.isArray(parsed)) {
        pending = parsed
        source = 'github'
      }
    } catch {
      // Fall through.
    }
  }

  if (source === 'local') {
    pending = readLocalJson<PendingUpdate[]>('pending_updates.json', [])
  }

  const applied = readLocalJson<AppliedEntry[]>('applied_updates.json', [])
    .slice(-25)
    .reverse()
  const failed = readLocalJson<FailedEntry[]>('failed_updates.json', [])
    .slice(-25)
    .reverse()

  return {
    pendingCount: pending.length,
    pending,
    applied,
    failed,
    lastDrainAt: lastDrain?.date ?? null,
    lastDrainSubject: lastDrain?.message ?? null,
    source,
  }
}

function readLocalJson<T>(filename: string, fallback: T): T {
  const file = path.join(process.cwd(), 'src', 'data', filename)
  try {
    if (!fs.existsSync(file)) return fallback
    const text = fs.readFileSync(file, 'utf-8')
    if (!text.trim()) return fallback
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '-'
  const diff = Date.now() - t
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.round(hr / 24)
  return `${day} day${day === 1 ? '' : 's'} ago`
}

function Kpi({
  label,
  value,
  tint,
}: {
  label: string
  value: string
  tint: 'success' | 'warning' | 'danger' | 'neutral'
}) {
  const tintClass: Record<typeof tint, string> = {
    success: 'border-success bg-success-bg/50',
    warning: 'border-warning bg-warning-bg',
    danger: 'border-danger bg-danger-bg',
    neutral: 'border-line bg-card',
  }
  return (
    <div className={`rounded-lg border p-4 ${tintClass[tint]}`}>
      <div className="text-xs uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl text-ink tabular">{value}</div>
    </div>
  )
}

interface EntryRow {
  id: string
  when: string
  who: string
  entity: string
  operation: string
  note: string
}

function EntriesTable({
  entries,
  tone = 'neutral',
}: {
  entries: EntryRow[]
  tone?: 'neutral' | 'danger'
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Who</th>
              <th className="px-4 py-2 text-left">Entity</th>
              <th className="px-4 py-2 text-left">Operation</th>
              <th className="px-4 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((e) => (
              <tr key={e.id} className={tone === 'danger' ? 'text-danger' : 'text-ink-2'}>
                <td className="px-4 py-2 tabular text-xs text-ink-3">
                  {formatRelative(e.when)}
                </td>
                <td className="px-4 py-2 text-xs">{e.who}</td>
                <td className="px-4 py-2 text-xs font-medium text-ink">{e.entity}</td>
                <td className="px-4 py-2 text-xs">{e.operation}</td>
                <td className="px-4 py-2 text-xs">{e.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
