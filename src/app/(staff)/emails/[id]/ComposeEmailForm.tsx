'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmailTemplate } from '@/lib/emailTemplates'

interface Option {
  id: string
  label: string
}

export function ComposeEmailForm({
  template,
  candidateOptions,
  roleOptions,
  initialCandidateId,
  initialRoleId,
}: {
  template: EmailTemplate
  candidateOptions: Option[]
  roleOptions: Option[]
  initialCandidateId: string
  initialRoleId: string
}) {
  const [candidateId, setCandidateId] = useState(initialCandidateId)
  const [roleId, setRoleId] = useState(initialRoleId)
  const [values, setValues] = useState<Record<string, string>>({})
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [unresolved, setUnresolved] = useState<string[]>([])
  const [rendering, setRendering] = useState(false)
  const [copied, setCopied] = useState<null | 'subject' | 'body' | 'both'>(null)
  const [logged, setLogged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const render = useCallback(async (cId: string, rId: string, vals: Record<string, string>) => {
    setRendering(true)
    setError(null)
    try {
      const res = await fetch(`/api/emails/${template.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: cId || undefined, roleId: rId || undefined, values: vals }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Render failed.' }))
        setError(b.message ?? 'Render failed.')
        return
      }
      const data = (await res.json()) as {
        subject: string
        body: string
        to: string
        values: Record<string, string>
        unresolved: string[]
      }
      setSubject(data.subject)
      setBody(data.body)
      setToEmail(data.to)
      setUnresolved(data.unresolved)
      // Merge server-resolved defaults into our local values so the form shows them
      setValues((prev) => {
        const next = { ...data.values }
        // Preserve anything the user has already typed
        for (const [k, v] of Object.entries(prev)) {
          if (v && v !== data.values[k]) next[k] = v
        }
        return next
      })
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setRendering(false)
    }
  }, [template.id])

  // Initial render when the candidate is picked (or on mount if pre-selected)
  useEffect(() => {
    void render(candidateId, roleId, {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render on candidate / role change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void render(candidateId, roleId, values), 150)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, roleId])

  // Re-render on value edits (debounced)
  function handleValueChange(token: string, next: string) {
    setValues((prev) => {
      const updated = { ...prev, [token]: next }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => void render(candidateId, roleId, updated), 250)
      return updated
    })
  }

  async function copyToClipboard(what: 'subject' | 'body' | 'both') {
    const payload =
      what === 'subject' ? subject : what === 'body' ? body : `Subject: ${subject}\n\n${body}`
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(what)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      setError('Clipboard blocked by browser. Select the text manually.')
    }
  }

  function openInMailClient() {
    const url =
      'mailto:' +
      encodeURIComponent(toEmail) +
      '?subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body)
    window.location.href = url
  }

  async function logSent() {
    if (!candidateId) {
      setError('Pick a candidate first so we can log the send on their record.')
      return
    }
    setLogged(false)
    try {
      const res = await fetch(`/api/emails/${template.id}/log-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, subject }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Log failed.' }))
        setError(b.message ?? 'Log failed.')
        return
      }
      setLogged(true)
      setTimeout(() => setLogged(false), 2000)
    } catch {
      setError("We couldn't reach our server.")
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]">
      <div className="space-y-4">
        <div>
          <label htmlFor="candidate" className="block text-sm font-medium text-ink">
            Candidate
          </label>
          <select
            id="candidate"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <option value="">(no candidate — render with placeholders)</option>
            {candidateOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-ink">
            Role context (optional)
          </label>
          <select
            id="role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <option value="">(auto: most recent application)</option>
            {roleOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-sm font-medium text-ink">Tokens</legend>
          {template.variables.map((v) => (
            <div key={v.token}>
              <label htmlFor={`tok-${v.token}`} className="block text-xs font-medium text-ink-2">
                {v.label}
                {v.required ? ' *' : ''}
                {v.hint && <span className="ml-2 font-normal text-ink-3">({v.hint})</span>}
              </label>
              {v.multiline ? (
                <textarea
                  id={`tok-${v.token}`}
                  rows={3}
                  value={values[v.token] ?? ''}
                  onChange={(e) => handleValueChange(v.token, e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              ) : (
                <input
                  id={`tok-${v.token}`}
                  type="text"
                  value={values[v.token] ?? ''}
                  onChange={(e) => handleValueChange(v.token, e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              )}
            </div>
          ))}
        </fieldset>

        {error && (
          <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {unresolved.length > 0 && (
          <div className="rounded border border-warning bg-warning-bg px-3 py-2 text-xs text-ink">
            Unfilled tokens will appear verbatim: {unresolved.join(', ')}
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="rounded-lg border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Preview</h2>
            {rendering && <span className="text-xs text-ink-3">rendering…</span>}
          </div>

          <div className="mt-4">
            <div className="text-xs font-medium text-ink-2">To</div>
            <div className="mt-1 text-sm text-ink">{toEmail || '(no candidate email)'}</div>
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium text-ink-2">Subject</div>
            <div className="mt-1 flex items-start gap-2">
              <div className="flex-1 rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
                {subject || '(will render once candidate is picked)'}
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard('subject')}
                className="inline-flex min-h-[36px] shrink-0 items-center rounded border border-line-strong bg-card px-2 py-1 text-xs font-medium text-ink hover:bg-surface"
              >
                {copied === 'subject' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-ink-2">Body</div>
              <button
                type="button"
                onClick={() => copyToClipboard('body')}
                className="inline-flex min-h-[36px] shrink-0 items-center rounded border border-line-strong bg-card px-2 py-1 text-xs font-medium text-ink hover:bg-surface"
              >
                {copied === 'body' ? 'Copied' : 'Copy body'}
              </button>
            </div>
            <pre className="mt-1 max-h-[380px] overflow-auto whitespace-pre-wrap rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
              {body || '(pick a candidate)'}
            </pre>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard('both')}
              className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              {copied === 'both' ? 'Copied' : 'Copy subject + body'}
            </button>
            <button
              type="button"
              onClick={openInMailClient}
              disabled={!toEmail}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              Open in mail client
            </button>
            <button
              type="button"
              onClick={logSent}
              disabled={!candidateId}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              {logged ? 'Logged ✓' : 'Log as sent'}
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Clipboard or mail-client sends don't touch our server. Hit "Log as sent" after sending
            so the audit trail reflects it.
          </p>
        </div>
      </aside>
    </div>
  )
}
