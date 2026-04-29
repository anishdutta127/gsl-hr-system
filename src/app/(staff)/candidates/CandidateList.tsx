'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface CandidateRow {
  id: string
  name: string
  email: string
  source: string
  createdAt: string
  programmes: string[]
  appCount: number
  appSummaries: Array<{ roleTitle: string; stage: string }>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [addRoleId, setAddRoleId] = useState('')
  const [emailTemplateId, setEmailTemplateId] = useState('')

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
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
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  function closeModal() {
    setModal(null)
    setError(null)
    setAddRoleId('')
    setEmailTemplateId('')
  }

  async function submitBulk(action: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/candidates/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateIds: Array.from(selected),
          action,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(b.message ?? 'Failed.')
        setBusy(false)
        return
      }
      const data = (await res.json()) as { applied: number; skipped: number; errors: number }
      const tail = `${data.skipped > 0 ? `, skipped ${data.skipped}` : ''}${data.errors > 0 ? `, errors ${data.errors}` : ''}`
      let msg: string
      const actionType = (action as { type?: string }).type
      if (actionType === 'log-email') {
        msg = `Logged email for ${data.applied} candidate${data.applied === 1 ? '' : 's'}. Audit entries created${tail}.`
      } else if (actionType === 'add-to-pipeline') {
        msg = `Added ${data.applied} candidate${data.applied === 1 ? '' : 's'} to the pipeline${tail}.`
      } else if (actionType === 'archive') {
        msg = `Archived ${data.applied} candidate${data.applied === 1 ? '' : 's'}${tail}.`
      } else {
        msg = `Applied to ${data.applied}${tail}.`
      }
      setSuccess(msg)
      setSelected(new Set())
      closeModal()
      router.refresh()
      setTimeout(() => setSuccess(null), 4000)
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
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

      {rows.length === 0 ? (
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
              {rows.length} showing
              {totalCount !== rows.length ? ` of ${totalCount}` : ''}
            </span>
          </li>
          {rows.slice(0, 200).map((c) => (
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
                          className="inline-flex items-center rounded bg-teal-light px-2 py-0.5 text-xs text-teal-dark"
                        >
                          {a.roleTitle} · {a.stage}
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
                <span className="shrink-0 text-xs text-ink-3 tabular">
                  {c.appCount} {c.appCount === 1 ? 'app' : 'apps'}
                </span>
              </div>
            </li>
          ))}
          {rows.length > 200 && (
            <li className="px-5 py-2 text-xs text-ink-3">
              Showing first 200 of {rows.length.toLocaleString('en-IN')}. Refine the filter to narrow the list.
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
                  Records an audit entry on each candidate noting which template you sent them. Does
                  not compose or send the email itself.
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

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
              >
                Cancel
              </button>
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
