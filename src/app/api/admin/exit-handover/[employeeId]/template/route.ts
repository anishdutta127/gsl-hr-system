/*
 * Returns the markdown handover template for the exiting employee to
 * fill in. The exiting employee or HR-Admin picks a kind via query
 * string: ?kind=Standard | Tech | Sales (Custom is "blank document"
 * and not served from here).
 *
 * GET /api/admin/exit-handover/[employeeId]/template?kind=Standard
 *   -> text/markdown body, Content-Disposition attachment
 */

import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { canEditHandover } from '@/lib/exitHandover'
import { findEmployeeById } from '@/lib/data'
import { HANDOVER_TEMPLATE_KINDS, type HandoverTemplateKind } from '@/lib/types'

export const runtime = 'nodejs'

const KIND_TO_FILE: Record<Exclude<HandoverTemplateKind, 'Custom'>, string> = {
  Standard: 'handover-standard.md',
  Tech: 'handover-tech.md',
  Sales: 'handover-sales.md',
}

export async function GET(request: Request, { params }: { params: { employeeId: string } }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Unauthorised.' }, { status: 401 })

  const employee = findEmployeeById(params.employeeId)
  if (!employee) return NextResponse.json({ message: 'Employee not found.' }, { status: 404 })

  if (!canEditHandover(session, { reportingManagerId: employee.reportingManagerId ?? null })) {
    return NextResponse.json({ message: 'Forbidden.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const kindRaw = (searchParams.get('kind') ?? 'Standard') as HandoverTemplateKind
  if (!HANDOVER_TEMPLATE_KINDS.includes(kindRaw)) {
    return NextResponse.json({ message: `Unknown template kind: ${kindRaw}` }, { status: 400 })
  }
  if (kindRaw === 'Custom') {
    return NextResponse.json(
      { message: 'Custom is a blank-document kind; nothing to download.' },
      { status: 400 },
    )
  }

  const filename = KIND_TO_FILE[kindRaw]
  const filepath = path.join(process.cwd(), 'src', 'lib', 'exitTemplates', filename)
  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ message: 'Template missing on disk.' }, { status: 500 })
  }
  const body = fs.readFileSync(filepath, 'utf-8')
  const safeName = `handover-${kindRaw.toLowerCase()}-${employee.employeeCode ?? params.employeeId}.md`
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
