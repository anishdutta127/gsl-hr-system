'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RecognitionCategory } from '@/lib/types'
import { validateWriteup } from '@/lib/recognitionState'

interface EmployeeOption {
  id: string
  name: string
  department: string
  designation: string
}

interface Props {
  defaultMonth: string
  categories: RecognitionCategory[]
  employees: EmployeeOption[]
}

const WRITEUP_MIN = 30
const WRITEUP_MAX = 800

export function NominateForm(props: Props) {
  const router = useRouter()
  const [employeeId, setEmployeeId] = useState('')
  const [category, setCategory] = useState<RecognitionCategory>(props.categories[0] ?? 'Other')
  const [month, setMonth] = useState(props.defaultMonth)
  const [writeup, setWriteup] = useState('')
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const writeupTrimmedLen = writeup.trim().length
  const overLimit = writeupTrimmedLen > WRITEUP_MAX

  function submit() {
    setError(null)
    setSuccess(null)
    if (!employeeId) {
      setError('Pick the employee you are nominating.')
      return
    }
    const v = validateWriteup(writeup)
    if (v) {
      setError(v)
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/recognition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId,
            category,
            month,
            writeup: writeup.trim(),
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'We could not save the nomination. Try again.')
          return
        }
        setSuccess('Nomination submitted. HR will be notified to review.')
        setEmployeeId('')
        setWriteup('')
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  const disabled = busy || props.employees.length === 0

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div>
        <label htmlFor="rec-employee" className="block text-sm font-medium text-ink">
          Employee
        </label>
        <select
          id="rec-employee"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          disabled={disabled}
          required
          className="mt-1 block w-full min-h-[44px] rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">Select an employee…</option>
          {props.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.designation}, {e.department})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rec-category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select
            id="rec-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as RecognitionCategory)}
            disabled={disabled}
            className="mt-1 block w-full min-h-[44px] rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rec-month" className="block text-sm font-medium text-ink">
            Month
          </label>
          <input
            id="rec-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={disabled}
            required
            className="mt-1 block w-full min-h-[44px] rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label htmlFor="rec-writeup" className="block text-sm font-medium text-ink">
          Write-up
        </label>
        <p className="mt-0.5 text-xs text-ink-3">
          What did this employee do that deserves recognition? Be specific: name the
          project, the moment, the outcome. This text appears on the recognition card.
        </p>
        <textarea
          id="rec-writeup"
          value={writeup}
          onChange={(e) => setWriteup(e.target.value)}
          disabled={disabled}
          rows={8}
          minLength={WRITEUP_MIN}
          maxLength={WRITEUP_MAX + 50}
          required
          aria-describedby="rec-writeup-hint"
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div
          id="rec-writeup-hint"
          className={`mt-1 text-xs ${
            overLimit
              ? 'text-danger'
              : writeupTrimmedLen >= WRITEUP_MIN
                ? 'text-ink-3'
                : 'text-ink-2'
          }`}
        >
          {writeupTrimmedLen} / {WRITEUP_MAX} characters{' '}
          {writeupTrimmedLen < WRITEUP_MIN && '(minimum 30)'}
          {overLimit && ' - too long for the poster layout'}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={disabled || writeupTrimmedLen < WRITEUP_MIN || overLimit || !employeeId}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Submitting…' : 'Submit nomination'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="rounded border border-success bg-success-bg px-3 py-2 text-sm text-success"
        >
          {success}
        </div>
      )}
    </form>
  )
}
