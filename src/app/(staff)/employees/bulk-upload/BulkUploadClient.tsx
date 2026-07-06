'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface PreviewDiff {
  field: string
  existing: unknown
  incoming: unknown
}
interface PreviewRow {
  rowRef: string
  code: string
  name: string
  classification: 'create' | 'reactivate' | 'update' | 'error'
  errors: string[]
  warnings: string[]
  department: string | null
  location: string | null
  manager: string | null
  diffs: PreviewDiff[]
}
interface PreviewResponse {
  counts: { create: number; reactivate: number; update: number; error: number }
  rows: PreviewRow[]
}
interface CommitResponse {
  written: number
  onboardingGenerated: number
  result: Array<{ code: string; name: string; outcome: string; reasons: string[] }>
  note: string
}

const CLASS_STYLE: Record<PreviewRow['classification'], string> = {
  create: 'bg-success-bg text-success',
  reactivate: 'bg-teal-light text-teal-dark',
  update: 'bg-orange-light text-orange-dark',
  error: 'bg-danger-bg text-danger',
}

export function BulkUploadClient() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [overwrites, setOverwrites] = useState<Set<string>>(new Set())
  const [committed, setCommitted] = useState<CommitResponse | null>(null)
  const [busy, setBusy] = useState<'idle' | 'preview' | 'commit'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPreview(null)
    setOverwrites(new Set())
    setCommitted(null)
    setError(null)
    setStatus(null)
  }

  async function downloadTemplate() {
    setError(null)
    try {
      const res = await fetch('/api/admin/employees/bulk-upload/template')
      if (!res.ok) throw new Error('Could not fetch the template.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'employee-upload-template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed.')
    }
  }

  async function runPreview() {
    if (!file) return
    setBusy('preview')
    setError(null)
    setStatus('Parsing and validating the file...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/employees/bulk-upload/preview', { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Preview failed.')
      setPreview(body as PreviewResponse)
      setStatus(`Preview ready: ${(body as PreviewResponse).rows.length} rows.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed.')
      setStatus(null)
    } finally {
      setBusy('idle')
    }
  }

  async function runCommit() {
    if (!file || !preview) return
    setBusy('commit')
    setError(null)
    setStatus('Writing records...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('overwrites', JSON.stringify([...overwrites]))
      const res = await fetch('/api/admin/employees/bulk-upload/commit', { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Commit failed.')
      setCommitted(body as CommitResponse)
      setStatus(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Commit failed.')
      setStatus(null)
    } finally {
      setBusy('idle')
    }
  }

  function toggleOverwrite(key: string) {
    setOverwrites((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const writable = preview ? preview.counts.create + preview.counts.reactivate + preview.counts.update : 0

  // --- Result view ------------------------------------------------------
  if (committed) {
    return (
      <div className="space-y-4">
        <div role="status" className="flex items-start gap-3 rounded-lg border border-success bg-success-bg p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <div className="text-sm text-ink">
            <p className="font-medium">Wrote {committed.written} record(s).</p>
            <p className="text-ink-2">
              {committed.onboardingGenerated} onboarding task(s) generated. {committed.note}
            </p>
          </div>
        </div>
        <ResultTable rows={committed.result} />
        <button type="button" onClick={() => { setFile(null); reset(); if (inputRef.current) inputRef.current.value = '' }}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          Upload another file
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-ink">1. Start from the template</h2>
            <p className="mt-1 text-sm text-ink-2">The template has the exact columns we expect. It is the safest way to avoid errors.</p>
          </div>
          <button type="button" onClick={downloadTemplate}
            className="inline-flex min-h-[44px] items-center gap-2 rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-navy hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
            <Download className="h-4 w-4" aria-hidden="true" /> Download template
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">2. Upload your file</h2>
        <p className="mt-1 text-sm text-ink-2">Accepts .xlsx or .csv, up to 500 rows.</p>
        <div className="mt-3">
          <label htmlFor="bulk-file" className="block text-sm font-medium text-ink">Employee file</label>
          <input
            id="bulk-file"
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset() }}
            className="mt-1 block w-full rounded border border-line-strong bg-card text-sm text-ink file:mr-3 file:min-h-[44px] file:cursor-pointer file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-navy hover:file:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={runPreview} disabled={!file || busy !== 'idle'}
            className="inline-flex min-h-[44px] items-center gap-2 rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-50">
            <Upload className="h-4 w-4" aria-hidden="true" /> {busy === 'preview' ? 'Validating...' : 'Preview'}
          </button>
        </div>
        {status && <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-2">{status}</p>}
        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {preview && (
        <div className="rounded-lg border border-line bg-card p-5">
          <h2 className="font-display text-lg text-ink">3. Preview - nothing is written yet</h2>
          <dl className="mt-3 flex flex-wrap gap-4 text-sm">
            <Count label="New" value={preview.counts.create} tone="text-success" />
            <Count label="Reactivate" value={preview.counts.reactivate} tone="text-teal-dark" />
            <Count label="Update" value={preview.counts.update} tone="text-orange-dark" />
            <Count label="Errors (skipped)" value={preview.counts.error} tone="text-danger" />
          </dl>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">Preview of rows to import, with classification and flags</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
                  <th scope="col" className="py-2 pr-3">Code</th>
                  <th scope="col" className="py-2 pr-3">Name</th>
                  <th scope="col" className="py-2 pr-3">Action</th>
                  <th scope="col" className="py-2 pr-3">Department</th>
                  <th scope="col" className="py-2 pr-3">Manager</th>
                  <th scope="col" className="py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowRef + r.code} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-medium text-ink">{r.code || <span className="text-ink-3">-</span>}</td>
                    <td className="py-2 pr-3 text-ink">{r.name || <span className="text-ink-3">-</span>}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${CLASS_STYLE[r.classification]}`}>
                        {r.classification === 'error' ? 'skip' : r.classification}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{r.department ?? '-'}</td>
                    <td className="py-2 pr-3 text-ink-2">{r.manager ?? '-'}</td>
                    <td className="py-2 text-ink-2">
                      {r.errors.map((e) => (
                        <span key={e} className="block text-danger">{e}</span>
                      ))}
                      {r.warnings.map((w) => (
                        <span key={w} className="block text-ink-3">{w}</span>
                      ))}
                      {r.diffs.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {r.diffs.map((d) => {
                            const key = `${r.code}:${d.field}`
                            return (
                              <label key={key} className="flex items-start gap-2 text-xs text-ink-2">
                                <input
                                  type="checkbox"
                                  checked={overwrites.has(key)}
                                  onChange={() => toggleOverwrite(key)}
                                  className="mt-0.5 h-4 w-4 rounded border-line-strong text-orange focus-visible:ring-2 focus-visible:ring-teal"
                                />
                                <span>
                                  overwrite <strong>{d.field}</strong>: <span className="text-ink-3">{String(d.existing)}</span> to{' '}
                                  <span className="text-ink">{String(d.incoming)}</span>
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                      {r.errors.length === 0 && r.warnings.length === 0 && r.diffs.length === 0 && '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button type="button" onClick={runCommit} disabled={writable === 0 || busy !== 'idle'}
              className="inline-flex min-h-[44px] items-center rounded bg-orange-dark px-4 py-2 text-sm font-medium text-white hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-50">
              {busy === 'commit' ? 'Writing...' : `Confirm and write ${writable} record(s)`}
            </button>
            {preview.counts.error > 0 && (
              <span className="text-sm text-ink-3">{preview.counts.error} error row(s) will be skipped.</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className={`font-display text-2xl tabular ${tone}`}>{value}</dd>
    </div>
  )
}

function ResultTable({ rows }: { rows: CommitResponse['result'] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="sr-only">Result of the bulk upload</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
            <th scope="col" className="px-4 py-2">Code</th>
            <th scope="col" className="px-4 py-2">Name</th>
            <th scope="col" className="px-4 py-2">Outcome</th>
            <th scope="col" className="px-4 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code + r.name} className="border-b border-line align-top">
              <td className="px-4 py-2 font-medium text-ink">{r.code || '-'}</td>
              <td className="px-4 py-2 text-ink">{r.name || '-'}</td>
              <td className="px-4 py-2 text-ink-2">{r.outcome}</td>
              <td className="px-4 py-2 text-ink-3">{r.reasons.join(' | ') || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
