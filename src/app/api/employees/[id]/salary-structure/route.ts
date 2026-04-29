import { NextResponse } from 'next/server'
import { findEmployeeById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

export const runtime = 'nodejs'

interface InputBody {
  ctc?: unknown
  basic?: unknown
  hra?: unknown
  conveyance?: unknown
  otherAllowances?: unknown
  pfEmployee?: unknown
  ptMonthly?: unknown
  netTakeHome?: unknown
}

/** Coerce to non-negative integer rupees; return null on invalid. */
function toRupees(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v)
  if (typeof v === 'string') {
    const cleaned = v.replace(/[,_\s]/g, '')
    if (cleaned === '') return null
    const n = Number(cleaned)
    if (!Number.isFinite(n) || n < 0) return null
    return Math.round(n)
  }
  return null
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can edit salary structure.' }, { status: 403 })
  }

  const employee = findEmployeeById(params.id)
  if (!employee) return NextResponse.json({ message: 'Employee not found.' }, { status: 404 })

  let body: InputBody
  try {
    body = (await request.json()) as InputBody
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const fields = ['ctc', 'basic', 'hra', 'conveyance', 'otherAllowances', 'pfEmployee', 'ptMonthly', 'netTakeHome'] as const
  const parsed: Partial<Record<(typeof fields)[number], number>> = {}
  const invalid: string[] = []
  for (const f of fields) {
    const v = toRupees((body as Record<string, unknown>)[f])
    if (v === null) {
      invalid.push(f)
    } else {
      parsed[f] = v
    }
  }
  if (invalid.length > 0) {
    return NextResponse.json(
      { message: `Each field must be a non-negative number. Check: ${invalid.join(', ')}` },
      { status: 400 },
    )
  }

  const structure = parsed as Required<typeof parsed>
  const grossAnnual = structure.basic + structure.hra + structure.conveyance + structure.otherAllowances
  const deductionsAnnual = structure.pfEmployee + structure.ptMonthly * 12
  if (deductionsAnnual > grossAnnual) {
    return NextResponse.json(
      { message: 'Deductions exceed gross. Recheck PF and PT before saving.' },
      { status: 400 },
    )
  }

  // Non-blocking sanity: net = gross - deductions; basic + ... = gross. We allow
  // a Rs 60 wobble (rounding) before we surface the warning back.
  const expectedNet = grossAnnual - deductionsAnnual
  const warnings: string[] = []
  if (Math.abs(expectedNet - structure.netTakeHome) > 60) {
    warnings.push(
      `Net take home (${structure.netTakeHome}) does not match gross (${grossAnnual}) minus deductions (${deductionsAnnual}). Saved anyway.`,
    )
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'employee',
      operation: 'update',
      payload: {
        id: employee.id,
        operation: 'salary-structure.update',
        before: { salaryStructure: employee.salaryStructure ?? null, ctcAnnual: employee.ctcAnnual ?? null },
        after: { salaryStructure: structure, ctcAnnual: structure.ctc },
        notes: `Salary structure updated by ${session.email}.${warnings.length ? ' ' + warnings.join(' ') : ''}`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, structure, warnings })
}
