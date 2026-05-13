'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/*
 * Universal Sync now widget. Top-right header slot, visible to every
 * signed-in staff user.
 *
 * Closed: a plain "Sync now" button (no colour-coded freshness — we
 * learned in Ops that traffic-light indicators on this kind of state
 * just create noise). Click to open a small popover.
 *
 * Open: shows last drain timestamp + pending writes count (both fetched
 * fresh from GitHub via /api/sync/status), then the action button. Click
 * "Sync now" to dispatch the apply-queue workflow; the runner picks up
 * within ~10s and Vercel rebuilds within ~30s.
 *
 * Why this shape: HR's main complaint was "my changes jumped back to
 * Sourced." That's queue lag, not lost writes. A button on every page
 * means HR can force-drain without leaving the screen they just edited.
 */

interface SyncStatus {
  pendingCount: number
  lastDrainAt: string | null
  lastDrainSubject: string | null
  source: 'github' | 'local'
}

export function SyncNowButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<'success' | 'error'>('success')
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function loadStatus() {
    setStatusBusy(true)
    try {
      const res = await fetch('/api/sync/status', { cache: 'no-store' })
      if (res.ok) {
        const body = (await res.json()) as SyncStatus
        setStatus(body)
      }
    } catch {
      // Leave previous status; widget still works without it.
    } finally {
      setStatusBusy(false)
    }
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) void loadStatus()
  }

  async function handleSync() {
    setMessage(null)
    setBusy(true)
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        note?: string
        message?: string
      }
      if (!res.ok) {
        setTone('error')
        setMessage(body.message ?? 'Sync dispatch failed.')
      } else {
        setTone('success')
        setMessage(body.note ?? 'Sync dispatched.')
        // Re-pull status so the pending count visibly drops once the
        // drain commits land — the user sees the loop close.
        void loadStatus()
        setTimeout(() => router.refresh(), 30000)
      }
    } catch {
      setTone('error')
      setMessage("We couldn't reach our server.")
    } finally {
      setBusy(false)
      setTimeout(() => setMessage(null), 8000)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        {busy ? 'Syncing…' : 'Sync now'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sync status and trigger"
          className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-line bg-card p-3 shadow-lg"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Sync status
          </div>
          <dl className="mt-2 space-y-1.5 text-xs text-ink-2">
            <div className="flex items-center justify-between">
              <dt>Pending writes</dt>
              <dd className="font-medium tabular text-ink">
                {statusBusy && !status
                  ? 'Loading…'
                  : status
                    ? status.pendingCount
                    : '-'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Last auto-sync</dt>
              <dd className="font-medium tabular text-ink">
                {statusBusy && !status
                  ? 'Loading…'
                  : status?.lastDrainAt
                    ? formatRelative(status.lastDrainAt)
                    : 'Never'}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={busy}
            className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
          >
            {busy ? 'Dispatching…' : 'Sync now'}
          </button>

          <p className="mt-2 text-[11px] leading-snug text-ink-3">
            Forces the apply runner to drain the queue. Your saved changes
            land on the page within about 30 seconds of clicking.
          </p>

          {message && (
            <p
              role="status"
              aria-live="polite"
              className={
                tone === 'error'
                  ? 'mt-2 text-xs text-danger'
                  : 'mt-2 text-xs text-ink-2'
              }
            >
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  )
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
