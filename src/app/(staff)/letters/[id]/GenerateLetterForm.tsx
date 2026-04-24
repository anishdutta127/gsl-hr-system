'use client'

import { useState } from 'react'
import type { LetterTemplate } from '@/lib/letterTemplates'

interface EmployeeOption {
  id: string
  label: string
}

export function GenerateLetterForm({
  template,
  employees,
}: {
  template: LetterTemplate
  employees: EmployeeOption[]
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadDefaults(id: string) {
    setEmployeeId(id)
    if (!id) {
      setValues({})
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/letters/${template.id}/generate/preview?employeeId=${encodeURIComponent(id)}`, {
        method: 'GET',
      })
      // Preview route is optional; if not present, just keep current values.
      if (res.ok) {
        const data = (await res.json()) as { values?: Record<string, string> }
        if (data.values) setValues(data.values)
      }
    } catch {
      /* fall through */
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/letters/${template.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employeeId || undefined, values }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Generation failed.' }))
        setError(body.message ?? 'Generation failed.')
        setBusy(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      a.download = match?.[1] ?? `${template.id}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]" aria-label="Generate letter">
      <div className="space-y-4">
        <div>
          <label htmlFor="employee" className="block text-sm font-medium text-ink">
            Employee {template.audience === 'interns' ? '(optional)' : ''}
          </label>
          <select
            id="employee"
            value={employeeId}
            onChange={(e) => loadDefaults(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <option value="">
              {template.audience === 'interns' ? '(no employee record)' : 'Select an employee'}
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-3">
            Picking an employee pre-fills fields we can derive from their record. You can edit any
            field before generating.
          </p>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-sm font-medium text-ink">Letter fields</legend>
          {template.variables.map((v) => (
            <div key={v.token}>
              <label htmlFor={v.token} className="block text-xs font-medium text-ink-2">
                {v.label}
                {v.required ? ' *' : ''}
                {v.hint && <span className="ml-2 font-normal text-ink-3">({v.hint})</span>}
              </label>
              {v.multiline ? (
                <textarea
                  id={v.token}
                  rows={2}
                  value={values[v.token] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v.token]: e.target.value }))}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                />
              ) : (
                <input
                  id={v.token}
                  type="text"
                  value={values[v.token] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v.token]: e.target.value }))}
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

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? 'Generating…' : 'Generate letter (.docx download)'}
        </button>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-lg border border-line bg-card p-5 text-sm">
          <h2 className="font-display text-lg text-ink">About this template</h2>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-3">ID</dt>
              <dd className="text-ink tabular">{template.id}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-3">Source file</dt>
              <dd className="break-all text-xs text-ink-2">{template.filePath}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-3">Audience</dt>
              <dd className="text-ink">{template.audience}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-3">Tokens</dt>
              <dd className="text-ink tabular">{template.variables.length}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-3">
            The generated .docx is downloaded to your device. If you save it back into OneDrive,
            the sync bot will include it in the next commit. An audit entry is recorded on the
            selected employee.
          </p>
        </div>
      </aside>
    </form>
  )
}
