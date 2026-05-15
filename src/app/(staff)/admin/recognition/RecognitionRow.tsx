'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Recognition } from '@/lib/types'
import { validateWriteup } from '@/lib/recognitionState'

interface Props {
  recognition: Recognition
  employeeName: string
  employeeDesignation: string
  nominatorName: string
  statusToneClass: string
}

const WRITEUP_PREVIEW_CHARS = 200

export function RecognitionRow(props: Props) {
  const { recognition: rec } = props
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftWriteup, setDraftWriteup] = useState(rec.writeup)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const writeup = rec.writeup
  const isLong = writeup.length > WRITEUP_PREVIEW_CHARS
  const previewText = expanded || !isLong ? writeup : writeup.slice(0, WRITEUP_PREVIEW_CHARS) + '…'

  const isNominated = rec.status === 'Nominated'

  async function approve() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/recognition/${rec.id}/approve`, {
          method: 'POST',
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'Could not approve. Try again.')
          return
        }
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  async function reject() {
    setError(null)
    if (!rejectReason.trim()) {
      setError('Add a short reason so the audit log captures why.')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/recognition/${rec.id}/approve?action=reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: rejectReason.trim() }),
          },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'Could not reject. Try again.')
          return
        }
        setShowRejectInput(false)
        setRejectReason('')
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  async function saveEdit() {
    setError(null)
    const v = validateWriteup(draftWriteup)
    if (v) {
      setError(v)
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/recognition/${rec.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ writeup: draftWriteup.trim() }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'Could not save. Try again.')
          return
        }
        setEditing(false)
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  return (
    <article className="rounded-lg border border-line bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base text-ink">{props.employeeName}</h3>
          <p className="mt-0.5 text-xs text-ink-3">
            {props.employeeDesignation && <>{props.employeeDesignation} - </>}
            {rec.department} - {rec.category}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3 emp-id">{rec.id}</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${props.statusToneClass}`}
          >
            {rec.status}
          </span>
        </div>
      </header>

      <div className="mt-3">
        {!editing && (
          <p className="whitespace-pre-wrap text-sm text-ink">{previewText}</p>
        )}
        {!editing && isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs text-navy underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        {editing && (
          <div>
            <label htmlFor={`edit-${rec.id}`} className="sr-only">
              Edit write-up
            </label>
            <textarea
              id={`edit-${rec.id}`}
              value={draftWriteup}
              onChange={(e) => setDraftWriteup(e.target.value)}
              rows={8}
              maxLength={850}
              className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
            <p className="mt-1 text-xs text-ink-3">
              {draftWriteup.trim().length} / 800 characters
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save write-up'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraftWriteup(rec.writeup)
                }}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm text-ink-2 hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span>
          Nominated by {props.nominatorName} on {rec.nominatedAt.slice(0, 10)}
        </span>
        <div className="flex flex-wrap gap-2">
          {(rec.status === 'Approved' || rec.status === 'Published') && (
            <>
              <Link
                href={`/recognition/${rec.id}/card`}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                View card
              </Link>
              <Link
                href={`/admin/recognition/${rec.id}`}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                Manage public share
              </Link>
              {rec.publicShareEnabled && (
                <span className="inline-flex items-center rounded bg-teal-light px-2 py-1 text-[10px] font-medium text-teal-dark">
                  Public · {rec.viewCount ?? 0} views
                </span>
              )}
            </>
          )}
          {isNominated && !editing && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(true)
                  setDraftWriteup(rec.writeup)
                }}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                Edit write-up
              </button>
              <button
                type="button"
                onClick={() => setShowRejectInput((v) => !v)}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded border border-danger bg-danger-bg px-3 py-1.5 text-sm font-medium text-danger hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded bg-success px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
              >
                {busy ? 'Working…' : 'Approve'}
              </button>
            </>
          )}
        </div>
      </footer>

      {showRejectInput && isNominated && (
        <div className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2">
          <label htmlFor={`reject-${rec.id}`} className="block text-xs font-medium text-danger">
            Reason for rejecting
          </label>
          <textarea
            id={`reject-${rec.id}`}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            placeholder="e.g., already recognised last month; write-up needs more detail"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={busy}
              className="inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? 'Working…' : 'Archive with reason'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectInput(false)
                setRejectReason('')
              }}
              className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm text-ink-2 hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-2 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
    </article>
  )
}
