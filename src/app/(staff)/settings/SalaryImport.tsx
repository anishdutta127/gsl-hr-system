'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Result {
  accepted: number
  notFound: string[]
  invalid: Array<{ row: number; reason: string }>
  message: string
}

export function SalaryImport() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function upload() {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/import-salary', { method: 'POST', body: form })
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { message?: string }
      if (!res.ok) {
        setError(data.message ?? 'Import failed.')
        return
      }
      setResult({
        accepted: data.accepted ?? 0,
        notFound: data.notFound ?? [],
        invalid: data.invalid ?? [],
        message: data.message ?? 'Imported.',
      })
      router.refresh()
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-2">
        Upload a CSV mapping <code className="rounded bg-surface px-1 py-0.5 text-xs">employee_code</code> to
        salary fields. Save your salary spreadsheet as CSV from Excel first. Required columns:
        employee_code, ctc, basic, hra, conveyance, other_allowances, pf_employee, pt_monthly, net_take_home.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-ink-2 file:mr-3 file:rounded file:border file:border-line-strong file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-surface"
        />
        <button
          type="button"
          onClick={() => void upload()}
          disabled={!file || busy}
          className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
        >
          {busy ? 'Importing…' : 'Import salary CSV'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
          <div>{result.message}</div>
          {result.notFound.length > 0 && (
            <div className="mt-2 text-xs text-ink-2">
              Not found ({result.notFound.length}): {result.notFound.slice(0, 12).join(', ')}
              {result.notFound.length > 12 ? ', …' : ''}
            </div>
          )}
          {result.invalid.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">
              {result.invalid.slice(0, 8).map((row, i) => (
                <li key={i}>
                  Row {row.row}: {row.reason}
                </li>
              ))}
              {result.invalid.length > 8 && <li>…and {result.invalid.length - 8} more.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
