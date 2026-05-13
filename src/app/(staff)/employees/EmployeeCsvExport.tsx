'use client'

/*
 * Client-side CSV export for the (already-filtered) employees list.
 *
 * Server passes the SAME filtered + sorted set the page is rendering, so
 * the file matches what HR is looking at. No second filter pass on the
 * client. Keeps state simple, avoids the trap where users export a
 * superset of what they expected.
 *
 * RFC 4180-ish quoting: every value gets wrapped in double quotes and
 * embedded quotes are escaped to "". Excel tolerates the universally
 * quoted form; sloppier outputs trip on commas inside designations.
 */

interface ExportEmployee {
  employeeCode: string
  name: string
  designation: string
  department: string
  location: string
  email: string
  status: string
  dateOfJoining: string
  workPattern?: string
  reportingTo?: string
}

const COLUMNS: Array<{ header: string; pick: (e: ExportEmployee) => string }> = [
  { header: 'Employee code', pick: (e) => e.employeeCode },
  { header: 'Name', pick: (e) => e.name },
  { header: 'Designation', pick: (e) => e.designation },
  { header: 'Department', pick: (e) => e.department },
  { header: 'Location', pick: (e) => e.location },
  { header: 'Email', pick: (e) => e.email },
  { header: 'Status', pick: (e) => e.status },
  { header: 'Date of joining', pick: (e) => e.dateOfJoining },
  { header: 'Work pattern', pick: (e) => e.workPattern ?? '' },
  { header: 'Reports to', pick: (e) => e.reportingTo ?? '' },
]

export function EmployeeCsvExport({
  employees,
  filename,
}: {
  employees: ExportEmployee[]
  filename?: string
}) {
  function handleClick() {
    const lines: string[] = []
    lines.push(COLUMNS.map((c) => csvField(c.header)).join(','))
    for (const e of employees) {
      lines.push(COLUMNS.map((c) => csvField(c.pick(e))).join(','))
    }
    // Prepend a UTF-8 BOM so Excel opens Indian-language characters correctly.
    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      filename ?? `employees-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={employees.length === 0}
      className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
    >
      Export CSV ({employees.length.toLocaleString('en-IN')})
    </button>
  )
}

function csvField(value: string | null | undefined): string {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}
