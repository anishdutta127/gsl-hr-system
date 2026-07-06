'use client'

import { cloneElement, isValidElement, useId, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, Trash2 } from 'lucide-react'
import type { ExitInterviewDocumentFile } from '@/lib/types'

interface Initial {
  reasonForLeaving: string
  wouldRecommend: 'Yes' | 'No' | 'Maybe' | null
  satisfactionWithManager: 1 | 2 | 3 | 4 | 5 | null
  satisfactionWithRole: 1 | 2 | 3 | 4 | 5 | null
  topThingsToChange: string
  freeText: string
  conductedAt?: string
  conductedBy?: string
}

/** Extract the storage fileId from a repo path like
 *  data/exit-interview-docs/<emp>/<fileId>.<ext>. */
function fileIdOf(storageRef: string): string {
  const base = storageRef.split('/').pop() ?? ''
  return base.replace(/\.[^.]+$/, '')
}

export function ExitInterviewForm({
  employeeId,
  initial,
  canEdit,
  canonicalReason,
  initialDocument,
}: {
  employeeId: string
  initial: Initial
  canEdit: boolean
  /** The canonical exit reason (employee.exit.reason / ExitProcess), set at
   *  initiation - shown read-only here; this form never edits it. */
  canonicalReason: string
  initialDocument: ExitInterviewDocumentFile | null
}) {
  const [form, setForm] = useState({
    wouldRecommend: initial.wouldRecommend,
    satisfactionWithManager: initial.satisfactionWithManager,
    satisfactionWithRole: initial.satisfactionWithRole,
    topThingsToChange: initial.topThingsToChange,
    freeText: initial.freeText,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const router = useRouter()

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch(
        `/api/admin/offboarding/exit-interview/${encodeURIComponent(employeeId)}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) },
      )
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Save failed: ${res.status}`)
      setStatusMsg(data.note ?? 'Saved.')
      setTimeout(() => setStatusMsg(null), 12000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-card p-5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-3">Reason for leaving</h3>
        <p className="mt-1 text-sm text-ink">{canonicalReason?.trim() || 'Not recorded at initiation.'}</p>
        <p className="mt-1 text-xs text-ink-3">
          The canonical reason, captured when the exit was initiated. Edit it from the initiate step, not here.
        </p>
      </div>

      <ExitInterviewDocument
        employeeId={employeeId}
        canEdit={canEdit}
        initialDocument={initialDocument}
      />

      <form onSubmit={save} className="rounded-lg border border-line bg-card p-5">
        {initial.conductedAt && (
          <p className="mb-3 text-xs text-ink-3">
            First conducted {initial.conductedAt.slice(0, 10)} by {initial.conductedBy}. Subsequent edits
            add audit entries.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Would recommend GSL?">
            <select
              value={form.wouldRecommend ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, wouldRecommend: (e.target.value || null) as Initial['wouldRecommend'] }))
              }
              disabled={!canEdit || busy}
              className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              <option value="Yes">Yes</option>
              <option value="Maybe">Maybe</option>
              <option value="No">No</option>
            </select>
          </Field>
          <Field label="Satisfaction with manager (1-5)">
            <select
              value={form.satisfactionWithManager ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  satisfactionWithManager: e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5) : null,
                }))
              }
              disabled={!canEdit || busy}
              className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Satisfaction with role (1-5)">
            <select
              value={form.satisfactionWithRole ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  satisfactionWithRole: e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5) : null,
                }))
              }
              disabled={!canEdit || busy}
              className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Top 3 things you would change" full>
            <textarea
              value={form.topThingsToChange}
              onChange={(e) => setForm((f) => ({ ...f, topThingsToChange: e.target.value }))}
              rows={3}
              disabled={!canEdit || busy}
              className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Other notes / free text" full>
            <textarea
              value={form.freeText}
              onChange={(e) => setForm((f) => ({ ...f, freeText: e.target.value }))}
              rows={4}
              disabled={!canEdit || busy}
              className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            />
          </Field>
          {canEdit && (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Save exit interview'}
              </button>
              {statusMsg && (
                <span role="status" aria-live="polite" className="text-xs text-ink-2">
                  {statusMsg}
                </span>
              )}
              {error && (
                <span role="alert" className="text-xs text-danger">
                  {error}
                </span>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  )
}

function ExitInterviewDocument({
  employeeId,
  canEdit,
  initialDocument,
}: {
  employeeId: string
  canEdit: boolean
  initialDocument: ExitInterviewDocumentFile | null
}) {
  const [doc, setDoc] = useState<ExitInterviewDocumentFile | null>(initialDocument)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const router = useRouter()

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/offboarding/exit-interview/${encodeURIComponent(employeeId)}/document`, {
        method: 'POST',
        body: fd,
      })
      const body = (await res.json().catch(() => ({}))) as { message?: string; document?: ExitInterviewDocumentFile }
      if (!res.ok || !body.document) throw new Error(body.message ?? 'Upload failed.')
      setDoc(body.document)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!doc) return
    if (!window.confirm('Remove this exit-interview document?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/offboarding/exit-interview/${encodeURIComponent(employeeId)}/document/${fileIdOf(doc.storageRef)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? 'Remove failed.')
      }
      setDoc(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed.')
    } finally {
      setBusy(false)
    }
  }

  const viewHref = doc
    ? `/api/admin/offboarding/exit-interview/${encodeURIComponent(employeeId)}/document/${fileIdOf(doc.storageRef)}`
    : '#'

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-ink-3">Exit interview document</h3>
      <p className="mt-1 text-xs text-ink-3">
        Confidential. Reporting managers and HODs never see this, even when it names them.
      </p>

      {doc ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={viewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-navy hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <FileText className="h-4 w-4" aria-hidden="true" /> View {doc.filename}
          </a>
          <span className="text-xs text-ink-3">
            {(doc.fileSize / 1024).toFixed(0)} KB, uploaded {doc.uploadedAt.slice(0, 10)}
          </span>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={inputId}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface focus-within:ring-2 focus-within:ring-teal"
              >
                <Upload className="h-4 w-4" aria-hidden="true" /> Replace
              </label>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded px-3 py-2 text-sm font-medium text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
              </button>
            </div>
          )}
        </div>
      ) : canEdit ? (
        <div className="mt-3">
          <label htmlFor={inputId} className="block text-sm font-medium text-ink">
            Upload the exit interview document
          </label>
          <p className="text-xs text-ink-3">PDF, DOCX, DOC, ODT, RTF, MD or TXT, up to 15 MB.</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-2">No document uploaded.</p>
      )}

      {canEdit && (
        <input
          id={inputId}
          type="file"
          accept=".pdf,.docx,.doc,.odt,.rtf,.md,.txt"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
          className={
            doc
              ? 'sr-only'
              : 'mt-2 block w-full rounded border border-line-strong bg-card text-sm text-ink file:mr-3 file:min-h-[44px] file:cursor-pointer file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-navy hover:file:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'
          }
        />
      )}
      {busy && <p role="status" aria-live="polite" className="mt-2 text-xs text-ink-2">Working...</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  const id = useId()
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wider text-ink-3">
        {label}
      </label>
      <div className="mt-1">{control}</div>
    </div>
  )
}
