import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

import { findTemplateById, todayLongEnGB } from '@/lib/letterTemplates'
import { findEmployeeById } from '@/lib/data'
import { loadCompany } from '@/lib/company'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { deriveSalaryTokens } from '@/lib/salaryTokens'

export const runtime = 'nodejs'

type DefaultFrom = NonNullable<Awaited<ReturnType<typeof findTemplateById>>>['variables'][number]['defaultFrom']

/** Resolve he/she pronouns from the employee gender field. Unknown / blank
 *  gender falls back to the gender-neutral they/them/their so a letter never
 *  ships a wrong-gender pronoun silently; HR can override per-letter. */
function derivePronoun(
  gender: string | null | undefined,
  form: 'subject' | 'object' | 'possessive',
): string {
  const g = (gender ?? '').trim().toLowerCase()
  if (g.startsWith('m')) return form === 'subject' ? 'He' : form === 'object' ? 'him' : 'his'
  if (g.startsWith('f')) return form === 'subject' ? 'She' : form === 'object' ? 'her' : 'her'
  return form === 'subject' ? 'They' : form === 'object' ? 'them' : 'their'
}

function resolveDefault(
  source: DefaultFrom | undefined,
  ctx: { employee?: Awaited<ReturnType<typeof findEmployeeById>>; company: Awaited<ReturnType<typeof loadCompany>> },
): string {
  if (!source) return ''
  const { employee, company } = ctx
  switch (source) {
    case 'today': return todayLongEnGB()
    case 'employee.name': return employee?.name ?? ''
    case 'employee.title': return employee?.title ?? ''
    case 'employee.email': return employee?.email ?? ''
    case 'employee.employeeCode': return employee?.employeeCode ?? ''
    case 'employee.designation': return employee?.designation ?? ''
    case 'employee.department': return employee?.department ?? ''
    case 'employee.location': return employee?.location ?? ''
    case 'employee.dateOfJoining': return employee?.dateOfJoining ?? ''
    case 'employee.phone': return employee?.phone ?? ''
    case 'company.signatoryName': return company.signatory.name
    case 'company.signatoryTitle': return company.signatory.title
    case 'company.legalName': return company.legalName
    case 'company.name': return company.name
    case 'company.tagline': return company.tagline
    case 'pronoun.subject': return derivePronoun(employee?.gender, 'subject')
    case 'pronoun.object': return derivePronoun(employee?.gender, 'object')
    case 'pronoun.possessive': return derivePronoun(employee?.gender, 'possessive')
    default: return ''
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can generate letters.' }, { status: 403 })
  }

  const template = findTemplateById(params.id)
  if (!template) return NextResponse.json({ message: 'Template not found.' }, { status: 404 })

  let body: { employeeId?: unknown; values?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const providedValues = (body.values && typeof body.values === 'object') ? body.values as Record<string, unknown> : {}

  const employee = employeeId ? await findEmployeeById(employeeId) : undefined
  const company = loadCompany()

  // Merge: start with defaults, overlay derived salary tokens, then provided values.
  const merged: Record<string, string> = {}
  for (const v of template.variables) {
    const def = resolveDefault(v.defaultFrom, { employee, company })
    merged[v.token] = def
  }
  if (employee?.salaryStructure) {
    const sal = deriveSalaryTokens(employee.salaryStructure)
    for (const v of template.variables) {
      if (v.token in sal) merged[v.token] = sal[v.token as keyof typeof sal]
    }
  }
  for (const [k, val] of Object.entries(providedValues)) {
    if (typeof val === 'string') merged[k] = val
  }

  // Validate required
  const missing: string[] = []
  for (const v of template.variables) {
    if (v.required && !merged[v.token]) missing.push(v.token)
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { message: `Missing required tokens: ${missing.join(', ')}` },
      { status: 400 },
    )
  }

  const templatePath = path.join(process.cwd(), template.filePath)
  let templateBuffer: Buffer
  try {
    templateBuffer = fs.readFileSync(templatePath)
  } catch (err) {
    return NextResponse.json(
      { message: `Template file missing on server: ${template.filePath}` },
      { status: 500 },
    )
  }

  let generated: Buffer
  try {
    const zip = new PizZip(templateBuffer)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })
    doc.render(merged)
    generated = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Template render failed.'
    return NextResponse.json({ message }, { status: 500 })
  }

  // Audit: queue an entry against the employee (if any) recording the letter issuance.
  if (employee) {
    try {
      await enqueueUpdate({
        queuedBy: session.email,
        entity: 'employee',
        operation: 'update',
        payload: {
          id: employee.id,
          operation: 'letter.generated',
          before: {},
          after: { templateId: template.id, templateTitle: template.title },
          notes: `${session.email} generated ${template.title} for ${employee.name}.`,
        },
      })
    } catch {
      // Non-fatal: letter generation succeeds even if the audit entry fails.
    }
  }

  const safeName = (employee?.name ?? 'letter').replace(/[^a-zA-Z0-9]+/g, '_')
  const filename = `${template.id}_${safeName}_${Date.now()}.docx`

  // Buffer -> Uint8Array copy to satisfy NextResponse's BodyInit contract.
  const responseBody = new Uint8Array(generated)
  return new NextResponse(responseBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
