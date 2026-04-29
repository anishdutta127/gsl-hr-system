import { NextResponse } from 'next/server'
import { findTemplateById, todayLongEnGB } from '@/lib/letterTemplates'
import { findEmployeeById } from '@/lib/data'
import { loadCompany } from '@/lib/company'
import { getCurrentSession } from '@/lib/identity'
import { deriveSalaryTokens } from '@/lib/salaryTokens'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR.' }, { status: 403 })
  }

  const template = findTemplateById(params.id)
  if (!template) return NextResponse.json({ message: 'Template not found.' }, { status: 404 })

  const url = new URL(request.url)
  const employeeId = url.searchParams.get('employeeId') ?? ''
  const employee = employeeId ? findEmployeeById(employeeId) : undefined
  const company = loadCompany()

  const values: Record<string, string> = {}
  for (const v of template.variables) {
    const src = v.defaultFrom
    let val = ''
    switch (src) {
      case 'today': val = todayLongEnGB(); break
      case 'employee.name': val = employee?.name ?? ''; break
      case 'employee.title': val = employee?.title ?? ''; break
      case 'employee.email': val = employee?.email ?? ''; break
      case 'employee.employeeCode': val = employee?.employeeCode ?? ''; break
      case 'employee.designation': val = employee?.designation ?? ''; break
      case 'employee.department': val = employee?.department ?? ''; break
      case 'employee.location': val = employee?.location ?? ''; break
      case 'employee.dateOfJoining': val = employee?.dateOfJoining ?? ''; break
      case 'employee.phone': val = employee?.phone ?? ''; break
      case 'company.signatoryName': val = company.signatory.name; break
      case 'company.signatoryTitle': val = company.signatory.title; break
    }
    values[v.token] = val
  }

  // Salary block: overlay derived PF/PT tokens when the employee has the
  // structure stored. Token names match the appointment letter's variables.
  if (employee?.salaryStructure) {
    const sal = deriveSalaryTokens(employee.salaryStructure)
    for (const [k, v] of Object.entries(sal)) {
      if (k in values || templateHasToken(template.variables, k)) values[k] = v
    }
  }

  return NextResponse.json({ values, hasSalaryStructure: Boolean(employee?.salaryStructure) })
}

function templateHasToken(vars: ReadonlyArray<{ token: string }>, token: string): boolean {
  return vars.some((v) => v.token === token)
}
