'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/*
 * Admin-only affordance that force-dispatches the apply-queue workflow.
 * The cron runs every 5 minutes, but GitHub can delay scheduled workflows
 * up to 15 minutes; this button bypasses the cron entirely. Renders only
 * when the parent passes role='Admin'.
 */
export function SyncNowButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<'success' | 'error'>('success')

  async function handleClick() {
    setMessage(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/sync-now', { method: 'POST' })
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
        router.refresh()
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
    <div className="mb-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="w-full rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
      >
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
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
  )
}
