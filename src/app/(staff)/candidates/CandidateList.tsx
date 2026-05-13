'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StagePill } from '@/components/StagePill'
import { useOptimisticAction } from '@/lib/hooks/useOptimisticAction'

/** Browsers cap mailto: length somewhere around 2000-2083 chars. We go below
 * that to leave headroom for BCC list expansion on the OS side. */
const MAILTO_MAX_LENGTH = 1800

/** Outlook's BCC field warns/truncates around 100 recipients in classic Outlook
 * and ~250 in new Outlook. 50 is the safe-batch threshold HR feedback called out. */
const BCC_BATCH_WARNING = 50

export interface CandidateRow {
  id: string
  name: string
  email: string
  source: string
  createdAt: string
  programmes: string[]
  appCount: number
  appSummaries: Array<{ roleTitle: string; stage: string }>
  hasResume: boolean
}

export interface TemplateOption {
  id: string
  title: string
}

export interface RoleOption {
  id: string
  label: string
}

export function CandidateList({
  rows,
  totalCount,
  templateOptions,
  openRoleOptions,
}: {
  rows: CandidateRow[]
  totalCount: number
  templateOptions: TemplateOption[]
  openRoleOptions: RoleOption[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<null | 'add-to-pipeline' | 'log-email' | 'archive'>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [addRoleId, setAddRoleId] = useState('')
  const [emailTemplateId, setEmailTemplateId] = useState('')
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  // Optimistically hidden ids: archived rows disappear immediately on click
  // and reappear if the queue write fails.
  const action = useOptimisticAction<Set<string>>(new Set())
  const busy = action.busy
  const error = action.error

  const visibleRows = useMemo(
    () => rows.filter((r) => !action.current.has(r.id)),
    [rows, action.current],
  )

  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id))
  const someSelected = selected.size > 0 && !allSelected

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(visibleRows.map((r) => r.id)))
  }

  function closeModal() {
    setModal(null)
    action.clearError()
    setAddRoleId('')
    setEmailTemplateId('')
    setPreview(null)
  }

  // Selected rows that have a stored email; gates Compose in Outlook.
  const selectedRows = useMemo(
    () => visibleRows.filter((r) => selected.has(r.id)),
    [visibleRows, selected],
  )
  const recipientsWithEmail = useMemo(
    () => selectedRows.filter((r) => r.email && r.email.trim().length > 0),
    [selectedRows],
  )
  const skippedNoEmail = selectedRows.length - recipientsWithEmail.length

  // Live preview: re-render whenever the modal is open on log-email and a template is picked.
  useEffect(() => {
    if (modal !== 'log-email' || !emailTemplateId || selectedRows.length === 0) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewing(true)
    // Use the first candidate as the personalisation context. The UI calls this
    // out so HR knows {firstName} in bulk reflects only one recipient.
    const firstId = selectedRows[0]?.id ?? ''
    fetch(`/api/emails/${emailTemplateId}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: firstId, values: {} }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { subject?: string; body?: string } | null) => {
        if (cancelled || !data) return
        setPreview({ subject: data.subject ?? '', body: data.body ?? '' })
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false)
      })
    return () => {
      cancelled = true
    }
  }, [modal, emailTemplateId, selectedRows])

  async function composeInOutlook() {
    if (!emailTemplateId || !preview) return
    if (recipientsWithEmail.length === 0) return

    // Log the audit trail first so the action is recorded even if mailto fails
    // to open or HR closes Outlook without sending.
    const ids = recipientsWithEmail.map((r) => r.id)
    setSuccess(null)
    const res = await action.run<{ applied: number; skipped: number; errors: number }>({
      optimistic: action.current,
      perform: async () => {
        const r = await fetch('/api/candidates/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateIds: ids,
            action: { type: 'log-email', templateId: emailTemplateId, via: 'outlook' },
          }),
        })
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { message?: string }
          throw new Error(b.message ?? 'Failed.')
        }
        return (await r.json()) as { applied: number; skipped: number; errors: number }
      },
    })
    if (!res.ok) return

    // Build the mailto URL.
    const bccCsv = recipientsWithEmail.map((r) => r.email).join(',')
    let body = preview.body
    let subject = preview.subject
    let truncationNotice = ''
    let mailto = buildMailto(bccCsv, subject, body)
    if (mailto.length > MAILTO_MAX_LENGTH) {
      const cap = Math.max(200, body.length - (mailto.length - MAILTO_MAX_LENGTH) - 80)
      body = body.slice(0, cap) + '\n\n[Body truncated for Outlook. Copy the full template from /emails.]'
      mailto = buildMailto(bccCsv, subject, body)
      truncationNotice = ' Body was truncated to fit Outlook.'
    }

    setSuccess(
      `Logged for ${res.result.applied} recipient${res.result.applied === 1 ? '' : 's'}. Outlook is opening.${truncationNotice} Click Sync now to force immediate sync, or wait for the next auto-sync.`,
    )
    setSelected(new Set())
    closeModal()
    router.refresh()
    setTimeout(() => setSuccess(null), 6000)

    // Open the user's default mail client.
    window.location.href = mailto
  }

  function buildMailto(bcc: string, subject: string, body: string): string {
    return (
      'mailto:?bcc=' +
      encodeURIComponent(bcc) +
      '&subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body)
    )
  }

  async function submitBulk(payload: Record<string, unknown>) {
    setSuccess(null)
    const ids = Array.from(selected)
    const actionType = (payload as { type?: string }).type
    // Archive optimism: hide the rows on click; revert if the queue write fails.
    const optimistic = actionType === 'archive'
      ? new Set([...action.current, ...ids])
      : action.current

    const res = await action.run<{ applied: number; skipped: number; errors: number }>({
      optimistic,
      perform: async () => {
        const r = await fetch('/api/candidates/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateIds: ids, action: payload }),
        })
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { message?: string }
          throw new Error(b.message ?? 'Failed.')
        }
        return (await r.json()) as { applied: number; skipped: number; errors: number }
      },
    })

    if (!res.ok) return

    const data = res.result
    const tail = `${data.skipped > 0 ? `, skipped ${data.skipped}` : ''}${data.errors > 0 ? `, errors ${data.errors}` : ''}`
    const syncHint = ' Click Sync now to force immediate sync, or wait for the next auto-sync.'
    let msg: string
    if (actionType === 'log-email') {
      msg = `Logged email for ${data.applied} candidate${data.applied === 1 ? '' : 's'}. Audit entries created${tail}.${syncHint}`
    } else if (actionType === 'add-to-pipeline') {
      msg = `Added ${data.applied} candidate${data.applied === 1 ? '' : 's'} to the pipeline${tail}.${syncHint}`
    } else if (actionType === 'archive') {
      msg = `Archived ${data.applied} candidate${data.applied === 1 ? '' : 's'}${tail}.${syncHint}`
    } else {
      msg = `Applied to ${data.applied}${tail}.${syncHint}`
    }
    setSuccess(msg)
    setSelected(new Set())
    closeModal()
    router.refresh()
    setTimeout(() => setSuccess(null), 4000)
  }

  const selectionSummary = useMemo(() => {
    const count = selected.size
    if (count === 0) return ''
    if (count === 1) return '1 candidate selected'
    return `${count} candidates selected`
  }, [selected])

  return (
    <>
      {success && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-[60] max-w-sm rounded border border-success bg-success-bg px-3 py-2 text-sm text-ink shadow-lg"
        >
          {success}
        </div>
      )}
      {error && !modal && (
        <div
          role="alert"
          className="fixed right-4 top-4 z-[60] max-w-sm rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger shadow-lg"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => action.clearError()}
            className="ml-3 underline"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 -mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-5 py-3 shadow-sm">
          <div className="text-sm font-medium text-ink">{selectionSummary}</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModal('add-to-pipeline')}
              className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark"
            >
              Add to role pipeline
            </button>
            <button
              type="button"
              onClick={() => setModal('log-email')}
              className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
            >
              Log bulk email
            </button>
            <button
              type="button"
              onClick={() => setModal('archive')}
              className="inline-flex min-h-[36px] items-center rounded border border-danger bg-danger-bg px-3 py-1.5 text-sm font-medium text-danger hover:opacity-90"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex min-h-[36px] items-center rounded px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
          <p className="text-sm text-ink-2">
            {totalCount === 0
              ? "No candidates yet. Add the first candidate from a role's detail page."
              : 'No matches for the current filter.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          <li className="flex items-center gap-3 bg-surface px-5 py-2 text-xs font-medium text-ink-2">
            <input
              type="checkbox"
              aria-label="Select all shown"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
            />
            <span>
              {visibleRows.length} showing
              {totalCount !== visibleRows.length ? ` of ${totalCount}` : ''}
            </span>
          </li>
          {visibleRows.slice(0, 200).map((c) => (
            <li key={c.id}>
              <div className="flex items-start gap-3 px-5 py-3 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Select ${c.name}`}
                  checked={selected.has(c.id)}
                  onChange={() => toggleOne(c.id)}
                  className="mt-0.5 h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
                />
                <Link
                  href={`/candidates/${c.id}`}
                  className="flex-1 min-w-0 -my-1 py-1 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-ink-2">
                    {c.email || 'no email on file'} · {c.source}
                  </span>
                  {(c.programmes.length > 0 || c.appSummaries.length > 0) && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {c.programmes.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs text-ink-2"
                        >
                          {p}
                        </span>
                      ))}
                      {c.appSummaries.map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-xs text-ink-2"
                        >
                          {a.roleTitle} · <StagePill stage={a.stage} size="xs" />
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
                <span className="shrink-0 flex items-center gap-2 text-xs text-ink-3 tabular">
                  {c.hasResume && (
                    <a
                      href={`/api/resumes/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center rounded border border-line-strong bg-card px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                      title="Open resume in new tab"
                    >
                      CV
                    </a>
                  )}
                  <span>
                    {c.appCount} {c.appCount === 1 ? 'app' : 'apps'}
                  </span>
                </span>
              </div>
            </li>
          ))}
          {visibleRows.length > 200 && (
            <li className="px-5 py-2 text-xs text-ink-3">
              Showing first 200 of {visibleRows.length.toLocaleString('en-IN')}. Refine the filter to narrow the list.
            </li>
          )}
        </ul>
      )}

      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-modal-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bulk-modal-heading" className="font-display text-lg text-ink">
              {modal === 'add-to-pipeline'
                ? `Add ${selected.size} candidate${selected.size === 1 ? '' : 's'} to a role`
                : modal === 'log-email'
                  ? `Log bulk email for ${selected.size} candidate${selected.size === 1 ? '' : 's'}`
                  : `Archive ${selected.size} candidate${selected.size === 1 ? '' : 's'}?`}
            </h2>

            {modal === 'add-to-pipeline' && (
              <>
                <p className="mt-2 text-sm text-ink-2">
                  They will land at Sourced in the selected role. Candidates already active in that
                  pipeline are skipped.
                </p>
                {openRoleOptions.length === 0 ? (
                  <div className="mt-4 rounded border border-dashed border-line-strong bg-surface px-3 py-3 text-sm text-ink-2">
                    No open roles. Create one first.
                    <div className="mt-2">
                      <Link
                        href="/roles/new"
                        className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark"
                      >
                        Create role
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <label htmlFor="bulk-role" className="mt-4 block text-xs font-medium text-ink-2">
                      Role
                    </label>
                    <select
                      id="bulk-role"
                      value={addRoleId}
                      onChange={(e) => setAddRoleId(e.target.value)}
                      className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                    >
                      <option value="">Select a role</option>
                      {openRoleOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}

            {modal === 'log-email' && (
              <>
                <p className="mt-2 text-sm text-ink-2">
                  Apply just records the audit; Compose in Outlook also opens your mail client with
                  the BCC list and template pre-filled.
                </p>
                <label htmlFor="bulk-tpl" className="mt-4 block text-xs font-medium text-ink-2">
                  Template
                </label>
                <select
                  id="bulk-tpl"
                  value={emailTemplateId}
                  onChange={(e) => setEmailTemplateId(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  <option value="">Select a template</option>
                  {templateOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>

                <div className="mt-3 rounded border border-line bg-surface px-3 py-2 text-xs text-ink-2">
                  <div>
                    <span className="font-medium text-ink">{recipientsWithEmail.length}</span> of{' '}
                    {selectedRows.length} candidate{selectedRows.length === 1 ? '' : 's'} have emails on file.
                    {skippedNoEmail > 0 && ` ${skippedNoEmail} will be skipped.`}
                  </div>
                  {recipientsWithEmail.length > BCC_BATCH_WARNING && (
                    <div className="mt-1 text-warning">
                      Outlook may truncate the BCC list at large counts. Consider splitting into batches of{' '}
                      {BCC_BATCH_WARNING}.
                    </div>
                  )}
                  <div className="mt-1 text-ink-3">
                    Greeting personalisation works in 1:1 mode only. Bulk uses the template as-is with the
                    first recipient&apos;s name; edit before sending if that matters.
                  </div>
                </div>

                {emailTemplateId && (
                  <div className="mt-3 rounded border border-line bg-card px-3 py-2 text-xs">
                    <div className="font-medium text-ink-2">
                      Preview {previewing ? <span className="text-ink-3">rendering…</span> : null}
                    </div>
                    <div className="mt-1 text-ink-3">Subject</div>
                    <div className="text-ink">{preview?.subject || '(pick a template)'}</div>
                    <div className="mt-2 text-ink-3">Body</div>
                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap text-ink">
                      {preview?.body || '(pick a template)'}
                    </pre>
                  </div>
                )}
              </>
            )}

            {modal === 'archive' && (
              <p className="mt-2 text-sm text-ink-2">
                Archived candidates disappear from the default list but remain in the system for audit.
                This cannot be undone through the UI (only manually by editing users.json).
              </p>
            )}

            {error && (
              <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
              >
                Cancel
              </button>
              {modal === 'log-email' && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    !emailTemplateId ||
                    !preview ||
                    recipientsWithEmail.length === 0
                  }
                  onClick={() => void composeInOutlook()}
                  title={
                    recipientsWithEmail.length === 0
                      ? 'No selected candidates have emails on file.'
                      : 'Logs the audit and opens Outlook with BCC, subject, body pre-filled.'
                  }
                  className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
                >
                  Compose in Outlook
                </button>
              )}
              <button
                type="button"
                disabled={
                  busy ||
                  (modal === 'add-to-pipeline' && !addRoleId) ||
                  (modal === 'log-email' && !emailTemplateId)
                }
                onClick={() => {
                  if (modal === 'add-to-pipeline') {
                    void submitBulk({ type: 'add-to-pipeline', roleId: addRoleId })
                  } else if (modal === 'log-email') {
                    void submitBulk({ type: 'log-email', templateId: emailTemplateId })
                  } else {
                    void submitBulk({ type: 'archive' })
                  }
                }}
                className={
                  modal === 'archive'
                    ? 'inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
                    : 'inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60'
                }
              >
                {busy ? 'Applying…' : modal === 'archive' ? 'Archive' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
