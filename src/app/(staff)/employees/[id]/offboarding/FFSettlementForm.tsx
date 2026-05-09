'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface RecoveryItem {
  label: string
  amount: number
}

interface Initial {
  finalSalaryDays: number
  leaveEncashment: number
  recoveryItems: RecoveryItem[]
  noticePeriodAdjustment: number
  totalNet: number
  notes: string
  paidAt: string | null
  paidBy?: string | null
}

export function FFSettlementForm({
  employeeId,
  initial,
}: {
  employeeId: string
  initial: Initial
}) {
  const [form, setForm] = useState<Initial>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const router = useRouter()

  function notify(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 12000)
  }

  async function save(markPaid = false) {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch(
        `/api/admin/offboarding/ff-settlement/${encodeURIComponent(employeeId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, markPaid }),
        },
      )
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Save failed: ${res.status}`)
      notify(data.note ?? 'Saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  function setRecoveryAt(idx: number, patch: Partial<RecoveryItem>) {
    setForm((f) => ({
      ...f,
      recoveryItems: f.recoveryItems.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }))
  }

  function removeRecovery(idx: number) {
    setForm((f) => ({
      ...f,
      recoveryItems: f.recoveryItems.filter((_, i) => i !== idx),
    }))
  }

  function addRecovery() {
    setForm((f) => ({
      ...f,
      recoveryItems: [...f.recoveryItems, { label: '', amount: 0 }],
    }))
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      {form.paidAt && (
        <p className="mb-3 rounded bg-success-bg px-3 py-2 text-xs text-success">
          Paid on {form.paidAt.slice(0, 10)} by {form.paidBy ?? '—'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Final salary days worked">
          <input
            type="number"
            value={form.finalSalaryDays}
            onChange={(e) =>
              setForm((f) => ({ ...f, finalSalaryDays: Number(e.target.value) || 0 }))
            }
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            inputMode="numeric"
          />
        </Field>
        <Field label="Leave encashment (Rs)">
          <input
            type="number"
            value={form.leaveEncashment}
            onChange={(e) =>
              setForm((f) => ({ ...f, leaveEncashment: Number(e.target.value) || 0 }))
            }
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            inputMode="numeric"
          />
          <p className="mt-1 text-xs text-ink-3">
            Default 0 per Riddhi&apos;s no-encashment policy; adjust per employee where applicable.
          </p>
        </Field>
        <Field label="Notice-period adjustment (Rs, can be negative)">
          <input
            type="number"
            value={form.noticePeriodAdjustment}
            onChange={(e) =>
              setForm((f) => ({ ...f, noticePeriodAdjustment: Number(e.target.value) || 0 }))
            }
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            inputMode="numeric"
          />
        </Field>
        <Field label="Total net (Rs)">
          <input
            type="number"
            value={form.totalNet}
            onChange={(e) => setForm((f) => ({ ...f, totalNet: Number(e.target.value) || 0 }))}
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm tabular"
            inputMode="numeric"
          />
        </Field>
        <Field label="Recovery items" full>
          <div className="space-y-2">
            {form.recoveryItems.map((r, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  value={r.label}
                  onChange={(e) => setRecoveryAt(i, { label: e.target.value })}
                  placeholder="What is being recovered?"
                  disabled={busy}
                  className="flex-1 min-w-[160px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  value={r.amount}
                  onChange={(e) => setRecoveryAt(i, { amount: Number(e.target.value) || 0 })}
                  placeholder="Amount"
                  disabled={busy}
                  className="w-32 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => removeRecovery(i)}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded border border-line-strong px-3 py-1 text-xs text-ink-2 hover:bg-surface"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRecovery}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-1 text-xs text-ink hover:bg-surface"
            >
              + Add recovery item
            </button>
          </div>
        </Field>
        <Field label="Notes" full>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            disabled={busy}
            className="w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save settlement'}
        </button>
        {!form.paidAt && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Mark as paid
          </button>
        )}
        {statusMsg && (
          <span role="status" aria-live="polite" className="text-xs text-ink-2">
            {statusMsg}
          </span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  )
}

function Field({
  label,
  full,
  children,
}: {
  label: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
