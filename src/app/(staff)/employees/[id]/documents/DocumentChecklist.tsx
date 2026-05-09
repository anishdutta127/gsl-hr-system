'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChecklistRow, DocumentRowStatus } from '@/lib/documents'

const STATUS_LABEL: Record<DocumentRowStatus, string> = {
  verified: 'Verified',
  uploaded: 'Awaiting verify',
  expiring: 'Expiring < 30d',
  expired: 'Expired',
  'missing-mandatory': 'Missing — mandatory',
  'missing-optional': 'Missing — optional',
}

const STATUS_TONE: Record<DocumentRowStatus, string> = {
  verified: 'bg-success-bg text-success',
  uploaded: 'bg-warning-bg text-warning',
  expiring: 'bg-warning-bg text-warning',
  expired: 'bg-danger-bg text-danger',
  'missing-mandatory': 'bg-danger-bg text-danger',
  'missing-optional': 'bg-surface text-ink-3',
}

export function DocumentChecklist({
  employeeId,
  rows,
  canEdit,
}: {
  employeeId: string
  rows: ChecklistRow[]
  canEdit: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
            <th className="px-5 py-2">Document</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Expiry</th>
            <th className="px-3 py-2">Notes</th>
            <th className="px-5 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <DocRow key={row.template.id} employeeId={employeeId} row={row} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocRow({
  employeeId,
  row,
  canEdit,
}: {
  employeeId: string
  row: ChecklistRow
  canEdit: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  function notify(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(null), 8000)
  }

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const fd = new FormData()
      fd.append('employeeId', employeeId)
      fd.append('templateId', row.template.id)
      fd.append('file', file)
      const res = await fetch('/api/admin/documents', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Upload failed: ${res.status}`)
      }
      notify('Uploaded. Document appears in the checklist once Vercel rebuilds (~2 minutes).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function toggleVerify() {
    if (!row.document) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.document.id, verified: !row.document.verified }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Update failed: ${res.status}`)
      }
      notify(
        `${row.document.verified ? 'Marked unverified' : 'Verified'}. Status updates once Vercel rebuilds (~2 minutes).`,
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  async function setExpiry(value: string) {
    if (!row.document) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.document.id,
          expiresAt: value || null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Update failed: ${res.status}`)
      }
      notify('Expiry saved. Reflects in alerts once Vercel rebuilds (~2 minutes).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!row.document) return
    if (!confirm(`Delete ${row.template.name}?`)) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch(`/api/admin/documents?id=${encodeURIComponent(row.document.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Delete failed: ${res.status}`)
      }
      notify('Deleted. The row clears once Vercel rebuilds (~2 minutes).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b border-line/50 align-top">
      <td className="px-5 py-3">
        <div className="font-medium text-ink">{row.template.name}</div>
        {row.template.applicabilityHint && (
          <div className="mt-0.5 text-xs text-ink-3">{row.template.applicabilityHint}</div>
        )}
        {row.document && (
          <div className="mt-1 text-xs text-ink-3 tabular">
            {row.document.originalFileName} · {(row.document.fileSize / 1024).toFixed(0)} KB ·
            uploaded {row.document.uploadedAt.slice(0, 10)} by {row.document.uploadedBy}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_TONE[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-ink-2 tabular">
        {row.template.hasExpiry ? (
          canEdit && row.document ? (
            <input
              type="date"
              defaultValue={row.document.expiresAt ?? ''}
              onBlur={(e) => {
                const next = e.target.value
                if (next !== (row.document?.expiresAt ?? '')) setExpiry(next)
              }}
              disabled={busy}
              className="rounded border border-line-strong bg-card px-2 py-1 text-xs"
            />
          ) : (
            row.document?.expiresAt ?? '—'
          )
        ) : (
          <span className="text-ink-3">n/a</span>
        )}
      </td>
      <td className="px-3 py-3 text-xs text-ink-3">{row.document?.notes ?? ''}</td>
      <td className="px-5 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          {row.document ? (
            <div className="flex flex-wrap gap-1">
              <a
                href={`/api/admin/documents/${encodeURIComponent(row.document.id)}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink hover:bg-surface"
              >
                View
              </a>
              {canEdit && (
                <>
                  <button
                    onClick={toggleVerify}
                    disabled={busy}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      row.document.verified
                        ? 'border border-line-strong bg-card text-ink-2 hover:bg-surface'
                        : 'bg-success text-white hover:bg-success/80'
                    } disabled:opacity-50`}
                  >
                    {row.document.verified ? 'Unverify' : 'Verify'}
                  </button>
                  <label className="rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink hover:bg-surface cursor-pointer">
                    Replace
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) upload(f)
                      }}
                    />
                  </label>
                  <button
                    onClick={remove}
                    disabled={busy}
                    className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-bg disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ) : canEdit ? (
            <label className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark cursor-pointer">
              {busy ? 'Uploading...' : 'Upload'}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload(f)
                }}
              />
            </label>
          ) : (
            <span className="text-xs text-ink-3">—</span>
          )}
          {error && <span className="text-xs text-danger">{error}</span>}
          {status && (
            <span role="status" aria-live="polite" className="text-xs text-ink-2">
              {status}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
