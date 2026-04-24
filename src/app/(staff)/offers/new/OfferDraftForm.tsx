'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Application, Candidate, Role } from '@/lib/types'
import { formatRs } from '@/lib/format'

export function OfferDraftForm({
  application,
  role,
  candidate,
}: {
  application: Application
  role: Role
  candidate: Candidate
}) {
  const router = useRouter()
  const [designation, setDesignation] = useState(role.title)
  const [location, setLocation] = useState(role.location)
  const [ctc, setCtc] = useState<number>(role.salaryRange?.max ?? 0)
  const [fixedMonthly, setFixedMonthly] = useState<number>(0)
  const [variable, setVariable] = useState<number>(0)
  const [joining, setJoining] = useState<string>(() => defaultJoining())
  const [notice, setNotice] = useState<number>(60)
  const [reportingTo, setReportingTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useMemo(() => {
    return buildOfferPreview({
      candidateName: candidate.name,
      designation,
      location,
      ctc,
      fixedMonthly,
      variable,
      joining,
      notice,
      reportingTo,
    })
  }, [candidate.name, designation, location, ctc, fixedMonthly, variable, joining, notice, reportingTo])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!designation.trim()) {
      setError('Designation is required.')
      return
    }
    if (!(ctc > 0)) {
      setError('CTC must be a positive number.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          designation: designation.trim(),
          location: location.trim(),
          ctcAnnual: ctc,
          fixedMonthly,
          variableAnnual: variable,
          proposedJoiningDate: joining,
          noticePeriodDays: notice,
          reportingTo: reportingTo.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not save.' }))
        setError(body.message ?? 'Could not save.')
        setBusy(false)
        return
      }
      const data = (await res.json()) as { offerId: string }
      router.push(`/offers/${data.offerId}`)
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]"
      aria-label="Offer draft form"
    >
      <div className="space-y-4">
        <FieldText
          id="designation"
          label="Designation"
          value={designation}
          onChange={setDesignation}
        />
        <FieldText id="location" label="Location" value={location} onChange={setLocation} />
        <FieldText
          id="reportingTo"
          label="Reporting to"
          value={reportingTo}
          onChange={setReportingTo}
          placeholder="e.g., Manali, Head of Academics"
        />
        <FieldNumber id="ctc" label="Annual CTC (Rs)" value={ctc} onChange={setCtc} step={10000} />
        <FieldNumber
          id="fixed"
          label="Fixed monthly (Rs)"
          value={fixedMonthly}
          onChange={setFixedMonthly}
          step={1000}
        />
        <FieldNumber
          id="variable"
          label="Annual variable (Rs)"
          value={variable}
          onChange={setVariable}
          step={10000}
        />
        <div>
          <label htmlFor="joining" className="block text-sm font-medium text-ink">
            Proposed joining date
          </label>
          <input
            id="joining"
            type="date"
            value={joining}
            onChange={(e) => setJoining(e.target.value)}
            className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <FieldNumber
          id="notice"
          label="Notice period (days)"
          value={notice}
          onChange={setNotice}
          step={15}
        />
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-lg border border-line bg-card p-5">
          <h2 className="mb-3 font-display text-lg text-ink">Preview</h2>
          <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded border border-line bg-surface p-3 font-mono text-xs text-ink">
{preview}
          </pre>
          {error && (
            <div
              role="alert"
              className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save draft'}
          </button>
          <p className="mt-2 text-xs text-ink-3">
            Next: approve + send from the offer detail page.
          </p>
        </div>
      </aside>
    </form>
  )
}

function FieldText({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </div>
  )
}

function FieldNumber({
  id,
  label,
  value,
  onChange,
  step,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink tabular focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </div>
  )
}

function defaultJoining(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function buildOfferPreview(params: {
  candidateName: string
  designation: string
  location: string
  ctc: number
  fixedMonthly: number
  variable: number
  joining: string
  notice: number
  reportingTo: string
}) {
  return [
    `Offer of employment`,
    ``,
    `Dear ${params.candidateName},`,
    ``,
    `We are delighted to offer you the position of ${params.designation} at our ${params.location} office.`,
    params.reportingTo ? `You will report to ${params.reportingTo}.` : '',
    ``,
    `Compensation:`,
    `  Annual CTC: ${formatRs(params.ctc)}`,
    params.fixedMonthly > 0 ? `  Fixed monthly: ${formatRs(params.fixedMonthly)}` : '',
    params.variable > 0 ? `  Annual variable: ${formatRs(params.variable)}` : '',
    ``,
    `Proposed joining date: ${params.joining}`,
    `Notice period: ${params.notice} days`,
    ``,
    `This draft will be generated into the signed appointment letter once approved.`,
  ]
    .filter(Boolean)
    .join('\n')
}
