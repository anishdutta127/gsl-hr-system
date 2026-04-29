'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Defaults {
  designation: string
  department: string
  location: string
  ctcAnnual: number
  reportingTo: string
  dateOfJoining: string
  phone: string
}

export function EmployeeActivationForm({
  applicationId,
  defaultValues,
}: {
  applicationId: string
  defaultValues: Defaults
}) {
  const router = useRouter()
  const [employeeCode, setEmployeeCode] = useState('')
  const [designation, setDesignation] = useState(defaultValues.designation)
  const [department, setDepartment] = useState(defaultValues.department)
  const [location, setLocation] = useState(defaultValues.location)
  const [ctc, setCtc] = useState<number>(defaultValues.ctcAnnual)
  const [reportingTo, setReportingTo] = useState(defaultValues.reportingTo)
  const [dateOfJoining, setDateOfJoining] = useState(defaultValues.dateOfJoining)
  const [phone, setPhone] = useState(defaultValues.phone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!employeeCode.trim()) {
      setError('Employee code is required.')
      return
    }
    if (!designation.trim()) {
      setError('Designation is required.')
      return
    }
    if (!dateOfJoining) {
      setError('Date of joining is required.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          employeeCode: employeeCode.trim(),
          designation: designation.trim(),
          department: department.trim(),
          location: location.trim(),
          ctcAnnual: ctc,
          reportingTo: reportingTo.trim(),
          dateOfJoining,
          phone: phone.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not save.' }))
        setError(body.message ?? 'Could not save.')
        setBusy(false)
        return
      }
      // Newly activated employee lives in the queue; the detail page would
      // 404 until the runner syncs. Land on /employees list instead.
      router.push('/employees?notice=activated')
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4" aria-label="Activate employee form">
      <Field id="employeeCode" label="Employee code" value={employeeCode} onChange={setEmployeeCode} placeholder="GSL-0042" required />
      <Field id="designation" label="Designation" value={designation} onChange={setDesignation} required />
      <Field id="department" label="Department" value={department} onChange={setDepartment} />
      <Field id="location" label="Location" value={location} onChange={setLocation} />
      <Field id="reportingTo" label="Reporting to" value={reportingTo} onChange={setReportingTo} />
      <NumberField id="ctc" label="Annual CTC (Rs)" value={ctc} onChange={setCtc} step={10000} />
      <div>
        <label htmlFor="doj" className="block text-sm font-medium text-ink">
          Date of joining
        </label>
        <input
          id="doj"
          type="date"
          value={dateOfJoining}
          onChange={(e) => setDateOfJoining(e.target.value)}
          className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>
      <Field id="phone" label="Phone" value={phone} onChange={setPhone} />

      {error && (
        <div
          role="alert"
          className="rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? 'Activating…' : 'Activate employee'}
        </button>
      </div>
    </form>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </div>
  )
}

function NumberField({
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
        min={0}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink tabular focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </div>
  )
}
