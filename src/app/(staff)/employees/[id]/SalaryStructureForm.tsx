'use client'

/*
 * Edit Salary Structure modal. HR/Admin only. Backed by the queue, so the new
 * structure shows on the appointment letter generator within ~1 minute.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOptimisticAction } from '@/lib/hooks/useOptimisticAction'

interface SalaryStructure {
  ctc: number
  basic: number
  hra: number
  conveyance: number
  otherAllowances: number
  pfEmployee: number
  ptMonthly: number
  netTakeHome: number
}

const FIELDS: Array<{ key: keyof SalaryStructure; label: string; hint?: string }> = [
  { key: 'ctc', label: 'Annual CTC', hint: 'Total cost to company' },
  { key: 'basic', label: 'Basic (annual)' },
  { key: 'hra', label: 'HRA (annual)' },
  { key: 'conveyance', label: 'Conveyance (annual)' },
  { key: 'otherAllowances', label: 'Other Allowances (annual)' },
  { key: 'pfEmployee', label: 'PF Employee contribution (annual)' },
  { key: 'ptMonthly', label: 'PT (per month)', hint: 'Maharashtra default Rs 200' },
  { key: 'netTakeHome', label: 'Net Take Home (annual)' },
]

export function SalaryStructureForm({
  employeeId,
  initial,
}: {
  employeeId: string
  initial: SalaryStructure | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const action = useOptimisticAction<SalaryStructure | null>(initial)
  const [draft, setDraft] = useState<Record<keyof SalaryStructure, string>>(toStringMap(initial))
  const [success, setSuccess] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  function openModal() {
    setDraft(toStringMap(action.current))
    setWarnings([])
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
    action.clearError()
  }

  async function save() {
    const numeric: Partial<SalaryStructure> = {}
    for (const f of FIELDS) {
      const raw = draft[f.key].trim().replace(/[,\s]/g, '')
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        action.clearError()
        // Re-running with a fake error via run() would muddy the API; surface inline.
        setWarnings([])
        return
      }
      numeric[f.key] = Math.round(n)
    }
    const optimistic = numeric as SalaryStructure

    const res = await action.run<{ structure: SalaryStructure; warnings: string[] }>({
      optimistic,
      perform: async () => {
        const r = await fetch(`/api/employees/${employeeId}/salary-structure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(optimistic),
        })
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { message?: string }
          throw new Error(b.message ?? 'Could not save.')
        }
        return (await r.json()) as { structure: SalaryStructure; warnings: string[] }
      },
    })

    if (!res.ok) return
    setWarnings(res.result.warnings ?? [])
    setSuccess('Salary structure saved. Will reflect on letters within ~1 minute.')
    setOpen(false)
    router.refresh()
    setTimeout(() => setSuccess(null), 4000)
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex min-h-[36px] w-full items-center justify-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        {action.current ? 'Edit salary structure' : 'Add salary structure'}
      </button>

      {success && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-[60] max-w-sm rounded border border-success bg-success-bg px-3 py-2 text-sm text-ink shadow-lg"
        >
          {success}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="salary-modal-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !action.busy && closeModal()}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-line bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="salary-modal-heading" className="font-display text-lg text-ink">
              Salary structure
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Stored once per employee. Auto-fills the appointment letter PF/PT block. Indian rupees,
              annual amounts unless marked monthly. Use plain numbers; commas optional.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`sal-${f.key}`} className="block text-xs font-medium text-ink-2">
                    {f.label}
                    {f.hint && <span className="ml-2 font-normal text-ink-3">({f.hint})</span>}
                  </label>
                  <input
                    id={`sal-${f.key}`}
                    type="text"
                    inputMode="numeric"
                    value={draft[f.key]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink tabular focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  />
                </div>
              ))}
            </div>

            {action.error && (
              <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
                {action.error}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-3 rounded border border-warning bg-warning-bg px-3 py-2 text-xs text-ink">
                {warnings.join(' ')}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={action.busy}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={action.busy}
                className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
              >
                {action.busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function toStringMap(s: SalaryStructure | null): Record<keyof SalaryStructure, string> {
  return {
    ctc: s ? String(s.ctc) : '',
    basic: s ? String(s.basic) : '',
    hra: s ? String(s.hra) : '',
    conveyance: s ? String(s.conveyance) : '',
    otherAllowances: s ? String(s.otherAllowances) : '',
    pfEmployee: s ? String(s.pfEmployee) : '',
    ptMonthly: s ? String(s.ptMonthly) : '',
    netTakeHome: s ? String(s.netTakeHome) : '',
  }
}
