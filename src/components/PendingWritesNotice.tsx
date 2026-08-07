'use client'

/*
 * "Saved, not yet visible" banner for queue-backed boards.
 *
 * THE INCIDENT THIS EXISTS FOR (2026-08-07): HR created three roles. The
 * queue accepted all three, the UI reported success, and the board showed
 * nothing, because the apply runner had not drained yet. There was no way to
 * tell a saved-but-pending write from a failed one, so the roles were
 * reported as lost. Measured drain latency that day was 40 to 75 minutes.
 *
 * This component closes that gap: while anything for this entity sits in the
 * queue, the board says so, names the records, and offers Sync now.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PendingSummaryItem } from '@/lib/queue/pendingSummary'

interface SyncStatusResponse {
  entityPendingCount?: number
  entityPendingItems?: PendingSummaryItem[]
}

const POLL_INTERVAL_MS = 20_000

export function PendingWritesNotice({
  entity,
  noun,
}: {
  /** Queue entity to narrow to, e.g. "role". */
  entity: string
  /** Singular noun for the copy, e.g. "role". */
  noun: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<PendingSummaryItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sync/status?entity=${encodeURIComponent(entity)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as SyncStatusResponse
      const next = Array.isArray(data.entityPendingItems) ? data.entityPendingItems : []
      setItems((previous) => {
        // The queue just went empty: the drain landed, so pull fresh rows in.
        if (previous.length > 0 && next.length === 0) router.refresh()
        return next
      })
    } catch {
      // Network hiccup: leave the last known state rather than flapping.
    }
  }, [entity, router])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setMessage(
        res.ok
          ? 'Sync started. This board refreshes automatically once the changes land.'
          : (body.message ?? 'Could not start the sync. Try again in a moment.'),
      )
    } catch {
      setMessage('Could not reach the server. Try again in a moment.')
    } finally {
      setSyncing(false)
    }
  }

  if (items.length === 0) return null

  const plural = items.length === 1 ? `${noun} change is` : `${noun} changes are`

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 rounded-lg border border-warning bg-warning-bg px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            {items.length} {plural} saved but not yet showing here.
          </p>
          <p className="mt-1 text-sm text-ink-2">
            Your changes are safe. They appear once the sync runs, which can take up to an hour
            during the working day. Click Sync now to apply them immediately.
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
            {items.map((item) => (
              <li key={item.id}>
                <span className="font-medium text-ink">{item.label}</span>
                <span className="text-ink-2"> ({item.action})</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-ink-2">
          {message}
        </p>
      )}
    </div>
  )
}
